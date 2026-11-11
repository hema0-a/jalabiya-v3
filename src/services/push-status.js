/* ==========================================================================
   push-status.js — تشخيص الإشعارات الحقيقية بالعربية (v3.18.0) — دوال نقية بلا DOM ولا شبكة
   ==========================================================================
   يجمع حالة الجهاز (محلية) وحالة السحابة (ما كتبه التطبيق والمُرسِل في Firestore) في نموذج واحد تعرضه بطاقة
   «🩺 حالة الإشعارات» في الإعدادات، ويترجم أخطاء التفعيل الإنجليزية إلى سبب وحلّ مفهومين.
   لا يغني عن docs/PUSH-SETUP.md لكنه يغني عن فتح GitHub لمعرفة هل الإشعارات تعمل.
   ========================================================================== */

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

/** «منذ ...» بالعربية (الآن · دقائق · ساعات · أيام). */
export function relTime(ms, now = Date.now()) {
  const t = Number(ms);
  if (!(t > 0)) return '';
  const d = Math.max(0, now - t);
  if (d < MIN) return 'الآن';
  if (d < HOUR) { const m = Math.floor(d / MIN); return m === 1 ? 'منذ دقيقة' : m === 2 ? 'منذ دقيقتين' : 'منذ ' + m + (m <= 10 ? ' دقائق' : ' دقيقة'); }
  if (d < DAY) { const h = Math.floor(d / HOUR); return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : 'منذ ' + h + (h <= 10 ? ' ساعات' : ' ساعة'); }
  const dd = Math.floor(d / DAY);
  return dd === 1 ? 'منذ يوم' : dd === 2 ? 'منذ يومين' : 'منذ ' + dd + (dd <= 10 ? ' أيام' : ' يوماً');
}

/**
 * يترجم سبب/رسالة فشل التفعيل إلى {title, fix} بالعربية.
 * @param {string} [reason] — مثل 'permission-denied' · 'no-token' · 'error'
 * @param {string} [message] — نص الخطأ الخام (إنجليزي غالباً)
 */
export function explainPushError(reason, message) {
  const m = String(message || '');
  const has = (re) => re.test(m);
  if (has(/missing or insufficient permissions|permission[- ]denied.*firestore|PERMISSION_DENIED/i) && !/notification/i.test(m)) {
    return { title: 'قواعد Firestore المنشورة لا تسمح بالكتابة', fix: 'انسخ firestore.rules إلى Firebase ← Firestore ← Rules ثم Publish (فيها مسار users_v3/{uid}/push).' };
  }
  if (has(/applicationServerKey|vapid|invalid.*key|Invalid raw ECDSA/i)) {
    return { title: 'مفتاح VAPID غير صحيح', fix: 'انسخه من Firebase ← Project settings ← Cloud Messaging ← Web Push certificates (يبدأ بحرف B) بلا مسافات.' };
  }
  if (has(/messaging\/token-subscribe-failed|FCM Registration API|fcmregistrations|API has not been used|is disabled/i)) {
    return { title: 'واجهة FCM غير مفعّلة في مشروعك', fix: 'فعّل «Firebase Cloud Messaging API» و«FCM Registration API» من Google Cloud ← APIs & Services.' };
  }
  if (has(/messaging\/permission-blocked|notifications? .*blocked|permission.*(denied|blocked)/i) || reason === 'permission-denied') {
    return { title: 'إذن الإشعارات مرفوض', fix: 'من إعدادات المتصفح ← إعدادات الموقع ← الإشعارات ← سماح، ثم أعد المحاولة.' };
  }
  if (has(/messaging\/unsupported-browser|not supported|service worker/i) || reason === 'unsupported') {
    return { title: 'المتصفح لا يدعم الإشعارات الحقيقية', fix: 'استخدم Chrome على أندرويد، أو على iPhone ثبّت التطبيق على الشاشة الرئيسية (iOS 16.4+).' };
  }
  if (has(/failed to fetch|network|offline|ERR_/i)) {
    return { title: 'تعذّر الاتصال بالإنترنت', fix: 'تأكد من الاتصال ثم أعد المحاولة.' };
  }
  if (reason === 'signed-out' || has(/لا يوجد حساب مزامنة/)) {
    return { title: 'لا يوجد حساب مزامنة مسجَّل الدخول', fix: 'سجّل الدخول من «المزامنة السحابية» أولاً.' };
  }
  if (reason === 'no-vapid') return { title: 'مفتاح VAPID مفقود', fix: 'الصق المفتاح العام في الخانة أعلاه.' };
  if (reason === 'no-token') return { title: 'لم يُصدَر رمز للجهاز', fix: 'تأكد من صحة مفتاح VAPID ومن تفعيل واجهات FCM، ثم أعد المحاولة.' };
  return { title: 'خطأ غير معروف أثناء التفعيل', fix: 'أرسل نص الخطأ بين القوسين لمن يساعدك في الإعداد.' };
}

/** نص الخطأ الكامل للإشعار المنبثق: «السبب — الحل [الخام]». */
export function formatPushError(reason, message) {
  const e = explainPushError(reason, message);
  const raw = String(message || '').slice(0, 160);
  return e.title + ' — ' + e.fix + (raw ? ' [' + raw + ']' : '');
}

const ST = { ok: 'ok', warn: 'warn', bad: 'bad', idle: 'idle' };
export const STATE_ICON = Object.freeze({ ok: '✅', warn: '⚠️', bad: '❌', idle: '⚪' });

/**
 * @param {{local:{supported:boolean, permission:string, registered:boolean, signedIn:boolean},
 *          cloud:null|{ok:boolean, message?:string, hasMyToken?:boolean|null, tokens?:number, digestAt?:number,
 *                      lastSentDay?:string, lastCheckAt?:number, testHandledAt?:number},
 *          now?:number}} a
 * @returns {{level:'ok'|'warn'|'bad', rows:Array<{id:string,label:string,value:string,state:string,hint?:string}>, next:string}}
 */
export function buildPushStatus(a) {
  const now = Number((a && a.now) || Date.now());
  const local = (a && a.local) || {};
  const cloud = (a && a.cloud) || null;
  const rows = [];
  const add = (id, label, state, value, hint) => rows.push({ id, label, state, value, ...(hint ? { hint } : {}) });

  add('support', 'دعم الجهاز', local.supported ? ST.ok : ST.bad,
    local.supported ? 'مدعوم' : 'غير مدعوم',
    'استخدم Chrome على أندرويد، أو ثبّت التطبيق على الشاشة الرئيسية في iPhone (iOS 16.4+).');

  const perm = local.permission;
  add('permission', 'إذن الإشعارات', perm === 'granted' ? ST.ok : perm === 'denied' ? ST.bad : ST.warn,
    perm === 'granted' ? 'ممنوح' : perm === 'denied' ? 'مرفوض' : perm === 'unsupported' ? 'غير متاح' : 'لم يُطلب بعد',
    perm === 'denied' ? 'فعّل الإشعارات للموقع من إعدادات المتصفح ثم أعد التفعيل.' : 'اضغط «تفعيل على هذا الجهاز» وامنح الإذن.');

  add('signin', 'المزامنة السحابية', local.signedIn ? ST.ok : ST.bad,
    local.signedIn ? 'مسجَّل الدخول' : 'غير مسجَّل',
    'سجّل الدخول من «المزامنة السحابية» أولاً.');

  if (!local.registered) {
    add('device', 'هذا الجهاز', ST.warn, 'غير مفعّل', 'اضغط «تفعيل على هذا الجهاز».');
  } else if (!cloud || cloud.ok === false) {
    add('device', 'هذا الجهاز', ST.idle, 'مفعّل (تعذّر التحقق من السحابة)');
  } else if (cloud.hasMyToken === false) {
    add('device', 'هذا الجهاز', ST.bad, 'مفعّل هنا لكن رمزه غير موجود في السحابة', 'أوقف الإشعارات على هذا الجهاز ثم فعّلها من جديد.');
  } else {
    add('device', 'هذا الجهاز', ST.ok, 'مفعّل' + (cloud.tokens > 1 ? ' (' + cloud.tokens + ' أجهزة على الحساب)' : ''));
  }

  if (!cloud) {
    add('digest', 'آخر رفع للملخص', ST.idle, 'اضغط «فحص الحالة»');
    add('server', 'آخر فحص من الخادم', ST.idle, 'اضغط «فحص الحالة»');
    add('daily', 'آخر إشعار يومي', ST.idle, '—');
  } else if (cloud.ok === false) {
    const e = explainPushError('', cloud.message);
    add('cloud', 'قراءة السحابة', ST.warn, e.title, e.fix);
  } else {
    const da = Number(cloud.digestAt) || 0;
    if (!da) add('digest', 'آخر رفع للملخص', ST.warn, 'لم يُرفع ملخص بعد', 'اضغط «تحديث الملخص الآن».');
    else if (now - da > 3 * DAY) add('digest', 'آخر رفع للملخص', ST.warn, relTime(da, now), 'افتح التطبيق أو اضغط «تحديث الملخص الآن» ليعكس الإشعار بياناتك.');
    else add('digest', 'آخر رفع للملخص', ST.ok, relTime(da, now));

    const lc = Number(cloud.lastCheckAt) || 0;
    if (!lc) add('server', 'آخر فحص من الخادم', ST.warn, 'لم يعمل الخادم بعد', 'GitHub ← Actions ← Push cron ← Run workflow (وتأكد من سرّ FIREBASE_SERVICE_ACCOUNT).');
    else if (now - lc <= 100 * MIN) add('server', 'آخر فحص من الخادم', ST.ok, relTime(lc, now));
    else if (now - lc <= 6 * HOUR) add('server', 'آخر فحص من الخادم', ST.warn, relTime(lc, now), 'GitHub قد يؤخّر التشغيل المجدول؛ إن طال التأخير شغّل Push cron يدوياً.');
    else add('server', 'آخر فحص من الخادم', ST.bad, relTime(lc, now), 'الجدولة متوقفة (GitHub يوقفها بعد 60 يوماً بلا نشاط): Actions ← Push cron ← Run workflow.');

    const ls = String(cloud.lastSentDay || '');
    add('daily', 'آخر إشعار يومي', ls ? ST.ok : ST.idle, ls ? ls : 'لم يُرسل بعد');
  }

  const level = rows.some((r) => r.state === ST.bad) ? 'bad' : rows.some((r) => r.state === ST.warn) ? 'warn' : 'ok';
  const firstBad = rows.find((r) => r.state === ST.bad && r.hint) || rows.find((r) => r.state === ST.warn && r.hint);
  return { level, rows, next: firstBad ? firstBad.hint : '' };
}
