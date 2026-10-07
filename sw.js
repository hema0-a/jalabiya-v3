/* ==========================================================================
   sw.js — Service Worker (PWA offline-first)
   ==========================================================================
   الاستراتيجية:
     - HTML (navigations): Network-first → fallback لـ index.html
     - Static (CSS/JS/SVG/JSON): Cache-first → ثم network → تخزين
     - External (fonts, Firebase): لا يُخزَّن
   الإصدار: v3.3.0 (270 اختبار + Error Handler + FAB + Autosave + Dark Mode + Offline Indicator)
   ========================================================================== */

const CACHE_VERSION = 'v3.3.1';
const CACHE_NAME = 'jalabiya-' + CACHE_VERSION;

/* --- الأصول المُخزَّنة مسبقاً عند التثبيت --- */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './styles/base.css',
  './styles/components.css',
  './styles/layout.css',
  './styles/settings.css',
  './styles/themes.css',
  './assets/icons/icon.svg',
  './src/main.js',
  './src/pwa.js',
  './src/core/error-handler.js',
  './src/ui/fab.js',
  './src/services/draft-manager.js',
  './src/ui/theme.js',
  './src/ui/offline-indicator.js',
];

/* ==========================================================================
   1. INSTALL — تخزين الأصول الأساسية
   ========================================================================== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ==========================================================================
   2. ACTIVATE — حذف الكاشات القديمة
   ========================================================================== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('jalabiya-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

/* ==========================================================================
   3. FETCH — استراتيجية ديناميكية
   ========================================================================== */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* تجاهل: غير GET */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* تجاهل: نطاقات خارجية (Google Fonts, Firebase, CDN) */
  if (url.origin !== self.location.origin) return;

  /* --- HTML (navigations) → Network-first --- */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* --- Static assets → Cache-first --- */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          return new Response(
            JSON.stringify({ error: 'offline', url: url.pathname }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
    })
  );
});

/* ==========================================================================
   4. MESSAGE — تفعيل فوري
   ========================================================================== */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
