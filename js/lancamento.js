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
        fornecedores.map(f => `<option value="${f.id}">${f.razao_social} — ${f.pais}</option>`).join('');
      selColab.innerHTML = '<option value="">Selecionar colaborador...</option>' +
        colaboradores.map(c => `<option value="${c.id}">${c.nome} — ${c.localizacao || '—'} · ${c.cargo}</option>`).join('');
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

  /* ---------- Abrir modal em modo de edição, pré-preenchido ---------- */
  async function openEditPedido(pedidoId) {
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
      setVal('f-destino', p.localizacao || 'ZF');
      setVal('f-data-pedido', p.data_pedido);
      setVal('f-data-previsao', p.data_previsao_entrega);

      setVal('f-fat-moeda', (fatura && fatura.moeda) || p.moeda || 'USD');
      setVal('f-fat-valor', toBR2((fatura && fatura.valor) || p.valor_total));
      setVal('f-fat-incoterm', desc.incoterm);
      if (fatura) {
        setVal('f-invoice', fatura.numero_invoice);
        setVal('f-fat-emissao', fatura.data_emissao);
        if (fatura.data_emissao && fatura.data_vencimento) {
          const dias = Math.round((new Date(fatura.data_vencimento + 'T00:00:00') - new Date(fatura.data_emissao + 'T00:00:00')) / 86400000);
          setVal('f-fat-prazo', String(dias));
        }
      }
      recalcVencimentoFatura();

      if (embarque) {
        setVal('f-emb-tipo', embarque.tipo);
        setVal('f-emb-porto', embarque.porto_origem);
        setVal('f-emb-navio', desc.navio);
        setVal('f-emb-data', embarque.data_embarque);
        setVal('f-emb-container', embarque.numero_container);
        setVal('f-emb-peso', desc.peso);
        setVal('f-emb-eta', embarque.data_previsao_chegada);
        setVal('f-emb-chegada', embarque.data_chegada);
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
          setVal('pay-custom-dias', (tipo.match(/\d+/) || [])[0]);
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
      if (window.setModalTab) window.setModalTab(0);
    } catch (e) {
      showToast('Erro ao abrir edição', e.message || 'Tente novamente.', false);
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit-pedido]');
    if (btn) openEditPedido(btn.dataset.editPedido);
  });

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

  function val(id) { return document.getElementById(id)?.value?.trim() || ''; }

  /* ---------- Confirmar lançamento ---------- */
  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const numeroPedido = val('f-numero-pedido');
    const fornecedorId = val('f-fornecedor');
    const colaboradorId = val('f-colaborador');
    const setor = val('f-setor');
    const dataPedido = val('f-data-pedido');

    if (!numeroPedido || !fornecedorId || !colaboradorId || !setor || !dataPedido) {
      alert('Preencha os campos obrigatórios da aba Pedido: Nº Pedido, Setor, Fornecedor, Responsável e Data de Envio.');
      return;
    }

    const btn = document.getElementById('modal-confirm');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

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

      const isEdit = !!editingPedidoId;

      // 1) PEDIDO
      const dadosPedido = {
        numero_pedido: numeroPedido,
        numero_pi: val('f-pasta') || null,
        fornecedor_id: fornecedorId,
        colaborador_id: colaboradorId,
        setor: setor,
        localizacao: val('f-destino') || 'ZF',
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
          arquivo_url: anexos.nf
        };
        fatura = editingFaturaId
          ? await DB.update('faturas', editingFaturaId, dadosFatura)
          : await DB.create('faturas', { ...dadosFatura, status: 'Pendente' });
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
      if (embTipo && (embPorto || embData || val('f-emb-container'))) {
        const dadosEmbarque = {
          pedido_id: pedido.id,
          tipo: embTipo,
          porto_origem: embPorto || null,
          numero_container: val('f-emb-container') || null,
          data_embarque: embData || null,
          data_previsao_chegada: val('f-emb-eta') || null,
          data_chegada: val('f-emb-chegada') || null,
          observacoes: val('f-emb-navio') ? ('Navio/AWB: ' + val('f-emb-navio')) : null,
          arquivo_bl_url: anexos.bl
        };
        if (editingEmbarqueId) {
          await DB.update('embarques', editingEmbarqueId, dadosEmbarque);
        } else {
          await DB.create('embarques', { ...dadosEmbarque, status: val('f-emb-chegada') ? 'Entregue' : (embData ? 'Embarcado' : 'Aguardando') });
        }
      } else if (editingEmbarqueId) {
        await DB.remove('embarques', editingEmbarqueId);
        if (anexos.bl && window.Storage) Storage.remove(anexos.bl);
      }

      // 4) PAGAMENTO (se houver taxa de câmbio informada)
      if (taxa != null) {
        let tipoPagamento = '90 dias';
        const condVal = document.getElementById('pay-condicao')?.value;
        if (condVal === '0') tipoPagamento = 'À Vista';
        else if (condVal && condVal !== 'custom') tipoPagamento = condVal + ' dias';
        else if (condVal === 'custom') {
          const dias = val('pay-custom-dias');
          tipoPagamento = dias ? dias + ' dias' : '90 dias';
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
          arquivo_cambio_url: anexos.cambio
        };
        if (editingPagamentoId) {
          await DB.update('pagamentos', editingPagamentoId, { ...dadosPagamento, status: val('pay-data-pgto') ? 'Liquidado' : undefined });
        } else {
          await DB.create('pagamentos', { ...dadosPagamento, status: val('pay-data-pgto') ? 'Liquidado' : 'Pendente' });
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
      showToast('Erro ao salvar', e.message || 'Não foi possível gravar o lançamento.', false);
    } finally {
      btn.disabled = false;
      btn.textContent = editingPedidoId ? '💾 Salvar Alterações' : '📤 Confirmar Lançamento';
    }
  });

  /* ---------- Listagem real de Pedidos ---------- */
  async function renderPedidos() {
    const tbody = document.getElementById('tbl-pedidos');
    if (!tbody) return;
    try {
      const rows = await DB.list('pedidos',
        'select=*,fornecedores(razao_social),colaboradores(nome,cargo)&order=created_at.desc&limit=100');
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum pedido lançado ainda. Clique em "Novo Lançamento" para começar.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(p => {
        const forn = p.fornecedores ? p.fornecedores.razao_social : '—';
        const colab = p.colaboradores ? p.colaboradores.nome : '—';
        const cargo = p.colaboradores ? p.colaboradores.cargo : '';
        const setorNome = SETOR_NOME[p.setor] || p.setor || '—';
        const statusCls = STATUS_CLASS[p.status] || 's-pedido-enviado';
        const locCls = p.localizacao === 'SP' ? 'loc-sp' : 'loc-zf';
        return `
          <tr data-grp="${p.setor || ''}" data-loc="${p.localizacao || 'ZF'}">
            <td class="code" style="font-weight:700;color:var(--cyan);">${(p.numero_pedido||'').slice(-4)}</td>
            <td><span class="mono" style="font-size:11.5px;">${p.numero_pedido}</span>${p.arquivo_pi_url ? `<a href="${p.arquivo_pi_url}" target="_blank" rel="noopener" title="Ver arquivo da PI" style="margin-left:6px;">📎</a>` : ''}${p.numero_pi ? `<div style="font-size:10px;color:var(--ink-3);">📁 ${p.numero_pi}</div>` : ''}</td>
            <td>${forn}</td>
            <td class="ta-c">${p.setor ? `<span class="grp-tag" title="${setorNome}">${p.setor}</span>` : '—'}</td>
            <td class="ta-c">${p.moeda ? `<span class="currency-tag ${CUR_CLASS[p.moeda]||''}">${p.moeda}</span>` : '—'}</td>
            <td class="num">${fmtMoeda(p.valor_total, p.moeda)}</td>
            <td class="num" style="font-size:11px;">${p.taxa_cambio ? Number(p.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
            <td class="num">${p.valor_brl ? fmtBRL(Number(p.valor_brl)) : '—'}</td>
            <td class="ta-c"><span class="loc-tag ${locCls}">${p.localizacao||'—'}</span><div style="font-size:10px;color:var(--ink-3);margin-top:2px;">${cargo} · ${colab}</div></td>
            <td class="date">—</td>
            <td class="ta-c"><span class="status-badge ${statusCls}">${p.status}</span></td>
            <td><div class="row-actions"><button type="button" data-edit-pedido="${p.id}" title="Editar pedido">✏️</button><button type="button" class="danger" data-delete-pedido="${p.id}" title="Excluir pedido">🗑️</button></div></td>
          </tr>`;
      }).join('');
      if (window.applyPedidosFilter) {
        document.querySelectorAll('.grp-chip, .grp-chip.loc-chip').forEach(c => c.classList.add('active'));
        window.applyPedidosFilter();
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
    }
  }

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
