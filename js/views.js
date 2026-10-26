/* ══════════════════════════════════════════════════════════
   TopImport Pro — Faturamento, Embarque e Pagamento com dados
   reais do Neon (leitura). As linhas são criadas pelo modal de
   Novo Lançamento (js/lancamento.js).
   ══════════════════════════════════════════════════════════ */
(function () {

  const CUR_CLASS = { USD: 'cur-usd', EUR: 'cur-eur', GBP: 'cur-gbp', CHF: 'cur-chf' };
  const CUR_SYM = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' };
  const MODAL_ICON = { 'Marítimo': '🚢', 'Aéreo': '✈️', 'Terrestre': '🚛', 'Courier': '📦' };

  function fmtMoeda(n, moeda) {
    n = Number(n) || 0;
    return (CUR_SYM[moeda] || '') + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtBRL(n) {
    n = Number(n) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtBRLCompacto(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
    if (Math.abs(n) >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'K';
    return fmtBRL(n);
  }
  function toBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function diasAte(iso) {
    if (!iso) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const alvo = new Date(iso + 'T00:00:00');
    return Math.round((alvo - hoje) / 86400000);
  }
  function diasEntre(iso1, iso2) {
    return Math.round((new Date(iso2 + 'T00:00:00') - new Date(iso1 + 'T00:00:00')) / 86400000);
  }
  /* Situação em tempo real de 1 embarque — cruza status/datas com hoje pra dizer,
     linha a linha, se está "No prazo", "Atenção" ou "Atrasado" (não só no agregado). */
  function situacaoEmbarque(e) {
    if (e.status === 'Entregue' || e.data_entrada_deposito) {
      return { key: 'concluido', label: 'Concluído', cls: 's-sit-ok' };
    }
    if (e.data_chegada) {
      const dias = diasEntre(e.data_chegada, new Date().toISOString().slice(0, 10));
      if (dias > 7) return { key: 'atrasado', label: `Atrasado · ${dias}d no depósito`, cls: 's-sit-atrasado' };
      if (dias > 3) return { key: 'atencao', label: `Atenção · ${dias}d parado`, cls: 's-sit-atencao' };
      return { key: 'ok', label: 'No prazo', cls: 's-sit-ok' };
    }
    if (e.data_previsao_chegada) {
      const d = diasAte(e.data_previsao_chegada);
      if (d < 0) return { key: 'atrasado', label: `Atrasado · ${Math.abs(d)}d`, cls: 's-sit-atrasado' };
      if (d <= 3) return { key: 'atencao', label: `Chegando em ${d}d`, cls: 's-sit-atencao' };
      return { key: 'ok', label: 'No prazo', cls: 's-sit-ok' };
    }
    return { key: 'sem-previsao', label: 'Sem previsão', cls: 's-sit-neutro' };
  }
  const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  /* ══════════ Ferramentas genéricas: cards de período + filtros avançados + edição inline ══════════
     Reaproveitadas por Faturamento / Embarque / Pagamento (mesmo padrão já usado em Pedidos,
     ver js/lancamento.js). Cada tabela tem seu próprio estado de mês selecionado. */
  function criarFerramentasTabela(prefixo) {
    let mesSelecionado = null;

    function renderPeriodCards(rows, campoData, campoValor) {
      const wrap = document.getElementById(`${prefixo}-period-cards`);
      if (!wrap) return;
      const porMes = {};
      rows.forEach(r => {
        const d = campoData(r);
        if (!d) return;
        const mes = d.slice(0, 7);
        if (!porMes[mes]) porMes[mes] = { count: 0, total: 0 };
        porMes[mes].count++;
        if (campoValor) porMes[mes].total += Number(campoValor(r)) || 0;
      });
      const meses = Object.keys(porMes).sort().reverse();
      if (!meses.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = meses.map(mes => {
        const [ano, m] = mes.split('-');
        const label = `${MES_ABREV[parseInt(m, 10) - 1]}/${ano.slice(2)}`;
        const info = porMes[mes];
        const ativo = mesSelecionado === mes;
        return `<button type="button" class="period-card ${ativo ? 'active' : ''}" data-mes="${mes}">
          <span class="period-card-label">${label}</span>
          <span class="period-card-count">${info.count} reg.</span>
          ${campoValor ? `<span class="period-card-total">${fmtBRL(info.total)}</span>` : ''}
        </button>`;
      }).join('');
      wrap.querySelectorAll('.period-card').forEach(btn => {
        btn.addEventListener('click', () => {
          const mes = btn.dataset.mes;
          mesSelecionado = mesSelecionado === mes ? null : mes;
          wrap.querySelectorAll('.period-card').forEach(b => b.classList.toggle('active', b.dataset.mes === mesSelecionado));
          aplicar();
        });
      });
    }

    function popularSelect(id, rows, campoNome) {
      const sel = document.getElementById(id);
      if (!sel) return;
      const atual = sel.value;
      const nomes = [...new Set(rows.map(campoNome).filter(Boolean))].sort();
      const primeiraOpcao = sel.querySelector('option[value=""]')?.outerHTML || '<option value="">Todos</option>';
      sel.innerHTML = primeiraOpcao + nomes.map(n => `<option>${escapeHtml(n)}</option>`).join('');
      sel.value = atual;
    }

    let camposAtuais = [];
    function configurar(campos) { camposAtuais = campos; }

    function aplicar() {
      const tbody = document.getElementById(`tbl-${prefixo === 'fat' ? 'faturamento' : prefixo === 'emb' ? 'embarque' : 'pagamento'}`);
      if (!tbody) return;
      const rows = tbody.querySelectorAll('tr[data-row]');
      let visiveis = 0;
      rows.forEach(r => {
        let ok = true;
        camposAtuais.forEach(c => {
          const el = document.getElementById(c.id);
          const val = el ? el.value.trim() : '';
          if (!val) return;
          if (c.type === 'select') { if (r.dataset[c.attr] !== val) ok = false; }
          else if (c.type === 'text') { if (!(r.dataset[c.attr] || '').toLowerCase().includes(val.toLowerCase())) ok = false; }
          else if (c.type === 'dateMin') { if (r.dataset[c.attr] && r.dataset[c.attr] < val) ok = false; }
          else if (c.type === 'dateMax') { if (r.dataset[c.attr] && r.dataset[c.attr] > val) ok = false; }
          else if (c.type === 'numMin') { const n = parseFloat(val); if (!isNaN(n) && Number(r.dataset[c.attr]) < n) ok = false; }
          else if (c.type === 'numMax') { const n = parseFloat(val); if (!isNaN(n) && Number(r.dataset[c.attr]) > n) ok = false; }
        });
        if (mesSelecionado && r.dataset.mes !== mesSelecionado) ok = false;
        r.style.display = ok ? '' : 'none';
        if (ok) visiveis++;
      });
      const countEl = document.getElementById(`${prefixo}-contagem`);
      if (countEl) countEl.innerHTML = rows.length ? `Mostrando <strong style="color:var(--ink-1)">${visiveis}</strong> de ${rows.length}` : 'Nenhum registro';
      if (window.Paginacao) window.Paginacao.paginar(tbody.id, { reset: true });
    }

    function limpar() {
      camposAtuais.forEach(c => { const el = document.getElementById(c.id); if (el) el.value = ''; });
      mesSelecionado = null;
      document.querySelectorAll(`#${prefixo}-period-cards .period-card`).forEach(b => b.classList.remove('active'));
      aplicar();
    }

    document.getElementById(`${prefixo}-flt-buscar`)?.addEventListener('click', aplicar);
    document.getElementById(`${prefixo}-flt-busca`)?.addEventListener('keydown', e => { if (e.key === 'Enter') aplicar(); });
    document.getElementById(`${prefixo}-flt-limpar`)?.addEventListener('click', limpar);

    return { renderPeriodCards, popularSelect, configurar, aplicar };
  }

  /* Edição inline genérica de Status (clique na célula → <select> → DB.update) */
  function wireInlineStatus(table, opcoes, onSaved) {
    document.addEventListener('click', (e) => {
      const cell = e.target.closest(`[data-inline-status-table="${table}"]`);
      if (!cell || cell.querySelector('select')) return;
      const id = cell.dataset.inlineStatusId;
      // Usa o status real gravado na linha (data-status), não o texto exibido no
      // badge — em Pagamento, por exemplo, o badge mostra "Vence em 5d" mas o
      // valor salvo no banco é "Pendente".
      const atual = cell.closest('tr')?.dataset.status || cell.querySelector('.status-badge')?.textContent.trim() || '';
      const sel = document.createElement('select');
      sel.className = 'form-select inline-edit-select';
      sel.innerHTML = opcoes.map(o => `<option value="${o}" ${o === atual ? 'selected' : ''}>${o}</option>`).join('');
      cell.innerHTML = '';
      cell.appendChild(sel);
      sel.focus();
      let salvo = false;
      const commit = async () => {
        if (salvo) return;
        const novo = sel.value;
        if (novo === atual) { onSaved(); return; }
        salvo = true;
        sel.disabled = true;
        try {
          await DB.update(table, id, { status: novo });
          if (window.showToast) window.showToast('Status atualizado', `Registro marcado como "${novo}".`, true);
          onSaved();
          if (window.renderDashboard) window.renderDashboard();
          if (window.checkNotificacoes) window.checkNotificacoes();
        } catch (err) {
          if (window.showToast) window.showToast('Erro ao atualizar status', err.message || 'Tente novamente.', false);
          onSaved();
        }
      };
      sel.addEventListener('change', commit);
      sel.addEventListener('blur', () => { if (!salvo) onSaved(); });
    });
  }

  /* Edição inline genérica de data (clique na célula → <input type="date"> → DB.update).
     Usada hoje só no Vencimento de Faturamento, mas escrita genérica por
     tabela/campo pra poder ser reaproveitada depois. */
  function wireInlineDate(table, field, onSaved) {
    document.addEventListener('click', (e) => {
      const cell = e.target.closest(`[data-inline-date-table="${table}"][data-inline-date-field="${field}"]`);
      if (!cell || cell.querySelector('input')) return;
      const id = cell.dataset.inlineDateId;
      const atual = cell.dataset.inlineDateValue || '';
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'form-input inline-edit-date';
      input.value = atual;
      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      let salvo = false;
      const commit = async () => {
        if (salvo) return;
        const novo = input.value;
        if (!novo || novo === atual) { onSaved(); return; }
        salvo = true;
        input.disabled = true;
        try {
          await DB.update(table, id, { [field]: novo });
          if (window.showToast) window.showToast('Vencimento atualizado', `Novo vencimento: ${novo.split('-').reverse().join('/')}.`, true);
          onSaved();
          if (window.renderDashboard) window.renderDashboard();
          if (window.checkNotificacoes) window.checkNotificacoes();
        } catch (err) {
          if (window.showToast) window.showToast('Erro ao atualizar vencimento', err.message || 'Tente novamente.', false);
          onSaved();
        }
      };
      input.addEventListener('change', commit);
      input.addEventListener('blur', () => { if (!salvo) onSaved(); });
    });
  }

  const ferramentasFat = criarFerramentasTabela('fat');
  const ferramentasEmb = criarFerramentasTabela('emb');
  const ferramentasPag = criarFerramentasTabela('pag');

  /* Status da invoice é 100% automático (não há mais seleção manual nesta
     tela): "Liquidada" quando existe um pagamento vinculado com
     status=Liquidado, "Vencida" quando já passou do vencimento, senão
     "A Vencer". `Cancelada` continua sendo respeitada se já estiver gravada
     no banco (não é mais algo que se defina por aqui). */
  function statusAutoFat(f, dias, liquidada) {
    if (f.status === 'Cancelada') return 'Cancelada';
    if (liquidada) return 'Liquidada';
    if (dias != null && dias < 0) return 'Vencida';
    return 'A Vencer';
  }

  /* ---------- FATURAMENTO ---------- */
  async function renderFaturamento() {
    const tbody = document.getElementById('tbl-faturamento');
    if (!tbody) return;
    let rows;
    try {
      rows = await DB.list('faturas', 'select=*,pedidos(numero_pedido,numero_pi,taxa_cambio,valor_brl,descricao,fornecedores(razao_social)),pagamentos(status)&order=data_vencimento.asc.nullslast');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
      return;
    }

    const totalBRL = rows.reduce((s, f) => s + (f.pedidos?.valor_brl ? Number(f.pedidos.valor_brl) : 0), 0);
    const statusDeCada = rows.map(f => statusAutoFat(f, diasAte(f.data_vencimento), Array.isArray(f.pagamentos) && f.pagamentos.some(p => p.status === 'Liquidado')));
    const abertas = statusDeCada.filter(s => s === 'A Vencer' || s === 'Vencida').length;
    const liquidadas = statusDeCada.filter(s => s === 'Liquidada').length;
    const pendenteBRL = rows.reduce((s, f, i) => (statusDeCada[i] === 'A Vencer' || statusDeCada[i] === 'Vencida') ? s + (f.pedidos?.valor_brl ? Number(f.pedidos.valor_brl) : 0) : s, 0);
    const pct = (n, total) => total > 0 ? (n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('fat-kpi-total', fmtBRL(totalBRL));
    set('fat-kpi-total-sub', `${rows.length} invoice${rows.length === 1 ? '' : 's'} no total`);
    set('fat-kpi-abertas', abertas);
    set('fat-kpi-abertas-sub', `${pct(abertas, rows.length)}% das invoices`);
    set('fat-kpi-pagas', liquidadas);
    set('fat-kpi-pagas-sub', `${pct(liquidadas, rows.length)}% das invoices`);
    set('fat-kpi-pendente', fmtBRL(pendenteBRL));
    set('fat-kpi-pendente-sub', `${pct(pendenteBRL, totalBRL)}% do total faturado`);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhuma invoice lançada ainda.</td></tr>`;
      ferramentasFat.renderPeriodCards([], () => null);
      const contagem0 = document.getElementById('fat-contagem');
      if (contagem0) contagem0.textContent = 'Nenhum registro';
      if (window.Paginacao) window.Paginacao.paginar('tbl-faturamento', { reset: true });
      return;
    }
    const STATUS_BADGE = {
      'A Vencer': '<span class="status-badge" style="background:rgba(37,99,235,0.1);color:var(--cyan);">A Vencer</span>',
      'Liquidada': '<span class="status-badge s-entregue">Liquidada</span>',
      'Vencida': '<span class="status-badge" style="background:rgba(220,60,94,0.12);color:var(--rose);">Vencida</span>',
      'Cancelada': '<span class="status-badge s-aguardando">Cancelada</span>'
    };
    tbody.innerHTML = rows.map(f => {
      const fornRaw = f.pedidos?.fornecedores?.razao_social || '—';
      const forn = escapeHtml(fornRaw);
      const dias = diasAte(f.data_vencimento);
      const liquidada = Array.isArray(f.pagamentos) && f.pagamentos.some(p => p.status === 'Liquidado');
      const statusKey = statusAutoFat(f, dias, liquidada);
      const vencCor = dias != null && dias < 0 ? 'var(--rose)' : (dias != null && dias <= 7 ? 'var(--amber)' : 'var(--ink-2)');
      // Alerta de vencimento: só faz sentido para invoices ainda em aberto.
      const pendenteFat = statusKey === 'A Vencer' || statusKey === 'Vencida';
      const alertaFat = pendenteFat && dias != null && dias < 0 ? '🚨 ' : (pendenteFat && dias != null && dias <= 7 ? '⚠️ ' : '');
      // Prazo (dias) não tem coluna própria no banco — é sempre derivável
      // da diferença entre emissão e vencimento (mesma conta que o modal
      // de lançamento já faz para reabrir o campo "Prazo" na edição).
      const prazoDias = (f.data_emissao && f.data_vencimento)
        ? Math.round((new Date(f.data_vencimento + 'T00:00:00') - new Date(f.data_emissao + 'T00:00:00')) / 86400000)
        : null;
      const valorBrl = f.pedidos?.valor_brl ? Number(f.pedidos.valor_brl) : 0;
      // Marca não tem coluna própria no banco — vem concatenada em
      // `pedidos.descricao` (ex.: "Marca: Nike · SKU: ...") junto com
      // SKU/Qtde/Navio/Peso/Incoterm; extraímos só o trecho da Marca aqui.
      const marcaMatch = f.pedidos?.descricao ? f.pedidos.descricao.match(/Marca:\s*([^·]+)/) : null;
      const marca = marcaMatch ? escapeHtml(marcaMatch[1].trim()) : '—';
      const busca = escapeHtml(`${f.numero_invoice||''} ${f.pedidos?.numero_pedido||''} ${f.pedidos?.numero_pi||''} ${fornRaw}`);
      return `
        <tr data-row data-mes="${escapeHtml((f.data_vencimento||'').slice(0,7))}" data-fornecedor="${forn}" data-status="${escapeHtml(statusKey)}"
            data-moeda="${escapeHtml(f.moeda||'')}" data-vencimento="${escapeHtml(f.data_vencimento||'')}" data-valor="${valorBrl}" data-valor-nativo="${Number(f.valor)||0}" data-busca="${busca}">
          <td>${f.pedidos?.numero_pi ? `<span class="mono" style="font-size:11.5px;">${escapeHtml(f.pedidos.numero_pi)}</span>` : '—'}</td>
          <td><span class="mono">${escapeHtml(f.numero_invoice)}</span>${f.arquivo_url ? `<a href="${escapeHtml(f.arquivo_url)}" target="_blank" rel="noopener" title="Ver arquivo da invoice/NF" style="margin-left:6px;">📎</a>` : ''}</td>
          <td>${f.pedidos ? `<span class="mono" style="font-size:11.5px;">${escapeHtml(f.pedidos.numero_pedido)}</span>` : '—'}</td>
          <td>${forn}</td>
          <td>${marca}</td>
          <td class="ta-c"><span class="currency-tag ${CUR_CLASS[f.moeda]||''}">${escapeHtml(f.moeda)}</span></td>
          <td class="num">${fmtMoeda(f.valor, f.moeda)}</td>
          <td class="num">${f.qtd_pecas != null ? Number(f.qtd_pecas).toLocaleString('pt-BR', { maximumFractionDigits: 20 }) + ' pçs' : '—'}</td>
          <td class="num" style="font-size:11px;">${f.pedidos?.taxa_cambio ? Number(f.pedidos.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
          <td class="num">${f.pedidos?.valor_brl ? fmtBRL(valorBrl) : '—'}</td>
          <td class="ta-c">${prazoDias != null ? prazoDias + ' dias' : '—'}</td>
          <td class="date cell-editable" style="color:${vencCor};" data-inline-date-table="faturas" data-inline-date-id="${f.id}" data-inline-date-field="data_vencimento" data-inline-date-value="${escapeHtml(f.data_vencimento||'')}" title="Clique para ajustar o vencimento">${alertaFat}${toBR(f.data_vencimento)}</td>
          <td class="ta-c" title="Calculado automaticamente a partir do vencimento e do pagamento">${STATUS_BADGE[statusKey] || escapeHtml(statusKey)}</td>
          <td><div class="row-actions"><button type="button" data-edit-lancamento="${f.pedido_id}:fatura" title="Editar invoice">✏️</button><button type="button" class="danger" data-delete-rec="faturas:${f.id}" title="Excluir invoice">🗑️</button></div></td>
        </tr>`;
    }).join('');
    ferramentasFat.renderPeriodCards(rows, f => f.data_vencimento, f => f.pedidos?.valor_brl);
    ferramentasFat.popularSelect('fat-flt-fornecedor', rows, f => f.pedidos?.fornecedores?.razao_social);
    ferramentasFat.configurar([
      { id: 'fat-flt-fornecedor', attr: 'fornecedor', type: 'select' },
      { id: 'fat-flt-status', attr: 'status', type: 'select' },
      { id: 'fat-flt-moeda', attr: 'moeda', type: 'select' },
      { id: 'fat-flt-data-ini', attr: 'vencimento', type: 'dateMin' },
      { id: 'fat-flt-data-fim', attr: 'vencimento', type: 'dateMax' }
    ]);
    ferramentasFat.aplicar();
  }

  /* ---------- EMBARQUE: Rastreamento Inteligente (funil + insights) ----------
     O status (Aguardando/Embarcado/Em Trânsito/No Porto/Desembaraçando/Entregue)
     não distingue "chegou na cidade de destino" de "deu entrada física no
     depósito/estoque" — são dois marcos diferentes (data_chegada x
     data_entrada_deposito). Este painel cruza os dois pra mostrar onde o
     processo está represado. */
  let chartEmbFunil = null;
  function renderEmbarqueInsights(rows) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    const total = rows.length;
    const nEmbarcado = rows.filter(r => r.data_embarque).length;
    const nChegou = rows.filter(r => r.data_chegada).length;
    const nDeposito = rows.filter(r => r.data_entrada_deposito).length;

    const canvas = document.getElementById('chart-emb-funil');
    if (canvas && typeof Chart !== 'undefined') {
      if (chartEmbFunil) chartEmbFunil.destroy();
      chartEmbFunil = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: ['Lançados', 'Embarcados', 'Chegaram no destino', 'Entrada no depósito'],
          datasets: [{
            data: [total, nEmbarcado, nChegou, nDeposito],
            backgroundColor: ['#2563EB', '#7C5CE0', '#B9740A', '#0D9666'],
            borderRadius: 6,
            maxBarThickness: 30
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x} embarque${ctx.parsed.x === 1 ? '' : 's'}` } }
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(15,23,42,0.06)' } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    const wrap = document.getElementById('emb-insight-tiles');
    if (!wrap) return;
    if (!total) {
      wrap.innerHTML = `<div class="emb-insight-tile"><span class="emb-insight-icon">ℹ️</span><span class="emb-insight-text">Nenhum embarque lançado ainda — os insights aparecem aqui conforme você for registrando embarques.</span></div>`;
      return;
    }

    const pendentesDeposito = rows.filter(r => r.data_chegada && !r.data_entrada_deposito);
    const concluidos = rows.filter(r => r.data_chegada && r.data_entrada_deposito);
    const tiles = [];

    if (pendentesDeposito.length) {
      const maxDias = Math.max(...pendentesDeposito.map(r => diasEntre(r.data_chegada, hoje.toISOString().slice(0, 10))));
      const pl = pendentesDeposito.length === 1;
      tiles.push(`<div class="emb-insight-tile alert">
        <span class="emb-insight-icon">⚠️</span>
        <span class="emb-insight-text"><strong>${pendentesDeposito.length} embarque${pl ? '' : 's'}</strong> ${pl ? 'chegou' : 'chegaram'} no destino mas ainda não ${pl ? 'deu' : 'deram'} entrada no depósito${maxDias > 0 ? ` — o mais antigo está esperando há <strong>${maxDias} dia${maxDias === 1 ? '' : 's'}</strong>` : ''}.</span>
      </div>`);
    } else {
      tiles.push(`<div class="emb-insight-tile ok">
        <span class="emb-insight-icon">✅</span>
        <span class="emb-insight-text">Nenhum embarque com pendência entre a chegada no destino e a entrada no depósito.</span>
      </div>`);
    }

    if (concluidos.length) {
      const media = concluidos.reduce((s, r) => s + diasEntre(r.data_chegada, r.data_entrada_deposito), 0) / concluidos.length;
      tiles.push(`<div class="emb-insight-tile">
        <span class="emb-insight-icon">⏱️</span>
        <span class="emb-insight-text">Tempo médio entre a chegada e a entrada no depósito: <strong>${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia${media.toFixed(1) === '1.0' ? '' : 's'}</strong>, com base em ${concluidos.length} embarque${concluidos.length === 1 ? '' : 's'} já concluído${concluidos.length === 1 ? '' : 's'}.</span>
      </div>`);
    }

    const pctCompleto = total ? (nDeposito / total * 100) : 0;
    tiles.push(`<div class="emb-insight-tile">
      <span class="emb-insight-icon">📦</span>
      <span class="emb-insight-text"><strong>${pctCompleto.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</strong> dos embarques já completaram o fluxo até a entrada no depósito (${nDeposito} de ${total}).</span>
    </div>`);

    wrap.innerHTML = tiles.join('');
  }

  /* ---------- EMBARQUE ---------- */
  async function renderEmbarque() {
    const tbody = document.getElementById('tbl-embarque');
    if (!tbody) return;
    let rows;
    try {
      rows = await DB.list('embarques', 'select=*,pedidos(numero_pedido,fornecedores(razao_social))&order=data_embarque.desc.nullslast');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
      return;
    }

    const now = new Date();
    const mesAtual = MES_NOMES[now.getMonth()];
    const emTransito = rows.filter(e => e.status === 'Em Trânsito').length;
    const noPorto = rows.filter(e => e.status === 'No Porto' || e.status === 'Desembaraçando').length;
    const semanaQue = rows.filter(e => { const d = diasAte(e.data_previsao_chegada); return d != null && d >= 0 && d <= 7; }).length;
    const entreguesMes = rows.filter(e => e.status === 'Entregue' && e.data_chegada && e.data_chegada.slice(0,7) === now.toISOString().slice(0,7)).length;
    const atrasados = rows.filter(e => situacaoEmbarque(e).key === 'atrasado').length;
    const pct = (n, total) => total > 0 ? (n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('emb-kpi-total', rows.length);
    set('emb-kpi-total-sub', rows.length ? `${rows.length} registro${rows.length === 1 ? '' : 's'} no total` : 'nenhum embarque ainda');
    set('emb-kpi-transito', emTransito);
    set('emb-kpi-transito-sub', `${pct(emTransito, rows.length)}% do total · cargas no mar/ar`);
    set('emb-kpi-porto', noPorto);
    set('emb-kpi-porto-sub', `${pct(noPorto, rows.length)}% do total · aguardando liberação`);
    set('emb-kpi-eta', semanaQue);
    set('emb-kpi-eta-sub', `${pct(semanaQue, rows.length)}% do total · ⚓ chegando em breve`);
    set('emb-kpi-entregues-label', `Entregues — ${mesAtual}`);
    set('emb-kpi-entregues', entreguesMes);
    set('emb-kpi-entregues-sub', `${pct(entreguesMes, rows.length)}% do total`);
    set('emb-kpi-atrasados', atrasados);
    set('emb-kpi-atrasados-sub', atrasados ? `${pct(atrasados, rows.length)}% do total · requer atenção agora` : 'nenhum embarque atrasado agora');
    renderEmbarqueInsights(rows);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum embarque registrado ainda.</td></tr>`;
      ferramentasEmb.renderPeriodCards([], () => null);
      const contagem0 = document.getElementById('emb-contagem');
      if (contagem0) contagem0.textContent = 'Nenhum registro';
      if (window.Paginacao) window.Paginacao.paginar('tbl-embarque', { reset: true });
      return;
    }
    const STATUS_BADGE = {
      'Aguardando': '<span class="status-badge" style="background:rgba(15,23,42,0.055);color:var(--ink-3);">Aguardando</span>',
      'Embarcado': '<span class="status-badge s-pedido-enviado">Embarcado</span>',
      'Em Trânsito': '<span class="status-badge s-em-trânsito">Em Trânsito</span>',
      'No Porto': '<span class="status-badge s-bl-recebido">No Porto</span>',
      'Desembaraçando': '<span class="status-badge s-desembara-o">Desembaraçando</span>',
      'Entregue': '<span class="status-badge s-entregue">Entregue</span>'
    };
    tbody.innerHTML = rows.map(e => {
      const fornRaw = e.pedidos?.fornecedores?.razao_social || '—';
      const forn = escapeHtml(fornRaw);
      const navioRaw = (e.observacoes || '').replace('Navio/AWB: ', '') || '—';
      const navio = escapeHtml(navioRaw);
      const busca = escapeHtml(`${e.pedidos?.numero_pedido||''} ${fornRaw} ${navioRaw} ${e.numero_container||''}`);
      const sit = situacaoEmbarque(e);
      return `
        <tr data-row data-mes="${escapeHtml((e.data_embarque||'').slice(0,7))}" data-fornecedor="${forn}" data-status="${escapeHtml(e.status||'')}"
            data-tipo="${escapeHtml(e.tipo||'')}" data-embarque="${escapeHtml(e.data_embarque||'')}" data-busca="${busca}" data-situacao="${sit.key}">
          <td>${e.pedidos ? `<span class="mono">${escapeHtml(e.pedidos.numero_pedido)}</span>` : '—'}${e.arquivo_bl_url ? `<a href="${escapeHtml(e.arquivo_bl_url)}" target="_blank" rel="noopener" title="Ver arquivo do BL" style="margin-left:6px;">📎</a>` : ''}</td>
          <td>${forn}</td>
          <td class="ta-c" style="font-size:18px;">${MODAL_ICON[e.tipo] || '📦'}</td>
          <td class="code">${navio}</td>
          <td class="code">${escapeHtml(e.numero_container || '—')}</td>
          <td class="date">${toBR(e.data_embarque)}</td>
          <td class="date">${toBR(e.data_previsao_chegada)}</td>
          <td class="date">${toBR(e.data_chegada)}</td>
          <td class="date">${toBR(e.data_entrada_deposito)}</td>
          <td class="ta-c cell-editable" data-inline-status-table="embarques" data-inline-status-id="${e.id}" title="Clique para alterar o status">${STATUS_BADGE[e.status] || escapeHtml(e.status)}</td>
          <td class="ta-c"><span class="status-badge ${sit.cls}" title="Calculado a partir das datas e do status">${escapeHtml(sit.label)}</span></td>
          <td><div class="row-actions"><button type="button" data-edit-lancamento="${e.pedido_id}:embarque" title="Editar embarque">✏️</button><button type="button" class="danger" data-delete-rec="embarques:${e.id}" title="Excluir embarque">🗑️</button></div></td>
        </tr>`;
    }).join('');
    ferramentasEmb.renderPeriodCards(rows, e => e.data_embarque, null);
    ferramentasEmb.popularSelect('emb-flt-fornecedor', rows, e => e.pedidos?.fornecedores?.razao_social);
    ferramentasEmb.configurar([
      { id: 'emb-flt-fornecedor', attr: 'fornecedor', type: 'select' },
      { id: 'emb-flt-status', attr: 'status', type: 'select' },
      { id: 'emb-flt-tipo', attr: 'tipo', type: 'select' },
      { id: 'emb-flt-situacao', attr: 'situacao', type: 'select' },
      { id: 'emb-flt-data-ini', attr: 'embarque', type: 'dateMin' },
      { id: 'emb-flt-data-fim', attr: 'embarque', type: 'dateMax' }
    ]);
    ferramentasEmb.aplicar();
  }

  /* ---------- PAGAMENTO ---------- */
  async function renderPagamento() {
    const tbody = document.getElementById('tbl-pagamento');
    if (!tbody) return;
    let rows;
    try {
      rows = await DB.list('pagamentos', 'select=*,faturas(numero_invoice),pedidos(numero_pedido,fornecedores(razao_social))&order=data_vencimento.asc.nullslast');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
      return;
    }

    const now = new Date();
    const pendentes = rows.filter(p => p.status === 'Pendente');
    const aVencer30 = pendentes.filter(p => { const d = diasAte(p.data_vencimento); return d != null && d >= 0 && d <= 30; });
    const vencendoSemana = pendentes.filter(p => { const d = diasAte(p.data_vencimento); return d != null && d >= 0 && d <= 7; });
    const liquidados = rows.filter(p => p.status === 'Liquidado');
    const liquidadosMes = liquidados.filter(p => p.data_pagamento && p.data_pagamento.slice(0,7) === now.toISOString().slice(0,7));
    const taxasUSD = rows.filter(p => p.moeda === 'USD' && p.taxa_cambio).map(p => Number(p.taxa_cambio));
    const pct = (n, total) => total > 0 ? (n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';

    const totalPendenteBRL = pendentes.reduce((s,p)=>s+(Number(p.valor_brl)||0),0);
    const totalLiquidadoBRL = liquidados.reduce((s,p)=>s+(Number(p.valor_brl)||0),0);
    const aVencer30BRL = aVencer30.reduce((s,p)=>s+(Number(p.valor_brl)||0),0);
    const vencendoSemanaBRL = vencendoSemana.reduce((s,p)=>s+(Number(p.valor_brl)||0),0);
    const liquidadosMesBRL = liquidadosMes.reduce((s,p)=>s+(Number(p.valor_brl)||0),0);

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('pag-kpi-avencer', fmtBRLCompacto(aVencer30BRL));
    set('pag-kpi-avencer-sub', `⚠ ${aVencer30.length} pagto · ${pct(aVencer30BRL, totalPendenteBRL)}% do pendente`);
    set('pag-kpi-semana', fmtBRLCompacto(vencendoSemanaBRL));
    set('pag-kpi-semana-sub', `🔔 ${vencendoSemana.length} contrato${vencendoSemana.length===1?'':'s'} · ${pct(vencendoSemanaBRL, totalPendenteBRL)}% do pendente`);
    set('pag-kpi-liquidados-label', `Liquidados — ${MES_NOMES[now.getMonth()]}`);
    set('pag-kpi-liquidados', fmtBRLCompacto(liquidadosMesBRL));
    set('pag-kpi-liquidados-sub', `${pct(liquidadosMesBRL, totalLiquidadoBRL)}% do total já liquidado`);
    set('pag-kpi-taxa', taxasUSD.length ? (taxasUSD.reduce((a,b)=>a+b,0)/taxasUSD.length).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum pagamento registrado ainda.</td></tr>`;
      ferramentasPag.renderPeriodCards([], () => null);
      const contagem0 = document.getElementById('pag-contagem');
      if (contagem0) contagem0.textContent = 'Nenhum registro';
      if (window.Paginacao) window.Paginacao.paginar('tbl-pagamento', { reset: true });
      return;
    }
    tbody.innerHTML = rows.map(p => {
      const fornRaw = p.pedidos?.fornecedores?.razao_social || '—';
      const forn = escapeHtml(fornRaw);
      const dias = diasAte(p.data_vencimento);
      let badge;
      if (p.status === 'Liquidado') badge = '<span class="status-badge s-câmbio-liquidado">Liquidado</span>';
      else if (dias != null && dias < 0) badge = `<span class="status-badge" style="background:rgba(220,60,94,0.12);color:var(--rose);">Vencido há ${Math.abs(dias)}d</span>`;
      else if (dias != null && dias <= 7) badge = `<span class="status-badge" style="background:rgba(185,116,10,0.12);color:var(--amber);">Vence em ${dias}d</span>`;
      else badge = '<span class="status-badge" style="background:rgba(37,99,235,0.1);color:var(--cyan);">A Vencer</span>';
      // Alerta de vencimento (ícone + cor na data), só para pagamentos ainda pendentes.
      const pendentePag = p.status !== 'Liquidado';
      const alertaPag = pendentePag && dias != null && dias < 0 ? '🚨 ' : (pendentePag && dias != null && dias <= 7 ? '⚠️ ' : '');
      const vencCorPag = pendentePag && dias != null && dias < 0 ? 'var(--rose)' : (pendentePag && dias != null && dias <= 7 ? 'var(--amber)' : 'var(--ink-2)');
      const valorBrl = Number(p.valor_brl) || 0;
      const busca = escapeHtml(`${p.pedidos?.numero_pedido||''} ${fornRaw} ${p.banco||''} ${p.faturas?.numero_invoice||''}`);
      return `
        <tr data-row data-mes="${escapeHtml((p.data_vencimento||'').slice(0,7))}" data-fornecedor="${forn}" data-status="${escapeHtml(p.status||'')}"
            data-moeda="${escapeHtml(p.moeda||'')}" data-vencimento="${escapeHtml(p.data_vencimento||'')}" data-valor="${valorBrl}" data-busca="${busca}">
          <td>${p.pedidos ? `<span class="mono">${escapeHtml(p.pedidos.numero_pedido)}</span>` : '—'}${p.arquivo_cambio_url ? `<a href="${escapeHtml(p.arquivo_cambio_url)}" target="_blank" rel="noopener" title="Ver comprovante de câmbio" style="margin-left:6px;">📎</a>` : ''}</td>
          <td>${p.faturas ? `<span class="mono" style="font-size:11.5px;">${escapeHtml(p.faturas.numero_invoice)}</span>` : '—'}</td>
          <td>${forn}</td>
          <td class="code">${escapeHtml(p.banco || '—')}</td>
          <td class="ta-c"><span class="currency-tag ${CUR_CLASS[p.moeda]||''}">${escapeHtml(p.moeda)}</span></td>
          <td class="num">${fmtMoeda(p.valor, p.moeda)}</td>
          <td class="num" style="font-size:11px;">${p.taxa_cambio ? Number(p.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
          <td class="num">${p.valor_brl ? fmtBRL(valorBrl) : '—'}</td>
          <td class="date" style="color:${vencCorPag};">${alertaPag}${toBR(p.data_vencimento)}</td>
          <td class="ta-c cell-editable" data-inline-status-table="pagamentos" data-inline-status-id="${p.id}" title="Clique para alterar o status">${badge}</td>
          <td><div class="row-actions"><button type="button" data-edit-lancamento="${p.pedido_id}:pagamento" title="Editar pagamento">✏️</button><button type="button" class="danger" data-delete-rec="pagamentos:${p.id}" title="Excluir pagamento">🗑️</button></div></td>
        </tr>`;
    }).join('');
    ferramentasPag.renderPeriodCards(rows, p => p.data_vencimento, p => p.valor_brl);
    ferramentasPag.popularSelect('pag-flt-fornecedor', rows, p => p.pedidos?.fornecedores?.razao_social);
    ferramentasPag.configurar([
      { id: 'pag-flt-fornecedor', attr: 'fornecedor', type: 'select' },
      { id: 'pag-flt-status', attr: 'status', type: 'select' },
      { id: 'pag-flt-moeda', attr: 'moeda', type: 'select' },
      { id: 'pag-flt-data-ini', attr: 'vencimento', type: 'dateMin' },
      { id: 'pag-flt-data-fim', attr: 'vencimento', type: 'dateMax' },
      { id: 'pag-flt-valor-min', attr: 'valor', type: 'numMin' },
      { id: 'pag-flt-valor-max', attr: 'valor', type: 'numMax' },
      { id: 'pag-flt-busca', attr: 'busca', type: 'text' }
    ]);
    ferramentasPag.aplicar();
  }

  function renderOperacionais() {
    renderFaturamento();
    renderEmbarque();
    renderPagamento();
  }

  // Edição inline de Status — um único listener por tabela (não por render).
  // Faturamento não entra mais aqui: o status passou a ser 100% automático
  // (ver statusAutoFat), então não há mais select manual nessa coluna.
  wireInlineStatus('embarques', ['Aguardando', 'Embarcado', 'Em Trânsito', 'No Porto', 'Desembaraçando', 'Entregue'], renderEmbarque);
  wireInlineStatus('pagamentos', ['Pendente', 'Liquidado', 'Vencido', 'Cancelado'], renderPagamento);
  // Vencimento de Faturamento agora é editável manualmente direto na tabela.
  wireInlineDate('faturas', 'data_vencimento', renderFaturamento);

  // Excluir invoice / embarque / pagamento individualmente (não afeta o pedido-pai)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-rec]');
    if (!btn) return;
    const [table, id] = btn.dataset.deleteRec.split(':');
    const label = { faturas: 'esta invoice', embarques: 'este embarque', pagamentos: 'este pagamento' }[table] || 'este registro';
    if (!confirm(`Excluir ${label}? Essa ação não pode ser desfeita.`)) return;
    const CAMPO_ARQUIVO = { faturas: 'arquivo_url', embarques: 'arquivo_bl_url', pagamentos: 'arquivo_cambio_url' }[table];
    try {
      if (window.Storage && CAMPO_ARQUIVO) {
        try {
          const rows = await DB.list(table, `select=${CAMPO_ARQUIVO}&id=eq.${id}`);
          const url = rows[0] && rows[0][CAMPO_ARQUIVO];
          if (url) Storage.remove(url);
        } catch (e) { console.warn('Falha ao checar anexo antes de excluir:', e.message); }
      }
      await DB.remove(table, id);
      renderOperacionais();
      if (window.renderDashboard) window.renderDashboard();
      if (window.checkNotificacoes) window.checkNotificacoes();
    } catch (err) {
      alert('Erro ao excluir: ' + (err.message || 'Tente novamente.'));
    }
  });

  window.renderFaturamento = renderFaturamento;
  window.renderEmbarque = renderEmbarque;
  window.renderPagamento = renderPagamento;
  window.renderOperacionais = renderOperacionais;

  if (window.Auth && Auth.isLoggedIn()) renderOperacionais();
})();
