/* ══════════════════════════════════════════════════════════
   TopImport Pro — Paginação genérica para tabelas
   Qualquer tabela com <tbody id="..."> pode ser paginada chamando
   Paginacao.paginar('tbl-id') depois de (re)renderizar as linhas ou
   aplicar um filtro. Mostra 15 linhas por página e cria os controles
   de navegação (‹ 1 2 3 ›) automaticamente, inseridos após a <table>.

   Importante: a paginação NUNCA interfere nos filtros existentes.
   - Filtros continuam escondendo linhas via `tr.style.display = 'none'`
     (inalterado — é nisso que a Exportação também se baseia para saber
     quais linhas exportar).
   - A paginação usa uma classe CSS própria (`.pg-hide`, com
     `display:none!important`) só para esconder linhas que estão FORA
     da página atual, dentro do conjunto que já passou pelo filtro.
   Assim, exportar continua trazendo TODAS as linhas filtradas (de
   todas as páginas), e a paginação é puramente visual.
   ══════════════════════════════════════════════════════════ */
(function () {
  const PAGE_SIZE = 15;
  const estadoPagina = {}; // tbodyId -> página atual

  function linhasDeDados(tbody) {
    // Ignora linhas de placeholder ("Carregando...", "Nenhum registro",
    // mensagens de erro) — todas usam um único <td colspan="...">.
    return Array.from(tbody.children).filter(tr => tr.tagName === 'TR' && !tr.querySelector('td[colspan]'));
  }

  function linhasVisiveisPeloFiltro(todas) {
    // Uma linha escondida por filtro tem display:none inline; linhas sem
    // filtro aplicado (ou que passaram) ficam com display normal.
    return todas.filter(tr => tr.style.display !== 'none');
  }

  function getOuCriarPager(tbody) {
    const table = tbody.closest('table');
    if (!table) return null;
    let pager = table.nextElementSibling;
    if (!pager || !pager.classList.contains('pg-pager')) {
      pager = document.createElement('div');
      pager.className = 'pg-pager';
      table.insertAdjacentElement('afterend', pager);
    }
    return pager;
  }

  function renderPager(pager, tbodyId, paginaAtual, totalPaginas, totalRegistros) {
    if (totalPaginas <= 1) { pager.innerHTML = ''; return; }

    // Com muitas páginas, mostra só uma janela em torno da página atual
    // para não estourar a largura do card.
    const janela = 2;
    let ini = Math.max(1, paginaAtual - janela);
    let fim = Math.min(totalPaginas, paginaAtual + janela);
    if (paginaAtual - ini < janela) fim = Math.min(totalPaginas, fim + (janela - (paginaAtual - ini)));
    if (fim - paginaAtual < janela) ini = Math.max(1, ini - (janela - (fim - paginaAtual)));

    let html = `<button type="button" class="pg-btn" data-pg-nav="prev" ${paginaAtual === 1 ? 'disabled' : ''}>‹</button>`;
    if (ini > 1) {
      html += `<button type="button" class="pg-btn" data-pg-nav="1">1</button>`;
      if (ini > 2) html += `<span class="pg-dots">…</span>`;
    }
    for (let i = ini; i <= fim; i++) {
      html += `<button type="button" class="pg-btn ${i === paginaAtual ? 'active' : ''}" data-pg-nav="${i}">${i}</button>`;
    }
    if (fim < totalPaginas) {
      if (fim < totalPaginas - 1) html += `<span class="pg-dots">…</span>`;
      html += `<button type="button" class="pg-btn" data-pg-nav="${totalPaginas}">${totalPaginas}</button>`;
    }
    html += `<button type="button" class="pg-btn" data-pg-nav="next" ${paginaAtual === totalPaginas ? 'disabled' : ''}>›</button>`;
    html += `<span class="pg-info">${totalRegistros} registro${totalRegistros === 1 ? '' : 's'} · página ${paginaAtual} de ${totalPaginas}</span>`;
    pager.innerHTML = html;

    pager.querySelectorAll('[data-pg-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.pgNav;
        let destino;
        if (nav === 'prev') destino = paginaAtual - 1;
        else if (nav === 'next') destino = paginaAtual + 1;
        else destino = parseInt(nav, 10);
        paginar(tbodyId, { pagina: destino });
      });
    });
  }

  /* opts.reset = true  → volta para a página 1 (usado quando um filtro muda)
     opts.pagina = N    → vai direto para a página N (usado pelos botões do pager) */
  function paginar(tbodyId, opts) {
    opts = opts || {};
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const todas = linhasDeDados(tbody);
    const visiveis = linhasVisiveisPeloFiltro(todas);
    const total = visiveis.length;
    const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (opts.pagina) estadoPagina[tbodyId] = opts.pagina;
    else if (opts.reset || !estadoPagina[tbodyId]) estadoPagina[tbodyId] = 1;
    if (estadoPagina[tbodyId] > totalPaginas) estadoPagina[tbodyId] = totalPaginas;
    if (estadoPagina[tbodyId] < 1) estadoPagina[tbodyId] = 1;
    const pagina = estadoPagina[tbodyId];

    const ini = (pagina - 1) * PAGE_SIZE;
    const fim = ini + PAGE_SIZE;
    const janelaAtual = new Set(visiveis.slice(ini, fim));

    todas.forEach(tr => tr.classList.toggle('pg-hide', visiveis.includes(tr) && !janelaAtual.has(tr)));

    const pager = getOuCriarPager(tbody);
    if (pager) renderPager(pager, tbodyId, pagina, totalPaginas, total);
  }

  function resetar(tbodyId) { estadoPagina[tbodyId] = 1; }

  window.Paginacao = { paginar, resetar, PAGE_SIZE };
})();
