/* ══════════════════════════════════════════════════════════
   Service Worker — Importação Controller Pedido
   Só existe para tornar o app instalável (PWA) e dar um shell
   básico offline. NÃO intercepta chamadas da Data API (Neon),
   Supabase Storage ou qualquer domínio externo — essas sempre
   vão direto pra rede, pra nunca servir dado desatualizado.
   ══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'controller-pedido-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/auth.js',
  './js/api.js',
  './js/storage.js',
  './js/app.js',
  './js/dashboard.js',
  './js/views.js',
  './js/lancamento.js',
  './js/cambio.js',
  './js/export.js',
  './js/notificacoes.js',
  './js/usuarios.js',
  './js/cadastros.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // falha ao pré-cachear não deve impedir a instalação
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só cuida de GET do próprio app — tudo que é de outro domínio
  // (Neon Data API, Supabase Storage, Google Fonts, CDN de libs,
  // Stack Auth/Microsoft OAuth) passa direto pela rede, sem cache.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
