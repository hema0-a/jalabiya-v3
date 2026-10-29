/* ==========================================================================
   invoice-print-statement.js — نموذج كشف حساب العميل وبناء مستنده (v3.5.13)
   ==========================================================================
   buildCustomerStatementModel(customer, orders, payments) · buildCustomerStatementDoc(customer, orders, payments) — منقولتان حرفياً (الثانية كانت printCustomerStatement وتُرجع الآن {title, html}).
   ========================================================================== */

import { esc, STATUS_LABELS, PAYMENT_METHOD_LABELS, getWorkshop, buildWorkshopHeader, buildFooter } from './invoice-print-shared.js';
import { withDepositPayments } from './payments-view.js';
import { formatEGP, formatDate } from '../core/utils.js';

/* ==========================================================
   6. printCustomerStatement — كشف حساب عميل
   ========================================================== */

/**
 * نموذج بيانات كشف حساب العميل (الإجماليات + الدفعات بعد دمج المقدم) — مصدر واحد للطباعة وللصورة.
 * @param {Object} customer
 * @param {Array} orders
 * @param {Array} payments
 * @returns {Promise<{workshop:Object, orders:Array, payments:Array, totalOrders:number, totalPaid:number, remaining:number}>}
 */
export async function buildCustomerStatementModel(customer, orders, payments) {
  const workshop = await getWorkshop();

  /* نفس قواعد بقية التطبيق: لا تُحسب الطلبات الملغاة، ويُحسب المقدم للطلب بلا دفعات */
  payments = withDepositPayments(payments || [], orders || []);
  const totalOrders = (orders || [])
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalPaid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, totalOrders - totalPaid);
  return { workshop, orders: orders || [], payments: payments || [], totalOrders, totalPaid, remaining };
}

/**
 * بناء مستند كشف حساب شامل لعميل (طلبات + دفعات + إجماليات) — الطباعة الفعلية في invoice-print.js.
 * @param {Object} customer
 * @param {Array} orders
 * @param {Array} payments
 * @returns {Promise<{title:string, html:string}|null>}
 */
export async function buildCustomerStatementDoc(customer, orders, payments) {
  if (!customer) return null;

  const model = await buildCustomerStatementModel(customer, orders, payments);
  const { workshop, totalOrders, totalPaid, remaining } = model;
  payments = model.payments;

  /* صفوف الطلبات */
  let ordersRows = '';
  if (!orders || orders.length === 0) {
    ordersRows = '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">لا توجد طلبات</td></tr>';
  } else {
    const sorted = [...orders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    sorted.forEach((o) => {
      const si = STATUS_LABELS[o.status] || STATUS_LABELS.pending;
      ordersRows +=
        '<tr>' +
          '<td style="color:#666">#' + esc(String(o.id).slice(-6)) + '</td>' +
          '<td>' + (o.createdAt ? esc(formatDate(o.createdAt)) : '—') + '</td>' +
          '<td><span class="badge ' + si.cls + '">' + si.label + '</span></td>' +
          '<td style="text-align:left;font-weight:600">' + formatEGP(o.amount) + '</td>' +
        '</tr>';
    });
  }

  /* صفوف الدفعات */
  let paymentsRows = '';
  if (!payments || payments.length === 0) {
    paymentsRows = '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px">لا توجد دفعات</td></tr>';
  } else {
    const methods = PAYMENT_METHOD_LABELS;
    const sorted = [...payments].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    sorted.forEach((p) => {
      paymentsRows +=
        '<tr>' +
          '<td>' + (p.createdAt ? esc(formatDate(p.createdAt)) : '—') + '</td>' +
          '<td>' + esc(methods[p.method] || 'نقدي') + '</td>' +
          '<td style="text-align:left;font-weight:600;color:#2E7D32">' + formatEGP(p.amount) + '</td>' +
        '</tr>';
    });
  }

  const html =
    '<div class="invoice">' +
      buildWorkshopHeader(workshop, 'كشف حساب', '', formatDate(Date.now())) +

      /* بيانات العميل */
      '<div class="section">' +
        '<div class="section-title">👤 بيانات العميل</div>' +
        '<div class="info-grid">' +
          '<div class="info-item"><span class="lbl">الاسم:</span><span class="val">' + esc(customer.name) + '</span></div>' +
          (customer.phone
            ? '<div class="info-item"><span class="lbl">الهاتف:</span><span class="val">' + esc(customer.phone) + '</span></div>'
            : '') +
          (customer.vip
            ? '<div class="info-item"><span class="lbl">التصنيف:</span><span class="val">⭐ VIP</span></div>'
            : '') +
          (customer.address
            ? '<div class="info-item" style="grid-column:1/-1"><span class="lbl">العنوان:</span><span class="val">' + esc(customer.address) + '</span></div>'
            : '') +
        '</div>' +
      '</div>' +

      /* بطاقات الإجماليات */
      '<div class="stats-row">' +
        '<div class="stat-box">' +
          '<div class="lbl">إجمالي الطلبات</div>' +
          '<div class="val">' + formatEGP(totalOrders) + '</div>' +
        '</div>' +
        '<div class="stat-box success">' +
          '<div class="lbl">إجمالي المدفوع</div>' +
          '<div class="val">' + formatEGP(totalPaid) + '</div>' +
        '</div>' +
        '<div class="stat-box ' + (remaining > 0 ? 'warn' : 'success') + '">' +
          '<div class="lbl">المتبقي</div>' +
          '<div class="val">' + formatEGP(remaining) + '</div>' +
        '</div>' +
      '</div>' +

      /* الطلبات */
      '<div class="section">' +
        '<div class="section-title">📋 الطلبات (' + (orders ? orders.length : 0) + ')</div>' +
        '<table>' +
          '<thead><tr>' +
            '<th style="width:100px">رقم</th>' +
            '<th>التاريخ</th>' +
            '<th style="width:130px">الحالة</th>' +
            '<th style="width:120px;text-align:left">المبلغ</th>' +
          '</tr></thead>' +
          '<tbody>' + ordersRows + '</tbody>' +
        '</table>' +
      '</div>' +

      /* الدفعات */
      '<div class="section">' +
        '<div class="section-title">💰 الدفعات (' + (payments ? payments.length : 0) + ')</div>' +
        '<table>' +
          '<thead><tr>' +
            '<th>التاريخ</th>' +
            '<th style="width:140px">طريقة الدفع</th>' +
            '<th style="width:130px;text-align:left">المبلغ</th>' +
          '</tr></thead>' +
          '<tbody>' + paymentsRows + '</tbody>' +
        '</table>' +
      '</div>' +

      buildFooter(workshop) +
    '</div>';

  return { title: 'كشف حساب — ' + customer.name, html };
}
