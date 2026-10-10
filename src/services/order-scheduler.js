/* ==========================================================================
   order-scheduler.js — جدولة المواعيد الذكية (v2)
   ==========================================================================
   - suggestDueDate(orders, config) — اقتراح تاريخ تسليم يوزّع الطلب
     على عدة أيام عمل عند الحاجة.
   - getDayAmount(orders, dayMs) — مجموع مبالغ الطلبات في يوم معيّن.
   ========================================================================== */

const DAY_MS = 86400000;

/* ==========================================================================
   1. مجموع مبالغ اليوم
   ========================================================================== */

/**
 * حساب مجموع مبالغ الطلبات في يوم معيّن.
 * يستثني الطلبات المسلَّمة والملغاة.
 * @param {Array} orders
 * @param {number} dayMs — بداية اليوم (00:00)
 * @returns {number}
 */
export function getDayAmount(orders, dayMs) {
  const end = dayMs + DAY_MS;
  return (orders || [])
    .filter((o) => {
      if (!o.dueDate) return false;
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      let d = o.dueDate;
      if (typeof d === 'string') {
        const parsed = Date.parse(d);
        if (isNaN(parsed)) return false;
        d = parsed;
      }
      if (typeof d !== 'number' || isNaN(d)) return false;
      const dayStart = new Date(dayMs);
      dayStart.setHours(0, 0, 0, 0);
      const orderStart = new Date(d);
      orderStart.setHours(0, 0, 0, 0);
      return orderStart.getTime() === dayStart.getTime();
    })
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
}

/* ==========================================================================
   2. اقتراح تاريخ تسليم
   ========================================================================== */

/* تطبيع بداية اليوم (00:00) */
function dayStartMs(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * اقتراح تاريخ تسليم ذكي — يوزّع الطلب على عدة أيام عند تجاوز الحد اليومي.
 *
 * المنطق:
 *   1. ابدأ من (اليوم + minDays).
 *   2. تخطَّ أيام الإجازة الأسبوعية.
 *   3. لكل يوم عمل:
 *      - capacity = dailyLimit − total (المشغول).
 *      - portion = min(remaining, capacity).
 *      - remaining -= portion.
 *      - إذا remaining = 0 → توقف.
 *   4. النتيجة: { timestamp, reason, daysNeeded, daysUsed, overLimit }
 *
 * @param {Array} orders
 * @param {Object} [config]
 * @param {number} [config.dayOffWeekday=0]
 * @param {number} [config.dailyOrderLimit=0]
 * @param {number} [config.minDays=1]
 * @param {number} [config.maxLookaheadDays=60]
 * @param {string|null} [config.excludeOrderId=null]
 * @param {number} [config.orderAmount=0]
 * @returns {{
 *   timestamp: number,
 *   reason: string,
 *   dayOfWeek: number,
 *   overLimit: boolean,
 *   daysNeeded: number,
 *   daysUsed: number,
 * }}
 */
export function suggestDueDate(orders, config = {}) {
  const dayOff = Number(config.dayOffWeekday ?? 0);
  const dailyLimit = Number(config.dailyOrderLimit) || 0;
  const minDays = Number(config.minDays) || 1;
  const maxDays = Number(config.maxLookaheadDays) || 60;
  const excludeId = config.excludeOrderId || null;
  const orderAmount = Number(config.orderAmount) || 0;

  /* استثناء الطلب الحالي (عند التعديل) */
  const relevant = (orders || []).filter((o) =>
    o.id !== excludeId &&
    o.status !== 'delivered' &&
    o.status !== 'cancelled'
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime() + minDays * DAY_MS;

  /* الحالة البسيطة: لا حد يومي أو طلب صفر */
  if (dailyLimit <= 0 || orderAmount <= 0) {
    for (let i = 0; i < maxDays; i++) {
      const candidate = new Date(startMs + i * DAY_MS);
      if (candidate.getDay() === dayOff) continue;
      return buildResult(candidate, 1, 1, false);
    }
    return {
      timestamp: startMs,
      reason: 'لا يوجد يوم متاح قريباً',
      dayOfWeek: new Date(startMs).getDay(),
      overLimit: false,
      daysNeeded: 1,
      daysUsed: 0,
    };
  }

  const overLimit = orderAmount > dailyLimit;
  let remaining = orderAmount;
  let lastDay = null;
  let daysUsed = 0;

  for (let i = 0; i < maxDays && remaining > 0; i++) {
    const candidate = new Date(startMs + i * DAY_MS);

    /* تخطّي الإجازة */
    if (candidate.getDay() === dayOff) continue;

    /* المشغول والسعة */
    const total = getDayAmount(relevant, dayStartMs(candidate));
    const capacity = Math.max(0, dailyLimit - total);

    if (capacity <= 0) continue;

    /* خصّص الجزء من الطلب */
    const portion = Math.min(remaining, capacity);
    remaining -= portion;
    lastDay = candidate;
    daysUsed++;
  }

  /* لم يكتمل التوزيع */
  if (remaining > 0 || !lastDay) {
    return {
      timestamp: startMs,
      reason: 'لا يوجد يوم كافٍ في الأفق القريب',
      dayOfWeek: new Date(startMs).getDay(),
      overLimit,
      daysNeeded: Math.ceil(orderAmount / dailyLimit),
      daysUsed: 0,
    };
  }

  const daysNeeded = Math.ceil(orderAmount / dailyLimit);
  return buildResult(lastDay, daysNeeded, daysUsed, overLimit);
}

/* ==========================================================================
   3. بناء النتيجة النهائية
   ========================================================================== */

function buildResult(candidate, daysNeeded, daysUsed, overLimit) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((candidate.getTime() - today.getTime()) / DAY_MS);

  let reason;
  if (diffDays === 0) reason = 'اليوم';
  else if (diffDays === 1) reason = 'غداً';
  else if (diffDays === 2) reason = 'بعد غد';
  else reason = 'بعد ' + diffDays + ' أيام';

  if (daysNeeded > 1) {
    reason += ' (يوزَّع على ' + daysNeeded + ' أيام عمل)';
  }

  return {
    timestamp: candidate.getTime(),
    reason,
    dayOfWeek: candidate.getDay(),
    overLimit,
    daysNeeded,
    daysUsed,
  };
}

/* ==========================================================================
   4. تصدير داخلي
   ========================================================================== */

export const __internal = { DAY_MS };
