/* ==========================================================================
   save-error.js — رسالة فشل الحفظ المفهومة للمستخدم (v3.4.7)
   ==========================================================================
   كانت شاشات الحفظ تعرض نص الخطأ الخام: عند امتلاء تخزين الهاتف تظهر «[idb] write aborted»
   فيظن صاحب الورشة أن التطبيق معطوب بينما السبب مساحة الهاتف. هذه الدالة النقية تحوّل الأخطاء
   المعروفة إلى جملة عربية بإجراء واضح، وتُبقي أي رسالة عربية مكتوبة أصلاً للمستخدم كما هي،
   وتُلحق تفصيلاً تقنياً قصيراً بالأخطاء المجهولة ليسهل الإبلاغ عنها.
   ========================================================================== */

/** @param {*} err @returns {string} نص الخطأ الخام (آمن لأي نوع). */
function rawMessage(err) {
  if (err === null || err === undefined) return '';
  if (typeof err === 'string') return err;
  return String(err.message || '');
}

const HAS_ARABIC = /[\u0600-\u06FF]/;

/**
 * هل الخطأ تجاوز حصة التخزين (امتلاء مساحة الهاتف/المتصفح)؟
 * @param {*} err
 * @returns {boolean}
 */
export function isQuotaError(err) {
  if (!err || typeof err !== 'object') return /quota/i.test(rawMessage(err));
  return err.name === 'QuotaExceededError' || err.code === 22 || /quota/i.test(rawMessage(err));
}

/**
 * وصف عربي مفهوم لخطأ حفظ.
 * @param {*} err
 * @returns {string}
 */
export function describeSaveError(err) {
  const msg = rawMessage(err);
  const code = err && typeof err === 'object' ? err.code : undefined;
  const name = err && typeof err === 'object' ? err.name : '';

  if (isQuotaError(err)) {
    return 'مساحة التخزين في هاتفك ممتلئة، فلم يُحفظ هذا السجل. احذف صوراً أو ملفات من الهاتف ثم أعد المحاولة.';
  }
  if (code === 'media-writes-disabled') {
    return 'هذا الجهاز لم يُحدَّث بعد لحفظ صور الطلبات. حدّث التطبيق ثم أعد المحاولة.';
  }
  if (code === 'client-outdated') {
    return 'نسخة التطبيق على هذا الجهاز أقدم من المطلوبة. حدّث التطبيق ثم أعد المحاولة.';
  }
  if (/blocked by another tab/i.test(msg)) {
    return 'التطبيق مفتوح في نافذة أخرى تمنع التحديث. أغلق النوافذ الأخرى ثم أعد المحاولة.';
  }
  if (name === 'InvalidStateError' || /connection is closing|database.*clos|DatabaseClosed/i.test(msg)) {
    return 'انقطع اتصال التطبيق بقاعدة البيانات. أعد تحميل الصفحة ثم أعد المحاولة.';
  }
  if (/\[idb\] (write|batch) (failed|aborted)/i.test(msg) || name === 'AbortError') {
    return 'تعذّر إكمال الكتابة في قاعدة البيانات، ولم يُحفظ هذا السجل. أعد المحاولة، وإن تكرر فأعد تشغيل التطبيق.';
  }
  /* رسالة عربية كتبها التطبيق نفسه للمستخدم (مثل «الرصيد لا يكفي») تُعرض كما هي */
  if (msg && HAS_ARABIC.test(msg)) return msg;
  const tech = (msg || name || 'خطأ غير معروف').slice(0, 80);
  return 'حدث خطأ غير متوقع ولم يُحفظ السجل (' + tech + ').';
}

/**
 * رسالة جاهزة للعرض: «<بادئة>: <وصف>».
 * @param {*} err
 * @param {string} [prefix='فشل الحفظ']
 * @returns {string}
 */
export function saveFailMessage(err, prefix = 'فشل الحفظ') {
  return prefix + ': ' + describeSaveError(err);
}
