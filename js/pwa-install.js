/* ══════════════════════════════════════════════════════════
   Instalar o app (PWA) — Importação Controller Pedido
   - Registra o service worker (necessário pro Chrome/Edge/Android
     considerarem o app "instalável").
   - No primeiro acesso em um navegador/computador que ainda não viu
     o app, mostra um banner oferecendo instalar na área de trabalho
     ou tela inicial.
   - Chrome/Edge/Android: usa o evento nativo `beforeinstallprompt`.
   - iOS Safari não tem esse evento — mostra instruções manuais
     (Compartilhar → Adicionar à Tela de Início).
   - Um botão "Instalar app" fica na topbar sempre que a instalação
     ainda está disponível, pra quem dispensou o banner poder
     instalar depois.
   ══════════════════════════════════════════════════════════ */
(function () {
  const LS_SHOWN = 'pwa_install_banner_shown';   // já apareceu uma vez (primeiro acesso)
  const LS_DISMISSED = 'pwa_install_dismissed';  // usuário clicou "Agora não"

  let deferredPrompt = null;
  const btnTopbar = document.getElementById('btn-instalar-app');

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true; // iOS
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  }

  /* ---------- Service Worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // offline/sem rede na 1ª carga — sem problema, só não fica instalável agora
      });
    });
  }

  if (isStandalone()) return; // já instalado, nada a fazer

  /* ---------- Banner ---------- */
  let banner = null;
  function buildBanner({ title, body, showInstalarBtn }) {
    removeBanner();
    banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
      <button type="button" class="pwa-close" aria-label="Fechar">✕</button>
      <img src="assets/icons/icon-192.png" alt="">
      <div style="flex:1;min-width:0;">
        <div class="pwa-title">${title}</div>
        <div class="pwa-body">${body}</div>
        <div class="pwa-actions">
          ${showInstalarBtn ? `<button type="button" class="btn btn-primary" id="pwa-btn-instalar" style="font-size:12px;padding:7px 14px;">⬇️ Instalar</button>` : ''}
          <button type="button" class="btn btn-ghost" id="pwa-btn-depois" style="font-size:12px;padding:7px 14px;">Agora não</button>
        </div>
      </div>`;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));

    banner.querySelector('.pwa-close').addEventListener('click', dismiss);
    banner.querySelector('#pwa-btn-depois').addEventListener('click', dismiss);
    const btnInstalar = banner.querySelector('#pwa-btn-instalar');
    if (btnInstalar) btnInstalar.addEventListener('click', doInstall);
  }
  function removeBanner() {
    if (banner) { banner.remove(); banner = null; }
  }
  function dismiss() {
    localStorage.setItem(LS_DISMISSED, '1');
    removeBanner();
  }

  async function doInstall() {
    if (!deferredPrompt) return;
    removeBanner();
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) {}
    deferredPrompt = null;
    atualizarBotaoTopbar();
  }

  function mostrarBannerChrome() {
    buildBanner({
      title: '📲 Instalar o app',
      body: 'Adicione o Controller Pedido à área de trabalho (ou à tela inicial do celular) para abrir direto, como um aplicativo.',
      showInstalarBtn: true
    });
  }
  function mostrarBannerIOS() {
    buildBanner({
      title: '📲 Instalar na tela inicial',
      body: 'Toque em <strong>Compartilhar</strong> <span style="font-weight:600;">⬆️</span> na barra do Safari e depois em <strong>"Adicionar à Tela de Início"</strong>.',
      showInstalarBtn: false
    });
  }

  function atualizarBotaoTopbar() {
    if (!btnTopbar) return;
    const disponivel = !!deferredPrompt || (isIOS() && !isStandalone());
    btnTopbar.style.display = disponivel ? '' : 'none';
  }

  /* ---------- Chrome/Edge/Android: evento nativo ---------- */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    atualizarBotaoTopbar();
    if (!localStorage.getItem(LS_SHOWN) && !localStorage.getItem(LS_DISMISSED)) {
      localStorage.setItem(LS_SHOWN, '1');
      mostrarBannerChrome();
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    removeBanner();
    atualizarBotaoTopbar();
  });

  /* ---------- iOS Safari: sem evento nativo, instruções manuais ---------- */
  if (isIOS() && !isStandalone()) {
    atualizarBotaoTopbar();
    if (!localStorage.getItem(LS_SHOWN) && !localStorage.getItem(LS_DISMISSED)) {
      localStorage.setItem(LS_SHOWN, '1');
      setTimeout(mostrarBannerIOS, 1200);
    }
  }

  btnTopbar?.addEventListener('click', () => {
    if (deferredPrompt) doInstall();
    else if (isIOS()) mostrarBannerIOS();
  });
})();
