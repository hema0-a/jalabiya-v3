/* ==========================================================================
   order-scheduler.js — جدولة مواعيد التسليم
   ==========================================================================
   - suggestDueDate(orders, config) — يقترح تاريخ تسليم يتخطى:
     · يوم الإجازة الأسبوعي (dayOffWeekday).
     · الأيام التي بلغت الحد اليومي (dailyOrderLimit).
   - getDayAmount(orders, dayMs) — إجمالي المبالغ المتعهدة في يوم.
   ========================================================================== */

const DAY_MS = 86400000;

/**
 * حساب إجمالي المبالغ المتعهدة في يوم معيّن.
 * يستثني الطلبات المُسلَّمة والملغاة.
 * @param {Array} orders
 * @param {number} dayMs — بداية اليوم (00:00)
 * @returns {number}
 */
export function getDayAmount(orders, dayMs) {
  const end = dayMs + DAY_MS;
  return (orders || [])
    .filter((o) =>
      o.dueDate &&
      o.dueDate >= dayMs &&
      o.dueDate < end &&
      o.status !== 'delivered' &&
      o.status !== 'cancelled'
    )
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
}

/**
 * اقتراح تاريخ تسليم مناسب.
 *
 * الخوارزمية:
 *   1. ابدأ من (اليوم + minDays).
 *   2. تجاوز يوم الإجازة الأسبوعي.
 *   3. تجاوز الأيام التي بلغت الحد اليومي للمبالغ.
 *   4. أول يوم مقبول = الاقتراح.
 *
 * @param {Array} orders — كل الطلبات الحالية
 * @param {Object} [config]
 * @param {number} [config.dayOffWeekday=0] — 0-6 (0=الأحد)
 * @param {number} [config.dailyOrderLimit=0] — 0 = لا حد
 * @param {number} [config.minDays=3] — أقل عدد أيام من اليوم
 * @param {number} [config.maxLookaheadDays=30] — أقصى بحث مستقبلي
 * @param {string|null} [config.excludeOrderId=null] — استثناء طلب من الحساب (للتحرير)
 * @returns {{timestamp:number, reason:string, dayOfWeek:number}}
 */
export function suggestDueDate(orders, config = {}) {
  const dayOff = Number(config.dayOffWeekday ?? 0);
  const dailyLimit = Number(config.dailyOrderLimit) || 0;
  const minDays = Number(config.minDays) || 3;
  const maxDays = Number(config.maxLookaheadDays) || 30;
  const excludeId = config.excludeOrderId || null;

  /* استثناء الطلب الحالي (في حالة التعديل) والمُسلَّمة/الملغاة */
  const relevant = (orders || []).filter((o) =>
    o.id !== excludeId &&
    o.status !== 'delivered' &&
    o.status !== 'cancelled'
  );

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + minDays);

  for (let i = 0; i < maxDays; i++) {
    const candidate = new Date(start.getTime() + i * DAY_MS);
    const wd = candidate.getDay();

    /* 1. تخطى يوم الإجازة */
    if (wd === dayOff) continue;

    /* 2. تحقق من الحد اليومي */
    const total = getDayAmount(relevant, candidate.getTime());
    if (dailyLimit > 0 && total >= dailyLimit) continue;

    let reason;
    if (i === 0) reason = 'أقرب موعد متاح';
    else if (i === 1) reason = 'تخطّي يوم واحد';
    else reason = 'تخطّي ' + i + ' أيام (إجازة/حد يومي)';

    return {
      timestamp: candidate.getTime(),
      reason,
      dayOfWeek: wd,
    };
  }

  /* فشل — عُد للحد الأدنى */
  return {
    timestamp: start.getTime(),
    reason: 'الموعد الافتراضي',
    dayOfWeek: start.getDay(),
  };
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { DAY_MS };
