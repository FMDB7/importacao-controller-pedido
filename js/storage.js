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

  /* Envia um arquivo para o bucket (via Edge Function — ver comentário em
     js/config.js) e devolve sua URL pública. `pasta` agrupa os arquivos
     (ex.: "pi", "nf", "bl", "cambio"). Exige estar logado: a função do lado
     do servidor confirma o token com o mesmo app_is_authorized() que a RLS
     usa antes de gravar qualquer coisa no bucket. */
  async function upload(file, pasta) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    if (file.size > TAMANHO_MAX) throw new Error('Arquivo maior que 20MB. Escolha um arquivo menor.');
    const token = window.Auth && window.Auth.getToken();
    if (!token) throw new Error('Faça login novamente para enviar anexos.');
    const res = await fetch(`${cfg.STORAGE_GATEWAY_URL}?pasta=${encodeURIComponent(pasta)}&nome=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    });
    let j = null;
    try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((j && j.error) || 'Falha no envio do arquivo.');
    return { path: j.path, url: j.url, nome: file.name };
  }

  /* Remove um arquivo a partir da sua URL pública, também via Edge Function
     (best-effort — se falhar, não bloqueia o fluxo do usuário, só fica um
     arquivo órfão no bucket). */
  async function remove(url) {
    if (!url) return;
    const marcador = `/object/public/${cfg.STORAGE_BUCKET}/`;
    const idx = url.indexOf(marcador);
    if (idx === -1) return;
    const caminho = url.slice(idx + marcador.length);
    const token = window.Auth && window.Auth.getToken();
    if (!token) { console.warn('Sem sessão ativa — não foi possível remover o anexo do storage.'); return; }
    try {
      await fetch(`${cfg.STORAGE_GATEWAY_URL}?caminho=${encodeURIComponent(caminho)}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
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
