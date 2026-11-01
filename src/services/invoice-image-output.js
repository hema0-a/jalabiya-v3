/* ==========================================================================
   invoice-image-output.js — الرسم النهائي والتصدير والمشاركة (v3.5.24)
   ==========================================================================
   مفصول عن invoice-image.js دون تغيير.
   - paint(workshop, layoutFn): قياس الارتفاع على Canvas مؤقت ثم الرسم بدقة SCALE.
   - shareCanvas(...): Web Share مع ملف PNG، وإلا تنزيل + فتح محادثة واتساب العميل.
   ========================================================================== */

import { normalizePhone } from '../core/utils.js';
import { W, loadLogo, makePen } from './invoice-image-pen.js';

const SCALE = 2;          /* دقة الصورة الفعلية: 1600px عرضاً لتبقى واضحة في واتساب */

/**
 * قياس الارتفاع على Canvas مؤقت ثم الرسم الفعلي بدقة SCALE.
 * @param {Function} layoutFn — (pen) => الارتفاع الكلي
 */
export async function paint(workshop, layoutFn) {
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
export async function shareCanvas(canvas, filename, message, customerPhone) {
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
