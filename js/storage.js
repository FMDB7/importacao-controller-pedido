/* ══════════════════════════════════════════════════════════
   TopImport Pro — Upload de anexos (Supabase Storage)
   Usado só para arquivos (PI, NF, BL, comprovantes de câmbio).
   Os dados do app continuam inteiramente no Neon — isto é
   complementar, para guardar o arquivo em si e sua URL pública.
   ══════════════════════════════════════════════════════════ */
(function () {
  const cfg = window.TOPIMPORT_CONFIG;
  const TAMANHO_MAX = 20 * 1024 * 1024; // 20MB, mesmo limite configurado no bucket

  function slugify(nome) {
    return nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9.\-]+/g, '_').slice(-80);
  }

  /* Envia um arquivo para o bucket e devolve sua URL pública.
     `pasta` agrupa os arquivos (ex.: "pi", "nf", "bl", "cambio"). */
  async function upload(file, pasta) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    if (file.size > TAMANHO_MAX) throw new Error('Arquivo maior que 20MB. Escolha um arquivo menor.');
    const caminho = `${pasta}/${Date.now()}_${slugify(file.name)}`;
    const res = await fetch(`${cfg.STORAGE_URL}/storage/v1/object/${cfg.STORAGE_BUCKET}/${caminho}`, {
      method: 'POST',
      headers: {
        'apikey': cfg.STORAGE_ANON_KEY,
        'Authorization': 'Bearer ' + cfg.STORAGE_ANON_KEY,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: file
    });
    if (!res.ok) {
      let msg = 'Falha no envio do arquivo.';
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return {
      path: caminho,
      url: `${cfg.STORAGE_URL}/storage/v1/object/public/${cfg.STORAGE_BUCKET}/${caminho}`,
      nome: file.name
    };
  }

  /* Remove um arquivo a partir da sua URL pública (best-effort — se falhar,
     não bloqueia o fluxo do usuário, só fica um arquivo órfão no bucket). */
  async function remove(url) {
    if (!url) return;
    const marcador = `/object/public/${cfg.STORAGE_BUCKET}/`;
    const idx = url.indexOf(marcador);
    if (idx === -1) return;
    const caminho = url.slice(idx + marcador.length);
    try {
      await fetch(`${cfg.STORAGE_URL}/storage/v1/object/${cfg.STORAGE_BUCKET}/${caminho}`, {
        method: 'DELETE',
        headers: { 'apikey': cfg.STORAGE_ANON_KEY, 'Authorization': 'Bearer ' + cfg.STORAGE_ANON_KEY }
      });
    } catch (e) { console.warn('Falha ao remover anexo do storage:', e.message); }
  }

  function nomeArquivo(url) {
    if (!url) return '';
    const semQuery = url.split('?')[0];
    const base = semQuery.split('/').pop() || '';
    return base.replace(/^\d+_/, '');
  }

  window.Storage = { upload, remove, nomeArquivo };
})();
