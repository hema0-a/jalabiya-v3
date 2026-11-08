/* ==========================================================================
   aftercare.js — التعديلات والمرتجعات بعد التسليم (v3.14.0) — دوال نقية
   ==========================================================================
   حالة = عميل رجع بعد تسليم طلبه: تعديل 🪡 أو مرتجع ↩️ أو إعادة تفصيل 🔁، مع السبب والتكلفة على الورشة
   وما رُدَّ للعميل. الهدف أن تعرف أين تخسر ولماذا يتكرر الرجوع (مقاس؟ خياطة؟ قماش؟).
   منفصلة عن المركز المالي عمداً: تكلفة التعديل ومبلغ المرتجع يُعرضان هنا فقط ولا يُخصمان من التقارير تلقائياً
   (كي لا تتضاعف أو تتغيّر أرقامك القائمة). لا DOM ولا قاعدة بيانات.
   ========================================================================== */

export const KINDS = [
  { id: 'alteration', icon: '🪡', label: 'تعديل' },
  { id: 'return', icon: '↩️', label: 'مرتجع' },
  { id: 'remake', icon: '🔁', label: 'إعادة تفصيل' },
];
export const REASONS = [
  { id: 'measure', label: 'مقاس غير مضبوط' },
  { id: 'sewing', label: 'عيب خياطة' },
  { id: 'fabric', label: 'عيب قماش' },
  { id: 'late', label: 'تأخير' },
  { id: 'change', label: 'تغيّر رأي العميل' },
  { id: 'other', label: 'أخرى' },
];
export const STATUSES = ['open', 'done'];
export const MAX_NOTES = 400;
const DAY = 86400000;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;
const KIND_IDS = KINDS.map((k) => k.id);
const REASON_IDS = REASONS.map((r) => r.id);

export const normalizeKind = (v) => (KIND_IDS.includes(v) ? v : 'alteration');
export const normalizeReason = (v) => (REASON_IDS.includes(v) ? v : 'other');
export const normalizeStatus = (v) => (v === 'done' ? 'done' : 'open');
export const kindMeta = (v) => KINDS.find((k) => k.id === normalizeKind(v));
export const reasonLabel = (v) => REASONS.find((r) => r.id === normalizeReason(v)).label;

/** تحقّق من بيانات الحالة. @returns {{ok:boolean, error?:string, data?:Object}} */
export function checkCaseInput(input) {
  const orderId = typeof (input && input.orderId) === 'string' ? input.orderId : '';
  if (!orderId) return { ok: false, error: 'اختر الطلب' };
  const cost = r2(input.cost), refund = r2(input.refund);
  if (cost < 0 || refund < 0) return { ok: false, error: 'المبالغ لا تكون سالبة' };
  if (cost > 100000000 || refund > 100000000) return { ok: false, error: 'المبلغ كبير جداً' };
  const notes = typeof input.notes === 'string' ? input.notes.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTES) : '';
  return { ok: true, data: { orderId, kind: normalizeKind(input.kind), reason: normalizeReason(input.reason), cost, refund, notes } };
}

const deliveredTime = (o) => n(o && o.deliveredAt) || n(o && o.updatedAt) || n(o && o.createdAt);

/** عدد الطلبات المُسلَّمة في آخر `days` يوماً (مقام معدل الرجوع). */
export function deliveredCount(orders, now = new Date(), days = 90) {
  const since = now.getTime() - days * DAY;
  return (Array.isArray(orders) ? orders : []).filter((o) => o && o.status === 'delivered' && deliveredTime(o) >= since).length;
}

const sameMonth = (ts, now) => { const d = new Date(n(ts)); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };

/**
 * إحصاءات الرجوع.
 * @returns {{open:number, monthCount:number, monthCost:number, monthRefund:number, rate90:number|null, topReasons:Array, avgCloseDays:number|null}}
 */
export function aftercareStats(cases, deliveredLast90 = 0, now = new Date()) {
  const list = (Array.isArray(cases) ? cases : []).filter((c) => c && typeof c === 'object');
  const since = now.getTime() - 90 * DAY;
  const recent = list.filter((c) => n(c.createdAt) >= since);
  const month = list.filter((c) => c.createdAt && sameMonth(c.createdAt, now));
  const byReason = new Map();
  recent.forEach((c) => { const id = normalizeReason(c.reason); byReason.set(id, (byReason.get(id) || 0) + 1); });
  const topReasons = [...byReason].map(([id, count]) => ({ id, label: reasonLabel(id), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ar'));
  const closed = list.filter((c) => normalizeStatus(c.status) === 'done' && n(c.closedAt) > n(c.createdAt) && n(c.createdAt) > 0);
  return {
    open: list.filter((c) => normalizeStatus(c.status) === 'open').length,
    monthCount: month.length,
    monthCost: r2(month.reduce((s, c) => s + n(c.cost), 0)),
    monthRefund: r2(month.reduce((s, c) => s + n(c.refund), 0)),
    rate90: n(deliveredLast90) > 0 ? Math.round((recent.length / n(deliveredLast90)) * 100) : null,
    topReasons,
    avgCloseDays: closed.length ? Math.round((closed.reduce((s, c) => s + (n(c.closedAt) - n(c.createdAt)) / DAY, 0) / closed.length) * 10) / 10 : null,
  };
}

/** ترتيب العرض: المفتوحة أولاً (الأقدم أولاً لتُنجَز)، ثم المغلقة بالأحدث. */
export function sortCases(cases) {
  return (Array.isArray(cases) ? cases : []).filter(Boolean).slice().sort((a, b) => {
    const ao = normalizeStatus(a.status) === 'open', bo = normalizeStatus(b.status) === 'open';
    if (ao !== bo) return ao ? -1 : 1;
    return ao ? n(a.createdAt) - n(b.createdAt) : n(b.closedAt || b.createdAt) - n(a.closedAt || a.createdAt);
  });
}
