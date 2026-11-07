/* ==========================================================================
   suppliers.js — الموردون والمشتريات (v3.12.0) — دوال نقية
   ==========================================================================
   دفتر بسيط لكل مورد: مشتريات (purchase) تزيد المستحق عليك، ودفعات (payment) تنقصه.
   رصيد المورد (owed) = مجموع المشتريات − مجموع الدفعات؛ موجب = عليك له، سالب = له عندك رصيد.
   مقارنة الأسعار: لكل صنف (اسم حر) آخر سعر متر عند كل مورد ومن الأرخص.
   لا تلمس DOM ولا قاعدة البيانات. المبالغ تُقرَّب لخانتين، والمدخلات الفاسدة تُهمَل بلا انهيار.
   ========================================================================== */

import { normalizeSearch } from '../core/utils.js';

export const KINDS = [
  { id: 'purchase', icon: '🛒', label: 'مشتريات' },
  { id: 'payment', icon: '💵', label: 'دفعة' },
];
export const MAX_NAME = 80;
export const MAX_NOTES = 300;
export const MAX_ITEM = 80;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;
const str = (v, max) => (typeof v === 'string' ? v.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const normalizeKind = (v) => (v === 'payment' ? 'payment' : 'purchase');

/** تحقّق من بيانات المورد. @returns {{ok:boolean, error?:string, data?:{name,phone,notes}}} */
export function checkSupplierInput(input) {
  const name = str(input && input.name, MAX_NAME);
  if (!name) return { ok: false, error: 'اسم المورد مطلوب' };
  const phone = typeof (input && input.phone) === 'string' ? input.phone.replace(/[^\d+\u0660-\u0669]/g, '').slice(0, 20) : '';
  return { ok: true, data: { name, phone, notes: str(input && input.notes, MAX_NOTES) } };
}

/** تحقّق من حركة (مشتريات/دفعة). الأمتار اختيارية للمشتريات فقط. */
export function checkEntryInput(input) {
  const kind = normalizeKind(input && input.kind);
  const amount = r2(input && input.amount);
  if (!(amount > 0)) return { ok: false, error: 'المبلغ لازم يكون أكبر من صفر' };
  if (amount > 100000000) return { ok: false, error: 'المبلغ كبير جداً' };
  const data = { kind, amount, notes: str(input && input.notes, MAX_NOTES) };
  if (kind === 'purchase') {
    data.item = str(input && input.item, MAX_ITEM);
    const meters = n(input && input.meters);
    if (input && input.meters !== '' && input.meters != null && meters < 0) return { ok: false, error: 'الأمتار لا تكون سالبة' };
    data.meters = meters > 0 ? Math.round(meters * 100) / 100 : 0;
  }
  return { ok: true, data };
}

/** سعر المتر لحركة مشتريات (المبلغ ÷ الأمتار) أو null. */
export function entryPricePerMeter(e) {
  if (!e || normalizeKind(e.kind) !== 'purchase') return null;
  const m = n(e.meters), a = n(e.amount);
  return m > 0 && a > 0 ? r2(a / m) : null;
}

const byDateAsc = (a, b) => n(a.date) - n(b.date) || n(a.createdAt) - n(b.createdAt);

/** رصيد مجموعة حركات لمورد واحد. */
export function supplierBalance(entries) {
  let purchased = 0, paid = 0, count = 0, lastDate = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !(n(e.amount) > 0)) continue;
    if (normalizeKind(e.kind) === 'purchase') purchased += n(e.amount); else paid += n(e.amount);
    count++;
    if (n(e.date) > lastDate) lastDate = n(e.date);
  }
  return { purchased: r2(purchased), paid: r2(paid), owed: r2(purchased - paid), count, lastDate };
}

/** صف لكل مورد (مرتّب: الأكثر مستحقاً أولاً ثم بالاسم)، مع آخر سعر متر. */
export function balancesBySupplier(suppliers, entries) {
  const by = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !e.supplierId) continue;
    if (!by.has(e.supplierId)) by.set(e.supplierId, []);
    by.get(e.supplierId).push(e);
  }
  const rows = (Array.isArray(suppliers) ? suppliers : []).filter((s) => s && s.id).map((s) => {
    const list = (by.get(s.id) || []).slice().sort(byDateAsc);
    const bal = supplierBalance(list);
    let lastPrice = null;
    for (let i = list.length - 1; i >= 0 && lastPrice === null; i--) lastPrice = entryPricePerMeter(list[i]);
    return { supplier: s, ...bal, lastPricePerMeter: lastPrice };
  });
  rows.sort((a, b) => (b.owed - a.owed) || String(a.supplier.name).localeCompare(String(b.supplier.name), 'ar'));
  return rows;
}

/** إجمالي المستحق عليك للموردين (الأرصدة الموجبة فقط). */
export function totalOwed(rows) {
  return r2((Array.isArray(rows) ? rows : []).reduce((s, r) => s + Math.max(0, n(r && r.owed)), 0));
}

const sameMonth = (ts, now) => { const d = new Date(n(ts)); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };

/** مشتريات ودفعات الشهر الحالي. */
export function monthSummary(entries, now = new Date()) {
  let purchased = 0, paid = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !(n(e.amount) > 0) || !e.date || !sameMonth(e.date, now)) continue;
    if (normalizeKind(e.kind) === 'purchase') purchased += n(e.amount); else paid += n(e.amount);
  }
  return { purchased: r2(purchased), paid: r2(paid) };
}

/**
 * لوحة مقارنة الأسعار: لكل صنف (بعد التطبيع) آخر سعر متر ومتوسطه عند كل مورد، والأرخص.
 * الأصناف المتوفرة عند أكثر من مورد أولاً (أعلى فائدة للمقارنة)، ثم الأحدث.
 * @returns {Array<{key:string,item:string,rows:Array,cheapestId:string|null,spread:number,lastDate:number}>}
 */
export function priceBoard(suppliers, entries, opts = {}) {
  const max = Math.max(1, Math.round(n(opts.max)) || 12);
  const names = new Map((Array.isArray(suppliers) ? suppliers : []).filter((s) => s && s.id).map((s) => [s.id, s.name]));
  const items = new Map();
  for (const e of (Array.isArray(entries) ? entries : []).slice().sort(byDateAsc)) {
    const p = entryPricePerMeter(e);
    const label = str(e && e.item, MAX_ITEM);
    if (p === null || !label || !names.has(e.supplierId)) continue;
    const key = normalizeSearch(label);
    if (!key) continue;
    if (!items.has(key)) items.set(key, { key, item: label, per: new Map(), lastDate: 0 });
    const it = items.get(key);
    if (n(e.date) >= it.lastDate) { it.lastDate = n(e.date); it.item = label; }
    if (!it.per.has(e.supplierId)) it.per.set(e.supplierId, []);
    it.per.get(e.supplierId).push({ price: p, date: n(e.date) });
  }
  const out = [];
  for (const it of items.values()) {
    const rows = [];
    for (const [sid, list] of it.per) {
      const last = list[list.length - 1];
      rows.push({ supplierId: sid, name: names.get(sid), lastPrice: last.price, avgPrice: r2(list.reduce((s, x) => s + x.price, 0) / list.length), lastDate: last.date, count: list.length });
    }
    rows.sort((a, b) => a.lastPrice - b.lastPrice || String(a.name).localeCompare(String(b.name), 'ar'));
    out.push({ key: it.key, item: it.item, rows, cheapestId: rows.length > 1 ? rows[0].supplierId : null, spread: rows.length > 1 ? r2(rows[rows.length - 1].lastPrice - rows[0].lastPrice) : 0, lastDate: it.lastDate });
  }
  out.sort((a, b) => (b.rows.length > 1) - (a.rows.length > 1) || b.lastDate - a.lastDate);
  return out.slice(0, max);
}
