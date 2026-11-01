/* ==========================================================================
   invoice-image-receipt.js — تخطيط إيصال التسليم الجزئي على Canvas (v3.3.60 · مفصول v3.5.24)
   ==========================================================================
   API: layoutDeliveryReceipt(pen, model, order, customer, logoImg, workshop, id6) → الارتفاع
   ========================================================================== */

import { formatEGP, formatDate } from '../core/utils.js';
import { GREEN, GRAY, DARK, plain, wrapLines, drawHeader, drawFooter, drawInfoRows } from './invoice-image-pen.js';

export function layoutDeliveryReceipt(p, m, order, customer, logoImg, workshop, id6) {
  const { ctx, R, L, text, hline, font } = p;
  const headH = drawHeader(p, workshop, logoImg, 'إيصال تسليم', '#' + id6, formatDate(m.at || Date.now()));
  let y = headH + 36;

  const info = [['الاسم', customer ? plain(customer.name) : 'عميل محذوف']];
  if (customer && customer.phone) info.push(['الهاتف', customer.phone]);
  y = drawInfoRows(p, info, y);
  y += 6;
  hline(y);
  y += 32;

  /* ---- القطع المسلَّمة الآن ---- */
  text('القطع المسلَّمة في هذا الإيصال', R, y, { size: 19, weight: 700, color: GREEN });
  y += 22;
  ctx.fillStyle = '#F6F1E6';
  ctx.fillRect(L, y - 4, R - L, 38);
  text('البند', R - 8, y + 22, { size: 17, weight: 700, color: GREEN });
  text('الكمية', L + 60, y + 22, { size: 17, weight: 700, color: GREEN, align: 'center' });
  y += 38;
  m.thisItems.forEach((it) => {
    font(19, 500);
    const lines = wrapLines(ctx, plain(it.name) || 'بند', R - L - 160);
    const rowH = Math.max(44, lines.length * 26 + 16);
    const top = y + (rowH - lines.length * 26) / 2 + 19;
    lines.forEach((ln, i) => text(ln, R - 8, top + i * 26 - 3, { size: 19, weight: 500 }));
    text(String(it.qty), L + 60, y + rowH / 2 + 7, { size: 20, weight: 700, align: 'center' });
    y += rowH;
    hline(y);
  });
  y += 34;

  /* ---- التقدّم والمتبقي ---- */
  text('سُلِّم ' + m.deliveredUnits + ' من ' + m.totalUnits + ' قطعة', R, y, { size: 20, weight: 700 });
  text(m.completes ? 'اكتمل تسليم الطلب' : 'المتبقي ' + m.remainingUnits + ' قطعة', L, y,
    { size: 18, weight: 600, color: m.completes ? '#2E7D32' : '#E65100', align: 'left' });
  y += 20;
  const barW = R - L;
  ctx.fillStyle = '#EFE7D8';
  ctx.fillRect(L, y, barW, 14);
  ctx.fillStyle = m.completes ? '#2E7D32' : GREEN;
  const fillW = Math.max(0, Math.min(1, m.percent / 100)) * barW;
  ctx.fillRect(R - fillW, y, fillW, 14);            /* يملأ من اليمين (اتجاه عربي) */
  y += 40;

  if (m.remainingLines.length > 0) {
    text('المتبقي للتسليم:', R, y, { size: 17, weight: 700, color: GREEN });
    y += 28;
    m.remainingLines.slice(0, 6).forEach((l) => {
      text(l.remaining + ' × ' + (plain(l.name) || 'بند'), R - 12, y, { size: 18, color: GRAY });
      y += 28;
    });
    if (m.remainingLines.length > 6) {
      text('+ ' + (m.remainingLines.length - 6) + ' بند آخر', R - 12, y, { size: 16, color: GRAY });
      y += 28;
    }
    y += 6;
  }
  hline(y);
  y += 34;

  /* ---- المبالغ ---- */
  const row = (label, value, o = {}) => {
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(L, y - 28, R - L, 44); }
    text(label, R - 12, y, { size: o.size || 20, weight: o.weight || 400, color: o.color || DARK });
    text(value, L + 12, y, { size: o.size || 20, weight: o.weight || 700, color: o.color || DARK, align: 'left' });
    y += o.gap || 40;
  };
  row('قيمة هذا التسليم', formatEGP(m.thisValue), { weight: 700 });
  if (!m.completes && m.deliveredValue !== m.thisValue) row('قيمة المسلَّم حتى الآن', formatEGP(m.deliveredValue), { color: GRAY });
  row('المدفوع حتى الآن', formatEGP(m.paid), { color: '#2E7D32' });
  if (m.collected > 0) row('محصَّل عند هذا التسليم', formatEGP(m.collected), { bg: '#E8F5E9', color: '#2E7D32', weight: 700, gap: 52 });
  if (m.dueForDelivered > 0) row('مستحق عن المسلَّم', formatEGP(m.dueForDelivered), { color: '#C62828', weight: 700 });
  if (m.balance > 0) {
    row('المتبقي على الطلب كله', formatEGP(m.balance), { bg: '#FFF3E0', color: '#E65100', weight: 700, size: 24, gap: 52 });
  } else {
    row('الطلب مدفوع بالكامل', formatEGP(Number(order.amount) || 0), { bg: '#E8F5E9', color: '#2E7D32', weight: 700, size: 24, gap: 52 });
  }

  if (m.note) {
    y += 4;
    text('ملاحظة', R, y, { size: 17, weight: 700, color: GREEN });
    y += 28;
    font(17, 400);
    wrapLines(ctx, plain(m.note), R - L).slice(0, 4).forEach((ln) => {
      text(ln, R, y, { size: 17, color: GRAY });
      y += 26;
    });
  }
  return drawFooter(p, workshop, y);
}
