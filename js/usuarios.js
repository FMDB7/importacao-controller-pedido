/* ══════════════════════════════════════════════════════════
   TopImport Pro — Usuários, Perfis/Permissões, Log de Acesso
   e Sessões Ativas.

   Perfis: "Administrador" (acesso total, inclusive esta tela)
           e "Usuario" (acesso normal ao app, sem esta tela).
   A restrição é reforçada em dois níveis:
     1) UI: itens com [data-requires-admin] só aparecem para Administrador.
     2) Banco: RLS em usuarios_permitidos/login_log/sessoes_ativas só
        deixa Administrador ler a lista completa de usuários e sessões
        (ver função app_is_admin() / políticas no Neon).
   ══════════════════════════════════════════════════════════ */
(function () {
  const SESSION_TOKEN_KEY = 'topimport_session_token';
  let meCache = null;
  let heartbeatTimer = null;

  /* ---------- Quem sou eu (perfil atual) ---------- */
  async function getMe(force) {
    if (meCache && !force) return meCache;
    try {
      const rows = await DB.rpc('app_me', {});
      meCache = (Array.isArray(rows) && rows[0]) || null;
    } catch (e) {
      console.error('Erro ao obter perfil do usuário:', e.message);
      meCache = null;
    }
    return meCache;
  }

  function isAdmin(me) {
    return !!(me && me.perfil === 'Administrador' && me.ativo);
  }

  function applyPerfilUI(me) {
    const admin = isAdmin(me);
    document.querySelectorAll('[data-requires-admin]').forEach(el => {
      el.style.display = admin ? '' : 'none';
    });
    const nameEl = document.getElementById('user-card-name');
    const roleEl = document.getElementById('user-card-role');
    const avatarEl = document.getElementById('user-card-avatar');
    if (me) {
      const nome = me.nome || me.email;
      if (nameEl) nameEl.textContent = nome;
      if (roleEl) roleEl.textContent = me.perfil === 'Administrador' ? 'Administrador' : 'Usuário';
      if (avatarEl) {
        avatarEl.textContent = nome.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      }
    }
  }

  async function refreshMeAndPermissions() {
    const me = await getMe(true);
    applyPerfilUI(me);
    return me;
  }

  /* ---------- Dispositivo (resumo legível do user-agent) ---------- */
  function resumoDispositivo(ua) {
    ua = ua || '';
    let nav = 'Navegador';
    if (/Edg\//.test(ua)) nav = 'Edge';
    else if (/OPR\//.test(ua)) nav = 'Opera';
    else if (/Chrome\//.test(ua)) nav = 'Chrome';
    else if (/Firefox\//.test(ua)) nav = 'Firefox';
    else if (/Safari\//.test(ua)) nav = 'Safari';
    let so = 'dispositivo desconhecido';
    if (/Windows/.test(ua)) so = 'Windows';
    else if (/Mac OS X/.test(ua)) so = 'macOS';
    else if (/Android/.test(ua)) so = 'Android';
    else if (/iPhone|iPad/.test(ua)) so = 'iOS';
    else if (/Linux/.test(ua)) so = 'Linux';
    return `${nav} · ${so}`;
  }

  /* ---------- Registro de login + sessão (chamado ao autenticar) ---------- */
  async function registrarLogin(metodo) {
    try {
      await DB.create('login_log', { metodo, dispositivo: navigator.userAgent });
    } catch (e) { console.warn('Falha ao registrar log de login:', e.message); }
    await garantirSessao();
  }

  /* Garante que exista uma linha de sessão ativa para ESTA aba/navegador.
     Se já existe um token salvo nesta aba (sessionStorage), reaproveita;
     senão cria uma nova sessão. Sempre liga o heartbeat. */
  async function garantirSessao() {
    let token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      token = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      try {
        await DB.create('sessoes_ativas', { session_token: token, dispositivo: navigator.userAgent });
      } catch (e) { console.warn('Falha ao registrar sessão ativa:', e.message); }
    }
    iniciarHeartbeat();
  }

  function iniciarHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(async () => {
      const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!token) return;
      try {
        const rows = await DB.list('sessoes_ativas', `session_token=eq.${encodeURIComponent(token)}&order=iniciado_em.desc`);
        const row = rows && rows[0];
        if (!row || row.revogado) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
          sessionStorage.removeItem(SESSION_TOKEN_KEY);
          alert('Sua sessão foi encerrada (por um administrador ou por expiração). Faça login novamente.');
          window.Auth.signOut();
          return;
        }
        await DB.update('sessoes_ativas', row.id, { ultimo_ping: new Date().toISOString() });
      } catch (e) { /* best-effort: nunca derruba o usuário por falha de rede no heartbeat */ }
    }, 60000);
  }

  async function encerrarSessaoPropria() {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (!token) return;
    try {
      const rows = await DB.list('sessoes_ativas', `session_token=eq.${encodeURIComponent(token)}`);
      if (rows && rows[0]) await DB.remove('sessoes_ativas', rows[0].id);
    } catch (e) { /* best-effort */ }
  }

  /* ---------- Logout ---------- */
  async function sair() {
    if (!confirm('Deseja realmente sair do sistema?')) return;
    await encerrarSessaoPropria();
    window.Auth.signOut();
  }
  document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', sair));

  /* ---------- RENDER: Usuários ---------- */
  async function renderUsuarios() {
    const tbody = document.getElementById('tbl-usuarios');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-3);padding:24px;">Carregando...</td></tr>`;
    try {
      const [usuarios, logins] = await Promise.all([
        DB.list('usuarios_permitidos', 'order=nome.asc'),
        DB.list('login_log', 'order=data_hora.desc&limit=3000')
      ]);
      const ultimoLogin = {};
      logins.forEach(l => { if (!ultimoLogin[l.email]) ultimoLogin[l.email] = l.data_hora; });
      if (!usuarios.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum usuário cadastrado ainda.</td></tr>`;
        return;
      }
      tbody.innerHTML = usuarios.map(u => `
        <tr>
          <td>${u.nome || '—'}</td>
          <td class="code" style="text-align:left;">${u.email}</td>
          <td class="ta-c">
            <select class="form-select" style="padding:4px 8px;font-size:12px;width:auto;" data-perfil-change="${u.email}">
              <option value="Usuario"${u.perfil === 'Usuario' ? ' selected' : ''}>Usuário</option>
              <option value="Administrador"${u.perfil === 'Administrador' ? ' selected' : ''}>Administrador</option>
            </select>
          </td>
          <td class="ta-c"><span class="status-badge ${u.ativo ? 's-entregue' : 's-aguardando'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td class="date">${ultimoLogin[u.email] ? new Date(ultimoLogin[u.email]).toLocaleString('pt-BR') : 'nunca'}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-toggle-ativo-usuario="${u.email}" title="${u.ativo ? 'Desativar' : 'Ativar'}">${u.ativo ? '⛔' : '✅'}</button>
              <button type="button" class="danger" data-remove-usuario="${u.email}" title="Remover">🗑️</button>
            </div>
          </td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--rose);padding:24px;">Erro ao carregar usuários: ${e.message}</td></tr>`;
    }
  }

  /* ---------- RENDER: Sessões Ativas ---------- */
  async function renderSessoesAtivas() {
    const tbody = document.getElementById('tbl-sessoes');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-3);padding:24px;">Carregando...</td></tr>`;
    try {
      const rows = await DB.list('sessoes_ativas', 'revogado=eq.false&order=ultimo_ping.desc');
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhuma sessão ativa no momento.</td></tr>`;
        return;
      }
      const agora = Date.now();
      tbody.innerHTML = rows.map(s => {
        const minutosAtras = (agora - new Date(s.ultimo_ping).getTime()) / 60000;
        const online = minutosAtras < 5;
        return `
        <tr>
          <td class="mono" style="font-size:12px;">${s.email}</td>
          <td>${resumoDispositivo(s.dispositivo)}</td>
          <td style="font-size:12px;color:var(--ink-3);">${new Date(s.iniciado_em).toLocaleString('pt-BR')}</td>
          <td><span class="status-badge ${online ? 's-entregue' : 's-aguardando'}">${online ? 'Online' : 'Inativa'}</span></td>
          <td><button type="button" class="btn btn-ghost" style="font-size:11px;padding:5px 10px;" data-encerrar-sessao="${s.id}">Encerrar sessão</button></td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--rose);padding:24px;">Erro ao carregar sessões: ${e.message}</td></tr>`;
    }
  }

  /* ---------- MODAL: Ver Log ---------- */
  const logBackdrop = document.getElementById('log-modal-backdrop');
  async function abrirLog() {
    if (!logBackdrop) return;
    logBackdrop.classList.add('open');
    const tbody = document.getElementById('tbl-log');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-3);padding:24px;">Carregando...</td></tr>`;
    try {
      const rows = await DB.list('login_log', 'order=data_hora.desc&limit=300');
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum acesso registrado ainda.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(l => `
        <tr>
          <td style="font-size:12px;">${new Date(l.data_hora).toLocaleString('pt-BR')}</td>
          <td class="mono" style="font-size:12px;">${l.email}</td>
          <td>${l.metodo === 'microsoft' ? 'Microsoft' : 'E-mail/senha'}</td>
          <td style="font-size:12px;color:var(--ink-3);">${resumoDispositivo(l.dispositivo)}</td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--rose);padding:24px;">Erro ao carregar log: ${e.message}</td></tr>`;
    }
  }
  document.getElementById('btn-ver-log')?.addEventListener('click', abrirLog);
  document.getElementById('log-modal-close')?.addEventListener('click', () => logBackdrop.classList.remove('open'));

  /* ---------- MODAL: Novo Usuário (pré-autorizar e-mail) ---------- */
  const novoUsuarioBackdrop = document.getElementById('novo-usuario-backdrop');
  document.getElementById('btn-novo-usuario')?.addEventListener('click', () => {
    document.getElementById('nu-email').value = '';
    document.getElementById('nu-nome').value = '';
    document.getElementById('nu-perfil').value = 'Usuario';
    novoUsuarioBackdrop?.classList.add('open');
  });
  document.getElementById('novo-usuario-close')?.addEventListener('click', () => novoUsuarioBackdrop?.classList.remove('open'));
  document.getElementById('novo-usuario-cancel')?.addEventListener('click', () => novoUsuarioBackdrop?.classList.remove('open'));
  document.getElementById('novo-usuario-save')?.addEventListener('click', async () => {
    const email = document.getElementById('nu-email').value.trim().toLowerCase();
    const nome = document.getElementById('nu-nome').value.trim();
    const perfil = document.getElementById('nu-perfil').value;
    if (!email) { alert('Informe o e-mail do usuário.'); return; }
    try {
      await DB.create('usuarios_permitidos', { email, nome: nome || null, perfil });
      novoUsuarioBackdrop?.classList.remove('open');
      renderUsuarios();
    } catch (e) {
      alert('Erro ao cadastrar usuário: ' + (e.message || ''));
    }
  });

  /* ---------- Ações na tabela de Usuários / Sessões (delegação) ---------- */
  document.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-perfil-change]');
    if (!sel) return;
    const email = sel.dataset.perfilChange;
    try {
      await DB.updateWhere('usuarios_permitidos', `email=eq.${encodeURIComponent(email)}`, { perfil: sel.value });
    } catch (err) {
      alert('Erro ao alterar perfil: ' + (err.message || ''));
      renderUsuarios();
    }
  });

  document.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-ativo-usuario]');
    if (toggleBtn) {
      const email = toggleBtn.dataset.toggleAtivoUsuario;
      const ativando = toggleBtn.title === 'Ativar';
      try {
        await DB.updateWhere('usuarios_permitidos', `email=eq.${encodeURIComponent(email)}`, { ativo: ativando });
        renderUsuarios();
      } catch (err) { alert('Erro: ' + (err.message || '')); }
      return;
    }
    const removeBtn = e.target.closest('[data-remove-usuario]');
    if (removeBtn) {
      const email = removeBtn.dataset.removeUsuario;
      if (!confirm(`Remover o acesso de ${email}? A pessoa não conseguirá mais entrar no sistema.`)) return;
      try {
        await DB.removeWhere('usuarios_permitidos', `email=eq.${encodeURIComponent(email)}`);
        renderUsuarios();
      } catch (err) { alert('Erro ao remover usuário: ' + (err.message || '')); }
      return;
    }
    const encerrarBtn = e.target.closest('[data-encerrar-sessao]');
    if (encerrarBtn) {
      if (!confirm('Encerrar esta sessão? A pessoa será desconectada em até 1 minuto.')) return;
      try {
        await DB.remove('sessoes_ativas', encerrarBtn.dataset.encerrarSessao);
        renderSessoesAtivas();
      } catch (err) { alert('Erro ao encerrar sessão: ' + (err.message || '')); }
    }
  });

  window.Usuarios = {
    getMe, isAdmin, refreshMeAndPermissions, registrarLogin, garantirSessao,
    encerrarSessaoPropria, sair, renderUsuarios, renderSessoesAtivas
  };
})();
