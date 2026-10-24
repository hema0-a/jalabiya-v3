/* ==========================================================================
   media-migration.js — ترحيل وسائط الطلبات القديمة المضمَّنة إلى orderMedia (v3.4.1)
   ==========================================================================
   الطلبات القديمة تحمل الصورة المرجعية والتوقيعات (base64) داخل سجل الطلب نفسه، فتُسحب مع كل
   orders.list(). هذه الوحدة تنقلها إلى مخزن orderMedia وتُفرّغ الحقول المضمَّنة (انظر docs/ORDER-MEDIA.md).

   ضمانات الأمان:
   1) **كل طلب معاملة ذرّية واحدة**: كتابة سجلات الوسائط + سجل الطلب المُفرَّغ معاً (idb.writeBatch)،
      فإما أن يحدث كله أو لا شيء. لا حالة «وُسِّط نصف النقل».
   2) **حارس updatedAt داخل المعاملة نفسها**: إن تغيّر الطلب بعد قراءته (تعديل المستخدم/مزامنة) تُلغى المعاملة
      كلها ويُعاد المحاولة مرة بقراءة جديدة، ثم يُبلَّغ «raced» بلا مساس.
   3) **تحقق بعد كل طلب**: إعادة قراءة الطلب والوسائط ومطابقتها حرفاً بحرف؛ عند أي اختلاف يُستعاد السجل الأصلي.
   4) **لا نكتب فوق وسيط موجود بقيمة مختلفة** (store-conflict): يُترك المضمَّن كما هو ويُبلَّغ.
   5) **نسخة احتياطية فُحصت قبل البدء** + مزامنة نظيفة + حارس الكتابة (MEDIA_MIN_BUILD) + مساحة كافية.
   6) **قابل للاستئناف والإيقاف**: كل تشغيل يمسح الطلبات من جديد؛ المرحَّل يُتخطّى. الإيقاف بعد الطلب الجاري.
   7) **تثبيت التواريخ المشتقة**: الكتابة تُحدِّث updatedAt، وبعض الأماكن تستعمله بديلاً للتاريخ الصريح
      (عمر «جاهز للاستلام»، تاريخ التسليم في المؤشرات). لذلك يُثبَّت readyAt/deliveredAt بقيمتهما الفعلية قبل الترحيل
      كي لا يتغيّر أي رقم بسببه.
   المتروك عمداً (مع التبليغ): قيمة ليست dataURL، توقيع تسليم بلا معرّف، وسيط مخزَّن بقيمة مختلفة.
   وحدة تعتمد على idb وخدمات أخرى عبر migrationDeps (قابلة للاستبدال في الاختبار). بلا innerHTML ولا import ديناميكي.
   ========================================================================== */

import * as idb from '../data/idb.js';
import { STORES } from '../core/config.js';
import { isMediaWritable } from '../data/repos/order-media.js';
import { thumbFromDataUrl } from './image-compressor.js';
import { createBackup, verifyBackup } from './auto-backup.js';
import { authorityDeps, checkSync, checkBackup } from './ledger-authority.js';
import { getStorageStatus } from './storage-health.js';
import { SLOT_REF, SLOT_SIG, deliverySlot, mediaId, isMediaData } from './order-media.js';

/** أسباب التخطي المُبلَّغة. */
export const REASON = Object.freeze({
  NOT_DATA_URL: 'not-data-url',
  DELIVERY_NO_ID: 'delivery-no-id',
  STORE_CONFLICT: 'store-conflict',
  DUPLICATE_SLOT: 'duplicate-slot',
  BAD_ORDER_ID: 'bad-order-id',
});

/** تسميات عربية لأسباب التخطي. */
export const REASON_LABELS = Object.freeze({
  [REASON.NOT_DATA_URL]: 'قيمة ليست صورة dataURL (تُركت كما هي)',
  [REASON.DELIVERY_NO_ID]: 'توقيع تسليم بلا معرّف (تُرك كما هو)',
  [REASON.STORE_CONFLICT]: 'وسيط مخزَّن بقيمة مختلفة (لم يُكتب فوقه)',
  [REASON.DUPLICATE_SLOT]: 'معرّف تسليم مكرّر (تُرك كما هو)',
  [REASON.BAD_ORDER_ID]: 'معرّف طلب غير صالح للوسائط',
});

/** عدد أضعاف حجم الوسائط المضمَّنة المطلوب توفّره في التخزين (نسخة احتياطية + نسخ الوسائط). */
export const STORAGE_HEADROOM_FACTOR = 2.5;
/** أقصى عدد إخفاقات تُحفظ تفصيلاً في الملخص. */
export const MAX_ERRORS_KEPT = 20;

const LOCK_KEY = 'jalabiya_v3_media_migration_lock';
const LOCK_TTL_MS = 15 * 60 * 1000;

const str = (v) => (typeof v === 'string' ? v : '');
const errMsg = (e) => String((e && e.message) || e || 'خطأ غير معروف').slice(0, 200);

/* ==========================================================================
   1. دوال نقية: التخطيط والبناء
   ========================================================================== */

/**
 * يخطط ما يمكن ترحيله من سجل طلب (دالة نقية، لا تعدّل المدخل).
 * @param {Object} order
 * @returns {{orderId:string, slots:Array<{slot:string,data:string,bytes:number}>, skipped:Array<{slot:string,reason:string}>, bytes:number}}
 */
export function planOrderMigration(order) {
  const out = { orderId: order && order.id != null ? String(order.id) : '', slots: [], skipped: [], bytes: 0 };
  if (!order || typeof order !== 'object') return out;
  const seen = new Set();
  const add = (slot, data) => {
    if (!isMediaData(data)) { out.skipped.push({ slot, reason: REASON.NOT_DATA_URL }); return; }
    if (seen.has(slot)) { out.skipped.push({ slot, reason: REASON.DUPLICATE_SLOT }); return; }
    seen.add(slot);
    out.slots.push({ slot, data, bytes: data.length });
    out.bytes += data.length;
  };
  if (str(order.referenceImage)) add(SLOT_REF, order.referenceImage);
  if (str(order.signature)) add(SLOT_SIG, order.signature);
  if (Array.isArray(order.deliveries)) {
    order.deliveries.forEach((d) => {
      if (!d || typeof d !== 'object' || !str(d.signature)) return;
      if (d.id == null || d.id === '') { out.skipped.push({ slot: 'del-?', reason: REASON.DELIVERY_NO_ID }); return; }
      add(deliverySlot(d.id), d.signature);
    });
  }
  /* معرّف لا يصلح مفتاحاً للوسائط (فارغ أو فيه نقطتان): لا نرحّل شيئاً منه */
  if (out.slots.length > 0 && (!out.orderId || out.orderId.includes(':'))) {
    out.skipped.push(...out.slots.map((s) => ({ slot: s.slot, reason: REASON.BAD_ORDER_ID })));
    out.slots = []; out.bytes = 0;
  }
  return out;
}

/**
 * يثبّت التواريخ التي يعتمد فيها التطبيق على updatedAt كبديل عند غياب التاريخ الصريح، حتى لا يغيّرها تحديث السجل.
 *  - جاهز بلا readyAt: عمر الجاهزية يُحسب من updatedAt ثم createdAt (pickup-reminders).
 *  - مسلَّم بلا deliveredAt: تاريخ التسليم يُحسب من updatedAt (kpis-calculator، ونهاية ساعات العمل).
 * @param {Object} rec — السجل قبل الترحيل
 * @returns {{readyAt?:number, deliveredAt?:number}}
 */
export function pinDerivedDates(rec) {
  const patch = {};
  if (!rec || typeof rec !== 'object') return patch;
  const upd = Number(rec.updatedAt) || 0;
  const cre = Number(rec.createdAt) || 0;
  if (rec.status === 'delivered' && !Number(rec.deliveredAt) && upd > 0) patch.deliveredAt = upd;
  if (rec.status === 'ready' && !Number(rec.readyAt)) {
    const v = upd || cre;
    if (v > 0) patch.readyAt = v;
  }
  return patch;
}

/**
 * يبني ما يُكتب في المعاملة الذرّية لطلب واحد (دالة نقية).
 * @param {Object} rec — سجل الطلب كما قُرئ
 * @param {ReturnType<typeof planOrderMigration>} plan
 * @param {Object} [opts]
 * @param {string} [opts.thumb] — مصغّر الصورة المرجعية (يُحفظ في refThumb)
 * @param {Map<string,Object>} [opts.existingMedia] — سجلات الوسائط الموجودة لنفس الطلب (مسافة ⟵ سجل)
 * @param {number} [opts.now]
 * @returns {{ok:boolean, moved:Array, skipped:Array, mediaRecords:Array, record:Object|null, freedBytes:number}}
 */
export function buildMigrationWrite(rec, plan, opts = {}) {
  const now = Number(opts.now) || Date.now();
  const existing = opts.existingMedia instanceof Map ? opts.existingMedia : new Map();
  const moved = []; const skipped = [...plan.skipped]; const mediaRecords = [];
  for (const s of plan.slots) {
    const ex = existing.get(s.slot);
    if (ex && typeof ex.data === 'string' && ex.data !== s.data) { skipped.push({ slot: s.slot, reason: REASON.STORE_CONFLICT }); continue; }
    moved.push(s);
    mediaRecords.push({
      id: mediaId(plan.orderId, s.slot), orderId: plan.orderId, slot: s.slot, data: s.data, bytes: s.data.length,
      createdAt: ex && Number(ex.createdAt) ? Number(ex.createdAt) : now, updatedAt: now,
    });
  }
  if (moved.length === 0) return { ok: false, moved: [], skipped, mediaRecords: [], record: null, freedBytes: 0 };

  const movedSlots = new Set(moved.map((m) => m.slot));
  const next = { ...rec };
  if (movedSlots.has(SLOT_REF)) {
    next.referenceImage = ''; next.hasReferenceImage = true;
    if (str(opts.thumb)) next.refThumb = opts.thumb;
    else if (typeof rec.refThumb !== 'string') next.refThumb = '';
  }
  if (movedSlots.has(SLOT_SIG)) { next.signature = ''; next.hasSignature = true; }
  if (Array.isArray(rec.deliveries)) {
    next.deliveries = rec.deliveries.map((d) => (
      d && typeof d === 'object' && str(d.signature) && d.id != null && d.id !== '' && movedSlots.has(deliverySlot(d.id))
        ? { ...d, signature: '', hasSignature: true } : d));
  }
  Object.assign(next, pinDerivedDates(rec));
  next.mediaMigratedAt = now;
  next.updatedAt = Math.max(now, (Number(rec.updatedAt) || 0) + 1);
  return { ok: true, moved, skipped, mediaRecords, record: next, freedBytes: moved.reduce((n, m) => n + m.bytes, 0) };
}

/**
 * يتحقق من نتيجة ترحيل طلب (دالة نقية على ما أُعيدت قراءته): الطلب أُفرغت حقوله والوسائط مطابقة حرفاً بحرف.
 * @param {Object|undefined} after — الطلب بعد الكتابة
 * @param {Array<{slot:string,data:string}>} moved
 * @param {Map<string,Object|undefined>} storedBySlot — سجلات الوسائط كما أُعيدت قراءتها
 * @returns {{ok:boolean, reason?:string}}
 */
export function verifyMigrated(after, moved, storedBySlot) {
  if (!after || typeof after !== 'object') return { ok: false, reason: 'order-missing-after' };
  for (const m of moved) {
    const rec = storedBySlot.get(m.slot);
    if (!rec || rec.data !== m.data) return { ok: false, reason: 'media-mismatch:' + m.slot };
    if (m.slot === SLOT_REF && (str(after.referenceImage) || after.hasReferenceImage !== true)) return { ok: false, reason: 'ref-not-cleared' };
    if (m.slot === SLOT_SIG && (str(after.signature) || after.hasSignature !== true)) return { ok: false, reason: 'sig-not-cleared' };
    if (m.slot.startsWith('del-')) {
      const d = (Array.isArray(after.deliveries) ? after.deliveries : []).find((x) => x && deliverySlot(x.id) === m.slot);
      if (!d || str(d.signature) || d.hasSignature !== true) return { ok: false, reason: 'delivery-not-cleared:' + m.slot };
    }
  }
  return { ok: true };
}

/**
 * ملخص خطة بلا بيانات الصور (لا يحمل نصوص base64 في الذاكرة).
 * @param {ReturnType<typeof planOrderMigration>} plan
 * @returns {{id:string, bytes:number, slots:string[], skipped:Array<{slot:string,reason:string}>}}
 */
export function summarizePlan(plan) {
  return { id: plan.orderId, bytes: plan.bytes, slots: plan.slots.map((s) => s.slot), skipped: plan.skipped };
}

/* ==========================================================================
   2. الجاهزية (نقية)
   ========================================================================== */

const MB = 1048576;
const mb = (n) => (Math.round((Number(n) / MB) * 10) / 10) + ' MB';

/**
 * هل يكفي التخزين؟ يلزم STORAGE_HEADROOM_FACTOR × حجم الوسائط المضمَّنة. تعذّر التقدير ⟵ يمرّ بتنبيه.
 * @param {{usage:number|null, quota:number|null}|null} status
 * @param {number} inlineBytes
 */
function checkStorage(status, inlineBytes) {
  const base = { id: 'storage', label: 'مساحة تخزين كافية' };
  const usage = status && Number(status.usage); const quota = status && Number(status.quota);
  if (!status || !Number.isFinite(usage) || !Number.isFinite(quota) || !quota) {
    return { ...base, ok: true, detail: 'تعذّر تقدير المساحة في هذا المتصفح (لا يمنع)', hint: '' };
  }
  const free = quota - usage; const need = inlineBytes * STORAGE_HEADROOM_FACTOR;
  if (free < need) {
    return { ...base, ok: false, detail: 'المتاح ' + mb(free) + ' والمطلوب نحو ' + mb(need), hint: 'احذف نسخاً احتياطية قديمة أو أفرغ مساحة ثم أعد الفحص' };
  }
  return { ...base, ok: true, detail: 'المتاح ' + mb(free) + ' والمطلوب نحو ' + mb(need), hint: '' };
}

/**
 * تقييم الجاهزية (دالة نقية، بلا قراءة من المخزن).
 * @param {Object} input
 * @param {boolean} input.writable — حارس MEDIA_MIN_BUILD
 * @param {boolean} input.storeExists — مخزن orderMedia موجود في قاعدة البيانات
 * @param {Object|null} input.sync — {usedCloud, dirtySince, blocked, conflicts, queueSize}
 * @param {Object|null} [input.storage] — {usage, quota}
 * @param {number} [input.inlineBytes=0]
 * @param {number} [input.candidates=0] — عدد الطلبات المرشّحة للترحيل
 * @param {boolean} [input.running=false] — ترحيل يعمل الآن
 * @param {Object|null} [input.backup] — {ok, errors, createdAt, counts}
 * @param {Object|null} [input.live] — أعداد المخازن الحالية
 * @param {number} [now]
 * @returns {{ready:boolean, canAttempt:boolean, checks:Array, blockers:Array, reason:string}}
 *   canAttempt: كل الشروط ما عدا النسخة (تُؤخذ تلقائياً عند البدء).
 */
export function evaluateMigrationReadiness(input = {}, now = Date.now()) {
  const inp = input && typeof input === 'object' ? input : {};
  const checks = [];
  checks.push(inp.running
    ? { id: 'idle', label: 'لا ترحيل آخر يعمل', ok: false, detail: 'يوجد ترحيل يعمل الآن (في هذا التبويب أو غيره)', hint: 'انتظر انتهاءه أو أوقفه' }
    : { id: 'idle', label: 'لا ترحيل آخر يعمل', ok: true, detail: '', hint: '' });
  checks.push(inp.writable
    ? { id: 'gate', label: 'الكتابة في الوسائط مفعّلة', ok: true, detail: '', hint: '' }
    : { id: 'gate', label: 'الكتابة في الوسائط مفعّلة', ok: false, detail: 'الحد الأدنى لإصدار المزامنة لم يبلغ حدّ الوسائط', hint: 'حدّث التطبيق إلى آخر إصدار' });
  checks.push(inp.storeExists
    ? { id: 'store', label: 'مخزن الوسائط موجود', ok: true, detail: '', hint: '' }
    : { id: 'store', label: 'مخزن الوسائط موجود', ok: false, detail: 'قاعدة البيانات المحلية أقدم من الإصدار 12', hint: 'أعد تحميل التطبيق ليُرقّي قاعدة البيانات' });
  checks.push(checkSync(inp.sync));
  checks.push(checkStorage(inp.storage || null, Number(inp.inlineBytes) || 0));

  /* النسخة: تُؤخذ عند البدء. قبلها تُعرض كخطوة قادمة (ليست مانعاً)، وبعدها تُقيَّم بنفس معيار الدفتر. */
  let backupCheck;
  if (!inp.backup) backupCheck = { id: 'backup', label: 'نسخة احتياطية جديدة وسليمة', ok: false, detail: 'تُؤخذ وتُفحص تلقائياً عند الضغط على «ابدأ الترحيل»', hint: '' };
  else backupCheck = checkBackup(inp.backup, inp.live || null, now);
  checks.push(backupCheck);

  const blockers = checks.filter((c) => !c.ok);
  const canAttempt = checks.filter((c) => c.id !== 'backup').every((c) => c.ok) && Number(inp.candidates) > 0;
  const ready = blockers.length === 0 && Number(inp.candidates) > 0;
  let reason = '';
  if (!(Number(inp.candidates) > 0)) reason = 'لا توجد وسائط مضمَّنة للترحيل';
  else if (blockers.length > 0) reason = 'لا يمكن البدء: ' + blockers[0].detail;
  return { ready, canAttempt, checks, blockers, reason };
}

/* ==========================================================================
   3. التبعيات (قابلة للاستبدال في الاختبار)
   ========================================================================== */

const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

export const migrationDeps = {
  readOrder: (id) => idb.get(STORES.ORDERS, id),
  readMedia: (orderId, slot) => idb.get(STORES.ORDER_MEDIA, mediaId(orderId, slot)),
  readBatch: (after, limit) => idb.readBatchAfter(STORES.ORDERS, after, limit),
  write: (plan, opts) => idb.writeBatch(plan, opts),
  thumb: (data) => thumbFromDataUrl(data),
  writable: () => isMediaWritable(),
  storeExists: async () => { const db = await idb.openDB(); return db.objectStoreNames.contains(STORES.ORDER_MEDIA); },
  readSync: () => authorityDeps.readSync(),
  countLive: () => authorityDeps.countLive(),
  createBackup: (o) => createBackup(o),
  verifyBackup: (id) => verifyBackup(id),
  storageStatus: () => getStorageStatus(),
  now: () => Date.now(),
  yieldFn: defaultYield,
};

/* ==========================================================================
   4. قفل التشغيل (تبويبان معاً ممنوعان)
   ========================================================================== */

let running = false;

function readLock(now) {
  try {
    const v = Number(localStorage.getItem(LOCK_KEY));
    return Number.isFinite(v) && v > 0 && now - v < LOCK_TTL_MS;
  } catch (e) { return false; }
}
function touchLock(now) { try { localStorage.setItem(LOCK_KEY, String(now)); } catch (e) { /* ignore */ } }
function dropLock() { try { localStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ } }

/** هل ترحيل يعمل الآن (هذا التبويب أو قفل حديث من تبويب آخر)؟ */
export function isMigrationRunning(now = Date.now()) { return running || readLock(now); }

/** للاختبار فقط: يمسح الحالة. */
export function _resetForTest() { running = false; dropLock(); }

/* ==========================================================================
   5. المسح (قراءة فقط)
   ========================================================================== */

/**
 * يمسح الطلبات على دفعات ويجمع المرشّحة للترحيل (بيانات وصفية فقط، بلا نصوص الصور). للقراءة فقط.
 * @param {Object} [opts]
 * @param {number} [opts.batchSize=25]
 * @param {Object} [opts.deps]
 * @param {()=>boolean} [opts.shouldCancel]
 * @param {(p:{scanned:number})=>void} [opts.onProgress]
 * @returns {Promise<{cancelled:boolean, scanned:number, candidates:Array, inlineBytes:number, ordersWithSkips:number, byReason:Object<string,number>}>}
 */
export async function scanInlineMedia(opts = {}) {
  const d = { ...migrationDeps, ...(opts.deps || {}) };
  const batchSize = Math.max(1, Math.floor(Number(opts.batchSize)) || 25);
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : () => false;
  const out = { cancelled: false, scanned: 0, candidates: [], inlineBytes: 0, ordersWithSkips: 0, byReason: {} };
  let after;
  for (;;) {
    if (shouldCancel()) { out.cancelled = true; break; }
    const { records, lastKey, done } = await d.readBatch(after, batchSize);
    for (const rec of records || []) {
      if (!rec || typeof rec !== 'object') continue;
      out.scanned += 1;
      const plan = planOrderMigration(rec);
      for (const s of plan.skipped) out.byReason[s.reason] = (out.byReason[s.reason] || 0) + 1;
      if (plan.skipped.length > 0) out.ordersWithSkips += 1;
      if (plan.slots.length > 0) { out.candidates.push(summarizePlan(plan)); out.inlineBytes += plan.bytes; }
    }
    after = lastKey;
    if (typeof opts.onProgress === 'function') opts.onProgress({ scanned: out.scanned });
    if (done || !records || records.length === 0) break;
    await d.yieldFn();
  }
  return out;
}

/* ==========================================================================
   6. ترحيل طلب واحد (معاملة ذرّية)
   ========================================================================== */

/**
 * يرحّل وسائط طلب واحد. لا يرمي أبداً: يُرجع status = migrated | nothing | skipped | missing | raced | failed.
 * @param {string} id
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 * @returns {Promise<{orderId:string, status:string, moved?:string[], skipped?:Array, freedBytes?:number, thumbOk?:boolean, reason?:string}>}
 */
export async function migrateOrder(id, opts = {}) {
  const d = { ...migrationDeps, ...(opts.deps || {}) };
  const orderId = String(id);
  try {
    if (!d.writable()) return { orderId, status: 'failed', reason: 'media-writes-disabled' };
    for (let attempt = 0; attempt < 2; attempt++) {
      const rec = await d.readOrder(id);
      if (!rec) return { orderId, status: 'missing' };
      const plan = planOrderMigration(rec);
      if (plan.slots.length === 0) return { orderId, status: plan.skipped.length ? 'skipped' : 'nothing', skipped: plan.skipped };

      const existing = new Map();
      for (const s of plan.slots) { const m = await d.readMedia(plan.orderId, s.slot); if (m) existing.set(s.slot, m); }
      const ref = plan.slots.find((s) => s.slot === SLOT_REF);
      const thumb = ref ? str(await d.thumb(ref.data)) : '';

      const w = buildMigrationWrite(rec, plan, { thumb, existingMedia: existing, now: d.now() });
      if (!w.ok) return { orderId, status: 'skipped', skipped: w.skipped };

      try {
        await d.write(
          { [STORES.ORDER_MEDIA]: { records: w.mediaRecords }, [STORES.ORDERS]: { records: [w.record] } },
          { guards: { [STORES.ORDERS]: new Map([[rec.id, Number(rec.updatedAt) || 0]]) } },
        );
      } catch (e) {
        if (e && e.code === 'guard-mismatch') {
          if (attempt === 0) continue;                 /* عُدّل الطلب بعد قراءته: اقرأه من جديد مرة واحدة */
          return { orderId, status: 'raced', reason: 'guard-mismatch' };
        }
        return { orderId, status: 'failed', reason: errMsg(e) };   /* المعاملة أُلغيت كلها: لا مساس */
      }

      /* تحقق بعد الكتابة: وسائط مطابقة حرفاً بحرف وحقول مُفرَّغة */
      const after = await d.readOrder(id);
      const stored = new Map();
      for (const m of w.moved) stored.set(m.slot, await d.readMedia(plan.orderId, m.slot));
      const v = verifyMigrated(after, w.moved, stored);
      if (!v.ok) {
        try {   /* استعادة السجل الأصلي كاملاً (وسائط المخزن تبقى؛ لا ضرر منها) */
          await d.write({ [STORES.ORDERS]: { records: [{ ...rec, updatedAt: Math.max(d.now(), w.record.updatedAt + 1) }] } },
            { guards: { [STORES.ORDERS]: new Map([[rec.id, Number(w.record.updatedAt) || 0]]) } });
        } catch (e2) { return { orderId, status: 'failed', reason: 'verify-failed:' + v.reason + ' | restore-failed:' + errMsg(e2) }; }
        return { orderId, status: 'failed', reason: 'verify-failed:' + v.reason };
      }
      return { orderId, status: 'migrated', moved: w.moved.map((m) => m.slot), skipped: w.skipped, freedBytes: w.freedBytes, thumbOk: !ref || !!thumb };
    }
    return { orderId, status: 'raced', reason: 'guard-mismatch' };
  } catch (e) {
    return { orderId, status: 'failed', reason: errMsg(e) };
  }
}

/* ==========================================================================
   7. تشغيل الترحيل على قائمة طلبات
   ========================================================================== */

/**
 * @typedef {Object} MigrationSummary
 * @property {number} total
 * @property {number} migrated
 * @property {number} skipped
 * @property {number} raced
 * @property {number} failed
 * @property {number} thumbFailed
 * @property {number} freedBytes
 * @property {boolean} cancelled
 * @property {Array<{orderId:string, status:string, reason?:string}>} errors
 * @property {Object<string,number>} skippedByReason
 */

/**
 * يرحّل الطلبات واحداً واحداً (تسلسلياً)، قابل للإيقاف.
 * @param {string[]} ids
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 * @param {()=>boolean} [opts.shouldCancel] — يُفحص قبل كل طلب
 * @param {(p:Object)=>void} [opts.onProgress] — {done,total,migrated,skipped,raced,failed,freedBytes,currentId}
 * @returns {Promise<MigrationSummary>}
 */
export async function runMigration(ids, opts = {}) {
  const d = { ...migrationDeps, ...(opts.deps || {}) };
  const list = Array.isArray(ids) ? ids : [];
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : () => false;
  const sum = { total: list.length, migrated: 0, skipped: 0, raced: 0, failed: 0, thumbFailed: 0, freedBytes: 0, cancelled: false, errors: [], skippedByReason: {} };
  let done = 0;
  for (const id of list) {
    if (shouldCancel()) { sum.cancelled = true; break; }
    touchLock(d.now());
    const r = await migrateOrder(id, { deps: d });
    done += 1;
    for (const s of r.skipped || []) sum.skippedByReason[s.reason] = (sum.skippedByReason[s.reason] || 0) + 1;
    if (r.status === 'migrated') { sum.migrated += 1; sum.freedBytes += r.freedBytes || 0; if (r.thumbOk === false) sum.thumbFailed += 1; }
    else if (r.status === 'skipped' || r.status === 'nothing' || r.status === 'missing') sum.skipped += 1;
    else if (r.status === 'raced') { sum.raced += 1; if (sum.errors.length < MAX_ERRORS_KEPT) sum.errors.push({ orderId: r.orderId, status: r.status, reason: r.reason }); }
    else { sum.failed += 1; if (sum.errors.length < MAX_ERRORS_KEPT) sum.errors.push({ orderId: r.orderId, status: r.status, reason: r.reason }); }
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({ done, total: list.length, migrated: sum.migrated, skipped: sum.skipped, raced: sum.raced, failed: sum.failed, freedBytes: sum.freedBytes, currentId: r.orderId });
    }
    await d.yieldFn();
  }
  return sum;
}

/* ==========================================================================
   8. الجاهزية الحيّة والبدء
   ========================================================================== */

/**
 * يجمع المدخلات الحيّة ويقيّم الجاهزية (للواجهة).
 * @param {Object} [opts]
 * @param {{candidates:Array, inlineBytes:number}} [opts.scan] — نتيجة مسح سابق
 * @param {boolean} [opts.running] — يتجاوز كشف «ترحيل يعمل» (للبدء: الفحص قبل رفع العلم)
 * @param {Object} [opts.deps]
 * @returns {Promise<Object>} نتيجة evaluateMigrationReadiness
 */
export async function collectMigrationReadiness(opts = {}) {
  const d = { ...migrationDeps, ...(opts.deps || {}) };
  const scan = opts.scan || { candidates: [], inlineBytes: 0 };
  let storage = null;
  try { storage = await d.storageStatus(); } catch (e) { storage = null; }
  return evaluateMigrationReadiness({
    writable: d.writable(), storeExists: await d.storeExists(), sync: d.readSync(), storage,
    inlineBytes: scan.inlineBytes, candidates: scan.candidates.length,
    running: typeof opts.running === 'boolean' ? opts.running : isMigrationRunning(d.now()),
  }, d.now());
}

/**
 * البدء الكامل: فحص مسبق ← نسخة احتياطية مفحوصة ← إعادة فحص ← ترحيل. لا يرمي.
 * status = done | cancelled | blocked | busy | failed
 * @param {Object} opts
 * @param {{candidates:Array<{id:string}>, inlineBytes:number}} opts.scan — نتيجة المسح (الطلبات المرشّحة)
 * @param {Object} [opts.deps]
 * @param {()=>boolean} [opts.shouldCancel]
 * @param {(p:Object)=>void} [opts.onProgress]
 * @param {(phase:string)=>void} [opts.onPhase] — 'backup' | 'migrate'
 * @returns {Promise<{status:string, reason:string, summary?:MigrationSummary, backupId?:string, readiness?:Object}>}
 */
export async function startMigration(opts = {}) {
  const d = { ...migrationDeps, ...(opts.deps || {}) };
  const scan = opts.scan && Array.isArray(opts.scan.candidates) ? opts.scan : { candidates: [], inlineBytes: 0 };
  const phase = (p) => { if (typeof opts.onPhase === 'function') opts.onPhase(p); };
  if (isMigrationRunning(d.now())) return { status: 'busy', reason: 'يوجد ترحيل يعمل الآن' };
  running = true; touchLock(d.now());
  try {
    /* 1) فحص مسبق قبل أي نسخة أو كتابة */
    const pre = await collectMigrationReadiness({ scan, running: false, deps: d });
    const preBlockers = pre.checks.filter((c) => c.id !== 'backup' && !c.ok);
    if (preBlockers.length > 0 || scan.candidates.length === 0) {
      return { status: 'blocked', reason: scan.candidates.length === 0 ? 'لا توجد وسائط مضمَّنة للترحيل' : 'لا يمكن البدء: ' + preBlockers[0].detail, readiness: pre };
    }

    /* 2) نسخة احتياطية جديدة + فحصها */
    phase('backup');
    const made = await d.createBackup({ label: 'قبل ترحيل وسائط الطلبات' });
    if (!made || !made.ok) return { status: 'failed', reason: 'تعذّر أخذ النسخة الاحتياطية: ' + ((made && made.error) || 'سبب غير معروف') };
    const ver = await d.verifyBackup(made.id);
    const backup = { id: made.id, ok: !!(ver && ver.ok), errors: (ver && ver.errors) || [], createdAt: (ver && ver.createdAt) || 0, counts: (ver && ver.counts) || {} };

    /* 3) إعادة التقييم بعد النسخة: البيانات لم تتغيّر ومطابقة للنسخة، والمزامنة ما زالت نظيفة */
    const live = await d.countLive();
    const post = evaluateMigrationReadiness({
      writable: d.writable(), storeExists: await d.storeExists(), sync: d.readSync(), storage: null,
      inlineBytes: scan.inlineBytes, candidates: scan.candidates.length, running: false, backup, live,
    }, d.now());
    if (!post.ready) return { status: 'blocked', reason: post.reason, readiness: post, backupId: made.id };

    /* 4) الترحيل */
    phase('migrate');
    const summary = await runMigration(scan.candidates.map((c) => c.id), { deps: d, shouldCancel: opts.shouldCancel, onProgress: opts.onProgress });
    return { status: summary.cancelled ? 'cancelled' : 'done', reason: '', summary, backupId: made.id };
  } catch (e) {
    return { status: 'failed', reason: errMsg(e) };
  } finally {
    running = false; dropLock();
  }
}
