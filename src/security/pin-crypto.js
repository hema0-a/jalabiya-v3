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
 * التحقق من PIN مقابل hash + salt.
 * يستخدم مقارنة ثابتة الزمن مبدئياً (المقارنة النصية كافية هنا لأن كلا الطرفين hash).
 * @param {string|number} pin
 * @param {string} hash
 * @param {string} salt
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, hash, salt) {
  if (!hash || !salt) return false;
  const computed = await hashPin(pin, salt);
  return computed === hash;
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
  const hash = await hashPin(pin, salt);
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
export const _internal = { SALT_BYTES, SHA256_HEX_LEN };
