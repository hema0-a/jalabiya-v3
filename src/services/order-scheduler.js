/* ==========================================================================
   order-scheduler.js — جدولة المواعيد على أساس الحد اليومي (v3.3.18)
   ==========================================================================
   تعريف واحد لـ«حِمل اليوم»: مجموع مبالغ الطلبات غير الملغاة التي موعد تسليمها
   ذلك اليوم التقويمي (الطلب يُحسب بكامل مبلغه على يوم تسليمه).
   - buildDayLedger  : سجلّ الحِمل لكل يوم في مرور واحد على الطلبات.
   - getDayAmount    : مجموع يوم معيّن (يستثني المسلَّم والملغى).
   - getDayLoad      : حِمل يوم + الحد + المتبقي + النسبة + الحالة (لشريط الحد اليومي).
   - suggestDueDate  : أول يوم عمل يتسع للطلب كاملاً دون تجاوز الحد.
   كل المقارنات المالية بالمليم (أعداد صحيحة) فلا تُخطئ 0.1+0.2.
   كل حساب أيام عبر day-math.js (تقويم محلي، متحمّل للتوقيت الصيفي).
   ========================================================================== */

import { toTimestamp, dayKey, dayDiff, addDaysNoon, weekdayOf } from '../core/day-math.js';

const DAY_MS = 86400000;

/* ==========================================================================
   0. المبالغ بالمليم
   ========================================================================== */

/** جنيه → مليم صحيح (غير سالب؛ غير المنتهي/غير الرقمي = 0). */
function toPiasters(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/* ==========================================================================
   1. سجلّ الحِمل اليومي
   ========================================================================== */

/**
 * @param {Array} orders
 * @param {Object} [opts]
 * @param {string|null} [opts.excludeId=null]   — طلب يُستثنى (عند تعديله)
 * @param {boolean} [opts.includeDelivered=false] — المسلَّم يشغل يومه (لعرض حِمل اليوم الحالي)
 * @returns {Map<string,{piasters:number,count:number}>} مفتاح اليوم YYYY-MM-DD
 */
export function buildDayLedger(orders, opts = {}) {
  const excludeId = opts.excludeId || null;
  const includeDelivered = opts.includeDelivered === true;
  const ledger = new Map();
  for (const o of orders || []) {
    if (!o) continue;
    if (excludeId && o.id === excludeId) continue;
    if (o.status === 'cancelled') continue;
    if (o.status === 'delivered' && !includeDelivered) continue;
    const key = dayKey(o.dueDate);
    if (!key) continue;
    const entry = ledger.get(key) || { piasters: 0, count: 0 };
    entry.piasters += toPiasters(o.amount);
    entry.count += 1;
    ledger.set(key, entry);
  }
  return ledger;
}

/**
 * مجموع مبالغ الطلبات (غير المسلَّمة وغير الملغاة) في يوم معيّن.
 * @param {Array} orders
 * @param {number|Date|string} day — أي لحظة داخل اليوم المطلوب
 * @returns {number} جنيه
 */
export function getDayAmount(orders, day) {
  const entry = buildDayLedger(orders).get(dayKey(day));
  return entry ? entry.piasters / 100 : 0;
}

/**
 * حِمل يوم مقابل الحد اليومي.
 * @param {Array} orders
 * @param {number|Date|string} day
 * @param {Object} [opts]
 * @param {number} [opts.limit=0]
 * @param {boolean} [opts.includeDelivered=true]
 * @param {string|null} [opts.excludeId=null]
 * @returns {{amount:number,count:number,limit:number,remaining:number,percent:number,
 *            exceeded:boolean,near:boolean,status:'none'|'ok'|'near'|'exceeded'}}
 */
export function getDayLoad(orders, day, opts = {}) {
  const limitP = toPiasters(opts.limit);
  const ledger = buildDayLedger(orders, {
    excludeId: opts.excludeId,
    includeDelivered: opts.includeDelivered !== false,
  });
  const entry = ledger.get(dayKey(day)) || { piasters: 0, count: 0 };
  const exceeded = limitP > 0 && entry.piasters > limitP;
  const rawPercent = limitP > 0 ? (entry.piasters / limitP) * 100 : 0;
  const near = limitP > 0 && !exceeded && rawPercent >= 80;
  return {
    amount: entry.piasters / 100,
    count: entry.count,
    limit: limitP / 100,
    remaining: limitP > 0 ? Math.max(0, limitP - entry.piasters) / 100 : 0,
    percent: Math.min(100, Math.round(rawPercent)),
    exceeded,
    near,
    status: limitP <= 0 ? 'none' : exceeded ? 'exceeded' : near ? 'near' : 'ok',
  };
}

/* ==========================================================================
   2. اقتراح تاريخ تسليم
   ========================================================================== */

/**
 * أول يوم عمل يتسع للطلب كاملاً دون تجاوز الحد اليومي.
 *   - تُتخطّى أيام الإجازة الأسبوعية.
 *   - طلب ≤ الحد: أول يوم سعته المتبقية ≥ المبلغ (المقارنة بالمليم).
 *   - طلب > الحد (لن يتسع في أي يوم): أول يوم عمل فارغ تماماً مع overLimit.
 *   - لا حد يومي أو مبلغ صفر: أول يوم عمل بعد minDays.
 * الطابع الزمني المُرجَع ظهر اليوم المقترح (نفس صيغة حفظ النموذج للمواعيد).
 *
 * @param {Array} orders
 * @param {Object} [config]
 * @param {number} [config.dayOffWeekday=0]
 * @param {number} [config.dailyOrderLimit=0]
 * @param {number} [config.minDays=1]   — 0 يسمح باليوم نفسه
 * @param {number} [config.maxLookaheadDays=60]
 * @param {string|null} [config.excludeOrderId=null]
 * @param {number} [config.orderAmount=0]
 * @returns {{timestamp:number, reason:string, dayOfWeek:number, overLimit:boolean,
 *            daysNeeded:number, daysUsed:number, dayLoad:number, remainingAfter:number}}
 */
export function suggestDueDate(orders, config = {}) {
  const dayOff = Number(config.dayOffWeekday ?? 0);
  const limitP = toPiasters(config.dailyOrderLimit);
  const amountP = toPiasters(config.orderAmount);
  const minRaw = Number(config.minDays);
  const minDays = (config.minDays === undefined || config.minDays === null ||
    !Number.isFinite(minRaw) || minRaw < 0) ? 1 : Math.floor(minRaw);
  const maxDays = Number(config.maxLookaheadDays) > 0 ? Math.floor(Number(config.maxLookaheadDays)) : 60;

  const now = Date.now();
  const dayAt = (i) => addDaysNoon(now, minDays + i);

  /* الحالة البسيطة: لا حد يومي أو طلب صفر → أول يوم عمل */
  if (limitP <= 0 || amountP <= 0) {
    for (let i = 0; i < maxDays; i++) {
      const ts = dayAt(i);
      if (weekdayOf(ts) === dayOff) continue;
      return buildResult(ts, 1, 1, false, 0, 0);
    }
    return fallback(dayAt(0), 'لا يوجد يوم متاح قريباً', false, 1);
  }

  const overLimit = amountP > limitP;
  const daysNeeded = Math.ceil(amountP / limitP);
  const ledger = buildDayLedger(orders, { excludeId: config.excludeOrderId });

  for (let i = 0; i < maxDays; i++) {
    const ts = dayAt(i);
    if (weekdayOf(ts) === dayOff) continue;
    const loadP = (ledger.get(dayKey(ts)) || { piasters: 0 }).piasters;
    const fits = overLimit ? loadP <= 0 : (limitP - loadP) >= amountP;
    if (!fits) continue;
    return buildResult(ts, daysNeeded, 1, overLimit, loadP, Math.max(0, limitP - loadP - amountP));
  }

  return fallback(dayAt(0), 'لا يوجد يوم كافٍ في الأفق القريب', overLimit, daysNeeded);
}

/* ==========================================================================
   3. بناء النتيجة
   ========================================================================== */

function fallback(ts, reason, overLimit, daysNeeded) {
  return {
    timestamp: ts, reason, dayOfWeek: weekdayOf(ts), overLimit,
    daysNeeded, daysUsed: 0, dayLoad: 0, remainingAfter: 0,
  };
}

function buildResult(ts, daysNeeded, daysUsed, overLimit, loadP, remainingAfterP) {
  const diff = dayDiff(Date.now(), ts);
  let reason;
  if (diff === 0) reason = 'اليوم';
  else if (diff === 1) reason = 'غداً';
  else if (diff === 2) reason = 'بعد غد';
  else reason = 'بعد ' + diff + ' أيام';
  if (daysNeeded > 1) reason += ' (يوزَّع على ' + daysNeeded + ' أيام عمل)';
  return {
    timestamp: ts, reason, dayOfWeek: weekdayOf(ts), overLimit, daysNeeded, daysUsed,
    dayLoad: loadP / 100, remainingAfter: remainingAfterP / 100,
  };
}

export const __internal = { DAY_MS, toPiasters, toTimestamp };
