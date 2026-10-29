/* ==========================================================================
   quick-preview.js — معاينات سريعة موحّدة (8 كيانات) — المدخل
   ==========================================================================
   - يفتح نافذة bottom-sheet على الجوال (variant: 'sheet').
   - يقبل id (نصي) أو كائناً جاهزاً — توافق خلفي كامل.
   - كل دالة async تُرجع Promise<void>.
   - WhatsApp: يطبّع الأرقام لصيغة دولية عبر normalizePhone.

   v3.5.7: تقسيم صيانة بلا تغيير سلوك (1150 سطراً ← مدخل + 5 وحدات). هذا الملف إعادة تصدير فقط (لا منطق ولا حالة):
     quick-preview-helpers.js  (أدوات مشتركة: صف/صندوق/قائمة/قسم/طيّ/تقدم/واتساب/إدخال رقم)
     quick-preview-catalog.js  (shareCatalog)
     quick-preview-customer.js (previewCustomer + التفاصيل الكاملة)
     quick-preview-order.js    (previewOrder)
     quick-preview-entities.js (previewPayment · previewCommitment · previewGoal · previewPortfolio · previewInventory · previewWorker)
   الاستيراد أحادي الاتجاه: helpers ← catalog ← customer · helpers ← order · helpers ← entities (لا استيراد دائري).
   الواجهة العامة كما كانت: shareCatalog · previewCustomer · previewOrder · previewPayment · previewCommitment
   · previewGoal · previewPortfolio · previewInventory · previewWorker.
   ========================================================================== */

export { shareCatalog } from './quick-preview-catalog.js';
export { previewCustomer } from './quick-preview-customer.js';
export { previewOrder } from './quick-preview-order.js';
export {
  previewPayment, previewCommitment, previewGoal,
  previewPortfolio, previewInventory, previewWorker,
} from './quick-preview-entities.js';
