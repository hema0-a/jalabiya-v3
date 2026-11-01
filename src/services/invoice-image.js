/* ==========================================================================
   invoice-image.js — فاتورة الطلب وكشف حساب العميل كصورة + مشاركتها (واتساب)
   ==========================================================================
   - renderOrderInvoiceCanvas(order, customer)              — فاتورة طلب على Canvas.
   - renderCustomerStatementCanvas(customer, orders, pays)  — كشف حساب على Canvas.
   - shareOrderInvoiceImage(order, customer)                — مشاركة الفاتورة.
   - shareCustomerStatementImage(customer, orders, pays)    — مشاركة الكشف.
   - renderDeliveryReceiptCanvas / shareDeliveryReceiptImage — إيصال تسليم جزئي (v3.3.60).
   المشاركة:
     1) Web Share API مع ملف PNG (جوال: تظهر قائمة المشاركة فيختار واتساب والمحادثة).
     2) بديل: تنزيل الصورة + فتح محادثة واتساب العميل لإرفاقها.
   - الأرقام من buildOrderInvoiceModel / buildCustomerStatementModel نفسهما
     اللذين تعتمدهما الطباعة، فلا يختلف رقم في الصورة عن المطبوع.
   - الرسم بلا مكتبات (يتوافق مع CSP ويعمل دون إنترنت)؛ الشعار لا يُرسم إلا إن كان
     data:image (غيره يلوّث الـ Canvas ويفشل التصدير).
   - Static imports فقط.

   [v3.5.24] قُسِّم الملف دون تغيير في الرسم أو الواجهة العامة (هذا الملف = الواجهة العامة فقط):
     invoice-image-pen.js       — ثوابت وأدوات الرسم المشتركة (قلم RTL، رأس، تذييل، جدول)
     invoice-image-order.js     — تخطيط الفاتورة
     invoice-image-statement.js — تخطيط كشف الحساب
     invoice-image-receipt.js   — تخطيط إيصال التسليم
     invoice-image-output.js    — paint + التصدير + المشاركة
   الوحدات لا تستورد هذا الملف (لا دورات استيراد).
   ========================================================================== */

import { buildOrderInvoiceModel, buildCustomerStatementModel } from './invoice-print.js';
import { formatEGP } from '../core/utils.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { buildDeliveryReceiptModel, receiptCaption } from './delivery-receipt.js';
import { plain } from './invoice-image-pen.js';
import { paint, shareCanvas } from './invoice-image-output.js';
import { layoutInvoice } from './invoice-image-order.js';
import { layoutStatement } from './invoice-image-statement.js';
import { layoutDeliveryReceipt } from './invoice-image-receipt.js';

/**
 * رسم فاتورة الطلب على Canvas.
 * @param {Object} order
 * @param {Object} [customer]
 * @returns {Promise<{canvas:HTMLCanvasElement, model:Object}>}
 */
export async function renderOrderInvoiceCanvas(order, customer) {
  const model = await buildOrderInvoiceModel(order);
  const canvas = await paint(model.workshop, (p, logo) => layoutInvoice(p, model, order, customer, logo));
  return { canvas, model };
}

/**
 * رسم كشف حساب عميل على Canvas.
 * @param {Object} customer
 * @param {Array} orders
 * @param {Array} payments
 * @returns {Promise<{canvas:HTMLCanvasElement, model:Object}>}
 */
export async function renderCustomerStatementCanvas(customer, orders, payments) {
  const model = await buildCustomerStatementModel(customer, orders, payments);
  const canvas = await paint(model.workshop, (p, logo) => layoutStatement(p, model, customer, logo));
  return { canvas, model };
}

/**
 * مشاركة فاتورة الطلب كصورة.
 * @param {Object} order
 * @param {Object} [customer]
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
export async function shareOrderInvoiceImage(order, customer) {
  const { canvas, model } = await renderOrderInvoiceCanvas(order, customer);
  const id6 = String(order.id).slice(-6).replace(/[^\w-]/g, '') || 'order';
  const msg = 'فاتورة #' + id6 + ' — ' +
    (model.remaining > 0 ? 'المتبقي ' + formatEGP(model.remaining) : 'مدفوع بالكامل');
  return shareCanvas(canvas, 'invoice-' + id6 + '.png', msg, customer && customer.phone);
}

/**
 * مشاركة كشف حساب العميل كصورة.
 * @param {Object} customer
 * @param {Array} orders
 * @param {Array} payments
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
export async function shareCustomerStatementImage(customer, orders, payments) {
  const { canvas, model } = await renderCustomerStatementCanvas(customer, orders, payments);
  const idPart = String(customer.id || '').slice(-6).replace(/[^\w-]/g, '') || 'customer';
  const msg = 'كشف حساب — ' + plain(customer.name) + ' — ' +
    (model.remaining > 0 ? 'المتبقي ' + formatEGP(model.remaining) : 'لا يوجد متبقٍّ');
  return shareCanvas(canvas, 'statement-' + idPart + '.png', msg, customer.phone);
}

/**
 * رسم إيصال تسليمة بعينها على Canvas.
 * @param {Object} order — الطلب بتسليماته
 * @param {string} deliveryId
 * @param {Object} [customer]
 * @param {{collected?:number}} [opts]
 * @returns {Promise<{canvas:HTMLCanvasElement, model:Object, id6:string}>}
 */
export async function renderDeliveryReceiptCanvas(order, deliveryId, customer, opts = {}) {
  let pays = [];
  try { pays = await paymentsRepo.findByOrder(order.id); } catch (e) { /* نكمل بالمقدم */ }
  const model = buildDeliveryReceiptModel({ order, deliveryId, payments: pays, collected: opts.collected });
  if (!model) throw new Error('التسليمة غير موجودة في الطلب');
  const inv = await buildOrderInvoiceModel(order);          /* بيانات الورشة نفسها المستعملة في الفاتورة */
  const id6 = String(order.id).slice(-6).replace(/[^\w-]/g, '') || 'order';
  const canvas = await paint(inv.workshop, (pen, logo) => layoutDeliveryReceipt(pen, model, order, customer, logo, inv.workshop, id6));
  return { canvas, model, id6 };
}

/**
 * مشاركة إيصال تم رسمه (يُستعمل من نافذة المعاينة فلا يُرسم مرتين).
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
export async function shareRenderedReceipt(rendered, customer) {
  const msg = receiptCaption(rendered.id6, rendered.model, formatEGP);
  return shareCanvas(rendered.canvas, 'receipt-' + rendered.id6 + '.png', msg, customer && customer.phone);
}

/** رسم إيصال تسليمة ومشاركته مباشرة. */
export async function shareDeliveryReceiptImage(order, deliveryId, customer, opts = {}) {
  const rendered = await renderDeliveryReceiptCanvas(order, deliveryId, customer, opts);
  return shareRenderedReceipt(rendered, customer);
}
