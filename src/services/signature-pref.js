/* ==========================================================================
   signature-pref.js — هل يُطلب توقيع العميل عند التسليم؟ (تفضيل الجهاز) [v3.3.62]
   ==========================================================================
   الافتراضي: يُطلب (كالسلوك السابق). خانة «طلب توقيع العميل» في نافذتي التسليم الكامل
   والجزئي تحفظ اختيارك فلا تُلغيها كل مرة. لا يُزامَن (تفضيل خاص بهذا الجهاز).
   ========================================================================== */

export const ASK_SIGNATURE_KEY = 'jalabiya_v3_ask_signature';

/** @returns {boolean} true = يُطلب التوقيع (الافتراضي) */
export function getAskSignature() {
  try { return localStorage.getItem(ASK_SIGNATURE_KEY) !== '0'; } catch (e) { return true; }
}

export function setAskSignature(on) {
  try { localStorage.setItem(ASK_SIGNATURE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
}
