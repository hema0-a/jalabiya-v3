/* ==========================================================================
   invoice-print-shared.js — أدوات ومكونات مشتركة للفاتورة والكشف (v3.5.13)
   ==========================================================================
   esc · STATUS_LABELS · PAYMENT_METHOD_LABELS · FEE_TYPE_LABELS · getWorkshop · orderItems · buildWorkshopHeader · buildFooter — منقولة حرفياً.
   ========================================================================== */

import { settings } from '../data/repos/settings.js';

/* ==========================================================
   1. أدوات
   ========================================================== */

/**
 * تهريب HTML (أمان ضد XSS).
 * @param {*} s
 * @returns {string}
 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** حالات الطلب. */
export const STATUS_LABELS = {
  pending:     { label: 'قيد الانتظار', cls: 'pending' },
  in_progress: { label: 'قيد التنفيذ', cls: 'in_progress' },
  ready:       { label: 'جاهز للتسليم', cls: 'ready' },
  delivered:   { label: 'تم التسليم', cls: 'delivered' },
  cancelled:   { label: 'ملغي', cls: 'cancelled' },
};

/** طرق الدفع (للكشف المطبوع وللصورة). */
export const PAYMENT_METHOD_LABELS = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى', deposit: 'مقدم الطلب' };

/** خرائط الرسوم الإضافية. */
export const FEE_TYPE_LABELS = {
  urgency:   '⚡ استعجال',
  modify:    '✏️ تعديلات',
  delivery:  '🚚 توصيل',
  packaging: '📦 تغليف مميز',
  other:     '📌 أخرى',
};

/**
 * قراءة بيانات الورشة من الإعدادات.
 * @returns {Promise<Object>}
 */
export async function getWorkshop() {
  try {
    const s = await settings.get();
    return s.workshop || {};
  } catch {
    return {};
  }
}

/**
 * تحويل الطلب إلى قائمة بنود (يدعم items أو amount القديم).
 * @param {Object} order
 * @returns {Array<{name:string, price:number, quantity:number}>}
 */
export function orderItems(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it) => ({
      name: it.name || 'بند',
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
    }));
  }
  return [{
    name: order.notes || order.garmentType || 'طلب جلابية',
    price: Number(order.amount) || 0,
    quantity: Number(order.quantity) || 1,
  }];
}

/* ==========================================================
   4. مكونات مشتركة
   ========================================================== */

/**
 * رأس الفاتورة (شعار + اسم الورشة + عنوان المستند).
 * @param {Object} workshop
 * @param {string} docTitle
 * @param {string} docNumber
 * @param {string} docDate
 * @returns {string}
 */
export function buildWorkshopHeader(workshop, docTitle, docNumber, docDate) {
  const logoHtml = workshop.logo
    ? '<img src="' + esc(workshop.logo) + '" alt="logo">'
    : '🧵';

  const metaParts = [];
  if (workshop.address)  metaParts.push('📍 ' + esc(workshop.address));
  if (workshop.phone)    metaParts.push('📞 ' + esc(workshop.phone));
  if (workshop.whatsapp) metaParts.push('💬 ' + esc(workshop.whatsapp));

  return (
    '<div class="header">' +
      '<div class="ws-info">' +
        '<div class="ws-logo">' + logoHtml + '</div>' +
        '<div>' +
          '<div class="ws-name">' + esc(workshop.name || 'ورشة تفصيل الجلابيب') + '</div>' +
          '<div class="ws-meta">' + metaParts.join('<br>') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="doc-info">' +
        '<div class="doc-title">' + esc(docTitle) + '</div>' +
        (docNumber ? '<div class="doc-num">' + esc(docNumber) + '</div>' : '') +
        (docDate ? '<div class="doc-date">' + esc(docDate) + '</div>' : '') +
      '</div>' +
    '</div>'
  );
}

/**
 * تذييل المستند.
 * @param {Object} workshop
 * @returns {string}
 */
export function buildFooter(workshop, withTerms = false) {
  /* شروط الورشة (v3.3.51): سطر لكل بند، تظهر على الفاتورة فقط */
  const termLines = withTerms
    ? String((workshop && workshop.terms) || '').split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  const termsHtml = termLines.length > 0
    ? '<div class="terms" style="text-align:right;font-size:11px;color:#555;line-height:1.8;' +
      'border-top:1px dashed #ccc;margin-top:14px;padding-top:8px;">' +
      '<div style="font-weight:700;margin-bottom:2px;">شروط الورشة:</div>' +
      termLines.map((l) => '<div>• ' + esc(l) + '</div>').join('') + '</div>'
    : '';
  return (
    termsHtml +
    '<div class="footer">' +
      '<div class="thanks">شكراً لتعاملكم معنا 🌹</div>' +
      (workshop.phone    ? '<div>📞 ' + esc(workshop.phone) + '</div>' : '') +
      (workshop.whatsapp ? '<div>💬 WhatsApp: ' + esc(workshop.whatsapp) + '</div>' : '') +
      (workshop.address  ? '<div>📍 ' + esc(workshop.address) + '</div>' : '') +
    '</div>'
  );
}
