/* ==========================================================================
   image-worker-client.js — عميل Worker ضغط الصور (v3.5.17)
   ==========================================================================
   يُرسل الملف إلى workers/image-worker.js ويعيد { blob, sizeKB, width, height }.
   - Worker واحد يُنشأ عند أول استعمال ويُنهى بعد خمول IDLE_MS (يوفّر ذاكرة الهاتف).
   - مهلة لكل مهمة (JOB_TIMEOUT_MS): عند انتهائها يُنهى الـWorker وتُرفض المهام المعلّقة.
   - كل فشل (تشغيل · رسالة · خطأ · مهلة) يرفض الوعد بخطأ له code، والمستدعي (image-compressor.js)
     يُكمل على الخيط الرئيسي. لا يرمي هذا الملف خطأ للمستخدم أبداً.
   - مفتاح الإيقاف: IMAGE_WORKER_ENABLED = false ⟵ كل الضغط على الخيط الرئيسي كما قبل 3.5.17.
     ولتجربة المسار البديل على الهاتف دون تعديل الكود: أضف ‎?noimgworker=1‎ لرابط التطبيق.
   - لا import ديناميكي: new Worker(new URL(...)) ليس import() (قاعدة المشروع محفوظة).
   ========================================================================== */

/** مفتاح الإيقاف الرئيسي للـWorker. */
export const IMAGE_WORKER_ENABLED = true;

const JOB_TIMEOUT_MS = 30000;
const IDLE_MS = 20000;

let enabled = IMAGE_WORKER_ENABLED;
let factory = defaultFactory;
let timing = { job: JOB_TIMEOUT_MS, idle: IDLE_MS };

let worker = null;
let seq = 0;
let idleTimer = null;
/** @type {Map<number, {resolve:Function, reject:Function, timer:*}>} */
const pending = new Map();

function defaultFactory() {
  return new Worker(new URL('../workers/image-worker.js', import.meta.url), { type: 'module' });
}

/** خطأ برمز مقروء آلياً (للتسجيل فقط). */
function makeError(code, detail) {
  const e = new Error('image-worker: ' + code + (detail ? ' — ' + detail : ''));
  e.code = code;
  return e;
}

/** مؤقّت الخمول فقط لا يُبقي عملية Node حيّة (اختبارات)؛ لا أثر في المتصفح. مؤقّت المهلة حيوي فلا يُخفى. */
function unref(timer) {
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

/**
 * هل الضغط في Worker متاح هنا؟ (مفعّل + المتصفح يدعم Worker وOffscreenCanvas وcreateImageBitmap).
 * @returns {boolean}
 */
export function isImageWorkerSupported() {
  if (!enabled) return false;
  try {
    if (typeof location !== 'undefined' && /[?&]noimgworker=1/.test(location.search || '')) return false;
  } catch (e) { /* نكمل */ }
  return typeof Worker === 'function'
    && typeof OffscreenCanvas === 'function'
    && typeof createImageBitmap === 'function'
    && typeof OffscreenCanvas.prototype.convertToBlob === 'function';
}

function killWorker() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (worker) {
    try { worker.terminate(); } catch (e) { /* نكمل */ }
    worker = null;
  }
}

/** يرفض كل المهام المعلّقة وينهي الـWorker (المهام تُكمل على الخيط الرئيسي عند مستدعيها). */
function failAll(err) {
  const jobs = [...pending.values()];
  pending.clear();
  for (const j of jobs) { clearTimeout(j.timer); j.reject(err); }
  killWorker();
}

function scheduleIdle() {
  if (pending.size > 0) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = unref(setTimeout(killWorker, timing.idle));
}

function onMessage(d) {
  const job = d && pending.get(d.id);
  if (!job) return;
  pending.delete(d.id);
  clearTimeout(job.timer);
  if (d.ok) job.resolve({ blob: d.blob, sizeKB: d.sizeKB, width: d.width, height: d.height });
  else job.reject(makeError(d.code || 'worker-failed', d.error));
  scheduleIdle();
}

function ensureWorker() {
  if (worker) return worker;
  const w = factory();
  w.onmessage = (ev) => onMessage(ev && ev.data);
  w.onerror = (ev) => failAll(makeError('worker-error', ev && ev.message));
  w.onmessageerror = () => failAll(makeError('worker-message-error'));
  worker = w;
  return w;
}

/**
 * ضغط صورة داخل الـWorker (نفس منطق searchEncoding والحدود).
 * @param {File|Blob} file
 * @param {{quality:number, maxSizeKB:number, maxDimensionPx:number}} params — قيم نهائية (لا افتراضيات هنا)
 * @returns {Promise<{blob:Blob, sizeKB:number, width:number, height:number}>}
 */
export function compressInWorker(file, { quality, maxSizeKB, maxDimensionPx }) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = ensureWorker(); }
    catch (e) { reject(makeError('worker-start', e && e.message)); return; }

    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    const id = ++seq;
    const timer = setTimeout(() => failAll(makeError('worker-timeout')), timing.job);
    pending.set(id, { resolve, reject, timer });

    try {
      w.postMessage({ id, file, quality, maxSizeKB, maxDimensionPx });
    } catch (e) {
      pending.delete(id);
      clearTimeout(timer);
      reject(makeError('worker-post', e && e.message));
      scheduleIdle();
    }
  });
}

/* ==========================================================================
   للاختبار فقط
   ========================================================================== */

/** يستبدل مُنشئ الـWorker (null ⟵ الأصلي). @param {Function|null} fn */
export function _setWorkerFactoryForTest(fn) { killWorker(); factory = fn || defaultFactory; }
/** يستبدل المهل بالميلي ثانية (null ⟵ الأصلية). @param {{job?:number, idle?:number}|null} t */
export function _setTimingForTest(t) { timing = t ? { job: t.job ?? JOB_TIMEOUT_MS, idle: t.idle ?? IDLE_MS } : { job: JOB_TIMEOUT_MS, idle: IDLE_MS }; }
/** يفرض التفعيل/التعطيل (null ⟵ الأصلي). @param {boolean|null} v */
export function _setEnabledForTest(v) { enabled = v === null ? IMAGE_WORKER_ENABLED : !!v; }
/** حالة داخلية للفحص. @returns {{hasWorker:boolean, pending:number, idleArmed:boolean}} */
export function _stateForTest() { return { hasWorker: !!worker, pending: pending.size, idleArmed: !!idleTimer }; }
/** يعيد كل شيء إلى الأصل (ينهي الـWorker ويلغي المؤقتات). */
export function _resetForTest() {
  for (const j of pending.values()) clearTimeout(j.timer);
  pending.clear();
  killWorker();
  factory = defaultFactory;
  timing = { job: JOB_TIMEOUT_MS, idle: IDLE_MS };
  enabled = IMAGE_WORKER_ENABLED;
}
