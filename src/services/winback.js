/* ==========================================================================
   winback.js — العملاء المنقطعون (v3.14.0) — دوال نقية
   ==========================================================================
   عميل سبق أن استلم طلباً ولم يعد منذ `days` يوماً ولا طلب مفتوحاً له، مرتّبين بالأكثر إنفاقاً أولاً
   (الأولى بالاسترجاع). الرسالة محايدة ومهذّبة ولا تفترض نوع العميل. لا DOM ولا قاعدة بيانات.
   ========================================================================== */

export const RANGES = [60, 90, 180];
export const DEFAULT_DAYS = 90;
const DAY = 86400000;
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;

export const normalizeDays = (d) => (RANGES.includes(Number(d)) ? Number(d) : DEFAULT_DAYS);

const deliveredTime = (o) => n(o && o.deliveredAt) || n(o && o.updatedAt) || n(o && o.createdAt);

/**
 * @returns {Array<{customerId:string,name:string,phone:string,orders:number,totalSpent:number,lastAt:number,daysSince:number}>}
 */
export function winbackList(customers, orders, now = Date.now(), days = DEFAULT_DAYS) {
  const minDays = normalizeDays(days);
  const info = new Map();
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || !o.customerId) continue;
    if (!info.has(o.customerId)) info.set(o.customerId, { orders: 0, spent: 0, last: 0, open: 0 });
    const g = info.get(o.customerId);
    if (o.status === 'delivered') { g.orders++; g.spent += n(o.amount); g.last = Math.max(g.last, deliveredTime(o)); }
    else if (o.status !== 'cancelled') g.open++;
  }
  const out = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    const g = c && info.get(c.id);
    if (!g || g.orders < 1 || g.open > 0 || !(g.last > 0)) continue;
    const daysSince = Math.floor((n(now) - g.last) / DAY);
    if (daysSince < minDays) continue;
    out.push({ customerId: c.id, name: String(c.name || 'عميل'), phone: String(c.phone || ''), orders: g.orders, totalSpent: r2(g.spent), lastAt: g.last, daysSince });
  }
  return out.sort((a, b) => b.totalSpent - a.totalSpent || b.daysSince - a.daysSince || a.name.localeCompare(b.name, 'ar'));
}

export function winbackSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const total = list.reduce((s, i) => s + n(i.totalSpent), 0);
  return { count: list.length, withPhone: list.filter((i) => i.phone).length, avgSpent: list.length ? Math.round(total / list.length) : 0 };
}

/** نص رسالة «نفتقدك» — بلا عروض مضللة ولا افتراض جنس العميل. */
export function buildWinbackText(item, workshopName = '') {
  const name = String((item && item.name) || '').trim();
  const shop = String(workshopName || '').trim();
  return 'أهلاً ' + (name || 'بك') + ' 🌿\n'
    + 'مرّ وقت منذ آخر زيارة لك' + (shop ? ' في ' + shop : ' عندنا') + '، ونتمنى أن تكون جلابيتك قد نالت إعجابك.\n'
    + 'يسعدنا خدمتك في أي طلب جديد أو تعديل.\n'
    + 'بانتظارك 🧵';
}
