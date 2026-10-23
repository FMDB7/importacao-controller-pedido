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
      sel.innerHTML = primeiraOpcao + nomes.map(n => `<option>${n}</option>`).join('');
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

  const ferramentasFat = criarFerramentasTabela('fat');
  const ferramentasEmb = criarFerramentasTabela('emb');
  const ferramentasPag = criarFerramentasTabela('pag');

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
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhuma invoice lançada ainda.</td></tr>`;
      ferramentasFat.renderPeriodCards([], () => null);
      const contagem0 = document.getElementById('fat-contagem');
      if (contagem0) contagem0.textContent = 'Nenhum registro';
      return;
    }
    const STATUS_BADGE = {
      'Pendente': '<span class="status-badge" style="background:rgba(37,99,235,0.1);color:var(--cyan);">Pendente</span>',
      'Paga': '<span class="status-badge s-entregue">Paga</span>',
      'Vencida': '<span class="status-badge" style="background:rgba(220,60,94,0.12);color:var(--rose);">Vencida</span>',
      'Cancelada': '<span class="status-badge s-aguardando">Cancelada</span>'
    };
    tbody.innerHTML = rows.map(f => {
      const forn = f.pedidos?.fornecedores?.razao_social || '—';
      const dias = diasAte(f.data_vencimento);
      const vencCor = dias != null && dias < 0 ? 'var(--rose)' : (dias != null && dias <= 7 ? 'var(--amber)' : 'var(--ink-2)');
      const vencIcon = dias != null && dias < 0 ? '⚠ ' : '';
      const valorBrl = f.pedidos?.valor_brl ? Number(f.pedidos.valor_brl) : 0;
      const busca = `${f.numero_invoice||''} ${f.pedidos?.numero_pedido||''} ${forn}`;
      return `
        <tr data-row data-mes="${(f.data_vencimento||'').slice(0,7)}" data-fornecedor="${forn}" data-status="${f.status||''}"
            data-moeda="${f.moeda||''}" data-vencimento="${f.data_vencimento||''}" data-valor="${valorBrl}" data-busca="${busca}">
          <td><span class="mono">${f.numero_invoice}</span>${f.arquivo_url ? `<a href="${f.arquivo_url}" target="_blank" rel="noopener" title="Ver arquivo da invoice/NF" style="margin-left:6px;">📎</a>` : ''}${f.pedidos ? `<div style="font-size:10px;color:var(--ink-3);">📋 ${f.pedidos.numero_pedido}</div>` : ''}</td>
          <td>${forn}</td>
          <td class="ta-c"><span class="currency-tag ${CUR_CLASS[f.moeda]||''}">${f.moeda}</span></td>
          <td class="num">${fmtMoeda(f.valor, f.moeda)}</td>
          <td class="num" style="font-size:11px;">${f.pedidos?.taxa_cambio ? Number(f.pedidos.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
          <td class="num">${f.pedidos?.valor_brl ? fmtBRL(valorBrl) : '—'}</td>
          <td class="date" style="color:${vencCor};">${vencIcon}${toBR(f.data_vencimento)}</td>
          <td class="ta-c cell-editable" data-inline-status-table="faturas" data-inline-status-id="${f.id}" title="Clique para alterar o status">${STATUS_BADGE[f.status] || f.status}</td>
          <td><div class="row-actions"><button type="button" class="danger" data-delete-rec="faturas:${f.id}" title="Excluir invoice">🗑️</button></div></td>
        </tr>`;
    }).join('');
    ferramentasFat.renderPeriodCards(rows, f => f.data_vencimento, f => f.pedidos?.valor_brl);
    ferramentasFat.popularSelect('fat-flt-fornecedor', rows, f => f.pedidos?.fornecedores?.razao_social);
    ferramentasFat.configurar([
      { id: 'fat-flt-fornecedor', attr: 'fornecedor', type: 'select' },
      { id: 'fat-flt-status', attr: 'status', type: 'select' },
      { id: 'fat-flt-moeda', attr: 'moeda', type: 'select' },
      { id: 'fat-flt-data-ini', attr: 'vencimento', type: 'dateMin' },
      { id: 'fat-flt-data-fim', attr: 'vencimento', type: 'dateMax' },
      { id: 'fat-flt-valor-min', attr: 'valor', type: 'numMin' },
      { id: 'fat-flt-valor-max', attr: 'valor', type: 'numMax' },
      { id: 'fat-flt-busca', attr: 'busca', type: 'text' }
    ]);
    ferramentasFat.aplicar();
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
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum embarque registrado ainda.</td></tr>`;
      ferramentasEmb.renderPeriodCards([], () => null);
      const contagem0 = document.getElementById('emb-contagem');
      if (contagem0) contagem0.textContent = 'Nenhum registro';
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
      const forn = e.pedidos?.fornecedores?.razao_social || '—';
      const navio = (e.observacoes || '').replace('Navio/AWB: ', '') || '—';
      const busca = `${e.pedidos?.numero_pedido||''} ${forn} ${navio} ${e.numero_container||''}`;
      return `
        <tr data-row data-mes="${(e.data_embarque||'').slice(0,7)}" data-fornecedor="${forn}" data-status="${e.status||''}"
            data-tipo="${e.tipo||''}" data-embarque="${e.data_embarque||''}" data-busca="${busca}">
          <td>${e.pedidos ? `<span class="mono">${e.pedidos.numero_pedido}</span>` : '—'}${e.arquivo_bl_url ? `<a href="${e.arquivo_bl_url}" target="_blank" rel="noopener" title="Ver arquivo do BL" style="margin-left:6px;">📎</a>` : ''}<div style="font-size:10px;color:var(--ink-3);">${forn}</div></td>
          <td class="ta-c" style="font-size:18px;">${MODAL_ICON[e.tipo] || '📦'}</td>
          <td class="code">${navio}</td>
          <td class="code">${e.numero_container || '—'}</td>
          <td class="date">${toBR(e.data_embarque)}</td>
          <td class="date">${toBR(e.data_previsao_chegada)}</td>
          <td class="date">${toBR(e.data_chegada)}</td>
          <td class="ta-c cell-editable" data-inline-status-table="embarques" data-inline-status-id="${e.id}" title="Clique para alterar o status">${STATUS_BADGE[e.status] || e.status}</td>
          <td><div class="row-actions"><button type="button" class="danger" data-delete-rec="embarques:${e.id}" title="Excluir embarque">🗑️</button></div></td>
        </tr>`;
    }).join('');
    ferramentasEmb.renderPeriodCards(rows, e => e.data_embarque, null);
    ferramentasEmb.popularSelect('emb-flt-fornecedor', rows, e => e.pedidos?.fornecedores?.razao_social);
    ferramentasEmb.configurar([
      { id: 'emb-flt-fornecedor', attr: 'fornecedor', type: 'select' },
      { id: 'emb-flt-status', attr: 'status', type: 'select' },
      { id: 'emb-flt-tipo', attr: 'tipo', type: 'select' },
      { id: 'emb-flt-data-ini', attr: 'embarque', type: 'dateMin' },
      { id: 'emb-flt-data-fim', attr: 'embarque', type: 'dateMax' },
      { id: 'emb-flt-busca', attr: 'busca', type: 'text' }
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
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum pagamento registrado ainda.</td></tr>`;
      ferramentasPag.renderPeriodCards([], () => null);
      const contagem0 = document.getElementById('pag-contagem');
      if (contagem0) contagem0.textContent = 'Nenhum registro';
      return;
    }
    tbody.innerHTML = rows.map(p => {
      const forn = p.pedidos?.fornecedores?.razao_social || '—';
      const dias = diasAte(p.data_vencimento);
      let badge;
      if (p.status === 'Liquidado') badge = '<span class="status-badge s-câmbio-liquidado">Liquidado</span>';
      else if (dias != null && dias < 0) badge = `<span class="status-badge" style="background:rgba(220,60,94,0.12);color:var(--rose);">Vencido há ${Math.abs(dias)}d</span>`;
      else if (dias != null && dias <= 7) badge = `<span class="status-badge" style="background:rgba(185,116,10,0.12);color:var(--amber);">Vence em ${dias}d</span>`;
      else badge = '<span class="status-badge" style="background:rgba(37,99,235,0.1);color:var(--cyan);">A Vencer</span>';
      const valorBrl = Number(p.valor_brl) || 0;
      const busca = `${p.pedidos?.numero_pedido||''} ${forn} ${p.banco||''} ${p.faturas?.numero_invoice||''}`;
      return `
        <tr data-row data-mes="${(p.data_vencimento||'').slice(0,7)}" data-fornecedor="${forn}" data-status="${p.status||''}"
            data-moeda="${p.moeda||''}" data-vencimento="${p.data_vencimento||''}" data-valor="${valorBrl}" data-busca="${busca}">
          <td>${p.pedidos ? `<span class="mono">${p.pedidos.numero_pedido}</span>` : '—'}${p.arquivo_cambio_url ? `<a href="${p.arquivo_cambio_url}" target="_blank" rel="noopener" title="Ver comprovante de câmbio" style="margin-left:6px;">📎</a>` : ''}${p.faturas ? `<div style="font-size:10px;color:var(--ink-3);">${p.faturas.numero_invoice}</div>` : ''}</td>
          <td>${forn}</td>
          <td class="code">${p.banco || '—'}</td>
          <td class="ta-c"><span class="currency-tag ${CUR_CLASS[p.moeda]||''}">${p.moeda}</span></td>
          <td class="num">${fmtMoeda(p.valor, p.moeda)}</td>
          <td class="num" style="font-size:11px;">${p.taxa_cambio ? Number(p.taxa_cambio).toLocaleString('pt-BR',{minimumFractionDigits:4}) : '—'}</td>
          <td class="num">${p.valor_brl ? fmtBRL(valorBrl) : '—'}</td>
          <td class="date">${toBR(p.data_vencimento)}</td>
          <td class="ta-c cell-editable" data-inline-status-table="pagamentos" data-inline-status-id="${p.id}" title="Clique para alterar o status">${badge}</td>
          <td><div class="row-actions"><button type="button" class="danger" data-delete-rec="pagamentos:${p.id}" title="Excluir pagamento">🗑️</button></div></td>
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

  // Edição inline de Status — um único listener por tabela (não por render)
  wireInlineStatus('faturas', ['Pendente', 'Paga', 'Vencida', 'Cancelada'], renderFaturamento);
  wireInlineStatus('embarques', ['Aguardando', 'Embarcado', 'Em Trânsito', 'No Porto', 'Desembaraçando', 'Entregue'], renderEmbarque);
  wireInlineStatus('pagamentos', ['Pendente', 'Liquidado', 'Vencido', 'Cancelado'], renderPagamento);

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
