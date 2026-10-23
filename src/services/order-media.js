/* ==========================================================================
   order-media.js — منطق وسائط الطلبات النقي (v3.3.86)
   ==========================================================================
   الصور والتوقيعات كانت مخزّنة (base64) داخل سجل الطلب، فكل قراءة للطلبات تسحبها معها.
   الفصل: كل وسيط سجل مستقل في مخزن orderMedia معرّفه  orderId + ':' + slot.
   هذه الوحدة نقية (بلا idb): صيغ المعرّفات، المسافات (slots)، قراءة الوسائط المضمَّنة في الطلب،
   وكشف السجلات اليتيمة من المفاتيح فقط (بلا قراءة الصور).
   المراحل:  3.3.86 المخزن والمستودع والقراءة المزدوجة  ·  3.3.87 الكتابة الجديدة في المخزن (externalizeMedia)  ·  3.3.88 إصلاح أداة التشخيص  ·  لاحقاً: نقل القديم.
   ========================================================================== */

/** المسافات الثابتة. توقيعات التسليم: del-<رقم/معرّف التسليم>. */
export const SLOT_REF = 'ref';
export const SLOT_SIG = 'sig';
const DELIVERY_PREFIX = 'del-';

/**
 * أول إصدار (بناء) يعرف مخزن orderMedia ويحفظه في المزامنة. الكتابة في المخزن ممنوعة قبل أن يُرفع
 * MIN_CLIENT_BUILD (sync/min-version.js) إلى هذا الحد: جهاز أقدم يرفع بيان مخازن بلا orderMedia
 * فيمحو الوسائط من السحابة. (3.3.86 ⟵ 3003086)
 */
export const MEDIA_MIN_BUILD = 3003086;

/**
 * هل المسافة صالحة؟ (ref | sig | del-<غير فارغ بلا نقطتين>)
 * @param {string} slot
 * @returns {boolean}
 */
export function isValidSlot(slot) {
  if (slot === SLOT_REF || slot === SLOT_SIG) return true;
  return typeof slot === 'string' && slot.startsWith(DELIVERY_PREFIX) && slot.length > DELIVERY_PREFIX.length && !slot.includes(':');
}

/**
 * مسافة توقيع تسليم.
 * @param {string|number} key — معرّف التسليم أو رقمه
 * @returns {string}
 */
export function deliverySlot(key) { return DELIVERY_PREFIX + String(key).replace(/:/g, '_'); }

/**
 * معرّف سجل الوسيط. معرّفات الطلبات من uid() بلا نقطتين، فالتفكيك غير ملتبس.
 * @param {string} orderId
 * @param {string} slot
 * @returns {string}
 * @throws {Error} إن كان orderId فارغاً أو يحوي نقطتين أو المسافة غير صالحة
 */
export function mediaId(orderId, slot) {
  const o = String(orderId == null ? '' : orderId);
  if (!o || o.includes(':')) throw new Error('معرّف طلب غير صالح للوسائط');
  if (!isValidSlot(slot)) throw new Error('مسافة وسائط غير صالحة: ' + slot);
  return o + ':' + slot;
}

/**
 * يفكّك معرّف وسيط. null إن لم يكن بصيغة صالحة.
 * @param {string} id
 * @returns {{orderId:string, slot:string}|null}
 */
export function parseMediaId(id) {
  if (typeof id !== 'string') return null;
  const i = id.indexOf(':');
  if (i <= 0) return null;
  const orderId = id.slice(0, i); const slot = id.slice(i + 1);
  return isValidSlot(slot) ? { orderId, slot } : null;
}

const str = (v) => (typeof v === 'string' ? v : '');

/**
 * الوسائط المضمَّنة في سجل الطلب (الشكل القديم) كخريطة مسافة ⟵ بيانات (غير الفارغة فقط).
 * التسليمات: deliveries[i].signature ⟵ del-<id أو i>.
 * @param {Object} order
 * @returns {Object<string,string>}
 */
export function inlineMediaOf(order) {
  const out = {};
  if (!order || typeof order !== 'object') return out;
  if (str(order.referenceImage)) out[SLOT_REF] = order.referenceImage;
  if (str(order.signature)) out[SLOT_SIG] = order.signature;
  if (Array.isArray(order.deliveries)) {
    order.deliveries.forEach((d, i) => {
      if (d && str(d.signature)) out[deliverySlot(d.id != null ? d.id : i)] = d.signature;
    });
  }
  return out;
}

/**
 * القيمة المضمَّنة لمسافة (للقراءة المزدوجة). فارغة إن لم توجد.
 * @param {Object} order
 * @param {string} slot
 * @returns {string}
 */
export function inlineValue(order, slot) {
  const m = inlineMediaOf(order);
  return m[slot] || '';
}

/**
 * يكشف سجلات الوسائط اليتيمة من **المفاتيح فقط**: مفتاح لا طلب له (لا في الطلبات ولا في سلة المحذوفات).
 * طلب في السلة ليس يتيماً (قد يُسترجع فتحتاج وسائطه).
 * @param {Array<string>} mediaKeys — مفاتيح مخزن orderMedia
 * @param {Iterable<string>} orderIds — معرّفات الطلبات الحالية
 * @param {Iterable<string>} [trashOrderIds] — معرّفات الطلبات الموجودة في السلة
 * @returns {{orphans:string[], invalid:string[], byOrder:Map<string,number>}}
 */
export function findOrphanMedia(mediaKeys, orderIds, trashOrderIds = []) {
  const live = new Set(orderIds || []);
  const trashed = new Set(trashOrderIds || []);
  const orphans = []; const invalid = []; const byOrder = new Map();
  for (const k of Array.isArray(mediaKeys) ? mediaKeys : []) {
    const p = parseMediaId(k);
    if (!p) { invalid.push(String(k)); continue; }
    byOrder.set(p.orderId, (byOrder.get(p.orderId) || 0) + 1);
    if (!live.has(p.orderId) && !trashed.has(p.orderId)) orphans.push(k);
  }
  return { orphans, invalid, byOrder };
}

/**
 * هل الكتابة في مخزن الوسائط مسموحة عند الحد الأدنى الحالي للمزامنة؟
 * @param {number} minClientBuild — MIN_CLIENT_BUILD
 * @returns {boolean}
 */
export function mediaWritesAllowed(minClientBuild) { return Number(minClientBuild) >= MEDIA_MIN_BUILD; }

/* ==========================================================================
   الكتابة (v3.3.87): إخراج الوسائط الجديدة من سجل الطلب إلى orderMedia
   ========================================================================== */

/**
 * هل القيمة وسيط صالح للتخزين (dataURL)؟ ما سواها يبقى مضمَّناً ولا يُمسّ (دفاعي: لا نُضيّع صيغة لا نعرفها).
 * @param {*} v
 * @returns {boolean}
 */
export function isMediaData(v) { return typeof v === 'string' && v.startsWith('data:') && v.length > 5; }

/**
 * هل للطلب صورة مرجعية (مضمَّنة قديمة أو مفصولة بعلامة)؟ — بلا قراءة المخزن.
 * @param {Object} o
 * @returns {boolean}
 */
export function hasReferenceImage(o) { return !!(o && (o.hasReferenceImage === true || str(o.referenceImage))); }

/**
 * هل للطلب توقيع تسليم؟ (مضمَّن أو مفصول بعلامة)
 * @param {Object} o
 * @returns {boolean}
 */
export function hasOrderSignature(o) { return !!(o && (o.hasSignature === true || str(o.signature))); }

/**
 * هل لتسليمة توقيع؟ (مضمَّن أو مفصول بعلامة)
 * @param {Object} d
 * @returns {boolean}
 */
export function deliveryHasSignature(d) { return !!(d && (d.hasSignature === true || str(d.signature))); }

/**
 * يفصل الوسائط **التي تغيّرت** عن حقول الطلب المراد كتابتها. دالة نقية (لا تعدّل المدخلات).
 *  - صورة/توقيع جديد (dataURL) ⟵ يذهب إلى orderMedia ويُفرَّغ الحقل ويُضاف علم hasReferenceImage/hasSignature.
 *  - القيمة المضمَّنة القديمة **غير المتغيّرة** تبقى مضمَّنة (لا ترحيل ضمني؛ الترحيل لاحقاً).
 *  - إفراغ صريح ('' أو null) ⟵ حذف الوسيط من المخزن وإسقاط العلم. لكن حقل فارغ مع علم true (نسخة من سجل مفصول
 *    مثل {...order, status}) يعني «لم يتغيّر» ولا يحذف شيئاً.
 *  - التسليمات: كل تسليمة بتوقيع جديد ⟵ مسافة del-<id>؛ تسليمة حُذفت (تراجع) ⟵ يُحذف وسيطها.
 * @param {Object} patch — حقول الكتابة (عند الإنشاء: السجل كاملاً)
 * @param {Object|null} [existing] — السجل الحالي (null عند الإنشاء)
 * @returns {{record:Object, puts:Array<{slot:string,data:string}>, deletes:string[]}}
 */
export function externalizeMedia(patch, existing = null) {
  const record = { ...(patch || {}) };
  const ex = existing && typeof existing === 'object' ? existing : null;
  const puts = []; const deletes = [];

  const one = (field, slot, flag, isRef) => {
    if (!(field in record)) return;
    const v = record[field];
    if (isMediaData(v)) {
      if (ex && ex[field] === v) return;                       /* مضمَّن قديم لم يتغيّر */
      puts.push({ slot, data: v });
      record[field] = ''; record[flag] = true;
      if (isRef) record.refThumb = typeof patch.refThumb === 'string' ? patch.refThumb : '';
    } else if (v === '' || v === null || v === undefined) {
      if (record[flag] === true) { record[field] = ''; return; }   /* نسخة من سجل مفصول: لم يتغيّر */
      if (ex && (ex[flag] === true || str(ex[field]))) {
        if (ex[flag] === true) deletes.push(slot);
        record[field] = ''; record[flag] = false;
        if (isRef) record.refThumb = '';
      } else {
        record[field] = '';
        if (flag in record) record[flag] = false;
      }
    }
  };
  one('referenceImage', SLOT_REF, 'hasReferenceImage', true);
  one('signature', SLOT_SIG, 'hasSignature', false);

  if (Array.isArray(record.deliveries)) {
    const exArr = ex && Array.isArray(ex.deliveries) ? ex.deliveries : [];
    const exById = new Map(exArr.filter((d) => d && d.id != null).map((d) => [String(d.id), d]));
    const seen = new Set();
    record.deliveries = record.deliveries.map((d) => {
      if (!d || typeof d !== 'object') return d;
      if (d.id != null) seen.add(String(d.id));
      if (d.id == null || !isMediaData(d.signature)) return d;
      const old = exById.get(String(d.id));
      if (old && old.signature === d.signature) return d;      /* مضمَّن قديم لم يتغيّر */
      puts.push({ slot: deliverySlot(d.id), data: d.signature });
      return { ...d, signature: '', hasSignature: true };
    });
    for (const [id, old] of exById) {
      if (!seen.has(id) && old.hasSignature === true) deletes.push(deliverySlot(id));
    }
  }
  return { record, puts, deletes: [...new Set(deletes)] };
}
