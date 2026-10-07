/* ==========================================================================
   dashboard.js — لوحة المعلومات (KPIs + رسوم بيانية + ترحيب باسم الورشة)
   ==========================================================================
   API:
     dashboardPage.render(container)  → Promise<void>
     dashboardPage.destroy()          → void

   ⚠️ v3.3.2:
   - يقرأ settings.workshop.name للترحيب + settings.workshop.logo للشعار.
   - يعرض 3 رسوم بيانية: مبيعات 7 أيام، توزيع الطلبات، ملخص مالي.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { appointments } from '../data/repos/appointments.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP, formatDate, formatTime } from '../core/utils.js';
import {
  createSalesBarChart,
  createOrdersDonutChart,
  createFinanceChart,
} from '../ui/dashboard-charts.js';

let state = {
  container: null,
  data: null,
};

/* ==========================================================================
   1. أدوات حسابية للرسوم
   ========================================================================== */

/**
 * حساب بداية الشهر الحالي.
 * @returns {number}
 */
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * حساب مبيعات آخر 7 أيام (يوم بيوم).
 * @param {Array} paymentsList
 * @returns {Array<{label:string, value:number}>}
 */
function computeSalesLast7Days(paymentsList) {
  const days = [];
  const DAY_MS = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  /* أسماء أيام الأسبوع بالعربية (مختصرة) */
  const DAY_NAMES = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  for (let i = 6; i >= 0; i--) {
    const dayStart = todayMs - i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;

    const total = paymentsList
      .filter((p) => {
        const t = p.createdAt || 0;
        return t >= dayStart && t < dayEnd;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const d = new Date(dayStart);
    days.push({
      label: DAY_NAMES[d.getDay()],
      value: total,
    });
  }

  return days;
}

/**
 * حساب توزيع الطلبات بالحالة.
 * @param {Array} ordersList
 * @returns {Object}
 */
function computeOrdersByStatus(ordersList) {
  const out = { pending: 0, in_progress: 0, ready: 0, delivered: 0, cancelled: 0 };
  ordersList.forEach((o) => {
    if (out[o.status] != null) out[o.status]++;
  });
  return out;
}

/**
 * حساب ملخص مالي لآخر 30 يوماً.
 * @param {Array} paymentsList
 * @param {Array} expensesList
 * @returns {{revenue:number, expenses:number, profit:number}}
 */
function computeFinance(paymentsList, expensesList) {
  const DAY_MS = 86400000;
  const now = Date.now();
  const start = now - 30 * DAY_MS;

  const revenue = paymentsList
    .filter((p) => (p.createdAt || 0) >= start)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const exp = expensesList
    .filter((e) => (e.date || 0) >= start)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return {
    revenue,
    expenses: exp,
    profit: revenue - exp,
  };
}

/* ==========================================================================
   2. تحميل وحساب KPIs
   ========================================================================== */

/**
 * تحميل كل البيانات وحساب KPIs.
 * @returns {Promise<Object>}
 */
async function loadKPIs() {
  const monthStart = startOfMonth();

  const [customersList, ordersList, paymentsList, expensesList, todayAppts, s] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
    expenses.list().catch(() => []),
    appointments.getToday(),
    settings.get().catch(() => ({})),
  ]);

  const activeOrders = ordersList.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const monthPayments = paymentsList.filter(
    (p) => (p.createdAt || 0) >= monthStart
  );
  const monthRevenue = monthPayments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  const recentCustomers = customersList
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  const dueSoonOrders = ordersList
    .filter((o) => {
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      if (!o.dueDate) return false;
      const days = (o.dueDate - Date.now()) / 86400000;
      return days >= -1 && days <= 7;
    })
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 5);

  /* قراءة معلومات الورشة */
  const workshopName = (s.workshop && s.workshop.name) ? String(s.workshop.name).trim() : '';
  const workshopLogo = (s.workshop && s.workshop.logo) ? s.workshop.logo : '';

  /* بيانات الرسوم */
  const salesLast7Days = computeSalesLast7Days(paymentsList);
  const ordersByStatus = computeOrdersByStatus(ordersList);
  const finance = computeFinance(paymentsList, expensesList);

  return {
    totalCustomers: customersList.length,
    activeOrders: activeOrders.length,
    monthRevenue,
    todayAppointments: todayAppts.length,
    recentCustomers,
    dueSoonOrders,
    todayApptsList: todayAppts,
    workshopName,
    workshopLogo,
    salesLast7Days,
    ordersByStatus,
    finance,
  };
}

/* ==========================================================================
   3. بناء المكونات
   ========================================================================== */

function buildHeader(data) {
  const hour = new Date().getHours();
  let greeting = 'أهلاً';
  if (hour < 12) greeting = 'صباح الخير';
  else if (hour < 18) greeting = 'مساء الخير';
  else greeting = 'مساء الخير';

  const name = data && data.workshopName ? data.workshopName : 'صاحب الورشة';

  const logoEl = (data && data.workshopLogo)
    ? el('div', {
        style: {
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'url(' + data.workshopLogo + ') center/cover',
          flexShrink: '0',
          border: '2px solid #1F6D57',
        },
        'aria-label': 'شعار الورشة',
      })
    : null;

  const nameEl = el('div', {
    style: { fontSize: '20px', fontWeight: '600', color: '#123C2F' },
  }, '🧵 ' + greeting + '، ' + name);

  const subEl = el('div', {
    style: { fontSize: '13px', color: '#2E8B6F', marginTop: '4px' },
  }, formatDate(new Date()));

  const textWrap = el('div', { style: { flex: '1', minWidth: '0' } }, [nameEl, subEl]);

  return el('div', {
    className: 'card',
    style: {
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
  }, [logoEl, textWrap]);
}

function buildKPICards(data) {
  const grid = el('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '8px',
      marginBottom: '16px',
    },
  });

  const items = [
    { icon: '👥', value: String(data.totalCustomers), label: 'عملاء' },
    { icon: '📦', value: String(data.activeOrders), label: 'طلبات نشطة' },
    { icon: '💰', value: formatEGP(data.monthRevenue), label: 'إيرادات الشهر' },
    { icon: '📅', value: String(data.todayAppointments), label: 'مواعيد اليوم' },
  ];

  items.forEach((it) => {
    grid.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, it.icon),
      el('span', { className: 'stat__value' }, it.value),
      el('span', { className: 'stat__label' }, it.label),
    ]));
  });

  return grid;
}

function buildDueSoonSection(list) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '⏰ طلبات مستحقة قريباً'),
  ]));

  if (list.length === 0) {
    card.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا توجد طلبات مستحقة خلال 7 أيام.'));
    return card;
  }

  list.forEach((o) => {
    card.appendChild(el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    }, [
      el('div', {}, [
        el('div', { style: { fontWeight: '500', fontSize: '14px', color: '#123C2F' } },
          o.status === 'ready' ? '✅ جاهز للتسليم' : '⏳ ' + (o.status === 'pending' ? 'قيد الانتظار' : 'قيد التنفيذ')),
        o.dueDate ? el('div', { style: { fontSize: '11px', color: '#2E8B6F' } },
          '📅 ' + formatDate(o.dueDate)) : null,
      ]),
      el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#B8863B' } },
        o.amount ? formatEGP(o.amount) : ''),
    ]));
  });

  return card;
}

function buildTodayAppointmentsSection(list) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📅 مواعيد اليوم'),
  ]));

  if (list.length === 0) {
    card.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا توجد مواعيد اليوم.'));
    return card;
  }

  list.forEach((a) => {
    card.appendChild(el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    }, [
      el('div', { style: { fontSize: '13px', color: '#123C2F' } },
        a.title || 'موعد'),
      el('div', { style: { fontSize: '12px', color: '#2E8B6F' } },
        '🕐 ' + formatTime(a.date)),
    ]));
  });

  return card;
}

function buildRecentCustomersSection(list) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '👥 أحدث العملاء'),
  ]));

  if (list.length === 0) {
    card.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا يوجد عملاء بعد.'));
    return card;
  }

  list.forEach((c) => {
    card.appendChild(el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    }, [
      el('div', {}, [
        el('div', { style: { fontWeight: '500', fontSize: '14px', color: '#123C2F' } },
          c.name || 'بدون اسم'),
        c.phone ? el('div', { style: { fontSize: '11px', color: '#2E8B6F' } }, c.phone) : null,
      ]),
      c.vip ? el('span', { className: 'badge badge--accent' }, '⭐ VIP') : null,
    ]));
  });

  return card;
}

/* ==========================================================================
   4. API عام
   ========================================================================== */

export const dashboardPage = {
  async render(container) {
    clear(container);
    state.container = container;

    /* تحميل */
    const data = await loadKPIs();
    state.data = data;

    /* بناء */
    container.appendChild(buildHeader(data));
    container.appendChild(buildKPICards(data));

    /* 📊 رسم المبيعات — آخر 7 أيام */
    try {
      container.appendChild(createSalesBarChart(data.salesLast7Days));
    } catch (e) {
      console.warn('[Dashboard] sales chart failed:', e);
    }

    /* 📅 مواعيد اليوم */
    container.appendChild(buildTodayAppointmentsSection(data.todayApptsList));

    /* ⏰ طلبات مستحقة */
    container.appendChild(buildDueSoonSection(data.dueSoonOrders));

    /* 💰 الملخص المالي — آخر 30 يومًا */
    try {
      container.appendChild(createFinanceChart(data.finance));
    } catch (e) {
      console.warn('[Dashboard] finance chart failed:', e);
    }

    /* 🥧 توزيع الطلبات */
    try {
      container.appendChild(createOrdersDonutChart(data.ordersByStatus));
    } catch (e) {
      console.warn('[Dashboard] donut chart failed:', e);
    }

    /* 👥 أحدث العملاء */
    container.appendChild(buildRecentCustomersSection(data.recentCustomers));
  },

  destroy() {
    state = { container: null, data: null };
  },
};
