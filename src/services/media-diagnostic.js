/* ==========================================================================
   media-diagnostic.js — تشخيص حجم الصور والتوقيعات (v3.3.72، يقرأ orderMedia منذ v3.3.88)
   ==========================================================================
   السبب: الصورة المرجعية (order.referenceImage) والتوقيع (order.signature وتوقيعات
   التسليمات الجزئية deliveries[].signature) كانت تُخزَّن داخل سجل الطلب نفسه (نص base64 قد يبلغ
   مئات الكيلوبايت)، فكل قراءة لقائمة الطلبات تقرأ هذه الوسائط معها فتبطؤ.

   منذ v3.3.87 تُحفظ الوسائط الجديدة في مخزن مستقل (orderMedia) ولا يبقى في سجل الطلب إلا
   أعلام (hasReferenceImage/hasSignature) ومصغّر القائمة (refThumb). لذلك صار القياس من مصدرين:
     - «المضمَّن»: داخل سجلات الطلبات (الشكل القديم) — يُقرأ مع كل قائمة فيؤثر على السرعة.
     - «المفصول»: في مخزن orderMedia — لا يُقرأ مع القائمة فلا أثر له على سرعتها.
     - «المصغّرات»: refThumb داخل الطلبات (صغيرة) — تُقرأ مع القائمة.
     - «المنفصلة عن طلب»: سجلات orderMedia لطلب غير موجود في مخزن الطلبات (محذوف/في السلة/يتيمة)
       تُعدّ وتُقاس لكن لا تُنسب لطلب.
   الحقول القديمة في التقرير (imageBytes/signatureBytes/totalBytes/ordersWith*…) صارت «المجموع
   المنسوب لطلبات موجودة» (مضمَّن + مفصول). وما يؤثر على سرعة القائمة هو listBytes = مضمَّن + مصغّرات.

   ضمانات السلامة:
   - للقراءة فقط: لا تستدعي أي دالة كتابة؛ القراءة بمعاملات readonly (readBatchAfter) لمخزنَي
     الطلبات والوسائط.
   - لا تعمل تلقائياً: لا تُستدعى إلا عند ضغط المستخدم الزر في «صيانة البيانات».
   - لا تجمّد الواجهة ولا تملأ الذاكرة: تقرأ الطلبات ثم الوسائط على دفعات صغيرة وتُرخي التحكم للمتصفح
     بين الدفعات، ولا تحتفظ بالسجلات (تحتفظ بالأرقام ومعرّفات الطلبات فقط)، ويمكن إيقافها في أي لحظة.
   - الحجم تقريبي = طول نص الصورة/التوقيع (نص data:image…base64 حروفه ASCII فيساوي طوله بالبايت تقريباً).
   دوال الحساب نقية بلا DOM، وتقبل بدائل (readBatch/readMediaBatch/yieldFn) للاختبار.
   ========================================================================== */

import { readBatchAfter } from '../data/idb.js';
import { STORES } from '../core/config.js';
import { parseMediaId, isValidSlot, SLOT_REF } from './order-media.js';

const KB = 1024;
const MB = 1024 * 1024;

/**
 * الحجم التقريبي لحقل وسائط بالبايت: نص → طوله، Blob/File → size، غير ذلك 0.
 * @param {*} value
 * @returns {number}
 */
export function fieldBytes(value) {
  if (typeof value === 'string') return value.length;
  if (value && typeof value === 'object' && Number.isFinite(value.size)) return Math.max(0, value.size);
  return 0;
}

/**
 * وسائط طلب واحد.
 * التوقيع = order.signature + توقيعات التسليمات الجزئية (deliveries[].signature).
 * @param {Object} order
 * @returns {{imageBytes:number, signatureBytes:number, totalBytes:number, hasImage:boolean, hasSignature:boolean}}
 */
export function orderMediaBytes(order) {
  const o = order && typeof order === 'object' ? order : {};
  const imageBytes = fieldBytes(o.referenceImage);
  let signatureBytes = fieldBytes(o.signature);
  if (Array.isArray(o.deliveries)) {
    for (const d of o.deliveries) signatureBytes += fieldBytes(d && d.signature);
  }
  return {
    imageBytes, signatureBytes, totalBytes: imageBytes + signatureBytes,
    hasImage: imageBytes > 0, hasSignature: signatureBytes > 0,
  };
}

/**
 * حجم وسيط من مخزن orderMedia ونوعه.
 * المعرّف «<orderId>:<slot>»؛ ref ⟵ صورة، وsig وdel-* ⟵ توقيع. الحجم = طول النص (data URL) إن وُجد،
 * وإلا الحقل bytes المحفوظ، وإلا 0.
 * @param {Object} rec — سجل من مخزن orderMedia
 * @returns {{orderId:(string|null), slot:(string|null), kind:('image'|'signature'|null), bytes:number}|null}
 */
export function mediaRecordInfo(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const parsed = parseMediaId(rec.id);
  const orderId = parsed ? parsed.orderId : (typeof rec.orderId === 'string' && rec.orderId ? rec.orderId : null);
  const slot = parsed ? parsed.slot : (typeof rec.slot === 'string' ? rec.slot : null);
  let kind = null;
  if (slot === SLOT_REF) kind = 'image';
  else if (isValidSlot(slot)) kind = 'signature';
  const bytes = typeof rec.data === 'string'
    ? rec.data.length
    : (Number.isFinite(rec.bytes) ? Math.max(0, rec.bytes) : fieldBytes(rec.data));
  return { orderId, slot, kind, bytes };
}

/** تقرير فارغ. */
export function emptyMediaReport() {
  return {
    totalOrders: 0, ordersWithImage: 0, ordersWithSignature: 0, ordersWithMedia: 0,
    imageBytes: 0, signatureBytes: 0, totalBytes: 0, avgBytesPerMediaOrder: 0,
    /* المضمَّن داخل سجلات الطلبات (الشكل القديم) */
    inline: { imageBytes: 0, signatureBytes: 0, totalBytes: 0 },
    /* المفصول في مخزن orderMedia ومنسوب لطلب موجود */
    separated: { records: 0, orders: 0, imageBytes: 0, signatureBytes: 0, totalBytes: 0 },
    /* وسائط بلا طلب موجود في مخزن الطلبات (تُقاس ولا تُنسب) */
    detached: { records: 0, bytes: 0 },
    thumbBytes: 0,   /* مصغّرات refThumb داخل سجلات الطلبات */
    listBytes: 0,    /* ما يُقرأ مع قائمة الطلبات = مضمَّن + مصغّرات */
    mediaScanned: false,
    topOrders: [], cancelled: false, durationMs: 0,
  };
}

/**
 * يضيف طلباً (سجله المضمَّن ومصغّره) إلى التقرير (يعدّل التقرير الممرَّر ولا يمسّ الطلب).
 * وسائط مخزن orderMedia لا تدخل من هنا بل من diagnoseOrderMedia.
 * @param {Object} report
 * @param {Object} order
 * @param {number} [topN=5]
 */
export function addOrderToReport(report, order, topN = 5) {
  const m = orderMediaBytes(order);
  report.totalOrders += 1;
  if (m.hasImage) report.ordersWithImage += 1;
  if (m.hasSignature) report.ordersWithSignature += 1;
  if (m.hasImage || m.hasSignature) report.ordersWithMedia += 1;
  report.imageBytes += m.imageBytes;
  report.signatureBytes += m.signatureBytes;
  report.totalBytes += m.totalBytes;
  /* ما بداخل سجل الطلب نفسه: المضمَّن + مصغّر القائمة (يُقرآن مع كل قراءة للقائمة) */
  if (report.inline) {
    report.inline.imageBytes += m.imageBytes;
    report.inline.signatureBytes += m.signatureBytes;
    report.inline.totalBytes += m.totalBytes;
  }
  report.thumbBytes = (report.thumbBytes || 0) + fieldBytes(order && order.refThumb);
  report.listBytes = report.inline ? report.inline.totalBytes + report.thumbBytes : report.totalBytes;
  if (m.totalBytes > 0) {
    const o = order || {};
    report.topOrders.push({
      id: o.id, customerId: o.customerId || null,
      imageBytes: m.imageBytes, signatureBytes: m.signatureBytes, totalBytes: m.totalBytes,
    });
    report.topOrders.sort((a, b) => b.totalBytes - a.totalBytes);
    if (report.topOrders.length > topN) report.topOrders.length = topN;
  }
}

const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * يفحص كل الطلبات ثم مخزن الوسائط على دفعات ويعيد تقرير الأحجام. للقراءة فقط.
 * @param {Object} [opts]
 * @param {number} [opts.batchSize=25]
 * @param {number} [opts.topN=5]
 * @param {(afterKey:*, limit:number)=>Promise<{records:Array,lastKey:*,done:boolean}>} [opts.readBatch]
 *        بديل لقراءة الطلبات (الاختبار)؛ الافتراضي: readBatchAfter على مخزن الطلبات
 * @param {((afterKey:*, limit:number)=>Promise<{records:Array,lastKey:*,done:boolean}>)|null} [opts.readMediaBatch]
 *        بديل لقراءة مخزن الوسائط. الافتراضي: القراءة الحقيقية لمخزن orderMedia، إلا إن مُرِّر readBatch
 *        مخصّص (اختبار الطلبات وحدها) فتُتخطّى. مرِّر null لتعطيلها صراحةً.
 * @param {()=>Promise<void>} [opts.yieldFn] — إرخاء التحكم بين الدفعات
 * @param {(p:{scanned:number, phase:('orders'|'media'), mediaScanned:number})=>void} [opts.onProgress]
 * @param {()=>boolean} [opts.shouldCancel]
 * @returns {Promise<Object>} التقرير (cancelled=true إن أُوقف قبل الانتهاء)
 */
export async function diagnoseOrderMedia(opts = {}) {
  const batchSize = Math.max(1, Math.floor(Number(opts.batchSize)) || 25);
  const topN = Math.max(1, Math.floor(Number(opts.topN)) || 5);
  const readBatch = opts.readBatch || ((after, limit) => readBatchAfter(STORES.ORDERS, after, limit));
  /* مخزن الوسائط: يُقرأ افتراضياً فقط حين لا يُستبدل قارئ الطلبات (فاختبارات الطلبات وحدها لا تلمس القاعدة) */
  let readMediaBatch = null;
  if (opts.readMediaBatch !== undefined) readMediaBatch = opts.readMediaBatch;
  else if (!opts.readBatch) readMediaBatch = (after, limit) => readBatchAfter(STORES.ORDER_MEDIA, after, limit);
  const yieldFn = opts.yieldFn || defaultYield;
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : () => false;
  const progress = (p) => { if (typeof opts.onProgress === 'function') opts.onProgress(p); };

  const started = nowMs();
  const report = emptyMediaReport();
  /* معرّف الطلب ⟵ معرّف عميله (لتصنيف الوسائط: منسوبة/غير منسوبة) — أرقام ومعرّفات فقط، لا سجلات */
  const orderCustomer = new Map();
  /* الطلبات التي لها وسائط (مضمَّنة أو مفصولة) ⟵ أحجامها المجمَّعة */
  const perOrder = new Map();

  /* ---- المرحلة 1: الطلبات (المضمَّن + المصغّرات) ---- */
  let after;
  for (;;) {
    if (shouldCancel()) { report.cancelled = true; break; }
    const { records, lastKey, done } = await readBatch(after, batchSize);
    for (const rec of records || []) {
      if (!rec || typeof rec !== 'object') continue;
      addOrderToReport(report, rec, topN);
      const id = String(rec.id);
      orderCustomer.set(id, rec.customerId || null);
      const m = orderMediaBytes(rec);
      if (m.totalBytes > 0) perOrder.set(id, { id: rec.id, customerId: rec.customerId || null, imageBytes: m.imageBytes, signatureBytes: m.signatureBytes });
    }
    after = lastKey;
    progress({ scanned: report.totalOrders, phase: 'orders', mediaScanned: 0 });
    if (done || !records || records.length === 0) break;
    await yieldFn();
  }

  /* ---- المرحلة 2: مخزن الوسائط (إن اكتمل فحص الطلبات، فبدونه لا نعرف ما هو منسوب) ---- */
  if (!report.cancelled && typeof readMediaBatch === 'function') {
    report.mediaScanned = true;
    const sepOrders = new Set();
    let mediaCount = 0;
    let mAfter;
    for (;;) {
      if (shouldCancel()) { report.cancelled = true; break; }
      const { records, lastKey, done } = await readMediaBatch(mAfter, batchSize);
      for (const rec of records || []) {
        const info = mediaRecordInfo(rec);
        if (!info) continue;
        mediaCount += 1;
        if (!info.orderId || !info.kind || !orderCustomer.has(info.orderId)) {
          /* لا طلب موجود لها (أو معرّف/مسافة غير مفهومة): تُقاس ولا تُنسب */
          report.detached.records += 1;
          report.detached.bytes += info.bytes;
          continue;
        }
        const entry = perOrder.get(info.orderId)
          || { id: info.orderId, customerId: orderCustomer.get(info.orderId), imageBytes: 0, signatureBytes: 0 };
        const hadImage = entry.imageBytes > 0, hadSig = entry.signatureBytes > 0;
        if (info.kind === 'image') { entry.imageBytes += info.bytes; report.separated.imageBytes += info.bytes; report.imageBytes += info.bytes; }
        else { entry.signatureBytes += info.bytes; report.separated.signatureBytes += info.bytes; report.signatureBytes += info.bytes; }
        report.separated.records += 1;
        report.separated.totalBytes += info.bytes;
        report.totalBytes += info.bytes;
        sepOrders.add(info.orderId);
        perOrder.set(info.orderId, entry);
        /* عدّ الطلب مرة واحدة حتى لو جمع مضمَّناً ومفصولاً */
        if (!hadImage && entry.imageBytes > 0) report.ordersWithImage += 1;
        if (!hadSig && entry.signatureBytes > 0) report.ordersWithSignature += 1;
        if (!hadImage && !hadSig && (entry.imageBytes > 0 || entry.signatureBytes > 0)) report.ordersWithMedia += 1;
      }
      mAfter = lastKey;
      progress({ scanned: report.totalOrders, phase: 'media', mediaScanned: mediaCount });
      if (done || !records || records.length === 0) break;
      await yieldFn();
    }
    report.separated.orders = sepOrders.size;
    /* الأكبر حجماً بعد دمج المصدرين (ترتيب مستقر: عند التساوي يبقى ترتيب الفحص) */
    report.topOrders = [...perOrder.values()]
      .map((e) => ({ id: e.id, customerId: e.customerId, imageBytes: e.imageBytes, signatureBytes: e.signatureBytes, totalBytes: e.imageBytes + e.signatureBytes }))
      .sort((x, y) => y.totalBytes - x.totalBytes)
      .slice(0, topN);
  }

  report.avgBytesPerMediaOrder = report.ordersWithMedia > 0 ? Math.round(report.totalBytes / report.ordersWithMedia) : 0;
  report.durationMs = Math.round(nowMs() - started);
  return report;
}

/** بايت → «123.4 KB» (كيلوبايت بخانة عشرية). */
export function formatKB(bytes) {
  const v = Number(bytes);
  if (!Number.isFinite(v) || v < 0) return '—';
  return (Math.round((v / KB) * 10) / 10) + ' KB';
}

/**
 * تقييم نتيجة الفحص (معلومة فقط، لا يغيّر شيئاً).
 * ما يبطّئ قائمة الطلبات هو ما يُقرأ معها (listBytes = المضمَّن + المصغّرات)، لا المفصول في orderMedia؛
 * فالحكم على البطء يعتمد عليه. أما نسبة التخزين فتشمل كل الوسائط (المنسوبة وغير المنسوبة والمصغّرات).
 * تقرير بالشكل القديم (بلا inline) يُقيَّم بإجماليه كما كان.
 * @param {Object} report
 * @param {number|null} [storageUsage] — استخدام التطبيق للتخزين بالبايت (إن عُرف) لحساب النسبة
 * @returns {{level:'ok'|'info'|'warn', text:string, sharePercent:number|null}}
 */
export function assessMedia(report, storageUsage = null) {
  const total = Number(report && report.totalBytes) || 0;
  const detached = Number(report && report.detached && report.detached.bytes) || 0;
  const thumbs = Number(report && report.thumbBytes) || 0;
  const storageBytes = total + detached + thumbs;
  const sharePercent = Number.isFinite(storageUsage) && storageUsage > 0
    ? Math.min(100, Math.round((storageBytes / storageUsage) * 1000) / 10) : null;
  if (total === 0) return { level: 'ok', text: 'لا توجد صور ولا توقيعات داخل الطلبات.', sharePercent };

  const hasSplit = !!(report && report.inline);   /* تقرير v3.3.88+ (يفصل المضمَّن عن المفصول) */
  if (!hasSplit) {
    if (total < 2 * MB) {
      return { level: 'ok', text: 'حجم الوسائط صغير (أقل من 2 MB) — لا أثر ملموس على السرعة.', sharePercent };
    }
    if (total < 10 * MB) {
      return { level: 'info', text: 'حجم الوسائط متوسط (2–10 MB): قد تلاحظ بطئاً في قائمة الطلبات على الأجهزة الضعيفة.', sharePercent };
    }
    return { level: 'warn', text: 'حجم الوسائط كبير (أكثر من 10 MB) داخل سجلات الطلبات: هذا على الأرجح سبب البطء، ويُنصح بفصلها في مخزن مستقل.', sharePercent };
  }

  const list = Number(report.listBytes) || 0;
  const separated = Number(report.separated && report.separated.totalBytes) || 0;
  if (list < 2 * MB) {
    return {
      level: 'ok',
      text: separated > 0
        ? 'الوسائط محفوظة في مخزن مستقل ولا تُقرأ مع قائمة الطلبات — لا أثر لها على سرعتها.'
        : 'حجم الوسائط صغير (أقل من 2 MB) — لا أثر ملموس على السرعة.',
      sharePercent,
    };
  }
  if (list < 10 * MB) {
    return { level: 'info', text: 'ما يُقرأ مع قائمة الطلبات متوسط (2–10 MB، مضمَّن في الطلبات + مصغّرات): قد تلاحظ بطئاً على الأجهزة الضعيفة.', sharePercent };
  }
  return { level: 'warn', text: 'ما يُقرأ مع قائمة الطلبات كبير (أكثر من 10 MB، مضمَّن في الطلبات + مصغّرات): هذا على الأرجح سبب البطء، ويُنصح بنقل الوسائط المضمَّنة إلى المخزن المستقل.', sharePercent };
}
