/* ==========================================================================
   invoice-image-order.js — تخطيط فاتورة الطلب على Canvas (v3.5.24)
   ==========================================================================
   مفصول عن invoice-image.js دون تغيير. API: layoutInvoice(pen, model, order, customer, logoImg) → الارتفاع
   ========================================================================== */

import { formatEGP, formatDate } from '../core/utils.js';
import { GREEN, GRAY, DARK, plain, wrapLines, drawHeader, drawFooter, drawInfoRows } from './invoice-image-pen.js';

export function layoutInvoice(p, m, order, customer, logoImg) {
  const { ctx, R, L, font, text, hline } = p;
  const headH = drawHeader(p, m.workshop, logoImg, 'فاتورة', '#' + String(order.id).slice(-6),
    formatDate(order.createdAt || Date.now()));
  let y = headH + 36;

  /* ---- بيانات العميل والطلب ---- */
  const info = [];
  info.push(['الاسم', customer ? plain(customer.name) : 'عميل محذوف']);
  if (customer && customer.phone) info.push(['الهاتف', customer.phone]);
  info.push(['الحالة', m.statusInfo.label]);
  if (order.dueDate) info.push(['تاريخ التسليم', formatDate(order.dueDate)]);
  y = drawInfoRows(p, info, y);
  y += 6;
  hline(y);
  y += 30;

  /* ---- جدول البنود ---- */
  const colQty = R - 400;      /* مركز عمود الكمية */
  const colPrice = R - 500;
  const colTotal = L + 70;     /* الإجمالي (يسار) */
  const nameW = 330;
  ctx.fillStyle = '#F6F1E6';
  ctx.fillRect(L, y - 24, R - L, 38);
  text('البند', R - 8, y + 1, { size: 17, weight: 700, color: GREEN });
  text('الكمية', colQty, y + 1, { size: 17, weight: 700, color: GREEN, align: 'center' });
  text('السعر', colPrice + 20, y + 1, { size: 17, weight: 700, color: GREEN, align: 'center' });
  text('الإجمالي', colTotal, y + 1, { size: 17, weight: 700, color: GREEN, align: 'center' });
  y += 36;

  m.items.forEach((it) => {
    font(19, 500);
    const lines = wrapLines(ctx, plain(it.name) || 'بند', nameW);
    const rowH = Math.max(46, lines.length * 26 + 18);
    const top = y + (rowH - lines.length * 26) / 2 + 19;   /* توسيط كتلة الاسم رأسياً مع بقية أعمدة الصف */
    lines.forEach((ln, i) => text(ln, R - 8, top + i * 26 - 3, { size: 19, weight: 500 }));
    const mid = y + rowH / 2 + 7;
    text(String(it.quantity), colQty, mid, { size: 19, align: 'center' });
    text(formatEGP(it.price), colPrice + 20, mid, { size: 17, align: 'center', color: GRAY });
    text(formatEGP(it.price * it.quantity), colTotal, mid, { size: 19, weight: 600, align: 'center' });
    y += rowH;
    hline(y - 4);
  });
  y += 22;

  /* ---- المجاميع ---- */
  const totalsRow = (label, value, o = {}) => {
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(L, y - 28, R - L, 44); }
    text(label, R - 12, y, { size: o.size || 20, weight: o.weight || 400, color: o.color || DARK });
    text(value, L + 12, y, { size: o.size || 20, weight: o.weight || 700, color: o.color || DARK, align: 'left' });
    y += o.gap || 40;
  };
  totalsRow('المجموع الفرعي', formatEGP(m.subtotal), { color: GRAY });
  if (m.discountAmount > 0) {
    const dv = Number(order.discountValue) || 0;
    const dvLabel = (order.discountType === 'percent') ? dv + '%' : formatEGP(dv);
    /* عزل اتجاهي (LRI/PDI): يمنع انقلاب «10%» إلى «%10» داخل نص عربي */
    totalsRow('خصم (\u2066' + dvLabel + '\u2069)', '− ' + formatEGP(m.discountAmount), { color: '#C62828' });
  }
  if (m.extraFeesTotal > 0) totalsRow('رسوم إضافية', '+ ' + formatEGP(m.extraFeesTotal), { color: GRAY });
  totalsRow('الإجمالي', formatEGP(m.total), { weight: 700, size: 22 });
  if (m.deposit > 0) totalsRow(m.paidLabel, '− ' + formatEGP(m.deposit), { color: '#2E7D32' });
  if (m.remaining > 0) {
    totalsRow('المتبقي', formatEGP(m.remaining), { bg: '#FFF3E0', color: '#E65100', weight: 700, size: 24, gap: 52 });
  } else {
    totalsRow('مدفوع بالكامل', formatEGP(m.total), { bg: '#E8F5E9', color: '#2E7D32', weight: 700, size: 24, gap: 52 });
  }

  /* ---- ملاحظات ---- */
  if (order.notes) {
    y += 4;
    text('ملاحظات', R, y, { size: 17, weight: 700, color: GREEN });
    y += 28;
    font(17, 400);
    wrapLines(ctx, plain(order.notes), R - L).slice(0, 6).forEach((ln) => {
      text(ln, R, y, { size: 17, color: GRAY });
      y += 26;
    });
  }
  return drawFooter(p, m.workshop, y);
}
