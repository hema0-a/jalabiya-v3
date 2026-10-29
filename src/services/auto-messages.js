/* ==========================================================================
   auto-messages.js — الرسائل التلقائية (WhatsApp)
   ==========================================================================
   - 5 قوالب افتراضية: طلب جديد، بدء تنفيذ، جاهز، شكر، تذكير دفع.
   - المتغيرات: {customer}, {amount}, {phone}, {orderId}, {date}, {workshop}
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
    text: 'شكراً لك {customer}، تم استلام طلبك رقم {orderId} بقيمة {amount} ج.م. سنبدأ التنفيذ فوراً 🌹',
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
    text: 'تذكير ودّي يا {customer}: متبقي على طلبك رقم {orderId} مبلغ {amount} ج.م. نتشرف بالسداد في أي وقت 🌸',
  },
];

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
      return {
        ...tpl,
        enabled: override.enabled !== false && tpl.enabled !== false,
        text: (typeof override.text === 'string' && override.text.trim())
          ? override.text
          : tpl.text,
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
 * @returns {Object}
 */
export function buildVars(order, customer, workshop = {}) {
  return {
    customer: (customer && customer.name) || 'عميلنا',
    phone: (customer && customer.phone) || '',
    amount: formatEGP(order ? (order.amount || 0) : 0),
    orderId: order ? '#' + String(order.id).slice(-6) : '',
    date: order && order.dueDate ? formatDate(order.dueDate) : formatDate(Date.now()),
    workshop: workshop.name || 'ورشة الجلابيب',
  };
}

/**
 * استبدال المتغيرات في نص القالب.
 * @param {string} text
 * @param {Object} vars
 * @returns {string}
 */
export function interpolate(text, vars) {
  let out = String(text || '');
  Object.keys(vars || {}).forEach((k) => {
    const re = new RegExp('\\{' + k + '\\}', 'g');
    out = out.replace(re, String(vars[k] ?? ''));
  });
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
 * @returns {Promise<Array<{id:string, name:string, icon:string, text:string, send:Function}>>}
 */
export async function getOrderMessageOptions(order, customer, workshop = {}) {
  if (!order) return [];

  const enabled = await isEnabled();
  if (!enabled) return [];

  const templates = await getTemplates();
  const vars = buildVars(order, customer, workshop);
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

export const _internal = { DEFAULT_TEMPLATES };
