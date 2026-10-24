/* ==========================================================================
   ledger-conflicts.js — حسم تعارضات معرّفات الدفتر (id_conflict) (v3.4.2، المرحلة 2)
   ==========================================================================
   التعارض: سطران بالمعرّف نفسه وهويتهما المالية مختلفة (من دمج مزامنة/استعادة). الدفتر لا يُكتب فوقه
   أبداً، فالمزامنة أبقت المحفوظ محلياً وأسقطت الوارد وسجّلته في سجل البلاغات. هنا يحسمه المستخدم:
     1) «اعتماد المحفوظ» (keep): الوارد المُسقَط يُعدّ خطأً/مكرراً ⟵ لا يُكتب شيء في الدفتر.
     2) «تسجيل المُسقَط كتسوية جديدة» (record): الوارد حركة حقيقية أخرى ⟵ يُلحق كسطر جديد
        بمعرّف جديد ثابت (k:conflict:<الأصل>) ونوع adjust ومرجع conflictOf، فيُحتسب أثره دون المساس بالأصل.
        idempotent: لا يتكرر مهما ضُغط الزر أو سُجّل من أكثر من جهاز.
   التسجيل متاح للمحفظة والنقاط وبعد تفعيل الدفتر كمرجع فقط (وقتها العدّادات مشتقة فلا تنحرف)؛
   المخزون ظلّي حتى المرحلة 4 فيُحسم بـ «اعتماد المحفوظ» فقط. لا يعمل شيء منها تلقائياً.
   ========================================================================== */

import { customers as customersRepo } from '../data/repos/customers.js';
import { inventory as inventoryRepo } from '../data/repos/inventory.js';
import { makeEntry } from './ledger.js';
import { isAuthorityActive } from './ledger-flag.js';
import { applyLedgerEntry } from './ledger-apply.js';
import { loadLedgerIssues, resolveLedgerConflict } from './ledger-union.js';

/** تبعيات قابلة للاستبدال في الاختبار. */
export const conflictDeps = {
  isAuthorityActive: () => isAuthorityActive(),
  findCustomer: (id) => customersRepo.find(id),
  findItem: (id) => inventoryRepo.find(id),
  applyEntry: (customerId, build) => applyLedgerEntry(customerId, build),
  now: () => Date.now(),
};

/** معرّف سطر التسوية الثابت لتعارض معيّن. */
export const adjustmentKey = (conflictId) => 'conflict:' + conflictId;

/** ملخص جانب من التعارض. @returns {{delta:number, type:string, at:number|null, dev:string, note:string}} */
function side(e) {
  const x = e && typeof e === 'object' ? e : {};
  return { delta: Number(x.delta) || 0, type: String(x.type || ''), at: Number.isFinite(x.at) ? x.at : null, dev: String(x.dev || ''), note: String(x.note || '') };
}

/**
 * هل يمكن تسجيل المُسقَط كتسوية؟ (دالة نقية فوق حقائق مُمرَّرة)
 * @param {Object} dropped — السطر المُسقَط
 * @param {{authority:boolean, customerExists:boolean}} facts
 * @returns {{ok:boolean, reason:string}}
 */
export function canRecordDropped(dropped, facts) {
  if (!dropped || typeof dropped !== 'object') return { ok: false, reason: 'بيانات الحركة المُسقَطة غير متوفرة' };
  if (dropped.unit !== 'wallet' && dropped.unit !== 'points') {
    return { ok: false, reason: 'المخزون ظلّي حتى المرحلة 4 — اعتمد المحفوظ فقط' };
  }
  if (!Number.isInteger(dropped.delta) || dropped.delta === 0) return { ok: false, reason: 'مقدار الحركة المُسقَطة غير صالح' };
  if (!facts.authority) return { ok: false, reason: 'يتاح التسجيل بعد تفعيل الدفتر كمرجع (حتى لا تنحرف العدّادات)' };
  if (!facts.customerExists) return { ok: false, reason: 'العميل صاحب الحساب غير موجود' };
  return { ok: true, reason: '' };
}

/**
 * التعارضات المعلّقة مع عنوان صاحب الحساب وإمكانية التسجيل.
 * @param {Object} [overrides]
 * @returns {Promise<Array<{id:string, unit:string, acct:string, title:string, kept:Object, dropped:Object, canRecord:{ok:boolean, reason:string}}>>}
 */
export async function describeConflicts(overrides = {}) {
  const d = { ...conflictDeps, ...overrides };
  const authority = await d.isAuthorityActive();
  const out = [];
  for (const c of loadLedgerIssues().conflicts) {
    const dropped = c.dropped || c.kept || {};
    const unit = dropped.unit || (c.kept && c.kept.unit) || '';
    const acct = String(dropped.acct || (c.kept && c.kept.acct) || '');
    let title = '';
    let exists = false;
    try {
      if (unit === 'stock') { const it = await d.findItem(acct); title = it ? (it.name || 'صنف') : 'صنف غير معروف'; }
      else { const cu = await d.findCustomer(acct); exists = !!cu; title = cu ? (cu.name || 'عميل') : 'عميل غير موجود'; }
    } catch (e) { title = 'حساب غير معروف'; }
    out.push({ id: c.id, unit, acct, title, kept: side(c.kept), dropped: side(c.dropped), canRecord: canRecordDropped(c.dropped, { authority, customerExists: exists }) });
  }
  return out;
}

/**
 * «اعتماد المحفوظ»: لا يُكتب شيء في الدفتر؛ يُحسم التعارض ويُسجَّل في سجل التسويات.
 * @param {string} id
 * @param {Object} [overrides]
 * @returns {Promise<{status:'resolved'|'missing', reason:string}>}
 */
export async function keepStoredConflict(id, overrides = {}) {
  const d = { ...conflictDeps, ...overrides };
  const ok = resolveLedgerConflict(id, 'keep', { at: d.now() });
  return ok ? { status: 'resolved', reason: '' } : { status: 'missing', reason: 'التعارض غير موجود (حُسم سابقاً؟)' };
}

/**
 * «تسجيل المُسقَط كتسوية جديدة بمعرّف جديد». لا يكتب فوق أي سطر، ولا يرمي: يُرجع status.
 * @param {string} id
 * @param {Object} [overrides]
 * @returns {Promise<{status:'recorded'|'exists'|'blocked'|'missing'|'failed', reason:string, newId?:string}>}
 */
export async function recordDroppedConflict(id, overrides = {}) {
  const d = { ...conflictDeps, ...overrides };
  try {
    const c = loadLedgerIssues().conflicts.find((x) => x.id === id);
    if (!c) return { status: 'missing', reason: 'التعارض غير موجود (حُسم سابقاً؟)' };
    const dropped = c.dropped;
    const customerExists = dropped && dropped.acct ? !!(await d.findCustomer(String(dropped.acct))) : false;
    const can = canRecordDropped(dropped, { authority: await d.isAuthorityActive(), customerExists });
    if (!can.ok) return { status: 'blocked', reason: can.reason };

    const res = await d.applyEntry(String(dropped.acct), ({ dev, seq, now }) => makeEntry({
      unit: dropped.unit, acct: String(dropped.acct), delta: dropped.delta, type: 'adjust',
      key: adjustmentKey(id), ref: { conflictOf: id },
      note: ('تسوية: حركة أُسقطت بتعارض معرّف — ' + (dropped.note || dropped.type || '')).slice(0, 200),
      at: Number.isFinite(dropped.at) ? dropped.at : now,
    }, { dev, seq }));
    resolveLedgerConflict(id, 'record', { newId: res.entry.id, at: d.now() });
    return { status: res.status === 'exists' ? 'exists' : 'recorded', reason: '', newId: res.entry.id };
  } catch (e) {
    return { status: 'failed', reason: (e && e.message) || String(e) };
  }
}
