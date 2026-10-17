/* ==========================================================================
   media-diagnostic.js — تشخيص حجم الصور والتوقيعات داخل الطلبات (v3.3.72)
   ==========================================================================
   السبب: الصورة المرجعية (order.referenceImage) والتوقيع (order.signature وتوقيعات
   التسليمات الجزئية deliveries[].signature) تُخزَّن داخل سجل الطلب نفسه (نص base64 قد يبلغ
   مئات الكيلوبايت)، فكل قراءة لقائمة الطلبات تقرأ هذه الوسائط معها فتبطؤ.
   هذه الأداة تقيس حجمها فقط لنعرف أين المشكلة قبل أي تغيير في طريقة التخزين.

   ضمانات السلامة:
   - للقراءة فقط: لا تستدعي أي دالة كتابة؛ القراءة بمعاملات readonly (readBatchAfter).
   - لا تعمل تلقائياً: لا تُستدعى إلا عند ضغط المستخدم الزر في «صيانة البيانات».
   - لا تجمّد الواجهة ولا تملأ الذاكرة: تقرأ الطلبات على دفعات صغيرة وتُرخي التحكم للمتصفح
     بين الدفعات، ولا تحتفظ بالسجلات (تحتفظ بالأرقام فقط)، ويمكن إيقافها في أي لحظة.
   - الحجم تقريبي = طول نص الصورة/التوقيع (نص data:image…base64 حروفه ASCII فيساوي طوله بالبايت تقريباً).
   دوال الحساب نقية بلا DOM، وتقبل بدائل (readBatch/yieldFn) للاختبار.
   ========================================================================== */

import { readBatchAfter } from '../data/idb.js';
import { STORES } from '../core/config.js';

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

/** تقرير فارغ. */
export function emptyMediaReport() {
  return {
    totalOrders: 0, ordersWithImage: 0, ordersWithSignature: 0, ordersWithMedia: 0,
    imageBytes: 0, signatureBytes: 0, totalBytes: 0, avgBytesPerMediaOrder: 0,
    topOrders: [], cancelled: false, durationMs: 0,
  };
}

/**
 * يضيف طلباً إلى التقرير (يعدّل التقرير الممرَّر ولا يمسّ الطلب).
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
 * يفحص كل الطلبات على دفعات ويعيد تقرير الأحجام. للقراءة فقط.
 * @param {Object} [opts]
 * @param {number} [opts.batchSize=25]
 * @param {number} [opts.topN=5]
 * @param {(afterKey:*, limit:number)=>Promise<{records:Array,lastKey:*,done:boolean}>} [opts.readBatch]
 *        بديل للقراءة (الاختبار)؛ الافتراضي: readBatchAfter على مخزن الطلبات
 * @param {()=>Promise<void>} [opts.yieldFn] — إرخاء التحكم بين الدفعات
 * @param {(p:{scanned:number})=>void} [opts.onProgress]
 * @param {()=>boolean} [opts.shouldCancel]
 * @returns {Promise<Object>} التقرير (cancelled=true إن أُوقف قبل الانتهاء)
 */
export async function diagnoseOrderMedia(opts = {}) {
  const batchSize = Math.max(1, Math.floor(Number(opts.batchSize)) || 25);
  const topN = Math.max(1, Math.floor(Number(opts.topN)) || 5);
  const readBatch = opts.readBatch || ((after, limit) => readBatchAfter(STORES.ORDERS, after, limit));
  const yieldFn = opts.yieldFn || defaultYield;
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : () => false;

  const started = nowMs();
  const report = emptyMediaReport();
  let after;
  for (;;) {
    if (shouldCancel()) { report.cancelled = true; break; }
    const { records, lastKey, done } = await readBatch(after, batchSize);
    for (const rec of records || []) {
      if (rec && typeof rec === 'object') addOrderToReport(report, rec, topN);
    }
    after = lastKey;
    if (typeof opts.onProgress === 'function') opts.onProgress({ scanned: report.totalOrders });
    if (done || !records || records.length === 0) break;
    await yieldFn();
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
 * @param {Object} report
 * @param {number|null} [storageUsage] — استخدام التطبيق للتخزين بالبايت (إن عُرف) لحساب النسبة
 * @returns {{level:'ok'|'info'|'warn', text:string, sharePercent:number|null}}
 */
export function assessMedia(report, storageUsage = null) {
  const total = Number(report && report.totalBytes) || 0;
  const sharePercent = Number.isFinite(storageUsage) && storageUsage > 0
    ? Math.min(100, Math.round((total / storageUsage) * 1000) / 10) : null;
  if (total === 0) return { level: 'ok', text: 'لا توجد صور ولا توقيعات داخل الطلبات.', sharePercent };
  if (total < 2 * MB) {
    return { level: 'ok', text: 'حجم الوسائط صغير (أقل من 2 MB) — لا أثر ملموس على السرعة.', sharePercent };
  }
  if (total < 10 * MB) {
    return { level: 'info', text: 'حجم الوسائط متوسط (2–10 MB): قد تلاحظ بطئاً في قائمة الطلبات على الأجهزة الضعيفة.', sharePercent };
  }
  return { level: 'warn', text: 'حجم الوسائط كبير (أكثر من 10 MB) داخل سجلات الطلبات: هذا على الأرجح سبب البطء، ويُنصح بفصلها في مخزن مستقل.', sharePercent };
}
