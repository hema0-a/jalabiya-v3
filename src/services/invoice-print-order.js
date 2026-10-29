/* ==========================================================================
   invoice-print-order.js — نموذج فاتورة الطلب وبناء مستندها (v3.5.13)
   ==========================================================================
   buildOrderInvoiceModel(order) · buildOrderInvoiceDoc(order, customer) — منقولتان حرفياً (الدالة الثانية كانت printOrderInvoice وتُرجع الآن {title, html}).
   ========================================================================== */

import { esc, STATUS_LABELS, FEE_TYPE_LABELS, getWorkshop, orderItems, buildWorkshopHeader, buildFooter } from './invoice-print-shared.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { orderPaidBreakdown } from './payments-view.js';
import { formatEGP, formatDate } from '../core/utils.js';

/* ==========================================================
   5. printOrderInvoice — فاتورة طلب (متعددة البنود)
   ========================================================== */

/**
 * نموذج بيانات فاتورة الطلب (المجاميع والمدفوع والمتبقي) — مصدر واحد للطباعة وللصورة،
 * فلا يختلف رقم في الصورة المرسلة للعميل عن الفاتورة المطبوعة.
 * @param {Object} order
 * @returns {Promise<{workshop:Object, items:Array, subtotal:number, discountAmount:number,
 *   extraFeesTotal:number, total:number, deposit:number, paidLabel:string, remaining:number,
 *   statusInfo:{label:string,cls:string}}>}
 */
export async function buildOrderInvoiceModel(order) {
  const workshop = await getWorkshop();

  /* البنود (توافق خلفي) */
  const items = orderItems(order);

  /* المجاميع */
  const subtotalFromItems = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : subtotalFromItems;
  const discountAmount = Number(order.discountAmount) || 0;
  const extraFeesTotal = Number(order.extraFeesTotal) || 0;
  const total = Number(order.amount) || 0;
  /* المدفوع = الدفعات المسجّلة + المقدم غير المسجّل كدفعة (نفس قاعدة بقية التطبيق) */
  let recordedList = [];
  try { recordedList = await paymentsRepo.findByOrder(order.id); }
  catch (e) { /* نكمل بالمقدم */ }
  const breakdown = orderPaidBreakdown(order, recordedList);
  const hasRecorded = breakdown.recorded > 0;
  const deposit = breakdown.paid;
  const paidLabel = hasRecorded ? 'المدفوع' : 'المقدم';
  const remaining = Math.max(0, total - deposit);

  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
  return { workshop, items, subtotal, discountAmount, extraFeesTotal, total, deposit, paidLabel, remaining, statusInfo };
}

/**
 * بناء مستند فاتورة A4 لطلب واحد (العنوان + HTML) — الطباعة الفعلية في invoice-print.js.
 * يدعم البنود المتعددة + الخصم + الرسوم الإضافية + المقدم.
 * @param {Object} order — سجل الطلب
 * @param {Object} [customer] — سجل العميل (اختياري)
 * @returns {Promise<{title:string, html:string}|null>}
 */
export async function buildOrderInvoiceDoc(order, customer) {
  if (!order) return null;

  const { workshop, items, subtotal, discountAmount, extraFeesTotal, total, deposit, paidLabel, remaining, statusInfo } =
    await buildOrderInvoiceModel(order);

  /* صفوف البنود */
  let itemsRows = '';
  items.forEach((it, i) => {
    itemsRows +=
      '<tr>' +
        '<td style="text-align:center;color:#999">' + (i + 1) + '</td>' +
        '<td>' + esc(it.name) + '</td>' +
        '<td style="text-align:center">' + it.quantity + '</td>' +
        '<td style="text-align:center">' + formatEGP(it.price) + '</td>' +
        '<td style="text-align:center;font-weight:600">' + formatEGP(it.price * it.quantity) + '</td>' +
      '</tr>';
  });

  /* الرسوم الإضافية (بالتفصيل) */
  let extraFeesRows = '';
  if (Array.isArray(order.extraFees) && order.extraFees.length > 0) {
    order.extraFees.forEach((f) => {
      if (!f.value || f.value <= 0) return;
      const label = FEE_TYPE_LABELS[f.feeType] || 'رسم';
      const valStr = (f.type === 'percent')
        ? (Number(f.value) || 0) + '%'
        : formatEGP(f.value);
      extraFeesRows +=
        '<tr>' +
          '<td>' + esc(label) + '</td>' +
          '<td style="text-align:left">' + esc(valStr) + '</td>' +
        '</tr>';
    });
  }

  /* جدول المجاميع */
  let totalsRows = '';
  totalsRows +=
    '<tr><td>المجموع الفرعي</td><td style="text-align:left">' + formatEGP(subtotal) + '</td></tr>';

  if (discountAmount > 0) {
    const dv = Number(order.discountValue) || 0;
    const dt = order.discountType || 'fixed';
    const dvLabel = (dt === 'percent') ? dv + '%' : formatEGP(dv);
    totalsRows +=
      '<tr class="discount"><td>خصم (' + esc(dvLabel) + ')</td>' +
      '<td style="text-align:left">− ' + formatEGP(discountAmount) + '</td></tr>';
  }

  if (extraFeesTotal > 0) {
    totalsRows +=
      '<tr class="fees"><td>رسوم إضافية</td>' +
      '<td style="text-align:left">+ ' + formatEGP(extraFeesTotal) + '</td></tr>';
  }

  totalsRows +=
    '<tr class="' + (deposit > 0 ? '' : (remaining > 0 ? 'highlight' : 'grand')) + '">' +
      '<td>' + (deposit > 0 ? 'الإجمالي' : (remaining > 0 ? 'المتبقي' : 'مدفوع بالكامل')) + '</td>' +
      '<td style="text-align:left">' + formatEGP(deposit > 0 ? total : remaining) + '</td>' +
    '</tr>';

  if (deposit > 0) {
    totalsRows +=
      '<tr class="deposit"><td>' + paidLabel + '</td>' +
      '<td style="text-align:left">− ' + formatEGP(deposit) + '</td></tr>' +
      '<tr class="' + (remaining > 0 ? 'highlight' : 'grand') + '">' +
        '<td>' + (remaining > 0 ? 'المتبقي' : 'مدفوع بالكامل') + '</td>' +
        '<td style="text-align:left">' + formatEGP(remaining) + '</td>' +
      '</tr>';
  }

  /* تفاصيل الرسوم الإضافية */
  const extraFeesDetail = extraFeesRows
    ? '<div class="section">' +
        '<div class="section-title">➕ تفصيل الرسوم الإضافية</div>' +
        '<table><tbody>' + extraFeesRows + '</tbody></table>' +
      '</div>'
    : '';

  const html =
    '<div class="invoice">' +
      buildWorkshopHeader(
        workshop,
        'فاتورة',
        '#' + String(order.id).slice(-6),
        order.createdAt ? formatDate(order.createdAt) : formatDate(Date.now())
      ) +

      /* بيانات العميل */
      '<div class="section">' +
        '<div class="section-title">👤 بيانات العميل</div>' +
        '<div class="info-grid">' +
          '<div class="info-item"><span class="lbl">الاسم:</span><span class="val">' +
            esc(customer ? customer.name : 'عميل محذوف') + '</span></div>' +
          (customer && customer.phone
            ? '<div class="info-item"><span class="lbl">الهاتف:</span><span class="val">' + esc(customer.phone) + '</span></div>'
            : '') +
          (customer && customer.address
            ? '<div class="info-item" style="grid-column:1/-1"><span class="lbl">العنوان:</span><span class="val">' + esc(customer.address) + '</span></div>'
            : '') +
        '</div>' +
      '</div>' +

      /* تفاصيل الطلب */
      '<div class="section">' +
        '<div class="section-title">📋 تفاصيل الطلب</div>' +
        '<div class="info-grid">' +
          '<div class="info-item"><span class="lbl">الحالة:</span><span class="val">' +
            '<span class="badge ' + statusInfo.cls + '">' + statusInfo.label + '</span>' +
          '</span></div>' +
          (order.receivedDate
            ? '<div class="info-item"><span class="lbl">استلام القماش:</span><span class="val">' + esc(formatDate(order.receivedDate)) + '</span></div>'
            : '') +
          (order.dueDate
            ? '<div class="info-item"><span class="lbl">تاريخ التسليم:</span><span class="val">' + esc(formatDate(order.dueDate)) + '</span></div>'
            : '') +
        '</div>' +
      '</div>' +

      /* البنود */
      '<div class="section">' +
        '<div class="section-title">📦 البنود (' + items.length + ')</div>' +
        '<table>' +
          '<thead><tr>' +
            '<th style="width:40px;text-align:center">#</th>' +
            '<th>البند</th>' +
            '<th style="width:60px;text-align:center">الكمية</th>' +
            '<th style="width:100px;text-align:center">السعر</th>' +
            '<th style="width:110px;text-align:center">الإجمالي</th>' +
          '</tr></thead>' +
          '<tbody>' + itemsRows + '</tbody>' +
        '</table>' +
      '</div>' +

      extraFeesDetail +

      /* المجاميع */
      '<div class="totals">' +
        '<table class="totals-table">' + totalsRows + '</table>' +
      '</div>' +

      (order.notes
        ? '<div class="section" style="margin-top:24px">' +
            '<div class="section-title">📝 ملاحظات</div>' +
            '<p style="font-size:13px;color:#666;line-height:1.6">' + esc(order.notes) + '</p>' +
          '</div>'
        : '') +

      buildFooter(workshop, true) +
    '</div>';

  return { title: 'فاتورة #' + String(order.id).slice(-6), html };
}
