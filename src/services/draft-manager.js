/* ==========================================================================
   draft-manager.js — إدارة مسودات النماذج (Autosave)
   ==========================================================================
   - يحفظ مسودة النموذج في localStorage أثناء الكتابة.
   - يسترجعها عند إعادة فتح النموذج.
   - صلاحية افتراضية 24 ساعة (قابلة للتعديل).
   - static imports فقط (القاعدة 14).
   ========================================================================== */

import { STORAGE_KEYS } from '../core/config.js';

/* ==========================================================================
   1. الثوابت
   ========================================================================== */

/** بادئة مفاتيح المسودات في localStorage. */
const PREFIX = 'jalabiya_v3_draft_';

/** الصلاحية الافتراضية (24 ساعة بالمللي ثانية). */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/* ==========================================================================
   2. أدوات داخلية
   ========================================================================== */

/**
 * بناء مفتاح كامل من المفتاح القصير.
 * @param {string} key
 * @returns {string}
 */
function fullKey(key) {
  return PREFIX + String(key || '').trim();
}

/**
 * هل localStorage متاح؟
 * @returns {boolean}
 */
function isAvailable() {
  try {
    const k = '__draft_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * قراءة JSON بأمان.
 * @param {string} raw
 * @returns {Object|null}
 */
function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   3. API العام
   ========================================================================== */

/**
 * حفظ مسودة.
 * @param {string} key — معرّف المسودة (مثل 'order-form')
 * @param {Object} data — بيانات المسودة (قابلة للتحويل إلى JSON)
 * @param {Object} [options]
 * @param {number} [options.ttl] — الصلاحية (ms) — افتراضي 24 ساعة
 * @returns {boolean} نجاح الحفظ
 * @example
 *   draft.save('order-form', { customerId: 'x', items: [...] });
 */
export function save(key, data, options = {}) {
  if (!key) return false;
  if (!isAvailable()) return false;

  const ttl = Number(options.ttl) > 0 ? Number(options.ttl) : DEFAULT_TTL_MS;

  try {
    const payload = {
      data,
      savedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    localStorage.setItem(fullKey(key), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('[Draft] save failed:', e);
    return false;
  }
}

/**
 * قراءة مسودة.
 * @param {string} key
 * @returns {Object|null} البيانات، أو null إن لم توجد/انتهت صلاحيتها
 * @example
 *   const d = draft.get('order-form');
 *   if (d) console.log(d.customerId);
 */
export function get(key) {
  if (!key) return null;
  if (!isAvailable()) return null;

  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;

    const payload = safeParse(raw);
    if (!payload || typeof payload !== 'object') return null;

    /* فحص الصلاحية */
    if (typeof payload.expiresAt === 'number' && payload.expiresAt < Date.now()) {
      /* منتهية الصلاحية → احذفها */
      localStorage.removeItem(fullKey(key));
      return null;
    }

    return payload.data ?? null;
  } catch (e) {
    console.warn('[Draft] get failed:', e);
    return null;
  }
}

/**
 * هل توجد مسودة صالحة؟
 * @param {string} key
 * @returns {boolean}
 */
export function has(key) {
  return get(key) !== null;
}

/**
 * حذف مسودة.
 * @param {string} key
 * @returns {boolean} نجاح الحذف
 */
export function clear(key) {
  if (!key) return false;
  if (!isAvailable()) return false;

  try {
    localStorage.removeItem(fullKey(key));
    return true;
  } catch (e) {
    console.warn('[Draft] clear failed:', e);
    return false;
  }
}

/**
 * حذف كل المسودات (للتنظيف).
 * @returns {number} عدد المسودات المحذوفة
 */
export function clearAll() {
  if (!isAvailable()) return 0;

  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return keys.length;
  } catch (e) {
    console.warn('[Draft] clearAll failed:', e);
    return 0;
  }
}

/**
 * قائمة المسودات (معلومات وصفية فقط).
 * @returns {Array<{key:string, savedAt:number, expiresAt:number}>}
 */
export function list() {
  if (!isAvailable()) return [];

  try {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const payload = safeParse(localStorage.getItem(k));
      if (!payload) continue;
      out.push({
        key: k.slice(PREFIX.length),
        savedAt: payload.savedAt || 0,
        expiresAt: payload.expiresAt || 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/* ==========================================================================
   4. مُغلِّف بسيط (اختياري — للاستخدام المتقدم)
   ========================================================================== */

/**
 * إنشاء مُغلِّف مسودة لمفتاح معيّن.
 * @param {string} key
 * @param {Object} [options] — نفس خيارات save
 * @returns {{save:Function, get:Function, has:Function, clear:Function}}
 * @example
 *   const d = createDraft('order-form');
 *   d.save(data);
 *   const data2 = d.get();
 */
export function createDraft(key, options = {}) {
  return {
    save: (data, opts = {}) => save(key, data, { ...options, ...opts }),
    get: () => get(key),
    has: () => has(key),
    clear: () => clear(key),
  };
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { PREFIX, DEFAULT_TTL_MS };
