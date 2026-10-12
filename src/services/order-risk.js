/* ==========================================================================
   order-risk.js — الطلبات المعرَّضة للتأخر (قبل أن تتأخر فعلاً)
   ==========================================================================
   الطلب المتأخر فعلاً له تنبيهه الخاص (isPastDue)، وهنا نلتقط الطلبات التي ما زالت
   في موعدها لكن مؤشراتها تقول إنها ستتأخر:
   - due_today_not_ready    : موعده اليوم وليس «جاهزاً»                       (خطر)
   - due_tomorrow_not_started: موعده غداً والعمل لم يبدأ (حالته انتظار)          (تحذير)
   - plan_not_started       : بدأ أول يوم في خطة عمله ومضى ولم يبدأ (انتظار)      (تحذير)
   - overbooked             : يوم من أيام خطته عليه حِمل أكبر من الحد اليومي       (تحذير)
   الطلب المسلَّم/الملغى/المتأخر فعلاً لا يُقيَّم. دوال نقية بلا DOM.
   ========================================================================== */

import { buildDayLedger, getOrderParts } from './order-scheduler.js';
import { dayKey, dayDiff } from '../core/day-math.js';
import { isPastDue } from './order-timing.js';

const STATUS_LABEL = { pending: 'انتظار', in_progress: 'قيد التنفيذ', ready: 'جاهز' };

function niceDay(key) {
  try {
    return new Date(key + 'T12:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
  } catch (e) { return key; }
}

/**
 * @param {Array} orders
 * @param {Object} [cfg]
 * @param {number} [cfg.dailyOrderLimit=0]
 * @param {number} [cfg.dayOffWeekday=0]
 * @param {number} [now=Date.now()]
 * @returns {Array<{order:Object, level:'danger'|'warn', reasons:Array<{code:string,level:string,text:string}>}>}
 *   الأخطر أولاً ثم الأقرب موعداً.
 */
export function assessOrderRisks(orders, cfg = {}, now = Date.now()) {
  const limit = Number(cfg.dailyOrderLimit) || 0;
  const limitP = Math.round(limit * 100);
  const todayKey = dayKey(now);
  const ledgerOpts = { dailyLimit: limit, dayOffWeekday: cfg.dayOffWeekday };
  const ledger = limit > 0 ? buildDayLedger(orders, ledgerOpts) : null;
  const out = [];

  for (const o of orders || []) {
    if (!o || o.status === 'delivered' || o.status === 'cancelled') continue;
    if (!o.dueDate || isPastDue(o.dueDate, now)) continue;

    const reasons = [];
    const daysToDue = dayDiff(now, o.dueDate);
    const label = STATUS_LABEL[o.status] || o.status;

    if (daysToDue === 0 && o.status !== 'ready') {
      reasons.push({ code: 'due_today_not_ready', level: 'danger', text: 'موعده اليوم وحالته «' + label + '»' });
    }
    if (daysToDue === 1 && o.status === 'pending') {
      reasons.push({ code: 'due_tomorrow_not_started', level: 'warn', text: 'موعده غداً ولم يبدأ العمل' });
    }

    if (limit > 0) {
      const parts = getOrderParts(o, ledgerOpts);
      if (parts.length > 0) {
        const first = parts[0].day;
        if (first < todayKey && o.status === 'pending' && daysToDue >= 2) {
          reasons.push({ code: 'plan_not_started', level: 'warn',
            text: 'كان يفترض أن يبدأ العمل ' + niceDay(first) + ' وحالته ما زالت «انتظار»' });
        }
        const over = parts.find((p) => p.day >= todayKey && ledger.has(p.day) && ledger.get(p.day).piasters > limitP);
        if (over) {
          reasons.push({ code: 'overbooked', level: 'warn',
            text: 'يوم ' + niceDay(over.day) + ' عليه حِمل ' + (ledger.get(over.day).piasters / 100) + ' والحد ' + limit });
        }
      }
    }

    if (reasons.length > 0) {
      out.push({ order: o, level: reasons.some((r) => r.level === 'danger') ? 'danger' : 'warn', reasons });
    }
  }

  out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1) ||
    (Number(a.order.dueDate) || 0) - (Number(b.order.dueDate) || 0));
  return out;
}
