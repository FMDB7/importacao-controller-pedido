/* ══════════════════════════════════════════════════════════
   TopImport Pro — Exportação para Excel (.xlsx) e PDF
   - Tabelas operacionais (Pedidos, Faturamento, Embarque, Pagamento):
     exporta pra Excel exatamente as linhas visíveis em tela (respeita
     filtros). Pedidos e Faturamento também exportam pra PDF (tabela
     em paisagem, mesmas linhas visíveis).
   - Relatório da Diretoria: PDF com KPIs + comparativo anual + top
     fornecedores, e Excel com as mesmas duas tabelas.
   ══════════════════════════════════════════════════════════ */
(function () {

  function hoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function avisar(msg) {
    const t = document.querySelector('.notif-toast');
    if (t) {
      t.querySelector('.notif-title').textContent = '⚠️ Exportação';
      t.querySelector('.notif-body').textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 4000);
    } else {
      alert(msg);
    }
  }

  // Lê "R$ 16.281,24", "€2.760,00", "2.400 pçs", "5,8990" etc. (formato
  // pt-BR, com símbolo/sufixo opcional) e devolve o Number equivalente, ou
  // null se a célula não for numérica (ex.: "—", texto, datas).
  function parseNumeroBR(texto) {
    if (!texto) return null;
    const m = String(texto).match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  const CUR_SYM = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' };
  function fmtMoedaResumo(n, moeda) {
    return (CUR_SYM[moeda] || '') + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtBRLResumo(n) {
    return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* Resumo por moeda das linhas visíveis em tela (respeita filtro) de uma
     tabela — usa os data-moeda/data-valor(-nativo) já gravados em cada
     <tr> (Pedidos e Faturamento), em vez de re-parsear o texto formatado
     das células. data-valor é sempre o equivalente em BRL (valor_brl, já
     calculado por pedido/invoice com a taxa de câmbio de cada um); soma
     isso é o jeito certo de chegar no total em reais — bem diferente de
     somar os valores nativos de moedas diferentes entre si. */
  function resumoPorMoeda(tableSelector) {
    const table = document.querySelector(tableSelector);
    if (!table) return null;
    const linhas = Array.from(table.querySelectorAll('tbody tr')).filter(tr => {
      if (tr.style.display === 'none') return false;
      if (tr.querySelector('td[colspan]')) return false;
      return true;
    });
    const porMoeda = {};
    let totalBRL = 0;
    linhas.forEach(tr => {
      const moeda = tr.dataset.moeda || '—';
      const nativo = parseFloat(tr.dataset.valorNativo) || 0;
      const brl = parseFloat(tr.dataset.valor) || 0;
      if (!porMoeda[moeda]) porMoeda[moeda] = { nativo: 0, brl: 0, qtd: 0 };
      porMoeda[moeda].nativo += nativo;
      porMoeda[moeda].brl += brl;
      porMoeda[moeda].qtd++;
      totalBRL += brl;
    });
    const moedas = Object.keys(porMoeda).sort();
    if (!moedas.length) return null;
    return { porMoeda, moedas, totalBRL, totalRegistros: linhas.length };
  }

  /* Lê uma tabela HTML renderizada e devolve o cabeçalho, os dados (AOA) e
     o alinhamento de cada coluna (a partir das classes ta-c/ta-r já usadas
     nos <th> pra alinhar a própria tela), ignorando linhas ocultas por
     filtro (display:none) e a última coluna (sempre a de ações ✏️/🗑️,
     sem valor para exportar). */
  function tabelaParaAOA(tableSelector, excluirColunas) {
    const table = document.querySelector(tableSelector);
    if (!table) return null;
    const headCells = Array.from(table.querySelectorAll('thead tr th'));
    const headersTodos = headCells.slice(0, -1).map(th => th.textContent.trim());
    const alinhamentosTodos = headCells.slice(0, -1).map(th =>
      th.classList.contains('ta-r') ? 'right' : th.classList.contains('ta-c') ? 'center' : 'left');
    // Índices (dentro das colunas já sem a de ações) a remover do export —
    // ex.: Status na Faturamento, pedido pela Diretoria pra não sair no
    // relatório impresso (continua normalmente na tela).
    const idxExcluir = new Set(
      (excluirColunas || []).map(nome => headersTodos.indexOf(nome)).filter(i => i >= 0)
    );
    const headers = headersTodos.filter((_, i) => !idxExcluir.has(i));
    const alinhamentos = alinhamentosTodos.filter((_, i) => !idxExcluir.has(i));
    const linhas = Array.from(table.querySelectorAll('tbody tr')).filter(tr => {
      if (tr.style.display === 'none') return false;
      if (tr.querySelector('td[colspan]')) return false; // "Carregando..." / "Nenhum registro"
      return true;
    });
    // Emojis decorativos (ex.: 📁 antes do nº da pasta, ⚠ antes de uma data,
    // 📎 ao lado de um link de anexo) viram caracteres ilegíveis no PDF —
    // o jsPDF usa uma fonte sem esses glifos (ex.: "📁" virou "Ø=ÜÁ"). O
    // Excel não quebra, mas o emoji também não acrescenta nada numa
    // planilha. Removemos qualquer emoji do texto exportado; se a célula
    // for só o emoji (ex.: ícone de modal de transporte sem texto), mantém
    // o conteúdo original em vez de exportar a célula vazia.
    const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}️]/gu;
    const dados = linhas.map(tr => {
      const tds = Array.from(tr.children).slice(0, -1).filter((_, i) => !idxExcluir.has(i));
      return tds.map(td => {
        const bruto = td.textContent.replace(/\s+/g, ' ').trim();
        const semEmoji = bruto.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
        return semEmoji || bruto;
      });
    });
    return { aoa: [headers, ...dados], alinhamentos };
  }

  // Monta a aba "Resumo por Moeda" em AOA — total nativo e em BRL por moeda,
  // já como número de verdade (alinha à direita/soma sozinho no Excel).
  function resumoParaAOA(resumo) {
    const aoa = [['Moeda', 'Qtde', 'Total (moeda)', 'Total (R$)', '% do total']];
    resumo.moedas.forEach(m => {
      const r = resumo.porMoeda[m];
      const pct = resumo.totalBRL > 0 ? +(r.brl / resumo.totalBRL * 100).toFixed(1) : 0;
      aoa.push([m, r.qtd, +r.nativo.toFixed(2), +r.brl.toFixed(2), pct]);
    });
    aoa.push(['Total geral', resumo.totalRegistros, '', +resumo.totalBRL.toFixed(2), 100]);
    return aoa;
  }

  function exportarXLSX(tableSelector, nomeArquivo, nomeAba, excluirColunas, comResumo) {
    if (typeof XLSX === 'undefined') { avisar('Biblioteca de exportação não carregou. Verifique sua conexão e tente novamente.'); return; }
    const resultado = tabelaParaAOA(tableSelector, excluirColunas);
    if (!resultado || resultado.aoa.length <= 1) { avisar('Não há dados para exportar nesta tela.'); return; }
    const { aoa, alinhamentos } = resultado;
    // Coluna numérica (alinhada à direita na tela, ex.: Valor/Taxa/Total):
    // grava como número de verdade na planilha, não como texto — é isso que
    // faz o Excel alinhar a coluna à direita e tratar como número de fato
    // (soma/ordena), em vez de ficar torto à esquerda junto do texto.
    const aoaExcel = [aoa[0], ...aoa.slice(1).map(linha => linha.map((val, i) => {
      if (alinhamentos[i] !== 'right') return val;
      const n = parseNumeroBR(val);
      return n != null ? n : val;
    }))];
    const ws = XLSX.utils.aoa_to_sheet(aoaExcel);
    ws['!cols'] = aoaExcel[0].map((_, i) => ({ wch: Math.max(12, ...aoaExcel.map(r => String(r[i] ?? '').length)) + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    if (comResumo) {
      const resumo = resumoPorMoeda(tableSelector);
      if (resumo) {
        const aoaResumo = resumoParaAOA(resumo);
        const wsResumo = XLSX.utils.aoa_to_sheet(aoaResumo);
        wsResumo['!cols'] = aoaResumo[0].map((_, i) => ({ wch: Math.max(12, ...aoaResumo.map(r => String(r[i] ?? '').length)) + 2 }));
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por Moeda');
      }
    }
    XLSX.writeFile(wb, nomeArquivo);
  }

  document.getElementById('btn-export-pedidos')?.addEventListener('click',
    () => exportarXLSX('#view-lancamentos table', `Pedidos_${hoje()}.xlsx`, 'Pedidos', null, true));
  document.getElementById('btn-export-faturamento')?.addEventListener('click',
    () => exportarXLSX('#view-faturamento table', `Faturamento_${hoje()}.xlsx`, 'Faturamento', ['Status'], true));
  document.getElementById('btn-export-embarque')?.addEventListener('click',
    () => exportarXLSX('#view-embarque table', `Embarque_${hoje()}.xlsx`, 'Embarque'));
  document.getElementById('btn-export-pagamento')?.addEventListener('click',
    () => exportarXLSX('#view-pagamento table', `Pagamento_${hoje()}.xlsx`, 'Pagamento'));

  /* Exporta uma tabela operacional pra PDF (paisagem, 1 página larga) —
     mesmas linhas visíveis em tela (respeita filtros), igual ao Excel acima. */
  function exportarPDF(tableSelector, titulo, nomeArquivo, excluirColunas, comResumo) {
    if (typeof window.jspdf === 'undefined') { avisar('Biblioteca de exportação de PDF não carregou. Verifique sua conexão e tente novamente.'); return; }
    const resultado = tabelaParaAOA(tableSelector, excluirColunas);
    if (!resultado || resultado.aoa.length <= 1) { avisar('Não há dados para exportar nesta tela.'); return; }
    const { aoa, alinhamentos } = resultado;
    // Mesmo alinhamento de cada coluna que já é usado na tela (ta-c/ta-r nos
    // <th>) — sem isso o autoTable alinha tudo à esquerda por padrão, e uma
    // coluna de valores com tamanhos diferentes (R$ 16.281,24 / R$ 639.032,85)
    // fica com os dígitos tortos, sem "bater" uma linha embaixo da outra.
    const columnStyles = {};
    alinhamentos.forEach((al, i) => { if (al !== 'left') columnStyles[i] = { halign: al }; });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margemX = 10;
    let y = 14;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('Importação - Controller Pedido', margemX, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(titulo, margemX, y);
    y += 5;
    doc.setFontSize(8); doc.setTextColor(120);
    const nReg = aoa.length - 1;
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} · ${nReg} registro${nReg === 1 ? '' : 's'}`, margemX, y);
    doc.setTextColor(0);
    y += 5;

    doc.autoTable({
      startY: y,
      margin: { left: margemX, right: margemX },
      head: [aoa[0]],
      body: aoa.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [13, 27, 46], fontSize: 7 },
      styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
      columnStyles,
      // headStyles tem prioridade sobre columnStyles na seção do cabeçalho
      // nesta versão do autoTable — sem isso o título da coluna fica preso
      // à esquerda mesmo com os dados da coluna alinhados à direita/centro
      // logo abaixo. didParseCell roda pra head e body e força o mesmo
      // alinhamento nas duas seções, coluna por coluna.
      didParseCell: (data) => {
        const al = alinhamentos[data.column.index];
        if (al && al !== 'left') data.cell.styles.halign = al;
      },
      tableWidth: 'auto'
    });

    if (comResumo) {
      const resumo = resumoPorMoeda(tableSelector);
      if (resumo) {
        let yResumo = doc.lastAutoTable.finalY + 8;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text('Resumo por Moeda', margemX, yResumo);
        yResumo += 2;
        const corpoResumo = resumo.moedas.map(m => {
          const r = resumo.porMoeda[m];
          const pct = resumo.totalBRL > 0 ? (r.brl / resumo.totalBRL * 100) : 0;
          return [m, String(r.qtd), fmtMoedaResumo(r.nativo, m), fmtBRLResumo(r.brl), `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`];
        });
        corpoResumo.push(['Total geral', String(resumo.totalRegistros), '', fmtBRLResumo(resumo.totalBRL), '100%']);
        doc.autoTable({
          startY: yResumo,
          margin: { left: margemX, right: margemX },
          head: [['Moeda', 'Qtde', 'Total (moeda)', 'Total (R$)', '% do total']],
          body: corpoResumo,
          theme: 'grid',
          headStyles: { fillColor: [13, 27, 46], fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 2 },
          tableWidth: 'wrap',
          didParseCell: (data) => {
            // Última linha (Total geral) em negrito, pra destacar do resumo por moeda acima
            if (data.section === 'body' && data.row.index === corpoResumo.length - 1) data.cell.styles.fontStyle = 'bold';
            if (data.column.index > 0) data.cell.styles.halign = 'right';
          }
        });
      }
    }

    doc.save(nomeArquivo);
  }

  document.getElementById('btn-export-pedidos-pdf')?.addEventListener('click',
    () => exportarPDF('#view-lancamentos table', 'Pedidos', `Pedidos_${hoje()}.pdf`, null, true));
  document.getElementById('btn-export-faturamento-pdf')?.addEventListener('click',
    () => exportarPDF('#view-faturamento table', 'Faturamento', `Faturamento_${hoje()}.pdf`, ['Status'], true));

  /* ---------- Relatório da Diretoria ---------- */
  // headStyles tem prioridade sobre columnStyles na seção do cabeçalho nesta
  // versão do autoTable (mesmo problema das tabelas operacionais acima) —
  // devolve um didParseCell que força a direita tanto no título da coluna
  // quanto nos valores logo abaixo, pros índices de coluna informados.
  function alinharDireita(indices) {
    return (data) => { if (indices.includes(data.column.index)) data.cell.styles.halign = 'right'; };
  }

  function fmtBRL(n) {
    n = Number(n) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function montarResumoRelatorio() {
    const d = window.REL_DATA;
    if (!d) return null;
    const trimestres = ['Q1', 'Q2', 'Q3', 'Q4'];
    const linhasTrimestre = trimestres.map((t, i) => [
      t, fmtBRL(d.porAno[d.anoAnterior][i]), fmtBRL(d.porAno[d.anoAtual][i])
    ]);
    const linhasFornecedores = (d.top5 && d.top5.length)
      ? d.top5.map(([nome, valor]) => [nome, fmtBRL(valor)])
      : [['Sem dados', '—']];
    return { d, linhasTrimestre, linhasFornecedores };
  }

  document.getElementById('btn-export-relatorio-pdf')?.addEventListener('click', () => {
    if (typeof window.jspdf === 'undefined') { avisar('Biblioteca de exportação de PDF não carregou. Verifique sua conexão e tente novamente.'); return; }
    const resumo = montarResumoRelatorio();
    if (!resumo) { avisar('Abra a tela de Relatórios e aguarde os dados carregarem antes de exportar.'); return; }
    const { d, linhasTrimestre, linhasFornecedores } = resumo;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margemX = 14;
    let y = 18;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Importação - Controller Pedido', margemX, y);
    y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text('Relatório para a Diretoria — Grupo Top Internacional Ltda', margemX, y);
    y += 6;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margemX, y);
    doc.setTextColor(0);
    y += 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(`Indicadores — ${d.anoAtual}`, margemX, y);
    y += 2;
    doc.autoTable({
      startY: y,
      margin: { left: margemX },
      head: [['Indicador', `${d.anoAtual}`, `${d.anoAnterior}`, 'Variação']],
      body: [
        ['Volume total', fmtBRL(d.volumeAno), fmtBRL(d.volumeAnoAnterior),
          d.volumeAnoAnterior > 0 ? `${(((d.volumeAno - d.volumeAnoAnterior) / d.volumeAnoAnterior) * 100).toFixed(1)}%` : '—'],
        ['Nº de pedidos', String(d.pedidosAno), String(d.pedidosAnoAnterior),
          d.pedidosAnoAnterior > 0 ? `${(((d.pedidosAno - d.pedidosAnoAnterior) / d.pedidosAnoAnterior) * 100).toFixed(1)}%` : '—'],
        ['Câmbio médio USD', d.cambioMedioUSD ? d.cambioMedioUSD.toFixed(4) : '—', '—', '—']
      ],
      theme: 'grid', headStyles: { fillColor: [13, 27, 46] }, styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: alinharDireita([1, 2, 3])
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Comparativo por trimestre (Volume em R$)', margemX, y);
    y += 2;
    doc.autoTable({
      startY: y,
      margin: { left: margemX },
      head: [['Trimestre', String(d.anoAnterior), String(d.anoAtual)]],
      body: linhasTrimestre,
      theme: 'grid', headStyles: { fillColor: [13, 27, 46] }, styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: alinharDireita([1, 2])
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(`Top 5 Fornecedores — ${d.anoAtual}`, margemX, y);
    y += 2;
    doc.autoTable({
      startY: y,
      margin: { left: margemX },
      head: [['Fornecedor', 'Volume']],
      body: linhasFornecedores,
      theme: 'grid', headStyles: { fillColor: [13, 27, 46] }, styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: alinharDireita([1])
    });

    doc.save(`Relatorio_Diretoria_${hoje()}.pdf`);
  });

  document.getElementById('btn-export-relatorio-xlsx')?.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { avisar('Biblioteca de exportação não carregou. Verifique sua conexão e tente novamente.'); return; }
    const resumo = montarResumoRelatorio();
    if (!resumo) { avisar('Abra a tela de Relatórios e aguarde os dados carregarem antes de exportar.'); return; }
    const { d, linhasTrimestre, linhasFornecedores } = resumo;

    const wb = XLSX.utils.book_new();
    const aoaIndicadores = [
      ['Indicador', String(d.anoAtual), String(d.anoAnterior)],
      ['Volume total', d.volumeAno, d.volumeAnoAnterior],
      ['Nº de pedidos', d.pedidosAno, d.pedidosAnoAnterior],
      ['Câmbio médio USD', d.cambioMedioUSD || '', '']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaIndicadores), 'Indicadores');

    const aoaTrimestre = [['Trimestre', String(d.anoAnterior), String(d.anoAtual)],
      ...d.porAno[d.anoAtual].map((v, i) => [`Q${i+1}`, d.porAno[d.anoAnterior][i], v])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaTrimestre), 'Comparativo Trimestral');

    const aoaForn = [['Fornecedor', 'Volume (R$)'], ...(d.top5 && d.top5.length ? d.top5 : [['Sem dados', 0]])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaForn), 'Top Fornecedores');

    XLSX.writeFile(wb, `Relatorio_Diretoria_${hoje()}.xlsx`);
  });
})();
