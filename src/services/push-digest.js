/* ==========================================================================
   push-digest.js — ملخص الإشعارات الحقيقية (Push) — دوال نقية بلا اعتماديات
   ==========================================================================
   الجهاز لا يرسل بياناته الكاملة للخادم: يبني «ملخصاً» صغيراً (مواعيد التسليم،
   الجاهز، نواقص المخزون، استحقاق الالتزامات) تقرؤه Cloud Function مجدولة
   وترسل منه إشعاراً واحداً يومياً حتى لو التطبيق مقفول.
   - الأسماء اختيارية (includeNames=false ⇒ لا اسم عميل يغادر الجهاز).
   - الحد الأقصى 400 طلب (الأقرب موعداً أولاً) ليبقى المستند صغيراً.
   ========================================================================== */

import { filterForHardMonth, normalizePersonalControls } from './daily-need.js';
import { schedule as circleSchedule, ymOf } from './circles.js';

export const DIGEST_VERSION = 1;
export const MAX_DIGEST_ORDERS = 400;

const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD بالتوقيت المحلي للجهاز. */
export function localYmd(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** أول كلمة من اسم العميل (أقصى 14 حرفاً). */
export function firstName(name) {
  const s = String(name || '').trim().split(/\s+/)[0] || '';
  return s.slice(0, 14);
}

/** تنقية خيارات Push (الافتراضيات آمنة وتُقصّ ضمن الحدود). */
export function pushOptions(settings) {
  const n = (settings && settings.notifications) || {};
  const p = (n && n.push) || {};
  const clampInt = (v, lo, hi, d) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.floor(x))) : d;
  };
  const hhmm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? v : d);
  return {
    enabled: p.enabled === true,
    vapidKey: typeof p.vapidKey === 'string' ? p.vapidKey.trim() : '',
    time: hhmm(p.time, '08:00'),
    daysBefore: clampInt(p.daysBefore, 0, 14, 1),
    includeNames: p.includeNames !== false,
    overdue: p.overdue !== false,
    ready: p.ready !== false,
    stock: p.stock !== false,
    commitments: p.commitments !== false,
    commitmentsDays: clampInt(p.commitmentsDays, 0, 14, 3),
    documents: p.documents !== false,   /* v3.17.0 */
    circles: p.circles !== false,
    tasks: p.tasks !== false,
    quietEnabled: n.quietEnabled === true,
    quietFrom: hhmm(n.quietFrom, '22:00'),
    quietTo: hhmm(n.quietTo, '07:00'),
  };
}

const CLOSED = new Set(['delivered', 'cancelled']);

/**
 * بناء الملخص.
 * @param {Object} src
 * @param {Array} src.orders
 * @param {Array} src.customers
 * @param {Object} src.settings
 * @param {number} [src.lowStock]
 * @param {number} [src.outOfStock]
 * @param {Array}  [src.commitments] — {name, dueDay, active}
 * @param {number} [src.now]
 * @param {string} [src.tz]
 */
export function buildDigest(src) {
  const { orders = [], customers = [], settings = {}, now = Date.now() } = src || {};
  const opts = pushOptions(settings);
  const byId = new Map();
  for (const c of customers) if (c && c.id != null) byId.set(c.id, c);

  const open = [];
  for (const o of orders) {
    if (!o || CLOSED.has(o.status)) continue;
    const hasDue = Number.isFinite(o.dueDate) && o.dueDate > 0;
    const isReady = o.status === 'ready';
    if (!hasDue && !isReady) continue;
    const row = { i: String(o.id), r: isReady ? 1 : 0 };
    if (hasDue) row.d = localYmd(o.dueDate);
    if (opts.includeNames) {
      const nm = firstName((byId.get(o.customerId) || {}).name);
      if (nm) row.c = nm;
    }
    open.push({ row, key: hasDue ? o.dueDate : Infinity });
  }
  open.sort((a, b) => a.key - b.key);

  const cm = [];
  if (opts.commitments) {
    /* v3.15.0: «وضع الشهر الصعب» يُبقي الالتزامات الضرورية فقط في الملخص اليومي (يُطبَّق هنا قبل الرفع) */
    const hard = normalizePersonalControls(settings.personalControls).hardMonth;
    for (const c of filterForHardMonth(src.commitments || [], hard)) {
      if (!c || c.active === false) continue;
      const day = Number(c.dueDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      const row = { day };
      if (opts.includeNames && c.name) row.t = String(c.name).slice(0, 24);
      cm.push(row);
      if (cm.length >= 40) break;
    }
  }

  /* v3.17.0: إضافات اختيارية متوافقة مع الخادمة القديمة (تتجاهل الحقول التي لا تعرفها).
     تُرسَل تواريخ لا أعداد جاهزة، فيحسبها الخادم بتاريخ يومه فلا يبلى الملخص بين الصباحات. */
  const out = { v: DIGEST_VERSION, at: now, orders: open.slice(0, MAX_DIGEST_ORDERS).map((x) => x.row),
    low: opts.stock ? Math.max(0, Math.floor(Number(src.lowStock) || 0)) : 0,
    out: opts.stock ? Math.max(0, Math.floor(Number(src.outOfStock) || 0)) : 0,
    cm };
  if (opts.documents && Array.isArray(src.documents)) {
    const dc = [];
    for (const d of src.documents) {
      const exp = Number(d && d.expiresAt);
      if (!(exp > 0)) continue;
      const row = { e: localYmd(exp), r: Number.isFinite(Number(d.remindDays)) ? Math.max(0, Math.min(365, Math.floor(Number(d.remindDays)))) : 30 };
      if (opts.includeNames && d.title) row.t = String(d.title).slice(0, 24);
      dc.push(row);
    }
    dc.sort((a, b) => (a.e < b.e ? -1 : a.e > b.e ? 1 : 0));
    if (dc.length) out.dc = dc.slice(0, 30);
  }
  if (opts.circles && Array.isArray(src.circles)) {
    const cur = ymOf(new Date(now));
    const cr = [];
    for (const c of src.circles) {
      if (!c || c.active === false) continue;
      const day = Number(c.payDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      const row = circleSchedule(c).find((r) => r.ym === cur);
      if (!row || row.paid) continue;
      const item = { day };
      if (opts.includeNames && c.name) item.t = String(c.name).slice(0, 24);
      cr.push(item);
    }
    if (cr.length) out.cr = cr.slice(0, 20);
  }
  if (opts.tasks && Array.isArray(src.tasks)) {
    const tk = [];
    for (const t of src.tasks) {
      if (!t || t.kind !== 'task' || t.done === true || !(Number(t.due) > 0)) continue;
      tk.push(localYmd(Number(t.due)));
    }
    tk.sort();
    if (tk.length) out.tk = tk.slice(0, 40);
  }
  return out;
}

/** الخيارات التي تحتاجها الخادمة (بلا المفتاح العام). */
export function serverPrefs(settings, tz) {
  const o = pushOptions(settings);
  return {
    enabled: o.enabled,
    time: o.time,
    daysBefore: o.daysBefore,
    overdue: o.overdue,
    ready: o.ready,
    stock: o.stock,
    commitments: o.commitments,
    commitmentsDays: o.commitmentsDays,
    documents: o.documents,
    circles: o.circles,
    tasks: o.tasks,
    quiet: o.quietEnabled ? { from: o.quietFrom, to: o.quietTo } : null,
    tz: tz || 'Africa/Cairo',
  };
}

/** هل الملخصان متطابقان (تجاهل الطابع الزمني `at`)؟ لتجنّب كتابات سحابية بلا داعٍ. */
export function sameDigest(a, b) {
  if (!a || !b) return false;
  const strip = (d) => JSON.stringify({ ...d, at: 0 });
  return strip(a) === strip(b);
}
