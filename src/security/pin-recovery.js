/* ==========================================================================
   pin-recovery.js — استرجاع الدخول عند نسيان الرقم السري دون مسح البيانات
   ==========================================================================
   صاحب حساب المزامنة (بريد + كلمة مرور Firebase) هو صاحب الورشة، فتسجيل الدخول به
   يُثبت الملكية: يُزال الرقم السري وتُصفَّر المحاولات والجلسة، وتبقى كل البيانات.
   بعدها يعيّن المستخدم رقماً جديداً من الإعدادات › الأمان.
   (بديل «مسح بيانات الجهاز» الذي يبقى متاحاً لمن لا حساب مزامنة له.)
   ========================================================================== */

import { clearPin } from './pin-crypto.js';
import { auth } from './auth.js';

/**
 * @param {string} email
 * @param {string} password
 * @param {Object} [deps]
 * @param {Function} [deps.login] — (email, password) → Promise<{ok, error?}>؛ للاختبار
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function recoverPinWithCloud(email, password, deps = {}) {
  const e = String(email == null ? '' : email).trim();
  const p = String(password == null ? '' : password);
  if (!e || !p) return { success: false, error: 'أدخل البريد الإلكتروني وكلمة المرور' };

  let res;
  try {
    const login = deps.login || (await import('../sync/auth-sync.js')).login;
    res = await login(e, p);
  } catch (err) {
    return { success: false, error: (err && err.message) || 'تعذّر الاتصال — تحقق من الإنترنت' };
  }
  if (!res || !res.ok) return { success: false, error: (res && res.error) || 'تعذّر تسجيل الدخول' };

  clearPin();
  auth._resetAttempts();
  try { auth.clearSession(); } catch (err) { /* اختياري */ }
  return { success: true };
}
