/* ==========================================================================
   morning-summary.js — «ملخص الصباح» (v3.3.58)
   ==========================================================================
   حسابات نقية: متى يُعرض؟ وماذا فيه؟ (يعيد استعمال نموذج شاشة الورشة وعملاء الأسبوع).
   ========================================================================== */

import { buildWallModel } from './wall-board.js';
import { buildWeekVisits } from './week-visits.js';

export const MORNING_FROM_HOUR = 4;

/** مفتاح اليوم المحلي YYYY-MM-DD. */
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** يُعرض مرة واحدة كل يوم، بعد الرابعة فجراً، إن لم يُوقَف. */
export function shouldShowMorning({ enabled = true, last = '', now = Date.now() } = {}) {
  if (!enabled) return false;
  if (new Date(now).getHours() < MORNING_FROM_HOUR) return false;
  return String(last || '') !== dayKey(now);
}

/**
 * @returns {{total:number, sections:Array<{id:string,icon:string,title:string,count:number,names:string[]}>}}
 *  لا تُضاف الأقسام الفارغة؛ total = مجموع الأعداد.
 */
export function buildMorningModel(data = {}, now = Date.now()) {
  const wall = buildWallModel(data, now);
  const visits = buildWeekVisits(data, now);
  const names = (arr, f) => arr.slice(0, 3).map(f);
  const all = [
    { id: 'late', icon: '🔴', title: 'طلبات متأخرة', count: wall.late.length, names: names(wall.late, (r) => r.name + ' (' + r.daysLate + ' يوم)') },
    { id: 'today', icon: '📅', title: 'تُسلَّم اليوم', count: wall.dueToday.length, names: names(wall.dueToday, (r) => r.name) },
    { id: 'ready', icon: '📦', title: 'جاهزة بانتظار العميل', count: wall.ready.length, names: names(wall.ready, (r) => r.name) },
    { id: 'appts', icon: '🗓️', title: 'مواعيد اليوم', count: wall.appointments.length, names: names(wall.appointments.filter((a) => !a.done), (a) => (a.name ? a.name + ' — ' : '') + a.title) },
    { id: 'week', icon: '👣', title: 'عملاء متوقّعون هذا الأسبوع', count: visits.length, names: [] },
  ];
  const sections = all.filter((s) => s.count > 0);
  return { total: sections.reduce((n, s) => n + s.count, 0), sections };
}
