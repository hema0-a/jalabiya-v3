/* ==========================================================================
   sw.js — Service Worker (PWA offline-first)
   ==========================================================================
   الاستراتيجية:
     - HTML (navigations): Network-first → fallback لـ index.html
     - Static (CSS/JS/SVG/JSON): Network-first (مهلة 4 ثوانٍ) → ثم الكاش
       (يضمن وصول أي تعديل فوراً مع الاحتفاظ بالعمل offline)
     - External (fonts, Firebase): لا يُخزَّن
   الإصدار: v3.3.3 — إكمال الكاش + تحديثات فورية
   ========================================================================== */

const CACHE_VERSION = 'v3.3.3';
const CACHE_NAME = 'jalabiya-' + CACHE_VERSION;

/* ==========================================================================
   PRECACHE_URLS — كل الملفات المطلوبة للعمل offline
   ========================================================================== */

const PRECACHE_URLS = [
  /* --- Core shell --- */
  './',
  './index.html',
  './manifest.json',

  /* --- Styles --- */
  './styles/main.css',
  './styles/base.css',
  './styles/components.css',
  './styles/layout.css',
  './styles/settings.css',
  './styles/themes.css',

  /* --- Icons --- */
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',

  /* --- Main entry --- */
  './src/main.js',
  './src/pwa.js',

  /* --- Core modules --- */
  './src/core/config.js',
  './src/core/dom.js',
  './src/core/events.js',
  './src/core/sanitize.js',
  './src/core/utils.js',
  './src/core/error-handler.js',

  /* --- Data layer --- */
  './src/data/schema.js',
  './src/data/idb.js',
  './src/data/repository.js',
  './src/data/search.js',

  /* --- Data repos --- */
  './src/data/repos/activity.js',
  './src/data/repos/appointments.js',
  './src/data/repos/commitment-payments.js',
  './src/data/repos/commitments.js',
  './src/data/repos/customers.js',
  './src/data/repos/expenses.js',
  './src/data/repos/house-expenses.js',
  './src/data/repos/inventory.js',
  './src/data/repos/loan-payments.js',
  './src/data/repos/orders.js',
  './src/data/repos/payments.js',
  './src/data/repos/personal-loans.js',
  './src/data/repos/portfolio.js',
  './src/data/repos/referrals.js',
  './src/data/repos/savings-goals.js',
  './src/data/repos/settings.js',
  './src/data/repos/trash.js',
  './src/data/repos/worker-payments.js',
  './src/data/repos/workers.js',

  /* --- Security --- */
  './src/security/auth.js',
  './src/security/pin-crypto.js',

  /* --- UI components --- */
  './src/ui/client-mode.js',
  './src/ui/collapsible.js',
  './src/ui/controls.js',
  './src/ui/fab.js',
  './src/ui/form-builder.js',
  './src/ui/layout.js',
  './src/ui/modal.js',
  './src/ui/notifications-center.js',
  './src/ui/offline-indicator.js',
  './src/ui/order-image-picker.js',
  './src/ui/progressive-list.js',
  './src/ui/quick-preview.js',
  './src/ui/sidebar.js',
  './src/ui/signature-pad.js',
  './src/ui/sub-page.js',
  './src/ui/theme.js',
  './src/ui/toast.js',
  './src/ui/topbar.js',
  './src/ui/universal-search.js',
  './src/ui/dashboard-charts.js',
  './src/ui/onboarding.js',

  /* --- Sync (Firebase) --- */
  './src/sync/auth-sync.js',
  './src/sync/firebase-config.js',
  './src/sync/firestore-sync.js',
  './src/sync/offline-queue.js',

  /* --- Services --- */
  './src/services/auto-backup.js',
  './src/services/commitments-calculator.js',
  './src/services/draft-manager.js',
  './src/services/financial-calculator.js',
  './src/services/kpis-calculator.js',
  './src/services/loans-calculator.js',
  './src/services/notifications.js',
  './src/services/order-scheduler.js',
  './src/services/order-timing.js',
  './src/services/auto-messages.js',
  './src/services/calendar-events.js',
  './src/services/financial-export.js',
  './src/services/house-expenses-export.js',
  './src/services/image-compressor.js',
  './src/services/invoice-print.js',

  /* --- Pages --- */
  './src/pages/dashboard.js',
  './src/pages/customers.js',
  './src/pages/orders.js',
  './src/pages/payments.js',
  './src/pages/inventory.js',
  './src/pages/workers.js',
  './src/pages/expenses.js',
  './src/pages/reports.js',
  './src/pages/calendar.js',
  './src/pages/pricing-calculator.js',
  './src/pages/financial-center.js',
  './src/pages/kpis.js',
  './src/pages/portfolio.js',
  './src/pages/commitments.js',
  './src/pages/house-expenses.js',
  './src/pages/loans.js',
  './src/pages/referrals.js',
  './src/pages/occasions.js',
  './src/pages/activity-log.js',
  './src/pages/trash.js',
  './src/pages/cloud-sync.js',
  './src/pages/tests.js',
  './src/pages/appointments.js',

  /* --- Settings sub-pages --- */
  './src/pages/settings/index.js',
  './src/pages/settings/sections-workshop.js',
  './src/pages/settings/sections-data.js',
  './src/pages/settings/sections-system.js',
  './src/pages/settings/sections-security.js',
];

/* ==========================================================================
   1. INSTALL — تخزين كل الأصول
   ========================================================================== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      /* تخزين كل ملف بمفرده — لتجنّب فشل ذري */
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err.message);
          })
        )
      );
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

  /* --- Static assets → Network-first مع مهلة، ثم الكاش --- */
  event.respondWith(networkFirst(req, url));
});

function networkFirst(req, url) {
  const cacheCopy = (res) => {
    if (res && res.status === 200 && res.type === 'basic') {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, clone));
    }
    return res;
  };

  const network = fetch(req).then(cacheCopy);

  /* مهلة 4 ثوانٍ: إن تأخرت الشبكة نستخدم الكاش (إن وُجد) */
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      caches.match(req).then((cached) => resolve(cached || null));
    }, 4000);
  });

  return Promise.race([network, timeout.then((c) => c || network)])
    .catch(() =>
      caches.match(req).then((cached) =>
        cached ||
        new Response(
          JSON.stringify({ error: 'offline', url: url.pathname }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
}

/* ==========================================================================
   4. MESSAGE — تفعيل فوري
   ========================================================================== */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
