/* ==========================================================================
   daily-brief.js — «نشرة اليوم» داخل التطبيق بنفس تصنيف إشعار الجوال (v3.18.0) — دوال نقية بلا استيرادات
   ==========================================================================
   المشكلة: ملخص الصباح في التطبيق وإشعار الجوال كانا يُحسبان بمنطقين منفصلين، فقد يقرأ المستخدم رقماً هنا ورقماً مختلفاً هناك.
   الحل: هذا الملف توأم حرفي لـ functions/push-logic.js (buildMessage) على نفس «الملخص» (digest) الذي يرفعه التطبيق:
     - يصنّف الأقسام بالقواعد نفسها: متأخر · اليوم · قريب · جاهز · مخزون · التزامات · مستندات · جمعيات · مهام.
     - يعيد أعداداً منظَّمة (counts) لا نصوصاً؛ والنص يبقى مهمة الواجهة.
   ⚠️ يحرسه scripts/tests/brief-parity.test.cjs: يمرّر آلاف المدخلات العشوائية للنسختين ويشترط تطابق counts تماماً.
      لا تغيّر قاعدة هنا دون تغييرها في functions/push-logic.js (والعكس).
   ========================================================================== */

/** الوقت المحلي في منطقة زمنية: { ymd, day, minutes, daysInMonth } (نفس push-logic.localParts). */
export function localParts(nowMs, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const x of f.formatToParts(new Date(nowMs))) p[x.type] = x.value;
  return {
    ymd: p.year + '-' + p.month + '-' + p.day,
    day: Number(p.day),
    minutes: Number(p.hour) * 60 + Number(p.minute),
    daysInMonth: new Date(Number(p.year), Number(p.month), 0).getDate(),
  };
}

/** فرق الأيام بين ymd و ymd (الثاني − الأول). */
export function diffDays(a, b) {
  const pa = a.split('-').map(Number); const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

export const EMPTY_COUNTS = Object.freeze({
  today: 0, soon: 0, overdue: 0, ready: 0,
  out: 0, low: 0, commitments: 0, docsExpired: 0, docsNear: 0, circles: 0, tasksToday: 0, tasksOverdue: 0,
});

/**
 * @param {Object} digest — ناتج buildDigest (push-digest.js)
 * @param {Object} prefs  — ناتج serverPrefs (daysBefore · commitmentsDays · tz…)
 * @param {Object} [state] — { notified } (إن غاب فكل «القريب» يُعدّ)
 * @param {number} [nowMs]
 * @returns {{counts:Object, names:{commitments:string[], circles:string[], docs:string[]}, today:string}}
 */
export function briefCounts(digest, prefs, state, nowMs = Date.now()) {
  const p = prefs || {};
  const tz = p.tz || 'Africa/Cairo';
  const lp = localParts(nowMs, tz);
  const days = Number(p.daysBefore) || 0;
  const notified = (state && state.notified) || {};
  const orders = (digest && Array.isArray(digest.orders)) ? digest.orders : [];

  const counts = { ...EMPTY_COUNTS };
  /* الطلب «الجاهز» يُحسب في «جاهز» فقط (نفس قاعدة الخادمة وشاشة الورشة) */
  for (const o of orders) {
    if (!o) continue;
    if (o.r === 1) { counts.ready++; continue; }
    if (!o.d) continue;
    const diff = diffDays(lp.ymd, o.d);
    if (diff < 0) counts.overdue++;
    else if (diff === 0) counts.today++;
    else if (diff > 0 && diff <= days && notified[o.i] !== o.d) counts.soon++;
  }

  const names = { commitments: [], circles: [], docs: [] };
  if (!digest) return { counts, names, today: lp.ymd };

  counts.out = Number(digest.out) > 0 ? Number(digest.out) : 0;
  counts.low = Number(digest.low) > 0 ? Number(digest.low) : 0;

  const win = Number(p.commitmentsDays);
  const span = Number.isFinite(win) ? win : 3;
  const inWin = (x) => { const d = Math.min(x.day, lp.daysInMonth) - lp.day; return d >= 0 && d <= span; };
  if (Array.isArray(digest.cm)) {
    const due = digest.cm.filter(inWin);
    counts.commitments = due.length;
    due.forEach((x) => { if (x.t) names.commitments.push(x.t); });
  }
  if (Array.isArray(digest.cr)) {
    const due = digest.cr.filter(inWin);
    counts.circles = due.length;
    due.forEach((x) => { if (x.t) names.circles.push(x.t); });
  }
  if (Array.isArray(digest.dc)) {
    for (const x of digest.dc) {
      if (!x || typeof x.e !== 'string') continue;
      const diff = diffDays(lp.ymd, x.e);
      const remind = Number.isFinite(Number(x.r)) ? Number(x.r) : 30;
      if (diff < 0) counts.docsExpired++;
      else if (diff <= remind) counts.docsNear++;
      else continue;
      if (x.t) names.docs.push(x.t);
    }
  }
  if (Array.isArray(digest.tk)) {
    for (const d of digest.tk) {
      if (typeof d !== 'string') continue;
      const diff = diffDays(lp.ymd, d);
      if (diff < 0) counts.tasksOverdue++;
      else if (diff === 0) counts.tasksToday++;
    }
  }
  return { counts, names, today: lp.ymd };
}
