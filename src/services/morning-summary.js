/* ==========================================================================
   morning-summary.js — «ملخص الصباح» (v3.3.58)
   ==========================================================================
   حسابات نقية: متى يُعرض؟ وماذا فيه؟ (يعيد استعمال نموذج شاشة الورشة وعملاء الأسبوع).
   ========================================================================== */

import { buildWallModel } from './wall-board.js';
import { buildWeekVisits } from './week-visits.js';
import { buildDigest, serverPrefs, pushOptions } from './push-digest.js';
import { briefCounts } from './daily-brief.js';

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
 * @param {Object} data — { orders, customers, appointments, payments } (+ اختيارياً `source` = ناتج collectDigestSource)
 * @param {number} now
 * @param {{tz?:string}} [opts]
 * @returns {{total:number, sections:Array<{id:string,icon:string,title:string,count:number,names:string[]}>, unified:boolean}}
 *  لا تُضاف الأقسام الفارغة؛ total = مجموع الأعداد.
 *  v3.18.0: مع `data.source` تُحسب الأعداد من «ملخص الإشعار» نفسه (daily-brief.js) فتطابق ما يصل جوالك، وتظهر أقسام
 *  المخزون والالتزامات والمستندات والجمعيات والمهام، وتحترم مفاتيح «إشعارات حقيقية» (من أطفأ قسماً لا يراه هنا).
 *  بلا `source` يبقى السلوك القديم حرفياً.
 */
export function buildMorningModel(data = {}, now = Date.now(), opts = {}) {
  const wall = buildWallModel(data, now);
  const visits = buildWeekVisits(data, now);
  const names = (arr, f) => arr.slice(0, 3).map(f);

  let brief = null;
  let tog = null;
  if (data.source && typeof data.source === 'object') {
    let tz = opts.tz;
    if (!tz) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = 'Africa/Cairo'; } }
    const settings = data.source.settings || {};
    const digest = buildDigest({ ...data.source, now });
    brief = briefCounts(digest, serverPrefs(settings, tz), {}, now);
    tog = pushOptions(settings);
  }
  const c = brief ? brief.counts : null;
  const on = (k) => !tog || tog[k] !== false;
  const pick = (briefVal, wallVal) => (c ? briefVal : wallVal);
  const take = (arr) => (Array.isArray(arr) ? arr.slice(0, 3) : []);

  const all = [
    { id: 'late', icon: '🔴', title: 'طلبات متأخرة', count: pick(c && c.overdue, wall.late.length), names: names(wall.late, (r) => r.name + ' (' + r.daysLate + ' يوم)'), off: !on('overdue') },
    { id: 'today', icon: '📅', title: 'تُسلَّم اليوم', count: pick(c && c.today, wall.dueToday.length), names: names(wall.dueToday, (r) => r.name) },
    { id: 'ready', icon: '📦', title: 'جاهزة بانتظار العميل', count: pick(c && c.ready, wall.ready.length), names: names(wall.ready, (r) => r.name), off: !on('ready') },
    { id: 'appts', icon: '🗓️', title: 'مواعيد اليوم', count: wall.appointments.length, names: names(wall.appointments.filter((a) => !a.done), (a) => (a.name ? a.name + ' — ' : '') + a.title) },
    { id: 'week', icon: '👣', title: 'عملاء متوقّعون هذا الأسبوع', count: visits.length, names: [] },
  ];
  if (brief) {
    all.push(
      { id: 'stock', icon: '🧰', title: 'نواقص المخزون', count: c.out + c.low, names: [c.out ? c.out + ' نفد' : '', c.low ? c.low + ' ناقص' : ''].filter(Boolean), off: !on('stock') },
      { id: 'commitments', icon: '💳', title: 'التزامات تستحق قريباً', count: c.commitments, names: take(brief.names.commitments), off: !on('commitments') },
      { id: 'docs', icon: '🗂️', title: 'مستندات منتهية أو قريبة الانتهاء', count: c.docsExpired + c.docsNear, names: take(brief.names.docs), off: !on('documents') },
      { id: 'circles', icon: '🪙', title: 'أقساط جمعيات تستحق', count: c.circles, names: take(brief.names.circles), off: !on('circles') },
      { id: 'tasks', icon: '✅', title: 'مهام اليوم والمتأخرة', count: c.tasksToday + c.tasksOverdue, names: [], off: !on('tasks') },
    );
  }
  const sections = all.filter((s) => s.count > 0 && !s.off).map(({ off, ...rest }) => rest);
  return { total: sections.reduce((n, s) => n + s.count, 0), sections, unified: !!brief };
}
