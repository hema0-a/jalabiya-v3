/* ==========================================================================
   order-scheduler.js — جدولة المواعيد على أساس الحد اليومي (v3.3.18)
   ==========================================================================
   تعريف واحد لـ«حِمل اليوم» (للمجدول وشريط الحد اليومي معاً):
   - طلب ≤ الحد اليومي: يُحسب بكامل مبلغه على يوم تسليمه.
   - طلب > الحد اليومي: يُوزَّع على n = ⌈المبلغ ÷ الحد⌉ يوم عمل تنتهي بيوم التسليم
     (الباقي على يوم التسليم، وكل يوم عمل سابق بالحد كاملاً، وتُتخطّى الإجازة الأسبوعية).
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

const MAX_SPREAD_DAYS = 366;

/**
 * توزيع طلب على أيام العمل (بالمليم). يُعيد [{ts, piasters}] من يوم التسليم رجوعاً.
 * - بلا حد يومي أو مبلغ ≤ الحد: يوم واحد هو يوم التسليم (كما هو، حتى لو إجازة).
 * - غير ذلك: n أيام عمل؛ يوم التسليم (أو آخر يوم عمل قبله إن كان إجازة) يأخذ الباقي r،
 *   وكل يوم عمل قبله يأخذ الحد كاملاً.
 */
function allocateOrder(amountP, dueTs, limitP, dayOff) {
  if (limitP <= 0 || amountP <= limitP) return [{ ts: dueTs, piasters: amountP }];
  const n = Math.min(MAX_SPREAD_DAYS, Math.ceil(amountP / limitP));
  const r = amountP - (n - 1) * limitP;
  const out = [];
  let back = 0;
  const workDayBack = () => {
    while (weekdayOf(addDaysNoon(dueTs, -back)) === dayOff) back++;
    return addDaysNoon(dueTs, -back);
  };
  out.push({ ts: workDayBack(), piasters: r });
  for (let i = 1; i < n; i++) {
    back++;
    out.push({ ts: workDayBack(), piasters: limitP });
  }
  return out;
}

/**
 * @param {Array} orders
 * @param {Object} [opts]
 * @param {string|null} [opts.excludeId=null]   — طلب يُستثنى (عند تعديله)
 * @param {boolean} [opts.includeDelivered=false] — المسلَّم يشغل يومه (لعرض حِمل اليوم الحالي)
 * @param {number} [opts.dailyLimit=0]  — بالجنيه؛ يفعّل توزيع الطلب الأكبر من الحد على أيام
 * @param {number} [opts.dayOffWeekday=0] — الإجازة الأسبوعية (تُتخطّى عند التوزيع)
 * @returns {Map<string,{piasters:number,count:number}>} مفتاح اليوم YYYY-MM-DD
 */
export function buildDayLedger(orders, opts = {}) {
  const excludeId = opts.excludeId || null;
  const includeDelivered = opts.includeDelivered === true;
  const limitP = toPiasters(opts.dailyLimit);
  const dayOff = Number(opts.dayOffWeekday ?? 0);
  const ledger = new Map();
  for (const o of orders || []) {
    if (!o) continue;
    if (excludeId && o.id === excludeId) continue;
    if (o.status === 'cancelled') continue;
    if (o.status === 'delivered' && !includeDelivered) continue;
    const dueTs = toTimestamp(o.dueDate);
    if (Number.isNaN(dueTs)) continue;
    for (const part of allocateOrder(toPiasters(o.amount), dueTs, limitP, dayOff)) {
      const key = dayKey(part.ts);
      const entry = ledger.get(key) || { piasters: 0, count: 0 };
      entry.piasters += part.piasters;
      entry.count += 1;
      ledger.set(key, entry);
    }
  }
  return ledger;
}

/**
 * مجموع مبالغ الطلبات (غير المسلَّمة وغير الملغاة) في يوم معيّن.
 * @param {Array} orders
 * @param {number|Date|string} day — أي لحظة داخل اليوم المطلوب
 * @param {Object} [opts] — نفس خيارات buildDayLedger (dailyLimit/dayOffWeekday لتوزيع الطلبات الكبيرة)
 * @returns {number} جنيه
 */
export function getDayAmount(orders, day, opts = {}) {
  const entry = buildDayLedger(orders, opts).get(dayKey(day));
  return entry ? entry.piasters / 100 : 0;
}

/**
 * حِمل يوم مقابل الحد اليومي.
 * @param {Array} orders
 * @param {number|Date|string} day
 * @param {Object} [opts]
 * @param {number} [opts.limit=0]
 * @param {number} [opts.dayOffWeekday=0]
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
    dailyLimit: opts.limit,
    dayOffWeekday: opts.dayOffWeekday,
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
 * اقتراح موعد التسليم على أساس الحد اليومي.
 *   - تُتخطّى أيام الإجازة الأسبوعية.
 *   - طلب ≤ الحد: أول يوم سعته المتبقية ≥ المبلغ (المقارنة بالمليم).
 *   - طلب > الحد: يُوزَّع على n = ⌈المبلغ ÷ الحد⌉ يوم عمل متتالية؛ الأيام السابقة ليوم
 *     التسليم يلزم أن تكون فارغة (حِملها الحد كاملاً)، ويوم التسليم تكفي سعته للباقي.
 *     الموعد = أول يوم تسليم يتحقق فيه ذلك بحيث لا يبدأ العمل قبل (اليوم + minDays).
 *   - لا حد يومي أو مبلغ صفر: أول يوم عمل بعد minDays.
 * الطوابع الزمنية المُرجَعة ظهر اليوم (نفس صيغة حفظ النموذج للمواعيد).
 *
 * @param {Array} orders
 * @param {Object} [config]
 * @param {number} [config.dayOffWeekday=0]
 * @param {number} [config.dailyOrderLimit=0]
 * @param {number} [config.minDays=1]   — 0 يسمح باليوم نفسه
 * @param {number} [config.maxLookaheadDays=60]
 * @param {string|null} [config.excludeOrderId=null]
 * @param {number} [config.orderAmount=0]
 * @returns {{timestamp:number, startTimestamp:number, reason:string, dayOfWeek:number,
 *            overLimit:boolean, daysNeeded:number, daysUsed:number,
 *            dayLoad:number, remainingAfter:number}}
 *   overLimit = الطلب أكبر من الحد اليومي (يُوزَّع على daysNeeded أيام عمل).
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
  const startTs = dayAt(0);

  /* الحالة البسيطة: لا حد يومي أو طلب صفر → أول يوم عمل */
  if (limitP <= 0 || amountP <= 0) {
    for (let i = 0; i < maxDays; i++) {
      const ts = dayAt(i);
      if (weekdayOf(ts) === dayOff) continue;
      return buildResult(ts, ts, 1, false, 0, 0);
    }
    return fallback(startTs, 'لا يوجد يوم متاح قريباً', false, 1);
  }

  const overLimit = amountP > limitP;
  const n = overLimit ? Math.min(MAX_SPREAD_DAYS, Math.ceil(amountP / limitP)) : 1;
  const ledger = buildDayLedger(orders, {
    excludeId: config.excludeOrderId, dailyLimit: config.dailyOrderLimit, dayOffWeekday: dayOff,
  });
  const loadOf = (ts) => (ledger.get(dayKey(ts)) || { piasters: 0 }).piasters;
  const bound = maxDays + (n > 1 ? n * 2 : 0);

  for (let i = 0; i < bound; i++) {
    const dueTs = dayAt(i);
    if (weekdayOf(dueTs) === dayOff) continue;

    if (!overLimit) {
      const loadP = loadOf(dueTs);
      if ((limitP - loadP) < amountP) continue;
      return buildResult(dueTs, dueTs, 1, false, loadP, limitP - loadP - amountP);
    }

    /* طلب أكبر من الحد: يوم التسليم يأخذ الباقي والأيام السابقة بالحد كاملاً */
    const parts = allocateOrder(amountP, dueTs, limitP, dayOff);
    const startOfWork = parts[parts.length - 1].ts;
    if (dayDiff(startTs, startOfWork) < 0) continue;            /* يبدأ قبل أول يوم مسموح */
    const ok = parts.every((p) => (limitP - loadOf(p.ts)) >= p.piasters);
    if (!ok) continue;
    const loadP = loadOf(dueTs);
    return buildResult(dueTs, startOfWork, n, true, loadP, limitP - loadP - parts[0].piasters);
  }

  return fallback(startTs, 'لا يوجد يوم كافٍ في الأفق القريب', overLimit, n);
}

/* ==========================================================================
   3. بناء النتيجة
   ========================================================================== */

function fallback(ts, reason, overLimit, daysNeeded) {
  return {
    timestamp: ts, startTimestamp: ts, reason, dayOfWeek: weekdayOf(ts), overLimit,
    daysNeeded, daysUsed: 0, dayLoad: 0, remainingAfter: 0,
  };
}

function buildResult(ts, startTs, daysNeeded, overLimit, loadP, remainingAfterP) {
  const diff = dayDiff(Date.now(), ts);
  let reason;
  if (diff === 0) reason = 'اليوم';
  else if (diff === 1) reason = 'غداً';
  else if (diff === 2) reason = 'بعد غد';
  else reason = 'بعد ' + diff + ' أيام';
  if (daysNeeded > 1) reason += ' (يوزَّع على ' + daysNeeded + ' أيام عمل)';
  return {
    timestamp: ts, startTimestamp: startTs, reason, dayOfWeek: weekdayOf(ts), overLimit,
    daysNeeded, daysUsed: daysNeeded,
    dayLoad: loadP / 100, remainingAfter: Math.max(0, remainingAfterP) / 100,
  };
}

export const __internal = { DAY_MS, toPiasters, toTimestamp };
