/* ==========================================================================
   personal-today.js — «ملخصك الشخصي» للوحة الرئيسية (v3.17.0) — دوال نقية
   ==========================================================================
   يجمع ما يحتاج انتباهك اليوم من الصفحات الشخصية: مهام متأخرة أو موعدها اليوم، مستندات منتهية أو قريبة الانتهاء،
   أقساط جمعيات مستحقة أو متأخرة وقبض هذا الشهر. لا DOM ولا قاعدة بيانات. total = 0 ⟵ لا بطاقة (لوحة هادئة).
   ========================================================================== */

import { sortTasks, taskBucket, taskSummary } from './todos.js';
import { documentAlerts } from './documents.js';
import { circleAlerts } from './circles.js';

/**
 * @param {{tasks?:Array, documents?:Array, circles?:Array, now?:Date}} a
 * @returns {{tasks:{overdue:number,today:number,items:Array}, docs:{count:number,expired:number,items:Array},
 *            circles:{pay:Array,collect:Array}, total:number}}
 */
export function personalToday(a) {
  const now = (a && a.now) || new Date();
  const tasks = Array.isArray(a && a.tasks) ? a.tasks : [];
  const sm = taskSummary(tasks, now);
  const items = sortTasks(tasks, now).filter((t) => !t.done && (taskBucket(t, now) === 'overdue' || taskBucket(t, now) === 'today')).slice(0, 3);
  const da = documentAlerts(a && a.documents, now);
  const ca = circleAlerts(a && a.circles, now, 3);
  const pay = ca.filter((x) => x.kind !== 'collect');
  const collect = ca.filter((x) => x.kind === 'collect');
  return {
    tasks: { overdue: sm.overdue, today: sm.today, items },
    docs: { count: da.length, expired: da.filter((x) => x.status === 'expired').length, items: da.slice(0, 2) },
    circles: { pay, collect },
    total: sm.overdue + sm.today + da.length + pay.length + collect.length,
  };
}
