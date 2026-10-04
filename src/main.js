/* ==========================================================================
   main.js — نقطة الدخول + App Shell + Router
   ==========================================================================
   1. يستورد الأدوات
   2. يبني App Shell (Sidebar + Topbar)
   3. يستدعي renderPage() عند التبديل بين الصفحات
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
let el, toast, createLayout, testsIndex, customersPage;
try {
  ({ el } = await import('./core/dom.js'));
  ({ toast } = await import('./ui/toast.js'));
  ({ createLayout } = await import('./ui/layout.js'));
  testsIndex = await import('./tests/index.js');
  ({ customersPage } = await import('./pages/customers.js'));
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

/* --- الصفحة الحالية (لتنظيفها عند المغادرة) --- */
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

/**
 * صفحة الرئيسية — Demo UI.
 */
function buildHomePage() {
  const wrap = el('div', {});

  wrap.appendChild(el('div', { className: 'card', style: { marginBottom: '16px' } }, [
    el('div', { className: 'card__header' }, [
      el('h3', { className: 'card__title' }, '🎨 تجربة المكونات'),
    ]),
    el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0 0 16px 0' },
    }, 'اضغط أي زر لعرض الإشعار:'),
    el('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
    }, [
      el('button', {
        className: 'btn btn--primary',
        onClick: () => toast.success('تم حفظ البيانات بنجاح'),
      }, '✅ نجاح'),
      el('button', {
        className: 'btn btn--accent',
        onClick: () => toast.warning('المخزون على وشك الانتهاء'),
      }, '⚠️ تحذير'),
      el('button', {
        className: 'btn btn--danger',
        onClick: () => toast.danger('فشل في حفظ الطلب'),
      }, '❌ خطأ'),
      el('button', {
        className: 'btn btn--secondary',
        onClick: () => toast.info('آخر مزامنة قبل 3 دقائق'),
      }, 'ℹ️ معلومة'),
    ]),
  ]));

  wrap.appendChild(el('div', { className: 'card', style: { marginBottom: '16px' } }, [
    el('div', { className: 'card__header' }, [
      el('h3', { className: 'card__title' }, '🏷️ الشارات'),
    ]),
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [
      el('span', { className: 'badge badge--success' }, 'مكتمل'),
      el('span', { className: 'badge badge--warning' }, 'قيد التنفيذ'),
      el('span', { className: 'badge badge--danger' }, 'متأخر'),
      el('span', { className: 'badge badge--info' }, 'جديد'),
      el('span', { className: 'badge badge--accent' }, 'VIP'),
    ]),
  ]));

  wrap.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
  }, [
    el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '👥'),
      el('span', { className: 'stat__value' }, '0'),
      el('span', { className: 'stat__label' }, 'عملاء'),
    ]),
    el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '📦'),
      el('span', { className: 'stat__value' }, '0'),
      el('span', { className: 'stat__label' }, 'طلبات نشطة'),
    ]),
    el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '💰'),
      el('span', { className: 'stat__value' }, '0 ج.م'),
      el('span', { className: 'stat__label' }, 'إيرادات الشهر'),
    ]),
    el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '📅'),
      el('span', { className: 'stat__value' }, '0'),
      el('span', { className: 'stat__label' }, 'مواعيد اليوم'),
    ]),
  ]));

  return wrap;
}

/**
 * صفحة placeholder.
 */
function buildPlaceholderPage(title, icon) {
  return el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon' }, icon),
    el('h2', { className: 'empty-state__title', text: title }),
    el('p', { className: 'empty-state__text' }, 'قيد التطوير — سيُبنى في المراحل القادمة.'),
  ]);
}

/**
 * صفحة الاختبارات.
 */
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

/**
 * عرض صفحة حسب معرّفها.
 * @param {string} id
 */
async function renderPage(id) {
  const item = SIDEBAR_ITEMS.find((i) => i.id === id);
  if (item) {
    layout.setTitle(item.label);
  }

  /* تنظيف الصفحة السابقة إن كانت تدعم destroy */
  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { console.error(e); }
  }
  currentPage = null;

  if (id === 'home') {
    layout.setContent(buildHomePage());
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

  const labels = {
    orders:       ['الطلبات',   '📦'],
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
