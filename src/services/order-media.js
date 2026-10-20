/* ==========================================================================
   order-media.js — منطق وسائط الطلبات النقي (v3.3.86)
   ==========================================================================
   الصور والتوقيعات كانت مخزّنة (base64) داخل سجل الطلب، فكل قراءة للطلبات تسحبها معها.
   الفصل: كل وسيط سجل مستقل في مخزن orderMedia معرّفه  orderId + ':' + slot.
   هذه الوحدة نقية (بلا idb): صيغ المعرّفات، المسافات (slots)، قراءة الوسائط المضمَّنة في الطلب،
   وكشف السجلات اليتيمة من المفاتيح فقط (بلا قراءة الصور).
   المراحل:  3.3.86 المخزن والمستودع والقراءة المزدوجة (لا كتابة)  ·  3.3.87 الكتابة الجديدة في المخزن  ·  3.3.88 نقل القديم.
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
