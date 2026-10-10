/* ==========================================================================
   order-scheduler.js — جدولة المواعيد على أساس الحد اليومي (v3.3.20)
   ==========================================================================
   تعريف واحد لـ«حِمل اليوم» (للمجدول وشريط الحد اليومي معاً):
   - الطلب الذي له خطة عمل صالحة (order.workPlan) يُحسب كما في خطته: كل يوم بمبلغه.
   - غير ذلك (طلب قديم أو خطة غير صالحة): طلب ≤ الحد على يوم تسليمه، وطلب > الحد
     يُوزَّع على ⌈المبلغ ÷ الحد⌉ يوم عمل تنتهي بيوم التسليم.
   - planOrder       : يبني خطة تستغل السعة الجزئية لكل يوم (للأمام: أبكر إنهاء،
                       أو للخلف: في آخر لحظة قبل موعد يحدده المستخدم).
   - suggestDueDate  : الموعد المقترح = يوم انتهاء أبكر خطة، ومعه الخطة.
   - buildDayLedger / getDayAmount / getDayLoad : حِمل الأيام.
   كل المقارنات المالية بالمليم (أعداد صحيحة)، وكل حساب أيام عبر day-math.js.
   ========================================================================== */

import { toTimestamp, dayKey, dayDiff, addDaysNoon, weekdayOf } from '../core/day-math.js';

const DAY_MS = 86400000;
const MAX_SPREAD_DAYS = 366;
/** أصغر حصة مقبولة في يوم لا يكفي لإنهاء الطلب: 10% من الحد (لتفادي تفتيت الطلب لقطع تافهة). */
const MIN_CHUNK_RATIO = 0.1;

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
   1. خطة العمل المحفوظة وتوزيع الطلبات القديمة
   ========================================================================== */

/**
 * أجزاء الخطة المحفوظة مع الطلب إن كانت صالحة، وإلا null.
 * الخطة صالحة إذا: كل بند {day:'YYYY-MM-DD', amount>0}، ومجموعها = مبلغ الطلب بالمليم،
 * ولا يوجد يوم بعد يوم التسليم. (تعديل المبلغ/التاريخ خارج النموذج يُبطلها فتُتجاهل.)
 */
function planParts(order, dueTs) {
  const plan = order && order.workPlan;
  if (!Array.isArray(plan) || plan.length === 0 || Number.isNaN(dueTs)) return null;
  const dueKey = dayKey(dueTs);
  const parts = [];
  let sum = 0;
  for (const p of plan) {
    if (!p || typeof p.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.day)) return null;
    const pi = toPiasters(p.amount);
    if (pi <= 0 || p.day > dueKey) return null;
    sum += pi;
    parts.push({ key: p.day, piasters: pi });
  }
  return sum === toPiasters(order.amount) ? parts : null;
}

/** هل للطلب خطة عمل محفوظة صالحة؟ */
export function isValidWorkPlan(order) {
  return !!(order && planParts(order, toTimestamp(order.dueDate)));
}

/**
 * توزيع افتراضي لطلب بلا خطة (بالمليم): [{key, piasters}].
 * - بلا حد أو مبلغ ≤ الحد: يوم التسليم كله (حتى لو إجازة).
 * - غير ذلك: n أيام عمل؛ يوم التسليم (أو آخر يوم عمل قبله) يأخذ الباقي r والأيام السابقة بالحد كاملاً.
 */
function legacyAllocate(amountP, dueTs, limitP, dayOff) {
  if (limitP <= 0 || amountP <= limitP) return [{ key: dayKey(dueTs), piasters: amountP }];
  const n = Math.min(MAX_SPREAD_DAYS, Math.ceil(amountP / limitP));
  const r = amountP - (n - 1) * limitP;
  const out = [];
  let back = 0;
  const workDayBack = () => {
    while (weekdayOf(addDaysNoon(dueTs, -back)) === dayOff) back++;
    return dayKey(addDaysNoon(dueTs, -back));
  };
  out.push({ key: workDayBack(), piasters: r });
  for (let i = 1; i < n; i++) {
    back++;
    out.push({ key: workDayBack(), piasters: limitP });
  }
  return out;
}

/* ==========================================================================
   2. سجلّ الحِمل اليومي
   ========================================================================== */

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
    const parts = planParts(o, dueTs) || legacyAllocate(toPiasters(o.amount), dueTs, limitP, dayOff);
    for (const part of parts) {
      const entry = ledger.get(part.key) || { piasters: 0, count: 0 };
      entry.piasters += part.piasters;
      entry.count += 1;
      ledger.set(part.key, entry);
    }
  }
  return ledger;
}

/**
 * مجموع مبالغ الطلبات (غير المسلَّمة وغير الملغاة) في يوم معيّن.
 * @param {Array} orders
 * @param {number|Date|string} day — أي لحظة داخل اليوم المطلوب
 * @param {Object} [opts] — نفس خيارات buildDayLedger
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
   3. بناء خطة عمل تستغل السعة الجزئية
   ========================================================================== */

function minDaysOf(config) {
  const raw = Number(config.minDays);
  return (config.minDays === undefined || config.minDays === null || !Number.isFinite(raw) || raw < 0)
    ? 1 : Math.floor(raw);
}

/**
 * خطة عمل لطلب: توزيع مبلغه على أيام العمل حسب السعة المتبقية في كل يوم.
 *
 * - بدون endDate (اقتراح): للأمام من (اليوم + minDays)، كل يوم يأخذ ما فيه من سعة متبقية
 *   → أبكر يوم إنهاء ممكن. طلب ≤ الحد يُفضَّل له يوم واحد إذا كان إنهاؤه بنفس اليوم.
 * - مع endDate (موعد حدده المستخدم): للخلف من ذلك اليوم («في آخر لحظة») فلا تُستهلك
 *   أيام مبكرة بلا داعٍ؛ لا يبدأ العمل قبل (اليوم + minDays).
 * - يوم لا يكفي لإنهاء الطلب لا يُستخدم إن كانت سعته المتبقية أقل من 10% من الحد.
 * - الإجازة الأسبوعية تُتخطّى. المقارنات بالمليم.
 *
 * @param {Array} orders
 * @param {Object} config
 * @param {number} config.orderAmount
 * @param {number} config.dailyOrderLimit
 * @param {number} [config.dayOffWeekday=0]
 * @param {number} [config.minDays=1]
 * @param {number} [config.maxLookaheadDays=60]
 * @param {string|null} [config.excludeOrderId=null]
 * @param {number|string|Date} [config.endDate]
 * @returns {{plan:Array<{day:string,amount:number}>, startTimestamp:number, endTimestamp:number,
 *            daysUsed:number, endDayLoad:number, endRemaining:number}|null}
 *   null إن لم تتسع السعة في النطاق المسموح.
 */
export function planOrder(orders, config = {}) {
  const dayOff = Number(config.dayOffWeekday ?? 0);
  const limitP = toPiasters(config.dailyOrderLimit);
  const amountP = toPiasters(config.orderAmount);
  if (limitP <= 0 || amountP <= 0) return null;

  const minDays = minDaysOf(config);
  const maxDays = Number(config.maxLookaheadDays) > 0 ? Math.floor(Number(config.maxLookaheadDays)) : 60;
  const now = Date.now();
  const startTs = addDaysNoon(now, minDays);
  const minChunk = Math.max(1, Math.ceil(limitP * MIN_CHUNK_RATIO));
  const n = Math.min(MAX_SPREAD_DAYS, Math.ceil(amountP / limitP));
  const ledger = buildDayLedger(orders, {
    excludeId: config.excludeOrderId, dailyLimit: config.dailyOrderLimit, dayOffWeekday: dayOff,
  });
  const loadOf = (ts) => (ledger.get(dayKey(ts)) || { piasters: 0 }).piasters;
  const freeOf = (ts) => Math.max(0, limitP - loadOf(ts));

  /** parts: [{ts, piasters}] بترتيب زمني → نتيجة */
  const finish = (parts) => {
    parts.sort((a, b) => a.ts - b.ts);
    const last = parts[parts.length - 1];
    const endLoad = loadOf(last.ts);
    return {
      plan: parts.map((p) => ({ day: dayKey(p.ts), amount: p.piasters / 100 })),
      startTimestamp: parts[0].ts,
      endTimestamp: last.ts,
      daysUsed: parts.length,
      endDayLoad: endLoad / 100,
      endRemaining: Math.max(0, limitP - endLoad - last.piasters) / 100,
    };
  };

  const endRaw = config.endDate !== undefined && config.endDate !== null ? toTimestamp(config.endDate) : NaN;

  /* ---------- للخلف: موعد حدده المستخدم ---------- */
  if (!Number.isNaN(endRaw)) {
    const back = [];                                   /* الأيام المرشحة من الأحدث للأقدم */
    for (let k = 0; k < 400; k++) {
      const ts = addDaysNoon(endRaw, -k);
      if (dayDiff(startTs, ts) < 0) break;
      if (weekdayOf(ts) === dayOff) continue;
      back.push(ts);
    }
    if (back.length === 0) return null;
    if (amountP <= limitP) {
      const single = back.find((ts) => freeOf(ts) >= amountP);   /* أحدث يوم يتسع للطلب كاملاً */
      if (single !== undefined) return finish([{ ts: single, piasters: amountP }]);
    }
    let remaining = amountP;
    const parts = [];
    for (const ts of back) {
      const free = freeOf(ts);
      if (free <= 0) continue;
      const take = Math.min(remaining, free);
      if (take < remaining && free < minChunk) continue;
      parts.push({ ts, piasters: take });
      remaining -= take;
      if (remaining === 0) break;
    }
    return remaining === 0 ? finish(parts) : null;
  }

  /* ---------- للأمام: أبكر إنهاء ---------- */
  const bound = maxDays + (n > 1 ? n * 2 + 7 : 0);
  let remaining = amountP;
  const parts = [];
  for (let i = 0; i < bound; i++) {
    const ts = addDaysNoon(now, minDays + i);
    if (weekdayOf(ts) === dayOff) continue;
    const free = freeOf(ts);
    if (free <= 0) continue;
    const take = Math.min(remaining, free);
    if (take < remaining && free < minChunk) continue;
    parts.push({ ts, piasters: take });
    remaining -= take;
    if (remaining === 0) break;
  }
  if (remaining > 0) return null;
  /* طلب ≤ الحد ويتسع يوم الإنهاء له كاملاً: يوم واحد بلا تفتيت */
  const end = parts[parts.length - 1].ts;
  if (amountP <= limitP && freeOf(end) >= amountP) return finish([{ ts: end, piasters: amountP }]);
  return finish(parts);
}

/* ==========================================================================
   4. اقتراح تاريخ تسليم
   ========================================================================== */

/**
 * الموعد المقترح = يوم انتهاء أبكر خطة عمل على أساس الحد اليومي.
 *   - الأيام ذات السعة الجزئية تُستخدم (انظر planOrder).
 *   - لا حد يومي أو مبلغ صفر: أول يوم عمل بعد minDays.
 * الطوابع الزمنية ظهر اليوم (نفس صيغة حفظ النموذج للمواعيد).
 *
 * @param {Array} orders
 * @param {Object} [config]  (انظر planOrder) + dailyOrderLimit/orderAmount
 * @returns {{timestamp:number, startTimestamp:number, reason:string, dayOfWeek:number,
 *            overLimit:boolean, daysNeeded:number, daysUsed:number,
 *            dayLoad:number, remainingAfter:number, workPlan:Array<{day:string,amount:number}>}}
 *   overLimit = الطلب أكبر من الحد اليومي (لا يتسع في يوم واحد).
 */
export function suggestDueDate(orders, config = {}) {
  const dayOff = Number(config.dayOffWeekday ?? 0);
  const limitP = toPiasters(config.dailyOrderLimit);
  const amountP = toPiasters(config.orderAmount);
  const minDays = minDaysOf(config);
  const maxDays = Number(config.maxLookaheadDays) > 0 ? Math.floor(Number(config.maxLookaheadDays)) : 60;
  const now = Date.now();
  const startTs = addDaysNoon(now, minDays);

  /* الحالة البسيطة: لا حد يومي أو طلب صفر → أول يوم عمل */
  if (limitP <= 0 || amountP <= 0) {
    for (let i = 0; i < maxDays; i++) {
      const ts = addDaysNoon(now, minDays + i);
      if (weekdayOf(ts) === dayOff) continue;
      return buildResult(ts, ts, 1, false, 0, 0, []);
    }
    return fallback(startTs, 'لا يوجد يوم متاح قريباً', false, 1);
  }

  const overLimit = amountP > limitP;
  const res = planOrder(orders, config);
  if (!res) {
    return fallback(startTs, 'لا يوجد يوم كافٍ في الأفق القريب', overLimit,
      Math.min(MAX_SPREAD_DAYS, Math.ceil(amountP / limitP)));
  }
  return buildResult(res.endTimestamp, res.startTimestamp, res.daysUsed, overLimit,
    Math.round(res.endDayLoad * 100), Math.round(res.endRemaining * 100), res.plan);
}

/* ==========================================================================
   5. بناء النتيجة
   ========================================================================== */

function fallback(ts, reason, overLimit, daysNeeded) {
  return {
    timestamp: ts, startTimestamp: ts, reason, dayOfWeek: weekdayOf(ts), overLimit,
    daysNeeded, daysUsed: 0, dayLoad: 0, remainingAfter: 0, workPlan: [],
  };
}

function buildResult(ts, startTs, daysUsed, overLimit, loadP, remainingAfterP, plan) {
  const diff = dayDiff(Date.now(), ts);
  let reason;
  if (diff === 0) reason = 'اليوم';
  else if (diff === 1) reason = 'غداً';
  else if (diff === 2) reason = 'بعد غد';
  else reason = 'بعد ' + diff + ' أيام';
  if (daysUsed > 1) reason += ' (يوزَّع على ' + daysUsed + ' أيام عمل)';
  return {
    timestamp: ts, startTimestamp: startTs, reason, dayOfWeek: weekdayOf(ts), overLimit,
    daysNeeded: daysUsed, daysUsed,
    dayLoad: loadP / 100, remainingAfter: Math.max(0, remainingAfterP) / 100, workPlan: plan,
  };
}

export const __internal = { DAY_MS, toPiasters, toTimestamp, MIN_CHUNK_RATIO };
