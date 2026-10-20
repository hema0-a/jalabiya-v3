/* ==========================================================================
   order-media.js — مستودع وسائط الطلبات (v3.3.86)
   ==========================================================================
   سجل الوسيط: { id: orderId+':'+slot, orderId, slot, data, bytes, createdAt, updatedAt }.
   • القراءة المزدوجة getOrderMedia: المضمَّن في الطلب أولاً (الشكل القديم) ثم المخزن.
   • الكتابة محروسة: لا تُسمح قبل أن يرفع MIN_CLIENT_BUILD إلى MEDIA_MIN_BUILD (ضياع وسائط السحابة من جهاز قديم).
     لذلك في 3.3.86 لا شيء في التطبيق يكتب هنا (بلا تغيير سلوك)؛ يُفتح الباب في 3.3.87 برفع الحد.
   ========================================================================== */

import * as idb from '../idb.js';
import { STORES } from '../../core/config.js';
import { MIN_CLIENT_BUILD } from '../../sync/min-version.js';
import { mediaId, parseMediaId, isValidSlot, inlineValue, mediaWritesAllowed } from '../../services/order-media.js';

const S = STORES.ORDER_MEDIA;
let writeGate = () => mediaWritesAllowed(MIN_CLIENT_BUILD);

/** للاختبار فقط: يستبدل شرط السماح بالكتابة (null ⟵ الأصلي). @param {Function|null} fn */
export function _setWriteGateForTest(fn) { writeGate = fn || (() => mediaWritesAllowed(MIN_CLIENT_BUILD)); }

function assertWritable() {
  if (!writeGate()) {
    const e = new Error('الكتابة في وسائط الطلبات غير مفعّلة بعد (ينتظر رفع الحد الأدنى لإصدار المزامنة — v3.3.87)');
    e.code = 'media-writes-disabled';
    throw e;
  }
}

export const orderMedia = {
  /**
   * وسيط واحد.
   * @param {string} orderId
   * @param {string} slot
   * @returns {Promise<Object|undefined>}
   */
  async find(orderId, slot) { return idb.get(S, mediaId(orderId, slot)); },

  /**
   * كل وسائط طلب (بالفهرس by_orderId).
   * @param {string} orderId
   * @returns {Promise<Array>}
   */
  async listByOrder(orderId) { return idb.getByIndex(S, 'by_orderId', orderId); },

  /** @returns {Promise<string[]>} مفاتيح المخزن فقط (فحوص خفيفة بلا قراءة الصور). */
  async keys() { return idb.getAllKeys(S); },

  /** @returns {Promise<number>} عدد السجلات. */
  async count() { return idb.count(S); },

  /**
   * يكتب/يحدّث وسيطاً. محروس (انظر رأس الملف).
   * @param {string} orderId
   * @param {string} slot
   * @param {string} data — dataURL
   * @returns {Promise<Object>} السجل
   */
  async put(orderId, slot, data) {
    assertWritable();
    const id = mediaId(orderId, slot);
    if (typeof data !== 'string' || !data) throw new Error('بيانات وسيط فارغة');
    const prev = await idb.get(S, id);
    const now = Date.now();
    const rec = { id, orderId: String(orderId), slot, data, bytes: data.length, createdAt: prev ? prev.createdAt : now, updatedAt: now };
    await idb.put(S, rec);
    return rec;
  },

  /**
   * يحذف وسيطاً واحداً. محروس.
   * @param {string} orderId
   * @param {string} slot
   */
  async remove(orderId, slot) { assertWritable(); await idb.remove(S, mediaId(orderId, slot)); },

  /**
   * يحذف كل وسائط طلب (عند حذفه نهائياً من السلة). **غير محروس**: الحذف لا يُنشئ بيانات تضيّعها الأجهزة القديمة،
   * ولا يعمل إلا على ما هو موجود (فارغ الآن في 3.3.86).
   * @param {string} orderId
   * @returns {Promise<number>} عدد المحذوف
   */
  async removeByOrder(orderId) {
    if (orderId == null || orderId === '') return 0;
    const rows = await idb.getByIndex(S, 'by_orderId', String(orderId));
    for (const r of rows) await idb.remove(S, r.id);
    return rows.length;
  },
};

/**
 * القراءة المزدوجة: المضمَّن في سجل الطلب أولاً (الشكل القديم)، وإلا من مخزن orderMedia. فارغة إن لم يوجد.
 * @param {Object} order — الطلب (يحوي id)
 * @param {string} slot — ref | sig | del-<id>
 * @returns {Promise<string>} dataURL أو ''
 */
export async function getOrderMedia(order, slot) {
  if (!order || order.id == null || !isValidSlot(slot)) return '';
  const inline = inlineValue(order, slot);
  if (inline) return inline;
  const rec = await idb.get(S, mediaId(order.id, slot));
  return rec && typeof rec.data === 'string' ? rec.data : '';
}

export { parseMediaId };
