/* ==========================================================================
   dashboard.js — لوحة التحكم (إجراءات سريعة + «يحتاج إجراءك» + KPIs + رسوم بيانية)
   ==========================================================================
   API:
     dashboardPage.render(container)  → Promise<void>
     dashboardPage.destroy()          → void

   v3.3.39: لوحة تحكم فعلية لا عرض فقط:
   - أزرار سريعة تفتح نماذج (طلب/دفعة/عميل/موعد) مباشرة، وبطاقات KPI تفتح صفحاتها.
   - «يحتاج إجراءك»: طلبات جاهزة لم تُستلم، طلبات متأخرة، مستحقات — اتصال/واتساب/تسليم/تقدّم حالة/تسجيل دفعة من اللوحة نفسها.
   - المواعيد: «تم» واتصال. أحدث العملاء: اتصال وواتساب.

   ⚠️ v3.3.2:
   - يقرأ settings.workshop.name للترحيب + settings.workshop.logo للشعار.
   - يعرض 3 رسوم بيانية: مبيعات 7 أيام، توزيع الطلبات، ملخص مالي.
   ========================================================================== */

import { withDepositPayments, withWorkerExpenses, orderPaidBreakdown } from '../services/payments-view.js';
import { computePickups, buildPickupText } from '../services/pickup-reminders.js';
import { computeReceivables, buildReminderText } from '../services/receivables.js';
import { sendLogged } from '../services/auto-messages.js';
import { buildQueue } from '../services/message-queue.js';
import { isEnabledCfg } from '../services/message-templates.js';
import { loadLog } from '../services/message-log.js';
import { statusNotifyAction } from '../services/status-notify.js';
import { isDemoRecord, clearDemoData } from '../services/demo-data.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { el, clear } from '../core/dom.js';
import { startOfDayPlus } from '../core/day-math.js';
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  /* أسماء أيام الأسبوع بالعربية (مختصرة) */
  const DAY_NAMES = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDayPlus(todayMs, -i);
    const dayEnd = startOfDayPlus(todayMs, -i + 1);

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

  const [customersList, ordersList, rawPayments, rawExpenses, todayAppts, s, workerPaysList] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
    expenses.list().catch(() => []),
    appointments.getToday(),
    settings.get().catch(() => ({})),
    workerPayments.list().catch(() => []),
  ]);
  const expensesList = withWorkerExpenses(rawExpenses, workerPaysList);
  const paymentsList = withDepositPayments(rawPayments, ordersList);

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

  /* --- لوحة التحكم: ما يحتاج إجراءً --- */
  const custMap = new Map(customersList.map((c) => [c.id, c]));
  const paysByOrder = new Map();
  rawPayments.forEach((p) => {
    if (!p || !p.orderId) return;
    if (!paysByOrder.has(p.orderId)) paysByOrder.set(p.orderId, []);
    paysByOrder.get(p.orderId).push(p);
  });
  const remainingOf = (o) => Math.max(0, Math.round(((Number(o.amount) || 0) - orderPaidBreakdown(o, paysByOrder.get(o.id) || []).paid) * 100) / 100);
  const withCust = (o) => {
    const c = custMap.get(o.customerId) || null;
    return { order: o, name: c ? c.name : 'عميل غير معروف', phone: c ? (c.phone || '') : '', customerId: o.customerId, remaining: remainingOf(o) };
  };
  const todayStart = startOfDayPlus(Date.now(), 0);
  const pickups = computePickups(ordersList, rawPayments, customersList);
  const overdueOrders = ordersList
    .filter((o) => (o.status === 'pending' || o.status === 'in_progress') && o.dueDate && o.dueDate < todayStart)
    .sort((a, b) => a.dueDate - b.dueDate)
    .map(withCust);
  const receivables = computeReceivables(ordersList, rawPayments, customersList);
  const debtors = receivables.customers.filter((c) => c.overdue > 0.009);
  const orderById = new Map(ordersList.map((o) => [o.id, o]));

  return {
    hasDemo: customersList.some(isDemoRecord) || ordersList.some(isDemoRecord),
    custMap, orderById, pickups, overdueOrders, debtors, workshopNameRaw: workshopName,
    workshopObj: s.workshop || {}, msgCfg: s.autoMessages || null,
    msgCounts: (() => {
      /* عدّاد «رسائل اليوم»: لا يُسقط اللوحة إن فشل الحساب */
      try {
        if (!isEnabledCfg(s.autoMessages)) return null;
        return buildQueue({ orders: ordersList, payments: rawPayments, customers: customersList,
          occasions: s.occasions || [], cfg: s.autoMessages || null, workshop: s.workshop || {}, log: loadLog() }).counts;
      } catch (e) { return null; }
    })(),
    dueSoonRows: dueSoonOrders.map(withCust),
    todayApptsRows: todayAppts.map((a) => {
      const c = a.customerId ? custMap.get(a.customerId) : null;
      return { appt: a, name: c ? c.name : '', phone: c ? (c.phone || '') : '' };
    }),
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
   إجراءات اللوحة (تنفَّذ من اللوحة نفسها ثم تُحدَّث)
   ========================================================================== */

const NEXT_STATUS = {
  pending:     { to: 'in_progress', label: '▶ ابدأ التنفيذ' },
  in_progress: { to: 'ready',       label: '✅ جاهز' },
  ready:       { to: 'delivered',   label: '📦 تسليم' },
};
const STATUS_LABEL = { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', ready: 'جاهز', delivered: 'تم التسليم', cancelled: 'ملغي' };

/** إعادة رسم اللوحة مع الإبقاء على موضع التمرير. */
async function refresh() {
  const c = state.container;
  if (!c) return;
  const y = window.scrollY;
  await dashboardPage.render(c);
  window.scrollTo(0, y);
}

function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

/** نقل الطلب للحالة التالية؛ التسليم مع متبقٍّ يطلب تأكيداً. */
async function advanceOrder(order, remaining) {
  const next = NEXT_STATUS[order.status];
  if (!next) return;
  if (next.to === 'delivered' && remaining > 0.009) {
    const ok = await modal.confirm({
      title: 'تسليم مع مبلغ متبقٍّ',
      message: 'المتبقي على الطلب ' + formatEGP(remaining) + '. هل تسلّمه الآن؟ (يبقى دَيناً على العميل)',
      confirmText: 'سلّم', cancelText: 'إلغاء',
    });
    if (!ok) return;
  }
  try {
    const patch = { status: next.to };
    if (next.to === 'delivered' && !order.deliveredAt) patch.deliveredAt = Date.now();
    await orders.update(order.id, patch);
    /* التراجع يعيد الحالة وتواريخها كما كانت (بما فيها عمر «جاهز») */
    const prev = { status: order.status, deliveredAt: order.deliveredAt ?? null, readyAt: order.readyAt ?? null };
    const notify = await statusNotifyAction({ ...order, ...patch }, next.to);
    toast.undo('الحالة: ' + STATUS_LABEL[next.to], async () => {
      await orders.update(order.id, prev);
      toast.info('تم التراجع: ' + STATUS_LABEL[prev.status]);
      await refresh();
    }, notify ? { extraAction: notify, duration: 10000 } : {});
    await refresh();
  } catch (e) { toast.danger('تعذّر التحديث: ' + e.message); }
}

/** تسجيل دفعة سريعة على طلب (المبلغ الافتراضي = المتبقي). */
function quickPay({ customerId, orderId, name, remaining }) {
  const amountIn = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: remaining > 0 ? String(remaining) : '', 'aria-label': 'المبلغ' });
  const methodSel = el('select', { className: 'select', 'aria-label': 'طريقة الدفع' });
  [['cash', 'نقدي'], ['instapay', 'InstaPay'], ['vodafone', 'Vodafone Cash'], ['other', 'أخرى']]
    .forEach(([v, l]) => methodSel.appendChild(el('option', { value: v }, l)));
  const body = el('div', {}, [
    el('p', { className: 'dash-note' }, 'دفعة من ' + name + (remaining > 0 ? ' — المتبقي ' + formatEGP(remaining) : '')),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ (ج.م)'), amountIn]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'طريقة الدفع'), methodSel]),
  ]);
  const handle = modal.open({
    title: '💰 تسجيل دفعة', body, closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      { text: 'حفظ الدفعة', variant: 'primary', action: 'save', onClick: async () => {
        const amount = Number(amountIn.value);
        if (!amount || !Number.isFinite(amount) || amount <= 0) { toast.warning('أدخل مبلغاً صحيحاً'); return; }
        if (remaining > 0 && amount > remaining + 0.009) { toast.warning('المبلغ أكبر من المتبقي (' + formatEGP(remaining) + ')'); return; }
        try {
          const created = await payments.create({ customerId, orderId: orderId || null, amount, method: methodSel.value, notes: '', isDeposit: false });
          handle.close();
          toast.undo('تم تسجيل دفعة ' + formatEGP(amount), async () => {
            await payments.remove(created.id);
            toast.info('تم التراجع: أُلغيت الدفعة');
            await refresh();
          });
          await refresh();
        } catch (e) { toast.danger('تعذّر الحفظ: ' + e.message); }
      } },
    ],
  });
  setTimeout(() => { try { amountIn.focus(); amountIn.select(); } catch { /* ignore */ } }, 80);
}

async function markApptDone(a) {
  try {
    const prevStatus = a.status || 'scheduled';
    await appointments.update(a.id, { status: 'done' });
    toast.undo('تم تسجيل الموعد كمنتهٍ', async () => {
      await appointments.update(a.id, { status: prevStatus });
      toast.info('تم التراجع');
      await refresh();
    });
    await refresh();
  }
  catch (e) { toast.danger('تعذّر التحديث: ' + e.message); }
}

/* ==========================================================================
   مكوّنات صغيرة
   ========================================================================== */

const callBtn = (phone) => (phone
  ? el('a', { className: 'btn btn--sm btn--ghost dash-act', href: 'tel:' + String(phone).replace(/[^\d+]/g, ''), 'aria-label': 'اتصال', title: 'اتصال' }, '📞')
  : null);
const waBtn = (phone, textFn, meta = null) => (phone
  ? el('button', { className: 'btn btn--sm btn--ghost dash-act', type: 'button', 'aria-label': 'واتساب', title: 'واتساب',
      onClick: () => { if (!sendLogged(phone, textFn(), meta)) toast.warning('رقم الهاتف غير صالح'); } }, '💬')
  : null);
const actBtn = (label, onClick, primary = true) => el('button', {
  className: 'btn btn--sm dash-act ' + (primary ? 'btn--primary' : 'btn--secondary'), type: 'button', onClick,
}, label);

function dashRow(title, sub, actions, onOpen) {
  const main = el('div', { className: 'dash-row__main' }, [
    el('div', { className: 'dash-row__title' }, title),
    sub ? el('div', { className: 'dash-row__sub' }, sub) : null,
  ]);
  if (onOpen) { main.setAttribute('role', 'button'); main.tabIndex = 0; main.addEventListener('click', onOpen); main.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOpen(); }); }
  return el('div', { className: 'dash-row' }, [main, el('div', { className: 'dash-row__actions' }, actions.filter(Boolean))]);
}

function dashGroup(title, count, rows, moreHash) {
  const head = el('div', { className: 'dash-group__head' }, [
    el('span', {}, title),
    el('span', { className: 'badge badge--warning' }, String(count)),
  ]);
  const g = el('div', { className: 'dash-group' }, [head, ...rows]);
  if (count > rows.length) g.appendChild(el('a', { className: 'dash-more', href: moreHash }, 'عرض الكل (' + count + ') ‹'));
  return g;
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


/** شريط تنبيه: توجد بيانات تجريبية (تدخل في الأرقام والتقارير حتى تُحذف). */
function buildDemoBanner() {
  return el('div', { className: 'dash-demo', role: 'status' }, [
    el('span', {}, '🧪 تعرض بيانات تجريبية — تدخل في الأرقام والتقارير حتى تحذفها'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف البيانات التجريبية',
          message: 'سيُحذف التجريبي فقط (المُعلَّم 🧪). بياناتك الحقيقية لن تُمسّ.',
          confirmText: 'احذف التجريبي', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try { const n = await clearDemoData(); toast.success('تم حذف ' + n + ' سجلاً تجريبياً'); await refresh(); }
        catch (e) { toast.danger('تعذّر الحذف: ' + e.message); }
      },
    }, 'حذفها'),
  ]);
}

function buildQuickActions() {
  const items = [
    { icon: '📋', label: 'طلب جديد', hash: '#/orders/new' },
    { icon: '💰', label: 'دفعة', hash: '#/payments/new' },
    { icon: '👤', label: 'عميل جديد', hash: '#/customers/new' },
    { icon: '📅', label: 'موعد', hash: '#/appointments/new' },
  ];
  return el('div', { className: 'dash-quick', role: 'group', 'aria-label': 'إجراءات سريعة' },
    items.map((it) => el('button', { className: 'dash-quick__btn', type: 'button', onClick: () => go(it.hash) }, [
      el('span', { className: 'dash-quick__icon', 'aria-hidden': 'true' }, it.icon),
      el('span', {}, it.label),
    ])));
}

function buildKPICards(data) {
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  const items = [
    { icon: '👥', value: String(data.totalCustomers), label: 'عملاء', hash: '#/customers' },
    { icon: '📦', value: String(data.activeOrders), label: 'طلبات نشطة', hash: '#/orders' },
    { icon: '💰', value: formatEGP(data.monthRevenue), label: 'إيرادات الشهر', hash: '#/payments' },
    { icon: '📅', value: String(data.todayAppointments), label: 'مواعيد اليوم', hash: '#/appointments' },
  ];
  items.forEach((it) => {
    grid.appendChild(el('a', { className: 'stat stat--link', href: it.hash, 'aria-label': it.label + ': ' + it.value }, [
      el('span', { className: 'stat__icon', 'aria-hidden': 'true' }, it.icon),
      el('span', { className: 'stat__value' }, it.value),
      el('span', { className: 'stat__label' }, it.label),
    ]));
  });
  return grid;
}

/** «يحتاج إجراءك»: ما ينتظر قراراً الآن، وتنفيذه من مكانه. */
function buildAttention(data) {
  const wn = data.workshopObj || data.workshopNameRaw || '';
  const mc = data.msgCfg || null;
  const groups = [];

  /* 1) جاهز ولم يُستلم */
  const pk = data.pickups.items;
  if (pk.length) {
    const rows = pk.slice(0, 4).map((it) => {
      const order = data.orderById.get(it.orderId);
      return dashRow(
        (it.late ? '🔴 ' : '🟢 ') + it.name,
        'جاهز منذ ' + it.ageDays + ' يوم' + (it.remaining > 0 ? ' · متبقي ' + formatEGP(it.remaining) : ' · مدفوع بالكامل'),
        [callBtn(it.phone), waBtn(it.phone, () => buildPickupText(it, wn, mc), { kind: 'pickup_ready', ref: it.orderId, customerId: it.customerId }),
          order ? actBtn('📦 تسليم', () => advanceOrder(order, it.remaining)) : null],
        () => go('#/pickups'));
    });
    groups.push(dashGroup('📦 جاهز ولم يُستلم', pk.length, rows, '#/pickups'));
  }

  /* 2) متأخر عن موعد التسليم */
  const od = data.overdueOrders;
  if (od.length) {
    const rows = od.slice(0, 4).map((r) => {
      const next = NEXT_STATUS[r.order.status];
      const days = Math.max(1, Math.round((startOfDayPlus(Date.now(), 0) - r.order.dueDate) / 86400000));
      return dashRow('⏰ ' + r.name,
        'متأخر ' + days + ' يوم · ' + STATUS_LABEL[r.order.status] + (r.order.amount ? ' · ' + formatEGP(r.order.amount) : ''),
        [callBtn(r.phone), next ? actBtn(next.label, () => advanceOrder(r.order, r.remaining)) : null],
        () => go('#/orders'));
    });
    groups.push(dashGroup('⏰ متأخر عن موعد التسليم', od.length, rows, '#/orders'));
  }

  /* 3) مستحقات على عملاء (سُلِّم الطلب وعليه متبقٍّ) */
  const db = data.debtors;
  if (db.length) {
    const rows = db.slice(0, 3).map((c) => {
      const o = c.orders.find((x) => x.delivered) || null;
      return dashRow('💸 ' + c.name,
        'عليه ' + formatEGP(c.overdue) + ' منذ ' + c.oldestDays + ' يوم',
        [callBtn(c.phone),
          waBtn(c.phone, () => buildReminderText(c.name, formatEGP(c.overdue), wn, mc), { kind: 'debt_reminder', customerId: c.customerId }),
          o ? actBtn('💰 دفعة', () => quickPay({ customerId: c.customerId, orderId: o.id, name: c.name, remaining: o.remaining })) : null],
        () => go('#/debts'));
    });
    groups.push(dashGroup('💸 مستحقات متأخرة', db.length, rows, '#/debts'));
  }

  /* 4) رسائل بانتظار الإرسال (استلام + مستحقات + تهاني لم تُرسل مؤخراً) */
  const mq = data.msgCounts;
  if (mq && mq.pending > 0) {
    const part = (k, label) => ((mq[k] && mq[k].pending) ? label + ' ' + mq[k].pending : null);
    const sub = [part('pickup', 'استلام'), part('debt', 'مستحقات'), part('greeting', 'تهاني')].filter(Boolean).join(' · ');
    groups.push(dashGroup('📣 رسائل بانتظار الإرسال', mq.pending, [
      dashRow('📣 رسائل اليوم', sub, [actBtn('▶ ابدأ المرور', () => go('#/messages'))], () => go('#/messages')),
    ], '#/messages'));
  }

  const card = el('div', { className: 'card dash-attention', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '🔔 يحتاج إجراءك')]));
  if (!groups.length) {
    card.appendChild(el('p', { className: 'dash-note', style: { margin: '0' } }, '✅ لا شيء يحتاج إجراءً الآن — لا طلبات متأخرة ولا مستحقات.'));
    return card;
  }
  groups.forEach((g) => card.appendChild(g));
  return card;
}

function buildDueSoonSection(rows) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '⏰ طلبات مستحقة قريباً'),
  ]));
  if (rows.length === 0) {
    card.appendChild(el('p', { className: 'dash-note', style: { margin: '0' } }, 'لا توجد طلبات مستحقة خلال 7 أيام.'));
    return card;
  }
  rows.forEach((r) => {
    const o = r.order;
    const next = NEXT_STATUS[o.status];
    card.appendChild(dashRow(
      r.name,
      (o.status === 'ready' ? '✅ جاهز للتسليم' : '⏳ ' + (o.status === 'pending' ? 'قيد الانتظار' : 'قيد التنفيذ')) +
        (o.dueDate ? ' · 📅 ' + formatDate(o.dueDate) : '') + (o.amount ? ' · ' + formatEGP(o.amount) : ''),
      [callBtn(r.phone), next ? actBtn(next.label, () => advanceOrder(o, r.remaining), false) : null],
      () => go('#/orders')));
  });
  return card;
}

function buildTodayAppointmentsSection(rows) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📅 مواعيد اليوم'),
    el('a', { className: 'dash-link', href: '#/appointments/new' }, '＋ موعد'),
  ]));
  if (rows.length === 0) {
    card.appendChild(el('p', { className: 'dash-note', style: { margin: '0' } }, 'لا توجد مواعيد اليوم.'));
    return card;
  }
  rows.forEach((r) => {
    const a = r.appt;
    const done = a.status === 'done';
    card.appendChild(dashRow(
      (done ? '✔ ' : '🕐 ') + formatTime(a.date) + ' — ' + (a.title || 'موعد'),
      r.name || null,
      [callBtn(r.phone), done ? null : actBtn('✔ تم', () => markApptDone(a), false)],
      () => go('#/appointments')));
  });
  return card;
}

function buildRecentCustomersSection(list, wn) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '👥 أحدث العملاء'),
    el('a', { className: 'dash-link', href: '#/customers/new' }, '＋ عميل'),
  ]));
  if (list.length === 0) {
    card.appendChild(el('p', { className: 'dash-note', style: { margin: '0' } }, 'لا يوجد عملاء بعد.'));
    return card;
  }
  list.forEach((c) => {
    card.appendChild(dashRow(
      (c.name || 'بدون اسم') + (c.vip ? '  ⭐ VIP' : ''),
      c.phone || null,
      [callBtn(c.phone), waBtn(c.phone, () => 'السلام عليكم ' + (c.name || '') + '،' + (wn ? ' معكم ' + wn + '.' : ''))],
      () => go('#/customers')));
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
    if (data.hasDemo) container.appendChild(buildDemoBanner());
    container.appendChild(buildQuickActions());
    container.appendChild(buildKPICards(data));
    container.appendChild(buildAttention(data));

    /* 📅 مواعيد اليوم */
    container.appendChild(buildTodayAppointmentsSection(data.todayApptsRows));

    /* ⏰ طلبات مستحقة */
    container.appendChild(buildDueSoonSection(data.dueSoonRows));

    /* 📊 رسم المبيعات — آخر 7 أيام */
    try {
      container.appendChild(createSalesBarChart(data.salesLast7Days));
    } catch (e) {
      console.warn('[Dashboard] sales chart failed:', e);
    }

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
    container.appendChild(buildRecentCustomersSection(data.recentCustomers, data.workshopName));
  },

  destroy() {
    state = { container: null, data: null };
  },
};
