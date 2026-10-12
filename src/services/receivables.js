/* ==========================================================================
   receivables.js — مستحقات العملاء (الديون حسب العمر) — حساب عرض فقط
   ==========================================================================
   يعتمد على orderPaidBreakdown (نفس قاعدة المقدم/الدفعات في كل التطبيق) فلا تختلف الأرقام.

   التصنيف لكل طلب غير ملغى فيه متبقٍّ:
     - overdue : الطلب سُلِّم وعليه متبقٍّ → «دين» يُقاس عمره من وقت التسليم
                 (deliveredAt، وإلا dueDate، وإلا createdAt).
     - pending : لم يُسلَّم بعد → رصيد مستحق عند التسليم (طبيعي، لا يُعدّ دَيناً ولا يُقاس عمره).
   دفعات العميل غير المربوطة بطلب (بلا orderId) لا تُخصم تلقائياً (لا نخمّن لأي طلب):
   تُعرض كـ «رصيد غير مربوط» بجانب المستحق ليقرر المستخدم.
   ========================================================================== */

import { orderPaidBreakdown } from './payments-view.js';
import { renderTemplate, workshopVars, KIND } from './message-templates.js';

const EPS = 0.009;
const DAY_MS = 86400000;

/** شرائح العمر بالأيام منذ التسليم. */
export const AGE_BUCKETS = [
  { id: 'd0_7', label: '٠–٧ أيام', min: 0, max: 7 },
  { id: 'd8_30', label: '٨–٣٠ يوماً', min: 8, max: 30 },
  { id: 'd31_60', label: '٣١–٦٠ يوماً', min: 31, max: 60 },
  { id: 'd60p', label: 'أكثر من ٦٠ يوماً', min: 61, max: Infinity },
];

function bucketOf(days) {
  return AGE_BUCKETS.find((b) => days >= b.min && days <= b.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1];
}

/**
 * @param {Array} ordersList
 * @param {Array} paymentsList — الدفعات المسجّلة فقط (بدون دفعات المقدم الافتراضية)
 * @param {Array} customersList
 * @param {number} [now]
 * @returns {{customers:Array, totals:{overdue:number, pending:number, customersOverdue:number},
 *            buckets:Array<{id:string,label:string,amount:number,count:number}>}}
 */
export function computeReceivables(ordersList, paymentsList, customersList, now = Date.now()) {
  const orders = Array.isArray(ordersList) ? ordersList : [];
  const pays = Array.isArray(paymentsList) ? paymentsList : [];
  const custMap = new Map();
  for (const c of (Array.isArray(customersList) ? customersList : [])) if (c && c.id != null) custMap.set(c.id, c);

  const byOrder = new Map();
  const unlinked = new Map();   /* customerId → مجموع الدفعات بلا orderId */
  const unlinkedList = new Map(); /* customerId → [{id, amount, date}] لربطها يدوياً بطلب */
  for (const p of pays) {
    if (!p) continue;
    if (p.orderId) {
      if (!byOrder.has(p.orderId)) byOrder.set(p.orderId, []);
      byOrder.get(p.orderId).push(p);
    } else if (p.customerId != null) {
      unlinked.set(p.customerId, (unlinked.get(p.customerId) || 0) + (Number(p.amount) || 0));
      if ((Number(p.amount) || 0) > 0 && p.id != null) {
        if (!unlinkedList.has(p.customerId)) unlinkedList.set(p.customerId, []);
        unlinkedList.get(p.customerId).push({ id: p.id, amount: Number(p.amount) || 0, date: p.date || p.createdAt || null });
      }
    }
  }

  const buckets = AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, amount: 0, count: 0 }));
  const byCustomer = new Map();

  for (const o of orders) {
    if (!o || o.status === 'cancelled') continue;
    const amount = Number(o.amount) || 0;
    if (amount <= 0) continue;
    const { paid } = orderPaidBreakdown(o, byOrder.get(o.id));
    const remaining = amount - paid;
    if (remaining <= EPS) continue;

    const delivered = o.status === 'delivered';
    const ref = delivered ? (o.deliveredAt || o.dueDate || o.createdAt || now) : null;
    const ageDays = delivered ? Math.max(0, Math.floor((now - ref) / DAY_MS)) : null;

    let row = byCustomer.get(o.customerId);
    if (!row) {
      const c = custMap.get(o.customerId);
      row = {
        customerId: o.customerId,
        name: (c && c.name) || 'عميل غير معروف',
        phone: (c && c.phone) || '',
        overdue: 0, pending: 0, oldestDays: 0,
        unlinkedCredit: unlinked.get(o.customerId) || 0,
        unlinkedPayments: unlinkedList.get(o.customerId) || [],
        orders: [],
      };
      byCustomer.set(o.customerId, row);
    }
    row.orders.push({ id: o.id, amount, paid, remaining, delivered, ageDays, ref });
    if (delivered) {
      row.overdue += remaining;
      row.oldestDays = Math.max(row.oldestDays, ageDays);
      const b = buckets.find((x) => x.id === bucketOf(ageDays).id);
      b.amount += remaining; b.count += 1;
    } else {
      row.pending += remaining;
    }
  }

  const customers = [...byCustomer.values()];
  for (const c of customers) c.orders.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
  customers.sort((a, b) => (b.overdue - a.overdue) || (b.pending - a.pending));

  const totals = {
    overdue: customers.reduce((s, c) => s + c.overdue, 0),
    pending: customers.reduce((s, c) => s + c.pending, 0),
    customersOverdue: customers.filter((c) => c.overdue > EPS).length,
  };
  return { customers, totals, buckets };
}

/** نص تذكير واتساب مهذّب لمستحق عميل. */
/** متغيرات رسالة تذكير المستحقات (تُستعمل أيضاً في طابور الرسائل). */
export function debtVars(name, amountText, workshop = '', phone = '') {
  return { customer: name || 'عميلنا الكريم', overdue: String(amountText ?? ''), phone: phone || '', ...workshopVars(workshop) };
}

/**
 * نص تذكير بالمستحقات. القالب قابل للتخصيص (cfg = settings.autoMessages).
 */
export function buildReminderText(name, amountText, workshop = '', cfg = null) {
  return renderTemplate(KIND.DEBT, debtVars(name, amountText, workshop), cfg);
}
