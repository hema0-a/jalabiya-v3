/* ==========================================================================
   auto-messages.js — الرسائل التلقائية (WhatsApp)
   ==========================================================================
   - 5 قوالب افتراضية: طلب جديد، بدء تنفيذ، جاهز، شكر، تذكير دفع.
   - المتغيرات (VARIABLES): {customer} {amount} {paid} {remaining} {phone}
     {orderId} {date} {workshop}
   - ⚠️ v3.3.43: formatEGP تُلحق «ج.م» بنفسها — لا تكتب «ج.م» بعد المتغيرات
     المالية في القوالب (كان يظهر «ج.م ج.م»؛ يُنظَّف الآن تلقائياً أيضاً).
   - يقرأ التخصيصات من settings.autoMessages.templates (تتجاوز الافتراضية).
   - Static imports فقط.
   ========================================================================== */

import { settings } from '../data/repos/settings.js';
import { normalizePhone, formatEGP, formatDate } from '../core/utils.js';

/* --- القوالب الافتراضية (5) --- */
export const DEFAULT_TEMPLATES = [
  {
    id: 'new_order',
    name: 'طلب جديد',
    icon: '📥',
    enabled: true,
    text: 'شكراً لك {customer}، تم استلام طلبك رقم {orderId} بقيمة {amount}. سنبدأ التنفيذ فوراً 🌹',
  },
  {
    id: 'start_work',
    name: 'بدء التنفيذ',
    icon: '🧵',
    enabled: true,
    text: 'عميلنا العزيز {customer}، بدأنا في تنفيذ طلبك رقم {orderId}. سنوافيك بكل جديد 🌟',
  },
  {
    id: 'ready',
    name: 'جاهز للتسليم',
    icon: '✅',
    enabled: true,
    text: 'خبر سعيد يا {customer}! طلبك رقم {orderId} جاهز للتسليم. نتشرف بزيارتك في {workshop} 🎉',
  },
  {
    id: 'thanks',
    name: 'شكر بعد التسليم',
    icon: '🌹',
    enabled: true,
    text: 'شكراً لثقتك بنا {customer}! نتمنى أن ينال طلبك رضاك. في انتظارك دائماً 🌹',
  },
  {
    id: 'payment_due',
    name: 'تذكير بالدفع',
    icon: '💰',
    enabled: true,
    text: 'تذكير ودّي يا {customer}: متبقي على طلبك رقم {orderId} مبلغ {remaining}. نتشرف بالسداد في أي وقت 🌸',
  },
];

/* --- المتغيرات المدعومة (مصدر واحد للواجهة والخدمة) --- */
export const VARIABLES = [
  { key: 'customer',  label: 'اسم العميل',      sample: 'أحمد محمد' },
  { key: 'orderId',   label: 'رقم الطلب',       sample: '#104821' },
  { key: 'amount',    label: 'إجمالي الطلب',    sample: '1,200 ج.م' },
  { key: 'paid',      label: 'المدفوع',         sample: '500 ج.م' },
  { key: 'remaining', label: 'المتبقي',         sample: '700 ج.م' },
  { key: 'date',      label: 'تاريخ التسليم',   sample: '15 أكتوبر 2026' },
  { key: 'phone',     label: 'هاتف العميل',     sample: '01012345678' },
  { key: 'workshop',  label: 'اسم الورشة',      sample: 'ورشة الجلابيب' },
];

/** أقصى طول لنص القالب (رسائل واتساب الطويلة جداً تُقطع/تُزعج العميل) */
export const MAX_TEMPLATE_LENGTH = 600;

/* ==========================================================================
   1. جلب القوالب
   ========================================================================== */

/**
 * جلب القوالب (المخصصة + الافتراضية).
 * التخصيصات من الإعدادات تتجاوز النص، لكن الـ id يبقى الأساس.
 * @returns {Promise<Array>}
 */
export async function getTemplates() {
  try {
    const s = await settings.get();
    const custom = (s.autoMessages && s.autoMessages.templates) || {};

    return DEFAULT_TEMPLATES.map((tpl) => {
      const override = custom[tpl.id] || {};
      const hasText = typeof override.text === 'string' && !!override.text.trim();
      return {
        ...tpl,
        enabled: override.enabled !== false && tpl.enabled !== false,
        text: hasText ? override.text : tpl.text,
        isCustom: hasText && override.text.trim() !== tpl.text,
      };
    });
  } catch {
    return [...DEFAULT_TEMPLATES];
  }
}

/**
 * جلب قالب واحد بمعرّفه.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getTemplate(id) {
  const all = await getTemplates();
  return all.find((t) => t.id === id) || null;
}

/**
 * هل الرسائل التلقائية مُفعَّلة؟
 * @returns {Promise<boolean>}
 */
export async function isEnabled() {
  try {
    const s = await settings.get();
    return !(s.autoMessages && s.autoMessages.enabled === false);
  } catch {
    return true;
  }
}

/* ==========================================================================
   2. المتغيرات
   ========================================================================== */

/**
 * بناء متغيرات القالب من طلب + عميل.
 * @param {Object} order
 * @param {Object} customer
 * @param {Object} [workshop]
 * @param {{paid?:number}} [extra] — المدفوع الفعلي (دفعات + مقدم) لحساب المتبقي
 * @returns {Object}
 */
export function buildVars(order, customer, workshop = {}, extra = {}) {
  const total = order ? (Number(order.amount) || 0) : 0;
  const hasPaid = extra && extra.paid != null && isFinite(Number(extra.paid));
  const paid = hasPaid ? Number(extra.paid) : (order ? (Number(order.deposit) || 0) : 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  return {
    customer: (customer && customer.name) || 'عميلنا',
    phone: (customer && customer.phone) || '',
    amount: formatEGP(total),
    paid: formatEGP(paid),
    remaining: formatEGP(remaining),
    orderId: order ? '#' + String(order.id).slice(-6) : '',
    date: order && order.dueDate ? formatDate(order.dueDate) : formatDate(Date.now()),
    workshop: (workshop && workshop.name) || 'ورشة الجلابيب',
  };
}

/**
 * استبدال المتغيرات في نص القالب.
 * - دالة استبدال (لا نص) حتى لا تُفسَّر `$&` و`$1` داخل اسم العميل.
 * - يُنظَّف تكرار «ج.م ج.م» الناتج عن قوالب قديمة كتبت «ج.م» بعد المبلغ.
 * @param {string} text
 * @param {Object} vars
 * @returns {string}
 */
export function interpolate(text, vars) {
  let out = String(text || '');
  Object.keys(vars || {}).forEach((k) => {
    const re = new RegExp('\\{' + k + '\\}', 'g');
    const val = String(vars[k] ?? '');
    out = out.replace(re, () => val);
  });
  return out.replace(/(ج\.م)(\s*ج\.م\.?)+/g, '$1');
}

/**
 * متغيرات غير معروفة داخل نص (خطأ إملائي مثل {customr}) — تُرسَل للعميل كما هي!
 * @param {string} text
 * @returns {string[]} أسماء فريدة بلا أقواس
 */
export function findUnknownVariables(text) {
  const known = new Set(VARIABLES.map((v) => v.key));
  const found = new Set();
  String(text || '').replace(/\{([^{}\s]+)\}/g, (m, name) => {
    if (!known.has(name)) found.add(name);
    return m;
  });
  return [...found];
}

/** متغيرات عيّنة لمعاينة القالب في الإعدادات. */
export function sampleVars() {
  const out = {};
  VARIABLES.forEach((v) => { out[v.key] = v.sample; });
  return out;
}

/* ==========================================================================
   3. إرسال WhatsApp
   ========================================================================== */

/**
 * فتح WhatsApp برسالة جاهزة.
 * @param {string} phone
 * @param {string} text
 * @returns {boolean} — true إن نجح
 */
export function sendWhatsApp(phone, text) {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  const clean = String(normalized).replace(/\D/g, '');
  if (!clean) return false;
  const url = 'https://wa.me/' + clean + '?text=' + encodeURIComponent(text || '');
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/* ==========================================================================
   4. واجهات جاهزة للاستخدام
   ========================================================================== */

/**
 * بناء قائمة خيارات الرسائل لطلب معيّن.
 * @param {Object} order
 * @param {Object} customer
 * @param {Object} [workshop]
 * @param {{paid?:number}} [extra]
 * @returns {Promise<Array<{id:string, name:string, icon:string, text:string, send:Function}>>}
 */
export async function getOrderMessageOptions(order, customer, workshop = {}, extra = {}) {
  if (!order) return [];

  const enabled = await isEnabled();
  if (!enabled) return [];

  const templates = await getTemplates();
  const vars = buildVars(order, customer, workshop, extra);
  const phone = (customer && customer.phone) || '';

  return templates
    .filter((t) => t.enabled)
    .map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      text: interpolate(t.text, vars),
      send: () => sendWhatsApp(phone, interpolate(t.text, vars)),
      hasPhone: !!phone,
    }));
}

/* ==========================================================================
   5. تصدير للاختبار
   ========================================================================== */

export const _internal = { DEFAULT_TEMPLATES, VARIABLES };
