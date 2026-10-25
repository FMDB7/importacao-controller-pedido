/* ══════════════════════════════════════════════════════════
   TopImport Pro — Taxas de Câmbio ligadas ao banco (Neon)
   - Exposição em aberto (pedidos com câmbio pendente) por moeda
   - Última taxa aplicada por moeda (histórico em `taxas_cambio`)
   - Ao "Aplicar Taxas": grava histórico + atualiza pedidos pendentes
   ══════════════════════════════════════════════════════════ */
(function () {
  const MOEDAS = [
    { id: 'usd', sigla: 'USD' },
    { id: 'eur', sigla: 'EUR' },
    { id: 'chf', sigla: 'CHF' },
    { id: 'gbp', sigla: 'GBP' },
  ];

  const btnAplicar = document.getElementById('cambio-aplicar');

  function parseTaxa(str) {
    if (!str) return NaN;
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
  }
  function fmtTaxa(v) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  // Máscara de digitação: a pessoa só digita números e o campo formata
  // sozinho (últimos 4 dígitos viram as casas decimais da taxa).
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
  MOEDAS.forEach(m => attachMoneyMask('nova-taxa-' + m.id, 4));

  /* ---------- Carrega quantos pedidos de cada moeda serão afetados ----------
     Antes só contava pedidos com câmbio pendente (taxa_cambio IS NULL). Como a
     taxa já é preenchida logo no lançamento, praticamente nenhum pedido ficava
     "pendente" — por isso "Aplicar Taxas" parecia não fazer nada. Por isso conta
     (e, ao aplicar, recalcula) todos os pedidos da moeda que AINDA NÃO foram
     liquidados — mas nunca um pedido cujo pagamento já está "Liquidado": esse
     câmbio já foi fechado/pago de fato, e sobrescrevê-lo mudaria um valor que
     já saiu da empresa, sem deixar rastro do valor original. Ver
     pedidoElegivel() abaixo — mesmo filtro usado aqui e em "Aplicar Taxas". */
  function pedidoElegivel(p) {
    const pagamentos = p.pagamentos || [];
    return !pagamentos.some(pg => pg.status === 'Liquidado');
  }

  async function carregarExposicao() {
    for (const m of MOEDAS) {
      const inp = document.getElementById('nova-taxa-' + m.id);
      const badge = document.getElementById('inv-' + m.id);
      if (!inp) continue;
      try {
        const rows = await DB.list('pedidos',
          `select=valor_total,pagamentos(status)&moeda=eq.${m.sigla}`);
        const elegiveis = rows.filter(pedidoElegivel);
        const total = elegiveis.reduce((s, r) => s + (parseFloat(r.valor_total) || 0), 0);
        const count = elegiveis.length;
        const liquidados = rows.length - count;
        inp.dataset.total = total.toFixed(2);
        inp.dataset.count = String(count);
        if (badge) {
          badge.textContent = liquidados
            ? `${count} pedido(s) · ${liquidados} já liquidado(s) (não será alterado)`
            : `${count} pedido(s)`;
          badge.classList.toggle('warn', count > 0);
        }
      } catch (e) {
        console.warn('Falha ao carregar exposição de', m.sigla, e.message);
      }
    }
  }

  /* ---------- Carrega a última taxa aplicada por moeda ---------- */
  async function carregarTaxasAtuais() {
    for (const m of MOEDAS) {
      const el = document.getElementById('taxa-atual-' + m.id);
      if (!el) continue;
      try {
        const rows = await DB.list('taxas_cambio',
          `select=taxa_venda,data_cotacao&moeda=eq.${m.sigla}&order=data_cotacao.desc,created_at.desc&limit=1`);
        if (rows.length) {
          el.textContent = fmtTaxa(parseFloat(rows[0].taxa_venda));
          el.classList.remove('is-empty');
        } else {
          el.textContent = '—';
          el.classList.add('is-empty');
        }
      } catch (e) {
        console.warn('Falha ao carregar taxa atual de', m.sigla, e.message);
      }
    }
  }

  async function refreshCambioExposicao() {
    await Promise.all([carregarExposicao(), carregarTaxasAtuais()]);
    if (window.atualizarCambioPreview) window.atualizarCambioPreview();
  }
  window.refreshCambioExposicao = refreshCambioExposicao;

  function toast(titulo, corpo) {
    const t = document.querySelector('.notif-toast');
    if (!t) return;
    t.querySelector('.notif-title').textContent = titulo;
    t.querySelector('.notif-body').textContent = corpo;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* ---------- Aplicar taxas: grava histórico + recalcula pedidos pendentes ---------- */
  btnAplicar?.addEventListener('click', async () => {
    const aplicacoes = MOEDAS
      .map(m => ({ m, taxa: parseTaxa(document.getElementById('nova-taxa-' + m.id)?.value) }))
      .filter(a => !isNaN(a.taxa) && a.taxa > 0);

    if (!aplicacoes.length) {
      toast('⚠️ Nenhuma taxa informada', 'Digite ao menos uma nova taxa para aplicar.');
      return;
    }

    btnAplicar.disabled = true;
    const textoOriginal = btnAplicar.textContent;
    btnAplicar.textContent = 'Aplicando...';

    // Declaradas fora do try para que o catch, em caso de falha no meio do
    // loop, consiga informar exatamente quantos pedidos já tinham sido
    // atualizados — em vez de perder essa contagem junto com o escopo do try.
    let pedidosAtualizados = 0;
    let pedidosMantidos = 0; // já liquidados — não entram no recálculo
    try {
      for (const { m, taxa } of aplicacoes) {
        // 1) grava no histórico de câmbio
        await DB.create('taxas_cambio', {
          moeda: m.sigla, taxa_compra: taxa, taxa_venda: taxa, fonte: 'Manual'
        });

        // 2) recalcula os pedidos dessa moeda com a nova taxa — exceto os que
        //    já têm pagamento "Liquidado" (câmbio já fechado/pago de fato,
        //    não pode ser sobrescrito silenciosamente). Ver pedidoElegivel().
        const todos = await DB.list('pedidos',
          `select=id,valor_total,pagamentos(status)&moeda=eq.${m.sigla}`);
        const pendentes = todos.filter(pedidoElegivel);
        pedidosMantidos += todos.length - pendentes.length;
        for (const p of pendentes) {
          const valorBRL = (parseFloat(p.valor_total) || 0) * taxa;
          await DB.update('pedidos', p.id, { taxa_cambio: taxa, valor_brl: valorBRL });
          pedidosAtualizados++;
        }

        // 3) atualiza o texto "Taxa Atual" na tela
        const el = document.getElementById('taxa-atual-' + m.id);
        if (el) { el.textContent = fmtTaxa(taxa); el.style.color = ''; }
      }

      window.closeCambioModal && window.closeCambioModal();
      const partes = [];
      if (pedidosAtualizados) partes.push(`${pedidosAtualizados} pedido(s) recalculado(s) com a nova cotação`);
      if (pedidosMantidos) partes.push(`${pedidosMantidos} já liquidado(s) mantido(s) sem alteração`);
      toast('💱 Taxas atualizadas!', partes.length ? partes.join(' · ') + '.' : 'Taxas de câmbio registradas no histórico.');

      // Recarrega telas afetadas pelo recálculo de valor_brl / taxa_cambio
      if (window.renderPedidos) window.renderPedidos();
      if (window.renderDashboard) window.renderDashboard();
      if (window.renderOperacionais) window.renderOperacionais();
      if (window.checkNotificacoes) window.checkNotificacoes();
      refreshCambioExposicao();
    } catch (e) {
      const msg = e.message || 'Tente novamente.';
      toast('❌ Erro ao aplicar taxas',
        `${msg} — ${pedidosAtualizados} pedido(s) já foram atualizados com a nova taxa antes da falha; o restante ficou com a taxa anterior. Reabra "Taxas de Câmbio" para tentar de novo.`);
    } finally {
      btnAplicar.disabled = false;
      btnAplicar.textContent = textoOriginal;
    }
  });

  if (window.Auth && Auth.isLoggedIn()) refreshCambioExposicao();
})();
