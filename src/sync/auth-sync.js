/* ==========================================================================
   auth-sync.js — مصادقة Firebase (Email/Password)
   ==========================================================================
   لا يُنفِّذ أي شيء عند الاستيراد.
   API:
     login(email, password)  → Promise<user>
     logout()                → Promise<void>
     current()               → Promise<user|null>
     isConfigured()          → boolean
     onAuthChange(cb)        → unsubscribe
   ========================================================================== */

import { loadFirebase, isConfigured as fbIsConfigured } from './firebase-config.js';

/* --- حالة الكاش --- */
let _currentUser = null;
let _authModule = null;

/**
 * هل Firebase مُهيّأ؟
 * @returns {boolean}
 */
export function isConfigured() {
  return fbIsConfigured();
}

/**
 * تحميل Firebase + auth module (Lazy).
 * @returns {Promise<{auth:Object, authMod:Object}>}
 */
async function ensureAuth() {
  const { auth } = await loadFirebase();
  if (!_authModule) {
    const VERSION = '10.12.0';
    _authModule = await import(
      'https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-auth.js'
    );
  }
  return { auth, authMod: _authModule };
}

/**
 * ترجمة رسائل Firebase إلى العربية.
 * @param {Error} err
 * @returns {string}
 */
function translateError(err) {
  const code = err && err.code ? err.code : '';
  const map = {
    'auth/invalid-email':         'البريد الإلكتروني غير صالح',
    'auth/user-disabled':         'هذا الحساب معطَّل',
    'auth/user-not-found':        'لا يوجد حساب بهذا البريد',
    'auth/wrong-password':        'كلمة المرور غير صحيحة',
    'auth/invalid-credential':    'البريد أو كلمة المرور غير صحيحة',
    'auth/too-many-requests':     'محاولات كثيرة، حاول لاحقاً',
    'auth/network-request-failed':'خطأ في الشبكة',
    'auth/email-already-in-use':  'البريد مستخدم بالفعل',
    'auth/weak-password':         'كلمة المرور ضعيفة (6 أحرف على الأقل)',
    'auth/operation-not-allowed': 'طريقة تسجيل الدخول غير مفعَّلة',
  };
  return map[code] || (err && err.message ? err.message : 'خطأ غير معروف');
}

/**
 * تسجيل الدخول.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok:boolean, user?:Object, error?:string}>}
 */
export async function login(email, password) {
  if (!isConfigured()) {
    return { ok: false, error: 'Firebase غير مُهيّأ' };
  }
  if (!email || !password) {
    return { ok: false, error: 'البريد وكلمة المرور مطلوبان' };
  }

  try {
    const { auth, authMod } = await ensureAuth();
    const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
    _currentUser = cred.user;
    return { ok: true, user: cred.user };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/**
 * تسجيل الخروج.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function logout() {
  if (!isConfigured()) return { ok: true };
  try {
    const { auth, authMod } = await ensureAuth();
    await authMod.signOut(auth);
    _currentUser = null;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/**
 * المستخدم الحالي (يقرأ من Firebase).
 * @returns {Promise<Object|null>}
 */
export async function current() {
  if (!isConfigured()) return null;
  try {
    const { auth } = await ensureAuth();
    _currentUser = auth.currentUser || null;
    return _currentUser;
  } catch {
    return null;
  }
}

/**
 * مراقبة تغيّر حالة المصادقة.
 * @param {Function} callback — (user|null) => void
 * @returns {Function} unsubscribe
 */
export function onAuthChange(callback) {
  if (!isConfigured() || typeof callback !== 'function') {
    return () => {};
  }
  let unsub = () => {};
  (async () => {
    try {
      const { auth, authMod } = await ensureAuth();
      unsub = authMod.onAuthStateChanged(auth, (user) => {
        _currentUser = user || null;
        callback(user || null);
      });
    } catch (e) {
      console.warn('[auth-sync] onAuthChange failed:', e);
    }
  })();
  return () => { try { unsub(); } catch {} };
}

/**
 * معلومات مختصرة عن المستخدم الحالي (كاش).
 * @returns {{uid:string, email:string, displayName:string}|null}
 */
export function getUserInfo() {
  if (!_currentUser) return null;
  return {
    uid: _currentUser.uid || '',
    email: _currentUser.email || '',
    displayName: _currentUser.displayName || '',
  };
}
