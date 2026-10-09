/* ==========================================================================
   firebase-config.js — التحقق من إعدادات Firebase + تحميل SDK
   ==========================================================================
   لا يُهيّئ Firebase تلقائياً — يتحقق أولاً من وجود الإعدادات.
   تحميل Firebase بطريقة Lazy — لا يُحمَّل SDK إن لم يُستخدَم.
   ========================================================================== */

import { FIREBASE_CONFIG } from '../core/config.js';

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

/* --- حالة التهيئة (Singleton) --- */
let _app = null;
let _auth = null;
let _db = null;
let _loadPromise = null;

/**
 * هل الإعدادات مكتملة؟
 * @returns {boolean}
 */
export function isConfigured() {
  return REQUIRED_KEYS.every((k) => {
    const v = FIREBASE_CONFIG[k];
    return typeof v === 'string' && v.length > 0;
  });
}

/**
 * قائمة المفاتيح الناقصة (للتشخيص).
 * @returns {string[]}
 */
export function missingKeys() {
  return REQUIRED_KEYS.filter((k) => {
    const v = FIREBASE_CONFIG[k];
    return !(typeof v === 'string' && v.length > 0);
  });
}

/**
 * إرجاع نسخة من الإعدادات (أو null).
 * @returns {Object|null}
 */
export function getConfig() {
  return isConfigured() ? { ...FIREBASE_CONFIG } : null;
}

/**
 * تحميل Firebase SDK + تهيئة التطبيق (Lazy، يُنفَّذ مرة واحدة فقط).
 * @returns {Promise<{app:Object, auth:Object, db:Object}>}
 * @throws {Error} إذا كانت الإعدادات ناقصة
 */
export async function loadFirebase() {
  if (_app && _auth && _db) {
    return { app: _app, auth: _auth, db: _db };
  }
  if (_loadPromise) return _loadPromise;

  if (!isConfigured()) {
    throw new Error('[firebase] config incomplete — missing: ' + missingKeys().join(', '));
  }

  _loadPromise = (async () => {
    const VERSION = '10.12.0';
    const BASE = 'https://www.gstatic.com/firebasejs/' + VERSION + '/';

    const [appMod, authMod, fsMod] = await Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-firestore.js'),
    ]);

    _app = appMod.initializeApp(FIREBASE_CONFIG);
    _auth = authMod.getAuth(_app);
    _db = fsMod.getFirestore(_app);

    return { app: _app, auth: _auth, db: _db };
  })();

  /* إن فشل التحميل (مثلاً بلا إنترنت) نمسح الوعد المرفوض ليُعاد المحاولة لاحقاً
     بدل بقاء المزامنة معطّلة حتى إعادة تحميل الصفحة. */
  _loadPromise.catch(() => { _loadPromise = null; });

  return _loadPromise;
}

/**
 * إعادة تعيين الحالة (للاستخدام في الاختبار).
 */
export function _reset() {
  _app = null;
  _auth = null;
  _db = null;
  _loadPromise = null;
}
