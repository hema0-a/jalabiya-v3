/* ==========================================================================
   settings-tools.js — أدوات صفحة الإعدادات: بحث في الأقسام + استرجاع الافتراضي لكل قسم (v3.5.28)
   ==========================================================================
   منطق نقي بلا DOM ولا قاعدة بيانات (يُختبر في Node):
   - SEARCH_KEYWORDS: كلمات مفتاحية لكل قسم (أسماء الإعدادات التي بداخله) ليجده البحث بما يتذكره المستخدم.
   - matchSections(query, sections): معرّفات الأقسام المطابقة (كل كلمات البحث يجب أن تبدأ بها كلمة في العنوان أو الكلمات المفتاحية).
   - RESET_MAP / canReset / buildResetPatch: ما يُعاد لقيمه الافتراضية في كل قسم بالحقول الدقيقة التي يكتبها القسم فقط.
   مستثنى عمداً من الاسترجاع: «معلومات الورشة» (بيانات هوية)، «المظهر» (له زر استرجاع خاص)،
   والمزامنة/الصيانة/البيانات التجريبية/الدعم/منطقة الخطر (لا إعدادات عادية فيها).
   API:
     matchSections(query, sections) → Set<string>|null   (null = لا استعلام: اعرض الكل)
     canReset(id) → boolean
     buildResetPatch(id, defaults) → Object|null         (يُمرَّر لـ settings.update)
     describeReset(id) → string                          (نص التأكيد)
   ========================================================================== */

import { normalizeSearch } from '../core/utils.js';

export const SEARCH_KEYWORDS = {
  workshop: 'اسم الورشة شعار لوجو عنوان هاتف واتساب مواعيد الاستلام شروط الولاء نقاط',
  appearance: 'ثيم لون ألوان رئيسي ثانوي مظهر تخصيص',
  backgrounds: 'خلفية خلفيات نمط زخرفة',
  icons: 'أيقونات ايقونات أنماط شكل الأيقونات',
  fonts: 'خط خطوط حجم الخط كبير صغير تحميل خط رفع خط ملف خط جوجل سمك سميك تباعد الأسطر ارتفاع السطر',
  display: 'وضع ليلي داكن تباين عالي مضغوط وضع العميل عرض',
  measurements: 'مقاسات حقول كتف صدر وسط أرداف طول كم رقبة',
  'jalabiya-types': 'أنواع الجلابيات جلابية أسعار موديلات صور',
  'inventory-limits': 'مخزون حد أدنى تنبيه قماش منتجات نفاد نفد إشعار تكرار تذكير',
  'daily-limit': 'حد يومي يوم إجازة إجازات أيام الإجازة عيد مناسبة تاريخ محدد عدد الطلبات استلام القماش',
  grouping: 'تجميع طلبات متشابهة مقاسات متقاربة نفس العميل عدد المقاسات المشتركة مقارنة',
  'pricing-calculator': 'حاسبة تسعير هامش ربح تكلفة أجرة مصاريف',
  'deposit-policy': 'عربون مقدم نسبة دفعة أولى',
  'menu-pages': 'صفحات القائمة الجانبية إخفاء إظهار قائمة تبسيط صفحات لا أستعملها',
  notifications: 'تنبيهات إشعارات مواسم مواعيد ديون مخزون أيام قبل',
  occasions: 'مواسم أعياد مناسبات رمضان عيد',
  'auto-messages': 'رسائل واتساب قوالب تلقائية تهنئة شكر تذكير',
  backup: 'نسخ احتياطي تشفير تصدير استيراد استرجاع ملف حفظ',
  'data-care': 'صيانة بيانات دمج عملاء مكررين سلامة فحص إصلاح ترحيل وسائط صور قديمة أداء VIP',
  'cloud-sync': 'مزامنة سحابية حساب تسجيل دخول فايربيس سحابة جهاز آخر',
  'image-compression': 'ضغط صور جودة حجم أبعاد',
  'demo-data': 'بيانات تجريبية تجربة عينة',
  support: 'دعم مشكلة بلاغ أخطاء مساعدة',
  security: 'أمان رقم سري PIN قفل تلقائي جلسة دخول',
  'lock-screen': 'شاشة القفل رسالة خلفية شعار',
  'danger-zone': 'منطقة الخطر حذف الكل إعادة تعيين مسح البيانات',
};

/** تقسيم نص البحث إلى كلمات مطبَّعة. */
function tokens(q) {
  return normalizeSearch(q).split(/\s+/).filter(Boolean);
}

/**
 * @param {string} query
 * @param {Array<{id:string,title:string}>} sections
 * @returns {Set<string>|null} null عند غياب الاستعلام (لا تصفية)
 */
export function matchSections(query, sections) {
  const toks = tokens(query);
  if (!toks.length) return null;
  const out = new Set();
  (Array.isArray(sections) ? sections : []).forEach((s) => {
    if (!s || !s.id) return;
    const words = normalizeSearch(String(s.title || '') + ' ' + (SEARCH_KEYWORDS[s.id] || '')).split(/\s+/).filter(Boolean);
    /* المطابقة من بداية الكلمة (مع تجاهل «ال» التعريف): «خط» تجد «الخطوط» ولا تجد «أخطاء» */
    const forms = words.flatMap((w) => (w.startsWith('ال') && w.length > 3 ? [w, w.slice(2)] : [w]));
    if (toks.every((t) => forms.some((f) => f.startsWith(t)))) out.add(s.id);
  });
  return out;
}

/**
 * قسم → { مفتاح: null (كل المفتاح) | [حقول محددة] }.
 * الحقول الدقيقة هي ما يكتبه القسم فعلاً (انظر saveFn في ملفات الأقسام).
 */
export const RESET_MAP = {
  backgrounds: { appearance: ['backgroundPattern'] },
  icons: { appearance: ['iconStyle'] },
  fonts: { display: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight'] },
  display: { display: ['darkMode', 'highContrast', 'compactMode', 'clientMode'] },
  measurements: { measurementFields: null },
  'jalabiya-types': { jalabiyaTypes: null },
  'inventory-limits': { inventory: null },
  'daily-limit': { dailyLimit: null },
  grouping: { grouping: null },
  'pricing-calculator': { pricingCalculator: null },
  'deposit-policy': { depositPolicy: null },
  notifications: { notifications: null },
  occasions: { occasions: null },
  'auto-messages': { autoMessages: null },
  backup: { backup: null },
  'image-compression': { imageCompression: null },
  'menu-pages': { navigation: null },
  security: { security: null },
  'lock-screen': { lockScreen: null },
};

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function canReset(id) {
  return Object.prototype.hasOwnProperty.call(RESET_MAP, id);
}

/**
 * @param {string} id معرّف القسم
 * @param {Object} defaults DEFAULT_SETTINGS
 * @returns {Object|null} patch لـ settings.update أو null إن لم يكن القسم قابلاً للاسترجاع
 */
export function buildResetPatch(id, defaults) {
  if (!canReset(id) || !defaults) return null;
  const patch = {};
  const spec = RESET_MAP[id];
  for (const key of Object.keys(spec)) {
    const def = defaults[key];
    if (def === undefined) return null;
    const fields = spec[key];
    if (fields === null) { patch[key] = clone(def); continue; }
    patch[key] = {};
    for (const f of fields) {
      if (def[f] === undefined) return null;
      patch[key][f] = clone(def[f]);
    }
  }
  return patch;
}

/** نص تأكيد الاسترجاع بحسب القسم. */
export function describeReset(id) {
  const custom = {
    measurements: 'ستعود حقول المقاسات إلى الحقول الافتراضية (وتُزال الحقول التي أضفتَها).',
    'jalabiya-types': 'سيُمسح كل ما أضفتَه من أنواع جلابيات وأسعارها.',
    occasions: 'ستعود المواسم إلى القائمة الافتراضية (وتُزال المواسم التي أضفتَها).',
    'auto-messages': 'سيُمسح كل تعديل على قوالب الرسائل وكل قالب أضفتَه، وتعود الرسائل للنصوص الافتراضية.',
    security: 'ستعود خيارات القفل التلقائي ومدة الجلسة للافتراضي (الرقم السري لا يتأثر).',
    'lock-screen': 'ستعود رسالة شاشة القفل للافتراضية وتُزال خلفيتك المرفوعة.',
    'menu-pages': 'ستظهر كل صفحات القائمة الجانبية من جديد.',
    backup: 'ستعود خيارات النسخ التلقائي للافتراضي (النسخ المحفوظة لا تُمسّ).',
  };
  return (custom[id] || 'ستعود إعدادات هذا القسم فقط إلى قيمها الافتراضية.') + '\nباقي أقسام الإعدادات وبياناتك (العملاء والطلبات…) لا تتأثر.';
}
