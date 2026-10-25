/* ══════════════════════════════════════════════════════════
   TopImport Pro — Modal de Lançamento (Pedido/Fatura/Embarque/
   Pagamento) ligado ao banco + listagem real de Pedidos.
   ══════════════════════════════════════════════════════════ */
(function () {

  const SETOR_NOME = {
    A:'ACESSÓRIOS', B:'BIJOUX', BEB:'BEBIDAS', 'BEB NAC':'BEBIDAS NACIONAL',
    BOL:'BOLSAS, MALAS', C:'COSMETIC', 'C&D':'CASA & DECORAÇÃO', O:'ÓCULOS',
    P:'PERFUMARIA', PUB:'PUBLICIDADE', R:'RELÓGIOS'
  };
  const STATUS_CLASS = {
    'Em Análise':'s-pedido-enviado', 'Aprovado':'s-pedido-enviado', 'Faturado':'s-faturado',
    'Embarcado':'s-bl-recebido', 'Em Trânsito':'s-em-trânsito', 'Desembaraçado':'s-desembara-o',
    'Entregue':'s-entregue', 'Cancelado':'s-aguardando'
  };
  const CUR_CLASS = { USD:'cur-usd', EUR:'cur-eur', GBP:'cur-gbp', CHF:'cur-chf' };
  const CUR_SYM = { USD:'$', EUR:'€', GBP:'£', CHF:'CHF ' };

  /* ---------- Parsing helpers (formato BR) ---------- */
  function parseBRNumber(str) {
    if (!str) return null;
    const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  function fmtBRL(n) {
    if (n == null || isNaN(n)) return '';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtMoeda(n, moeda) {
    if (n == null || isNaN(n)) return '—';
    return (CUR_SYM[moeda] || '') + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  // Máscara de digitação para campos de valor/taxa: a pessoa só digita
  // números (sem separador de milhar nem vírgula decimal) e o campo já
  // formata sozinho, tratando os últimos dígitos como casas decimais
  // (ex.: digitar "386400" vira "3.864,00").
  function attachMoneyMask(id, decimals) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      let digits = el.value.replace(/\D/g, '');
      if (!digits) { el.value = ''; return; }
      while (digits.length <= decimals) digits = '0' + digits;
      const intDigits = digits.slice(0, digits.length - decimals).replace(/^0+(?=\d)/, '');
      const decDigits = digits.slice(digits.length - decimals);
      el.value = Number(intDigits).toLocaleString('pt-BR') + ',' + decDigits;
    });
  }

  // Máscara para campos de quantidade (inteiro, sem casas decimais): a
  // pessoa só digita números e o campo formata sozinho com separador de
  // milhar (ex.: digitar "1500" vira "1.500") — evita o valor ser salvo
  // como "1.500" (string) e depois mal-interpretado como 1,5 ao exibir.
  function attachIntMask(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '');
      el.value = digits ? Number(digits).toLocaleString('pt-BR') : '';
    });
  }

  function addDays(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + (parseInt(days, 10) || 0));
    return d.toISOString().slice(0, 10);
  }
  function toBRDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /* ---------- Popular selects de Fornecedor / Colaborador ---------- */
  let catalogLoaded = false;
  async function loadCatalogs() {
    const selForn = document.getElementById('f-fornecedor');
    const selColab = document.getElementById('f-colaborador');
    if (!selForn || !selColab) return;
    try {
      const [fornecedores, colaboradores] = await Promise.all([
        DB.list('fornecedores', 'ativo=eq.true&order=razao_social.asc'),
        DB.list('colaboradores', 'ativo=eq.true&order=nome.asc')
      ]);
      selForn.innerHTML = '<option value="">Selecionar fornecedor...</option>' +
        fornecedores.map(f => `<option value="${f.id}">${escapeHtml(f.razao_social)} — ${escapeHtml(f.pais)}</option>`).join('');
      selColab.innerHTML = '<option value="">Selecionar colaborador...</option>' +
        colaboradores.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} — ${escapeHtml(c.localizacao || '—')} · ${escapeHtml(c.cargo)}</option>`).join('');
      catalogLoaded = true;
    } catch (e) {
      console.error('Erro ao carregar fornecedores/colaboradores:', e);
    }
  }

  // Estado de edição: quando preenchido, o "Confirmar Lançamento" grava
  // atualizações nos registros abaixo em vez de criar novos.
  let editingPedidoId = null, editingFaturaId = null, editingEmbarqueId = null, editingPagamentoId = null;

  function setModalModoCriacao() {
    editingPedidoId = editingFaturaId = editingEmbarqueId = editingPagamentoId = null;
    const titulo = document.querySelector('#modal-backdrop .modal-title');
    const subtitulo = document.querySelector('#modal-backdrop .modal-subtitle');
    const confirmBtn = document.getElementById('modal-confirm');
    if (titulo) titulo.textContent = '📦 Novo Lançamento';
    if (subtitulo) subtitulo.textContent = 'Registro de ordem de compra internacional';
    if (confirmBtn) confirmBtn.textContent = '📤 Confirmar Lançamento';
  }

  const openBtns = ['btn-novo-lancamento', 'btn-novo-lancamento-2'];
  openBtns.forEach(id => document.getElementById(id)?.addEventListener('click', () => {
    loadCatalogs(); // sempre busca a lista atual (não usa cache) — um fornecedor/colaborador
                     // recém-cadastrado precisa aparecer já na próxima vez que o modal abrir
    setModalModoCriacao();
    resetForm();
  }));

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (!el || value == null || value === '') return;
    el.value = value;
  }
  function toBR2(n) { return (n == null || isNaN(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function toBRTaxa(n) { return (n == null || isNaN(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }); }

  // Os campos sem coluna própria (Marca, SKU, Qtde, Navio/AWB, Peso, Incoterm) são
  // concatenados em `pedidos.descricao` na criação — esta função faz o caminho inverso.
  function parseDescricao(desc) {
    const out = {};
    if (!desc) return out;
    desc.split(' · ').forEach(part => {
      const m = part.match(/^(Marca|SKU|Qtde pedido|Navio\/AWB|Peso bruto|Incoterm):\s*(.*)$/);
      if (!m) { out._obs = out._obs ? out._obs + ' · ' + part : part; return; }
      const chave = { 'Marca': 'marca', 'SKU': 'sku', 'Qtde pedido': 'qtde', 'Navio/AWB': 'navio', 'Peso bruto': 'peso', 'Incoterm': 'incoterm' }[m[1]];
      out[chave] = chave === 'peso' ? m[2].replace(/\s*kg$/i, '') : m[2];
    });
    return out;
  }

  /* ---------- Abrir modal em modo de edição, pré-preenchido ----------
     `tabAlvo` (opcional) abre direto na aba indicada — usado quando a edição
     é disparada a partir das telas de Faturamento/Embarque/Pagamento, que
     editam o mesmo pedido mas devem cair na aba relevante, não sempre em
     "Pedido". Valores aceitos: 'pedido' | 'fatura' | 'embarque' | 'pagamento'. */
  const TAB_IDX = { pedido: 0, fatura: 1, embarque: 2, pagamento: 3 };
  async function openEditPedido(pedidoId, tabAlvo) {
    await loadCatalogs(); // sempre busca a lista atual (não usa cache)
    resetForm();
    try {
      const [pedidosRows, faturas, embarques, pagamentos] = await Promise.all([
        DB.list('pedidos', `select=*&id=eq.${pedidoId}`),
        DB.list('faturas', `pedido_id=eq.${pedidoId}&order=created_at.asc&limit=1`),
        DB.list('embarques', `pedido_id=eq.${pedidoId}&order=created_at.asc&limit=1`),
        DB.list('pagamentos', `pedido_id=eq.${pedidoId}&order=created_at.asc&limit=1`)
      ]);
      const p = pedidosRows[0];
      if (!p) { showToast('Erro', 'Pedido não encontrado.', false); return; }
      const fatura = faturas[0] || null, embarque = embarques[0] || null, pagamento = pagamentos[0] || null;

      editingPedidoId = p.id;
      editingFaturaId = fatura ? fatura.id : null;
      editingEmbarqueId = embarque ? embarque.id : null;
      editingPagamentoId = pagamento ? pagamento.id : null;

      const desc = parseDescricao(p.descricao);

      setVal('f-numero-pedido', p.numero_pedido);
      setVal('f-pasta', p.numero_pi);
      setVal('f-marca', desc.marca);
      setVal('f-sku', desc.sku);
      setVal('f-qtde', desc.qtde);
      setVal('f-setor', p.setor);
      setVal('f-fornecedor', p.fornecedor_id);
      setVal('f-colaborador', p.colaborador_id);
      setVal('f-destino', p.localizacao || 'Manaus');
      setVal('f-data-pedido', p.data_pedido);
      setVal('f-data-previsao', p.data_previsao_entrega);

      setVal('f-fat-moeda', (fatura && fatura.moeda) || p.moeda || 'USD');
      setVal('f-fat-valor', toBR2((fatura && fatura.valor) || p.valor_total));
      setVal('f-fat-incoterm', desc.incoterm);
      if (fatura) {
        setVal('f-invoice', fatura.numero_invoice);
        setVal('f-fat-emissao', fatura.data_emissao);
        setVal('f-fat-qtd', fatura.qtd_pecas);
        if (fatura.data_emissao && fatura.data_vencimento) {
          const dias = Math.round((new Date(fatura.data_vencimento + 'T00:00:00') - new Date(fatura.data_emissao + 'T00:00:00')) / 86400000);
          setVal('f-fat-prazo', String(dias));
        }
      }
      recalcVencimentoFatura();

      if (embarque) {
        setVal('f-emb-tipo', embarque.tipo);
        setVal('f-emb-porto', embarque.porto_origem);
        setVal('f-emb-cidade-destino', embarque.porto_destino);
        setVal('f-emb-navio', desc.navio);
        setVal('f-emb-data', embarque.data_embarque);
        setVal('f-emb-container', embarque.numero_container);
        setVal('f-emb-peso', desc.peso);
        setVal('f-emb-eta', embarque.data_previsao_chegada);
        setVal('f-emb-chegada', embarque.data_chegada);
        setVal('f-emb-deposito', embarque.data_entrada_deposito);
      }

      setVal('f-pag-banco', pagamento && pagamento.banco);
      setVal('f-pag-contrato', pagamento && pagamento.numero_contrato_cambio);
      setVal('pay-data-pgto', pagamento && pagamento.data_pagamento);
      setVal('f-pag-taxa', toBRTaxa((pagamento && pagamento.taxa_cambio) || p.taxa_cambio));
      setVal('f-pag-status', p.status);
      setVal('f-pag-obs', desc._obs || p.observacoes);
      recalcValorBRL();

      anexos.pi = p.arquivo_pi_url || null; renderAnexoStatus('pi');
      anexos.nf = (fatura && fatura.arquivo_url) || null; renderAnexoStatus('nf');
      anexos.bl = (embarque && embarque.arquivo_bl_url) || null; renderAnexoStatus('bl');
      anexos.cambio = (pagamento && pagamento.arquivo_cambio_url) || null; renderAnexoStatus('cambio');

      const embarqueDataVal = (embarque && embarque.data_embarque) || p.data_pedido;
      setVal('pay-data-embarque', embarqueDataVal);
      const selCond = document.getElementById('pay-condicao');
      if (pagamento && selCond) {
        const tipo = pagamento.tipo || '';
        let condVal = tipo === 'À Vista' ? '0' : (tipo.match(/^(\d+)\s*dias$/) || [])[1];
        if (!condVal) {
          condVal = 'custom';
          // tipo "Outro" não carrega o número — o prazo digitado fica guardado
          // nas observações ("Prazo personalizado: N dias"); cai pro valor cru
          // de `tipo` só pra compatibilidade com lançamentos antigos.
          const diasObs = (pagamento.observacoes || '').match(/(\d+)\s*dias/);
          setVal('pay-custom-dias', diasObs ? diasObs[1] : (tipo.match(/\d+/) || [])[0]);
        }
        const existe = Array.from(selCond.options).some(o => o.value === condVal);
        selCond.value = existe ? condVal : 'custom';
      }
      document.getElementById('pay-data-embarque')?.dispatchEvent(new Event('change'));
      document.getElementById('pay-condicao')?.dispatchEvent(new Event('change'));

      const titulo = document.querySelector('#modal-backdrop .modal-title');
      const subtitulo = document.querySelector('#modal-backdrop .modal-subtitle');
      const confirmBtn = document.getElementById('modal-confirm');
      if (titulo) titulo.textContent = '✏️ Editar Lançamento';
      if (subtitulo) subtitulo.textContent = `Editando ${p.numero_pedido}`;
      if (confirmBtn) confirmBtn.textContent = '💾 Salvar Alterações';

      if (window.openModal) window.openModal(); else document.getElementById('modal-backdrop')?.classList.add('open');
      if (window.setModalTab) window.setModalTab(TAB_IDX[tabAlvo] || 0);
    } catch (e) {
      showToast('Erro ao abrir edição', e.message || 'Tente novamente.', false);
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit-pedido]');
    if (btn) openEditPedido(btn.dataset.editPedido);
  });

  // Edição disparada a partir de Faturamento/Embarque/Pagamento: formato
  // "pedidoId:aba" (ex.: "data-edit-lancamento=abc123:fatura").
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit-lancamento]');
    if (!btn) return;
    const [pedidoId, tabAlvo] = btn.dataset.editLancamento.split(':');
    if (pedidoId) openEditPedido(pedidoId, tabAlvo);
  });

  window.openEditPedido = openEditPedido;

  function resetForm() {
    document.querySelectorAll('#modal-backdrop input:not([type=checkbox])').forEach(el => { if (!el.readOnly) el.value = ''; });
    document.querySelectorAll('#modal-backdrop textarea').forEach(el => el.value = '');
    const today = new Date().toISOString().slice(0, 10);
    const dp = document.getElementById('f-data-pedido'); if (dp) dp.value = today;
    const fe = document.getElementById('f-fat-emissao'); if (fe) fe.value = today;
    const ed = document.getElementById('f-emb-data'); if (ed) ed.value = today;
    resetAnexos();
  }

  /* ---------- Upload de anexos (PI / NF / BL / Câmbio) ---------- */
  const ANEXO_CHAVES = ['pi', 'nf', 'bl', 'cambio'];
  const anexos = { pi: null, nf: null, bl: null, cambio: null };

  function renderAnexoStatus(chave) {
    const status = document.getElementById(`f-${chave}-status`);
    const removeBtn = document.getElementById(`f-${chave}-remove`);
    if (!status) return;
    const url = anexos[chave];
    if (url) {
      status.innerHTML = `<a href="${url}" target="_blank" rel="noopener">📄 ${window.Storage ? Storage.nomeArquivo(url) : 'arquivo'}</a>`;
      status.className = 'file-upload-status ok';
      if (removeBtn) removeBtn.style.display = '';
    } else {
      status.textContent = 'Nenhum arquivo';
      status.className = 'file-upload-status';
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }

  function resetAnexos() {
    ANEXO_CHAVES.forEach(chave => {
      anexos[chave] = null;
      const input = document.getElementById(`f-${chave}-arquivo`);
      if (input) input.value = '';
      renderAnexoStatus(chave);
    });
  }

  ANEXO_CHAVES.forEach(chave => {
    const input = document.getElementById(`f-${chave}-arquivo`);
    const trigger = document.querySelector(`[data-upload-trigger="${chave}"]`);
    const removeBtn = document.getElementById(`f-${chave}-remove`);
    trigger?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const status = document.getElementById(`f-${chave}-status`);
      if (status) { status.textContent = 'Enviando...'; status.className = 'file-upload-status'; }
      const urlAnterior = anexos[chave];
      try {
        if (!window.Storage) throw new Error('Upload indisponível (biblioteca não carregou).');
        const resultado = await Storage.upload(file, chave);
        anexos[chave] = resultado.url;
        renderAnexoStatus(chave);
        if (urlAnterior) Storage.remove(urlAnterior); // substitui — remove o arquivo antigo do bucket
      } catch (e) {
        if (status) { status.textContent = 'Erro: ' + (e.message || 'falha no envio'); status.className = 'file-upload-status err'; }
        input.value = '';
      }
    });
    removeBtn?.addEventListener('click', () => {
      const urlAnterior = anexos[chave];
      anexos[chave] = null;
      if (input) input.value = '';
      renderAnexoStatus(chave);
      if (urlAnterior && window.Storage) Storage.remove(urlAnterior);
    });
  });

  /* ---------- Máscara automática nos campos de valor/taxa ---------- */
  attachMoneyMask('f-fat-valor', 2);
  attachMoneyMask('f-pag-taxa', 4);
  attachIntMask('f-qtde');
  attachIntMask('f-fat-qtd');

  /* ---------- Cálculos automáticos ---------- */
  function recalcVencimentoFatura() {
    const emissao = document.getElementById('f-fat-emissao')?.value;
    const prazo = document.getElementById('f-fat-prazo')?.value;
    const out = document.getElementById('f-fat-vencimento');
    if (!out) return;
    const venc = emissao ? addDays(emissao, prazo || 0) : null;
    out.value = venc ? toBRDate(venc) : '';
    out.dataset.iso = venc || '';
  }
  ['f-fat-emissao', 'f-fat-prazo'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', recalcVencimentoFatura));

  function recalcValorBRL() {
    const valor = parseBRNumber(document.getElementById('f-fat-valor')?.value);
    const taxa = parseBRNumber(document.getElementById('f-pag-taxa')?.value);
    const out = document.getElementById('f-pag-valorbrl');
    if (!out) return;
    out.value = (valor != null && taxa != null) ? fmtBRL(valor * taxa) : '';
  }
  ['f-fat-valor', 'f-pag-taxa'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', recalcValorBRL));

  // Sincroniza a data de embarque (aba Embarque) com a referência da aba Pagamento
  document.getElementById('f-emb-data')?.addEventListener('change', (e) => {
    const pagEmbarque = document.getElementById('pay-data-embarque');
    if (pagEmbarque) { pagEmbarque.value = e.target.value; pagEmbarque.dispatchEvent(new Event('input')); }
  });
  document.getElementById('modal-next')?.addEventListener('click', () => {
    const embData = document.getElementById('f-emb-data')?.value;
    const pagEmbarque = document.getElementById('pay-data-embarque');
    if (embData && pagEmbarque && !pagEmbarque.value) {
      pagEmbarque.value = embData;
      pagEmbarque.dispatchEvent(new Event('input'));
    }
  });

  /* ---------- Toast helper ---------- */
  function showToast(title, body, ok = true) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.style.borderLeftColor = ok ? 'var(--green)' : 'var(--rose)';
    t.querySelector('.notif-icon').textContent = ok ? '✅' : '⚠️';
    t.querySelector('.notif-title').textContent = title;
    t.querySelector('.notif-body').textContent = body;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 4000);
  }
  window.showToast = showToast;

  function val(id) { return document.getElementById(id)?.value?.trim() || ''; }

  /* ---------- Confirmar lançamento ---------- */
  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const numeroPedido = val('f-numero-pedido');
    const fornecedorId = val('f-fornecedor');
    const colaboradorId = val('f-colaborador');
    const setor = val('f-setor');
    const dataPedido = val('f-data-pedido');

    if (!numeroPedido || !fornecedorId || !colaboradorId || !setor || !dataPedido) {
      alert('Preencha os campos obrigatórios da aba Pedido: Nº Pedido, Setor - Categoria, Fornecedor, Responsável e Data de Envio.');
      return;
    }

    // Esvaziar o nº da invoice, os dados de embarque ou a taxa de câmbio
    // numa edição faz a fatura/embarque/pagamento correspondente ser
    // EXCLUÍDO ao salvar (comportamento documentado desde a Fase 10) — mas
    // isso pode acontecer sem a pessoa notar (ex.: apagar o campo por
    // engano enquanto só queria corrigir outra aba). Por isso, confirma
    // explicitamente antes de qualquer exclusão silenciosa.
    const avisos = [];
    if (editingFaturaId && !val('f-invoice')) avisos.push('a invoice/fatura já lançada');
    const embTipoChk = val('f-emb-tipo');
    const embPreenchidoChk = embTipoChk && (val('f-emb-porto') || val('f-emb-data') || val('f-emb-cidade-destino') || val('f-emb-container'));
    if (editingEmbarqueId && !embPreenchidoChk) avisos.push('o embarque já lançado');
    if (editingPagamentoId && parseBRNumber(val('f-pag-taxa')) == null) avisos.push('o pagamento/câmbio já lançado');
    if (avisos.length) {
      const confirmado = confirm(
        `Atenção: ao salvar, ${avisos.join(', ')} será EXCLUÍDO (o campo correspondente ficou vazio).\n\n` +
        `Se isso não era sua intenção, clique em Cancelar e confira os dados antes de salvar novamente.\n\n` +
        `Deseja continuar e excluir mesmo assim?`
      );
      if (!confirmado) return;
    }

    const btn = document.getElementById('modal-confirm');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    // Declarado fora do try para que o catch, se um passo depois do pedido
    // falhar, ainda saiba se esta tentativa COMEÇOU como edição ou como
    // lançamento novo (editingPedidoId já terá sido sobrescrito a essa altura).
    const isEditAoEntrar = !!editingPedidoId;
    try {
      const moeda = val('f-fat-moeda') || 'USD';
      const valorFatura = parseBRNumber(val('f-fat-valor'));
      const taxa = parseBRNumber(val('f-pag-taxa'));
      const valorBRL = (valorFatura != null && taxa != null) ? valorFatura * taxa : null;
      const status = val('f-pag-status') || 'Em Análise';

      const obsParts = [];
      if (val('f-marca')) obsParts.push('Marca: ' + val('f-marca'));
      if (val('f-sku')) obsParts.push('SKU: ' + val('f-sku'));
      if (val('f-qtde')) obsParts.push('Qtde pedido: ' + val('f-qtde'));
      if (val('f-emb-navio')) obsParts.push('Navio/AWB: ' + val('f-emb-navio'));
      if (val('f-emb-peso')) obsParts.push('Peso bruto: ' + val('f-emb-peso') + ' kg');
      if (val('f-fat-incoterm')) obsParts.push('Incoterm: ' + val('f-fat-incoterm'));
      if (val('f-pag-obs')) obsParts.push(val('f-pag-obs'));

      const isEdit = isEditAoEntrar;

      // 1) PEDIDO
      const dadosPedido = {
        numero_pedido: numeroPedido,
        numero_pi: val('f-pasta') || null,
        fornecedor_id: fornecedorId,
        colaborador_id: colaboradorId,
        setor: setor,
        localizacao: val('f-destino') || 'Manaus',
        descricao: obsParts.join(' · ') || null,
        moeda: moeda,
        valor_total: valorFatura,
        taxa_cambio: taxa,
        valor_brl: valorBRL,
        data_pedido: dataPedido,
        data_previsao_entrega: val('f-data-previsao') || null,
        status: status,
        observacoes: val('f-pag-obs') || null,
        arquivo_pi_url: anexos.pi
      };
      const pedido = isEdit
        ? await DB.update('pedidos', editingPedidoId, dadosPedido)
        : await DB.create('pedidos', dadosPedido);
      // A partir daqui o pedido já existe no banco — se um passo seguinte
      // falhar (fatura/embarque/pagamento) e a pessoa clicar em salvar de
      // novo, isso precisa virar um UPDATE no mesmo pedido, não um INSERT
      // novo (que colidiria com o nº de pedido já gravado). Por isso o
      // modal já muda para "modo edição" (título/subtítulo/botão) aqui,
      // antes dos passos seguintes — se um deles falhar, a tela não fica
      // mostrando "Novo Lançamento" enquanto o pedido já existe no banco.
      editingPedidoId = pedido.id;
      if (!isEdit) {
        const tituloEl = document.querySelector('#modal-backdrop .modal-title');
        const subtituloEl = document.querySelector('#modal-backdrop .modal-subtitle');
        if (tituloEl) tituloEl.textContent = '✏️ Editar Lançamento';
        if (subtituloEl) subtituloEl.textContent = `Editando ${numeroPedido}`;
      }

      // 2) FATURA (se houver nº de invoice)
      let fatura = null;
      const numInvoice = val('f-invoice');
      if (numInvoice) {
        const vencIso = document.getElementById('f-fat-vencimento')?.dataset.iso || null;
        const dadosFatura = {
          pedido_id: pedido.id,
          numero_invoice: numInvoice,
          data_emissao: val('f-fat-emissao') || dataPedido,
          data_vencimento: vencIso,
          valor: valorFatura || 0,
          moeda: moeda,
          qtd_pecas: val('f-fat-qtd') ? parseBRNumber(val('f-fat-qtd')) : null,
          arquivo_url: anexos.nf
        };
        fatura = editingFaturaId
          ? await DB.update('faturas', editingFaturaId, dadosFatura)
          : await DB.create('faturas', { ...dadosFatura, status: 'Pendente' });
        editingFaturaId = fatura.id;
      } else if (editingFaturaId) {
        // Pagamentos podem referenciar esta fatura (sem cascade) — desvincula antes de excluir
        await DB.updateWhere('pagamentos', `fatura_id=eq.${editingFaturaId}`, { fatura_id: null });
        await DB.remove('faturas', editingFaturaId);
        if (anexos.nf && window.Storage) Storage.remove(anexos.nf);
      }

      // 3) EMBARQUE (se houver dados de embarque)
      const embTipo = val('f-emb-tipo');
      const embPorto = val('f-emb-porto');
      const embData = val('f-emb-data');
      const embCidadeDestino = val('f-emb-cidade-destino');
      if (embTipo && (embPorto || embData || embCidadeDestino || val('f-emb-container'))) {
        const dadosEmbarque = {
          pedido_id: pedido.id,
          tipo: embTipo,
          porto_origem: embPorto || null,
          porto_destino: embCidadeDestino || null,
          numero_container: val('f-emb-container') || null,
          data_embarque: embData || null,
          data_previsao_chegada: val('f-emb-eta') || null,
          data_chegada: val('f-emb-chegada') || null,
          data_entrada_deposito: val('f-emb-deposito') || null,
          observacoes: val('f-emb-navio') ? ('Navio/AWB: ' + val('f-emb-navio')) : null,
          arquivo_bl_url: anexos.bl
        };
        if (editingEmbarqueId) {
          await DB.update('embarques', editingEmbarqueId, dadosEmbarque);
        } else {
          const embarqueCriado = await DB.create('embarques', { ...dadosEmbarque, status: val('f-emb-chegada') ? 'Entregue' : (embData ? 'Embarcado' : 'Aguardando') });
          editingEmbarqueId = embarqueCriado.id;
        }
      } else if (editingEmbarqueId) {
        await DB.remove('embarques', editingEmbarqueId);
        if (anexos.bl && window.Storage) Storage.remove(anexos.bl);
      }

      // 4) PAGAMENTO (se houver taxa de câmbio informada)
      if (taxa != null) {
        // `pagamentos.tipo` tem um CHECK no banco que só aceita um conjunto fixo
        // de valores (30/45/60/90/120/150/180/270/360 dias, "À Vista", "Carta de
        // Crédito" ou "Outro") — um prazo digitado à mão (ex.: "20 dias") NUNCA
        // bate com esse conjunto, então vira sempre "Outro" e o nº de dias digitado
        // é preservado nas observações do pagamento.
        let tipoPagamento = '90 dias';
        let prazoCustomObs = null;
        const condVal = document.getElementById('pay-condicao')?.value;
        if (condVal === '0') tipoPagamento = 'À Vista';
        else if (condVal && condVal !== 'custom') tipoPagamento = condVal + ' dias';
        else if (condVal === 'custom') {
          const dias = val('pay-custom-dias');
          tipoPagamento = 'Outro';
          if (dias) prazoCustomObs = `Prazo personalizado: ${dias} dias`;
        }

        const vencPagIso = (() => {
          const v = document.getElementById('pay-vencimento')?.value;
          if (!v) return null;
          const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
        })();

        const dadosPagamento = {
          pedido_id: pedido.id,
          fatura_id: fatura ? fatura.id : null,
          tipo: tipoPagamento,
          valor: valorFatura || 0,
          moeda: moeda,
          taxa_cambio: taxa,
          valor_brl: valorBRL,
          data_vencimento: vencPagIso || dataPedido,
          data_pagamento: val('pay-data-pgto') || null,
          banco: val('f-pag-banco') || null,
          numero_contrato_cambio: val('f-pag-contrato') || null,
          observacoes: prazoCustomObs,
          arquivo_cambio_url: anexos.cambio
        };
        if (editingPagamentoId) {
          await DB.update('pagamentos', editingPagamentoId, { ...dadosPagamento, status: val('pay-data-pgto') ? 'Liquidado' : undefined });
        } else {
          const pagamentoCriado = await DB.create('pagamentos', { ...dadosPagamento, status: val('pay-data-pgto') ? 'Liquidado' : 'Pendente' });
          editingPagamentoId = pagamentoCriado.id;
        }
      } else if (editingPagamentoId) {
        await DB.remove('pagamentos', editingPagamentoId);
        if (anexos.cambio && window.Storage) Storage.remove(anexos.cambio);
      }

      document.getElementById('modal-backdrop').classList.remove('open');
      showToast(isEdit ? 'Lançamento atualizado!' : 'Lançamento registrado!',
        `${numeroPedido} foi salvo com sucesso.`, true);
      setModalModoCriacao();
      resetAnexos();
      renderPedidos();
      if (window.renderDashboard) window.renderDashboard();
      if (window.renderOperacionais) window.renderOperacionais();
      if (window.checkNotificacoes) window.checkNotificacoes();
    } catch (e) {
      console.error(e);
      let msg = e.message || 'Não foi possível gravar o lançamento.';
      const pedidoJaGravadoNestaTentativa = !isEditAoEntrar && !!editingPedidoId;
      if (/duplicate key|unique constraint/i.test(msg) && /numero_pedido/i.test(msg)) {
        msg = `Já existe um pedido cadastrado com o número "${numeroPedido}". Use outro número de PO ou verifique na tela de Pedidos se este lançamento já foi salvo.`;
      } else if (/duplicate key|unique constraint/i.test(msg)) {
        msg = 'Já existe um registro com esses mesmos dados (nº de invoice, por exemplo). Verifique os valores informados.';
      }
      // O pedido (aba Pedido) grava ANTES de fatura/embarque/pagamento — se um
      // desses passos falhar, o pedido já existe no banco mesmo que a pessoa
      // veja só o erro do passo seguinte. Sem avisar isso, ela pode clicar em
      // "Novo Lançamento" de novo e duplicar o pedido. O modal já foi trocado
      // para "modo edição" acima, então só falta deixar claro o que aconteceu.
      if (pedidoJaGravadoNestaTentativa) {
        msg += ` ATENÇÃO: o pedido "${numeroPedido}" já foi salvo no banco antes deste erro. Corrija o problema acima e clique em "💾 Salvar Alterações" de novo para completar o lançamento — não abra "Novo Lançamento", isso criaria um pedido duplicado.`;
      }
      showToast('Erro ao salvar', msg, false);
    } finally {
      btn.disabled = false;
      btn.textContent = editingPedidoId ? '💾 Salvar Alterações' : '📤 Confirmar Lançamento';
    }
  });

  /* ---------- Listagem real de Pedidos ---------- */
  let PEDIDOS_CACHE = [];
  const STATUS_OPCOES = Object.keys(STATUS_CLASS);
  const MES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  async function renderPedidos() {
    const tbody = document.getElementById('tbl-pedidos');
    if (!tbody) return;
    try {
      const rows = await DB.list('pedidos',
        'select=*,fornecedores(razao_social),colaboradores(nome,cargo,coordenador_nome)&order=created_at.desc&limit=100');
      PEDIDOS_CACHE = rows;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum pedido lançado ainda. Clique em "Novo Lançamento" para começar.</td></tr>`;
        renderPeriodCards([]);
        popularFiltros([]);
        atualizarContagem(0, 0);
        if (window.Paginacao) window.Paginacao.paginar('tbl-pedidos', { reset: true });
        return;
      }
      tbody.innerHTML = rows.map(p => {
        const forn = escapeHtml(p.fornecedores ? p.fornecedores.razao_social : '—');
        const colab = escapeHtml(p.colaboradores ? p.colaboradores.nome : '—');
        const coord = escapeHtml(p.colaboradores ? p.colaboradores.coordenador_nome : '');
        const setorNome = SETOR_NOME[p.setor] || p.setor || '—';
        const statusCls = STATUS_CLASS[p.status] || 's-pedido-enviado';
        const LOC_CLASS = { 'Manaus': 'loc-manaus', 'Macapá': 'loc-macapa', 'Extrema': 'loc-extrema', 'Guajará': 'loc-guajara' };
        const locCls = LOC_CLASS[p.localizacao] || 'loc-manaus';
        const mesRef = p.data_pedido ? p.data_pedido.slice(0, 7) : '';
        const descInfo = parseDescricao(p.descricao);
        const marca = escapeHtml(descInfo.marca || '—');
        const qtdePedidaNum = parseBRNumber(descInfo.qtde);
        return `
          <tr data-grp="${escapeHtml(p.setor || '')}" data-loc="${escapeHtml(p.localizacao || 'Manaus')}" data-mes="${escapeHtml(mesRef)}"
              data-status="${escapeHtml(p.status || '')}" data-moeda="${escapeHtml(p.moeda || '')}" data-fornecedor="${forn}"
              data-valor="${p.valor_brl || 0}" data-data="${escapeHtml(p.data_pedido || '')}"
              data-busca="${escapeHtml((p.numero_pedido||'') + ' ' + (p.numero_pi||'') + ' ' + (p.fornecedores ? p.fornecedores.razao_social : '') + ' ' + (descInfo.marca||''))}">
            <td><span class="mono" style="font-size:11.5px;color:var(--cyan);font-weight:700;">${escapeHtml(p.numero_pedido || '—')}</span>${p.arquivo_pi_url ? `<a href="${escapeHtml(p.arquivo_pi_url)}" target="_blank" rel="noopener" title="Ver arquivo da PI (${escapeHtml(p.numero_pi||'')})" style="margin-left:6px;">📎</a>` : ''}</td>
            <td>${colab}${coord ? `<div style="font-size:10px;color:var(--ink-3);margin-top:2px;">👤 Coord.: ${coord}</div>` : ''}</td>
            <td>${forn}</td>
            <td>${marca}</td>
            <td class="ta-c date">${toBRDate(p.data_pedido)}</td>
            <td class="ta-c date">${toBRDate(p.data_previsao_entrega)}</td>
            <td class="ta-c">${p.setor ? `<span class="grp-tag" title="${escapeHtml(setorNome)}">${escapeHtml(p.setor)}: ${escapeHtml(setorNome)}</span>` : '—'}</td>
            <td class="ta-c"><span class="loc-tag ${locCls}">${escapeHtml(p.localizacao||'—')}</span></td>
            <td class="ta-c">${p.moeda ? `<span class="currency-tag ${CUR_CLASS[p.moeda]||''}">${escapeHtml(p.moeda)}</span>` : '—'}</td>
            <td class="num">${fmtMoeda(p.valor_total, p.moeda)}</td>
            <td class="num">${qtdePedidaNum != null ? qtdePedidaNum.toLocaleString('pt-BR', { maximumFractionDigits: 20 }) + ' pçs' : '—'}</td>
            <td class="num" style="font-size:11px;">${p.taxa_cambio ? Number(p.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
            <td class="num">${p.valor_brl ? fmtBRL(Number(p.valor_brl)) : '—'}</td>
            <td class="date">—</td>
            <td class="ta-c cell-editable" data-inline-status="${p.id}" title="Clique para alterar o status">
              <span class="status-badge ${statusCls}">${escapeHtml(p.status)}</span>
            </td>
            <td><div class="row-actions"><button type="button" data-edit-pedido="${p.id}" title="Editar pedido">✏️</button><button type="button" class="danger" data-delete-pedido="${p.id}" title="Excluir pedido">🗑️</button></div></td>
          </tr>`;
      }).join('');
      renderPeriodCards(rows);
      popularFiltros(rows);
      document.querySelectorAll('.grp-chip, .grp-chip.loc-chip').forEach(c => c.classList.add('active'));
      aplicarFiltrosAvancados();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;color:var(--rose);padding:24px;">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  /* ---------- Cards de período (mês + moeda do pedido) ---------- */
  // Um card por combinação mês/moeda (em vez de somar moedas diferentes
  // num único R$) — mostra o valor na moeda estrangeira em destaque, o
  // equivalente em BRL embaixo, e o % que esse grupo representa do total
  // geral (soma de valor_brl de todos os pedidos, sem filtro de data).
  let mesSelecionado = null; // formato "AAAA-MM|MOEDA"
  function renderPeriodCards(rows) {
    const wrap = document.getElementById('pedidos-period-cards');
    if (!wrap) return;
    const porGrupo = {};
    let totalGeralBRL = 0;
    rows.forEach(p => {
      totalGeralBRL += Number(p.valor_brl) || 0;
      if (!p.data_pedido) return;
      const mes = p.data_pedido.slice(0, 7);
      const moeda = p.moeda || '—';
      const key = mes + '|' + moeda;
      if (!porGrupo[key]) porGrupo[key] = { mes, moeda, count: 0, totalMoeda: 0, totalBRL: 0 };
      porGrupo[key].count++;
      porGrupo[key].totalMoeda += Number(p.valor_total) || 0;
      porGrupo[key].totalBRL += Number(p.valor_brl) || 0;
    });
    const chaves = Object.keys(porGrupo).sort().reverse();
    if (!chaves.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = chaves.map(key => {
      const info = porGrupo[key];
      const [ano, m] = info.mes.split('-');
      const label = `${MES_LABEL[parseInt(m,10)-1]}/${ano.slice(2)}`;
      const ativo = mesSelecionado === key;
      const pct = totalGeralBRL > 0 ? (info.totalBRL / totalGeralBRL * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';
      return `<button type="button" class="period-card ${ativo ? 'active' : ''}" data-mes="${key}">
        <span class="period-card-label">${label} <span class="currency-tag ${CUR_CLASS[info.moeda]||''}" style="font-size:9.5px;padding:1px 5px;vertical-align:1px;">${info.moeda}</span></span>
        <span class="period-card-count">${info.count} tít.</span>
        <span class="period-card-total">${(CUR_SYM[info.moeda]||'')}${info.totalMoeda.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
        <span class="period-card-brl">${fmtBRL(info.totalBRL)}</span>
        <span class="period-card-pct">${pct}% do total geral</span>
      </button>`;
    }).join('');
    wrap.querySelectorAll('.period-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.mes;
        mesSelecionado = mesSelecionado === key ? null : key;
        wrap.querySelectorAll('.period-card').forEach(b => b.classList.toggle('active', b.dataset.mes === mesSelecionado));
        aplicarFiltrosAvancados();
      });
    });
  }

  /* ---------- Popular selects de Fornecedor / Status ---------- */
  function popularFiltros(rows) {
    const selForn = document.getElementById('flt-fornecedor');
    const selStatus = document.getElementById('flt-status');
    if (selStatus && !selStatus.dataset.populado) {
      selStatus.innerHTML = '<option value="">Todos os status</option>' +
        STATUS_OPCOES.map(s => `<option value="${s}">${s}</option>`).join('');
      selStatus.dataset.populado = '1';
    }
    if (selForn) {
      const nomes = [...new Set(rows.map(p => p.fornecedores ? p.fornecedores.razao_social : null).filter(Boolean))].sort();
      const atual = selForn.value;
      selForn.innerHTML = '<option value="">Todos os fornecedores</option>' + nomes.map(n => `<option>${escapeHtml(n)}</option>`).join('');
      selForn.value = atual;
    }
  }

  function atualizarContagem(visiveis, total) {
    const el = document.getElementById('pedidos-count');
    if (el) el.textContent = total ? `${visiveis} de ${total}` : '0';
  }

  /* ---------- Filtros avançados (fornecedor/status/moeda) ---------- */
  function aplicarFiltrosAvancados() {
    const forn = document.getElementById('flt-fornecedor')?.value || '';
    const status = document.getElementById('flt-status')?.value || '';
    const moeda = document.getElementById('flt-moeda')?.value || '';

    const grpChips = document.querySelectorAll('.grp-chip:not(.loc-chip)');
    const locChips = document.querySelectorAll('.grp-chip.loc-chip');
    const activeGrps = [...grpChips].filter(c => c.classList.contains('active')).map(c => c.dataset.grp);
    const activeLocs = [...locChips].filter(c => c.classList.contains('active')).map(c => c.dataset.loc);

    const rows = document.querySelectorAll('#tbl-pedidos tr[data-grp]');
    let visiveis = 0;
    rows.forEach(r => {
      let ok = true;
      if (grpChips.length && !activeGrps.includes(r.dataset.grp)) ok = false;
      if (locChips.length && !activeLocs.includes(r.dataset.loc)) ok = false;
      if (forn && r.dataset.fornecedor !== forn) ok = false;
      if (status && r.dataset.status !== status) ok = false;
      if (moeda && r.dataset.moeda !== moeda) ok = false;
      if (mesSelecionado) {
        const [mesSel, moedaSel] = mesSelecionado.split('|');
        if (r.dataset.mes !== mesSel || r.dataset.moeda !== moedaSel) ok = false;
      }
      r.style.display = ok ? '' : 'none';
      if (ok) visiveis++;
    });
    atualizarContagem(visiveis, rows.length);
    if (window.Paginacao) window.Paginacao.paginar('tbl-pedidos', { reset: true });
  }
  window.applyPedidosFilter = aplicarFiltrosAvancados;

  document.getElementById('flt-buscar')?.addEventListener('click', aplicarFiltrosAvancados);
  ['flt-fornecedor','flt-status','flt-moeda'].forEach(id => document.getElementById(id)?.addEventListener('change', aplicarFiltrosAvancados));
  document.getElementById('flt-limpar')?.addEventListener('click', () => {
    ['flt-fornecedor','flt-status','flt-moeda'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    // "Limpar" precisa reativar também os chips de Setor/Local — senão um
    // chip desmarcado continuava escondendo pedidos mesmo depois de limpar.
    document.querySelectorAll('.grp-chip, .grp-chip.loc-chip').forEach(c => c.classList.add('active'));
    mesSelecionado = null;
    document.querySelectorAll('.period-card').forEach(b => b.classList.remove('active'));
    aplicarFiltrosAvancados();
  });

  /* ---------- Edição inline do Status (clique na célula → <select>) ---------- */
  document.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-inline-status]');
    if (!cell || cell.querySelector('select')) return;
    const id = cell.dataset.inlineStatus;
    const atual = cell.querySelector('.status-badge')?.textContent.trim() || '';
    const sel = document.createElement('select');
    sel.className = 'form-select inline-edit-select';
    sel.innerHTML = STATUS_OPCOES.map(s => `<option value="${s}" ${s === atual ? 'selected' : ''}>${s}</option>`).join('');
    cell.innerHTML = '';
    cell.appendChild(sel);
    sel.focus();
    const commit = async () => {
      const novo = sel.value;
      if (novo === atual) { renderPedidos(); return; }
      sel.disabled = true;
      try {
        await DB.update('pedidos', id, { status: novo });
        showToast('Status atualizado', `Pedido marcado como "${novo}".`, true);
        renderPedidos();
        if (window.checkNotificacoes) window.checkNotificacoes();
      } catch (err) {
        showToast('Erro ao atualizar status', err.message || 'Tente novamente.', false);
        renderPedidos();
      }
    };
    sel.addEventListener('change', commit);
    sel.addEventListener('blur', () => { if (document.body.contains(sel)) renderPedidos(); });
  });

  // Excluir pedido (cascade no banco apaga faturas/embarques/pagamentos vinculados)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-pedido]');
    if (!btn) return;
    const id = btn.dataset.deletePedido;
    if (!confirm('Excluir este pedido? Faturas, embarques e pagamentos vinculados também serão removidos. Essa ação não pode ser desfeita.')) return;
    try {
      // Coleta os anexos (PI, NF, BL, câmbio) antes do cascade apagar as linhas
      if (window.Storage) {
        try {
          const [pedidos, faturas, embarques, pagamentos] = await Promise.all([
            DB.list('pedidos', `select=arquivo_pi_url&id=eq.${id}`),
            DB.list('faturas', `select=arquivo_url&pedido_id=eq.${id}`),
            DB.list('embarques', `select=arquivo_bl_url&pedido_id=eq.${id}`),
            DB.list('pagamentos', `select=arquivo_cambio_url&pedido_id=eq.${id}`)
          ]);
          const urls = [
            ...pedidos.map(r => r.arquivo_pi_url),
            ...faturas.map(r => r.arquivo_url),
            ...embarques.map(r => r.arquivo_bl_url),
            ...pagamentos.map(r => r.arquivo_cambio_url)
          ].filter(Boolean);
          urls.forEach(u => Storage.remove(u));
        } catch (e) { console.warn('Falha ao limpar anexos do pedido:', e.message); }
      }
      await DB.remove('pedidos', id);
      renderPedidos();
      if (window.renderDashboard) window.renderDashboard();
      if (window.renderOperacionais) window.renderOperacionais();
      if (window.checkNotificacoes) window.checkNotificacoes();
      showToast('Pedido excluído', 'O pedido e seus registros vinculados foram removidos.', true);
    } catch (err) {
      showToast('Erro ao excluir', err.message || 'Tente novamente.', false);
    }
  });

  if (window.Auth && Auth.isLoggedIn()) renderPedidos();
  window.renderPedidos = renderPedidos;
})();
