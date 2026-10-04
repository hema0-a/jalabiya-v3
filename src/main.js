/* ==========================================================================
   main.js — نقطة الدخول + App Shell + Router
   ==========================================================================
   صفحة "الرئيسية" = Dashboard حقيقي (KPIs من البيانات).
   صفحة "الاختبارات" = تشغيل كل الوحدات.
   باقي الصفحات = قيد التطوير.
   ========================================================================== */

const app = document.getElementById('app');
if (app) app.innerHTML = '';

/* --- شاشة خطأ --- */
function showError(title, err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : '';
  if (!app) return;
  app.innerHTML = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:16px;margin:0;font-family:monospace;direction:ltr;text-align:left;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#2a0000;color:#ff8080;min-height:100vh;box-sizing:border-box';
  pre.textContent = '❌ ' + title + '\n\n' + msg + '\n\n' + stack;
  app.appendChild(pre);
}

/* --- الاستيرادات --- */
let el, toast, createLayout, testsIndex;
let customersPage, ordersPage, dashboardPage;
try {
  ({ el } = await import('./core/dom.js'));
  ({ toast } = await import('./ui/toast.js'));
  ({ createLayout } = await import('./ui/layout.js'));
  testsIndex = await import('./tests/index.js');
  ({ customersPage } = await import('./pages/customers.js'));
  ({ ordersPage } = await import('./pages/orders.js'));
  ({ dashboardPage } = await import('./pages/dashboard.js'));
} catch (e) {
  showError('Failed to load modules', e);
  throw e;
}

/* --- قائمة السايدبار --- */
const SIDEBAR_ITEMS = [
  { id: 'home',         icon: '🏠', label: 'الرئيسية' },
  { id: 'customers',    icon: '👥', label: 'العملاء' },
  { id: 'orders',       icon: '📦', label: 'الطلبات' },
  { id: 'payments',     icon: '💰', label: 'الدفعات' },
  { id: 'inventory',    icon: '🧵', label: 'المخزون' },
  { id: 'workers',      icon: '👷', label: 'العمال' },
  { id: 'expenses',     icon: '🧾', label: 'المصروفات' },
  { id: 'appointments', icon: '📅', label: 'المواعيد' },
  { id: 'reports',      icon: '📊', label: 'التقارير' },
  { id: 'tests',        icon: '🧪', label: 'الاختبارات' },
];

/* --- الصفحة الحالية --- */
let currentPage = null;

/* --- إنشاء App Shell --- */
const layout = createLayout({
  sidebar: {
    title: 'ورشة الجلابيب',
    subtitle: 'V3 — قيد التطوير',
    logo: '🧵',
    items: SIDEBAR_ITEMS,
    activeId: 'home',
    footer: '© 2026 — v3.0.0',
  },
  topbar: {
    title: 'الرئيسية',
    actions: [
      {
        id: 'theme',
        icon: '🌙',
        label: 'تبديل الثيم',
        onClick: () => toast.info('الوضع الليلي — قريباً'),
      },
    ],
    showMenu: true,
  },
  onPageSelect: (id) => {
    renderPage(id);
  },
});

app.appendChild(layout.node);

/* ==========================================================================
   الصفحات
   ========================================================================== */

function buildPlaceholderPage(title, icon) {
  return el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon' }, icon),
    el('h2', { className: 'empty-state__title', text: title }),
    el('p', { className: 'empty-state__text' }, 'قيد التطوير — سيُبنى في المراحل القادمة.'),
  ]);
}

async function buildTestsPage() {
  const wrap = el('div', {});
  const pre = el('pre', {
    style: {
      padding: '16px',
      margin: '0',
      fontFamily: 'monospace',
      direction: 'ltr',
      textAlign: 'left',
      fontSize: '12px',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      background: '#111',
      color: '#0f0',
      borderRadius: '8px',
      boxSizing: 'border-box',
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

    console.log('🏁 TOTAL: ' + result.totalPassed + '/' + result.totalTests + ' tests passed');
  } catch (err) {
    lines.push('');
    lines.push('❌ Failed: ' + (err.message || String(err)));
    paint();
  }

  return wrap;
}

async function renderPage(id) {
  const item = SIDEBAR_ITEMS.find((i) => i.id === id);
  if (item) layout.setTitle(item.label);

  /* تنظيف الصفحة السابقة */
  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { console.error(e); }
  }
  currentPage = null;

  /* الرئيسية = Dashboard */
  if (id === 'home') {
    const container = el('div', {});
    layout.setContent(container);
    await dashboardPage.render(container);
    currentPage = dashboardPage;
    return;
  }

  if (id === 'tests') {
    layout.setContent(await buildTestsPage());
    return;
  }

  if (id === 'customers') {
    const container = el('div', {});
    layout.setContent(container);
    await customersPage.render(container);
    currentPage = customersPage;
    return;
  }

  if (id === 'orders') {
    const container = el('div', {});
    layout.setContent(container);
    await ordersPage.render(container);
    currentPage = ordersPage;
    return;
  }

  const labels = {
    payments:     ['الدفعات',   '💰'],
    inventory:    ['المخزون',   '🧵'],
    workers:      ['العمال',    '👷'],
    expenses:     ['المصروفات', '🧾'],
    appointments: ['المواعيد',  '📅'],
    reports:      ['التقارير',  '📊'],
  };

  const [title, icon] = labels[id] || ['صفحة', '📄'];
  layout.setContent(buildPlaceholderPage(title, icon));
}

/* --- تشغيل الصفحة الافتراضية --- */
renderPage('home');
