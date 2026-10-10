/* ==========================================================================
   order-timing.js — معلومات التوقيت للطلبات
   ==========================================================================
   - getDeadlineInfo(dueDate) — حالة الموعد (متأخر/اليوم/غداً/...).
   - getPickupInfo(receivedDate) — حالة استلام القماش.
   - formatDuration(ms) — صيغة مدة (2س 30د / 45د / 3 أيام).
   - getTotalWorkTime(workSessions) — مجموع ساعات العمل.
   - getActiveSession(workSessions) — هل المؤقت يعمل الآن؟
   ========================================================================== */

import { dayDiff, endOfDay } from '../core/day-math.js';

/* ==========================================================================
   0. حدّ "التأخير": نهاية يوم الموعد وليس بدايته
   ========================================================================== */

/**
 * نهاية يوم الموعد (23:59:59.999 بالتوقيت المحلي).
 * نموذج الطلب يحفظ التاريخ كمنتصف ليل UTC (= 02:00/03:00 صباحاً في مصر)، فالمقارنة المباشرة
 * dueDate < now كانت تعتبر طلب "تسليم اليوم" متأخراً من الثالثة فجراً بينما بطاقة الطلب تقول "اليوم".
 * @param {number} dueDate
 * @returns {number} NaN إن لم يوجد موعد
 */
export function dueDayEndMs(dueDate) {
  if (!dueDate) return NaN;
  return endOfDay(dueDate);
}

/**
 * هل فات موعد التسليم؟ (يُعتبر متأخراً بعد نهاية يوم الموعد فقط)
 * @param {number} dueDate
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isPastDue(dueDate, now = Date.now()) {
  if (!dueDate) return false;
  return now > dueDayEndMs(dueDate);
}

/* ==========================================================================
   1. الموعد النهائي
   ========================================================================== */

/**
 * حالة الموعد النهائي مقارنةً باليوم الحالي.
 * @param {number} dueDate — timestamp (ms) أو null
 * @returns {{status:string, label:string, color:string, bg:string, icon:string, daysLeft:number|null}}
 */
export function getDeadlineInfo(dueDate) {
  if (!dueDate) {
    return { status: 'none', label: 'بدون موعد', color: '#666',
      bg: '#F0EAE0', icon: '⏱️', daysLeft: null };
  }

  /* فرق أيام تقويمي دقيق (لا يتأثر بالتوقيت الصيفي ولا بساعة حفظ التاريخ) */
  const daysLeft = dayDiff(Date.now(), dueDate);
  if (Number.isNaN(daysLeft)) {
    return { status: 'none', label: 'بدون موعد', color: '#666',
      bg: '#F0EAE0', icon: '⏱️', daysLeft: null };
  }

  if (daysLeft < 0) {
    const abs = Math.abs(daysLeft);
    return {
      status: 'overdue',
      label: abs === 1 ? 'متأخر يوم' : 'متأخر ' + abs + ' أيام',
      color: '#C62828',
      bg: '#FFEBEE',
      icon: '🚨',
      daysLeft,
    };
  }

  if (daysLeft === 0) {
    return { status: 'today', label: 'اليوم', color: '#E65100', bg: '#FFF3E0', icon: '⏰', daysLeft: 0 };
  }

  if (daysLeft === 1) {
    return { status: 'tomorrow', label: 'غداً', color: '#F57C00', bg: '#FFF8E1', icon: '📅', daysLeft: 1 };
  }

  if (daysLeft <= 3) {
    return { status: 'soon', label: 'بعد ' + daysLeft + ' أيام', color: '#F57C00', bg: '#FFF8E1', icon: '📅', daysLeft };
  }

  if (daysLeft <= 7) {
    return { status: 'week', label: 'بعد ' + daysLeft + ' أيام', color: '#1565C0', bg: '#E3F2FD', icon: '📅', daysLeft };
  }

  return { status: 'later', label: 'بعد ' + daysLeft + ' يوم', color: '#666',
    bg: '#F0EAE0', icon: '📅', daysLeft };
}

/* ==========================================================================
   2. استلام القماش
   ========================================================================== */

/**
 * حالة استلام القماش.
 * @param {number} receivedDate — timestamp (ms) أو null
 * @returns {{status:string, label:string, color:string, bg:string, icon:string}}
 */
export function getPickupInfo(receivedDate) {
  if (receivedDate) {
    return { status: 'received', label: 'تم استلام القماش', color: '#2E7D32',
      bg: '#E8F5E9', icon: '✅' };
  }

  return { status: 'pending', label: 'لم يُستلم القماش', color: '#F57C00',
    bg: '#FFF3E0', icon: '⏳' };
}

/* ==========================================================================
   3. المؤقت
   ========================================================================== */

/**
 * تنسيق مدة زمنية (ms) إلى نص عربي مقروء.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0د';
  const totalSec = Math.floor(ms / 1000);
  const totalMin = Math.floor(totalSec / 60);
  const totalHr = Math.floor(totalMin / 60);
  const days = Math.floor(totalHr / 24);

  if (days > 0) {
    const remHr = totalHr - days * 24;
    return remHr > 0 ? days + ' يوم ' + remHr + 'س' : days + ' أيام';
  }

  if (totalHr > 0) {
    const remMin = totalMin - totalHr * 60;
    return remMin > 0 ? totalHr + 'س ' + remMin + 'د' : totalHr + 'س';
  }

  if (totalMin > 0) return totalMin + 'د';
  return '<1د';
}

/**
 * مجموع ساعات العمل من مصفوفة sessions.
 * @param {Array<{start:number, end:number}>} workSessions
 * @returns {number} — بالمللي ثانية
 */
export function getTotalWorkTime(workSessions) {
  if (!Array.isArray(workSessions)) return 0;
  return workSessions.reduce((sum, s) => {
    const start = Number(s && s.start) || 0;
    const end = Number(s && s.end) || (s && s.start ? Date.now() : 0);
    if (!start) return sum;
    return sum + Math.max(0, end - start);
  }, 0);
}

/**
 * هل المؤقت يعمل الآن؟ (آخر session بدون end)
 * @param {Array<{start:number, end:number}>} workSessions
 * @returns {boolean}
 */
export function getActiveSession(workSessions) {
  if (!Array.isArray(workSessions) || workSessions.length === 0) return false;
  const last = workSessions[workSessions.length - 1];
  return !!(last && last.start && !last.end);
}

/**
 * بدء جلسة عمل جديدة.
 * @param {Array} workSessions
 * @returns {Array} — نسخة جديدة مع الجلسة المضافة
 */
export function startSession(workSessions) {
  const arr = Array.isArray(workSessions) ? [...workSessions] : [];
  if (getActiveSession(arr)) return arr;
  arr.push({ start: Date.now(), end: null });
  return arr;
}

/**
 * إيقاف الجلسة النشطة.
 * @param {Array} workSessions
 * @returns {Array} — نسخة جديدة مع الجلسة المُغلَقة
 */
export function stopSession(workSessions) {
  const arr = Array.isArray(workSessions) ? [...workSessions] : [];
  if (arr.length === 0) return arr;
  const last = arr[arr.length - 1];
  if (last && last.start && !last.end) {
    arr[arr.length - 1] = { start: last.start, end: Date.now() };
  }
  return arr;
}

/* ==========================================================================
   4. تصدير داخلي للاختبار
   ========================================================================== */

export const _internal = {
  DAY_MS: 86400000,
};
