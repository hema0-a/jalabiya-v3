/* ==========================================================================
   size-clusters.js — تجميع طلبات عملاء مختلفين بقياسات متقاربة (v3.3.32)
   ==========================================================================
   لفتح «دفعة قص» واحدة: طلبات من نفس النوع (اختيارياً) لعملاء قياساتهم متقاربة بحدّ tolerance سم.
   - لا يُقارن إلا الحقول الموجودة عند الطرفين، ويلزم حقلان مشتركان على الأقل (لا تجميع على بيانات ناقصة).
   - كل زوج داخل المجموعة يجب أن يتقارب (لا سلسلة تتباعد تدريجياً).
   ========================================================================== */

const MIN_SHARED_FIELDS = 2;
export const MAX_MIN_SHARED = 5;

/** الحد الأدنى الفعلي للحقول المشتركة: minShared (1..5، الافتراضي 2) ولا يزيد على عدد الحقول المختارة إن اختير بعضها. */
function effectiveMin(opts) {
  const o = opts || {};
  let m = Math.floor(Number(o.minShared));
  if (!(m >= 1)) m = MIN_SHARED_FIELDS;
  m = Math.min(m, MAX_MIN_SHARED);
  const n = Array.isArray(o.fields) ? o.fields.length : 0;
  return n > 0 ? Math.min(m, n) : m;
}

const val = (v) => { const n = Number(v); return v !== '' && v != null && isFinite(n) && n > 0 ? n : null; };

/**
 * هل قياسا عميلين متقاربان؟
 * @param {Object} [opts] — {minShared:number (1..5), fields:string[] (فارغة = كل المقاسات)}
 */
export function sizesSimilar(a, b, tolerance, opts) {
  if (!a || !b) return false;
  const only = opts && Array.isArray(opts.fields) && opts.fields.length > 0 ? new Set(opts.fields) : null;
  const need = effectiveMin(opts);
  let shared = 0;
  for (const k of Object.keys(a)) {
    if (only && !only.has(k)) continue;
    const x = val(a[k]); const y = val(b[k]);
    if (x === null || y === null) continue;
    shared++;
    if (Math.abs(x - y) > tolerance) return false;
  }
  return shared >= need;
}

/**
 * @param {Array} orders — طلبات نشطة
 * @param {Object} customerMap — id → عميل (به measurements)
 * @param {number} tolerance — بالسنتيمتر
 * @param {Function} typeOf — order → نص النوع
 * @param {boolean} sameTypeOnly
 * @param {Object} [opts] — {minShared, fields} (انظر sizesSimilar)
 * @returns {Array<{type:string, orders:Array, customers:Array<string>, totalAmount:number}>}
 *   مجموعات تضم عميلين مختلفين فأكثر فقط.
 */
export function clusterBySize(orders, customerMap, tolerance, typeOf, sameTypeOnly = true, opts) {
  const tol = Number(tolerance);
  if (!(tol >= 0) || !Array.isArray(orders)) return [];
  const cands = orders.filter((o) => o && o.customerId && customerMap && customerMap[o.customerId]
    && customerMap[o.customerId].measurements);
  const buckets = new Map();
  cands.forEach((o) => {
    const t = sameTypeOnly ? String(typeOf(o) || '').toLowerCase() : '*';
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t).push(o);
  });
  const out = [];
  for (const [t, list] of buckets) {
    const clusters = [];
    for (const o of list) {
      const m = customerMap[o.customerId].measurements;
      const home = clusters.find((c) => c.members.every((x) =>
        x.customerId === o.customerId || sizesSimilar(customerMap[x.customerId].measurements, m, tol, opts)));
      if (home) home.members.push(o); else clusters.push({ members: [o] });
    }
    clusters.forEach((c) => {
      const custs = [...new Set(c.members.map((x) => x.customerId))];
      if (custs.length < 2) return;
      out.push({
        type: t === '*' ? 'متنوعة' : typeOf(c.members[0]),
        orders: c.members, customers: custs,
        totalAmount: Math.round(c.members.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100,
      });
    });
  }
  return out.sort((a, b) => b.orders.length - a.orders.length);
}
