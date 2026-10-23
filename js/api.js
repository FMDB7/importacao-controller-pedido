/* ══════════════════════════════════════════════════════════
   TopImport Pro — Cliente de dados (Neon Data API / PostgREST)
   CRUD genérico por tabela. Exige usuário autenticado (RLS).
   Uso: await DB.list('fornecedores')
        await DB.create('fornecedores', {razao_social:'...'})
        await DB.update('fornecedores', id, {ativo:false})
        await DB.remove('fornecedores', id)
   ══════════════════════════════════════════════════════════ */
(function () {
  const cfg = window.TOPIMPORT_CONFIG;

  function authHeaders() {
    const token = window.Auth && window.Auth.getToken();
    const h = { 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  async function handle(res) {
    if (!res.ok) {
      let msg = 'Erro ao comunicar com o banco de dados';
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function list(table, query) {
    const qs = query ? ('?' + query) : '?order=created_at.desc';
    const res = await fetch(`${cfg.DATA_API_URL}/${table}${qs}`, { headers: authHeaders() });
    return handle(res);
  }

  async function create(table, payload) {
    const res = await fetch(`${cfg.DATA_API_URL}/${table}`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
    });
    const data = await handle(res);
    return Array.isArray(data) ? data[0] : data;
  }

  async function update(table, id, payload) {
    const res = await fetch(`${cfg.DATA_API_URL}/${table}?id=eq.${id}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload)
    });
    const data = await handle(res);
    return Array.isArray(data) ? data[0] : data;
  }

  async function remove(table, id) {
    const res = await fetch(`${cfg.DATA_API_URL}/${table}?id=eq.${id}`, {
      method: 'DELETE', headers: authHeaders()
    });
    return handle(res);
  }

  /* Atualiza em massa: `query` é um filtro PostgREST completo, ex.
     "moeda=eq.USD&taxa_cambio=is.null" — usado quando não há um único id. */
  async function updateWhere(table, query, payload) {
    const res = await fetch(`${cfg.DATA_API_URL}/${table}?${query}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload)
    });
    return handle(res);
  }

  window.DB = { list, create, update, remove, updateWhere };
})();
