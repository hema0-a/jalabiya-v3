/* ==========================================================================
   main.js — نقطة الدخول + App Shell + Router + PWA
   ==========================================================================
   كل الصفحات (10) موصولة — لا placeholders.
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

/* ==========================================================================
   0. PWA — تسجيل Service Worker
   ========================================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        console.log('[PWA] Service Worker registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
  });
}

/* --- الاستيرادات --- */
let el, toast, createLayout, testsIndex;
let customersPage, ordersPage, dashboardPage;
let paymentsPage, inventoryPage, workersPage, expensesPage, reportsPage;
let settingsPage, appointmentsPage;

try {
  ({ el } = await import('./core/dom.js'));
  ({ toast } = await import('./ui/toast.js'));
  ({ createLayout } = await import('./ui/layout.js'));
  testsIndex = await import('./tests/index.js');
  ({ customersPage } = await import('./pages/customers.js'));
  ({ ordersPage } = await import('./pages/orders.js'));
  ({ dashboardPage } = await import('./pages/dashboard.js'));
  ({ paymentsPage } = await import('./pages/payments.js'));
  ({ inventoryPage } = await import('./pages/inventory.js'));
  ({ workersPage } = await import('./pages/workers.js'));
  ({ expensesPage } = await import('./pages/expenses.js'));
  ({ reportsPage } = await import('./pages/reports.js'));
  ({ settingsPage } = await import('./pages/settings/index.js'));
  ({ appointmentsPage } = await import('./pages/appointments.js'));
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
  { id: 'settings',     icon: '⚙️', label: 'الإعدادات' },
  { id: 'tests',        icon: '🧪', label: 'الاختبارات' },
];

/* --- الصفحة الحالية --- */
let currentPage = null;

/* --- إنشاء App Shell --- */
const layout = createLayout({
  sidebar: {
    title: 'ورشة الجلابيب',
    subtitle: 'V3 — v3.0.0',
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

async function renderRepoPage(pageModule) {
  const container = el('div', {});
  layout.setContent(container);
  await pageModule.render(container);
  currentPage = pageModule;
}

async function renderPage(id) {
  const item = SIDEBAR_ITEMS.find((i) => i.id === id);
  if (item) layout.setTitle(item.label);

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { console.error(e); }
  }
  currentPage = null;

  if (id === 'home')         return renderRepoPage(dashboardPage);
  if (id === 'customers')    return renderRepoPage(customersPage);
  if (id === 'orders')       return renderRepoPage(ordersPage);
  if (id === 'payments')     return renderRepoPage(paymentsPage);
  if (id === 'inventory')    return renderRepoPage(inventoryPage);
  if (id === 'workers')      return renderRepoPage(workersPage);
  if (id === 'expenses')     return renderRepoPage(expensesPage);
  if (id === 'appointments') return renderRepoPage(appointmentsPage);
  if (id === 'reports')      return renderRepoPage(reportsPage);
  if (id === 'settings')     return renderRepoPage(settingsPage);

  if (id === 'tests') {
    layout.setContent(await buildTestsPage());
    return;
  }
}

/* --- تشغيل الصفحة الافتراضية --- */
renderPage('home');
