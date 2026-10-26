/* ─── Navigation ───────────────────────────────────────────────── */
const views   = { dashboard:'Dashboard', lancamentos:'Pedidos', faturamento:'Faturamento', embarque:'Embarque', pagamento:'Pagamento', relatorios:'Relatórios — Diretoria', fornecedores:'Fornecedores', colaboradores:'Colaboradores', usuarios:'Usuários' };
const navItems = document.querySelectorAll('.nav-item[data-view]');
const pageTitle = document.getElementById('page-title');

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + id)?.classList.add('active');
  document.querySelector(`[data-view="${id}"]`)?.classList.add('active');
  if (pageTitle) pageTitle.textContent = views[id] || '';
  // A maioria das telas já tem seu próprio cabeçalho (.page-actions); o
  // título genérico só aparece no Dashboard, que não tem um próprio.
  const heading = document.querySelector('.page-heading');
  if (heading) heading.style.display = id === 'dashboard' ? '' : 'none';
  if (id === 'relatorios') { setTimeout(buildReportCharts, 50); }
  if (id === 'dashboard' && window.renderDashboard) { setTimeout(window.renderDashboard, 50); }
  if (id === 'usuarios' && window.Usuarios) {
    setTimeout(() => { window.Usuarios.renderUsuarios(); window.Usuarios.renderSessoesAtivas(); }, 50);
  }
  // Pedidos/Faturamento/Embarque/Pagamento só eram recarregados do banco
  // no load da página (ou logo após salvar/excluir um lançamento nesta
  // mesma aba do navegador) — trocar de tela pelo menu não buscava dados
  // novos. Resultado: se o lançamento foi feito em outra aba/dispositivo
  // (ou a página ficou aberta por um tempo), a tela parecia "sem
  // informação" mesmo com os dados já salvos no banco. Agora cada clique
  // no menu força um recarregamento, igual já acontecia em Dashboard e
  // Relatórios.
  const RELOAD_ON_VIEW = {
    lancamentos: () => window.renderPedidos && window.renderPedidos(),
    faturamento: () => window.renderFaturamento && window.renderFaturamento(),
    embarque: () => window.renderEmbarque && window.renderEmbarque(),
    pagamento: () => window.renderPagamento && window.renderPagamento(),
  };
  if (RELOAD_ON_VIEW[id]) setTimeout(RELOAD_ON_VIEW[id], 50);
}

navItems.forEach(n => n.addEventListener('click', () => showView(n.dataset.view)));

/* ─── Modal ────────────────────────────────────────────────────── */
const backdrop = document.getElementById('modal-backdrop');
function openModal()  { backdrop.classList.add('open'); setModalTab(0); }
function closeModal() { backdrop.classList.remove('open'); }

['btn-novo-lancamento','btn-novo-lancamento-2'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', openModal);
});
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

/* ─── Modal Tabs ───────────────────────────────────────────────── */
const tabOrder = ['pedido','fatura','embarque','pagamento'];
let currentTab = 0;

function setModalTab(idx) {
  currentTab = idx;
  document.querySelectorAll('.modal-tab').forEach((btn,i) => btn.classList.toggle('active', i === idx));
  document.querySelectorAll('.modal-tab-pane').forEach((pane,i) => pane.classList.toggle('active', i === idx));
  // Update timeline dots
  document.querySelectorAll('.tl-step').forEach((step,i) => {
    step.classList.remove('done','current');
    if (i < idx) step.classList.add('done');
    else if (i === idx) step.classList.add('current');
  });
  // Footer buttons — o botão Salvar fica disponível em TODAS as abas
  // (Pedido/Fatura/Embarque/Pagamento), não só na última: a pessoa pode
  // alterar ou preencher algo em qualquer aba e salvar na hora, sem
  // precisar navegar até o fim do assistente.
  const prev = document.getElementById('modal-prev');
  const next = document.getElementById('modal-next');
  const confirm = document.getElementById('modal-confirm');
  prev.style.display = idx > 0 ? 'inline-flex' : 'none';
  next.style.display = idx === tabOrder.length - 1 ? 'none' : 'inline-flex';
  confirm.style.display = 'inline-flex';
}

document.querySelectorAll('.modal-tab').forEach((btn, i) => {
  btn.addEventListener('click', () => setModalTab(i));
});
document.getElementById('modal-next').addEventListener('click', () => {
  if (currentTab < tabOrder.length - 1) setModalTab(currentTab + 1);
});
document.getElementById('modal-prev').addEventListener('click', () => {
  if (currentTab > 0) setModalTab(currentTab - 1);
});

/* Nota: o clique em #modal-confirm agora é tratado por js/lancamento.js,
   que valida os dados, grava no banco (Neon) e só então fecha o modal
   e exibe o toast de sucesso (ou um erro, se a gravação falhar). */

/* ─── Sparklines SVG (sem dependência CDN) ──────────────────────── */
function sparklineSVG(id, data, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const W = 200, H = 38, pad = 3;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / rng) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const fill = `${pts[0].split(',')[0]},${H} ${line} ${pts[pts.length-1].split(',')[0]},${H}`;
  const uid = 'sg' + id;
  el.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block">
    <defs>
      <linearGradient id="${uid}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${fill}" fill="url(#${uid})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.8"
      stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/* Sparklines, KPIs, gráficos do Dashboard e Relatórios agora são
   construídos com dados reais do banco em js/dashboard.js — ver
   window.renderDashboard() e window.buildReportCharts() lá. */
if (typeof Chart === 'undefined') {
  console.warn('Chart.js não carregou — gráficos desativados (abra online ou com servidor local)');
} else {
  Chart.defaults.color = '#64748B';
  Chart.defaults.borderColor = 'rgba(15,23,42,0.07)';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
}

/* Placeholder até js/dashboard.js carregar e sobrescrever. */
function buildReportCharts() {}

/* ─── Filtro de Grupos / Localização (Pedidos) ──────────────────── */
/* O recálculo em si (quais linhas ficam visíveis) é feito por
   aplicarFiltrosAvancados() em js/lancamento.js, que também considera
   fornecedor/status/moeda/data/valor/busca/mês — window.applyPedidosFilter
   é atribuído lá. Este bloco só cuida do toggle visual dos chips. */
(function () {
  const grpChips = document.querySelectorAll('.grp-chip:not(.loc-chip)');
  const locChips = document.querySelectorAll('.grp-chip.loc-chip');
  [...grpChips, ...locChips].forEach(c => c.addEventListener('click', () => {
    c.classList.toggle('active');
    if (window.applyPedidosFilter) window.applyPedidosFilter();
  }));

  // Botão "✕ Limpar" junto à própria linha de chips — reativa só os
  // chips de Setor/Local (sem tocar nos filtros de Fornecedor/Status/
  // Moeda nem no card de período selecionado, diferente do "Limpar"
  // do painel FILTROS mais abaixo, que reseta tudo).
  document.getElementById('chips-limpar')?.addEventListener('click', () => {
    [...grpChips, ...locChips].forEach(c => c.classList.add('active'));
    if (window.applyPedidosFilter) window.applyPedidosFilter();
  });
})();

/* ─── Modal: Taxas de Câmbio ────────────────────────────────────── */
(function () {
  const bdrop   = document.getElementById('cambio-backdrop');
  const btnOpen = document.getElementById('btn-taxas-cambio');
  const btnClose = document.getElementById('cambio-close');
  const btnCancel= document.getElementById('cambio-cancel');
  const btnAplicar = document.getElementById('cambio-aplicar');
  const previewBody = document.getElementById('cambio-preview-body');

  const moedas = [
    { id:'usd', sigla:'USD', simbolo:'US$', decimais:2 },
    { id:'eur', sigla:'EUR', simbolo:'€',   decimais:2 },
    { id:'chf', sigla:'CHF', simbolo:'Fr',  decimais:2 },
    { id:'gbp', sigla:'GBP', simbolo:'£',   decimais:2 },
  ];

  function parseTaxa(str) {
    if (!str) return NaN;
    return parseFloat(str.replace(',','.'));
  }
  function fmtBRL(v) {
    return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }
  function fmtMoeda(v, simbolo) {
    return simbolo + ' ' + v.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function atualizarPreview() {
    previewBody.innerHTML = '';
    moedas.forEach(m => {
      const inp = document.getElementById('nova-taxa-' + m.id);
      const taxa = parseTaxa(inp?.value);
      const total = parseFloat(inp?.dataset.total || '0');
      const count = parseInt(inp?.dataset.count || '0');
      if (!count && !total) return; // oculta moedas sem movimento
      const totalBRL = isNaN(taxa) ? 0 : taxa * total;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="moeda-label">${m.sigla}</td>
        <td class="mono" style="color:var(--ink-2)">R$ ${isNaN(taxa) ? '—' : taxa.toFixed(4).replace('.',',')}</td>
        <td class="mono" style="color:var(--ink-2)">${fmtMoeda(total, m.simbolo)}</td>
        <td class="total-brl">${isNaN(taxa) ? '—' : fmtBRL(totalBRL)}</td>
      `;
      previewBody.appendChild(tr);
    });
  }

  // Escuta digitação nos inputs de taxa
  moedas.forEach(m => {
    document.getElementById('nova-taxa-' + m.id)?.addEventListener('input', atualizarPreview);
  });

  function openCambio()  { bdrop.classList.add('open'); atualizarPreview(); if (window.refreshCambioExposicao) window.refreshCambioExposicao(); }
  function closeCambio() { bdrop.classList.remove('open'); }

  btnOpen?.addEventListener('click', openCambio);
  document.getElementById('btn-taxas-cambio-pag')?.addEventListener('click', openCambio);
  btnClose?.addEventListener('click', closeCambio);
  btnCancel?.addEventListener('click', closeCambio);
  bdrop?.addEventListener('click', e => { if (e.target === bdrop) closeCambio(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCambio(); });

  /* Nota: o clique em #cambio-aplicar é tratado em js/cambio.js, que grava as
     novas taxas em `taxas_cambio` e atualiza os pedidos com câmbio pendente
     antes de fechar o modal e exibir o toast. Este IIFE só cuida de abrir/
     fechar o modal e recalcular a tabela de pré-visualização em tela. */
  window.closeCambioModal = closeCambio;
  window.atualizarCambioPreview = atualizarPreview;
  window.CAMBIO_MOEDAS = moedas;

  atualizarPreview();
})();

/* ─── Programação de Pagamento ─────────────────────────────────── */
(function () {
  const fmtDate = d => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const addDays  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const inEmbarque = document.getElementById('pay-data-embarque');
  const selCondicao = document.getElementById('pay-condicao');
  const wrapCustom  = document.getElementById('pay-custom-wrap');
  const inCustom    = document.getElementById('pay-custom-dias');
  const outVenc     = document.getElementById('pay-vencimento');
  const lblRestante = document.getElementById('pay-dias-restantes');
  const badge       = document.getElementById('sched-status-badge');
  const timeline    = document.getElementById('pay-timeline');
  const barFill     = document.getElementById('pay-bar-fill');
  const lblEmbarque = document.getElementById('pay-lbl-embarque');
  const lblVenc     = document.getElementById('pay-lbl-venc');
  const markerHoje  = document.getElementById('pay-marker-hoje');
  const dotVenc     = document.getElementById('pay-dot-venc');

  /* Sincroniza Data de Embarque do Tab 3 → Tab 4 */
  const embarqueTab3 = document.querySelector('[data-pane="embarque"] input[type="date"]');
  if (embarqueTab3) {
    embarqueTab3.addEventListener('change', () => {
      if (inEmbarque) inEmbarque.value = embarqueTab3.value;
      calcular();
    });
  }

  /* Mostra/esconde campo de prazo personalizado */
  selCondicao?.addEventListener('change', () => {
    const custom = selCondicao.value === 'custom';
    wrapCustom.style.display = custom ? '' : 'none';
    if (!custom) calcular();
  });
  inCustom?.addEventListener('input', calcular);
  inEmbarque?.addEventListener('change', calcular);

  function calcular() {
    const embarqStr = inEmbarque?.value;
    if (!embarqStr) return;

    const prazoVal = selCondicao?.value === 'custom'
      ? parseInt(inCustom?.value || '0', 10)
      : parseInt(selCondicao?.value || '', 10);

    if (isNaN(prazoVal) || prazoVal < 0) {
      outVenc.value = '';
      lblRestante.textContent = 'Selecione a condição de pagamento';
      lblRestante.style.color = 'var(--ink-3)';
      badge.textContent = '—'; badge.className = 'pay-schedule-badge';
      timeline.style.display = 'none';
      return;
    }

    const dtEmbarque = new Date(embarqStr + 'T12:00:00'); // evita off-by-one de fuso
    const dtVenc     = addDays(dtEmbarque, prazoVal);
    const hoje       = new Date(); hoje.setHours(12,0,0,0);

    outVenc.value = fmtDate(dtVenc);

    const diasTotal     = prazoVal;
    const diasDecorridos = Math.round((hoje - dtEmbarque) / 86400000);
    const diasRestantes  = Math.round((dtVenc - hoje) / 86400000);

    /* Badge e texto */
    if (diasRestantes < 0) {
      const atrasados = Math.abs(diasRestantes);
      lblRestante.textContent = `⚠️ Vencido há ${atrasados} dia${atrasados > 1 ? 's' : ''}`;
      lblRestante.style.color = 'var(--rose)';
      badge.textContent = `Vencido (${atrasados}d)`;
      badge.className = 'pay-schedule-badge late';
      dotVenc.classList.add('ok'); dotVenc.classList.remove('ok'); // remove ok
    } else if (diasRestantes <= 14) {
      lblRestante.textContent = `🔔 Vence em ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''} — ${fmtDate(dtVenc)}`;
      lblRestante.style.color = 'var(--amber)';
      badge.textContent = `Alerta: ${diasRestantes}d`;
      badge.className = 'pay-schedule-badge warn';
      dotVenc.className = 'pay-tl-dot pay-tl-dot-venc';
    } else {
      lblRestante.textContent = `✅ Vence em ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''} — ${fmtDate(dtVenc)}`;
      lblRestante.style.color = 'var(--green)';
      badge.textContent = `${diasRestantes} dias`;
      badge.className = 'pay-schedule-badge ok';
      dotVenc.className = 'pay-tl-dot pay-tl-dot-venc ok';
    }

    /* Linha do tempo visual */
    if (diasTotal > 0) {
      timeline.style.display = '';
      const pct = Math.min(100, Math.max(0, (diasDecorridos / diasTotal) * 100));
      barFill.style.width = pct + '%';

      /* Posição marcador "Hoje" */
      const hojeLeft = Math.min(98, Math.max(2, pct));
      markerHoje.style.left = hojeLeft + '%';
      markerHoje.querySelector('.pay-tl-label').innerHTML =
        `<span style="color:var(--amber)">Hoje</span><br><span>${fmtDate(hoje)}</span>`;

      lblEmbarque.innerHTML = `Embarque<br>${fmtDate(dtEmbarque)}`;
      lblVenc.innerHTML     = `<span style="color:${diasRestantes < 0 ? 'var(--rose)' : 'var(--cyan)'}">Vencimento</span><br>${fmtDate(dtVenc)}`;
    }
  }

  /* Calcula ao abrir o modal no tab de pagamento */
  document.querySelectorAll('.modal-tab').forEach((btn, i) => {
    if (i === 3) btn.addEventListener('click', calcular);
  });

  /* Inicializa se já tiver valores */
  calcular();
})();
