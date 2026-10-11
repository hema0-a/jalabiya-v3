/* ==========================================================================
   season-compare.js — مقارنة موسم بنفس الفترة من العام الماضي (v3.3.30)
   ========================================================================== */

const DAY = 86400000;
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const endOfDay = (ms) => { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); };
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

export function shiftYears(range, years) {
  const sh = (ms) => { const d = new Date(ms); d.setFullYear(d.getFullYear() + years); return d.getTime(); };
  return { from: sh(range.from), to: sh(range.to) };
}

/** آخر N يوماً تنتهي اليوم */
export function lastDaysRange(days, now = Date.now()) {
  return { from: startOfDay(now - (Math.max(1, days) - 1) * DAY), to: endOfDay(now) };
}

/**
 * نافذة موسم: windowDays قبل تاريخ المناسبة (هذا العام) حتى يوم المناسبة.
 * - بدأت النافذة ولم تنتهِ: تُقطع عند «اليوم» فتتساوى الفترتان في الطول عند المقارنة.
 * - لم تبدأ بعد (started=false): لا مقارنة ممكنة؛ تُستخدم النافذة الكاملة للعام الماضي للتخطيط.
 * @returns {{from:number, to:number, started:boolean}}
 */
export function occasionRange(occasion, now = Date.now(), windowDays = 30) {
  const y = new Date(now).getFullYear();
  const date = new Date(y, Number(occasion.month) - 1, Number(occasion.day), 12, 0, 0, 0).getTime();
  const from = startOfDay(date - (windowDays - 1) * DAY);
  const fullTo = endOfDay(date);
  const started = from <= now;
  return { from, to: started ? Math.min(fullTo, endOfDay(now)) : fullTo, started };
}

const orderTime = (o) => Number(o.receivedDate) || Number(o.createdAt) || 0;

export function windowMetrics(orders, range) {
  const inRange = (Array.isArray(orders) ? orders : []).filter((o) => {
    if (!o || o.status === 'cancelled') return false;
    const t = orderTime(o);
    return t >= range.from && t <= range.to;
  });
  const revenue = Math.round(inRange.reduce((s, o) => s + (Number(o.amount) || 0), 0) * 100) / 100;
  const perDay = new Map();
  inRange.forEach((o) => { const k = dayKey(orderTime(o)); perDay.set(k, (perDay.get(k) || 0) + 1); });
  let peak = null;
  for (const [k, n] of perDay) if (!peak || n > peak.count) peak = { day: k, count: n };
  return {
    orders: inRange.length, revenue,
    avg: inRange.length ? Math.round((revenue / inRange.length) * 100) / 100 : 0,
    delivered: inRange.filter((o) => o.status === 'delivered').length,
    peak,
  };
}

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

export function compareSeasons(orders, range, prevRange = shiftYears(range, -1)) {
  const cur = windowMetrics(orders, range);
  const prev = windowMetrics(orders, prevRange);
  return {
    cur, prev, range, prevRange,
    changes: { orders: pct(cur.orders, prev.orders), revenue: pct(cur.revenue, prev.revenue), avg: pct(cur.avg, prev.avg) },
    hasPrev: prev.orders > 0,
  };
}
