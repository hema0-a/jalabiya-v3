/* ==========================================================================
   data-integrity.js — فحص سلامة البيانات (v3.3.30)
   ==========================================================================
   scanIntegrity يُرجع مشاكل. fix (إن وُجد) = تعديل آمن لا يمسّ أي مبلغ مالي.
   ما يمسّ الأرقام يُعرض للتقرير فقط ويقرّره المستخدم.
   ========================================================================== */

import { findOrphanMedia } from './order-media.js';

const ids = (list) => new Set((Array.isArray(list) ? list : []).filter(Boolean).map((x) => x.id));

/**
 * @returns {{issues:Array, counts:Object, total:number}}
 *   issue = {type, severity:'error'|'warn'|'info', message, store, id, fix?:{store,id,patch}}
 */
export function scanIntegrity({ customers, orders, payments, appointments, quotes, orderMediaKeys, trashOrderIds, aftercare, workers, attendance, suppliers, supplierEntries } = {}) {
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
  /* وسائط الطلبات (v3.3.86): من المفاتيح فقط (بلا قراءة الصور). تُعرض للتقرير ولا يُصلَح تلقائياً (حذف غير قابل للتراجع).
     يُتخطّى الفحص إن لم تُمرَّر المفاتيح (الصفحات التي لا تقرأها). طلب في السلة ليس يتيماً. */
  if (Array.isArray(orderMediaKeys) && orderMediaKeys.length) {
    const m = findOrphanMedia(orderMediaKeys, oMap.keys(), Array.isArray(trashOrderIds) ? trashOrderIds : []);
    for (const k of m.orphans) {
      add({ type: 'media_orphan', severity: 'warn', store: 'orderMedia', id: k, message: 'وسيط (صورة/توقيع) لطلب غير موجود ولا في السلة' });
    }
    for (const k of m.invalid) {
      add({ type: 'media_bad_key', severity: 'warn', store: 'orderMedia', id: k, message: 'سجل وسائط بمعرّف غير صالح' });
    }
  }
  /* روابط مخازن 3.12–3.16 (v3.16.2): يُتخطّى كل فحص إن لم تُمرَّر مدخلاته. تُعرض للتقرير فقط (لا إصلاح آلي: الحذف قرار المستخدم).
     طلب في السلة ليس يتيماً. وبلا طلبات محمَّلة (فحص جزئي) لا نحكم على الحالات. */
  if (Array.isArray(aftercare) && os.length > 0) {
    const trashSet = new Set(Array.isArray(trashOrderIds) ? trashOrderIds : []);
    for (const c of aftercare) {
      if (!c) continue;
      if (c.orderId && !oMap.has(c.orderId) && !trashSet.has(c.orderId)) {
        add({ type: 'aftercare_orphan_order', severity: 'warn', store: 'aftercare', id: c.id, message: 'حالة رجوع مربوطة بطلب غير موجود' });
      }
      if (c.customerId && !cid.has(c.customerId)) {
        add({ type: 'aftercare_missing_customer', severity: 'info', store: 'aftercare', id: c.id, message: 'حالة رجوع لعميل محذوف' });
      }
    }
  }
  if (Array.isArray(attendance) && Array.isArray(workers)) {
    const wid = ids(workers);
    for (const r of attendance) {
      if (r && r.workerId && !wid.has(r.workerId)) {
        add({ type: 'attendance_orphan_worker', severity: 'warn', store: 'attendance', id: r.id, message: 'سجل حضور لعامل غير موجود' });
      }
    }
  }
  if (Array.isArray(supplierEntries) && Array.isArray(suppliers)) {
    const sid = ids(suppliers);
    for (const e of supplierEntries) {
      if (e && e.supplierId && !sid.has(e.supplierId)) {
        add({ type: 'supplier_entry_orphan', severity: 'warn', store: 'supplierEntries', id: e.id, message: 'حركة مورد لمورد غير موجود' });
      }
    }
  }
  /* v3.19.0: قيم غير صالحة تكسر الحسابات والتقويم والتوقّعات بصمت، وتكرار المعرّفات (قد ينتج عن دمج مزامنة).
     تُعرض للتقرير فقط — لا إصلاح آلي لأنها تمسّ أرقاماً أو سجلات: القرار للمستخدم. المفقود (undefined) ليس خطأً: المُنكَر فقط (NaN/نص غير رقمي). */
  const badNum = (v) => v != null && v !== '' && !Number.isFinite(Number(v));
  for (const o of os) {
    if (!o) continue;
    if (badNum(o.amount)) add({ type: 'order_bad_amount', severity: 'error', store: 'orders', id: o.id, message: 'طلب بمبلغ غير رقمي' });
    if (badNum(o.dueDate)) add({ type: 'order_bad_due', severity: 'warn', store: 'orders', id: o.id, message: 'طلب بموعد تسليم غير صالح (لا يظهر في التقويم والتأخير)' });
  }
  for (const p of ps) {
    if (p && badNum(p.amount)) add({ type: 'payment_bad_amount', severity: 'error', store: 'payments', id: p.id, message: 'دفعة بمبلغ غير رقمي' });
  }
  const dupes = (list, store, label) => {
    const seen = new Set(); const dup = new Set();
    for (const x of list) { if (!x || x.id == null) continue; if (seen.has(x.id)) dup.add(x.id); seen.add(x.id); }
    for (const id of dup) add({ type: 'duplicate_id', severity: 'error', store, id, message: label + ' بمعرّف مكرر (سجلان بنفس المعرّف)' });
  };
  dupes(cs, 'customers', 'عميل'); dupes(os, 'orders', 'طلب'); dupes(ps, 'payments', 'دفعة');

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
  media_orphan: 'وسائط (صور/توقيعات) لطلب غير موجود',
  media_bad_key: 'سجلات وسائط بمعرّف غير صالح',
  aftercare_orphan_order: 'حالات رجوع مربوطة بطلب محذوف',
  aftercare_missing_customer: 'حالات رجوع لعميل محذوف',
  attendance_orphan_worker: 'سجلات حضور لعامل غير موجود',
  supplier_entry_orphan: 'حركات موردين لمورد غير موجود',
  order_bad_amount: 'طلبات بمبلغ غير رقمي',
  order_bad_due: 'طلبات بموعد تسليم غير صالح',
  payment_bad_amount: 'دفعات بمبلغ غير رقمي',
  duplicate_id: 'سجلات بمعرّف مكرر',
};
