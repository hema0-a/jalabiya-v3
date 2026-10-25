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

import { revenuePayments, withWorkerExpenses, orderPaidBreakdown } from '../services/payments-view.js';
import { computePickups, buildPickupText } from '../services/pickup-reminders.js';
import { computeReceivables, buildReminderText } from '../services/receivables.js';
import { sendLogged } from '../services/auto-messages.js';
import { buildQueue } from '../services/message-queue.js';
import { isEnabledCfg } from '../services/message-templates.js';
import { loadLog } from '../services/message-log.js';
import { statusNotifyAction } from '../services/status-notify.js';
import { depositGuard } from '../ui/deposit-guard.js';
import { referrals as referralsRepo } from '../data/repos/referrals.js';
import { isDemoRecord, clearDemoData } from '../services/demo-data.js';
import { modal } from '../ui/modal.js';
import { createCollapsible, openAll, closeAll } from '../ui/collapsible.js'; /* v3.3.63 */
import { toast } from '../ui/toast.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { el, clear } from '../core/dom.js';
import { saveFailMessage } from '../core/save-error.js';
import {
  DASH_BLOCKS, DASH_SECTIONS, readLayout, writeLayout, isVisible, toggleVisible, moveSection,
  orderedSectionIds, visibleSectionIds, defaultLayout, isDefault,
} from '../services/dashboard-layout.js'; /* v3.5.1 */
import { startOfDayPlus, startOfDay, startOfNextDay } from '../core/day-math.js';
import { buildWeekVisits, buildVisitText, dayLabel } from '../services/week-visits.js'; /* v3.3.55 */
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { appointments } from '../data/repos/appointments.js';
import { settings } from '../data/repos/settings.js';
import { backupNudge } from '../services/backup-nudge.js';
import { getLastExternalBackupAt } from '../services/auto-backup.js';
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

  const [customersList, ordersList, rawPayments, rawExpenses, s, workerPaysList, referralsList, allAppts] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
    expenses.list().catch(() => []),
    settings.get().catch(() => ({})),
    workerPayments.list().catch(() => []),
    referralsRepo.list().catch(() => []),
    appointments.list().catch(() => []),
  ]);
  /* مواعيد اليوم من نفس القراءة (كانت قراءة ثانية لنفس المخزن) — نفس شرط appointments.getToday */
  const _dayStart = startOfDay(Date.now());
  const _dayEnd = startOfNextDay(_dayStart);
  const todayAppts = allAppts
    .filter((a) => a.date && a.date >= _dayStart && a.date < _dayEnd)
    .sort((a, b) => a.date - b.date);
  const expensesList = withWorkerExpenses(rawExpenses, workerPaysList);
  const paymentsList = revenuePayments(rawPayments, ordersList);

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
          occasions: s.occasions || [], referrals: referralsList, cfg: s.autoMessages || null, workshop: s.workshop || {}, log: loadLog(),
          countOnly: true, precomputed: { pickups, receivables } }).counts;   /* أرقام فقط وبلا إعادة حساب (v3.3.71) */
      } catch (e) { return null; }
    })(),
    dueSoonRows: dueSoonOrders.map(withCust),
    weekVisits: buildWeekVisits({ orders: ordersList, customers: customersList, appointments: allAppts, payments: rawPayments }),
    todayApptsRows: todayAppts.map((a) => {
      const c = a.customerId ? custMap.get(a.customerId) : null;
      return { appt: a, name: c ? c.name : '', phone: c ? (c.phone || '') : '' };
    }),
    totalCustomers: customersList.length,
    totalOrders: ordersList.length,
    realRecords: customersList.filter((r) => !isDemoRecord(r)).length + ordersList.filter((r) => !isDemoRecord(r)).length,
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
  if (!(await depositGuard(order, next.to))) return;   /* تحذير العربون قبل بدء التنفيذ */
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
        } catch (e) { toast.danger(saveFailMessage(e, 'تعذّر الحفظ')); }
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

function dashRow(title, sub, actions, onOpen, customerId) {
  const main = el('div', { className: 'dash-row__main' }, [
    el('div', { className: 'dash-row__title' }, title),
    sub ? el('div', { className: 'dash-row__sub' }, sub) : null,
  ]);
  if (customerId) main.setAttribute('data-customer-id', customerId);   /* ضغطة مطوّلة ⟵ قائمة العميل */
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

function buildHeader(data, extra = null) {
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

  /* v3.5.2: بطاقة واحدة = الترحيب + الإجراءات السريعة (كانا بطاقتين منفصلتين تستهلكان ارتفاعاً على الجوال) */
  const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [logoEl, textWrap]);
  return el('div', { className: 'card dash-hero', style: { marginBottom: '16px' } }, [row, extra]);
}


/** شريط تنبيه: توجد بيانات تجريبية (تدخل في الأرقام والتقارير حتى تُحذف). */
/* تذكير بنسخة خارج الجهاز: يظهر بعد الرسم الأول ولا يؤخّره، ويُسكَت 3 أيام بزر «لاحقاً» */
const NUDGE_SNOOZE_KEY = 'jalabiya_v3_backup_nudge_snoozed';
async function buildBackupNudge(data) {
  try {
    let snoozedAt = 0;
    try { snoozedAt = Number(localStorage.getItem(NUDGE_SNOOZE_KEY)) || 0; } catch (_) { /* اختياري */ }
    const recordCount = data.realRecords || 0;
    const n = backupNudge({ externalAt: getLastExternalBackupAt(), recordCount, snoozedAt });
    if (!n.show) return null;
    const box = el('div', { className: 'dash-demo', role: 'status', 'data-role': 'backup-nudge' }, [
      el('span', {}, n.text),
      el('a', { className: 'btn btn--sm btn--primary', href: '#/data-care', 'data-action': 'nudge-open' }, 'احفظ نسخة'),
      el('button', {
        className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'nudge-snooze',
        onClick: () => {
          try { localStorage.setItem(NUDGE_SNOOZE_KEY, String(Date.now())); } catch (_) { /* اختياري */ }
          box.remove();
        },
      }, 'لاحقاً'),
    ]);
    return box;
  } catch (e) { return null; }
}

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
        () => go('#/pickups'), it.customerId);
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
        () => go('#/orders'), r.customerId);
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
        () => go('#/debts'), c.customerId);
    });
    groups.push(dashGroup('💸 مستحقات متأخرة', db.length, rows, '#/debts'));
  }

  /* 4) رسائل بانتظار الإرسال (استلام + مستحقات + تهاني لم تُرسل مؤخراً) */
  const mq = data.msgCounts;
  if (mq && mq.pending > 0) {
    const part = (k, label) => ((mq[k] && mq[k].pending) ? label + ' ' + mq[k].pending : null);
    const sub = [part('pickup', 'استلام'), part('debt', 'مستحقات'), part('referral', 'مكافآت'), part('greeting', 'تهاني')].filter(Boolean).join(' · ');
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

/* ==========================================================================
   أقسام اللوحة القابلة للطي (v3.3.63)
   - «يحتاج إجراءك» تبقى بطاقة ظاهرة دائماً (الأهم).
   - الباقي أكورديون: الملخص + شارة العدّاد يُظهران المحتوى دون فتح القسم،
     والمفتوح افتراضياً هو القوائم التي فيها عناصر فقط، والحالة تُحفظ بعدها.
   ========================================================================== */
function dashSection({ id, icon, title, summary, badge, defaultOpen, body, action, cls }) {
  const inner = el('div', { className: 'dash-section__body' }, [
    body,
    action ? el('div', { className: 'dash-section__action' }, [action]) : null,
  ]);
  const c = createCollapsible({ id, icon, title, summary, badge, defaultOpen: !!defaultOpen, content: inner });
  c.node.classList.add('dash-section');
  if (cls) c.node.classList.add(cls);
  return c.node;
}

const emptyNote = (text) => el('p', { className: 'dash-note', style: { margin: '0' } }, text);

function buildDueSoonSection(rows) {
  const body = el('div');
  if (rows.length === 0) {
    body.appendChild(emptyNote('لا توجد طلبات مستحقة خلال 7 أيام.'));
  }
  rows.forEach((r) => {
    const o = r.order;
    const next = NEXT_STATUS[o.status];
    body.appendChild(dashRow(
      r.name,
      (o.status === 'ready' ? '✅ جاهز للتسليم' : '⏳ ' + (o.status === 'pending' ? 'قيد الانتظار' : 'قيد التنفيذ')) +
        (o.dueDate ? ' · 📅 ' + formatDate(o.dueDate) : '') + (o.amount ? ' · ' + formatEGP(o.amount) : ''),
      [callBtn(r.phone), next ? actBtn(next.label, () => advanceOrder(o, r.remaining), false) : null],
      () => go('#/orders'), o.customerId));
  });
  const ready = rows.filter((r) => r.order.status === 'ready').length;
  return dashSection({
    id: 'dash-due', icon: '⏰', title: 'طلبات مستحقة قريباً',
    summary: rows.length ? (ready ? ready + ' جاهز · ' : '') + (rows.length - ready) + ' قيد التنفيذ' : 'لا شيء خلال 7 أيام',
    badge: rows.length, defaultOpen: rows.length > 0, body,
  });
}

function buildTodayAppointmentsSection(rows) {
  const body = el('div');
  if (rows.length === 0) body.appendChild(emptyNote('لا توجد مواعيد اليوم.'));
  rows.forEach((r) => {
    const a = r.appt;
    const done = a.status === 'done';
    body.appendChild(dashRow(
      (done ? '✔ ' : '🕐 ') + formatTime(a.date) + ' — ' + (a.title || 'موعد'),
      r.name || null,
      [callBtn(r.phone), done ? null : actBtn('✔ تم', () => markApptDone(a), false)],
      () => go('#/appointments'), a.customerId));
  });
  const pending = rows.filter((r) => r.appt.status !== 'done').length;
  return dashSection({
    id: 'dash-appts', icon: '📅', title: 'مواعيد اليوم',
    summary: rows.length ? (pending ? pending + ' متبقية' : 'كلها منتهية') + ' من ' + rows.length : 'لا مواعيد اليوم',
    badge: pending, defaultOpen: rows.length > 0, body,
    action: el('a', { className: 'dash-link', href: '#/appointments/new' }, '＋ موعد'),
  });
}

const WEEK_ROWS = 6;
const REASON_ICON = { appt: '🗓️', due: '📅', ready: '📦' };

function buildWeekVisitsSection(rows, wn) {
  const body = el('div');
  if (rows.length === 0) body.appendChild(emptyNote('لا حضور متوقّع خلال 7 أيام.'));
  rows.slice(0, WEEK_ROWS).forEach((r) => {
    const sub = r.reasons.slice(0, 3).map((x) => REASON_ICON[x.type] + ' ' + dayLabel(x.ts) + ' — ' + x.label).join('\n');
    const row = dashRow(
      r.name,
      sub + (r.remaining > 0 ? '\n💰 المتبقي ' + formatEGP(r.remaining) : ''),
      [callBtn(r.phone), waBtn(r.phone, () => buildVisitText(r, wn), { kind: 'week_visit', customerId: r.customerId })],
      () => go('#/customers'), r.customerId);
    row.querySelector('.dash-row__sub')?.classList.add('dash-row__sub--lines');
    body.appendChild(row);
  });
  if (rows.length > WEEK_ROWS) body.appendChild(el('p', { className: 'dash-note', style: { margin: 'var(--space-s) 0 0' } }, '+' + (rows.length - WEEK_ROWS) + ' آخرون'));
  return dashSection({
    id: 'dash-week', icon: '👣', title: 'عملاء هذا الأسبوع', cls: 'dash-week',
    summary: rows.length ? rows[0].name + (rows.length > 1 ? ' و' + (rows.length - 1) + ' آخرين' : '') : 'لا حضور متوقّع',
    badge: rows.length, defaultOpen: rows.length > 0, body,
  });
}

function buildRecentCustomersSection(list, wn) {
  const body = el('div');
  if (list.length === 0) body.appendChild(emptyNote('لا يوجد عملاء بعد.'));
  list.forEach((c) => {
    body.appendChild(dashRow(
      (c.name || 'بدون اسم') + (c.vip ? '  ⭐ VIP' : ''),
      c.phone || null,
      [callBtn(c.phone), waBtn(c.phone, () => 'السلام عليكم ' + (c.name || '') + '،' + (wn ? ' معكم ' + wn + '.' : ''))],
      () => go('#/customers'), c.id));
  });
  return dashSection({
    id: 'dash-recent', icon: '👥', title: 'أحدث العملاء',
    summary: list.length ? list.slice(0, 2).map((c) => c.name || 'بدون اسم').join('، ') + (list.length > 2 ? '…' : '') : 'لا عملاء بعد',
    defaultOpen: false, body,
    action: el('a', { className: 'dash-link', href: '#/customers/new' }, '＋ عميل'),
  });
}

/* --- الرسوم البيانية: قسم لكل رسم (مطويّ افتراضياً، الملخص يغني عن فتحه) --- */
function buildChartSections(data) {
  const out = [];
  const add = (spec, make) => {
    try { out.push(dashSection({ ...spec, body: make() })); }
    catch (e) { console.warn('[Dashboard] chart section failed:', spec.id, e); }
  };
  const salesTotal = (data.salesLast7Days || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
  add({ id: 'dash-sales', icon: '📊', title: 'مبيعات آخر 7 أيام', summary: 'الإجمالي ' + formatEGP(salesTotal) },
    () => createSalesBarChart(data.salesLast7Days, { bare: true }));
  const fin = data.finance || {};
  add({ id: 'dash-finance', icon: '💰', title: 'الملخص المالي (30 يوماً)', summary: 'الربح ' + formatEGP(Number(fin.profit) || 0) },
    () => createFinanceChart(data.finance, { bare: true }));
  const ordersTotal = Object.values(data.ordersByStatus || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  add({ id: 'dash-orders', icon: '🥧', title: 'توزيع الطلبات', summary: ordersTotal + ' طلب' },
    () => createOrdersDonutChart(data.ordersByStatus, { bare: true }));
  return out;
}

/* شريط «فتح الكل / طيّ الكل»: التسمية تعكس الحالة الفعلية دائماً */
function buildSectionsBar(host, onCustomize) {
  const btn = el('button', { type: 'button', className: 'dash-sections__toggle' }, 'فتح الكل');
  const allOpen = () => {
    const list = Array.from(host.querySelectorAll('.dash-section'));
    return list.length > 0 && list.every((n) => n.classList.contains('collapsible--open'));
  };
  const sync = () => { btn.textContent = allOpen() ? 'طيّ الكل' : 'فتح الكل'; };
  btn.addEventListener('click', () => { (allOpen() ? closeAll : openAll)(host); sync(); });
  host.addEventListener('click', () => setTimeout(sync, 0));   // أي فتح/طيّ فردي يحدّث التسمية
  const custom = el('button', {
    type: 'button',
    className: 'dash-sections__custom',
    'aria-label': 'تخصيص لوحة التحكم',
    onClick: () => { if (typeof onCustomize === 'function') onCustomize(); },
  }, '⚙️ تخصيص');
  const bar = el('div', { className: 'dash-sections__bar' }, [btn, custom]);
  bar.update = sync;
  return bar;
}

/* نافذة تخصيص اللوحة: إظهار/إخفاء + ترتيب الأقسام؛ التطبيق عند الإغلاق بإعادة رسم اللوحة (v3.5.1) */
function openCustomize() {
  let layout = readLayout();
  const startKey = JSON.stringify(layout);
  const list = el('div', { className: 'dash-custom' });
  const info = {};
  DASH_BLOCKS.concat(DASH_SECTIONS).forEach((it) => { info[it.id] = it; });

  function save(next) {
    layout = next;
    writeLayout(layout);
    paint();
  }

  function row(id, canMove, idx, total) {
    const it = info[id];
    const shown = isVisible(layout, id);
    const cb = el('input', { type: 'checkbox', className: 'dash-custom__check', id: 'dash-custom-' + id, 'aria-label': it.title });
    cb.checked = shown;
    cb.addEventListener('change', () => save(toggleVisible(layout, id)));
    const mv = (dir, label, glyph, disabled) => {
      const b = el('button', {
        type: 'button', className: 'dash-custom__move', 'aria-label': label + ' «' + it.title + '»',
        onClick: () => save(moveSection(layout, id, dir)),
      }, glyph);
      if (disabled) b.disabled = true;
      return b;
    };
    return el('div', { className: 'dash-custom__row' + (shown ? '' : ' dash-custom__row--off') }, [
      el('label', { className: 'dash-custom__label', for: 'dash-custom-' + id }, [
        cb,
        el('span', { className: 'dash-custom__icon', 'aria-hidden': 'true' }, it.icon),
        el('span', { className: 'dash-custom__title' }, it.title),
      ]),
      canMove ? mv(-1, 'تحريك لأعلى', '▲', idx === 0) : null,
      canMove ? mv(1, 'تحريك لأسفل', '▼', idx === total - 1) : null,
    ]);
  }

  function paint() {
    clear(list);
    list.appendChild(el('div', { className: 'dash-custom__group', text: 'الكتل' }));
    DASH_BLOCKS.forEach((b) => list.appendChild(row(b.id, false, 0, 0)));
    list.appendChild(el('div', { className: 'dash-custom__group', text: 'الأقسام (رتّبها كما تريد)' }));
    const order = orderedSectionIds(layout);
    order.forEach((id, i) => list.appendChild(row(id, true, i, order.length)));
    list.appendChild(el('p', { className: 'dash-note', text: '«يحتاج إجراءك» تظهر دائماً في أعلى اللوحة.' }));
  }
  paint();

  const handle = modal.open({
    title: '⚙️ تخصيص لوحة التحكم',
    body: list,
    variant: 'sheet',
    closable: true,
    onClose: () => {
      /* لا إعادة رسم إن لم يتغيّر شيء */
      if (JSON.stringify(layout) !== startKey && state.container) {
        Promise.resolve(dashboardPage.render(state.container)).catch((e) => console.error('[Dashboard] re-render after customize failed:', e));
      }
    },
    actions: [
      { text: 'استعادة الافتراضي', variant: 'ghost', action: 'reset', onClick: () => { if (!isDefault(layout)) save(defaultLayout()); } },
      { text: 'تم', variant: 'primary', action: 'done', onClick: () => handle.close() },
    ],
  });
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
    const layout = readLayout();   /* v3.5.1: الافتراضي = اللوحة كما كانت */
    container.appendChild(buildHeader(data, isVisible(layout, 'quick') ? buildQuickActions() : null));
    if (data.hasDemo) container.appendChild(buildDemoBanner());
    const nudgeSlot = el('div', { 'data-role': 'nudge-slot' });
    container.appendChild(nudgeSlot);
    buildBackupNudge(data).then((n) => { if (n && nudgeSlot.isConnected) nudgeSlot.appendChild(n); });
    if (isVisible(layout, 'kpis')) container.appendChild(buildKPICards(data));
    container.appendChild(buildAttention(data));

    /* أقسام قابلة للطي: مواعيد · عملاء الأسبوع · مستحقة · رسوم · أحدث العملاء */
    const sections = el('div', { className: 'dash-sections' });
    const bar = buildSectionsBar(sections, openCustomize);
    sections.appendChild(bar);
    const shownIds = visibleSectionIds(layout);
    const want = (id) => shownIds.includes(id);
    const built = new Map();
    const keep = (n) => { if (n) built.set(n.getAttribute('data-collapsible-id'), n); };
    if (want('dash-appts')) keep(buildTodayAppointmentsSection(data.todayApptsRows));
    if (want('dash-week')) keep(buildWeekVisitsSection(data.weekVisits, data.workshopNameRaw));
    if (want('dash-due')) keep(buildDueSoonSection(data.dueSoonRows));
    if (want('dash-sales') || want('dash-finance') || want('dash-orders')) buildChartSections(data).forEach(keep);
    if (want('dash-recent')) keep(buildRecentCustomersSection(data.recentCustomers, data.workshopName));
    shownIds.forEach((id) => { const n = built.get(id); if (n) sections.appendChild(n); });
    bar.update();
    container.appendChild(sections);
  },

  destroy() {
    state = { container: null, data: null };
  },
};
