/* ==========================================================================
   backup-crypto.js — تشفير ملفات النسخ الخارجة من الجهاز (v3.5.21)
   ==========================================================================
   النطاق: الملفات التي تخرج من التطبيق فقط — «مشاركة نسخة» (واتساب/تيليجرام/درايف) · ⬇️ تنزيل نسخة · تنزيل JSON الكامل.
   لا يمسّ: النسخ الداخلية في IndexedDB (تعمل تلقائياً بلا تدخّل) · المزامنة السحابية · الرقم السري.

   الفكرة:
   - عند التفعيل تُنشأ «حلقة مفاتيح» (مفتاح بيانات واحد مغلَّف بعبارة المرور وبمفتاح استرجاع) وتُحفظ في localStorage.
     لا تُحفظ العبارة ولا مفتاح الاسترجاع إطلاقاً؛ مفتاح الاسترجاع يُعرض مرة واحدة ليُحفظ ورقياً.
   - عند كل تصدير يُطلب السرّ لفتح الحلقة (ونجاح الفتح = تحقق من صحته) ثم يُشفَّر الملف بأغلفة الحلقة نفسها،
     فيُفتح بالعبارة أو بمفتاح الاسترجاع على أي جهاز، ولا يُنتَج ملف بعبارة خاطئة بخطأ طباعة.
   - الفشل مغلق: إن كان التشفير مفعّلاً ولم يتوفر مشفِّر فلا يخرج ملف صريح أبداً (يُطبَّق في auto-backup.js).
   - الاستيراد: الملف المشفّر يُتعرَّف عليه تلقائياً ويُطلب سرّه.
   ⚠️ مسح بيانات المتصفح يمسح الحلقة (فيعود التصدير صريحاً على هذا الجهاز)؛ والتفعيل لكل جهاز على حدة.
   ⚠️ فقدان العبارة ومفتاح الاسترجاع معاً = فقدان الملفات المشفّرة نهائياً.

   الواجهة تُحقن (ask) كي تُختبر هذه الدوال بلا DOM: ask({ purpose, verify }) ⟵ Promise<ناتج verify | null عند الإلغاء>.
   ========================================================================== */

import { STORAGE_KEYS } from '../core/config.js';
import {
  createKeyring, openKeyring, encryptWithKey, decryptText, generateRecoveryKey,
  isEncryptedEnvelope, DataCryptoError,
} from '../security/data-crypto.js';

const STATE_VERSION = 1;

let storageOverride = null;

/** التخزين المحلي (أو بديل الاختبار). null إن لم يتوفر. */
function store() {
  if (storageOverride) return storageOverride;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

/** الحالة المحفوظة أو null (تالفة أو غائبة). */
function readState() {
  try {
    const s = store();
    const raw = s && s.getItem(STORAGE_KEYS.V3_FILE_ENCRYPTION);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && o.v === STATE_VERSION && typeof o.keyring === 'string' && o.keyring ? o : null;
  } catch (e) { return null; }
}

/**
 * هل تشفير الملفات الخارجية مفعّل على هذا الجهاز؟
 * @returns {boolean}
 */
export function isFileEncryptionEnabled() {
  return readState() !== null;
}

/**
 * معلومات الحالة للعرض (بلا أي سرّ).
 * @returns {{enabled:boolean, enabledAt:number|null}}
 */
export function getFileEncryptionInfo() {
  const st = readState();
  return { enabled: !!st, enabledAt: st ? (Number(st.enabledAt) || null) : null };
}

/**
 * يجهّز التفعيل دون كتابة شيء: ينشئ مفتاح استرجاع وحلقة مفاتيح في الذاكرة.
 * لا يتفعّل التشفير حتى يُستدعى commit() (بعد أن يؤكد المستخدم حفظ مفتاح الاسترجاع).
 * @param {string} passphrase — ≥ 8 أحرف
 * @param {{iterations?:number}} [opts] — للاختبار
 * @returns {Promise<{recoveryKey:string, commit:() => void}>}
 * @throws {DataCryptoError} already-enabled · weak-secret · storage-failed (عند commit)
 */
export async function createFileEncryptionSetup(passphrase, opts = {}) {
  if (isFileEncryptionEnabled()) throw new DataCryptoError('already-enabled', 'التشفير مفعّل بالفعل');
  const recoveryKey = generateRecoveryKey();
  const keyring = await createKeyring(
    [{ type: 'pass', secret: passphrase }, { type: 'rec', secret: recoveryKey }], opts
  );
  return {
    recoveryKey,
    commit() {
      if (isFileEncryptionEnabled()) throw new DataCryptoError('already-enabled', 'التشفير مفعّل بالفعل');
      const s = store();
      if (!s) throw new DataCryptoError('storage-failed', 'تعذّر الحفظ على هذا الجهاز');
      try {
        s.setItem(STORAGE_KEYS.V3_FILE_ENCRYPTION, JSON.stringify({ v: STATE_VERSION, enabledAt: Date.now(), keyring }));
      } catch (e) { throw new DataCryptoError('storage-failed', 'تعذّر الحفظ على هذا الجهاز'); }
      if (!isFileEncryptionEnabled()) throw new DataCryptoError('storage-failed', 'تعذّر الحفظ على هذا الجهاز');
    },
  };
}

/**
 * يفتح الحلقة بسرّ (عبارة أو مفتاح استرجاع) ويعيد مشفِّراً لهذه الجلسة. سرّ خاطئ ⟵ decrypt-failed.
 * @param {string} secret
 * @returns {Promise<{encrypt:(text:string) => Promise<string>}>}
 */
export async function openEncryptor(secret) {
  const st = readState();
  if (!st) throw new DataCryptoError('not-enabled', 'التشفير غير مفعّل');
  const dek = await openKeyring(st.keyring, secret);
  return { encrypt: (text) => encryptWithKey(text, dek, st.keyring) };
}

/**
 * يعطّل التشفير بعد التحقق من السرّ (لا يُعطَّل بلا إثبات). الملفات المشفّرة القديمة تبقى تُفتح بأسرارها.
 * @param {string} secret
 * @returns {Promise<boolean>}
 */
export async function disableFileEncryption(secret) {
  const st = readState();
  if (!st) return true;
  await openKeyring(st.keyring, secret);   // يرمي decrypt-failed إن كان السرّ خاطئاً
  const s = store();
  try { s.removeItem(STORAGE_KEYS.V3_FILE_ENCRYPTION); } catch (e) { throw new DataCryptoError('storage-failed', 'تعذّر الحفظ على هذا الجهاز'); }
  return !isFileEncryptionEnabled();
}

/** يفكّ ملفاً مشفّراً بسرّ (عبارة أو مفتاح استرجاع). @returns {Promise<string>} */
export function decryptBackupFile(text, secret) {
  return decryptText(text, secret);
}

/** هل النص ملف مشفّر من هذا التطبيق؟ */
export function looksEncrypted(text) {
  return isEncryptedEnvelope(text);
}

/** اسم الملف المشفّر: jalabiya-backup-2026-10-31.json ⟵ jalabiya-backup-2026-10-31.enc.json */
export function encryptedFileName(plainName) {
  return String(plainName).replace(/(\.enc)?\.json$/i, '') + '.enc.json';
}

const ERROR_TEXT = {
  'decrypt-failed': 'العبارة أو المفتاح غير صحيح (أو الملف تالف)',
  'bad-format': 'الملف ليس نسخة مشفّرة صالحة',
  'unsupported-version': 'الملف بإصدار أحدث من التطبيق — حدّث التطبيق أولاً',
  'weak-secret': 'العبارة قصيرة: 8 أحرف على الأقل',
  'unavailable': 'التشفير غير متاح في هذا المتصفح أو الاتصال (يلزم HTTPS)',
  'already-enabled': 'التشفير مفعّل بالفعل',
  'not-enabled': 'التشفير غير مفعّل',
  'storage-failed': 'تعذّر الحفظ على هذا الجهاز',
};

/** رسالة عربية مفهومة لخطأ التشفير (لا تكشف أي سرّ). */
export function describeCryptoError(e) {
  return (e && ERROR_TEXT[e.code]) || (e && e.message) || 'حدث خطأ غير متوقع';
}

/* ==========================================================================
   مسارات التصدير والاستيراد (الواجهة تُحقن عبر ask)
   ========================================================================== */

/**
 * يجهّز مشفِّر التصدير: لا يسأل إن كان التشفير معطّلاً. الإلغاء ⟵ null (والمستدعي يوقف التصدير؛ لا ملف صريح).
 * @param {(cfg:{purpose:string, verify:(secret:string) => Promise<*>}) => Promise<*>} ask
 * @returns {Promise<{encrypt:Function|undefined}|null>}
 */
export async function prepareExportEncryptor(ask) {
  if (!isFileEncryptionEnabled()) return { encrypt: undefined };
  const enc = await ask({ purpose: 'export', verify: (secret) => openEncryptor(secret) });
  return enc && typeof enc.encrypt === 'function' ? { encrypt: enc.encrypt } : null;
}

/**
 * يعيد نص الملف الصريح: كما هو إن لم يكن مشفّراً، أو مفكوكاً بعد طلب السرّ. الإلغاء ⟵ null.
 * @param {string} text
 * @param {(cfg:{purpose:string, verify:(secret:string) => Promise<*>}) => Promise<*>} ask
 * @returns {Promise<string|null>}
 */
export async function decryptImportedText(text, ask) {
  if (!looksEncrypted(text)) return text;
  const plain = await ask({ purpose: 'import', verify: (secret) => decryptBackupFile(text, secret) });
  return typeof plain === 'string' ? plain : null;
}

/* ==========================================================================
   للاختبار فقط
   ========================================================================== */

/** يستبدل التخزين (null ⟵ localStorage الأصلي). */
export function _setStorageForTest(s) { storageOverride = s || null; }
