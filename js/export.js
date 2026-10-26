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

  /* Lê uma tabela HTML renderizada e devolve um array-de-arrays (AOA),
     ignorando linhas ocultas por filtro (display:none) e a última coluna
     (sempre a de ações ✏️/🗑️, sem valor para exportar). */
  function tabelaParaAOA(tableSelector, excluirColunas) {
    const table = document.querySelector(tableSelector);
    if (!table) return null;
    const headCells = Array.from(table.querySelectorAll('thead tr th'));
    const headersTodos = headCells.slice(0, -1).map(th => th.textContent.trim());
    // Índices (dentro das colunas já sem a de ações) a remover do export —
    // ex.: Status na Faturamento, pedido pela Diretoria pra não sair no
    // relatório impresso (continua normalmente na tela).
    const idxExcluir = new Set(
      (excluirColunas || []).map(nome => headersTodos.indexOf(nome)).filter(i => i >= 0)
    );
    const headers = headersTodos.filter((_, i) => !idxExcluir.has(i));
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
    return [headers, ...dados];
  }

  function exportarXLSX(tableSelector, nomeArquivo, nomeAba, excluirColunas) {
    if (typeof XLSX === 'undefined') { avisar('Biblioteca de exportação não carregou. Verifique sua conexão e tente novamente.'); return; }
    const aoa = tabelaParaAOA(tableSelector, excluirColunas);
    if (!aoa || aoa.length <= 1) { avisar('Não há dados para exportar nesta tela.'); return; }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = aoa[0].map((_, i) => ({ wch: Math.max(12, ...aoa.map(r => String(r[i] ?? '').length)) + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    XLSX.writeFile(wb, nomeArquivo);
  }

  document.getElementById('btn-export-pedidos')?.addEventListener('click',
    () => exportarXLSX('#view-lancamentos table', `Pedidos_${hoje()}.xlsx`, 'Pedidos'));
  document.getElementById('btn-export-faturamento')?.addEventListener('click',
    () => exportarXLSX('#view-faturamento table', `Faturamento_${hoje()}.xlsx`, 'Faturamento', ['Status']));
  document.getElementById('btn-export-embarque')?.addEventListener('click',
    () => exportarXLSX('#view-embarque table', `Embarque_${hoje()}.xlsx`, 'Embarque'));
  document.getElementById('btn-export-pagamento')?.addEventListener('click',
    () => exportarXLSX('#view-pagamento table', `Pagamento_${hoje()}.xlsx`, 'Pagamento'));

  /* Exporta uma tabela operacional pra PDF (paisagem, 1 página larga) —
     mesmas linhas visíveis em tela (respeita filtros), igual ao Excel acima. */
  function exportarPDF(tableSelector, titulo, nomeArquivo, excluirColunas) {
    if (typeof window.jspdf === 'undefined') { avisar('Biblioteca de exportação de PDF não carregou. Verifique sua conexão e tente novamente.'); return; }
    const aoa = tabelaParaAOA(tableSelector, excluirColunas);
    if (!aoa || aoa.length <= 1) { avisar('Não há dados para exportar nesta tela.'); return; }

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
      tableWidth: 'auto'
    });

    doc.save(nomeArquivo);
  }

  document.getElementById('btn-export-pedidos-pdf')?.addEventListener('click',
    () => exportarPDF('#view-lancamentos table', 'Pedidos', `Pedidos_${hoje()}.pdf`));
  document.getElementById('btn-export-faturamento-pdf')?.addEventListener('click',
    () => exportarPDF('#view-faturamento table', 'Faturamento', `Faturamento_${hoje()}.pdf`, ['Status']));

  /* ---------- Relatório da Diretoria ---------- */
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
      theme: 'grid', headStyles: { fillColor: [13, 27, 46] }, styles: { fontSize: 9 }
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
      theme: 'grid', headStyles: { fillColor: [13, 27, 46] }, styles: { fontSize: 9 }
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
      theme: 'grid', headStyles: { fillColor: [13, 27, 46] }, styles: { fontSize: 9 }
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
