/* ==========================================================================
   system-status.js — «حالة النظام»: ما لم يُرفع، آخر مزامنة، سلامة البيانات والتخزين (v3.3.66)
   ==========================================================================
   evaluateStatus: دالة نقية تحوّل لقطة الحالة إلى بنود مقروءة بمستوى (ok/warn/bad/info) ونصيحة.
   collectStatus: يجمع اللقطة من التطبيق (كل جزء بمعزل: فشل جزء لا يُسقط البقية).
   ========================================================================== */

const DAY = 86400000;
const HOUR = 3600000;
export const BACKUP_WARN_DAYS = 7;
export const SYNC_WARN_DAYS = 2;

export function ageText(ts, now = Date.now()) {
  if (!ts) return 'لم يحدث';
  const d = Math.max(0, now - ts);
  if (d < 60000) return 'الآن';
  if (d < HOUR) return 'منذ ' + Math.floor(d / 60000) + ' دقيقة';
  if (d < DAY) return 'منذ ' + Math.floor(d / HOUR) + ' ساعة';
  return 'منذ ' + Math.floor(d / DAY) + ' يوم';
}

const fmtMB = (n) => (Number.isFinite(n) ? (n / 1048576).toFixed(1) + ' MB' : '—');

/**
 * @param {Object} s لقطة الحالة (انظر collectStatus)
 * @returns {{level:'ok'|'warn'|'bad', items:Array<{id,label,value,level,hint?}>, worst:string}}
 */
export function evaluateStatus(s = {}, now = Date.now()) {
  const items = [];
  const add = (id, label, value, level, hint) => items.push({ id, label, value, level, hint: hint || '' });

  /* الاتصال */
  if (s.online === false) add('network', 'الاتصال', 'غير متصل', 'warn', 'التطبيق يعمل دون إنترنت وكل ما تسجّله يُحفظ على جهازك.');
  else add('network', 'الاتصال', 'متصل', 'ok');

  /* المزامنة السحابية */
  const sy = s.sync || {};
  if (!sy.configured || !sy.loggedIn) {
    add('sync', 'المزامنة السحابية', !sy.configured ? 'غير مُعدّة' : 'غير مسجَّل الدخول', 'info',
      'بياناتك على هذا الجهاز فقط — احتفظ بنسخة احتياطية خارجية.');
  } else {
    if (sy.blocked) add('sync', 'المزامنة السحابية', 'متوقفة', 'bad', String(sy.blocked));
    else if (!sy.auto) add('sync', 'المزامنة السحابية', 'يدوية', 'info', 'فعّل المزامنة التلقائية ليُرفع كل جديد وحده.');
    else add('sync', 'المزامنة السحابية', 'تلقائية', 'ok');

    if (sy.dirtySince) {
      const stale = now - sy.dirtySince > SYNC_WARN_DAYS * DAY;
      add('pending', 'تغييرات لم تُرفع', 'نعم — ' + ageText(sy.dirtySince, now), stale ? 'bad' : 'warn',
        stale ? 'مرّ وقت طويل دون رفع. افتح الاتصال أو ارفع يدوياً من «المزامنة السحابية».' : 'ستُرفع تلقائياً عند توفر الاتصال.');
    } else {
      add('pending', 'تغييرات لم تُرفع', 'لا شيء', 'ok');
    }
    add('lastsync', 'آخر رفع', ageText(sy.lastPush || sy.lastSync, now), (sy.lastPush || sy.lastSync) ? 'ok' : 'info');
  }
  if (Number(s.queueSize) > 0) add('queue', 'عمليات بانتظار الرفع', String(s.queueSize), 'warn', 'ستُنفَّذ عند عودة الاتصال.');
  if (Number(sy.conflicts) > 0) add('conflicts', 'تعارضات مزامنة', String(sy.conflicts), 'warn', 'راجعها من «المزامنة السحابية».');

  /* التخزين */
  const st = s.storage || {};
  if (st.percent != null) {
    add('storage', 'مساحة التخزين', fmtMB(st.usage) + ' من ' + fmtMB(st.quota) + ' (' + st.percent + '%)',
      st.percent >= 90 ? 'bad' : st.percent >= 75 ? 'warn' : 'ok',
      st.percent >= 75 ? 'المساحة تمتلئ — احذف صوراً قديمة أو انقل نسخة احتياطية خارجياً.' : '');
  }
  if (st.supported && st.persisted === false) add('persist', 'حماية التخزين من المسح', 'غير مفعّلة', 'warn', 'قد يمسح المتصفح البيانات عند نقص المساحة. ثبّت التطبيق على الشاشة الرئيسية.');
  else if (st.persisted) add('persist', 'حماية التخزين من المسح', 'مفعّلة', 'ok');

  /* سلامة البيانات */
  if (s.integrity) {
    const n = Number(s.integrity.total) || 0;
    add('integrity', 'سلامة البيانات', n ? n + ' ملاحظة' : 'سليمة', n ? 'warn' : 'ok', n ? 'راجع «فحص سلامة البيانات» أدناه لإصلاحها بأمان.' : '');
  }

  /* النسخ الاحتياطي */
  const last = Number(s.lastBackupAt) || 0;
  if (!last) add('backup', 'آخر نسخة احتياطية', 'لا توجد', 'bad', 'أنشئ نسخة من الإعدادات ← البيانات والنسخ الاحتياطي.');
  else add('backup', 'آخر نسخة احتياطية', ageText(last, now), now - last > BACKUP_WARN_DAYS * DAY ? 'warn' : 'ok',
    now - last > BACKUP_WARN_DAYS * DAY ? 'مرّ أكثر من أسبوع على آخر نسخة.' : '');

  /* التحديث دون اتصال */
  const sw = s.serviceWorker;
  if (sw && sw.supported === false) add('offline', 'العمل دون إنترنت', 'غير مدعوم في هذا المتصفح', 'warn');
  else if (sw && sw.supported) add('offline', 'العمل دون إنترنت', sw.controlled ? 'جاهز' : 'سيعمل بعد إعادة التحميل', sw.controlled ? 'ok' : 'info');

  if (last && s.lastExternalBackupAt === 0) add('external', 'نسخة خارج الجهاز', 'لم تُحفظ بعد', 'info', 'النسخ داخل الجهاز لا تحميك إن ضاع الهاتف — شارك نسخة إلى واتساب أو التخزين.');

  if (s.version) add('version', 'إصدار التطبيق', String(s.version), 'ok');

  const rank = { ok: 0, info: 0, warn: 1, bad: 2 };
  const worstN = items.reduce((m, i) => Math.max(m, rank[i.level] || 0), 0);
  const level = worstN === 2 ? 'bad' : worstN === 1 ? 'warn' : 'ok';
  return { level, items, worst: level };
}
