/* ==========================================================================
   invoice-print.js — طباعة فواتير + كشوف حساب
   ==========================================================================
   - printOrderInvoice(order, customer) — فاتورة A4 (بنود متعددة + خصم + رسوم).
   - printCustomerStatement(customer, orders, payments) — كشف حساب عميل.
   - يفتح نافذة جديدة + window.print() (مع زر إغلاق).
   - يقرأ بيانات الورشة من settings (name, logo, address, phone, whatsapp).
   - خط IBM Plex Sans Arabic + تصميم RTL احترافي.
   - توافق خلفي مع الطلبات القديمة (amount فقط).
   ========================================================================== */

import { settings } from '../data/repos/settings.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { withDepositPayments, orderPaidBreakdown } from './payments-view.js';
import { formatEGP, formatDate } from '../core/utils.js';

/* ==========================================================
   1. أدوات
   ========================================================== */

/**
 * تهريب HTML (أمان ضد XSS).
 * @param {*} s
 * @returns {string}
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** حالات الطلب. */
const STATUS_LABELS = {
  pending:     { label: 'قيد الانتظار', cls: 'pending' },
  in_progress: { label: 'قيد التنفيذ', cls: 'in_progress' },
  ready:       { label: 'جاهز للتسليم', cls: 'ready' },
  delivered:   { label: 'تم التسليم', cls: 'delivered' },
  cancelled:   { label: 'ملغي', cls: 'cancelled' },
};

/** خرائط الرسوم الإضافية. */
const FEE_TYPE_LABELS = {
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
async function getWorkshop() {
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
function orderItems(order) {
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
   2. CSS مشترك
   ========================================================== */
const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4; margin: 12mm; }
body {
  font-family: 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;
  color: #1A1A1A; background: #fff;
  line-height: 1.5; font-size: 13px; padding: 24px;
}
.invoice { max-width: 820px; margin: 0 auto; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 20px; padding-bottom: 16px;
  border-bottom: 3px solid #1F6D57; margin-bottom: 24px;
}
.ws-info { display: flex; align-items: center; gap: 14px; }
.ws-logo {
  width: 64px; height: 64px; border-radius: 12px;
  background: linear-gradient(135deg, #2E8B6F, #1F6D57);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 32px; flex-shrink: 0; overflow: hidden;
}
.ws-logo img { width: 100%; height: 100%; object-fit: cover; }
.ws-name { font-size: 20px; font-weight: 700; color: #123C2F; margin-bottom: 4px; }
.ws-meta { font-size: 11px; color: #666; line-height: 1.6; }
.doc-info { text-align: left; flex-shrink: 0; }
.doc-title { font-size: 22px; font-weight: 700; color: #1F6D57; }
.doc-num { font-size: 13px; color: #123C2F; font-weight: 600; margin-top: 4px; }
.doc-date { font-size: 11px; color: #999; margin-top: 2px; }
.section { margin-bottom: 20px; }
.section-title {
  font-size: 12px; font-weight: 700; color: #1F6D57;
  margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid #E5DDD0;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
.info-item { display: flex; gap: 8px; font-size: 13px; padding: 3px 0; }
.info-item .lbl { color: #666; min-width: 70px; }
.info-item .val { color: #123C2F; font-weight: 500; }
table { width: 100%; border-collapse: collapse; }
th {
  background: #F6F1E6; color: #123C2F;
  padding: 10px 8px; text-align: right;
  font-weight: 600; font-size: 12px;
  border-bottom: 2px solid #1F6D57;
}
td { padding: 10px 8px; border-bottom: 1px solid #E5DDD0; font-size: 13px; }
tr:last-child td { border-bottom: none; }
.totals { margin-top: 16px; display: flex; justify-content: flex-end; }
.totals-table { width: 380px; border: 1px solid #E5DDD0; border-radius: 8px; overflow: hidden; }
.totals-table td { padding: 8px 12px; }
.totals-table tr.grand td { background: #1F6D57; color: #fff; font-weight: 700; font-size: 15px; }
.totals-table tr.highlight td { background: #FFF3E0; color: #E65100; font-weight: 700; }
.totals-table tr.discount td { color: #C62828; }
.totals-table tr.fees td { color: #F57C00; }
.totals-table tr.deposit td { color: #2E7D32; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge.pending { background: #FFF3E0; color: #F57C00; }
.badge.in_progress { background: #E3F2FD; color: #1565C0; }
.badge.ready { background: #F3E5F5; color: #6A1B9A; }
.badge.delivered { background: #E8F5E9; color: #2E7D32; }
.badge.cancelled { background: #FFEBEE; color: #C62828; }
.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.stat-box { padding: 12px; border-radius: 10px; text-align: center; border: 1px solid #E5DDD0; }
.stat-box .lbl { font-size: 11px; color: #666; margin-bottom: 4px; }
.stat-box .val { font-size: 17px; font-weight: 700; color: #123C2F; }
.stat-box.success { background: #E8F5E9; border-color: #A5D6A7; }
.stat-box.success .val { color: #2E7D32; }
.stat-box.warn { background: #FFF3E0; border-color: #FFCC80; }
.stat-box.warn .val { color: #E65100; }
.footer {
  margin-top: 30px; padding-top: 16px;
  border-top: 2px solid #E5DDD0;
  text-align: center; font-size: 11px; color: #666; line-height: 1.8;
}
.footer .thanks { font-size: 14px; font-weight: 600; color: #1F6D57; margin-bottom: 6px; }
.action-bar { position: fixed; top: 16px; left: 16px; display: flex; gap: 8px; z-index: 999; }
.action-bar button {
  padding: 10px 18px; font-family: inherit; font-size: 14px; font-weight: 600;
  border: none; border-radius: 8px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.btn-print { background: #1F6D57; color: #fff; }
.btn-close { background: #fff; color: #333; border: 1px solid #ddd !important; }
@media print {
  body { padding: 0; background: #fff; }
  .action-bar { display: none !important; }
}
`;

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
function buildWorkshopHeader(workshop, docTitle, docNumber, docDate) {
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
function buildFooter(workshop) {
  return (
    '<div class="footer">' +
      '<div class="thanks">شكراً لتعاملكم معنا 🌹</div>' +
      (workshop.phone    ? '<div>📞 ' + esc(workshop.phone) + '</div>' : '') +
      (workshop.whatsapp ? '<div>💬 WhatsApp: ' + esc(workshop.whatsapp) + '</div>' : '') +
      (workshop.address  ? '<div>📍 ' + esc(workshop.address) + '</div>' : '') +
    '</div>'
  );
}

/* ==========================================================
   5. printOrderInvoice — فاتورة طلب (متعددة البنود)
   ========================================================== */

/**
 * طباعة فاتورة A4 لطلب واحد.
 * يدعم البنود المتعددة + الخصم + الرسوم الإضافية + المقدم.
 * @param {Object} order — سجل الطلب
 * @param {Object} [customer] — سجل العميل (اختياري)
 * @returns {Promise<void>}
 */
export async function printOrderInvoice(order, customer) {
  if (!order) return;

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

      buildFooter(workshop) +
    '</div>';

  openPrintWindow('فاتورة #' + String(order.id).slice(-6), html);
}

/* ==========================================================
   6. printCustomerStatement — كشف حساب عميل
   ========================================================== */

/**
 * طباعة كشف حساب شامل لعميل (طلبات + دفعات + إجماليات).
 * @param {Object} customer
 * @param {Array} orders
 * @param {Array} payments
 * @returns {Promise<void>}
 */
export async function printCustomerStatement(customer, orders, payments) {
  if (!customer) return;

  const workshop = await getWorkshop();

  /* نفس قواعد بقية التطبيق: لا تُحسب الطلبات الملغاة، ويُحسب المقدم للطلب بلا دفعات */
  payments = withDepositPayments(payments || [], orders || []);
  const totalOrders = (orders || [])
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalPaid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, totalOrders - totalPaid);

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
    const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى', deposit: 'مقدم الطلب' };
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

  openPrintWindow('كشف حساب — ' + customer.name, html);
}
