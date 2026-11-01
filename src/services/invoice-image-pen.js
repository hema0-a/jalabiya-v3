/* ==========================================================================
   invoice-image-pen.js — ثوابت وأدوات الرسم المشتركة لصور الفواتير (v3.5.24)
   ==========================================================================
   مفصول عن invoice-image.js دون تغيير في الرسم: نص عادي، شعار، التفاف أسطر،
   «قلم» RTL، الرأس والتذييل وصفوف البيانات والجدول.
   لا يستورد أي ملف من invoice-image*.js (لا دورات استيراد).
   ========================================================================== */

export const W = 800;            /* العرض المنطقي (px) */
const PAD = 40;
export const GREEN = '#1F6D57';
export const DARK = '#123C2F';
export const GRAY = '#666666';
const LINE = '#E5DDD0';

/** إزالة الإيموجي من نص (الخط في الصورة نصي؛ الإيموجي يظهر مربعات على بعض الأجهزة). */
export function plain(s) {
  return String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, '').trim();
}

/** تحميل صورة الشعار إن كانت data:image وإلا null. */
export function loadLogo(src) {
  return new Promise((resolve) => {
    if (typeof src !== 'string' || !/^data:image\//i.test(src)) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** تقسيم نص إلى أسطر بحسب العرض المتاح (يحافظ على ترتيب الكلمات المنطقي). */
export function wrapLines(ctx, text, maxW) {
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
export function makePen(ctx, fontFamily) {
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
export function drawHeader(p, workshop, logoImg, title, num, date) {
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
export function drawFooter(p, workshop, y) {
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
export function drawInfoRows(p, rows, y) {
  const { R, text } = p;
  rows.forEach(([k, v]) => {
    text(k + ':', R, y, { size: 18, color: GRAY });
    text(v, R - 130, y, { size: 19, weight: 600 });
    y += 32;
  });
  return y;
}

/** جدول بسيط: أعمدة [{label, x, align, w?}] وصفوف مصفوفات نصوص. يُرجع y الجديد. */
export function drawTable(p, cols, rows, emptyText, y) {
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
