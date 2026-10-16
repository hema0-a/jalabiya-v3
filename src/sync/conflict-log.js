/* ==========================================================================
   conflict-log.js — سجل تعارضات المزامنة (حقل عُدّل على جهازين بقيمتين مختلفتين)
   ==========================================================================
   الدمج (record-merge.js) يختار الأحدث تلقائياً، وهذا السجل يحفظ القيمة الخاسرة لتراجعها بزر
   إن كانت هي الصحيحة. محلي لهذا الجهاز (localStorage)، أحدث 50 تعارضاً، وكل إدخال يُستبدل
   إن تكرر لنفس (مخزن، سجل، حقل). القيم الكبيرة (> 2KB) تُحفظ معاينةً فقط وبلا استرجاع.
   ========================================================================== */

import * as idb from '../data/idb.js';

const KEY = 'jalabiya_v3_sync_conflicts';
const MAX_ENTRIES = 50;
const MAX_VALUE_CHARS = 2000;

export const STORE_LABELS = {
  customers: 'عميل', orders: 'طلب', payments: 'دفعة', inventory: 'مخزون', workers: 'عامل',
  expenses: 'مصروف', appointments: 'موعد', portfolio: 'نموذج', commitments: 'التزام',
  commitmentPayments: 'دفعة التزام', savingsGoals: 'هدف ادخار', houseExpenses: 'مصروف بيت',
  personalLoans: 'سلفة', loanPayments: 'دفعة سلفة', referrals: 'إحالة', workerPayments: 'دفعة عامل', quotes: 'عرض سعر',
};

export const FIELD_LABELS = {
  name: 'الاسم', phone: 'الهاتف', address: 'العنوان', notes: 'الملاحظات', note: 'ملاحظة',
  status: 'الحالة', amount: 'المبلغ', deposit: 'المقدم', dueDate: 'موعد التسليم', date: 'التاريخ',
  title: 'العنوان', price: 'السعر', quantity: 'الكمية', method: 'طريقة الدفع', vip: 'VIP',
  email: 'البريد', category: 'التصنيف', priority: 'الأولوية', discountType: 'نوع الخصم', discountValue: 'قيمة الخصم',
};

/** 'a+b' (مجموعة ذرّية) → تسمية مركّبة. */
export function fieldLabel(field) {
  return String(field).split('+').map((f) => FIELD_LABELS[f] || f).join(' + ');
}

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))); return true; } catch (e) { return false; }
}

/** قيمة قابلة للحفظ: كبيرة جداً → معاينة نصية (غير قابلة للاسترجاع). */
function pack(v) {
  let s;
  try { s = JSON.stringify(v); } catch (e) { s = String(v); }
  if (s === undefined) return { v: null, restorable: true };
  if (s.length > MAX_VALUE_CHARS) return { v: s.slice(0, 120) + '…', restorable: false };
  return { v, restorable: true };
}

/** معاينة قصيرة لقيمة للعرض. */
export function previewValue(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (Array.isArray(v)) return v.length + ' عنصر';
  if (typeof v === 'object') { try { const s = JSON.stringify(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; } catch (e) { return '…'; } }
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

/**
 * تسجيل تعارضات ناتجة عن apply(merge).
 * @param {Array<{store:string, recordId:*, field:string, localValue:*, cloudValue:*, winner:string, localAt:number, cloudAt:number}>} list
 * @param {{now?:number}} [opts]
 * @returns {Promise<number>} عدد المُسجَّل
 */
export async function recordConflicts(list, opts = {}) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const now = opts.now || Date.now();
  const cur = read();
  const added = [];
  for (const c of list) {
    if (!c || !c.store || c.recordId == null || !c.field) continue;
    let label = '#' + String(c.recordId).slice(-6);
    try {
      const rec = await idb.get(c.store, c.recordId);
      if (rec && c.store === 'customers' && rec.name) label = rec.name;
    } catch (e) { /* ignore */ }
    const L = pack(c.localValue), C = pack(c.cloudValue);
    added.push({
      id: c.store + ':' + c.recordId + ':' + c.field,
      store: c.store, recordId: c.recordId, field: c.field, label,
      localValue: L.v, cloudValue: C.v, winner: c.winner === 'cloud' ? 'cloud' : 'local',
      restorable: L.restorable && C.restorable && !String(c.field).includes('+'),
      localAt: c.localAt, cloudAt: c.cloudAt, at: now,
    });
  }
  const ids = new Set(added.map((a) => a.id));
  write([...added, ...cur.filter((e) => !ids.has(e.id))]);
  return added.length;
}

export function getConflicts() { return read(); }
export function countConflicts() { return read().length; }

export function removeConflict(id) {
  const next = read().filter((e) => e.id !== id);
  write(next);
  return next.length;
}

export function clearConflicts() { write([]); }

/**
 * استرجاع القيمة الخاسرة: يكتب القيمة الأخرى في السجل المحلي (تُرفع بالمزامنة التالية).
 * @param {string} id — معرّف الإدخال
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function restoreLosingValue(id) {
  const e = read().find((x) => x.id === id);
  if (!e) return { ok: false, error: 'التعارض غير موجود' };
  if (!e.restorable) return { ok: false, error: 'القيمة كبيرة — عدّلها يدوياً' };
  const rec = await idb.get(e.store, e.recordId);
  if (!rec) return { ok: false, error: 'السجل لم يعد موجوداً' };
  const value = e.winner === 'local' ? e.cloudValue : e.localValue;
  await idb.put(e.store, { ...rec, [e.field]: value, updatedAt: Date.now() });
  removeConflict(id);
  return { ok: true };
}
