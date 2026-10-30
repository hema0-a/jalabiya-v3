/* ==========================================================================
   image-compressor.js — ضغط الصور + Thumbnails
   ==========================================================================
   يستخدم Canvas API (لا مكتبات).
   hashImage: SHA-256 مع fallback إن لم يكن crypto.subtle متاحاً.

   v3.5.16: استخراج منطق الضغط النقي كي يُستعمل لاحقاً داخل Web Worker (3.5.17) دون تكرار:
     fitDimensions (الأبعاد بعد التصغير) · searchEncoding (حلقة الجودة ثم الأبعاد بمرمِّز مُحقَن)
     · fillWhite (خلفية بيضاء) · savedPercentOf (نسبة التوفير).
   + compressToBlob(file, options): نفس الضغط لكن يعيد Blob (بلا Base64 ولا FileReader).
   compress() بتوقيعها وشكل نتيجتها نفسهما (dataUrl). التغيير الوحيد في السلوك:
     الصور الشفافة (PNG) تُرسم على خلفية بيضاء قبل التحويل إلى JPEG بدل الأسود
     (JPEG بلا شفافية فكانت الشفافية تظهر سوداء). ينطبق على compress والمصغّرين.
   ========================================================================== */

import { DEFAULT_SETTINGS, LIMITS } from '../core/config.js';

const MAX_INPUT_SIZE_MB = LIMITS.maxImageInputMB;

/* ==========================================================================
   1. أدوات مساعدة
   ========================================================================== */
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('فشل تحميل الصورة'));
    img.src = dataUrl;
  });
}

/**
 * ملء اللوحة بالأبيض قبل رسم الصورة (JPEG لا يدعم الشفافية فتظهر سوداء بدونه).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export function fillWhite(ctx, w, h) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
}

/* ==========================================================================
   2. hash (SHA-256 + fallback)
   ========================================================================== */

/**
 * حساب hash للملف (مع fallback إن لم يكن crypto.subtle متاحاً).
 * @param {File} file
 * @returns {Promise<string>} hex
 */
export async function hashImage(file) {
  const buffer = await file.arrayBuffer();

  /* fallback: بيئة HTTP بدون crypto.subtle */
  if (!crypto.subtle) {
    let hash = 0;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i++) {
      hash = ((hash << 5) - hash + view[i]) | 0;
    }
    return 'fb_' + Math.abs(hash).toString(16);
  }

  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ==========================================================================
   3. منطق الضغط النقي (بلا DOM — قابل للاختبار وللنقل إلى Worker)
   ========================================================================== */

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

/* ==========================================================================
   4. ضغط الصورة الرئيسية (Canvas على الخيط الرئيسي)
   ========================================================================== */

/** الخيارات الفعلية: المُمرَّر ثم إعدادات التطبيق ثم القيم الافتراضية. */
function resolveOptions(options = {}) {
  const s = DEFAULT_SETTINGS.imageCompression || {};
  return {
    quality: options.quality ?? s.quality ?? 0.85,
    maxSizeKB: options.maxSizeKB ?? s.maxSizeKB ?? 500,
    maxDimensionPx: options.maxDimensionPx ?? s.maxDimensionPx ?? 1600,
  };
}

/** يرفض الملف الأكبر من الحد المسموح للمدخل. */
function assertInputSize(file) {
  if (file.size > MAX_INPUT_SIZE_MB * 1024 * 1024) {
    throw new Error('الصورة كبيرة جداً (الحد ' + MAX_INPUT_SIZE_MB + 'MB)');
  }
}

/**
 * لوحة واحدة تُعاد استعمالها: تُضبط الأبعاد وتُرسم الصورة على أبيض عند تغيّر الأبعاد فقط
 * (إعادة الترميز بجودة أخرى لا تعيد الرسم).
 * @param {HTMLImageElement} img
 * @returns {{canvas:HTMLCanvasElement, prepare:(w:number,h:number)=>void}}
 */
function createPainter(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let cw = -1;
  let ch = -1;
  const prepare = (w, h) => {
    if (w === cw && h === ch) return;
    canvas.width = w;
    canvas.height = h;
    fillWhite(ctx, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    cw = w;
    ch = h;
  };
  return { canvas, prepare };
}

/**
 * ضغط صورة مع الحفاظ على الأبعاد المقبولة.
 * @param {File} file
 * @param {Object} [options] - {quality, maxSizeKB, maxDimensionPx}
 * @returns {Promise<{dataUrl:string, sizeKB:number, width:number, height:number, savedPercent:number}>}
 */
export async function compress(file, options = {}) {
  const { quality, maxSizeKB, maxDimensionPx } = resolveOptions(options);
  assertInputSize(file);

  const originalKB = file.size / 1024;
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const start = fitDimensions(img.naturalWidth, img.naturalHeight, maxDimensionPx);
  const { canvas, prepare } = createPainter(img);

  const best = await searchEncoding({
    width: start.width,
    height: start.height,
    quality,
    maxSizeKB,
    encode: (w, h, q) => {
      prepare(w, h);
      const url = canvas.toDataURL('image/jpeg', q);
      return { sizeKB: (url.length * 3 / 4) / 1024, payload: url };
    },
  });

  return {
    dataUrl: best.payload,
    sizeKB: Math.round(best.sizeKB),
    width: best.width,
    height: best.height,
    savedPercent: savedPercentOf(originalKB, best.sizeKB),
  };
}

/**
 * نفس ضغط compress() لكن يعيد Blob (بلا Base64: لا FileReader ولا تضخّم 33% في الذاكرة).
 * مقدّمة لاستعمال Blob في المعاينة (3.5.18) ولنقل الضغط إلى Worker (3.5.17).
 * @param {File} file
 * @param {Object} [options] - {quality, maxSizeKB, maxDimensionPx}
 * @returns {Promise<{blob:Blob, sizeKB:number, width:number, height:number, savedPercent:number}>}
 */
export async function compressToBlob(file, options = {}) {
  const { quality, maxSizeKB, maxDimensionPx } = resolveOptions(options);
  assertInputSize(file);

  const originalKB = file.size / 1024;
  const url = URL.createObjectURL(file);
  let img;
  try { img = await loadImage(url); } finally { URL.revokeObjectURL(url); }

  const start = fitDimensions(img.naturalWidth, img.naturalHeight, maxDimensionPx);
  const { canvas, prepare } = createPainter(img);

  const best = await searchEncoding({
    width: start.width,
    height: start.height,
    quality,
    maxSizeKB,
    encode: (w, h, q) => {
      prepare(w, h);
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve({ sizeKB: b.size / 1024, payload: b }) : reject(new Error('تعذّر ترميز الصورة'))),
          'image/jpeg',
          q
        );
      });
    },
  });

  return {
    blob: best.payload,
    sizeKB: Math.round(best.sizeKB),
    width: best.width,
    height: best.height,
    savedPercent: savedPercentOf(originalKB, best.sizeKB),
  };
}

/* ==========================================================================
   5. Thumbnail
   ========================================================================== */

/**
 * مصغّر مربّع صغير جداً من dataURL (v3.3.87): يبقى داخل سجل الطلب (refThumb) لتُرسم قوائم الطلبات بلا قراءة الصورة الكاملة.
 * ≈ 2–4KB. فشل أي خطوة ⟵ '' (القائمة تعرض رمزاً بديلاً).
 * @param {string} dataUrl
 * @param {number} [size=96]
 * @param {number} [quality=0.6]
 * @returns {Promise<string>} dataURL أو ''
 */
export async function thumbFromDataUrl(dataUrl, size = 96, quality = 0.6) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return '';
    const img = await loadImage(dataUrl);
    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    if (!minSide) return '';
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    fillWhite(ctx, size, size);
    ctx.drawImage(img, (img.naturalWidth - minSide) / 2, (img.naturalHeight - minSide) / 2, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } catch (e) { return ''; }
}

/**
 * توليد thumbnail مربّع.
 * @param {File} file
 * @param {number} [size=200]
 * @returns {Promise<string>} data URL
 */
export async function generateThumbnail(file, size = LIMITS.imageThumbnailSize) {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const minSide = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - minSide) / 2;
  const sy = (img.naturalHeight - minSide) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  fillWhite(ctx, size, size);
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.7);
}
