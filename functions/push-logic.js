'use strict';
/* ==========================================================================
   push-logic.js — منطق نقيّ لبناء نص الإشعار (يُختبر بـ node --test بلا Firebase)
   ========================================================================== */

const pad = (n) => String(n).padStart(2, '0');

/** الوقت المحلي في منطقة زمنية: { ymd, minutes } */
function localParts(nowMs, tz) {
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
    dow: new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay(),   /* 0=الأحد … 5=الجمعة (v3.19.0) */
  };
}

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/** فرق الأيام بين ymd و ymd (الثاني − الأول). */
function diffDays(a, b) {
  const pa = a.split('-').map(Number); const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/** داخل ساعات الهدوء؟ (يدعم العبور لمنتصف الليل) */
function inQuiet(q, minutes) {
  if (!q) return false;
  const a = toMin(q.from); const b = toMin(q.to);
  if (a === b) return false;
  return a < b ? (minutes >= a && minutes < b) : (minutes >= a || minutes < b);
}

/**
 * هل حان وقت الإرسال لهذه الورشة الآن؟
 * الجدولة كل 15 دقيقة: نرسل في أول نافذة بعد الوقت المختار (حتى 3 ساعات تأخير)
 * مرة واحدة يومياً، وبعد انتهاء ساعات الهدوء إن وقع الوقت داخلها.
 */
function isDue(prefs, state, nowMs) {
  if (!prefs || prefs.enabled !== true) return false;
  const tz = prefs.tz || 'Africa/Cairo';
  const lp = localParts(nowMs, tz);
  if (state && state.lastSentDay === lp.ymd) return false;
  const target = toMin(prefs.time || '08:00');
  if (lp.minutes < target || lp.minutes > target + 180) return false;
  if (inQuiet(prefs.quiet, lp.minutes)) return false;
  return true;
}

/** تصنيف خام لبقية الأقسام (مخزون · التزامات · مستندات · جمعيات · مهام) بلا مفاتيح التفعيل. */
function classifyExtras(digest, prefs, lp) {
  const c = { out: 0, low: 0, commitments: 0, docsExpired: 0, docsNear: 0, circles: 0, tasksToday: 0, tasksOverdue: 0, weekly: 0 };
  if (!digest) return c;
  c.out = Number(digest.out) > 0 ? Number(digest.out) : 0;
  c.low = Number(digest.low) > 0 ? Number(digest.low) : 0;
  const win = Number(prefs && prefs.commitmentsDays);
  const span = Number.isFinite(win) ? win : 3;
  const inWin = (x) => { const d = Math.min(x.day, lp.daysInMonth) - lp.day; return d >= 0 && d <= span; };
  if (Array.isArray(digest.cm)) c.commitments = digest.cm.filter(inWin).length;
  if (Array.isArray(digest.cr)) c.circles = digest.cr.filter(inWin).length;
  if (Array.isArray(digest.dc)) {
    for (const x of digest.dc) {
      if (!x || typeof x.e !== 'string') continue;
      const diff = diffDays(lp.ymd, x.e);
      const remind = Number.isFinite(Number(x.r)) ? Number(x.r) : 30;
      if (diff < 0) c.docsExpired++; else if (diff <= remind) c.docsNear++;
    }
  }
  if (Array.isArray(digest.tk)) {
    for (const d of digest.tk) {
      if (typeof d !== 'string') continue;
      const diff = diffDays(lp.ymd, d);
      if (diff < 0) c.tasksOverdue++; else if (diff === 0) c.tasksToday++;
    }
  }
  return c;
}

/**
 * بناء أسطر الإشعار من الملخص.
 * @returns {{lines:string[], title:string, body:string, url:string, ids:string[], counts:Object}}
 */
function buildMessage(digest, prefs, state, nowMs) {
  const tz = (prefs && prefs.tz) || 'Africa/Cairo';
  const lp = localParts(nowMs, tz);
  const days = Number(prefs.daysBefore) || 0;
  const notified = (state && state.notified) || {};
  const orders = (digest && digest.orders) || [];

  const overdue = []; const today = []; const soon = []; const ready = [];
  /* v3.18.0: الطلب «الجاهز» يُحسب في «جاهز لم يُستلم» فقط (لا يتكرر في اليوم/القريب/المتأخر) —
     نفس قاعدة شاشة الورشة وملخص الصباح في التطبيق (services/daily-brief.js). */
  const sz = (digest && digest.sz && typeof digest.sz === 'object') ? digest.sz : {};
  for (const o of orders) {
    /* v3.19.0: طلب أجّلتَه من «مركز العمل» لا يظهر في أي قسم حتى يوم عودته */
    if (sz[o.i] && sz[o.i] > lp.ymd) continue;
    if (o.r === 1) { ready.push(o); continue; }
    if (o.d) {
      const diff = diffDays(lp.ymd, o.d);
      if (diff < 0) overdue.push(o);
      else if (diff === 0) today.push(o);
      else if (diff > 0 && diff <= days && notified[o.i] !== o.d) soon.push(o);
    }
  }

  const lines = []; const ids = [];
  const nm = (o) => o.c || null;
  if (today.length) {
    lines.push(today.length === 1 && nm(today[0])
      ? '⏰ تسليم اليوم: ' + nm(today[0])
      : '⏰ ' + today.length + ' طلب يُسلَّم اليوم');
  }
  if (soon.length) {
    soon.forEach((o) => ids.push(o.i));
    lines.push(soon.length === 1 && nm(soon[0])
      ? '🔔 ' + nm(soon[0]) + ' — تسليمه بعد ' + diffDays(lp.ymd, soon[0].d) + ' يوم'
      : '🔔 ' + soon.length + ' طلب موعده خلال ' + days + ' يوم');
  }
  if (prefs.overdue !== false && overdue.length) lines.push('🚨 ' + overdue.length + ' طلب متأخر');
  if (prefs.ready !== false && ready.length) lines.push('✅ ' + ready.length + ' جاهز لم يُستلم');
  if (prefs.stock !== false && digest && (digest.out > 0 || digest.low > 0)) {
    lines.push('📦 ' + (digest.out ? digest.out + ' نفد' : '') + (digest.out && digest.low ? ' و' : '') + (digest.low ? digest.low + ' ناقص' : '') + ' في المخزون');
  }
  if (prefs.commitments !== false && digest && Array.isArray(digest.cm)) {
    const win = Number(prefs.commitmentsDays);
    const span = Number.isFinite(win) ? win : 3;
    const due = digest.cm.filter((c) => {
      const d = Math.min(c.day, lp.daysInMonth) - lp.day;
      return d >= 0 && d <= span;
    });
    if (due.length) {
      lines.push(due.length === 1 && due[0].t
        ? '💳 ' + due[0].t + ' يستحق ' + (Math.min(due[0].day, lp.daysInMonth) === lp.day ? 'اليوم' : 'قريباً')
        : '💳 ' + due.length + ' التزام يستحق قريباً');
    }
  }

  /* v3.17.0 (إضافات متوافقة: الملخص القديم بلا هذه الحقول لا يغيّر شيئاً) */
  if (prefs.documents !== false && digest && Array.isArray(digest.dc)) {
    const expired = []; const near = [];
    for (const x of digest.dc) {
      if (!x || typeof x.e !== 'string') continue;
      const diff = diffDays(lp.ymd, x.e);
      const remind = Number.isFinite(Number(x.r)) ? Number(x.r) : 30;
      if (diff < 0) expired.push(x); else if (diff <= remind) near.push({ ...x, diff });
    }
    if (expired.length) lines.push('🗂️ ' + (expired.length === 1 && expired[0].t ? expired[0].t + ' منتهٍ' : expired.length + ' مستند منتهٍ'));
    if (near.length) {
      lines.push(near.length === 1 && near[0].t
        ? '🗂️ ' + near[0].t + ' ينتهي ' + (near[0].diff === 0 ? 'اليوم' : 'بعد ' + near[0].diff + ' يوم')
        : '🗂️ ' + near.length + ' مستند ينتهي قريباً');
    }
  }
  if (prefs.circles !== false && digest && Array.isArray(digest.cr)) {
    const win = Number(prefs.commitmentsDays);
    const span = Number.isFinite(win) ? win : 3;
    const dueC = digest.cr.filter((c) => {
      const d = Math.min(c.day, lp.daysInMonth) - lp.day;
      return d >= 0 && d <= span;
    });
    if (dueC.length) {
      lines.push(dueC.length === 1 && dueC[0].t
        ? '🪙 قسط ' + dueC[0].t + ' يستحق ' + (Math.min(dueC[0].day, lp.daysInMonth) === lp.day ? 'اليوم' : 'قريباً')
        : '🪙 ' + dueC.length + ' قسط جمعية يستحق قريباً');
    }
  }
  if (prefs.tasks !== false && digest && Array.isArray(digest.tk)) {
    let od = 0; let td = 0;
    for (const d of digest.tk) {
      if (typeof d !== 'string') continue;
      const diff = diffDays(lp.ymd, d);
      if (diff < 0) od++; else if (diff === 0) td++;
    }
    if (od + td > 0) lines.push('✅ ' + (td ? td + ' مهمة اليوم' : '') + (td && od ? ' و' : '') + (od ? od + ' متأخرة' : ''));
  }

  /* v3.19.0: «أسبوعك» كل جمعة من ملخص رفعه التطبيق خلال آخر 48 ساعة (أقدم منه ⟵ لا سطر بدل أرقام قديمة) */
  const weeklyOn = !!(prefs.weekly !== false && digest && digest.wk && typeof digest.wk === 'object' && lp.dow === 5 && Number(nowMs) - Number(digest.at) <= 48 * 3600000 && Number(nowMs) - Number(digest.at) >= -3600000);
  if (weeklyOn) {
    const w = digest.wk; const f = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
    lines.push('📈 أسبوعك: محصّل ' + f(w.inc) + ' ج · مصروف ' + f(w.exp) + ' ج · سُلِّم ' + f(w.del) + (Number(w.ovd) > 0 ? ' · متأخر ' + f(w.ovd) : ''));
  }

  /* v3.18.0: أعداد منظَّمة (تصنيف خام بلا مفاتيح التفعيل) — يقارنها اختبار التكافؤ مع services/daily-brief.js */
  const counts = classifyExtras(digest, prefs, lp);
  counts.weekly = weeklyOn ? 1 : 0;
  counts.today = today.length; counts.soon = soon.length; counts.overdue = overdue.length; counts.ready = ready.length;

  const url = today.length || overdue.length || soon.length ? '#/orders' : (lines.length ? '#/dashboard' : '#/dashboard');
  return {
    lines, ids, url, counts,
    title: lines.length > 1 ? '🧵 نشرة اليوم (' + lines.length + ')' : '🧵 ورشة الجلابيب',
    body: lines.join('\n'),
    today: lp.ymd,
  };
}

module.exports = { localParts, diffDays, inQuiet, isDue, buildMessage, classifyExtras, toMin };
