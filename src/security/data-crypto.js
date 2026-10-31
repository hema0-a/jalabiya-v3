/* ==========================================================================
   data-crypto.js — تشفير نصوص البيانات بعبارة مرور (v3.5.20)
   ==========================================================================
   مكتبة معزولة (WebCrypto فقط، بلا مكتبات) لتشفير نص كبير — نسخة احتياطية أو تصدير، ولاحقاً دفعات المزامنة.
   لا يستدعيها أي كود في التطبيق بعد (تُدمج في خطوة لاحقة بموافقة صريحة). لا تلمس pin-crypto.js ولا الرقم السري.

   التصميم (تشفير مغلَّف Envelope):
   - مفتاح بيانات عشوائي DEK (AES-GCM 256) يشفّر النص. المفتاح نفسه يُغلَّف (wrap) بمفتاح مشتق من كل «سرّ»:
       'pass' عبارة مرور المستخدم · 'rec' مفتاح استرجاع عالي العشوائية (125 بت) يُحفظ ورقياً.
     أيٌّ من الأسرار يفتح الملف. وتغيير العبارة لاحقاً لا يحتاج إعادة تشفير النص (إعادة تغليف فقط).
   - اشتقاق المفتاح: PBKDF2-SHA256 (المتاح في WebCrypto) بـ600 ألف دورة للعبارة (توصية OWASP).
   - AES-GCM يضمن السرية والأصالة معاً: أي تعديل في الملف أو سرّ خاطئ ⟵ فشل فك صريح (لا نص مشوَّه).
   - AAD ثابت يربط الصيغة والإصدار. الصيغة بإصدار (v) ومعرّف (m) لتتعرّف عليها واجهة الاستعادة وتتطور لاحقاً.
   - العبارة تُطبَّع NFKC (لوحات مفاتيح عربية مختلفة قد تنتج أشكالاً مختلفة للحرف نفسه كـ«ﻻ» و«لا»).
   ⚠️ فقدان كل الأسرار = فقدان النسخة نهائياً (لا استرجاع من أي خادم). لذلك مفتاح الاسترجاع جزء من التصميم.
   ⚠️ لا تحمي من رقم سري من 4 خانات: مثل هذا يُكسر دون اتصال. تُستعمل عبارة مرور حقيقية (≥ 8 أحرف).
   ========================================================================== */

export const ENVELOPE_MARK = 'jalabiya-enc';
export const ENVELOPE_VERSION = 1;
export const DEFAULT_ITERATIONS = 600000;
export const RECOVERY_ITERATIONS = 100000;
export const MIN_PASSPHRASE_LENGTH = 8;

const MIN_ITERATIONS = 1000;
const MAX_ITERATIONS = 5000000;   // سقف يمنع ملفاً خبيثاً من تعليق الجهاز بدورات هائلة
const MAX_WRAPS = 4;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const WRAPPED_KEY_BYTES = 48;     // 32 مفتاح + 16 وسم GCM
const GCM_TAG_BYTES = 16;
const RECOVERY_LENGTH = 25;       // 25 رمزاً × 5 بت = 125 بت
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const AAD = new TextEncoder().encode('jalabiya-enc|v1');

/** خطأ برمز مقروء آلياً: unavailable · bad-input · weak-secret · bad-format · unsupported-version · decrypt-failed. */
export class DataCryptoError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message || code);
    this.name = 'DataCryptoError';
    this.code = code;
  }
}

/**
 * هل WebCrypto متاح؟ (يتطلب سياقاً آمناً HTTPS؛ على HTTP يكون crypto.subtle غير معرَّف.)
 * @returns {boolean}
 */
export function isCryptoAvailable() {
  return typeof crypto !== 'undefined' && !!crypto && !!crypto.subtle && typeof crypto.getRandomValues === 'function';
}

function requireCrypto() {
  if (!isCryptoAvailable()) throw new DataCryptoError('unavailable', 'التشفير غير متاح في هذا السياق (يتطلب اتصالاً آمناً HTTPS ومتصفحاً حديثاً)');
}

/* ==========================================================================
   1. Base64 (على دفعات: النصوص الكبيرة لا تُسقط المكدّس)
   ========================================================================== */
function toB64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/** @returns {Uint8Array|null} null إن لم يكن Base64 صالحاً */
function fromB64(str) {
  if (typeof str !== 'string' || str.length === 0) return null;
  try {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/* ==========================================================================
   2. الأسرار: العبارة ومفتاح الاسترجاع
   ========================================================================== */

/**
 * تطبيع العبارة (NFKC) كي تتطابق الأشكال المختلفة للحرف نفسه.
 * @param {string} p
 * @returns {string}
 */
export function normalizePassphrase(p) {
  return String(p == null ? '' : p).normalize('NFKC');
}

/**
 * مفتاح استرجاع جديد: 25 رمزاً (Crockford Base32، 125 بت) في 5 مجموعات: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX.
 * @returns {string}
 */
export function generateRecoveryKey() {
  const bytes = randomBytes(RECOVERY_LENGTH);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && i % 5 === 0) out += '-';
    out += CROCKFORD[bytes[i] & 31];   // 256 ÷ 32 صحيح ⟵ لا انحياز
  }
  return out;
}

/**
 * تطبيع مفتاح الاسترجاع كما يكتبه الإنسان: أحرف كبيرة، بلا فواصل ولا مسافات، وO⟵0 وI/L⟵1 (التباس شائع).
 * @param {string} s
 * @returns {string}
 */
export function normalizeRecoveryKey(s) {
  return String(s == null ? '' : s)
    .toUpperCase()
    .replace(/[\s\-_]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** هل النص مفتاح استرجاع بصيغته الصحيحة (بعد التطبيع)؟ */
export function isValidRecoveryKey(s) {
  const n = normalizeRecoveryKey(s);
  if (n.length !== RECOVERY_LENGTH) return false;
  for (const ch of n) if (!CROCKFORD.includes(ch)) return false;
  return true;
}

/** السرّ بعد تطبيعه حسب نوع الغلاف. */
function normalizeSecret(type, secret) {
  return type === 'rec' ? normalizeRecoveryKey(secret) : normalizePassphrase(secret);
}

/* ==========================================================================
   3. اشتقاق المفتاح وتغليف DEK
   ========================================================================== */
async function deriveKek(secretNorm, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretNorm), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/* ==========================================================================
   4. التشفير
   ========================================================================== */

/**
 * يشفّر نصاً بسرّ واحد أو أكثر ويعيد الغلاف نصاً JSON جاهزاً للتخزين.
 * @param {string} text
 * @param {Array<{type:'pass'|'rec', secret:string, iterations?:number}>} secrets — أيٌّ منها يفتح الملف
 * @param {{iterations?:number}} [opts] — iterations يُستعمل في الاختبارات (الأدنى 1000)
 * @returns {Promise<string>}
 */
export async function encryptText(text, secrets, opts = {}) {
  requireCrypto();
  if (typeof text !== 'string') throw new DataCryptoError('bad-input', 'النص المراد تشفيره غير صالح');
  if (!Array.isArray(secrets) || secrets.length === 0 || secrets.length > MAX_WRAPS) {
    throw new DataCryptoError('bad-input', 'يلزم سرّ واحد على الأقل (عبارة مرور أو مفتاح استرجاع)');
  }

  /* التحقق من كل الأسرار قبل أي عمل مكلف */
  const prepared = secrets.map((s) => {
    if (!s || (s.type !== 'pass' && s.type !== 'rec')) throw new DataCryptoError('bad-input', 'نوع السرّ غير معروف');
    const norm = normalizeSecret(s.type, s.secret);
    if (s.type === 'pass' && norm.length < MIN_PASSPHRASE_LENGTH) {
      throw new DataCryptoError('weak-secret', 'عبارة المرور قصيرة (الحد الأدنى ' + MIN_PASSPHRASE_LENGTH + ' أحرف)');
    }
    if (s.type === 'rec' && !isValidRecoveryKey(norm)) {
      throw new DataCryptoError('weak-secret', 'مفتاح الاسترجاع غير صالح');
    }
    const iterations = s.iterations ?? opts.iterations ?? (s.type === 'rec' ? RECOVERY_ITERATIONS : DEFAULT_ITERATIONS);
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
      throw new DataCryptoError('bad-input', 'عدد دورات الاشتقاق غير صالح');
    }
    return { type: s.type, norm, iterations };
  });

  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  const wraps = [];
  for (const p of prepared) {
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const kek = await deriveKek(p.norm, salt, p.iterations);
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: AAD }));
    wraps.push({ t: p.type, kdf: 'PBKDF2-SHA256', i: p.iterations, s: toB64(salt), iv: toB64(iv), k: toB64(wrapped) });
  }

  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD }, dek, new TextEncoder().encode(text)
  ));

  return JSON.stringify({ m: ENVELOPE_MARK, v: ENVELOPE_VERSION, alg: 'A256GCM', wraps, iv: toB64(iv), ct: toB64(ct) });
}

/* ==========================================================================
   5. فحص الغلاف وفكّه
   ========================================================================== */

/**
 * هل هذا المُدخل غلاف تشفير من هذا التطبيق؟ (فحص سريع لواجهة الاستعادة؛ لا يتحقق من سلامته كاملة.)
 * @param {string|Object} input
 * @returns {boolean}
 */
export function isEncryptedEnvelope(input) {
  try {
    const o = typeof input === 'string' ? JSON.parse(input) : input;
    return !!o && typeof o === 'object' && o.m === ENVELOPE_MARK && typeof o.v === 'number';
  } catch (e) { return false; }
}

/** يفحص بنية الغلاف بصرامة ويعيد حقوله مفكوكة، أو يرمي bad-format / unsupported-version. */
function parseEnvelope(input) {
  let o;
  try { o = typeof input === 'string' ? JSON.parse(input) : input; }
  catch (e) { throw new DataCryptoError('bad-format', 'الملف ليس نسخة مشفّرة صالحة'); }

  if (!o || typeof o !== 'object' || o.m !== ENVELOPE_MARK) throw new DataCryptoError('bad-format', 'الملف ليس نسخة مشفّرة من هذا التطبيق');
  if (o.v !== ENVELOPE_VERSION) {
    throw new DataCryptoError(typeof o.v === 'number' && o.v > ENVELOPE_VERSION ? 'unsupported-version' : 'bad-format',
      'إصدار صيغة التشفير غير مدعوم — حدّث التطبيق');
  }
  if (o.alg !== 'A256GCM' || !Array.isArray(o.wraps) || o.wraps.length === 0 || o.wraps.length > MAX_WRAPS) {
    throw new DataCryptoError('bad-format', 'بنية الملف المشفّر غير صالحة');
  }

  const iv = fromB64(o.iv);
  const ct = fromB64(o.ct);
  if (!iv || iv.length !== IV_BYTES || !ct || ct.length < GCM_TAG_BYTES) throw new DataCryptoError('bad-format', 'الملف المشفّر تالف');

  const wraps = o.wraps.map((w) => {
    const salt = w && fromB64(w.s);
    const wiv = w && fromB64(w.iv);
    const k = w && fromB64(w.k);
    const ok = w && (w.t === 'pass' || w.t === 'rec') && w.kdf === 'PBKDF2-SHA256'
      && Number.isInteger(w.i) && w.i >= MIN_ITERATIONS && w.i <= MAX_ITERATIONS
      && salt && salt.length === SALT_BYTES && wiv && wiv.length === IV_BYTES && k && k.length === WRAPPED_KEY_BYTES;
    if (!ok) throw new DataCryptoError('bad-format', 'الملف المشفّر تالف');
    return { type: w.t, iterations: w.i, salt, iv: wiv, wrapped: k };
  });

  return { wraps, iv, ct };
}

/**
 * يفكّ غلافاً بسرّ واحد (عبارة مرور أو مفتاح استرجاع؛ تُجرَّب كل الأغلفة ويُطبَّع السرّ حسب نوع كل غلاف).
 * @param {string|Object} input
 * @param {string} secret
 * @returns {Promise<string>} النص الأصلي
 * @throws {DataCryptoError} bad-format · unsupported-version · decrypt-failed (سرّ خاطئ أو ملف معدَّل — لا يمكن التمييز)
 */
export async function decryptText(input, secret) {
  requireCrypto();
  const env = parseEnvelope(input);

  let dek = null;
  for (const w of env.wraps) {
    try {
      const kek = await deriveKek(normalizeSecret(w.type, secret), w.salt, w.iterations);
      dek = await crypto.subtle.unwrapKey(
        'raw', w.wrapped, kek, { name: 'AES-GCM', iv: w.iv, additionalData: AAD },
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
      break;
    } catch (e) { /* سرّ لا يطابق هذا الغلاف: نجرّب التالي */ }
  }
  if (!dek) throw new DataCryptoError('decrypt-failed', 'عبارة المرور أو مفتاح الاسترجاع غير صحيح، أو الملف تالف');

  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: env.iv, additionalData: AAD }, dek, env.ct);
    return new TextDecoder().decode(plain);
  } catch (e) {
    throw new DataCryptoError('decrypt-failed', 'عبارة المرور أو مفتاح الاسترجاع غير صحيح، أو الملف تالف');
  }
}
