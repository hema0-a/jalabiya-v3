/* ==========================================================================
   image-compress-core.js — منطق ضغط الصور النقي (v3.5.17)
   ==========================================================================
   بلا استيراد وبلا DOM: يستوردها الخيط الرئيسي (image-compressor.js) و Web Worker (workers/image-worker.js)
   فلا يتكرر المنطق ولا يُحمَّل config.js داخل الـWorker. نُقلت حرفياً من image-compressor.js (v3.5.16)،
   والواجهة العامة لـ image-compressor.js تُعيد تصديرها بالأسماء نفسها.
   ========================================================================== */

/**
 * ملء اللوحة بالأبيض قبل رسم الصورة (JPEG لا يدعم الشفافية فتظهر سوداء بدونه).
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export function fillWhite(ctx, w, h) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
}

/**
 * الأبعاد بعد التصغير ليبقى أكبر ضلع ≤ الحد (بنفس النسبة). لا تكبير أبداً.
 * @param {number} width
 * @param {number} height
 * @param {number} maxDimensionPx
 * @returns {{width:number, height:number}}
 */
export function fitDimensions(width, height, maxDimensionPx) {
  let w = width;
  let h = height;
  if (w > maxDimensionPx || h > maxDimensionPx) {
    const ratio = Math.min(maxDimensionPx / w, maxDimensionPx / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  return { width: w, height: h };
}

/**
 * نسبة التوفير المئوية بين الحجم الأصلي والناتج.
 * @param {number} originalKB
 * @param {number} sizeKB
 * @returns {number}
 */
export function savedPercentOf(originalKB, sizeKB) {
  return originalKB > 0 ? Math.round((1 - sizeKB / originalKB) * 100) : 0;
}

/**
 * البحث عن ترميز يحقق الحد الأقصى للحجم: أولاً تخفيض الجودة (حتى 6 محاولات ولا ينزل عن ~0.4)،
 * فإن لم يكفِ (صورة معقّدة) تصغير الأبعاد ×0.8 تدريجياً (حتى 4 مرات ولا ينزل ضلع عن 400px)
 * بجودة لا تقل عن 0.5. المرمِّز يُحقَن، فالمنطق نفسه يخدم dataURL وBlob والـWorker.
 * @param {Object} p
 * @param {number} p.width — الأبعاد الابتدائية
 * @param {number} p.height
 * @param {number} p.quality — الجودة الابتدائية (0–1)
 * @param {number} p.maxSizeKB
 * @param {(w:number, h:number, q:number) => Promise<{sizeKB:number, payload:*}>|{sizeKB:number, payload:*}} p.encode
 * @returns {Promise<{payload:*, sizeKB:number, width:number, height:number}>}
 */
export async function searchEncoding({ width, height, quality, maxSizeKB, encode }) {
  let w = width;
  let h = height;
  let q = quality;
  let out = await encode(w, h, q);

  let attempts = 0;
  while (out.sizeKB > maxSizeKB && q > 0.4 && attempts < 6) {
    q -= 0.1;
    out = await encode(w, h, q);
    attempts++;
  }

  /* لم تكفِ الجودة وحدها (صورة معقّدة): نصغّر الأبعاد تدريجياً حتى يتحقق الحد */
  let shrinks = 0;
  while (out.sizeKB > maxSizeKB && shrinks < 4 && w > 400 && h > 400) {
    w = Math.round(w * 0.8);
    h = Math.round(h * 0.8);
    out = await encode(w, h, Math.max(q, 0.5));
    shrinks++;
  }

  return { payload: out.payload, sizeKB: out.sizeKB, width: w, height: h };
}
