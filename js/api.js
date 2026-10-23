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

  /* Sessão expirada (JWT vencido) é tratada à parte de qualquer outro erro:
     em vez de deixar a mensagem crua do Postgres/PostgREST aparecer dentro
     de tabelas (ex. "JWT token has expired (exp=...)") e deixar partes do
     app com permissão/visibilidade indefinida (ex. aba "Usuários" some
     porque a checagem de admin também falhou silenciosamente), detectamos
     o caso e levamos a pessoa de volta pra tela de login com um aviso claro. */
  function isAuthError(status, msg) {
    if (status === 401 || status === 403) return true;
    return /jwt/i.test(msg || '') && /(expired|expirado|invalid)/i.test(msg || '');
  }

  let sessaoExpiradaTratada = false;
  function tratarSessaoExpirada() {
    if (sessaoExpiradaTratada) return;
    sessaoExpiradaTratada = true;
    if (window.Auth) window.Auth.signOut(false); // limpa o token sem recarregar a página
    const overlay = document.getElementById('login-overlay');
    const errEl = document.getElementById('login-error');
    if (overlay) overlay.classList.remove('hidden');
    if (errEl) errEl.textContent = 'Sua sessão expirou. Faça login novamente com a Microsoft.';
    const msBtn = document.getElementById('login-microsoft');
    if (msBtn) msBtn.disabled = false;
  }

  async function handle(res) {
    if (!res.ok) {
      let msg = 'Erro ao comunicar com o banco de dados';
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch (e) {}
      if (isAuthError(res.status, msg)) {
        tratarSessaoExpirada();
        throw new Error('Sessão expirada. Faça login novamente.');
      }
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

  /* Remove em massa por filtro PostgREST, ex. "email=eq.foo@bar.com" —
     usado quando não há um único id (ex.: usuarios_permitidos, chave é o e-mail). */
  async function removeWhere(table, query) {
    const res = await fetch(`${cfg.DATA_API_URL}/${table}?${query}`, {
      method: 'DELETE', headers: authHeaders()
    });
    return handle(res);
  }

  /* Chama uma função do banco exposta pela Data API (PostgREST) em /rpc/<nome>.
     Usado para operações que não são um CRUD simples de tabela, ex. app_me(). */
  async function rpc(fn, params) {
    const res = await fetch(`${cfg.DATA_API_URL}/rpc/${fn}`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(params || {})
    });
    return handle(res);
  }

  window.DB = { list, create, update, remove, updateWhere, removeWhere, rpc };
})();
