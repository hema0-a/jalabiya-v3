/* ==========================================================================
   invoice-image-statement.js — تخطيط كشف حساب العميل على Canvas (v3.5.24)
   ==========================================================================
   مفصول عن invoice-image.js دون تغيير. API: layoutStatement(pen, model, customer, logoImg) → الارتفاع
   ========================================================================== */

import { STATUS_LABELS, PAYMENT_METHOD_LABELS } from './invoice-print.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { W, GREEN, GRAY, DARK, plain, drawHeader, drawFooter, drawInfoRows, drawTable } from './invoice-image-pen.js';

const MAX_STATEMENT_ROWS = 25;   /* آخر 25 طلباً/دفعة في الصورة (الإجماليات تشمل الكل) */

export function layoutStatement(p, m, customer, logoImg) {
  const { ctx, R, L, text } = p;
  const headH = drawHeader(p, m.workshop, logoImg, 'كشف حساب', '', formatDate(Date.now()));
  let y = headH + 36;

  const info = [['الاسم', plain(customer.name)]];
  if (customer.phone) info.push(['الهاتف', customer.phone]);
  if (customer.vip) info.push(['التصنيف', 'VIP']);
  y = drawInfoRows(p, info, y);
  y += 10;

  /* ---- ثلاث بطاقات إجماليات ---- */
  const gap = 14;
  const bw = (R - L - gap * 2) / 3;
  const boxes = [
    ['إجمالي الطلبات', formatEGP(m.totalOrders), '#F6F1E6', DARK],
    ['إجمالي المدفوع', formatEGP(m.totalPaid), '#E8F5E9', '#2E7D32'],
    ['المتبقي', formatEGP(m.remaining), m.remaining > 0 ? '#FFF3E0' : '#E8F5E9', m.remaining > 0 ? '#E65100' : '#2E7D32'],
  ];
  boxes.forEach(([label, value, bg, color], i) => {
    const x = R - bw * (i + 1) - gap * i;       /* RTL: الأول يمين */
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, bw, 92);
    text(label, x + bw / 2, y + 32, { size: 17, color: GRAY, align: 'center' });
    text(value, x + bw / 2, y + 70, { size: 24, weight: 700, color, align: 'center' });
  });
  y += 92 + 40;

  /* ---- الطلبات ---- */
  const sortedOrders = [...m.orders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const shownOrders = sortedOrders.slice(0, MAX_STATEMENT_ROWS);
  text('الطلبات (' + sortedOrders.length + ')', R, y, { size: 20, weight: 700, color: GREEN });
  y += 34;
  y = drawTable(p,
    [{ label: 'رقم', x: R - 8, align: 'right' }, { label: 'التاريخ', x: R - 150, align: 'right' },
      { label: 'الحالة', x: R - 400, align: 'right' }, { label: 'المبلغ', x: L + 10, align: 'left' }],
    shownOrders.map((o) => {
      const si = STATUS_LABELS[o.status] || STATUS_LABELS.pending;
      return [
        { t: '#' + String(o.id).slice(-6), color: GRAY },
        { t: o.createdAt ? formatDate(o.createdAt) : '—' },
        { t: si.label },
        { t: formatEGP(o.amount), bold: true, color: o.status === 'cancelled' ? '#999999' : DARK },
      ];
    }), 'لا توجد طلبات', y);
  if (sortedOrders.length > shownOrders.length) {
    text('تُعرض آخر ' + shownOrders.length + ' طلباً من ' + sortedOrders.length + ' — الإجماليات أعلاه تشمل الكل',
      W / 2, y + 22, { size: 15, color: GRAY, align: 'center' });
    y += 34;
  }
  y += 34;

  /* ---- الدفعات ---- */
  const sortedPays = [...m.payments].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const shownPays = sortedPays.slice(0, MAX_STATEMENT_ROWS);
  text('الدفعات (' + sortedPays.length + ')', R, y, { size: 20, weight: 700, color: GREEN });
  y += 34;
  y = drawTable(p,
    [{ label: 'التاريخ', x: R - 8, align: 'right' }, { label: 'طريقة الدفع', x: R - 300, align: 'right' },
      { label: 'المبلغ', x: L + 10, align: 'left' }],
    shownPays.map((pay) => [
      { t: pay.createdAt ? formatDate(pay.createdAt) : '—' },
      { t: PAYMENT_METHOD_LABELS[pay.method] || PAYMENT_METHOD_LABELS.cash },
      { t: formatEGP(pay.amount), bold: true, color: '#2E7D32' },
    ]), 'لا توجد دفعات', y);
  if (sortedPays.length > shownPays.length) {
    text('تُعرض آخر ' + shownPays.length + ' دفعة من ' + sortedPays.length + ' — الإجماليات أعلاه تشمل الكل',
      W / 2, y + 22, { size: 15, color: GRAY, align: 'center' });
    y += 34;
  }
  return drawFooter(p, m.workshop, y);
}
