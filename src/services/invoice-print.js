/* ==========================================================================
   invoice-print.js — طباعة فواتير + كشوف حساب
   ==========================================================================
   - printOrderInvoice(order, customer) — فاتورة A4 (بنود متعددة + خصم + رسوم).
   - printCustomerStatement(customer, orders, payments) — كشف حساب عميل.
   - يفتح نافذة جديدة + window.print() (مع زر إغلاق).
   - يقرأ بيانات الورشة من settings (name, logo, address, phone, whatsapp).
   - خط IBM Plex Sans Arabic + تصميم RTL احترافي.
   - توافق خلفي مع الطلبات القديمة (amount فقط).

   v3.5.13: تقسيم صيانة بلا تغيير سلوك (638 سطراً ← مدخل + 4 وحدات):
     invoice-print-css.js (PRINT_CSS) · invoice-print-shared.js (esc/التسميات/رأس وتذييل المستند)
     · invoice-print-order.js (نموذج الفاتورة + بناء مستندها) · invoice-print-statement.js (نموذج الكشف + بناء مستنده).
   نافذة الطباعة (openPrintWindow) تبقى هنا حصراً: حارس v3388 يشترط أن يكون استدعاء الكتابة في النافذة في هذا الملف وحده.
   الواجهة العامة كما كانت: STATUS_LABELS · PAYMENT_METHOD_LABELS · buildOrderInvoiceModel · printOrderInvoice
     · buildCustomerStatementModel · printCustomerStatement (invoice-image.js والاختبارات تستوردها من هنا).
   ========================================================================== */

import { esc } from './invoice-print-shared.js';
import { PRINT_CSS } from './invoice-print-css.js';
import { buildOrderInvoiceDoc } from './invoice-print-order.js';
import { buildCustomerStatementDoc } from './invoice-print-statement.js';

/* --- إعادة تصدير الواجهة العامة (نفس الأسماء والتواقيع) --- */
export { STATUS_LABELS, PAYMENT_METHOD_LABELS } from './invoice-print-shared.js';
export { buildOrderInvoiceModel } from './invoice-print-order.js';
export { buildCustomerStatementModel } from './invoice-print-statement.js';

/* ==========================================================
   3. فتح نافذة الطباعة
   ========================================================== */

/**
 * فتح نافذة منفصلة فيها HTML للطباعة.
 * @param {string} title — عنوان الصفحة
 * @param {string} bodyHtml — HTML المحتوى
 * @returns {Window|null}
 */
function openPrintWindow(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=900,height=800');
  if (!w) {
    alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
    return null;
  }

  w.document.open();
  w.document.write(
    '<!DOCTYPE html>' +
    '<html lang="ar" dir="rtl">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<title>' + esc(title) + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>' + PRINT_CSS + '</style>' +
    '</head>' +
    '<body>' +
    '<div class="action-bar">' +
      '<button class="btn-print" type="button">🖨️ طباعة</button>' +
      '<button class="btn-close" type="button">✕ إغلاق</button>' +
    '</div>' +
    bodyHtml +
    '</body></html>'
  );
  w.document.close();

  /* ⚠️ الـ CSP يمنع onclick المضمَّن، لذلك نربط الأزرار من النافذة الأم */
  try {
    const printBtn = w.document.querySelector('.btn-print');
    const closeBtn = w.document.querySelector('.btn-close');
    if (printBtn) printBtn.addEventListener('click', () => w.print());
    if (closeBtn) closeBtn.addEventListener('click', () => w.close());
  } catch (e) {
    console.warn('[invoice-print] تعذّر ربط أزرار الطباعة:', e);
  }
  return w;
}

/**
 * طباعة فاتورة A4 لطلب واحد.
 * يدعم البنود المتعددة + الخصم + الرسوم الإضافية + المقدم.
 * @param {Object} order — سجل الطلب
 * @param {Object} [customer] — سجل العميل (اختياري)
 * @returns {Promise<void>}
 */
export async function printOrderInvoice(order, customer) {
  const doc = await buildOrderInvoiceDoc(order, customer);
  if (doc) openPrintWindow(doc.title, doc.html);
}

/**
 * طباعة كشف حساب شامل لعميل (طلبات + دفعات + إجماليات).
 * @param {Object} customer
 * @param {Array} orders
 * @param {Array} payments
 * @returns {Promise<void>}
 */
export async function printCustomerStatement(customer, orders, payments) {
  const doc = await buildCustomerStatementDoc(customer, orders, payments);
  if (doc) openPrintWindow(doc.title, doc.html);
}
