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
  const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  /* ---------- FATURAMENTO ---------- */
  async function renderFaturamento() {
    const tbody = document.getElementById('tbl-faturamento');
    if (!tbody) return;
    let rows;
    try {
      rows = await DB.list('faturas', 'select=*,pedidos(numero_pedido,taxa_cambio,valor_brl,fornecedores(razao_social))&order=data_vencimento.asc.nullslast');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
      return;
    }

    const totalBRL = rows.reduce((s, f) => s + (f.pedidos?.valor_brl ? Number(f.pedidos.valor_brl) : 0), 0);
    const abertas = rows.filter(f => f.status === 'Pendente').length;
    const pagas = rows.filter(f => f.status === 'Paga').length;
    const pendenteBRL = rows.filter(f => f.status === 'Pendente').reduce((s, f) => s + (f.pedidos?.valor_brl ? Number(f.pedidos.valor_brl) : 0), 0);

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('fat-kpi-total', fmtBRLCompacto(totalBRL));
    set('fat-kpi-total-sub', `${rows.length} invoice${rows.length === 1 ? '' : 's'} no total`);
    set('fat-kpi-abertas', abertas);
    set('fat-kpi-abertas-sub', 'aguardando pagamento');
    set('fat-kpi-pagas', pagas);
    set('fat-kpi-pendente', fmtBRLCompacto(pendenteBRL));
    set('fat-kpi-pendente-sub', `${abertas} invoice${abertas === 1 ? '' : 's'} pendente${abertas === 1 ? '' : 's'}`);
    const contagem = document.getElementById('fat-contagem');
    if (contagem) contagem.innerHTML = `Mostrando <strong style="color:var(--ink-1)">${rows.length}</strong> invoice${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhuma invoice lançada ainda.</td></tr>`;
      return;
    }
    const STATUS_BADGE = {
      'Pendente': '<span class="status-badge" style="background:rgba(0,207,255,0.1);color:var(--cyan);">Pendente</span>',
      'Paga': '<span class="status-badge s-entregue">Paga</span>',
      'Vencida': '<span class="status-badge" style="background:rgba(255,77,109,0.12);color:var(--rose);">Vencida</span>',
      'Cancelada': '<span class="status-badge s-aguardando">Cancelada</span>'
    };
    tbody.innerHTML = rows.map(f => {
      const forn = f.pedidos?.fornecedores?.razao_social || '—';
      const dias = diasAte(f.data_vencimento);
      const vencCor = dias != null && dias < 0 ? 'var(--rose)' : (dias != null && dias <= 7 ? 'var(--amber)' : 'var(--ink-2)');
      const vencIcon = dias != null && dias < 0 ? '⚠ ' : '';
      return `
        <tr>
          <td><span class="mono">${f.numero_invoice}</span>${f.arquivo_url ? `<a href="${f.arquivo_url}" target="_blank" rel="noopener" title="Ver arquivo da invoice/NF" style="margin-left:6px;">📎</a>` : ''}${f.pedidos ? `<div style="font-size:10px;color:var(--ink-3);">📋 ${f.pedidos.numero_pedido}</div>` : ''}</td>
          <td>${forn}</td>
          <td class="ta-c"><span class="currency-tag ${CUR_CLASS[f.moeda]||''}">${f.moeda}</span></td>
          <td class="num">${fmtMoeda(f.valor, f.moeda)}</td>
          <td class="num" style="font-size:11px;">${f.pedidos?.taxa_cambio ? Number(f.pedidos.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
          <td class="num">${f.pedidos?.valor_brl ? fmtBRL(Number(f.pedidos.valor_brl)) : '—'}</td>
          <td class="date" style="color:${vencCor};">${vencIcon}${toBR(f.data_vencimento)}</td>
          <td class="ta-c">${STATUS_BADGE[f.status] || f.status}</td>
          <td><div class="row-actions"><button type="button" class="danger" data-delete-rec="faturas:${f.id}" title="Excluir invoice">🗑️</button></div></td>
        </tr>`;
    }).join('');
  }

  /* ---------- EMBARQUE ---------- */
  async function renderEmbarque() {
    const tbody = document.getElementById('tbl-embarque');
    if (!tbody) return;
    let rows;
    try {
      rows = await DB.list('embarques', 'select=*,pedidos(numero_pedido,fornecedores(razao_social))&order=data_embarque.desc.nullslast');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
      return;
    }

    const now = new Date();
    const mesAtual = MES_NOMES[now.getMonth()];
    const emTransito = rows.filter(e => e.status === 'Em Trânsito').length;
    const noPorto = rows.filter(e => e.status === 'No Porto' || e.status === 'Desembaraçando').length;
    const semanaQue = rows.filter(e => { const d = diasAte(e.data_previsao_chegada); return d != null && d >= 0 && d <= 7; }).length;
    const entreguesMes = rows.filter(e => e.status === 'Entregue' && e.data_chegada && e.data_chegada.slice(0,7) === now.toISOString().slice(0,7)).length;

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('emb-kpi-transito', emTransito);
    set('emb-kpi-porto', noPorto);
    set('emb-kpi-eta', semanaQue);
    set('emb-kpi-entregues-label', `Entregues — ${mesAtual}`);
    set('emb-kpi-entregues', entreguesMes);
    const contagem = document.getElementById('emb-contagem');
    if (contagem) contagem.innerHTML = `Mostrando <strong style="color:var(--ink-1)">${rows.length}</strong> embarque${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum embarque registrado ainda.</td></tr>`;
      return;
    }
    const STATUS_BADGE = {
      'Aguardando': '<span class="status-badge" style="background:rgba(255,255,255,0.06);color:var(--ink-3);">Aguardando</span>',
      'Embarcado': '<span class="status-badge s-pedido-enviado">Embarcado</span>',
      'Em Trânsito': '<span class="status-badge s-em-trânsito">Em Trânsito</span>',
      'No Porto': '<span class="status-badge s-bl-recebido">No Porto</span>',
      'Desembaraçando': '<span class="status-badge s-desembara-o">Desembaraçando</span>',
      'Entregue': '<span class="status-badge s-entregue">Entregue</span>'
    };
    tbody.innerHTML = rows.map(e => {
      const forn = e.pedidos?.fornecedores?.razao_social || '—';
      const navio = (e.observacoes || '').replace('Navio/AWB: ', '') || '—';
      return `
        <tr>
          <td>${e.pedidos ? `<span class="mono">${e.pedidos.numero_pedido}</span>` : '—'}${e.arquivo_bl_url ? `<a href="${e.arquivo_bl_url}" target="_blank" rel="noopener" title="Ver arquivo do BL" style="margin-left:6px;">📎</a>` : ''}<div style="font-size:10px;color:var(--ink-3);">${forn}</div></td>
          <td class="ta-c" style="font-size:18px;">${MODAL_ICON[e.tipo] || '📦'}</td>
          <td class="code">${navio}</td>
          <td class="code">${e.numero_container || '—'}</td>
          <td class="date">${toBR(e.data_embarque)}</td>
          <td class="date">${toBR(e.data_previsao_chegada)}</td>
          <td class="date">${toBR(e.data_chegada)}</td>
          <td class="ta-c">${STATUS_BADGE[e.status] || e.status}</td>
          <td><div class="row-actions"><button type="button" class="danger" data-delete-rec="embarques:${e.id}" title="Excluir embarque">🗑️</button></div></td>
        </tr>`;
    }).join('');
  }

  /* ---------- PAGAMENTO ---------- */
  async function renderPagamento() {
    const tbody = document.getElementById('tbl-pagamento');
    if (!tbody) return;
    let rows;
    try {
      rows = await DB.list('pagamentos', 'select=*,faturas(numero_invoice),pedidos(numero_pedido,fornecedores(razao_social))&order=data_vencimento.asc.nullslast');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
      return;
    }

    const now = new Date();
    const pendentes = rows.filter(p => p.status === 'Pendente');
    const aVencer30 = pendentes.filter(p => { const d = diasAte(p.data_vencimento); return d != null && d >= 0 && d <= 30; });
    const vencendoSemana = pendentes.filter(p => { const d = diasAte(p.data_vencimento); return d != null && d >= 0 && d <= 7; });
    const liquidadosMes = rows.filter(p => p.status === 'Liquidado' && p.data_pagamento && p.data_pagamento.slice(0,7) === now.toISOString().slice(0,7));
    const taxasUSD = rows.filter(p => p.moeda === 'USD' && p.taxa_cambio).map(p => Number(p.taxa_cambio));

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('pag-kpi-avencer', fmtBRLCompacto(aVencer30.reduce((s,p)=>s+(Number(p.valor_brl)||0),0)));
    set('pag-kpi-avencer-sub', `⚠ ${aVencer30.length} pagamento${aVencer30.length===1?'':'s'}`);
    set('pag-kpi-semana', fmtBRLCompacto(vencendoSemana.reduce((s,p)=>s+(Number(p.valor_brl)||0),0)));
    set('pag-kpi-semana-sub', `🔔 ${vencendoSemana.length} contrato${vencendoSemana.length===1?'':'s'}`);
    set('pag-kpi-liquidados-label', `Liquidados — ${MES_NOMES[now.getMonth()]}`);
    set('pag-kpi-liquidados', fmtBRLCompacto(liquidadosMes.reduce((s,p)=>s+(Number(p.valor_brl)||0),0)));
    set('pag-kpi-taxa', taxasUSD.length ? (taxasUSD.reduce((a,b)=>a+b,0)/taxasUSD.length).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—');
    const contagem = document.getElementById('pag-contagem');
    if (contagem) contagem.innerHTML = `Mostrando <strong style="color:var(--ink-1)">${rows.length}</strong> pagamento${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum pagamento registrado ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(p => {
      const forn = p.pedidos?.fornecedores?.razao_social || '—';
      const dias = diasAte(p.data_vencimento);
      let badge;
      if (p.status === 'Liquidado') badge = '<span class="status-badge s-câmbio-liquidado">Liquidado</span>';
      else if (dias != null && dias < 0) badge = `<span class="status-badge" style="background:rgba(255,77,109,0.12);color:var(--rose);">Vencido há ${Math.abs(dias)}d</span>`;
      else if (dias != null && dias <= 7) badge = `<span class="status-badge" style="background:rgba(245,166,35,0.12);color:var(--amber);">Vence em ${dias}d</span>`;
      else badge = '<span class="status-badge" style="background:rgba(0,207,255,0.1);color:var(--cyan);">A Vencer</span>';
      return `
        <tr>
          <td>${p.pedidos ? `<span class="mono">${p.pedidos.numero_pedido}</span>` : '—'}${p.arquivo_cambio_url ? `<a href="${p.arquivo_cambio_url}" target="_blank" rel="noopener" title="Ver comprovante de câmbio" style="margin-left:6px;">📎</a>` : ''}${p.faturas ? `<div style="font-size:10px;color:var(--ink-3);">${p.faturas.numero_invoice}</div>` : ''}</td>
          <td>${forn}</td>
          <td class="code">${p.banco || '—'}</td>
          <td class="ta-c"><span class="currency-tag ${CUR_CLASS[p.moeda]||''}">${p.moeda}</span></td>
          <td class="num">${fmtMoeda(p.valor, p.moeda)}</td>
          <td class="num" style="font-size:11px;">${p.taxa_cambio ? Number(p.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
          <td class="num">${p.valor_brl ? fmtBRL(Number(p.valor_brl)) : '—'}</td>
          <td class="date">${toBR(p.data_vencimento)}</td>
          <td class="ta-c">${badge}</td>
          <td><div class="row-actions"><button type="button" class="danger" data-delete-rec="pagamentos:${p.id}" title="Excluir pagamento">🗑️</button></div></td>
        </tr>`;
    }).join('');
  }

  function renderOperacionais() {
    renderFaturamento();
    renderEmbarque();
    renderPagamento();
  }

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
