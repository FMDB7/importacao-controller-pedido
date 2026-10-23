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

  /* Um access token (JWT) do Stack Auth dura só algumas horas. Em vez de
     deslogar a pessoa no meio do uso (o que acontecia antes depois de um
     período de sessão ativa), toda requisição que volta com erro de
     autenticação tenta renovar o token silenciosamente com o refresh_token
     guardado no login (ver Auth.refreshAccessToken em js/auth.js) e repete
     a chamada uma única vez — sem a pessoa perceber. Só se essa renovação
     falhar (refresh_token também inválido/revogado) é que a sessão é
     considerada de fato expirada, aí sim levamos a pessoa de volta pra
     tela de login com um aviso claro, em vez de deixar a mensagem crua do
     banco ("JWT token has expired...") vazar nas tabelas e partes do app
     (como a aba "Usuários") ficarem com visibilidade indefinida por causa
     de uma checagem que falhou sem avisar.

     Importante: o JWT expirado NÃO vem sempre com HTTP 401/403 — a RLS
     deste app valida o token dentro de funções SQL (app_is_authorized() /
     auth.user_id()), e um RAISE lá dentro pode virar outro status HTTP
     (ex. 400) no PostgREST, mantendo só a mensagem como pista. Por isso a
     detecção olha a mensagem do corpo da resposta, não só o status. */
  function pareceJwtExpirado(msg) {
    return /jwt/i.test(msg || '') && /(expired|expirado|invalid)/i.test(msg || '');
  }

  async function mensagemDeErro(res) {
    try { const j = await res.clone().json(); return j.message || j.error || ''; }
    catch (e) { return ''; }
  }

  async function fetchComAuth(url, options) {
    let res = await fetch(url, { ...options, headers: authHeaders() });
    if (!res.ok) {
      const precisaRenovar = res.status === 401 || res.status === 403 || pareceJwtExpirado(await mensagemDeErro(res));
      if (precisaRenovar && window.Auth && window.Auth.refreshAccessToken) {
        const novoToken = await window.Auth.refreshAccessToken().catch(() => null);
        if (novoToken) res = await fetch(url, { ...options, headers: authHeaders() });
      }
    }
    return res;
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
      if (res.status === 401 || res.status === 403 || pareceJwtExpirado(msg)) {
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
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/${table}${qs}`, {});
    return handle(res);
  }

  async function create(table, payload) {
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/${table}`, {
      method: 'POST', body: JSON.stringify(payload)
    });
    const data = await handle(res);
    return Array.isArray(data) ? data[0] : data;
  }

  async function update(table, id, payload) {
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/${table}?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify(payload)
    });
    const data = await handle(res);
    return Array.isArray(data) ? data[0] : data;
  }

  async function remove(table, id) {
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/${table}?id=eq.${id}`, { method: 'DELETE' });
    return handle(res);
  }

  /* Atualiza em massa: `query` é um filtro PostgREST completo, ex.
     "moeda=eq.USD&taxa_cambio=is.null" — usado quando não há um único id. */
  async function updateWhere(table, query, payload) {
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/${table}?${query}`, {
      method: 'PATCH', body: JSON.stringify(payload)
    });
    return handle(res);
  }

  /* Remove em massa por filtro PostgREST, ex. "email=eq.foo@bar.com" —
     usado quando não há um único id (ex.: usuarios_permitidos, chave é o e-mail). */
  async function removeWhere(table, query) {
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/${table}?${query}`, { method: 'DELETE' });
    return handle(res);
  }

  /* Chama uma função do banco exposta pela Data API (PostgREST) em /rpc/<nome>.
     Usado para operações que não são um CRUD simples de tabela, ex. app_me(). */
  async function rpc(fn, params) {
    const res = await fetchComAuth(`${cfg.DATA_API_URL}/rpc/${fn}`, {
      method: 'POST', body: JSON.stringify(params || {})
    });
    return handle(res);
  }

  window.DB = { list, create, update, remove, updateWhere, removeWhere, rpc };
})();
