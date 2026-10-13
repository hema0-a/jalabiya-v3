/* ==========================================================================
   main.js — نقطة الدخول + كل الميزات
   ==========================================================================
   - Router + Ctrl+K + Auto-Backup + PWA + Onboarding + Client Mode + Notifications
   - صفحة الاختبارات متاحة عبر #/tests (أداة تطوير — لا تظهر في السايدبار).
   - معالج الأخطاء العالمي مُفعَّل لالتقاط أخطاء التشغيل.
   - FAB (إجراءات سريعة) مُفعَّل على كل الصفحات عدا #/tests.
   - الوضع الليلي (Dark Mode) مع حفظ التفضيل.
   - مؤشر "غير متصل" (Offline Indicator) مع تنبيه عند فقدان الاتصال.
   - مركز التنبيهات (Notifications Center) مع عدّاد في Topbar.
   - Service Worker مُفعَّل (يمكن تعطيله عبر ?nosw=1).
   ========================================================================== */

const app = document.getElementById('app');
if (app) {
  while (app.firstChild) app.removeChild(app.firstChild);
}

function showError(title, err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : '';
  if (!app) return;
  while (app.firstChild) app.removeChild(app.firstChild);
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:16px;margin:0;font-family:monospace;direction:ltr;text-align:left;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#2a0000;color:#ff8080;min-height:100vh;box-sizing:border-box';
  pre.textContent = '❌ ' + title + '\n\n' + msg + '\n\n' + stack;
  app.appendChild(pre);
}

let el, toast, createLayout, events, openUniversalSearch;
let runAutoBackupIfDue, verifyLatestBackupIfDue, registerServiceWorker, maybeStartOnboarding;
let toggleClientMode, isClientMode, applyClientMode;
let startNotificationCheck;
let installErrorHandler;
let mountFab;
let applyTheme, toggleTheme, getThemeIcon, getThemeLabel;
let mountOffline;
let startAutoSync, mountSyncIndicator, requestPersistence;
let mountNotifications, openNotifications;
let ensureUnlocked, installAutoLock;
let APP_CONFIG;
try {
  /* تحميل متوازٍ: كان 19 await متتالياً (شلّال طلبات) فيتضاعف زمن الإقلاع على شبكة الجوال */
  const [
    cfg, dom, toastMod, layoutMod, eventsMod, searchMod, backupMod, pwaMod, onboardingMod,
    clientMod, notifMod, errMod, fabMod, themeMod, offlineMod, autoSyncMod, syncIndMod, notifCenterMod, lockMod, storageMod,
  ] = await Promise.all([
    import('./core/config.js'),
    import('./core/dom.js'),
    import('./ui/toast.js'),
    import('./ui/layout.js'),
    import('./core/events.js'),
    import('./ui/universal-search.js'),
    import('./services/auto-backup.js'),
    import('./pwa.js'),
    import('./ui/onboarding.js'),
    import('./ui/client-mode.js'),
    import('./services/notifications.js'),
    import('./core/error-handler.js'),
    import('./ui/fab.js'),
    import('./ui/theme.js'),
    import('./ui/offline-indicator.js'),
    import('./sync/auto-sync.js'),
    import('./ui/sync-indicator.js'),
    import('./ui/notifications-center.js'),
    import('./ui/lock-screen.js'),
    import('./services/storage-health.js'),
  ]);
  ({ APP_CONFIG } = cfg);
  ({ el } = dom);
  ({ toast } = toastMod);
  ({ createLayout } = layoutMod);
  ({ events } = eventsMod);
  ({ openUniversalSearch } = searchMod);
  ({ runAutoBackupIfDue, verifyLatestBackupIfDue } = backupMod);
  ({ registerServiceWorker } = pwaMod);
  ({ maybeStartOnboarding } = onboardingMod);
  ({ toggleClientMode, isClientMode, applyClientMode } = clientMod);
  ({ startAutoCheck: startNotificationCheck } = notifMod);
  ({ install: installErrorHandler } = errMod);
  ({ mount: mountFab } = fabMod);
  ({ applyTheme, toggleTheme, getThemeIcon, getThemeLabel } = themeMod);
  ({ mount: mountOffline } = offlineMod);
  ({ start: startAutoSync } = autoSyncMod);
  ({ mount: mountSyncIndicator } = syncIndMod);
  ({ mount: mountNotifications, open: openNotifications } = notifCenterMod);
  ({ ensureUnlocked, installAutoLock } = lockMod);
  ({ requestPersistence } = storageMod);
} catch (e) {
  showError('Failed to load core modules', e);
  throw e;
}

/* 🔒 شاشة القفل: لا تُرسم أي بيانات قبل إدخال الرقم السري (إن كان مُعيَّناً) */
try {
  await ensureUnlocked();
  installAutoLock();
} catch (e) {
  console.error('[Lock] تعذّر تشغيل شاشة القفل:', e);
  /* إن كان هناك PIN: لا نفتح البيانات عند الفشل (fail-closed) ولا نترك شاشة بيضاء —
     نعرض رسالة مع زر إعادة المحاولة. وإن لم يكن هناك PIN نكمل طبيعياً. */
  let pinSet = false;
  try { pinSet = !!(localStorage.getItem('jalabiya_v3_pin_hash') && localStorage.getItem('jalabiya_v3_pin_salt')); } catch (_) { /* ignore */ }
  if (pinSet) {
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.removeAttribute('inert');
      appEl.removeAttribute('aria-hidden');
      appEl.style.visibility = 'visible';
      appEl.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'boot';
      box.style.flexDirection = 'column';
      box.style.gap = '12px';
      const msg = document.createElement('div');
      msg.textContent = '🔒 تعذّر عرض شاشة القفل. لحماية بياناتك لم يُفتح التطبيق.';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'إعادة المحاولة';
      btn.style.cssText = 'padding:10px 20px;border-radius:10px;border:0;background:#1F6D57;color:#fff;font:inherit;cursor:pointer';
      btn.addEventListener('click', () => location.reload());
      box.append(msg, btn);
      appEl.appendChild(box);
    }
    throw e;
  }
}

async function loadPageModule(pageId) {
  try {
    switch (pageId) {
      case 'dashboard':          return await import('./pages/dashboard.js');
      case 'customers':          return await import('./pages/customers.js');
      case 'orders':             return await import('./pages/orders.js');
      case 'appointments':       return await import('./pages/appointments.js');
      case 'payments':           return await import('./pages/payments.js');
      case 'debts':              return await import('./pages/debts.js');
      case 'pickups':            return await import('./pages/pickups.js');
      case 'messages':           return await import('./pages/messages.js');
      case 'quotes':             return await import('./pages/quotes.js');
      case 'season-compare':     return await import('./pages/season-compare.js');
      case 'data-care':          return await import('./pages/data-care.js');
      case 'inventory':          return await import('./pages/inventory.js');
      case 'workers':            return await import('./pages/workers.js');
      case 'expenses':           return await import('./pages/expenses.js');
      case 'reports':            return await import('./pages/reports.js');
      case 'settings':           return await import('./pages/settings/index.js');
      case 'calendar':           return await import('./pages/calendar.js');
      case 'pricing-calculator': return await import('./pages/pricing-calculator.js');
      case 'financial-center':   return await import('./pages/financial-center.js');
      case 'kpis':               return await import('./pages/kpis.js');
      case 'portfolio':          return await import('./pages/portfolio.js');
      case 'commitments':        return await import('./pages/commitments.js');
      case 'house-expenses':     return await import('./pages/house-expenses.js');
      case 'loans':              return await import('./pages/loans.js');
      case 'referrals':          return await import('./pages/referrals.js');
      case 'occasions':          return await import('./pages/occasions.js');
      case 'activity-log':       return await import('./pages/activity-log.js');
      case 'trash':              return await import('./pages/trash.js');
      case 'cloud-sync':         return await import('./pages/cloud-sync.js');
      case 'wall':               return await import('./pages/wall.js');
      case 'tests':              return await import('./pages/tests.js');
      default:                   return null;
    }
  } catch (e) {
    console.error('[Main] فشل تحميل صفحة "' + pageId + '":', e);
    return { __loadError: e };
  }
}

/* لوحة خطأ ودّية داخل منطقة المحتوى بدل صفحة فارغة صامتة */
function buildErrorPanel(title, err) {
  const msg = (err && err.message) ? err.message : String(err);
  return el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon' }, '⚠️'),
    el('h2', { className: 'empty-state__title', text: title }),
    el('p', { className: 'empty-state__text' }, msg),
    el('button', {
      className: 'btn btn--primary',
      type: 'button',
      onClick: () => renderPage(getHashPage()),
    }, '🔄 إعادة المحاولة'),
  ]);
}

const SIDEBAR_SECTIONS = [
  { title: 'الرئيسية', items: [
    { id: 'dashboard', icon: '🏠', label: 'لوحة التحكم' },
    { id: 'wall',      icon: '📺', label: 'شاشة الورشة' },
  ]},
  { title: 'العمليات', items: [
    { id: 'customers', icon: '👥', label: 'العملاء' },
    { id: 'orders',    icon: '📋', label: 'الطلبات' },
    { id: 'appointments', icon: '🗓️', label: 'المواعيد' },
    { id: 'calendar',  icon: '📅', label: 'تقويم المواعيد' },
    { id: 'payments',  icon: '💰', label: 'الدفعات' },
    { id: 'debts',     icon: '🧾', label: 'مستحقات العملاء' },
    { id: 'pickups',   icon: '📦', label: 'جاهز للاستلام' },
    { id: 'messages',  icon: '📣', label: 'رسائل اليوم' },
    { id: 'quotes',    icon: '📝', label: 'عروض الأسعار' },
  ]},
  { title: 'إدارة الورشة', items: [
    { id: 'inventory',          icon: '📦', label: 'المخزون' },
    { id: 'workers',            icon: '👷', label: 'العمال' },
    { id: 'expenses',           icon: '💸', label: 'مصروفات الورشة' },
    { id: 'pricing-calculator', icon: '🧮', label: 'حاسبة التسعير' },
  ]},
  { title: 'التسويق والعرض', items: [
    { id: 'portfolio', icon: '📸', label: 'معرض الأعمال' },
    { id: 'referrals', icon: '🤝', label: 'الإحالات' },
  ]},
  { title: 'المالية الشخصية', items: [
    { id: 'commitments',    icon: '💳', label: 'الالتزامات' },
    { id: 'house-expenses', icon: '🏠', label: 'مصاريف البيت' },
    { id: 'loans',          icon: '💵', label: 'القروض' },
  ]},
  { title: 'المواسم والمناسبات', items: [
    { id: 'occasions', icon: '🎉', label: 'المواسم والأعياد' },
    { id: 'season-compare', icon: '📊', label: 'مقارنة المواسم' },
  ]},
  { title: 'النظام', items: [
    { id: 'activity-log', icon: '📜', label: 'سجل النشاط' },
    { id: 'trash',        icon: '🗑️', label: 'سلة المحذوفات' },
    { id: 'data-care',    icon: '🧰', label: 'صيانة البيانات' },
  ]},
  { title: 'التحليل والتقارير', items: [
    { id: 'financial-center', icon: '💰', label: 'المركز المالي' },
    { id: 'kpis',             icon: '📊', label: 'مؤشرات الأداء' },
    { id: 'reports',          icon: '📈', label: 'التقارير' },
  ]},
  { title: 'النظام المتقدم', items: [
    { id: 'cloud-sync', icon: '☁️', label: 'المزامنة السحابية' },
    { id: 'settings',   icon: '⚙️', label: 'الإعدادات' },
  ]},
];

const ALL_ITEMS = SIDEBAR_SECTIONS.flatMap((s) => s.items);

const MODULE_EXPORT_MAP = {
  dashboard:            'dashboardPage',
  wall:                 'wallPage',
  customers:            'customersPage',
  orders:               'ordersPage',
  appointments:         'appointmentsPage',
  payments:             'paymentsPage',
  debts:                'debtsPage',
  pickups:              'pickupsPage',
  messages:             'messagesPage',
  quotes:               'quotesPage',
  'season-compare':     'seasonComparePage',
  'data-care':          'dataCarePage',
  inventory:            'inventoryPage',
  workers:              'workersPage',
  expenses:             'expensesPage',
  reports:              'reportsPage',
  settings:             'settingsPage',
  calendar:             'calendarPage',
  'pricing-calculator': 'pricingCalculatorPage',
  'financial-center':   'financialCenterPage',
  'kpis':               'kpisPage',
  'portfolio':          'portfolioPage',
  'commitments':        'commitmentsPage',
  'house-expenses':     'houseExpensesPage',
  'loans':              'loansPage',
  'referrals':          'referralsPage',
  'occasions':          'occasionsPage',
  'activity-log':       'activityLogPage',
  'trash':              'trashPage',
  'cloud-sync':         'cloudSyncPage',
  'tests':              'testsPage',
};

let currentPage = null;

/* --- حالة عدّاد التنبيهات (يُحدَّث من وحدة notifications-center) --- */
let _notifCount = 0;

/**
 * تحديث عدّاد التنبيهات وإعادة رسم أزرار Topbar.
 * @param {number} count
 */
function updateNotificationBadge(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n === _notifCount) return;   /* لا إعادة رسم بلا تغيير */
  _notifCount = n;
  try {
    layout.topbar.setActions(buildTopbarActions());
  } catch (e) {
    console.warn('[Notifications] badge update failed:', e);
  }
}

/* --- زر وضع العميل --- */
function buildClientModeAction() {
  const active = isClientMode();
  return {
    id: 'client-mode',
    icon: active ? '👁️' : '👁️🗨️',
    label: active ? 'إلغاء وضع العميل' : 'تفعيل وضع العميل',
    onClick: () => {
      const next = toggleClientMode();
      layout.topbar.setActions(buildTopbarActions());
      toast.info(next ? '👁️ وضع العميل مُفعَّل' : '👁️ وضع العميل مُعطَّل');
    },
  };
}

/* --- زر الوضع الليلي --- */
function buildThemeAction() {
  const dark = document.body.classList.contains('dark-mode');
  return {
    id: 'theme',
    icon: dark ? '☀️' : '🌙',
    label: dark ? 'الوضع النهاري' : 'الوضع الليلي',
    onClick: () => {
      const nowDark = toggleTheme();
      layout.topbar.setActions(buildTopbarActions());
      toast.info(nowDark ? '🌙 الوضع الليلي' : '☀️ الوضع النهاري');
    },
  };
}

/* --- زر التنبيهات --- */
function buildNotificationsAction() {
  const icon = _notifCount > 0 ? '🔔' : '🔕';
  const label = _notifCount > 0
    ? 'التنبيهات (' + _notifCount + ')'
    : 'التنبيهات';
  return {
    id: 'notifications',
    icon,
    label,
    onClick: () => {
      try { openNotifications(); }
      catch (e) { console.warn('[Notifications] open failed:', e); }
    },
  };
}

function buildTopbarActions() {
  return [
    { id: 'search', icon: '🔍', label: 'بحث شامل (Ctrl+K)', onClick: () => openUniversalSearch() },
    buildNotificationsAction(),
    buildClientModeAction(),
    buildThemeAction(),
  ];
}

const layout = createLayout({
  sidebar: {
    title: 'ورشة الجلابيب',
    subtitle: 'V3 — v' + APP_CONFIG.version,
    logo: '🧵',
    sections: SIDEBAR_SECTIONS,
    activeId: 'dashboard',
    footer: '© 2026 — v' + APP_CONFIG.version,
  },
  topbar: {
    title: 'لوحة التحكم',
    actions: buildTopbarActions(),
    showMenu: true,
  },
  onPageSelect: (id) => {
    const targetHash = '#/' + id;
    if (location.hash !== targetHash) location.hash = targetHash;
    else renderPage(id);
  },
});

app.appendChild(layout.node);

/* 🛡️ تفعيل معالج الأخطاء العالمي — مبكرًا ليلتقط أخطاء التشغيل */
try {
  if (typeof installErrorHandler === 'function') {
    installErrorHandler();
  }
} catch (err) {
  console.warn('[ErrorHandler] فشل التثبيت:', err);
}

/* 🌙 تفعيل الوضع الليلي — قبل أي رسم للصفحات */
try {
  if (typeof applyTheme === 'function') {
    applyTheme();
    layout.topbar.setActions(buildTopbarActions());
  }
} catch (err) {
  console.warn('[Theme] فشل التطبيق:', err);
}

/* 🎨 تطبيق إعدادات المظهر والعرض المحفوظة (ألوان، خلفية، خط، حجم، تباين، مضغوط) */
try {
  const { settings: settingsRepo } = await import('./data/repos/settings.js');
  const { applyAllSettings } = await import('./ui/display-settings.js');
  applyAllSettings(await settingsRepo.get());
} catch (err) {
  console.warn('[Display] فشل تطبيق إعدادات المظهر:', err);
}

/* ⚡ FAB — إجراءات سريعة على كل الصفحات عدا #/tests */
try {
  if (typeof mountFab === 'function') {
    mountFab();
  }
} catch (err) {
  console.warn('[FAB] فشل التثبيت:', err);
}

/* ☀️ ملخص الصباح: مرة كل يوم عند أول فتح (لا يظهر في #/tests ولا #/wall) */
setTimeout(() => {
  try {
    const base = String(location.hash || '').replace(/^#\/?/, '').split('/')[0] || 'dashboard';
    if (base === 'tests' || base === 'wall') return;
    import('./ui/morning-summary.js').then((m) => m.maybeShowMorningSummary()).catch((e) => console.warn('[Morning] unavailable:', e));
  } catch (e) { console.warn('[Morning] failed:', e); }
}, 2500);

/* 📱 شريط التنقّل السفلي (يد واحدة) — جوال فقط، ويُوقَف من الإعدادات */
try {
  import('./ui/bottom-nav.js').then((m) => m.mountBottomNav(layout)).catch((e) => console.warn('[BottomNav] unavailable:', e));
} catch (err) {
  console.warn('[BottomNav] فشل التثبيت:', err);
}

/* 🔴 مؤشر "غير متصل" — يستمع لـ online/offline */
try {
  if (typeof mountOffline === 'function') {
    mountOffline();
  }
} catch (err) {
  console.warn('[OfflineIndicator] فشل التثبيت:', err);
}

/* 💾 طلب «تخزين دائم» كي لا يحذف المتصفح البيانات المحلية عند امتلاء الجهاز (صامت، لا يُلقي أخطاء) */
try {
  if (typeof requestPersistence === 'function') requestPersistence();
} catch (err) {
  console.warn('[StorageHealth] تعذّر الطلب:', err);
}

/* ☁️ الرفع التلقائي الهادئ + تنبيه المزامنة (لا يعمل قبل فتح القفل) */
try {
  if (typeof startAutoSync === 'function') startAutoSync();
  if (typeof mountSyncIndicator === 'function') mountSyncIndicator();
} catch (err) {
  console.warn('[AutoSync] فشل التشغيل:', err);
}

/* 🔔 مركز التنبيهات — عدّاد + قائمة موحّدة */
try {
  if (typeof mountNotifications === 'function') {
    mountNotifications({
      onBadgeChange: (count) => updateNotificationBadge(count),
    });
  }
} catch (err) {
  console.warn('[NotificationsCenter] فشل التثبيت:', err);
}

try { applyClientMode(); } catch (e) { console.warn('[ClientMode]', e); }

events.on('topbar:setBack', (handler) => {
  layout.topbar.setBackAction(typeof handler === 'function' ? handler : null);
});

/* ⚡ Ctrl+K / Cmd+K → بحث شامل */
document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modifier = isMac ? e.metaKey : e.ctrlKey;

  if (modifier && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    try { openUniversalSearch(); }
    catch (err) { console.error('[Main] search open failed:', err); }
  }
});

function buildPlaceholderPage(title, icon) {
  return el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon' }, icon),
    el('h2', { className: 'empty-state__title', text: title }),
    el('p', { className: 'empty-state__text' }, 'قيد البناء — سيُبنى حسب تصميم V2.'),
  ]);
}

const PLACEHOLDER_PAGES = {};

function getBaseRoute(fullRoute) {
  const s = String(fullRoute || '').replace(/^#\/?/, '');
  return s.split('/')[0] || 'dashboard';
}

function getSubRoute(fullRoute) {
  const s = String(fullRoute || '').replace(/^#\/?/, '');
  const parts = s.split('/');
  return parts[1] || null;
}

let _renderToken = 0;

async function renderPage(fullRoute) {
  const token = ++_renderToken;   /* يمنع أن تكتب صفحة قديمة فوق صفحة أحدث */
  const id = getBaseRoute(fullRoute);
  const subRoute = getSubRoute(fullRoute);

  const item = ALL_ITEMS.find((i) => i.id === id);
  if (item) {
    layout.setTitle(item.label);
    layout.setActivePage(id);
  } else if (id === 'tests') {
    layout.setTitle('🧪 الاختبارات');
  }

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { console.error(e); }
  }
  currentPage = null;

  const mod = await loadPageModule(id);
  if (token !== _renderToken) return;

  if (mod && mod.__loadError) {
    layout.setContent(buildErrorPanel('تعذّر تحميل الصفحة', mod.__loadError));
    return;
  }

  const exportName = MODULE_EXPORT_MAP[id];
  if (mod && exportName && mod[exportName]) {
    const container = el('div', {});
    layout.setContent(container);
    try {
      await mod[exportName].render(container, subRoute);
    } catch (e) {
      console.error('[Main] خطأ أثناء رسم صفحة "' + id + '":', e);
      if (token === _renderToken) {
        layout.setContent(buildErrorPanel('حدث خطأ أثناء عرض الصفحة', e));
      }
      return;
    }
    if (token === _renderToken) currentPage = mod[exportName];
    return;
  }

  if (PLACEHOLDER_PAGES[id]) {
    const [title, icon] = PLACEHOLDER_PAGES[id];
    layout.setContent(buildPlaceholderPage(title, icon));
    return;
  }

  layout.setContent(buildPlaceholderPage('صفحة', '📄'));
}

function getHashPage() {
  const hash = (location.hash || '').replace(/^#\/?/, '');
  return hash || 'dashboard';
}

window.addEventListener('hashchange', () => {
  renderPage(getHashPage());
});

/* ⚡ تشغيل أولي */
renderPage(getHashPage());

/* 👤 ضغطة مطوّلة على اسم عميل ⟵ قائمة (اتصال/واتساب/ملف) */
import('./ui/customer-menu.js').then((m) => m.installCustomerLongPress()).catch((e) => console.warn('[Main] customer menu unavailable:', e));

/* 🗄️ النسخ الاحتياطي التلقائي — بعد ثانيتين */
setTimeout(() => {
  (async () => {
    try {
      const res = await runAutoBackupIfDue();
      if (res && res.ran) {
        console.log('[AutoBackup] ✅ تم إنشاء نسخة:', res.id, '(' + (res.sizeKB || 0) + ' KB)');
      } else if (res && res.reason === 'not-due') {
        console.log('[AutoBackup] ℹ️ غير مستحق بعد');
      } else if (res && res.reason === 'disabled') {
        console.log('[AutoBackup] ⏸️ معطَّل من الإعدادات');
      } else {
        console.log('[AutoBackup] ⚠️ لم يُنشأ:', res && res.reason);
      }
      /* 🧪 فحص سلامة أحدث نسخة (أسبوعياً أو عند ظهور نسخة جديدة) — قراءة فقط */
      try {
        const v = await verifyLatestBackupIfDue();
        if (v && !v.ok) {
          console.warn('[BackupVerify] ❌', v.errors);
          toast.warning('⚠️ آخر نسخة احتياطية فيها مشكلة — افتح «صيانة البيانات» لتفاصيل الفحص', { duration: 9000 });
        } else if (v) {
          console.log('[BackupVerify] ✅ النسخة سليمة', v.warnings.length ? '(مع تحذيرات)' : '');
        }
      } catch (e) { console.warn('[BackupVerify] فشل الفحص:', e); }
    } catch (err) {
      console.warn('[AutoBackup] ❌ فشل:', err);
    }
  })();
}, 2000);

/* 🚀 PWA — تسجيل Service Worker */
try {
  registerServiceWorker();
} catch (err) {
  console.warn('[PWA] فشل تسجيل SW:', err);
}

/* ✨ الجولة التعريفية — تظهر عند أول فتح */
try {
  maybeStartOnboarding({
    onFinish: ({ skipped }) => {
      console.log('[Onboarding]', skipped ? '⏭️ تم التخطّي' : '✅ تم الإكمال');
    },
  });
} catch (err) {
  console.warn('[Onboarding] فشل التشغيل:', err);
}

/* 🔔 الإشعارات — فحص دوري كل 30 دقيقة */
try {
  startNotificationCheck();
} catch (err) {
  console.warn('[Notifications] فشل التشغيل:', err);
}
