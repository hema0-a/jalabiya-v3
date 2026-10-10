/* ==========================================================================
   order-scheduler.js — جدولة المواعيد الذكية
   ==========================================================================
   - suggestDueDate(orders, config) — اقتراح تاريخ تسليم:
     يعتمد على:
       - أيام الإجازة الأسبوعية (dayOffWeekday).
       - الحد اليومي لطلبات الورشة (dailyOrderLimit).
       - مبلغ الطلب الجديد (orderAmount).
   - getDayAmount(orders, dayMs) — مجموع مبالغ الطلبات في يوم معيّن.
   ========================================================================== */

const DAY_MS = 86400000;

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
 * اقتراح تاريخ تسليم ذكي.
 *
 * المنطق:
 *   1. ابدأ من (اليوم + minDays).
 *   2. تجاهل أيام الإجازة الأسبوعية.
 *   3. تجاهل الأيام التي يتجاوز مجموعها + الطلب الجديد الحد اليومي.
 *   4. إن كان الطلب الجديد أكبر من الحد اليومي → ابحث عن أول يوم فارغ.
 *   5. أول يوم يتحقق فيه الشرط = الاقتراح.
 *
 * @param {Array} orders — كل الطلبات الحالية
 * @param {Object} [config]
 * @param {number} [config.dayOffWeekday=0] — 0-6 (0=الأحد)
 * @param {number} [config.dailyOrderLimit=0] — 0 = لا حد
 * @param {number} [config.minDays=1] — أقل عدد أيام من اليوم
 * @param {number} [config.maxLookaheadDays=60] — أقصى بحث
 * @param {string|null} [config.excludeOrderId=null] — استثناء طلب معيّن (عند التعديل)
 * @param {number} [config.orderAmount=0] — مبلغ الطلب الجديد
 * @returns {{timestamp:number, reason:string, dayOfWeek:number, overLimit:boolean}}
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

  /* هل الطلب الجديد أكبر من الحد اليومي؟ */
  const orderExceedsLimit = dailyLimit > 0 && orderAmount > dailyLimit;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + minDays);

  for (let i = 0; i < maxDays; i++) {
    const candidate = new Date(start.getTime() + i * DAY_MS);
    const wd = candidate.getDay();

    /* 1. تجاهل أيام الإجازة الأسبوعية */
    if (wd === dayOff) continue;

    const total = getDayAmount(relevant, candidate.getTime());

    /* 2. الطلب أكبر من الحد → اقبل فقط الأيام الفارغة تماماً */
    if (orderExceedsLimit) {
      if (total > 0) continue;
    }
    /* 3. الحالة العادية → يجب أن يتناسب الطلب مع المساحة المتبقية */
    else if (dailyLimit > 0 && (total + orderAmount) > dailyLimit) {
      continue;
    }

    /* ✅ وجدنا يوماً مناسباً */
    let reason;
    if (i === 0) reason = 'أول يوم متاح';
    else if (i === 1) reason = 'غداً';
    else reason = 'بعد ' + i + ' أيام';

    return {
      timestamp: candidate.getTime(),
      reason,
      dayOfWeek: wd,
      overLimit: orderExceedsLimit,
    };
  }

  /* fallback — لا يوجد يوم مناسب */
  return {
    timestamp: start.getTime(),
    reason: 'لا يوجد يوم متاح قريباً',
    dayOfWeek: start.getDay(),
    overLimit: orderExceedsLimit,
  };
}

export const __internal = { DAY_MS };
