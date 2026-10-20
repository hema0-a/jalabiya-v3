/* ==========================================================================
   order-media-scan.js — مدخلات فحص يتامى الوسائط (v3.3.86، قراءة فقط)
   ==========================================================================
   مفاتيح مخزن orderMedia (بلا قراءة الصور) + معرّفات الطلبات الموجودة في السلة. يُمرَّران إلى scanIntegrity.
   ملف مستقل كي لا تنشأ دائرة استيراد بين مستودع الوسائط ومستودع السلة.
   ========================================================================== */

import { orderMedia } from '../data/repos/order-media.js';
import { trash } from '../data/repos/trash.js';

/**
 * @returns {Promise<{orderMediaKeys:string[], trashOrderIds:string[]}>}
 */
export async function loadMediaScanInputs() {
  const [keys, trashed] = await Promise.all([orderMedia.keys(), trash.listByStore('orders')]);
  return {
    orderMediaKeys: keys.map(String),
    trashOrderIds: (trashed || []).map((t) => t && t.originalId).filter((x) => x != null).map(String),
  };
}
