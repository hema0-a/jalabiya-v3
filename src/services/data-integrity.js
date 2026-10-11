/* ==========================================================================
   data-integrity.js — فحص سلامة البيانات (v3.3.30)
   ==========================================================================
   scanIntegrity يُرجع مشاكل. fix (إن وُجد) = تعديل آمن لا يمسّ أي مبلغ مالي.
   ما يمسّ الأرقام يُعرض للتقرير فقط ويقرّره المستخدم.
   ========================================================================== */

const ids = (list) => new Set((Array.isArray(list) ? list : []).filter(Boolean).map((x) => x.id));

/**
 * @returns {{issues:Array, counts:Object, total:number}}
 *   issue = {type, severity:'error'|'warn'|'info', message, store, id, fix?:{store,id,patch}}
 */
export function scanIntegrity({ customers, orders, payments, appointments, quotes } = {}) {
  const cs = Array.isArray(customers) ? customers : [];
  const os = Array.isArray(orders) ? orders : [];
  const ps = Array.isArray(payments) ? payments : [];
  const as = Array.isArray(appointments) ? appointments : [];
  const qs = Array.isArray(quotes) ? quotes : [];
  const cid = ids(cs);
  const oMap = new Map(os.filter(Boolean).map((o) => [o.id, o]));
  const issues = [];
  const add = (i) => issues.push(i);

  for (const p of ps) {
    if (!p) continue;
    if (p.orderId && !oMap.has(p.orderId)) {
      add({ type: 'payment_orphan_order', severity: 'warn', store: 'payments', id: p.id,
        message: 'دفعة ' + (Number(p.amount) || 0) + ' مربوطة بطلب غير موجود',
        fix: { store: 'payments', id: p.id, patch: { orderId: null }, label: 'فكّ الربط (تظهر كدفعة غير مربوطة)' } });
    } else if (p.orderId && oMap.get(p.orderId).customerId && p.customerId !== oMap.get(p.orderId).customerId) {
      add({ type: 'payment_customer_mismatch', severity: 'warn', store: 'payments', id: p.id,
        message: 'دفعة ' + (Number(p.amount) || 0) + ' عميلها يختلف عن عميل الطلب المربوطة به',
        fix: { store: 'payments', id: p.id, patch: { customerId: oMap.get(p.orderId).customerId }, label: 'اجعل عميلها عميل الطلب' } });
    }
    if (p.customerId && !cid.has(p.customerId)) {
      add({ type: 'payment_missing_customer', severity: 'error', store: 'payments', id: p.id,
        message: 'دفعة ' + (Number(p.amount) || 0) + ' لعميل محذوف' });
    }
    if (!p.orderId && (Number(p.amount) || 0) > 0) {
      add({ type: 'payment_unlinked', severity: 'info', store: 'payments', id: p.id,
        message: 'دفعة ' + Number(p.amount) + ' غير مربوطة بطلب (اربطها من صفحة المستحقات)' });
    }
  }
  for (const o of os) {
    if (!o) continue;
    if (o.customerId && !cid.has(o.customerId)) {
      add({ type: 'order_missing_customer', severity: 'error', store: 'orders', id: o.id, message: 'طلب لعميل محذوف' });
    }
    if ((Number(o.amount) || 0) < 0) {
      add({ type: 'order_negative_amount', severity: 'error', store: 'orders', id: o.id, message: 'طلب بمبلغ سالب' });
    }
    if ((Number(o.amount) || 0) >= 0 && (Number(o.deposit) || 0) > (Number(o.amount) || 0) && o.status !== 'cancelled') {
      add({ type: 'order_deposit_over', severity: 'warn', store: 'orders', id: o.id, message: 'مقدم الطلب أكبر من إجماليه' });
    }
  }
  for (const a of as) {
    if (!a) continue;
    if (a.customerId && !cid.has(a.customerId)) {
      add({ type: 'appointment_missing_customer', severity: 'warn', store: 'appointments', id: a.id, message: 'موعد لعميل محذوف' });
    }
    if (a.orderId && !oMap.has(a.orderId)) {
      add({ type: 'appointment_orphan_order', severity: 'warn', store: 'appointments', id: a.id,
        message: 'موعد مربوط بطلب غير موجود',
        fix: { store: 'appointments', id: a.id, patch: { orderId: null }, label: 'فكّ الربط' } });
    }
  }
  for (const q of qs) {
    if (!q) continue;
    if (q.customerId && !cid.has(q.customerId)) {
      add({ type: 'quote_missing_customer', severity: 'warn', store: 'quotes', id: q.id, message: 'عرض سعر لعميل محذوف' });
    }
    if (q.orderId && !oMap.has(q.orderId)) {
      add({ type: 'quote_orphan_order', severity: 'warn', store: 'quotes', id: q.id,
        message: 'عرض مربوط بطلب غير موجود',
        fix: { store: 'quotes', id: q.id, patch: { orderId: null }, label: 'فكّ الربط' } });
    }
  }
  const counts = {};
  issues.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; });
  return { issues, counts, total: issues.length };
}

export const ISSUE_LABELS = {
  payment_orphan_order: 'دفعات مربوطة بطلب محذوف',
  payment_customer_mismatch: 'دفعات عميلها يخالف عميل الطلب',
  payment_missing_customer: 'دفعات لعميل محذوف',
  payment_unlinked: 'دفعات غير مربوطة بطلب',
  order_missing_customer: 'طلبات لعميل محذوف',
  order_negative_amount: 'طلبات بمبلغ سالب',
  order_deposit_over: 'مقدم أكبر من إجمالي الطلب',
  appointment_missing_customer: 'مواعيد لعميل محذوف',
  appointment_orphan_order: 'مواعيد مربوطة بطلب محذوف',
  quote_missing_customer: 'عروض أسعار لعميل محذوف',
  quote_orphan_order: 'عروض مربوطة بطلب محذوف',
};
