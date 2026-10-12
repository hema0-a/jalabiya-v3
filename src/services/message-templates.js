/* ==========================================================================
   message-templates.js — محرّك قوالب الرسائل (نقي، بلا IndexedDB)  [v3.3.44]
   ==========================================================================
   مصدر واحد لكل نصوص واتساب في التطبيق:
   - رسائل الطلب (order): طلب جديد، بدء تنفيذ، جاهز، شكر، تذكير دفع، بروفة.
   - رسائل الصفحات: جاهز للاستلام (pickup)، مستحقات (debt)، عرض سعر (quote).
   - رسائل العملاء (customer): تهنئة مناسبة، عرض موسم.
   - قوالب مخصّصة يضيفها المستخدم (scope = order | customer).

   كل الدوال متزامنة وتقبل `cfg` = settings.autoMessages (اختياري)، فتعمل في
   الصفحات والاختبارات بلا انتظار. بلا cfg تُستخدم النصوص الافتراضية.

   ⚠️ formatEGP تُلحق «ج.م» بنفسها — لا تكتب «ج.م» بعد المتغيرات المالية.
   ⚠️ سطر لا يحوي إلا متغيراً فارغاً (مثل {remainingLine}) يُحذف كاملاً.
   ========================================================================== */

import { formatEGP, formatDate } from '../core/utils.js';

/* ==========================================================================
   1. المتغيرات
   ========================================================================== */

export const VARIABLE_DEFS = {
  customer:      { label: 'اسم العميل',        sample: 'أحمد محمد' },
  phone:         { label: 'هاتف العميل',       sample: '01012345678' },
  orderId:       { label: 'رقم الطلب',         sample: '#104821' },
  amount:        { label: 'إجمالي الطلب',      sample: '1,200 ج.م' },
  paid:          { label: 'المدفوع',           sample: '500 ج.م' },
  remaining:     { label: 'المتبقي',           sample: '700 ج.م' },
  date:          { label: 'تاريخ التسليم',     sample: '15 أكتوبر 2026' },
  workshop:      { label: 'اسم الورشة',        sample: 'ورشة الجلابيب' },
  workshopPhone: { label: 'هاتف الورشة',       sample: '01098765432' },
  address:       { label: 'عنوان الورشة',      sample: 'القاهرة — شارع المعز' },
  pickupHours:   { label: 'مواعيد الاستلام',   sample: 'يومياً من 10 ص إلى 9 م' },
  remainingLine: { label: 'سطر المتبقي (يختفي إن لم يبقَ شيء)', sample: 'المتبقي عند الاستلام: 700 ج.م' },
  overdue:       { label: 'المبلغ المستحق',    sample: '1,500 ج.م' },
  items:         { label: 'بنود العرض',        sample: '• جلابية × 2 = 1,000 ج.م' },
  discountLine:  { label: 'سطر الخصم (يختفي إن لم يوجد)', sample: 'خصم: -100 ج.م' },
  total:         { label: 'إجمالي العرض',      sample: '900 ج.م' },
  validLine:     { label: 'سطر الصلاحية',      sample: 'العرض ساري حتى 20 أكتوبر 2026' },
  notes:         { label: 'ملاحظات العرض',     sample: 'التسليم خلال أسبوع' },
  occasion:      { label: 'المناسبة',          sample: 'عيد الفطر' },
};

/** المتغيرات المسموحة لكل نوع قالب (بترتيب العرض). */
export const SCOPE_VARS = {
  order: ['customer', 'orderId', 'amount', 'paid', 'remaining', 'date', 'phone',
    'workshop', 'workshopPhone', 'address', 'pickupHours'],
  pickup: ['customer', 'orderId', 'amount', 'remaining', 'remainingLine',
    'workshop', 'workshopPhone', 'address', 'pickupHours'],
  debt: ['customer', 'overdue', 'phone', 'workshop', 'workshopPhone', 'address'],
  quote: ['customer', 'items', 'discountLine', 'total', 'validLine', 'notes',
    'workshop', 'workshopPhone', 'address'],
  customer: ['customer', 'occasion', 'workshop', 'workshopPhone', 'address', 'pickupHours'],
};

export const SCOPE_LABELS = {
  order: 'رسائل الطلب',
  pickup: 'جاهز للاستلام',
  debt: 'مستحقات',
  quote: 'عرض سعر',
  customer: 'عملاء ومناسبات',
};

/**
 * قائمة متغيرات نوع معيّن.
 * @param {string} [scope='order']
 * @returns {Array<{key:string,label:string,sample:string}>}
 */
export function variablesFor(scope = 'order') {
  return (SCOPE_VARS[scope] || SCOPE_VARS.order).map((key) => ({ key, ...VARIABLE_DEFS[key] }));
}

/** متغيرات رسائل الطلب (للتوافق مع الاستيراد القديم). */
export const VARIABLES = variablesFor('order');

/** أقصى طول لنص القالب (الرسائل الطويلة جداً تُزعج العميل). */
export const MAX_TEMPLATE_LENGTH = 600;
/** أقصى عدد قوالب مخصّصة. */
export const MAX_CUSTOM_TEMPLATES = 20;

/* ==========================================================================
   2. القوالب الافتراضية
   ========================================================================== */

export const DEFAULT_TEMPLATES = [
  /* --- رسائل الطلب (زر 📱 في صفحة الطلبات) --- */
  {
    id: 'new_order', scope: 'order', name: 'طلب جديد', icon: '📥', enabled: true,
    text: 'شكراً لك {customer}، تم استلام طلبك رقم {orderId} بقيمة {amount}. سنبدأ التنفيذ فوراً 🌹',
  },
  {
    id: 'start_work', scope: 'order', name: 'بدء التنفيذ', icon: '🧵', enabled: true,
    text: 'عميلنا العزيز {customer}، بدأنا في تنفيذ طلبك رقم {orderId}. سنوافيك بكل جديد 🌟',
  },
  {
    id: 'fitting', scope: 'order', name: 'موعد البروفة', icon: '📏', enabled: true,
    text: 'عميلنا العزيز {customer}، نرجو التواصل معنا لتحديد موعد بروفة طلبك رقم {orderId} 🧵 {workshop}',
  },
  {
    id: 'ready', scope: 'order', name: 'جاهز للتسليم', icon: '✅', enabled: true,
    text: 'خبر سعيد يا {customer}! طلبك رقم {orderId} جاهز للتسليم. نتشرف بزيارتك في {workshop} 🎉',
  },
  {
    id: 'thanks', scope: 'order', name: 'شكر بعد التسليم', icon: '🌹', enabled: true,
    text: 'شكراً لثقتك بنا {customer}! نتمنى أن ينال طلبك رضاك. في انتظارك دائماً 🌹',
  },
  {
    id: 'payment_due', scope: 'order', name: 'تذكير بالدفع', icon: '💰', enabled: true,
    text: 'تذكير ودّي يا {customer}: متبقي على طلبك رقم {orderId} مبلغ {remaining}. نتشرف بالسداد في أي وقت 🌸',
  },

  /* --- رسائل الصفحات (تُستخدم من أزرار واتساب في صفحاتها؛ لا تُفعَّل/تُعطَّل) --- */
  {
    id: 'pickup_ready', scope: 'pickup', name: 'جاهز للاستلام', icon: '📦', enabled: true, toggleable: false,
    text: 'السلام عليكم {customer}،\nطلبكم رقم {orderId} جاهز للاستلام من {workshop}.\n{remainingLine}\nنتشرف بزيارتكم في أقرب وقت. شكراً لثقتكم 🌹',
  },
  {
    id: 'debt_reminder', scope: 'debt', name: 'تذكير بمستحقات', icon: '🧾', enabled: true, toggleable: false,
    text: 'السلام عليكم {customer}،\nنذكّركم بلطف بوجود مبلغ متبقٍّ {overdue} لدى {workshop}.\nنشكر لكم تعاونكم 🌷',
  },
  {
    id: 'quote_share', scope: 'quote', name: 'عرض سعر', icon: '📝', enabled: true, toggleable: false,
    text: 'السلام عليكم {customer}،\nعرض سعر من {workshop}:\n\n{items}\n{discountLine}\n\nالإجمالي: {total}\n{validLine}\n\n{notes}',
  },

  /* --- العملاء والمناسبات --- */
  {
    id: 'greeting_occasion', scope: 'customer', name: 'تهنئة مناسبة', icon: '🎉', enabled: true,
    text: 'كل عام وحضرتك بخير يا {customer} 🌹 بمناسبة {occasion}، تتمنى لكم أسرة {workshop} أجمل الأوقات.',
  },
  {
    id: 'season_offer', scope: 'customer', name: 'عرض الموسم', icon: '🌟', enabled: true,
    text: 'أهلاً {customer} 🌟 موسم الطلبات بدأ في {workshop}! احجز تفصيل جلابيبك مبكراً لتضمن التسليم في موعده. للحجز: {workshopPhone}',
  },
];

/** معرّفات قوالب الصفحات (ثابتة؛ الصفحات والطابور يعتمدون عليها). */
export const KIND = {
  PICKUP: 'pickup_ready',
  DEBT: 'debt_reminder',
  QUOTE: 'quote_share',
  GREETING: 'greeting_occasion',
};

/* ==========================================================================
   3. قراءة القوالب (متزامنة)
   ========================================================================== */

function normalizeCfg(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return {
    enabled: c.enabled !== false,
    promptOnStatus: c.promptOnStatus !== false,
    templates: c.templates && typeof c.templates === 'object' && !Array.isArray(c.templates) ? c.templates : {},
    custom: Array.isArray(c.custom) ? c.custom : [],
  };
}

/** هل الرسائل التلقائية مُفعَّلة؟ (المفتاح الرئيسي) */
export function isEnabledCfg(cfg) {
  return normalizeCfg(cfg).enabled;
}

/**
 * كل القوالب (افتراضية بعد تخصيصها + المخصّصة).
 * @param {Object} [cfg] — settings.autoMessages
 * @returns {Array<{id,name,icon,scope,enabled,text,toggleable,builtin,isCustom,defaultText?}>}
 */
export function listTemplates(cfg) {
  const c = normalizeCfg(cfg);
  const builtin = DEFAULT_TEMPLATES.map((tpl) => {
    const o = c.templates[tpl.id] && typeof c.templates[tpl.id] === 'object' ? c.templates[tpl.id] : {};
    const hasText = typeof o.text === 'string' && !!o.text.trim();
    const toggleable = tpl.toggleable !== false;
    return {
      ...tpl,
      toggleable,
      builtin: true,
      defaultText: tpl.text,
      enabled: toggleable ? o.enabled !== false : true,
      text: hasText ? o.text : tpl.text,
      isCustom: hasText && o.text.trim() !== tpl.text,
    };
  });
  const custom = c.custom
    .filter((t) => t && typeof t === 'object' && t.id && typeof t.text === 'string' && t.text.trim())
    .map((t) => ({
      id: String(t.id),
      name: String(t.name || 'قالب').slice(0, 40),
      icon: String(t.icon || '💬').slice(0, 4),
      scope: t.scope === 'customer' ? 'customer' : 'order',
      enabled: t.enabled !== false,
      text: String(t.text),
      toggleable: true,
      builtin: false,
      isCustom: true,
    }));
  return [...builtin, ...custom];
}

/**
 * قالب واحد بمعرّفه (متزامن).
 * @param {string} id
 * @param {Object} [cfg]
 * @returns {Object|null}
 */
export function getTemplateSync(id, cfg) {
  return listTemplates(cfg).find((t) => t.id === id) || null;
}

/** معرّف جديد لقالب مخصّص. */
export function newCustomId() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ==========================================================================
   4. بناء المتغيرات
   ========================================================================== */

/**
 * متغيرات الورشة المشتركة بين كل الرسائل.
 * @param {Object|string} [workshop] — كائن settings.workshop أو اسم الورشة فقط
 * @returns {{workshop:string, workshopPhone:string, address:string, pickupHours:string}}
 */
export function workshopVars(workshop) {
  const ws = typeof workshop === 'string' ? { name: workshop } : (workshop && typeof workshop === 'object' ? workshop : {});
  return {
    workshop: ws.name || 'ورشة الجلابيب',
    workshopPhone: ws.whatsapp || ws.phone || '',
    address: ws.address || '',
    pickupHours: ws.pickupHours || '',
  };
}

/**
 * بناء متغيرات رسالة طلب من طلب + عميل.
 * @param {Object} order
 * @param {Object} customer
 * @param {Object|string} [workshop]
 * @param {Object} [extra] — {paid} المدفوع الفعلي، وأي متغيرات إضافية تتغلّب على الباقي
 * @returns {Object}
 */
export function buildVars(order, customer, workshop = {}, extra = {}) {
  const ex = extra && typeof extra === 'object' ? extra : {};
  const total = order ? (Number(order.amount) || 0) : 0;
  const hasPaid = ex.paid != null && isFinite(Number(ex.paid));
  const paid = hasPaid ? Number(ex.paid) : (order ? (Number(order.deposit) || 0) : 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const base = {
    customer: (customer && customer.name) || 'عميلنا',
    phone: (customer && customer.phone) || '',
    amount: formatEGP(total),
    paid: formatEGP(paid),
    remaining: formatEGP(remaining),
    orderId: order ? '#' + String(order.id).slice(-6) : '',
    date: order && order.dueDate ? formatDate(order.dueDate) : formatDate(Date.now()),
    ...workshopVars(workshop),
  };
  const rest = { ...ex };
  delete rest.paid;
  return { ...base, ...rest };
}

/** متغيرات عيّنة لمعاينة قالب في الإعدادات. */
export function sampleVars(scope = 'order') {
  const out = {};
  variablesFor(scope).forEach((v) => { out[v.key] = v.sample; });
  return out;
}

/* ==========================================================================
   5. الاستبدال
   ========================================================================== */

function replaceVars(line, vars) {
  let out = line;
  Object.keys(vars).forEach((k) => {
    const re = new RegExp('\\{' + k + '\\}', 'g');
    const val = String(vars[k] ?? '');
    out = out.replace(re, () => val);   /* دالة لا نص: حتى لا تُفسَّر $& و$1 داخل الأسماء */
  });
  return out;
}

/**
 * استبدال المتغيرات في نص القالب.
 * - دالة استبدال (لا نص) حتى لا تُفسَّر `$&` و`$1` داخل اسم العميل.
 * - سطر لا يحوي إلا متغيراً قيمته فارغة يُحذف (مثل {remainingLine}).
 * - يُنظَّف تكرار «ج.م ج.م» الناتج عن قوالب كتبت «ج.م» بعد المبلغ.
 * @param {string} text
 * @param {Object} vars
 * @returns {string}
 */
export function interpolate(text, vars) {
  const v = vars && typeof vars === 'object' ? vars : {};
  const kept = [];
  String(text || '').split('\n').forEach((line) => {
    const m = line.trim().match(/^\{([A-Za-z]+)\}$/);
    if (m && Object.prototype.hasOwnProperty.call(v, m[1]) && String(v[m[1]] ?? '').trim() === '') return;
    kept.push(replaceVars(line, v));
  });
  return kept.join('\n')
    .replace(/(ج\.م)(\s*ج\.م\.?)+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * متغيرات غير معروفة داخل نص (خطأ إملائي مثل {customr}) — تُرسَل للعميل كما هي!
 * @param {string} text
 * @param {string} [scope='order']
 * @returns {string[]} أسماء فريدة بلا أقواس
 */
export function findUnknownVariables(text, scope = 'order') {
  const known = new Set(SCOPE_VARS[scope] || SCOPE_VARS.order);
  const found = new Set();
  String(text || '').replace(/\{([^{}\s]+)\}/g, (m, name) => {
    if (!known.has(name)) found.add(name);
    return m;
  });
  return [...found];
}

/**
 * نص رسالة جاهز من قالب (يقرأ تخصيصات المستخدم من cfg).
 * @param {string} id — معرّف القالب
 * @param {Object} vars
 * @param {Object} [cfg]
 * @returns {string} '' إن لم يوجد القالب
 */
export function renderTemplate(id, vars, cfg) {
  const tpl = getTemplateSync(id, cfg);
  return tpl ? interpolate(tpl.text, vars) : '';
}
