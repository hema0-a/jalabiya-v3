/* ==========================================================================
   auth.js — المصادقة (PIN + قفل المحاولات + الجلسة)
   ==========================================================================
   يعتمد على localStorage لـ:
     - V3_FAILED_ATTEMPTS (عدد محاولات PIN الفاشلة)
     - V3_LOCK_UNTIL      (timestamp نهاية القفل)
     - V3_SESSION         (كائن الجلسة { createdAt, expiresAt })
   🔒 قاعدة: أي تعديل هنا يحتاج مراجعة مزدوجة.
   ========================================================================== */

import { STORAGE_KEYS, LIMITS, DEFAULT_SETTINGS } from '../core/config.js';
import { verifyPin, isPinSet, setPin, clearPin, isLegacyHash } from './pin-crypto.js';

/* --- أدوات قراءة/كتابة آمنة --- */

/**
 * قراءة JSON بأمان.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * كتابة JSON.
 * @param {string} key
 * @param {*} value
 */
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* --- الوحدة --- */

export const auth = {
  /**
   * هل الحساب مقفل الآن؟
   * @returns {boolean}
   */
  isLocked() {
    const until = Number(localStorage.getItem(STORAGE_KEYS.V3_LOCK_UNTIL) || 0);
    return until > Date.now();
  },

  /**
   * الوقت المتبقي حتى انتهاء القفل (ms). صفر إن لم يكن مقفلاً.
   * @returns {number}
   */
  getLockRemainingMs() {
    const until = Number(localStorage.getItem(STORAGE_KEYS.V3_LOCK_UNTIL) || 0);
    const diff = until - Date.now();
    return diff > 0 ? diff : 0;
  },

  /**
   * عدد المحاولات الفاشلة الحالية.
   * @returns {number}
   */
  getAttempts() {
    return Number(localStorage.getItem(STORAGE_KEYS.V3_FAILED_ATTEMPTS) || 0);
  },

  /**
   * هل تم تعيين PIN من قبل؟
   * @returns {boolean}
   */
  hasPin() {
    return isPinSet();
  },

  /**
   * تصفير عدّاد المحاولات وإزالة القفل.
   * (داخلي — يُستدعى بعد نجاح التحقق)
   */
  _resetAttempts() {
    localStorage.removeItem(STORAGE_KEYS.V3_FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.V3_LOCK_UNTIL);
  },

  /**
   * تسجيل محاولة فاشلة + قفل عند الوصول للحد.
   * (داخلي)
   * @returns {{attempts:number, locked:boolean}}
   */
  _recordFailure() {
    const attempts = auth.getAttempts() + 1;
    localStorage.setItem(STORAGE_KEYS.V3_FAILED_ATTEMPTS, String(attempts));
    if (attempts >= LIMITS.maxPinAttempts) {
      /* مدة القفل تتضاعف مع كل محاولة فاشلة إضافية (30ث، 60ث، 120ث…) بسقف 15 دقيقة */
      const extra = Math.min(attempts - LIMITS.maxPinAttempts, 5);
      const seconds = Math.min(LIMITS.pinLockSeconds * Math.pow(2, extra), 15 * 60);
      const until = Date.now() + seconds * 1000;
      localStorage.setItem(STORAGE_KEYS.V3_LOCK_UNTIL, String(until));
      return { attempts, locked: true, seconds };
    }
    return { attempts, locked: false };
  },

  /**
   * تعيين PIN جديد (وحفظه) + تصفير المحاولات.
   * @param {string|number} pin
   * @returns {Promise<boolean>}
   */
  async setPinAndSave(pin) {
    await setPin(pin);
    auth._resetAttempts();
    return true;
  },

  /**
   * محاولة فتح القفل بـ PIN.
   * @param {string|number} pin
   * @returns {Promise<{
   *   success: boolean,
   *   reason?: 'no-pin'|'locked'|'wrong-pin',
   *   remainingMs?: number,
   *   attempts?: number,
   *   locked?: boolean
   * }>}
   */
  async unlock(pin) {
    if (!isPinSet()) {
      return { success: false, reason: 'no-pin' };
    }

    if (auth.isLocked()) {
      return {
        success: false,
        reason: 'locked',
        remainingMs: auth.getLockRemainingMs(),
      };
    }

    const storedHash = localStorage.getItem(STORAGE_KEYS.V3_PIN_HASH);
    const storedSalt = localStorage.getItem(STORAGE_KEYS.V3_PIN_SALT);
    const ok = await verifyPin(pin, storedHash, storedSalt);

    if (ok) {
      auth._resetAttempts();
      auth.setSession();
      /* ترقية صامتة: hash قديم (SHA-256) → PBKDF2 بعد نجاح التحقق */
      if (isLegacyHash(storedHash)) {
        try { await setPin(pin); } catch (e) { /* الترقية اختيارية */ }
      }
      return { success: true };
    }

    const { attempts, locked, seconds } = auth._recordFailure();
    return {
      success: false,
      reason: 'wrong-pin',
      attempts,
      locked,
      remainingMs: locked ? (seconds || LIMITS.pinLockSeconds) * 1000 : 0,
    };
  },

  /**
   * إنشاء جلسة جديدة.
   * @param {number} [durationHours] — المدة من إعدادات المستخدم؛ الافتراضي من DEFAULT_SETTINGS.
   * @returns {{createdAt:number, expiresAt:number}}
   */
  setSession(durationHours) {
    const custom = Number(durationHours);
    const hours = (isFinite(custom) && custom > 0)
      ? custom
      : (DEFAULT_SETTINGS.security.sessionDurationHours || 24);
    const now = Date.now();
    const session = {
      createdAt: now,
      expiresAt: now + hours * 3600 * 1000,
    };
    writeJSON(STORAGE_KEYS.V3_SESSION, session);
    return session;
  },

  /**
   * جلب الجلسة الحالية إن كانت صالحة.
   * @returns {{createdAt:number, expiresAt:number}|null}
   */
  getSession() {
    const s = readJSON(STORAGE_KEYS.V3_SESSION, null);
    if (!s || typeof s.expiresAt !== 'number') return null;
    if (s.expiresAt <= Date.now()) return null;
    return s;
  },

  /**
   * حذف الجلسة.
   */
  clearSession() {
    localStorage.removeItem(STORAGE_KEYS.V3_SESSION);
  },

  /**
   * تغيير PIN (يتحقق من القديم أولاً).
   * @param {string|number} oldPin
   * @param {string|number} newPin
   * @returns {Promise<boolean>}
   */
  async changePin(oldPin, newPin) {
    /* نفس حماية unlock: لا تخمين مفتوح للرقم القديم عبر شاشة التغيير */
    if (auth.isLocked()) return false;
    const storedHash = localStorage.getItem(STORAGE_KEYS.V3_PIN_HASH);
    const storedSalt = localStorage.getItem(STORAGE_KEYS.V3_PIN_SALT);
    const ok = await verifyPin(oldPin, storedHash, storedSalt);
    if (!ok) {
      auth._recordFailure();
      return false;
    }
    auth._resetAttempts();
    await setPin(newPin);
    return true;
  },

  /**
   * تصفير كامل (للاختبار أو "إعادة تعيين").
   * يحذف: PIN + الجلسة + المحاولات + القفل.
   */
  reset() {
    auth._resetAttempts();
    auth.clearSession();
    clearPin();
  },
};
