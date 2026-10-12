/* ==========================================================================
   pin-recovery.js — استرجاع الدخول عند نسيان الرقم السري دون مسح البيانات
   ==========================================================================
   صاحب حساب المزامنة (بريد + كلمة مرور Firebase) هو صاحب الورشة، فتسجيل الدخول به
   يُثبت الملكية: يُزال الرقم السري وتُصفَّر المحاولات والجلسة، وتبقى كل البيانات.

   ⚠️ v3.3.48: لا يكفي أن يكون الحساب «صالحاً» — يجب أن يكون هو الحساب الذي ربطه هذا الجهاز
   في جلسة مفتوحة (getOwnerUid). وإلا لأنشأ أي شخص يحمل الجوال حساب Firebase جديداً
   (التسجيل يعمل عبر مفتاح الواجهة العلني) ودخل به متجاوزاً القفل.
   حساب غير مطابق/جهاز غير مربوط ← يُسجَّل خروجه فوراً ويُرفض الاسترجاع.
   بعدها يعيّن المستخدم رقماً جديداً من الإعدادات › الأمان.
   (بديل «مسح بيانات الجهاز» الذي يبقى متاحاً لمن لا حساب مزامنة له.)
   ========================================================================== */

import { clearPin } from './pin-crypto.js';
import { auth } from './auth.js';

/**
 * @param {string} email
 * @param {string} password
 * @param {Object} [deps]
 * @param {Function} [deps.login] — (email, password) → Promise<{ok, user?, error?}>؛ للاختبار
 * @param {Function} [deps.getOwnerUid] — () → uid|null؛ للاختبار
 * @param {Function} [deps.logout] — () → Promise؛ للاختبار
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function recoverPinWithCloud(email, password, deps = {}) {
  const e = String(email == null ? '' : email).trim();
  const p = String(password == null ? '' : password);
  if (!e || !p) return { success: false, error: 'أدخل البريد الإلكتروني وكلمة المرور' };

  let res;
  let authMod = null;
  try {
    if (!deps.login || !deps.getOwnerUid || !deps.logout) authMod = await import('../sync/auth-sync.js');
    const login = deps.login || authMod.login;
    res = await login(e, p);
  } catch (err) {
    return { success: false, error: (err && err.message) || 'تعذّر الاتصال — تحقق من الإنترنت' };
  }
  if (!res || !res.ok) return { success: false, error: (res && res.error) || 'تعذّر تسجيل الدخول' };

  /* الحساب يجب أن يطابق «صاحب الجهاز» المربوط من جلسة مفتوحة */
  const getOwner = deps.getOwnerUid || authMod.getOwnerUid;
  const doLogout = deps.logout || authMod.logout;
  const owner = getOwner();
  const uid = res.user && res.user.uid;
  if (!owner || !uid || uid !== owner) {
    try { await doLogout(); } catch (err) { /* اختياري */ }
    return {
      success: false,
      error: !owner
        ? 'الاسترجاع بالحساب غير متاح: لم يُربط هذا الجهاز بحساب مزامنة بعد. استخدم «مسح بيانات الجهاز» ثم سجّل الدخول ونزّل بياناتك من السحابة.'
        : 'هذا الحساب ليس حساب هذه الورشة على هذا الجهاز',
    };
  }

  clearPin();
  auth._resetAttempts();
  try { auth.clearSession(); } catch (err) { /* اختياري */ }
  return { success: true };
}
