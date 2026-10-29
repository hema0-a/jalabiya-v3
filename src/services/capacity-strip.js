/* ==========================================================================
   capacity-strip.js — شريط سعة الأيام القادمة (حساب نقي بلا DOM)
   ==========================================================================
   لكل يوم من الأيام القادمة: كم حِمل التسليم وهل بقيت سعة؟ يستند إلى getDayLoad
   فيطابق شريط الحد اليومي واقتراح الموعد. الإجازة الأسبوعية تُعلَّم off.
   ========================================================================== */

import { getDayLoad } from './order-scheduler.js';
import { addDaysNoon, dayKey, weekdayOf } from '../core/day-math.js';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * @param {Array} orders
 * @param {Object} [cfg]
 * @param {number} [cfg.dailyOrderLimit=0]  0 = بلا حد (يُرجع [])
 * @param {number} [cfg.dayOffWeekday=0]
 * @param {string|null} [cfg.excludeOrderId=null]
 * @param {number} [cfg.orderAmount=0] مبلغ الطلب الجاري: يُحسب هل يتسع في اليوم
 * @param {number} [now]
 * @param {number} [days=14]
 * @returns {Array<{key:string, ts:number, weekday:string, off:boolean, status:string, amount:number,
 *                  count:number, remaining:number, percent:number, fits:boolean}>}
 */
export function buildCapacityStrip(orders, cfg = {}, now = Date.now(), days = 14) {
  const limit = Number(cfg.dailyOrderLimit) || 0;
  if (limit <= 0) return [];
  const dayOff = Number(cfg.dayOffWeekday ?? 0);
  const orderAmount = Math.max(0, Number(cfg.orderAmount) || 0);
  const n = Math.max(1, Math.min(60, Math.floor(days) || 14));
  const out = [];
  for (let i = 0; i < n; i++) {
    const ts = addDaysNoon(now, i);
    const wd = weekdayOf(ts);
    const off = wd === dayOff;
    const load = getDayLoad(orders, ts, { limit, dayOffWeekday: dayOff, includeDelivered: true, excludeId: cfg.excludeOrderId || null });
    out.push({
      key: dayKey(ts), ts, weekday: WEEKDAYS[wd] || '', off,
      status: off ? 'off' : load.status,
      amount: load.amount, count: load.count, remaining: load.remaining, percent: load.percent,
      fits: !off && (orderAmount <= 0 ? !load.exceeded : load.amount + orderAmount <= limit + 0.009),
    });
  }
  return out;
}

/**
 * وصف قصير لتاريخ اختاره المستخدم يدوياً: هل هو مزدحم؟
 * @returns {{level:'ok'|'warn'|'danger'|'off'|'none', text:string}}
 */
export function describeChosenDay(orders, cfg = {}, ts, now = Date.now()) {
  const limit = Number(cfg.dailyOrderLimit) || 0;
  if (limit <= 0 || !Number.isFinite(Number(ts))) return { level: 'none', text: '' };
  const dayOff = Number(cfg.dayOffWeekday ?? 0);
  if (weekdayOf(ts) === dayOff) return { level: 'off', text: '⚠️ هذا اليوم إجازة الورشة الأسبوعية' };
  const amount = Math.max(0, Number(cfg.orderAmount) || 0);
  const load = getDayLoad(orders, ts, { limit, dayOffWeekday: dayOff, includeDelivered: true, excludeId: cfg.excludeOrderId || null });
  const total = load.amount + amount;
  if (total > limit + 0.009) {
    return { level: 'danger', text: '🚨 هذا اليوم سيتجاوز الحد اليومي (' + Math.round(total) + ' من ' + limit + ') — يُفضَّل يوم أخف' };
  }
  if (total >= limit * 0.8) {
    return { level: 'warn', text: '⚠️ هذا اليوم شبه ممتلئ (' + Math.round(total) + ' من ' + limit + ')' };
  }
  return { level: 'ok', text: '✅ سعة هذا اليوم تكفي (' + Math.round(total) + ' من ' + limit + ')' };
}
