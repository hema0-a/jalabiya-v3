/* ==========================================================================
   sw.js — Service Worker (PWA offline-first)
   ==========================================================================
   الاستراتيجية:
     - HTML (navigations): Network-first → fallback لـ index.html
     - Static (CSS/JS/SVG/JSON): Network-first (مهلة 4 ثوانٍ) → ثم الكاش
       (يضمن وصول أي تعديل فوراً مع الاحتفاظ بالعمل offline)
     - External (fonts, Firebase): لا يُخزَّن
   الإصدار: v3.13.0 — الصلاحيات: وضع الكشك
   ========================================================================== */

const CACHE_VERSION = 'v3.13.0';
const CACHE_NAME = 'jalabiya-' + CACHE_VERSION;

/* ==========================================================================
   PRECACHE_URLS — كل الملفات المطلوبة للعمل offline
   ========================================================================== */

const PRECACHE_URLS = [
  /* @generated:begin — scripts/gen-precache.cjs (لا تعدّل هذه القائمة يدوياً؛ شغّل: npm run gen:precache) */
  /* --- Core shell --- */
  './',
  './index.html',
  './manifest.json',

  /* --- Styles --- */
  './styles/base.css',
  './styles/components.css',
  './styles/layout.css',
  './styles/settings.css',
  './styles/themes.css',

  /* --- Assets --- */
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon.svg',

  /* --- Main entry --- */
  './src/main.js',
  './src/pwa.js',

  /* --- src/core --- */
  './src/core/config.js',
  './src/core/day-math.js',
  './src/core/day-off.js',
  './src/core/deeplink.js',
  './src/core/dom.js',
  './src/core/error-handler.js',
  './src/core/events.js',
  './src/core/sanitize.js',
  './src/core/save-error.js',
  './src/core/utils.js',

  /* --- src/data --- */
  './src/data/idb.js',
  './src/data/record-meta.js',
  './src/data/record-schema.js',
  './src/data/repository.js',
  './src/data/schema.js',
  './src/data/search.js',

  /* --- src/data/repos --- */
  './src/data/repos/activity.js',
  './src/data/repos/appointments.js',
  './src/data/repos/commitment-payments.js',
  './src/data/repos/commitments.js',
  './src/data/repos/customers.js',
  './src/data/repos/expenses.js',
  './src/data/repos/house-expenses.js',
  './src/data/repos/inventory.js',
  './src/data/repos/ledger.js',
  './src/data/repos/loan-payments.js',
  './src/data/repos/order-media.js',
  './src/data/repos/orders.js',
  './src/data/repos/payments.js',
  './src/data/repos/personal-loans.js',
  './src/data/repos/portfolio.js',
  './src/data/repos/quotes.js',
  './src/data/repos/referrals.js',
  './src/data/repos/savings-goals.js',
  './src/data/repos/settings.js',
  './src/data/repos/suppliers.js',
  './src/data/repos/trash.js',
  './src/data/repos/worker-payments.js',
  './src/data/repos/workers.js',

  /* --- src/pages --- */
  './src/pages/activity-log.js',
  './src/pages/appointments.js',
  './src/pages/calendar-day.js',
  './src/pages/calendar-grid.js',
  './src/pages/calendar-utils.js',
  './src/pages/calendar.js',
  './src/pages/cloud-sync.js',
  './src/pages/commitments-actions.js',
  './src/pages/commitments-cards.js',
  './src/pages/commitments-forms.js',
  './src/pages/commitments-load.js',
  './src/pages/commitments-logic.js',
  './src/pages/commitments-views.js',
  './src/pages/commitments.js',
  './src/pages/customers-actions.js',
  './src/pages/customers-cards.js',
  './src/pages/customers-form.js',
  './src/pages/customers-load.js',
  './src/pages/customers-logic.js',
  './src/pages/customers-measure.js',
  './src/pages/customers-views.js',
  './src/pages/customers.js',
  './src/pages/dashboard-actions.js',
  './src/pages/dashboard-customize.js',
  './src/pages/dashboard-insights.js',
  './src/pages/dashboard-kpis.js',
  './src/pages/dashboard-sections.js',
  './src/pages/dashboard.js',
  './src/pages/data-care.js',
  './src/pages/debts.js',
  './src/pages/expenses.js',
  './src/pages/financial-center.js',
  './src/pages/house-expenses.js',
  './src/pages/inventory.js',
  './src/pages/kpis.js',
  './src/pages/loans-cards.js',
  './src/pages/loans-detail.js',
  './src/pages/loans-forms.js',
  './src/pages/loans-logic.js',
  './src/pages/loans-views.js',
  './src/pages/loans.js',
  './src/pages/messages.js',
  './src/pages/occasions.js',
  './src/pages/orders-summary.js',
  './src/pages/orders-views.js',
  './src/pages/orders.js',
  './src/pages/payments-card.js',
  './src/pages/payments-form.js',
  './src/pages/payments-list.js',
  './src/pages/payments.js',
  './src/pages/pickups.js',
  './src/pages/portfolio.js',
  './src/pages/pricing-calculator.js',
  './src/pages/quotes.js',
  './src/pages/referrals-card.js',
  './src/pages/referrals-form.js',
  './src/pages/referrals-list.js',
  './src/pages/referrals.js',
  './src/pages/reports.js',
  './src/pages/season-compare.js',
  './src/pages/suppliers-forms.js',
  './src/pages/suppliers.js',
  './src/pages/tests.js',
  './src/pages/trash.js',
  './src/pages/wall.js',
  './src/pages/workers-actions.js',
  './src/pages/workers-cards.js',
  './src/pages/workers-detail.js',
  './src/pages/workers-forms.js',
  './src/pages/workers-logic.js',
  './src/pages/workers-views.js',
  './src/pages/workers.js',

  /* --- src/pages/orders --- */
  './src/pages/orders/actions.js',
  './src/pages/orders/cards.js',
  './src/pages/orders/delivery.js',
  './src/pages/orders/form-draft.js',
  './src/pages/orders/form-inputs.js',
  './src/pages/orders/form-items.js',
  './src/pages/orders/form-save.js',
  './src/pages/orders/form-schedule.js',
  './src/pages/orders/form.js',
  './src/pages/orders/item-rows.js',
  './src/pages/orders/logic.js',

  /* --- src/pages/settings --- */
  './src/pages/settings/index.js',
  './src/pages/settings/section-auto-messages.js',
  './src/pages/settings/section-backup-io.js',
  './src/pages/settings/section-backup.js',
  './src/pages/settings/section-cloud-sync.js',
  './src/pages/settings/section-data-care.js',
  './src/pages/settings/section-demo-data.js',
  './src/pages/settings/section-fonts.js',
  './src/pages/settings/section-image-compression.js',
  './src/pages/settings/section-menu-pages.js',
  './src/pages/settings/section-notifications.js',
  './src/pages/settings/section-occasions.js',
  './src/pages/settings/section-push.js',
  './src/pages/settings/section-support.js',
  './src/pages/settings/sections-data.js',
  './src/pages/settings/sections-security.js',
  './src/pages/settings/sections-system.js',
  './src/pages/settings/sections-workshop.js',

  /* --- src/security --- */
  './src/security/auth.js',
  './src/security/biometric.js',
  './src/security/data-crypto.js',
  './src/security/pin-crypto.js',
  './src/security/pin-recovery.js',
  './src/security/role-pins.js',

  /* --- src/services --- */
  './src/services/alert-rules.js',
  './src/services/amount-guard.js',
  './src/services/auto-backup.js',
  './src/services/auto-messages.js',
  './src/services/backup-crypto.js',
  './src/services/backup-nudge.js',
  './src/services/calendar-events.js',
  './src/services/capacity-strip.js',
  './src/services/catalog-page.js',
  './src/services/commitments-calculator.js',
  './src/services/contacts-import.js',
  './src/services/custom-fonts.js',
  './src/services/customer-merge-exec.js',
  './src/services/customer-merge.js',
  './src/services/daily-insights.js',
  './src/services/daily-need.js',
  './src/services/daily-tip.js',
  './src/services/dashboard-layout.js',
  './src/services/data-integrity.js',
  './src/services/debt-plan.js',
  './src/services/delivery-receipt.js',
  './src/services/demo-data.js',
  './src/services/deposit-policy.js',
  './src/services/diagnostics.js',
  './src/services/draft-manager.js',
  './src/services/fabric-calc.js',
  './src/services/financial-calculator.js',
  './src/services/financial-export.js',
  './src/services/house-expenses-export.js',
  './src/services/image-compress-core.js',
  './src/services/image-compressor.js',
  './src/services/image-options.js',
  './src/services/image-worker-client.js',
  './src/services/input-checks.js',
  './src/services/insights.js',
  './src/services/investment.js',
  './src/services/invoice-image-order.js',
  './src/services/invoice-image-output.js',
  './src/services/invoice-image-pen.js',
  './src/services/invoice-image-receipt.js',
  './src/services/invoice-image-statement.js',
  './src/services/invoice-image.js',
  './src/services/invoice-print-css.js',
  './src/services/invoice-print-order.js',
  './src/services/invoice-print-shared.js',
  './src/services/invoice-print-statement.js',
  './src/services/invoice-print.js',
  './src/services/item-catalog.js',
  './src/services/kiosk.js',
  './src/services/kpis-calculator.js',
  './src/services/lead-time.js',
  './src/services/ledger-apply.js',
  './src/services/ledger-authority.js',
  './src/services/ledger-conflicts.js',
  './src/services/ledger-flag.js',
  './src/services/ledger-report.js',
  './src/services/ledger-shadow.js',
  './src/services/ledger-union.js',
  './src/services/ledger.js',
  './src/services/loans-calculator.js',
  './src/services/media-diagnostic.js',
  './src/services/media-migration.js',
  './src/services/message-composer.js',
  './src/services/message-log.js',
  './src/services/message-queue.js',
  './src/services/message-templates.js',
  './src/services/morning-summary.js',
  './src/services/nav-groups.js',
  './src/services/notifications.js',
  './src/services/occasion-plan.js',
  './src/services/order-media-scan.js',
  './src/services/order-media.js',
  './src/services/order-profit.js',
  './src/services/order-risk.js',
  './src/services/order-scheduler.js',
  './src/services/order-timing.js',
  './src/services/partial-delivery.js',
  './src/services/payments-view.js',
  './src/services/perf-probe.js',
  './src/services/pickup-reminders.js',
  './src/services/production-board.js',
  './src/services/push-digest.js',
  './src/services/quotes.js',
  './src/services/receivables.js',
  './src/services/referral-rewards.js',
  './src/services/roles.js',
  './src/services/season-compare.js',
  './src/services/settings-tools.js',
  './src/services/signature-pref.js',
  './src/services/size-clusters.js',
  './src/services/status-notify.js',
  './src/services/storage-health.js',
  './src/services/suppliers.js',
  './src/services/system-status.js',
  './src/services/vip-rules.js',
  './src/services/wall-board.js',
  './src/services/week-visits.js',
  './src/services/wellbeing.js',
  './src/services/whatif.js',

  /* --- src/sync --- */
  './src/sync/auth-sync.js',
  './src/sync/auto-sync.js',
  './src/sync/conflict-log.js',
  './src/sync/dirty-state.js',
  './src/sync/firebase-config.js',
  './src/sync/firestore-sync.js',
  './src/sync/min-version.js',
  './src/sync/offline-queue.js',
  './src/sync/push-sync.js',
  './src/sync/record-merge.js',
  './src/sync/settings-sync.js',
  './src/sync/sync-flow.js',
  './src/sync/sync-identity.js',
  './src/sync/tombstones.js',

  /* --- src/ui --- */
  './src/ui/bottom-nav.js',
  './src/ui/capacity-strip-view.js',
  './src/ui/catalog-page-share.js',
  './src/ui/client-mode.js',
  './src/ui/collapsible.js',
  './src/ui/contacts-import-dialog.js',
  './src/ui/controls.js',
  './src/ui/customer-menu.js',
  './src/ui/customer-picker.js',
  './src/ui/daily-need-cards.js',
  './src/ui/daily-tip-card.js',
  './src/ui/dashboard-charts.js',
  './src/ui/debt-plan-card.js',
  './src/ui/delivery-receipt-dialog.js',
  './src/ui/deposit-guard.js',
  './src/ui/display-settings.js',
  './src/ui/fab.js',
  './src/ui/fabric-calc-dialog.js',
  './src/ui/form-builder.js',
  './src/ui/input-hints.js',
  './src/ui/insight-cards.js',
  './src/ui/investment-card.js',
  './src/ui/kiosk-settings.js',
  './src/ui/kiosk.js',
  './src/ui/layout.js',
  './src/ui/lead-time-strip.js',
  './src/ui/ledger-shadow-card.js',
  './src/ui/lock-failure.js',
  './src/ui/lock-screen.js',
  './src/ui/media-migration-card.js',
  './src/ui/message-composer-dialog.js',
  './src/ui/modal.js',
  './src/ui/morning-summary.js',
  './src/ui/notifications-center.js',
  './src/ui/offline-indicator.js',
  './src/ui/onboarding.js',
  './src/ui/order-image-picker.js',
  './src/ui/production-board.js',
  './src/ui/progressive-list.js',
  './src/ui/quick-preview-catalog.js',
  './src/ui/quick-preview-customer.js',
  './src/ui/quick-preview-entities.js',
  './src/ui/quick-preview-helpers.js',
  './src/ui/quick-preview-order.js',
  './src/ui/quick-preview.js',
  './src/ui/report-issue.js',
  './src/ui/role-guard.js',
  './src/ui/roles-settings.js',
  './src/ui/secret-dialog.js',
  './src/ui/sidebar.js',
  './src/ui/signature-pad.js',
  './src/ui/silent-budget.js',
  './src/ui/sub-page.js',
  './src/ui/swipe.js',
  './src/ui/sync-indicator.js',
  './src/ui/system-status-card.js',
  './src/ui/theme.js',
  './src/ui/toast.js',
  './src/ui/topbar.js',
  './src/ui/universal-search.js',
  './src/ui/update-banner.js',
  './src/ui/wellbeing-cards.js',
  './src/ui/whatif-card.js',

  /* --- src/workers --- */
  './src/workers/image-worker.js',
  /* @generated:end */
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
    })
    /* لا skipWaiting هنا: التفعيل الفوري كان يُعيد تحميل الصفحة فجأة أثناء العمل (وقد يضيّع نموذجاً مفتوحاً).
       التحديث يُفعَّل بعد موافقة المستخدم عبر رسالة SKIP_WAITING (pwa.js → notifyUpdate). */
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
          /* لا نخزّن صفحات الأخطاء (404/500) حتى لا تُعرض لاحقاً بلا إنترنت */
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
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

/* ==========================================================================
   5. PUSH — إشعارات حقيقية (FCM) تصل والتطبيق مقفول (v3.6.0)
   ==========================================================================
   الخادمة ترسل رسائل data فقط: { title, body, url, tag }.
   - لو التطبيق مفتوح ومرئي: لا نعرض إشعار نظام (مركز التنبيهات داخل التطبيق يغطي) ونُبلغ الصفحة.
   - النقر: يركّز نافذة مفتوحة أو يفتح التطبيق على الصفحة المطلوبة (hash فقط).
   ========================================================================== */
function parsePushPayload(event) {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) {
    try { p = { notification: { body: event.data.text() } }; } catch (e2) { p = {}; }
  }
  const d = (p && p.data) || {};
  const n = (p && p.notification) || {};
  return {
    title: String(d.title || n.title || 'ورشة الجلابيب').slice(0, 120),
    body: String(d.body || n.body || '').slice(0, 400),
    url: /^#\/[a-z0-9\/_-]*$/i.test(String(d.url || '')) ? String(d.url) : '#/dashboard',
    tag: String(d.tag || 'jalabiya-push').slice(0, 60),
  };
}

self.addEventListener('push', (event) => {
  const msg = parsePushPayload(event);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.some((w) => w.visibilityState === 'visible');
    if (visible) {
      wins.forEach((w) => { try { w.postMessage({ type: 'PUSH_RECEIVED', title: msg.title, body: msg.body }); } catch (e) { /* ignore */ } });
      return;
    }
    await self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      renotify: false,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: msg.url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '#/dashboard';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        try { w.postMessage({ type: 'PUSH_NAVIGATE', hash }); } catch (e) { /* ignore */ }
        return w.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow('./' + hash);
  })());
});
