/* ==========================================================================
   main.js — نقطة الدخول + App Shell + Router
   ==========================================================================
   Service Worker معطَّل مؤقتاً أثناء التطوير (V3.1 يُعيد تفعيله).
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

/* Service Worker معطَّل مؤقتاً أثناء التطوير
   سيُفعَّل في V3.1 بعد اكتمال كل الصفحات.
   السبب: منع Cache Issues المتكررة. */

let el, toast, createLayout;
try {
  ({ el } = await import('./core/dom.js'));
  ({ toast } = await import('./ui/toast.js'));
  ({ createLayout } = await import('./ui/layout.js'));
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
      case 'tests':              return await import('./tests/index.js');
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
};

let currentPage = null;

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
    actions: [
      { id: 'theme', icon: '🌙', label: 'تبديل الثيم', onClick: () => toast.info('الوضع الليلي — قريباً') },
    ],
    showMenu: true,
  },
  onPageSelect: (id) => {
    const targetHash = '#/' + id;
    if (location.hash !== targetHash) location.hash = targetHash;
    else renderPage(id);
  },
});

app.appendChild(layout.node);

function buildPlaceholderPage(title, icon) {
  return el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon' }, icon),
    el('h2', { className: 'empty-state__title', text: title }),
    el('p', { className: 'empty-state__text' }, 'قيد البناء — سيُبنى حسب تصميم V2.'),
  ]);
}

async function buildTestsPage(testsIndex) {
  const wrap = el('div', {});
  const pre = el('pre', {
    style: {
      padding: '16px', margin: '0',
      fontFamily: 'monospace', direction: 'ltr',
      textAlign: 'left', fontSize: '12px', lineHeight: '1.5',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      background: '#111', color: '#0f0',
      borderRadius: '8px', boxSizing: 'border-box',
    },
  });
  const lines = [];
  const paint = () => { pre.textContent = lines.join('\n'); };
  lines.push('🚀 Running tests...');
  paint();
  wrap.appendChild(pre);
  try {
    const result = await testsIndex.runAll((header, body) => {
      lines.push(header);
      if (body) lines.push(body);
      paint();
    });
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🏁 TOTAL: ' + result.totalPassed + '/' + result.totalTests + ' tests passed');
    paint();
  } catch (err) {
    lines.push('');
    lines.push('❌ Failed: ' + (err.message || String(err)));
    paint();
  }
  return wrap;
}

const PLACEHOLDER_PAGES = {
  'referrals': ['الإحالات', '🤝'],
  'loans':     ['القروض', '💵'],
  'occasions': ['المواسم والأعياد', '🎉'],
  'activity-log': ['سجل النشاط', '📜'],
  'trash':     ['سلة المحذوفات', '🗑️'],
  'cloud-sync': ['المزامنة السحابية', '☁️'],
};

async function renderPage(id) {
  const item = ALL_ITEMS.find((i) => i.id === id);
  if (item) {
    layout.setTitle(item.label);
    layout.setActivePage(id);
  }

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { console.error(e); }
  }
  currentPage = null;

  if (id === 'tests') {
  layout.setTitle('الاختبارات');
  let testsMod = null;
  let importError = null;
  try {
    testsMod = await import('./tests/index.js');
  } catch (err) {
    importError = err;
    console.error('[Tests import failed]', err);
  }
  if (testsMod) {
    layout.setContent(await buildTestsPage(testsMod));
  } else {
    const errBox = el('div', { style: { padding: '16px' } });
    errBox.appendChild(el('h2', {
      style: { color: '#C62828', marginBottom: '8px', fontSize: '18px' },
    }, '❌ فشل تحميل الاختبارات'));
    errBox.appendChild(el('p', {
      style: { fontSize: '13px', color: '#666', marginBottom: '12px' },
    }, 'السبب (انسخه وأرسله):'));
    const pre = el('pre', {
      style: {
        padding: '12px', margin: '0', fontFamily: 'monospace',
        direction: 'ltr', textAlign: 'left', fontSize: '12px',
        lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: '#2a0000', color: '#ff8080', borderRadius: '8px',
        maxHeight: '60vh', overflow: 'auto',
      },
    });
    pre.textContent =
      (importError && importError.message ? importError.message : 'خطأ غير معروف') +
      '\n\n' +
      (importError && importError.stack ? importError.stack : '');
    errBox.appendChild(pre);
    errBox.appendChild(el('button', {
      style: {
        marginTop: '12px', padding: '10px 16px', background: '#1F6D57',
        color: '#fff', border: 'none', borderRadius: '8px',
        fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
      },
      onClick: () => location.reload(),
    }, '🔄 إعادة المحاولة'));
    layout.setContent(errBox);
  }
  return;
  }

  const mod = await loadPageModule(id);
  const exportName = MODULE_EXPORT_MAP[id];
  if (mod && exportName && mod[exportName]) {
    const container = el('div', {});
    layout.setContent(container);
    await mod[exportName].render(container);
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

renderPage(getHashPage());
