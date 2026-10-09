/* ==========================================================================
   pin-crypto.js — تشفير PIN (SHA-256 + Salt)
   ==========================================================================
   يعتمد على WebCrypto (crypto.subtle) — متوفر في كل المتصفحات الحديثة على HTTPS.
   لا مكتبات خارجية.
   🔒 قاعدة: أي تعديل هنا يحتاج مراجعة مزدوجة.
   ========================================================================== */

import { STORAGE_KEYS } from '../core/config.js';

/* --- عدد بايتات الملح --- */
const SALT_BYTES = 16;

/* --- PBKDF2 (v2): يُبطئ التخمين خارج التطبيق لو سُرق محتوى localStorage ---
   الرقم من 4 خانات (10,000 احتمال) فالـ SHA-256 المفرد يُكسر في أجزاء من الثانية. */
const PBKDF2_ITERATIONS = 200000;
const V2_PREFIX = 'v2$';

/* --- عدد البايتات المتوقعة من SHA-256 --- */
const SHA256_HEX_LEN = 64;

/**
 * تحويل ArrayBuffer إلى سلسلة hex.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * توليد ملح عشوائي آمن تشفيرياً (16 بايت → 32 حرف hex).
 * @returns {string}
 */
export function generateSalt() {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * حساب SHA-256 لـ (salt + ':' + pin) وإرجاعه كـ hex.
 * @param {string|number} pin
 * @param {string} salt
 * @returns {Promise<string>} 64 حرف hex
 */
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(buffer);
}

/**
 * مقارنة نصّين بزمن ثابت (لا تتوقف عند أول اختلاف).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * hash من الجيل الثاني: PBKDF2-SHA256 → 'v2$' + hex.
 * @param {string|number} pin
 * @param {string} salt
 * @returns {Promise<string>}
 */
export async function hashPinV2(pin, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(String(salt)), iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return V2_PREFIX + bufferToHex(bits);
}

/**
 * هل الـ hash المحفوظ من الجيل القديم (SHA-256 مفرد) ويحتاج ترقية؟
 * @param {string} hash
 * @returns {boolean}
 */
export function isLegacyHash(hash) {
  return typeof hash === 'string' && hash.length > 0 && !hash.startsWith(V2_PREFIX);
}

/**
 * التحقق من PIN مقابل hash + salt (يدعم الجيلين: v2 PBKDF2 والقديم SHA-256).
 * @param {string|number} pin
 * @param {string} hash
 * @param {string} salt
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, hash, salt) {
  if (!hash || !salt) return false;
  const computed = isLegacyHash(hash) ? await hashPin(pin, salt) : await hashPinV2(pin, salt);
  return safeEqual(computed, hash);
}

/**
 * هل هناك PIN محفوظ؟
 * @returns {boolean}
 */
export function isPinSet() {
  return !!(localStorage.getItem(STORAGE_KEYS.V3_PIN_HASH)
         && localStorage.getItem(STORAGE_KEYS.V3_PIN_SALT));
}

/**
 * تعيين PIN جديد (يولّد salt عشوائياً ويحفظ الاثنين).
 * @param {string|number} pin
 * @returns {Promise<{hash:string, salt:string}>}
 */
export async function setPin(pin) {
  const salt = generateSalt();
  const hash = await hashPinV2(pin, salt);
  localStorage.setItem(STORAGE_KEYS.V3_PIN_SALT, salt);
  localStorage.setItem(STORAGE_KEYS.V3_PIN_HASH, hash);
  return { hash, salt };
}

/**
 * حذف PIN المحفوظ.
 */
export function clearPin() {
  localStorage.removeItem(STORAGE_KEYS.V3_PIN_HASH);
  localStorage.removeItem(STORAGE_KEYS.V3_PIN_SALT);
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { SALT_BYTES, SHA256_HEX_LEN, PBKDF2_ITERATIONS };
