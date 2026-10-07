/* ==========================================================================
   dashboard.js — لوحة المعلومات (KPIs حقيقية + ترحيب باسم الورشة)
   ==========================================================================
   API:
     dashboardPage.render(container)  → Promise<void>
     dashboardPage.destroy()          → void

   ⚠️ إصلاح (v3.3.1):
   - يقرأ settings.workshop.name للترحيب + settings.workshop.logo للشعار.
   - إذا كان الاسم فارغًا → يستخدم "صاحب الورشة" كافتراضي.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP, formatDate, formatTime } from '../core/utils.js';

let state = {
  container: null,
  data: null,
};

/* ==========================================================================
   1. تحميل وحساب KPIs
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
 * تحميل كل البيانات وحساب KPIs.
 * @returns {Promise<Object>}
 */
async function loadKPIs() {
  const monthStart = startOfMonth();

  const [customersList, ordersList, paymentsList, todayAppts, s] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
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

  /* قراءة معلومات الورشة من الإعدادات */
  const workshopName = (s.workshop && s.workshop.name) ? String(s.workshop.name).trim() : '';
  const workshopLogo = (s.workshop && s.workshop.logo) ? s.workshop.logo : '';

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
  };
}

/* ==========================================================================
   2. بناء المكونات
   ========================================================================== */

function buildHeader(data) {
  const hour = new Date().getHours();
  let greeting = 'أهلاً';
  if (hour < 12) greeting = 'صباح الخير';
  else if (hour < 18) greeting = 'مساء الخير';
  else greeting = 'مساء الخير';

  /* اسم الورشة أو الافتراضي */
  const name = data && data.workshopName ? data.workshopName : 'صاحب الورشة';

  /* شعار اختياري */
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
   3. API عام
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
    container.appendChild(buildDueSoonSection(data.dueSoonOrders));
    container.appendChild(buildTodayAppointmentsSection(data.todayApptsList));
    container.appendChild(buildRecentCustomersSection(data.recentCustomers));
  },

  destroy() {
    state = { container: null, data: null };
  },
};
