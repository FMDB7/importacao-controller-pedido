/* ══════════════════════════════════════════════════════════
   TopImport Pro — Dashboard e Relatórios com dados reais (Neon)
   Substitui os números/gráficos fixos por agregações sobre
   a tabela `pedidos` (e joins com fornecedores/colaboradores).
   ══════════════════════════════════════════════════════════ */
(function () {

  const MOEDAS = ['USD', 'EUR', 'GBP', 'CHF'];
  const CUR_SYM = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' };
  const CUR_CLASS = { USD: 'cur-usd', EUR: 'cur-eur', GBP: 'cur-gbp', CHF: 'cur-chf' };
  const STATUS_CLASS = {
    'Em Análise': 's-pedido-enviado', 'Aprovado': 's-pedido-enviado', 'Faturado': 's-faturado',
    'Embarcado': 's-bl-recebido', 'Em Trânsito': 's-em-trânsito', 'Desembaraçado': 's-desembara-o',
    'Entregue': 's-entregue', 'Cancelado': 's-aguardando'
  };
  let chartMensal = null, chartDonut = null, chartAnual = null, chartFornecedores = null;

  function fmtMoeda(n, moeda) {
    n = Number(n) || 0;
    return (CUR_SYM[moeda] || '') + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtBRLCompacto(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
    if (Math.abs(n) >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'K';
    return 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  function pct(delta) {
    if (delta == null || !isFinite(delta)) return null;
    const arrow = delta >= 0 ? '↑' : '↓';
    const cls = delta >= 0 ? 'delta-up' : 'delta-down';
    return `<span class="kpi-delta ${cls}">${arrow} ${Math.abs(delta).toFixed(1)}%</span> vs. mês anterior`;
  }

  /* ---------- Dashboard ---------- */
  async function renderDashboard() {
    let rows;
    try {
      rows = await DB.list('pedidos', 'select=numero_pedido,numero_pi,moeda,valor_total,valor_brl,data_pedido,status,fornecedores(razao_social),colaboradores(nome,cargo)&order=data_pedido.desc&limit=500');
    } catch (e) {
      console.error('Erro ao carregar dashboard:', e);
      return;
    }

    const now = new Date();
    const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = prevMonthDate.getFullYear() + '-' + String(prevMonthDate.getMonth() + 1).padStart(2, '0');

    // Totais por moeda: mês atual, mês anterior, e série dos últimos 6 meses
    const monthKeys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const seriesPorMoeda = {}; MOEDAS.forEach(m => seriesPorMoeda[m] = monthKeys.map(() => 0));
    const totalMesAtual = {}; const totalMesAnterior = {};
    MOEDAS.forEach(m => { totalMesAtual[m] = 0; totalMesAnterior[m] = 0; });
    let totalBRLporMoeda = {}; MOEDAS.forEach(m => totalBRLporMoeda[m] = 0);

    rows.forEach(p => {
      if (!p.data_pedido || !p.moeda) return;
      const key = p.data_pedido.slice(0, 7);
      const valor = Number(p.valor_total) || 0;
      const idx = monthKeys.indexOf(key);
      if (idx >= 0 && seriesPorMoeda[p.moeda]) seriesPorMoeda[p.moeda][idx] += valor;
      if (key === thisMonthKey && totalMesAtual[p.moeda] != null) totalMesAtual[p.moeda] += valor;
      if (key === prevMonthKey && totalMesAnterior[p.moeda] != null) totalMesAnterior[p.moeda] += valor;
      if (totalBRLporMoeda[p.moeda] != null) totalBRLporMoeda[p.moeda] += Number(p.valor_brl) || 0;
    });

    // KPI cards
    MOEDAS.forEach(m => {
      const valEl = document.getElementById(`kpi-${m.toLowerCase()}-valor`);
      const subEl = document.getElementById(`kpi-${m.toLowerCase()}-sub`);
      const temDados = totalMesAtual[m] > 0;
      if (valEl) {
        valEl.textContent = temDados ? fmtMoeda(totalMesAtual[m], m) : '—';
        valEl.classList.toggle('is-empty', !temDados);
      }
      if (subEl) {
        const anterior = totalMesAnterior[m];
        if (anterior > 0 && temDados) {
          const delta = ((totalMesAtual[m] - anterior) / anterior) * 100;
          subEl.innerHTML = pct(delta);
        } else if (temDados) {
          subEl.textContent = 'sem mês anterior p/ comparar';
        } else {
          subEl.innerHTML = '<span class="kpi-empty">sem movimentação no período</span>';
        }
      }
      // Sparkline com a série real dos últimos 6 meses (zera tudo se não houver dados)
      const data = seriesPorMoeda[m].every(v => v === 0) ? [0, 0, 0, 0, 0, 0] : seriesPorMoeda[m];
      if (window.sparklineSVG) {
        const colors = { USD: '#00CFFF', EUR: '#00D68F', GBP: '#F5A623', CHF: '#9B7AFF' };
        window.sparklineSVG(`spark-${m.toLowerCase()}`, data, colors[m]);
      }
    });

    // Gráfico "Compras por Mês"
    const monthLabels = monthKeys.map(k => {
      const [y, mo] = k.split('-');
      return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo, 10) - 1];
    });
    const title = document.getElementById('dash-mensal-title');
    if (title) title.textContent = `Compras por Mês — ${now.getFullYear()}`;
    const ctxMensal = document.getElementById('chart-mensal')?.getContext('2d');
    if (ctxMensal && typeof Chart !== 'undefined') {
      if (chartMensal) chartMensal.destroy();
      chartMensal = new Chart(ctxMensal, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            { label: 'USD', data: seriesPorMoeda.USD, backgroundColor: 'rgba(0,207,255,0.75)', borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: false },
            { label: 'EUR', data: seriesPorMoeda.EUR, backgroundColor: 'rgba(0,214,143,0.75)', borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: false },
            { label: 'GBP', data: seriesPorMoeda.GBP, backgroundColor: 'rgba(245,166,35,0.75)', borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: false },
            { label: 'CHF', data: seriesPorMoeda.CHF, backgroundColor: 'rgba(155,122,255,0.75)', borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: false }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', backgroundColor: '#0F172A', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(15,23,42,0.1)', borderWidth: 1, padding: 10 } },
          scales: { x: { grid: { display: false }, ticks: { color: '#64748B' } }, y: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#64748B' } } },
          animation: { duration: 600 }
        }
      });
    }

    // Donut "Distribuição por Moeda" (participação em BRL)
    const totalBRL = MOEDAS.reduce((s, m) => s + totalBRLporMoeda[m], 0);
    const ctxDonut = document.getElementById('chart-donut')?.getContext('2d');
    if (ctxDonut && typeof Chart !== 'undefined') {
      if (chartDonut) chartDonut.destroy();
      const dados = totalBRL > 0 ? MOEDAS.map(m => +(totalBRLporMoeda[m] / totalBRL * 100).toFixed(1)) : [0, 0, 0, 0];
      chartDonut = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
          labels: MOEDAS,
          datasets: [{ data: dados, backgroundColor: ['rgba(37,99,235,0.85)', 'rgba(13,150,102,0.85)', 'rgba(185,116,10,0.85)', 'rgba(124,92,224,0.85)'], borderColor: '#fff', borderWidth: 3, hoverOffset: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '70%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#64748B', boxWidth: 10, padding: 14, font: { size: 11 } } },
            tooltip: { backgroundColor: '#0F172A', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(15,23,42,0.1)', borderWidth: 1, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } }
          }
        }
      });
    }

    // Tabela "Últimos Lançamentos"
    const tbody = document.getElementById('tbl-dashboard-recentes');
    if (tbody) {
      const recentes = rows.slice(0, 6);
      if (!recentes.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum lançamento ainda. Use "Novo Lançamento" para registrar o primeiro pedido.</td></tr>`;
      } else {
        tbody.innerHTML = recentes.map(p => {
          const forn = p.fornecedores ? p.fornecedores.razao_social : '—';
          const colab = p.colaboradores ? p.colaboradores.nome : '—';
          const cargo = p.colaboradores ? p.colaboradores.cargo : '';
          const statusCls = STATUS_CLASS[p.status] || 's-pedido-enviado';
          return `
            <tr>
              <td><span class="mono">${p.numero_pedido}</span>${p.numero_pi ? `<div style="font-size:10px;color:var(--ink-3);">📁 ${p.numero_pi}</div>` : ''}</td>
              <td>${forn}</td>
              <td>${p.moeda ? `<span class="currency-tag ${CUR_CLASS[p.moeda]||''}">${p.moeda}</span>` : '—'}</td>
              <td class="mono">${fmtMoeda(p.valor_total, p.moeda)}</td>
              <td style="font-family:var(--ff-mono);font-size:12px;color:var(--ink-2);">—</td>
              <td>${colab}<div style="font-size:9px;color:var(--ink-3);">${cargo}</div></td>
              <td><span class="status-badge ${statusCls}">${p.status}</span></td>
            </tr>`;
        }).join('');
      }
    }
  }

  /* ---------- Relatórios (comparativo anual + top fornecedores) ---------- */
  async function buildReportCharts(anoSelecionado) {
    let rows;
    try {
      rows = await DB.list('pedidos', 'select=valor_brl,valor_total,taxa_cambio,moeda,data_pedido,fornecedor_id,fornecedores(razao_social)&limit=2000');
    } catch (e) {
      console.error('Erro ao carregar relatórios:', e);
      return;
    }

    const now = new Date();
    const anoAtual = anoSelecionado || now.getFullYear(), anoAnterior = anoAtual - 1;

    // Seletor de ano: popula com os anos que realmente têm pedidos (+ o ano
    // corrente do calendário), já que lançamentos retroativos podem cair em
    // qualquer ano — antes era uma lista fixa (2024/2023/2022) que não fazia nada.
    const selectAno = document.getElementById('rel-ano-select');
    if (selectAno) {
      const anosComDados = new Set(rows.filter(p => p.data_pedido).map(p => new Date(p.data_pedido + 'T00:00:00').getFullYear()));
      anosComDados.add(now.getFullYear());
      const anosOrdenados = Array.from(anosComDados).sort((a, b) => b - a);
      const optsHtml = anosOrdenados.map(a => `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`).join('');
      if (selectAno.innerHTML !== optsHtml) selectAno.innerHTML = optsHtml;
      if (!selectAno.dataset.wired) {
        selectAno.addEventListener('change', () => buildReportCharts(parseInt(selectAno.value, 10)));
        selectAno.dataset.wired = '1';
      }
    }
    document.getElementById('rel-ano-atual') && (document.getElementById('rel-ano-atual').textContent = anoAtual);
    document.getElementById('rel-ano-anterior') && (document.getElementById('rel-ano-anterior').textContent = anoAnterior);
    document.getElementById('rel-label-volume') && (document.getElementById('rel-label-volume').textContent = `Volume Total ${anoAtual}`);
    document.getElementById('rel-anual-subtitle') && (document.getElementById('rel-anual-subtitle').textContent = `${anoAnterior} vs ${anoAtual} — por trimestre`);

    const trimestre = (iso) => Math.floor((new Date(iso + 'T00:00:00').getMonth()) / 3);
    const porAno = { [anoAtual]: [0, 0, 0, 0], [anoAnterior]: [0, 0, 0, 0] };
    let volumeAno = 0, volumeAnoAnterior = 0, pedidosAno = 0, pedidosAnoAnterior = 0;
    let somaTaxaUSD = 0, qtdTaxaUSD = 0;
    const fornecedorTotais = {};

    rows.forEach(p => {
      if (!p.data_pedido) return;
      const ano = new Date(p.data_pedido + 'T00:00:00').getFullYear();
      const brl = Number(p.valor_brl) || 0;
      if (ano === anoAtual) {
        porAno[anoAtual][trimestre(p.data_pedido)] += brl;
        volumeAno += brl; pedidosAno++;
        if (p.moeda === 'USD' && p.taxa_cambio) { somaTaxaUSD += Number(p.taxa_cambio); qtdTaxaUSD++; }
        if (p.fornecedor_id) {
          const nome = p.fornecedores ? p.fornecedores.razao_social : 'Sem fornecedor';
          fornecedorTotais[nome] = (fornecedorTotais[nome] || 0) + brl;
        }
      } else if (ano === anoAnterior) {
        porAno[anoAnterior][trimestre(p.data_pedido)] += brl;
        volumeAnoAnterior += brl; pedidosAnoAnterior++;
      }
    });

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setText('rel-volume-total', fmtBRLCompacto(volumeAno));
    setText('rel-num-pedidos', pedidosAno.toLocaleString('pt-BR'));
    setText('rel-cambio-medio', qtdTaxaUSD ? (somaTaxaUSD / qtdTaxaUSD).toFixed(2) : '—');

    function changeLabel(id, atual, anterior) {
      const el = document.getElementById(id);
      if (!el) return;
      if (anterior > 0) {
        const d = ((atual - anterior) / anterior) * 100;
        el.textContent = `${d >= 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)}% vs. ${anoAnterior}`;
        el.style.color = d >= 0 ? 'var(--green)' : 'var(--rose)';
      } else {
        el.textContent = `sem dados de ${anoAnterior}`;
        el.style.color = 'var(--ink-3)';
      }
    }
    changeLabel('rel-volume-change', volumeAno, volumeAnoAnterior);
    changeLabel('rel-pedidos-change', pedidosAno, pedidosAnoAnterior);

    const ctxAnual = document.getElementById('chart-anual')?.getContext('2d');
    if (ctxAnual && typeof Chart !== 'undefined') {
      if (chartAnual) chartAnual.destroy();
      chartAnual = new Chart(ctxAnual, {
        type: 'bar',
        data: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          datasets: [
            { label: String(anoAtual), data: porAno[anoAtual].map(v => +(v / 1e6).toFixed(2)), backgroundColor: 'rgba(37,99,235,0.8)', borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false },
            { label: String(anoAnterior), data: porAno[anoAnterior].map(v => +(v / 1e6).toFixed(2)), backgroundColor: 'rgba(15,23,42,0.14)', borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#64748B', boxWidth: 10 } }, tooltip: { backgroundColor: '#0F172A', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(15,23,42,0.1)', borderWidth: 1 } },
          scales: { x: { grid: { display: false }, ticks: { color: '#64748B' } }, y: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#64748B', callback: v => 'R$' + v + 'M' } } }
        }
      });
    }

    const top5 = Object.entries(fornecedorTotais).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ctxForn = document.getElementById('chart-fornecedores')?.getContext('2d');
    if (ctxForn && typeof Chart !== 'undefined') {
      if (chartFornecedores) chartFornecedores.destroy();
      const cores = ['rgba(37,99,235,0.8)', 'rgba(37,99,235,0.6)', 'rgba(13,150,102,0.8)', 'rgba(185,116,10,0.8)', 'rgba(124,92,224,0.8)'];
      chartFornecedores = new Chart(ctxForn, {
        type: 'bar',
        data: {
          labels: top5.length ? top5.map(f => f[0]) : ['Sem dados'],
          datasets: [{ label: 'Volume (R$M)', data: top5.length ? top5.map(f => +(f[1] / 1e6).toFixed(2)) : [0], backgroundColor: cores, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0F172A', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(15,23,42,0.1)', borderWidth: 1 } },
          scales: { x: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#64748B', callback: v => 'R$' + v + 'M' } }, y: { grid: { display: false }, ticks: { color: '#64748B' } } }
        }
      });
    }

    // Exposto para a exportação de relatórios (PDF/Excel) em js/export.js
    window.REL_DATA = {
      anoAtual, anoAnterior, volumeAno, volumeAnoAnterior, pedidosAno, pedidosAnoAnterior,
      cambioMedioUSD: qtdTaxaUSD ? (somaTaxaUSD / qtdTaxaUSD) : null,
      porAno, top5
    };
  }

  window.renderDashboard = renderDashboard;
  window.buildReportCharts = buildReportCharts;

  if (window.Auth && Auth.isLoggedIn()) renderDashboard();
})();
