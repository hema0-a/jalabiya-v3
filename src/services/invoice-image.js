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
   ========================================================================== */

import {
  buildOrderInvoiceModel, buildCustomerStatementModel, STATUS_LABELS, PAYMENT_METHOD_LABELS,
} from './invoice-print.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { buildDeliveryReceiptModel, receiptCaption } from './delivery-receipt.js';

const W = 800;            /* العرض المنطقي (px) */
const SCALE = 2;          /* دقة الصورة الفعلية: 1600px عرضاً لتبقى واضحة في واتساب */
const PAD = 40;
const GREEN = '#1F6D57';
const DARK = '#123C2F';
const GRAY = '#666666';
const LINE = '#E5DDD0';
const MAX_STATEMENT_ROWS = 25;   /* آخر 25 طلباً/دفعة في الصورة (الإجماليات تشمل الكل) */

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

/** أدوات الرسم المشتركة (RTL). */
function makePen(ctx, fontFamily) {
  const R = W - PAD;   /* الحافة اليمنى */
  const L = PAD;       /* الحافة اليسرى */
  const font = (size, weight = 400) => { ctx.font = weight + ' ' + size + 'px ' + fontFamily; };
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
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, 12000);
  return { R, L, font, text, hline, ctx };
}

/** الشريط العلوي (اسم الورشة + عنوان المستند). يُرجع الارتفاع. */
function drawHeader(p, workshop, logoImg, title, num, date) {
  const { ctx, R, L, text } = p;
  const metaLines = [];
  if (workshop.address) metaLines.push(plain(workshop.address));
  if (workshop.phone) metaLines.push(plain(workshop.phone));
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
  text(plain(workshop.name) || 'ورشة تفصيل الجلابيب', nameX, 56, { size: 30, weight: 700, color: '#FFFFFF' });
  metaLines.forEach((t, i) => text(t, nameX, 86 + i * 24, { size: 16, color: '#D9EFE6' }));

  text(title, L, 52, { size: 28, weight: 700, color: '#FFFFFF', align: 'left' });
  if (num) text(num, L, 82, { size: 18, color: '#D9EFE6', align: 'left' });
  text(date, L, num ? 106 : 82, { size: 16, color: '#D9EFE6', align: 'left' });
  return headH;
}

/** التذييل. يُرجع y الجديد. */
function drawFooter(p, workshop, y) {
  const { R, L, text, hline } = p;
  y += 18;
  hline(y);
  y += 34;
  text('شكراً لتعاملكم معنا', W / 2, y, { size: 20, weight: 600, color: GREEN, align: 'center' });
  y += 30;
  const contact = [workshop.phone, workshop.whatsapp].filter(Boolean).map(plain);
  if (contact.length) {
    text(contact.join('  |  '), W / 2, y, { size: 16, color: GRAY, align: 'center' });
    y += 26;
  }
  void R; void L;
  return y + 24;
}

/** بيانات العميل (اسم/هاتف/…) كأزواج. يُرجع y الجديد. */
function drawInfoRows(p, rows, y) {
  const { R, text } = p;
  rows.forEach(([k, v]) => {
    text(k + ':', R, y, { size: 18, color: GRAY });
    text(v, R - 130, y, { size: 19, weight: 600 });
    y += 32;
  });
  return y;
}

/* ==========================================================================
   فاتورة الطلب
   ========================================================================== */

function layoutInvoice(p, m, order, customer, logoImg) {
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

/* ==========================================================================
   كشف حساب العميل
   ========================================================================== */

/** جدول بسيط: أعمدة [{label, x, align, w?}] وصفوف مصفوفات نصوص. يُرجع y الجديد. */
function drawTable(p, cols, rows, emptyText, y) {
  const { ctx, R, L, text, hline } = p;
  ctx.fillStyle = '#F6F1E6';
  ctx.fillRect(L, y - 24, R - L, 38);
  cols.forEach((c) => text(c.label, c.x, y + 1, { size: 17, weight: 700, color: GREEN, align: c.align }));
  y += 36;
  if (!rows.length) {
    text(emptyText, W / 2, y + 14, { size: 18, color: '#999999', align: 'center' });
    return y + 46;
  }
  rows.forEach((r) => {
    cols.forEach((c, i) => text(r[i].t, c.x, y + 14, { size: 18, weight: r[i].bold ? 600 : 400, color: r[i].color || DARK, align: c.align }));
    y += 40;
    hline(y - 8);
  });
  return y;
}

function layoutStatement(p, m, customer, logoImg) {
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

/* ==========================================================================
   الرسم والتصدير
   ========================================================================== */

/**
 * قياس الارتفاع على Canvas مؤقت ثم الرسم الفعلي بدقة SCALE.
 * @param {Function} layoutFn — (pen) => الارتفاع الكلي
 */
async function paint(workshop, layoutFn) {
  const logoImg = await loadLogo(workshop.logo);
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* ignore */ }
  const fontFamily = (document.body && getComputedStyle(document.body).fontFamily) || 'sans-serif';

  const scratch = document.createElement('canvas');
  scratch.width = W; scratch.height = 10;
  const height = Math.ceil(layoutFn(makePen(scratch.getContext('2d'), fontFamily), logoImg));

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  layoutFn(makePen(ctx, fontFamily), logoImg);
  return canvas;
}

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
 * مشاركة صورة: Web Share مع ملف، وإلا تنزيل + فتح محادثة واتساب العميل.
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
async function shareCanvas(canvas, filename, message, customerPhone) {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';   /* المستخدم ألغى */
      console.warn('[invoice-image] share failed, falling back to download', e);
    }
  }

  /* بديل: تنزيل الصورة + فتح محادثة العميل لإرفاقها */
  downloadBlob(blob, filename);
  const phone = customerPhone ? String(normalizePhone(customerPhone)).replace(/\D/g, '') : '';
  if (phone) {
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
  }
  return 'downloaded';
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

/* ==========================================================================
   إيصال تسليم جزئي (v3.3.60)
   ========================================================================== */

function layoutDeliveryReceipt(p, m, order, customer, logoImg, workshop, id6) {
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
