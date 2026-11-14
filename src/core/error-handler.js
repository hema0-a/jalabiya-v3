/* ==========================================================================
   error-handler.js — معالج الأخطاء العالمي
   ==========================================================================
   - يلتقط: window 'error' (sync) + window 'unhandledrejection' (async).
   - يسجّل في: Console + activity-log (IndexedDB) + حلقة ذاكرة داخلية.
   - لا يوقف التطبيق عند الفشل — تسجيل صامت.
   - static imports فقط (القاعدة 14).
   ========================================================================== */

import { activity } from '../data/repos/activity.js';

/* ==========================================================================
   1. الحالة الداخلية
   ========================================================================== */

/** الحد الأقصى لعدد الأخطاء المحفوظة في الذاكرة. */
const MAX_BUFFER = 20;

/** حلقة الأخطاء الأخيرة (FIFO عملي — الأحدث في الأعلى). */
const buffer = [];

/** هل المُعالج مثبَّت؟ (لتجنب التثبيت المزدوج). */
let installed = false;

/** مرجع للأنواع المسموحة. */
const KINDS = Object.freeze({
  UNHANDLED: 'unhandled',  // window 'error'
  PROMISE:   'promise',    // window 'unhandledrejection'
  MANUAL:    'manual',     // report() يدوي
});

/* ==========================================================================
   2. التسجيل الداخلي
   ========================================================================== */

/**
 * تحويل أي قيمة إلى Error قابل للقراءة.
 * @param {*} value
 * @returns {Error}
 */
function toError(value) {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * تقليم stack لطول آمن (لتجنب تجاوز حدود التخزين).
 * @param {string} stack
 * @param {number} [max=2000]
 * @returns {string}
 */
function trimStack(stack, max = 2000) {
  const s = String(stack || '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * تسجيل خطأ في الذاكرة + Console + activity-log.
 * @param {Error|*} rawErr
 * @param {string} kind — أحد قيم KINDS
 * @param {Object} [context={}]
 * @returns {Promise<Object>} سجل الخطأ
 */
async function recordError(rawErr, kind, context = {}) {
  const err = toError(rawErr);

  const entry = {
    message: err.message || 'Unknown error',
    stack: trimStack(err.stack),
    kind,
    timestamp: Date.now(),
    url: (typeof location !== 'undefined') ? location.href : '',
    context,
  };

  /* 1. Console — للمطور */
  try {
    console.error('🔴 [' + kind + ']', entry.message, context);
    if (entry.stack) console.error(entry.stack);
  } catch { /* لا شيء */ }

  /* 2. الذاكرة — FIFO */
  buffer.unshift(entry);
  if (buffer.length > MAX_BUFFER) buffer.pop();

  /* 3. activity-log — صامت (لا نوقف التطبيق) */
  try {
    await activity.log({
      type: 'error:' + kind,
      description: '[' + kind + '] ' + entry.message,
      metadata: {
        stack: entry.stack,
        url: entry.url,
        context,
      },
    });
  } catch (logErr) {
    /* فشل التسجيل لا يجب أن يُنتج خطأ جديدًا */
    try { console.warn('[ErrorHandler] log failed:', logErr); } catch {}
  }

  return entry;
}

/* ==========================================================================
   3. API العام
   ========================================================================== */

/**
 * تثبيت المُعالج العالمي (idempotent — آمن للاستدعاء المتكرر).
 * يلتقط:
 *   - window 'error' → أخطاء متزامنة غير ملتقطة.
 *   - window 'unhandledrejection' → Promise rejections.
 * @returns {boolean} true إذا ثُبِّت الآن، false إذا كان مثبتًا مسبقًا
 */
export function install() {
  if (installed) return false;
  if (typeof window === 'undefined') return false;

  installed = true;

  /* --- أخطاء متزامنة --- */
  window.addEventListener('error', (event) => {
    /* تجاهل أخطاء تحميل الموارد (images/scripts) — event.error = null */
    if (!event.error && !event.message) return;

    const err = event.error || new Error(event.message || 'Unknown error');
    recordError(err, KINDS.UNHANDLED, {
      filename: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
    });
  });

  /* --- Promise rejections --- */
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = toError(reason);
    recordError(err, KINDS.PROMISE, {
      reasonType: typeof reason,
      reasonPreview: (typeof reason === 'string')
        ? reason.slice(0, 200)
        : (reason && reason.message ? String(reason.message).slice(0, 200) : ''),
    });
  });

  console.log('[ErrorHandler] ✅ مُثبَّت — يلتقط window.error + unhandledrejection');
  return true;
}

/**
 * تسجيل خطأ يدويًا (للاستخدام داخل catch).
 * @param {Error|*} err
 * @param {Object} [context={}]
 * @returns {Promise<Object>}
 * @example
 *   try { ... } catch (e) { report(e, { page: 'orders' }); }
 */
export function report(err, context = {}) {
  return recordError(err, KINDS.MANUAL, context);
}

/**
 * آخر N خطأ (للعرض في صفحة تشخيص أو Console).
 * @param {number} [limit=10]
 * @returns {Array<Object>}
 */
export function getRecent(limit = 10) {
  const n = Math.max(1, Math.min(Number(limit) || 10, MAX_BUFFER));
  return buffer.slice(0, n);
}

/**
 * أحدث الأخطاء المحفوظة في activity-log (تبقى بعد إعادة تحميل التطبيق، بخلاف حلقة الذاكرة).
 * @param {number} [limit=15]
 * @returns {Promise<Array>} بنفس شكل getRecent (الأحدث أولاً)
 */
export async function getRecentPersisted(limit = 15) {
  const rows = await activity.listRecent(200);
  return rows
    .filter((a) => a && typeof a.type === 'string' && a.type.startsWith('error:'))
    .slice(0, Math.max(1, Number(limit) || 15))
    .map((a) => ({
      message: String(a.description || '').replace(/^\[[^\]]*\]\s*/, '') || 'Unknown error',
      stack: (a.metadata && a.metadata.stack) || '',
      kind: a.type.slice(6),
      timestamp: a.timestamp || 0,
      url: (a.metadata && a.metadata.url) || '',
      context: (a.metadata && a.metadata.context) || {},
    }));
}

/**
 * الأخطاء الأخيرة من الذاكرة + المحفوظة معاً (بلا تكرار، الأحدث أولاً): الخطأ الذي أسقط التطبيق
 * وأُعيد تحميله بعده يبقى في تقرير التشخيص. فشل القراءة المحفوظة يُرجع ما في الذاكرة فقط.
 * @param {number} [limit=15]
 * @returns {Promise<Array>}
 */
export async function getRecentMerged(limit = 15) {
  const n = Math.max(1, Number(limit) || 15);
  let persisted = [];
  try { persisted = await getRecentPersisted(n * 2); } catch (_) { persisted = []; }
  const seen = new Set();
  const out = [];
  for (const e of [...getRecent(MAX_BUFFER), ...persisted]) {
    const key = (e.timestamp || 0) + '|' + e.message;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, n);
}

/**
 * مسح حلقة الذاكرة (لا يمس activity-log).
 * @returns {void}
 */
export function clear() {
  buffer.length = 0;
}

/**
 * هل المُعالج مثبَّت؟
 * @returns {boolean}
 */
export function isInstalled() {
  return installed;
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { MAX_BUFFER, KINDS, buffer };
