/* ==========================================================================
   invoice-image.js — فاتورة الطلب كصورة + مشاركتها (واتساب)
   ==========================================================================
   - renderOrderInvoiceCanvas(order, customer) — ترسم الفاتورة على Canvas (RTL، بلا مكتبات).
   - shareOrderInvoiceImage(order, customer)   — مشاركة الصورة:
       1) Web Share API مع ملف (جوال: تظهر قائمة المشاركة فيختار واتساب والمحادثة).
       2) بديل: تنزيل الصورة + فتح محادثة واتساب العميل لإرفاقها.
   - الأرقام من buildOrderInvoiceModel نفسه الذي تعتمده الفاتورة المطبوعة.
   - الشعار لا يُرسم إلا إن كان data:image (غيره يلوّث الـ Canvas ويفشل التصدير).
   - Static imports فقط.
   ========================================================================== */

import { buildOrderInvoiceModel } from './invoice-print.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';

const W = 800;            /* العرض المنطقي (px) */
const SCALE = 2;          /* دقة الصورة الفعلية: 1600px عرضاً لتبقى واضحة في واتساب */
const PAD = 40;
const GREEN = '#1F6D57';
const DARK = '#123C2F';
const GRAY = '#666666';
const LINE = '#E5DDD0';

/** إزالة الإيموجي من نص (الخط في الصورة نصي؛ الإيموجي يظهر مربعات على بعض الأجهزة). */
function plain(s) {
  return String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, '').trim();
}

/** تحميل صورة الشعار إن كانت data:image وإلا null. */
function loadLogo(src) {
  return new Promise((resolve) => {
    if (typeof src !== 'string' || !/^data:image\//i.test(src)) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** تقسيم نص إلى أسطر بحسب العرض المتاح (يحافظ على ترتيب الكلمات المنطقي). */
function wrapLines(ctx, text, maxW) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * يرسم الفاتورة على ctx ويُرجع الارتفاع الكلي.
 * تُستدعى مرتين: على Canvas مؤقت لقياس الارتفاع ثم على الـ Canvas الفعلي.
 */
function layout(ctx, m, order, customer, logoImg, fontFamily) {
  const font = (size, weight = 400) => { ctx.font = weight + ' ' + size + 'px ' + fontFamily; };
  const R = W - PAD;      /* الحافة اليمنى (RTL) */
  const L = PAD;          /* الحافة اليسرى */
  const text = (s, x, y, o = {}) => {
    font(o.size || 18, o.weight || 400);
    ctx.fillStyle = o.color || DARK;
    ctx.textAlign = o.align || 'right';
    ctx.fillText(String(s ?? ''), x, y);
  };
  const hline = (y, color = LINE) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
  };

  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';

  /* خلفية بيضاء */
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, 5000);

  /* ---- الشريط العلوي ---- */
  const metaLines = [];
  if (m.workshop.address) metaLines.push(plain(m.workshop.address));
  if (m.workshop.phone) metaLines.push(plain(m.workshop.phone));
  const headH = Math.max(120, 78 + metaLines.length * 24);
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, W, headH);

  let nameX = R;
  if (logoImg) {
    const ls = 72;
    ctx.save();
    ctx.beginPath(); ctx.arc(R - ls / 2, 20 + ls / 2, ls / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(R - ls, 20, ls, ls);
    ctx.drawImage(logoImg, R - ls, 20, ls, ls);
    ctx.restore();
    nameX = R - ls - 14;
  }
  text(plain(m.workshop.name) || 'ورشة تفصيل الجلابيب', nameX, 56, { size: 30, weight: 700, color: '#FFFFFF' });
  metaLines.forEach((t, i) => text(t, nameX, 86 + i * 24, { size: 16, color: '#D9EFE6' }));

  text('فاتورة', L, 52, { size: 28, weight: 700, color: '#FFFFFF', align: 'left' });
  text('#' + String(order.id).slice(-6), L, 82, { size: 18, color: '#D9EFE6', align: 'left' });
  text(formatDate(order.createdAt || Date.now()), L, 106, { size: 16, color: '#D9EFE6', align: 'left' });

  let y = headH + 36;

  /* ---- بيانات العميل والطلب ---- */
  const info = [];
  info.push(['الاسم', customer ? plain(customer.name) : 'عميل محذوف']);
  if (customer && customer.phone) info.push(['الهاتف', customer.phone]);
  info.push(['الحالة', m.statusInfo.label]);
  if (order.dueDate) info.push(['تاريخ التسليم', formatDate(order.dueDate)]);
  info.forEach(([k, v]) => {
    text(k + ':', R, y, { size: 18, color: GRAY });
    text(v, R - 130, y, { size: 19, weight: 600 });
    y += 32;
  });
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

  /* ---- التذييل ---- */
  y += 18;
  hline(y);
  y += 34;
  text('شكراً لتعاملكم معنا', W / 2, y, { size: 20, weight: 600, color: GREEN, align: 'center' });
  y += 30;
  const contact = [m.workshop.phone, m.workshop.whatsapp].filter(Boolean).map(plain);
  if (contact.length) {
    text(contact.join('  |  '), W / 2, y, { size: 16, color: GRAY, align: 'center' });
    y += 26;
  }
  return y + 24;
}

/**
 * رسم الفاتورة على Canvas.
 * @param {Object} order
 * @param {Object} [customer]
 * @returns {Promise<{canvas:HTMLCanvasElement, model:Object}>}
 */
export async function renderOrderInvoiceCanvas(order, customer) {
  const model = await buildOrderInvoiceModel(order);
  const logoImg = await loadLogo(model.workshop.logo);
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* ignore */ }
  const fontFamily = (document.body && getComputedStyle(document.body).fontFamily) || 'sans-serif';

  /* قياس الارتفاع على Canvas مؤقت ثم الرسم الفعلي */
  const scratch = document.createElement('canvas');
  scratch.width = W; scratch.height = 10;
  const height = Math.ceil(layout(scratch.getContext('2d'), model, order, customer, logoImg, fontFamily));

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  layout(ctx, model, order, customer, logoImg, fontFamily);
  return { canvas, model };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذّر إنشاء الصورة'))), 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * مشاركة فاتورة الطلب كصورة.
 * @param {Object} order
 * @param {Object} [customer]
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
export async function shareOrderInvoiceImage(order, customer) {
  const { canvas, model } = await renderOrderInvoiceCanvas(order, customer);
  const blob = await canvasToBlob(canvas);
  const id6 = String(order.id).slice(-6).replace(/[^\w-]/g, '') || 'order';
  const file = new File([blob], 'invoice-' + id6 + '.png', { type: 'image/png' });
  const msg = 'فاتورة #' + id6 + ' — ' +
    (model.remaining > 0 ? 'المتبقي ' + formatEGP(model.remaining) : 'مدفوع بالكامل');

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: msg });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';   /* المستخدم ألغى */
      console.warn('[invoice-image] share failed, falling back to download', e);
    }
  }

  /* بديل: تنزيل الصورة + فتح محادثة العميل لإرفاقها */
  downloadBlob(blob, file.name);
  const phone = customer && customer.phone ? String(normalizePhone(customer.phone)).replace(/\D/g, '') : '';
  if (phone) {
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
  }
  return 'downloaded';
}
