/* ══════════════════════════════════════════════════════════
   TopImport Pro — Notificações de vencimento
   Verifica invoices (faturas) e pagamentos pendentes vencendo em
   até 7 dias (ou já vencidos) e mostra no sininho da topbar.
   ══════════════════════════════════════════════════════════ */
(function () {
  const JANELA_DIAS = 7;

  const bell = document.getElementById('btn-notificacoes');
  const badge = document.getElementById('notif-badge');
  const dropdown = document.getElementById('notif-dropdown');
  const list = document.getElementById('notif-dropdown-list');
  const btnLimparTudo = document.getElementById('notif-clear-all');
  const dashBadge = document.querySelector('.nav-item[data-view="dashboard"] .nav-badge');

  // Notificações são recalculadas a cada checagem a partir de faturas/
  // pagamentos pendentes vencendo — não existe uma tabela própria no banco
  // pra "excluir" uma notificação de verdade. "Limpar"/"✕" aqui só escondem
  // aquele item da lista (localStorage, por navegador) até ele deixar de
  // existir na origem (invoice paga, vencimento sai da janela de 7 dias);
  // se o usuário abrir em outro computador/navegador, a notificação volta
  // a aparecer lá normalmente.
  const LS_KEY = 'topimport_notif_dispensadas';
  function lerDispensadas() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function salvarDispensadas(set) {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch (e) { /* ignora (modo privado etc.) */ }
  }
  let ultimosItensBrutos = []; // antes do filtro de dispensadas — usado por "Limpar tudo"

  function diasAte(iso) {
    if (!iso) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const alvo = new Date(iso + 'T00:00:00');
    return Math.round((alvo - hoje) / 86400000);
  }
  function toBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function fmtMoeda(n, moeda) {
    const sym = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' }[moeda] || '';
    return sym + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function labelPrazo(dias) {
    if (dias < 0) return { texto: `Venceu há ${Math.abs(dias)}d`, icone: '🔴' };
    if (dias === 0) return { texto: 'Vence hoje', icone: '🟠' };
    if (dias <= 3) return { texto: `Vence em ${dias}d`, icone: '🟠' };
    return { texto: `Vence em ${dias}d`, icone: '🟡' };
  }

  async function coletarNotificacoes() {
    const itens = [];
    try {
      const faturas = await DB.list('faturas',
        'select=id,numero_invoice,data_vencimento,valor,moeda,pedidos(numero_pedido,fornecedores(razao_social))&status=eq.Pendente&order=data_vencimento.asc.nullslast');
      faturas.forEach(f => {
        const dias = diasAte(f.data_vencimento);
        if (dias == null || dias > JANELA_DIAS) return;
        const forn = f.pedidos?.fornecedores?.razao_social || '—';
        itens.push({
          id: `fatura:${f.id}`, view: 'faturamento', dias,
          titulo: `Invoice ${f.numero_invoice} · ${fmtMoeda(f.valor, f.moeda)}`,
          sub: `${forn} · vencimento ${toBR(f.data_vencimento)}`
        });
      });
    } catch (e) { console.warn('Falha ao checar faturas:', e.message); }

    try {
      const pagamentos = await DB.list('pagamentos',
        'select=id,valor,moeda,valor_brl,data_vencimento,banco,pedidos(numero_pedido,fornecedores(razao_social)),faturas(numero_invoice)&status=eq.Pendente&order=data_vencimento.asc.nullslast');
      pagamentos.forEach(p => {
        const dias = diasAte(p.data_vencimento);
        if (dias == null || dias > JANELA_DIAS) return;
        const forn = p.pedidos?.fornecedores?.razao_social || '—';
        const invoice = p.faturas?.numero_invoice ? ` · ${p.faturas.numero_invoice}` : '';
        itens.push({
          id: `pagamento:${p.id}`, view: 'pagamento', dias,
          titulo: `Pagamento ${fmtMoeda(p.valor, p.moeda)}${invoice}`,
          sub: `${forn} · vencimento ${toBR(p.data_vencimento)}`
        });
      });
    } catch (e) { console.warn('Falha ao checar pagamentos:', e.message); }

    itens.sort((a, b) => a.dias - b.dias);
    return itens;
  }

  function render(itens) {
    if (!list) return;
    if (!itens.length) {
      list.innerHTML = `<div class="notif-empty">✅ Nenhum vencimento nos próximos ${JANELA_DIAS} dias.</div>`;
    } else {
      list.innerHTML = itens.map(it => {
        const { texto, icone } = labelPrazo(it.dias);
        return `
          <div class="notif-item" data-goto="${it.view}">
            <div class="notif-item-icon">${icone}</div>
            <div class="notif-item-body">
              <div class="notif-item-title">${escapeHtml(it.titulo)}</div>
              <div class="notif-item-sub">${escapeHtml(it.sub)} · ${texto}</div>
            </div>
            <button type="button" class="notif-item-close" data-dismiss="${escapeHtml(it.id)}" title="Remover esta notificação">✕</button>
          </div>`;
      }).join('');
    }
    if (btnLimparTudo) btnLimparTudo.style.display = itens.length ? '' : 'none';

    const urgentes = itens.filter(it => it.dias <= 3).length;
    if (badge) {
      if (itens.length) {
        badge.textContent = itens.length > 9 ? '9+' : String(itens.length);
        badge.style.display = 'flex';
        badge.style.background = urgentes ? 'var(--rose)' : 'var(--amber)';
      } else {
        badge.style.display = 'none';
      }
    }
    if (dashBadge) {
      if (itens.length) { dashBadge.textContent = itens.length > 9 ? '9+' : String(itens.length); dashBadge.style.display = ''; }
      else dashBadge.style.display = 'none';
    }
  }

  async function checkNotificacoes() {
    const brutos = await coletarNotificacoes();
    ultimosItensBrutos = brutos;
    const dispensadas = lerDispensadas();
    // Poda ids dispensados que não existem mais na origem (invoice/pagamento
    // foi pago, ou saiu da janela de 7 dias) — evita o localStorage crescer
    // pra sempre com ids de notificações que nunca mais vão aparecer.
    const idsAtuais = new Set(brutos.map(it => it.id));
    let mudou = false;
    [...dispensadas].forEach(id => { if (!idsAtuais.has(id)) { dispensadas.delete(id); mudou = true; } });
    if (mudou) salvarDispensadas(dispensadas);

    const itens = brutos.filter(it => !dispensadas.has(it.id));
    render(itens);
    return itens;
  }
  window.checkNotificacoes = checkNotificacoes;

  function dispensar(id) {
    const dispensadas = lerDispensadas();
    dispensadas.add(id);
    salvarDispensadas(dispensadas);
    render(ultimosItensBrutos.filter(it => !dispensadas.has(it.id)));
  }
  function limparTudo() {
    const dispensadas = lerDispensadas();
    ultimosItensBrutos.forEach(it => dispensadas.add(it.id));
    salvarDispensadas(dispensadas);
    render([]);
  }

  function closeDropdown() { dropdown?.classList.remove('open'); }
  function toggleDropdown() {
    if (!dropdown) return;
    const abrindo = !dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    if (abrindo) checkNotificacoes();
  }

  bell?.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
  document.addEventListener('click', (e) => {
    if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target) && e.target !== bell && !bell?.contains(e.target)) {
      closeDropdown();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

  list?.addEventListener('click', (e) => {
    const close = e.target.closest('[data-dismiss]');
    if (close) { e.stopPropagation(); dispensar(close.dataset.dismiss); return; }
    const item = e.target.closest('[data-goto]');
    if (!item) return;
    closeDropdown();
    if (window.showView) window.showView(item.dataset.goto);
  });
  btnLimparTudo?.addEventListener('click', (e) => { e.stopPropagation(); limparTudo(); });

  if (window.Auth && Auth.isLoggedIn()) checkNotificacoes();
  // Reverifica periodicamente enquanto o app estiver aberto (dados podem mudar com o tempo)
  setInterval(() => { if (window.Auth && Auth.isLoggedIn()) checkNotificacoes(); }, 5 * 60 * 1000);
})();
