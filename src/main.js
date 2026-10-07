/* ==========================================================================
   main.js — نقطة الدخول + كل الميزات
   ==========================================================================
   - Router + Ctrl+K + Auto-Backup + PWA + Onboarding + Client Mode + Notifications
   - صفحة الاختبارات معطَّلة مؤقتاً.
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
let runAutoBackupIfDue, registerServiceWorker, maybeStartOnboarding;
let toggleClientMode, isClientMode, applyClientMode;
let startAutoCheck as startNotificationCheck;
try {
  ({ el } = await import('./core/dom.js'));
  ({ toast } = await import('./ui/toast.js'));
  ({ createLayout } = await import('./ui/layout.js'));
  ({ events } = await import('./core/events.js'));
  ({ openUniversalSearch } = await import('./ui/universal-search.js'));
  ({ runAutoBackupIfDue } = await import('./services/auto-backup.js'));
  ({ registerServiceWorker } = await import('./pwa.js'));
  ({ maybeStartOnboarding } = await import('./ui/onboarding.js'));
  ({ toggleClientMode, isClientMode, applyClientMode } = await import('./ui/client-mode.js'));
  ({ startAutoCheck: startNotificationCheck } = await import('./services/notifications.js'));
} catch (e) {
  showError('Failed to load core modules', e);
  throw e;
}

async function loadPageModule(pageId) {
  try {
    switch (pageId) {
      case 'dashboard':          return await import('./pages/dashboard.js');
      case 'customers':          return await import('./pages/customers.js');
      case 'orders':             return await import('./pages/orders.js');
      case 'payments':           return await import('./pages/payments.js');
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
      default:                   return null;
    }
  } catch (e) {
    console.warn('[Main] Page "' + pageId + '" not found.');
    return null;
  }
}

const SIDEBAR_SECTIONS = [
  { title: 'الرئيسية', items: [
    { id: 'dashboard', icon: '🏠', label: 'لوحة التحكم' },
  ]},
  { title: 'العمليات', items: [
    { id: 'customers', icon: '👥', label: 'العملاء' },
    { id: 'orders',    icon: '📋', label: 'الطلبات' },
    { id: 'calendar',  icon: '📅', label: 'تقويم المواعيد' },
    { id: 'payments',  icon: '💰', label: 'الدفعات' },
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
  ]},
  { title: 'النظام', items: [
    { id: 'activity-log', icon: '📜', label: 'سجل النشاط' },
    { id: 'trash',        icon: '🗑️', label: 'سلة المحذوفات' },
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
  customers:            'customersPage',
  orders:               'ordersPage',
  payments:             'paymentsPage',
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
};

let currentPage = null;

/* --- زر وضع العميل --- */
function buildClientModeAction() {
  const active = isClientMode();
  return {
    id: 'client-mode',
    icon: active ? '👁️' : '👁️‍🗨️',
    label: active ? 'إلغاء وضع العميل' : 'تفعيل وضع العميل',
    onClick: () => {
      const next = toggleClientMode();
      layout.topbar.setActions(buildTopbarActions());
      toast.info(next ? '👁️ وضع العميل مُفعَّل' : '👁️ وضع العميل مُعطَّل');
    },
  };
}

function buildTopbarActions() {
  return [
    { id: 'search', icon: '🔍', label: 'بحث شامل (Ctrl+K)', onClick: () => openUniversalSearch() },
    buildClientModeAction(),
    { id: 'theme', icon: '🌙', label: 'تبديل الثيم', onClick: () => toast.info('الوضع الليلي — قريباً') },
  ];
}

const layout = createLayout({
  sidebar: {
    title: 'ورشة الجلابيب',
    subtitle: 'V3 — v3.0.0',
    logo: '🧵',
    sections: SIDEBAR_SECTIONS,
    activeId: 'dashboard',
    footer: '© 2026 — v3.0.0',
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

async function renderPage(fullRoute) {
  if (fullRoute === 'tests' || fullRoute === '#/tests') {
    location.hash = '#/dashboard';
    return;
  }

  const id = getBaseRoute(fullRoute);
  const subRoute = getSubRoute(fullRoute);

  const item = ALL_ITEMS.find((i) => i.id === id);
  if (item) {
    layout.setTitle(item.label);
    layout.setActivePage(id);
  }

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { console.error(e); }
  }
  currentPage = null;

  const mod = await loadPageModule(id);
  const exportName = MODULE_EXPORT_MAP[id];
  if (mod && exportName && mod[exportName]) {
    const container = el('div', {});
    layout.setContent(container);
    await mod[exportName].render(container, subRoute);
    currentPage = mod[exportName];
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

/* 🗄️ النسخ الاحتياطي التلقائي */
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

/* ✨ الجولة التعريفية */
try {
  maybeStartOnboarding({
    onFinish: ({ skipped }) => {
      console.log('[Onboarding]', skipped ? '⏭️ تم التخطّي' : '✅ تم الإكمال');
    },
  });
} catch (err) {
  console.warn('[Onboarding] فشل التشغيل:', err);
}

/* 🔔 الإشعارات — فحص دوري كل 30 دقيقة (فقط إن كان الإذن ممنوحاً) */
try {
  startNotificationCheck();
} catch (err) {
  console.warn('[Notifications] فشل التشغيل:', err);
}
