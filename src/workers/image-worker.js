/* ==========================================================================
   image-worker.js — ضغط الصور خارج الخيط الرئيسي (v3.5.17)
   ==========================================================================
   Module Worker (يُنشأ من services/image-worker-client.js).
   الرسالة الواردة: { id, file, quality, maxSizeKB, maxDimensionPx }
   الرد: { id, ok:true, blob, sizeKB, width, height } أو { id, ok:false, code, error }
   - يستورد النواة النقية وحدها (services/image-compress-core.js): بلا DOM ولا config.js.
   - فك الترميز بـ createImageBitmap مع imageOrientation:'from-image' (اتجاه EXIF كما يفعل <img>
     في المسار الرئيسي). إن لم يدعمه المتصفح يردّ code='unsupported' فيُكمل المستدعي على الخيط الرئيسي.
   - الترميز بـ OffscreenCanvas.convertToBlob (JPEG)، وخلفية بيضاء للصور الشفافة.
   - أي فشل ⟵ رد ok:false (لا يُرمى خطأ غير ملتقط)؛ والمستدعي يتراجع للخيط الرئيسي.
   ========================================================================== */

import { fitDimensions, searchEncoding, fillWhite } from '../services/image-compress-core.js';

/** نص خطأ آمن للإرسال. */
function msgOf(e) {
  return String((e && e.message) || e || '');
}

/**
 * يعالج مهمة ضغط واحدة ويردّ على الخيط الرئيسي.
 * @param {{id:number, file:Blob, quality:number, maxSizeKB:number, maxDimensionPx:number}} data
 */
async function handle(data) {
  const { id, file, quality, maxSizeKB, maxDimensionPx } = data || {};

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    self.postMessage({ id, ok: false, code: (e && e.name === 'TypeError') ? 'unsupported' : 'decode-failed', error: msgOf(e) });
    return;
  }

  try {
    const start = fitDimensions(bitmap.width, bitmap.height, maxDimensionPx);
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    let cw = -1;
    let ch = -1;

    const best = await searchEncoding({
      width: start.width,
      height: start.height,
      quality,
      maxSizeKB,
      encode: async (w, h, q) => {
        /* الرسم عند تغيّر الأبعاد فقط (إعادة الترميز بجودة أخرى لا تعيد الرسم) */
        if (w !== cw || h !== ch) {
          canvas.width = w;
          canvas.height = h;
          fillWhite(ctx, w, h);
          ctx.drawImage(bitmap, 0, 0, w, h);
          cw = w;
          ch = h;
        }
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q });
        return { sizeKB: blob.size / 1024, payload: blob };
      },
    });

    self.postMessage({ id, ok: true, blob: best.payload, sizeKB: best.sizeKB, width: best.width, height: best.height });
  } catch (e) {
    self.postMessage({ id, ok: false, code: 'encode-failed', error: msgOf(e) });
  } finally {
    try { bitmap.close(); } catch (e) { /* نكمل */ }
  }
}

self.addEventListener('message', (ev) => { handle(ev.data); });
