/* ══════════════════════════════════════════════════════════
   TopImport Pro — Autenticação (Neon Auth / Stack Auth)
   Login por e-mail/senha. Guarda o access_token no localStorage
   e expõe window.Auth.{signIn,signUp,signOut,getToken,currentUser}
   ══════════════════════════════════════════════════════════ */
(function () {
  const cfg = window.TOPIMPORT_CONFIG;
  const STORAGE_KEY = 'topimport_session';

  function headers() {
    return {
      'Content-Type': 'application/json',
      'x-stack-project-id': cfg.STACK_PROJECT_ID,
      'x-stack-publishable-client-key': cfg.STACK_PUBLISHABLE_CLIENT_KEY,
      'x-stack-access-type': 'client'
    };
  }

  function saveSession(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function signUp(email, password, displayName) {
    const res = await fetch(cfg.STACK_API_URL + '/auth/password/sign-up', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password, display_name: displayName || email.split('@')[0] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Erro ao criar conta');
    saveSession(data);
    return data;
  }

  async function signIn(email, password) {
    const res = await fetch(cfg.STACK_API_URL + '/auth/password/sign-in', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'E-mail ou senha inválidos');
    saveSession(data);
    return data;
  }

  function signOut() {
    clearSession();
    location.reload();
  }

  function getToken() {
    const s = getSession();
    return s ? s.access_token : null;
  }

  function isLoggedIn() {
    return !!getToken();
  }

  /* ---------- Login com Microsoft (OAuth / PKCE) ----------
     Fluxo: 1) gera code_verifier + state, pede ao Stack Auth a URL de
     autorização da Microsoft e redireciona; 2) a Microsoft manda o
     usuário de volta pro Stack Auth, que redireciona de volta pra cá
     com ?code=...&state=...; 3) trocamos o code pelo access_token. */
  const OAUTH_VERIFIER_KEY = 'topimport_oauth_verifier';
  const OAUTH_STATE_KEY = 'topimport_oauth_state';

  function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  function base64url(buffer) {
    let str = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function codeChallengeFor(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64url(digest);
  }

  function currentUrlSemQuery() {
    return window.location.origin + window.location.pathname;
  }

  async function signInWithMicrosoft() {
    const verifier = randomString(64);
    const state = randomString(32);
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    const challenge = await codeChallengeFor(verifier);
    const redirectUri = currentUrlSemQuery();

    const url = new URL(cfg.STACK_API_URL + '/auth/oauth/authorize/microsoft');
    url.searchParams.set('client_id', cfg.STACK_PROJECT_ID);
    url.searchParams.set('client_secret', cfg.STACK_PUBLISHABLE_CLIENT_KEY);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'legacy');
    url.searchParams.set('state', state);
    url.searchParams.set('grant_type', 'authorization_code');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('type', 'authenticate');
    url.searchParams.set('error_redirect_url', redirectUri);
    url.searchParams.set('stack_response_mode', 'json');

    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.location) {
      throw new Error(data.error_description || data.error || 'Falha ao iniciar login com a Microsoft.');
    }
    window.location.href = data.location;
    await new Promise(() => {}); // a navegação acima encerra a página
  }

  async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (!code && !state && !error) return; // não é um retorno de OAuth

    const limpaUrl = () => {
      const url = new URL(window.location.href);
      ['code', 'state', 'error', 'error_description'].forEach(k => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
    };

    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const verifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_VERIFIER_KEY);

    if (error) {
      limpaUrl();
      throw new Error(params.get('error_description') || 'Login com a Microsoft cancelado ou recusado.');
    }
    if (!code || !state || !verifier || state !== savedState) {
      limpaUrl();
      throw new Error('Sessão de login expirada. Tente novamente.');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: currentUrlSemQuery(),
      code_verifier: verifier,
      client_id: cfg.STACK_PROJECT_ID,
      client_secret: cfg.STACK_PUBLISHABLE_CLIENT_KEY
    });
    const res = await fetch(cfg.STACK_API_URL + '/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await res.json().catch(() => ({}));
    limpaUrl();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Não foi possível concluir o login com a Microsoft.');
    }
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  }

  window.Auth = { signUp, signIn, signOut, getToken, isLoggedIn, getSession, signInWithMicrosoft };

  // Se a página acabou de voltar do login da Microsoft, conclui o fluxo
  // e avisa o resto do app (cadastros.js) por evento, já que isso é assíncrono.
  (async function concluirCallbackSeNecessario() {
    try {
      await handleOAuthCallback();
      if (isLoggedIn()) window.dispatchEvent(new CustomEvent('topimport:auth-changed'));
    } catch (e) {
      console.error('Login com a Microsoft:', e.message);
      window.dispatchEvent(new CustomEvent('topimport:auth-error', { detail: e.message }));
    }
  })();
})();
