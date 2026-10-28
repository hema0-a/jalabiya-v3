/* ==========================================================================
   dashboard-sections.js — بناء مكوّنات اللوحة وأقسامها (v3.5.5)
   ==========================================================================
   مقتطع من dashboard.js دون تغيير في المنطق أو الشكل. دوال بناء فقط؛ ما يحتاج تنفيذ إجراء
   (تقدّم حالة/دفعة/موعد منتهٍ) يستلم كائن الإجراءات `actions` من dashboard-actions.js كوسيط.
   API: buildKPICards(data) · buildAttention(data, actions) · buildDueSoonSection(rows, actions)
        buildTodayAppointmentsSection(rows, actions) · buildWeekVisitsSection(rows, wn)
        buildRecentCustomersSection(list, wn) · buildChartSections(data)
   ========================================================================== */

import { buildPickupText } from '../services/pickup-reminders.js';
import { buildReminderText } from '../services/receivables.js';
import { sendLogged } from '../services/auto-messages.js';
import { toast } from '../ui/toast.js';
import { createCollapsible } from '../ui/collapsible.js'; /* v3.3.63 */
import { el } from '../core/dom.js';
import { startOfDayPlus } from '../core/day-math.js';
import { buildVisitText, dayLabel } from '../services/week-visits.js'; /* v3.3.55 */
import { formatEGP, formatDate, formatTime } from '../core/utils.js';
import {
  createSalesBarChart,
  createOrdersDonutChart,
  createFinanceChart,
} from '../ui/dashboard-charts.js';
import { NEXT_STATUS, STATUS_LABEL, go } from './dashboard-actions.js';

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

export function buildKPICards(data) {
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
export function buildAttention(data, actions) {
  const { advanceOrder, quickPay } = actions;
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

export function buildDueSoonSection(rows, actions) {
  const { advanceOrder } = actions;
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

export function buildTodayAppointmentsSection(rows, actions) {
  const { markApptDone } = actions;
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

export function buildWeekVisitsSection(rows, wn) {
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

export function buildRecentCustomersSection(list, wn) {
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
export function buildChartSections(data) {
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
