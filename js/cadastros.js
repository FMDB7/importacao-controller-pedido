/* ══════════════════════════════════════════════════════════
   TopImport Pro — Login + CRUD de Fornecedores, Colaboradores, Cidades
   ══════════════════════════════════════════════════════════ */
(function () {

  const FLAGS = {
    'Estados Unidos': '🇺🇸', 'EUA': '🇺🇸', 'Alemanha': '🇩🇪', 'Reino Unido': '🇬🇧',
    'Suíça': '🇨🇭', 'Suica': '🇨🇭', 'França': '🇫🇷', 'Itália': '🇮🇹', 'China': '🇨🇳',
    'Brasil': '🇧🇷', 'Portugal': '🇵🇹', 'Espanha': '🇪🇸'
  };
  const flag = (pais) => FLAGS[pais] || '🌍';
  const SETOR_NOME = {
    A:'ACESSÓRIOS', B:'BIJOUX', BEB:'BEBIDAS', 'BEB NAC':'BEBIDAS NACIONAL',
    BOL:'BOLSAS, MALAS', C:'COSMETIC', 'C&D':'CASA & DECORAÇÃO', O:'ÓCULOS',
    P:'PERFUMARIA', PUB:'PUBLICIDADE', R:'RELÓGIOS'
  };
  const curTag = (m) => `<span class="currency-tag cur-${(m||'usd').toLowerCase()}">${m||'—'}</span>`;
  const initials = (nome) => (nome || '??').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const GRADIENTS = ['#0099CC,#0EA5E9','#00A878,#10B981','#C4880A,#F5A623','#6D4FC2,#9B7AFF','#B03060,#FF4D6D'];
  const gradient = (i) => `linear-gradient(135deg,${GRADIENTS[i % GRADIENTS.length]})`;
  const rowActions = (table, id) => `
    <div class="row-actions">
      <button type="button" data-edit="${table}:${id}" title="Editar">✏️</button>
      <button type="button" class="danger" data-delete="${table}:${id}" title="Excluir">🗑️</button>
    </div>`;

  // Cache dos últimos registros carregados por tabela, usado para preencher o modal de edição
  const CACHE = { fornecedores: [], colaboradores: [], cidades: [] };

  function friendlyError(e, acao) {
    const msg = e?.message || '';
    if (/row-level security|row level security/i.test(msg)) {
      return 'Acesso negado pelo servidor para este usuário. Se você acabou de entrar (login), tente sair e entrar novamente; se persistir, fale com o administrador do sistema.';
    }
    if (/foreign key|violat/i.test(msg)) {
      return acao === 'excluir'
        ? 'Não é possível excluir: existem pedidos ou outros registros vinculados a este cadastro.'
        : 'Não foi possível salvar: o registro conflita com uma regra do banco de dados (ex.: valor inválido ou vínculo quebrado).';
    }
    return msg || 'Erro ao processar a solicitação.';
  }

  /* ---------- LOGIN (somente Microsoft, domínios corporativos) ---------- */
  const overlay = document.getElementById('login-overlay');
  const errEl = document.getElementById('login-error');

  // Login é feito só com a conta Microsoft corporativa (e-mail + senha do
  // próprio e-mail, validados pela Microsoft/Azure AD — este app nunca vê a
  // senha). Mesmo assim, checamos aqui o domínio do e-mail autenticado como
  // uma segunda camada: se por algum motivo a conta Microsoft não for
  // @topinternacional.com.br nem @tfs.com.br, a pessoa é deslogada com um
  // aviso claro em vez de só cair numa tela vazia por falta de permissão.
  const DOMINIOS_PERMITIDOS = ['topinternacional.com.br', 'tfs.com.br'];
  function dominioPermitido(email) {
    const dominio = (email || '').split('@')[1]?.toLowerCase();
    return !!dominio && DOMINIOS_PERMITIDOS.includes(dominio);
  }

  const msBtn = document.getElementById('login-microsoft');
  msBtn && msBtn.addEventListener('click', async () => {
    if (errEl) errEl.textContent = '';
    msBtn.disabled = true;
    try {
      await Auth.signInWithMicrosoft(); // navega para fora da página em caso de sucesso
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Falha ao iniciar login com a Microsoft.';
      msBtn.disabled = false;
    }
  });

  async function aposLoginOk(metodo) {
    let email = '';
    try {
      const who = await DB.rpc('app_whoami', {});
      email = (Array.isArray(who) && who[0] && who[0].email) || '';
    } catch (e) { console.warn('Não foi possível confirmar o e-mail autenticado:', e.message); }

    if (email && !dominioPermitido(email)) {
      if (errEl) errEl.textContent = `O e-mail ${email} não é uma conta corporativa autorizada (use @topinternacional.com.br ou @tfs.com.br).`;
      Auth.signOut(false); // limpa a sessão sem recarregar, pra pessoa ver a mensagem de erro
      return;
    }
    overlay.classList.add('hidden');
    if (window.Usuarios) window.Usuarios.registrarLogin(metodo);
    loadAll();
  }

  // Login com Microsoft termina de forma assíncrona (troca de code por token
  // depois do redirect de volta), então auth.js avisa por evento quando acabar.
  window.addEventListener('topimport:auth-changed', () => { aposLoginOk('microsoft'); });
  window.addEventListener('topimport:auth-error', (e) => {
    if (errEl) errEl.textContent = e.detail || 'Falha ao entrar com a Microsoft.';
  });

  if (window.Auth && Auth.isLoggedIn()) {
    overlay.classList.add('hidden');
    // já estava logado (sessão retomada ao reabrir a página) — não registra
    // um novo login, só retoma/garante a sessão ativa e o heartbeat.
    if (window.Usuarios) window.Usuarios.garantirSessao();
  }

  /* ---------- RENDER: FORNECEDORES ---------- */
  async function renderFornecedores() {
    const tbody = document.getElementById('tbl-fornecedores');
    if (!tbody) return;
    try {
      const rows = await DB.list('fornecedores');
      CACHE.fornecedores = rows;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-3);padding:24px;">Nenhum fornecedor cadastrado ainda.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(f => `
        <tr>
          <td>${f.razao_social}${f.nome_fantasia ? ` <span style="color:var(--ink-3);">(${f.nome_fantasia})</span>` : ''}</td>
          <td>${flag(f.pais)} ${f.pais}</td>
          <td>${curTag(f.moeda)}</td>
          <td>${f.contato_email || '—'}</td>
          <td><span class="status-badge ${f.ativo ? 's-entregue' : 's-aguardando'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td>${rowActions('fornecedores', f.id)}</td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--rose);padding:24px;">${e.message}</td></tr>`;
    }
  }

  /* ---------- RENDER: COLABORADORES ---------- */
  async function renderColaboradores() {
    const grid = document.getElementById('grid-colaboradores');
    if (!grid) return;
    try {
      const rows = await DB.list('colaboradores');
      CACHE.colaboradores = rows;
      const addCard = `<div class="person-card" data-quick-add="colaboradores" style="border-style:dashed;display:flex;align-items:center;justify-content:center;cursor:pointer;min-height:160px;opacity:.7;">
        <div style="text-align:center;color:var(--ink-3);"><div style="font-size:28px;margin-bottom:6px;">+</div><div style="font-size:13px;font-weight:500;">Adicionar Colaborador</div></div>
      </div>`;
      if (!rows.length) {
        grid.innerHTML = `<div style="color:var(--ink-3);padding:24px;">Nenhum colaborador cadastrado ainda.</div>` + addCard;
        return;
      }
      grid.innerHTML = rows.map((c, i) => `
        <div class="person-card">
          <div class="person-header">
            <div class="person-avatar" style="background:${gradient(i)}">${initials(c.nome)}</div>
            <div><div class="person-name">${c.nome}</div><div class="person-role">${c.cargo}</div></div>
          </div>
          <div class="person-tags">
            ${c.setor ? `<span class="tag tag-cyan">${c.setor}: ${SETOR_NOME[c.setor] || c.setor}</span>` : ''}
            ${c.localizacao ? `<span class="tag">${c.localizacao}</span>` : ''}
            ${c.coordenador_nome ? `<span class="tag" title="Coordenador(a) responsável">👤 Coord.: ${c.coordenador_nome}</span>` : ''}
          </div>
          ${rowActions('colaboradores', c.id)}
        </div>`).join('') + addCard;
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--rose);padding:24px;">${e.message}</div>`;
    }
  }

  /* ---------- RENDER: CIDADES ---------- */
  async function renderCidades() {
    const list = document.getElementById('list-cidades');
    if (!list) return;
    const header = list.firstElementChild; // keep header row
    try {
      const rows = await DB.list('cidades');
      CACHE.cidades = rows;
      if (!rows.length) {
        list.innerHTML = '';
        list.appendChild(header);
        list.insertAdjacentHTML('beforeend', `<div style="color:var(--ink-3);padding:24px;">Nenhuma cidade cadastrada ainda.</div>`);
        return;
      }
      list.innerHTML = '';
      list.appendChild(header);
      rows.forEach(c => {
        list.insertAdjacentHTML('beforeend', `
          <div class="city-row">
            <div><div class="city-name">${c.nome}</div>${c.estado ? `<div class="city-country">${c.estado}</div>` : ''}</div>
            <div>${flag(c.pais)} ${c.pais}</div>
            <div style="text-align:right;font-family:var(--ff-mono);font-size:13px;">${c.codigo_porto || c.codigo_aeroporto || '—'}</div>
            <div>${rowActions('cidades', c.id)}</div>
          </div>`);
      });
    } catch (e) {
      list.insertAdjacentHTML('beforeend', `<div style="color:var(--rose);padding:24px;">${e.message}</div>`);
    }
  }

  function loadAll() {
    renderFornecedores();
    renderColaboradores();
    renderCidades();
    if (window.renderPedidos) window.renderPedidos();
    if (window.renderDashboard) window.renderDashboard();
    if (window.renderOperacionais) window.renderOperacionais();
    if (window.refreshCambioExposicao) window.refreshCambioExposicao();
    if (window.checkNotificacoes) window.checkNotificacoes();
    if (window.Usuarios) window.Usuarios.refreshMeAndPermissions();
  }

  /* ---------- QUICK-ADD MODAL ---------- */
  const SCHEMAS = {
    fornecedores: {
      title: 'Novo Fornecedor',
      fields: [
        { name: 'razao_social', label: 'Razão Social', required: true },
        { name: 'nome_fantasia', label: 'Nome Fantasia' },
        { name: 'pais', label: 'País', required: true },
        { name: 'cidade', label: 'Cidade' },
        { name: 'moeda', label: 'Moeda', type: 'select', options: ['USD','EUR','GBP','CHF'] },
        { name: 'contato_email', label: 'E-mail de Contato' },
        { name: 'contato_telefone', label: 'Telefone' }
      ]
    },
    colaboradores: {
      title: 'Novo Colaborador',
      fields: [
        { name: 'nome', label: 'Nome', required: true },
        { name: 'email', label: 'E-mail' },
        { name: 'telefone', label: 'Telefone' },
        { name: 'cargo', label: 'Cargo', type: 'select', options: ['BM','COORD BM','Diretor','Analista','Assistente'], required: true },
        { name: 'setor', label: 'Setor - Categoria', type: 'select', options: [
          { value: 'A', label: 'A: ACESSÓRIOS' },
          { value: 'BEB', label: 'BEB: BEBIDAS' },
          { value: 'BEB NAC', label: 'BEB NAC: BEBIDAS NACIONAL' },
          { value: 'B', label: 'B: BIJOUX' },
          { value: 'BOL', label: 'BOL: BOLSAS, MALAS' },
          { value: 'C', label: 'C: COSMETIC' },
          { value: 'C&D', label: 'C&D: CASA & DECORAÇÃO' },
          { value: 'O', label: 'O: ÓCULOS' },
          { value: 'P', label: 'P: PERFUMARIA' },
          { value: 'PUB', label: 'PUB: PUBLICIDADE' },
          { value: 'R', label: 'R: RELÓGIOS' }
        ] },
        { name: 'localizacao', label: 'Localização', type: 'select', options: ['Manaus','Macapá','Extrema','Guajará'] },
        { name: 'coordenador_nome', label: 'Coordenador(a) Responsável' }
      ]
    },
    cidades: {
      title: 'Nova Cidade',
      fields: [
        { name: 'nome', label: 'Cidade', required: true },
        { name: 'estado', label: 'Estado' },
        { name: 'pais', label: 'País', required: true },
        { name: 'codigo_porto', label: 'Código do Porto' },
        { name: 'codigo_aeroporto', label: 'Código do Aeroporto' }
      ]
    }
  };

  const qBackdrop = document.getElementById('quick-modal-backdrop');
  const qTitle = document.getElementById('quick-modal-title');
  const qFields = document.getElementById('quick-modal-fields');
  const qSave = document.getElementById('quick-modal-save');
  let currentTable = null;
  let editingId = null;

  function openQuickAdd(table, record) {
    const schema = SCHEMAS[table];
    if (!schema) return;
    currentTable = table;
    editingId = record ? record.id : null;
    qTitle.textContent = editingId ? `Editar ${schema.title.replace(/^Nov[oa] /, '')}` : schema.title;
    qFields.innerHTML = schema.fields.map(f => `
      <div class="form-group" style="grid-column: span 2;">
        <label class="form-label">${f.label}${f.required ? ' <span class="form-required">*</span>' : ''}</label>
        ${f.type === 'select'
          ? `<select class="form-select" data-field="${f.name}">
               <option value="">Selecionar...</option>
               ${(typeof f.options === 'function' ? f.options() : f.options).map(o => {
                 const val = (o && typeof o === 'object') ? o.value : o;
                 const lbl = (o && typeof o === 'object') ? o.label : o;
                 return `<option value="${val}"${record && record[f.name] === val ? ' selected' : ''}>${lbl}</option>`;
               }).join('')}
             </select>`
          : `<input class="form-input" data-field="${f.name}" value="${record && record[f.name] != null ? String(record[f.name]).replace(/"/g, '&quot;') : ''}">`}
      </div>`).join('');
    qSave.textContent = editingId ? 'Salvar alterações' : 'Salvar';
    qBackdrop.classList.add('open');
  }

  function closeQuickAdd() {
    qBackdrop.classList.remove('open');
    currentTable = null;
    editingId = null;
    qSave.textContent = 'Salvar';
  }

  document.getElementById('quick-modal-close').addEventListener('click', closeQuickAdd);
  document.getElementById('quick-modal-cancel').addEventListener('click', closeQuickAdd);

  qSave.addEventListener('click', async () => {
    if (!currentTable) return;
    const schema = SCHEMAS[currentTable];
    const payload = {};
    let missing = false;
    qFields.querySelectorAll('[data-field]').forEach(el => {
      const def = schema.fields.find(f => f.name === el.dataset.field);
      if (def && def.required && !el.value) missing = true;
      if (el.value) payload[el.dataset.field] = el.value;
    });
    if (missing) { alert('Preencha os campos obrigatórios.'); return; }
    qSave.disabled = true;
    try {
      if (editingId) await DB.update(currentTable, editingId, payload);
      else await DB.create(currentTable, payload);
      closeQuickAdd();
      loadAll();
    } catch (e) {
      alert('Erro ao salvar: ' + friendlyError(e, 'salvar'));
    } finally {
      qSave.disabled = false;
    }
  });

  async function deleteRecord(table, id) {
    if (!confirm('Tem certeza que deseja excluir este registro? Essa ação não pode ser desfeita.')) return;
    try {
      await DB.remove(table, id);
      loadAll();
    } catch (e) {
      alert('Erro ao excluir: ' + friendlyError(e, 'excluir'));
    }
  }

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const [table, id] = editBtn.dataset.edit.split(':');
      const record = (CACHE[table] || []).find(r => r.id === id);
      if (record) openQuickAdd(table, record);
      return;
    }
    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      const [table, id] = delBtn.dataset.delete.split(':');
      deleteRecord(table, id);
      return;
    }
    const trigger = e.target.closest('[data-quick-add]');
    if (trigger) openQuickAdd(trigger.dataset.quickAdd);
  });

  if (window.Auth && Auth.isLoggedIn()) loadAll();
})();
