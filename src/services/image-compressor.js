/* ==========================================================================
   image-compressor.js — ضغط الصور + Thumbnails
   ==========================================================================
   يستخدم Canvas API (لا مكتبات).
   - compress(file, options): يضغط صورة.
   - generateThumbnail(file, size): thumbnail مربّع.
   - hashImage(file): SHA-256 للملف (منع التكرار).
   ========================================================================== */

import { DEFAULT_SETTINGS, LIMITS } from '../core/config.js';

const MAX_INPUT_SIZE_MB = LIMITS.maxImageInputMB;

/* ==========================================================================
   1. أدوات
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

/* ==========================================================================
   2. hash
   ========================================================================== */

/**
 * حساب hash SHA-256 للملف.
 * @param {File} file
 * @returns {Promise<string>} hex
 */
export async function hashImage(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ==========================================================================
   3. ضغط
   ========================================================================== */

/**
 * ضغط صورة مع الحفاظ على الأبعاد.
 * @param {File} file
 * @param {Object} [options]
 * @returns {Promise<{dataUrl:string, sizeKB:number, width:number, height:number, savedPercent:number}>}
 */
export async function compress(file, options = {}) {
  const s = DEFAULT_SETTINGS.imageCompression || {};
  const quality = options.quality ?? s.quality ?? 0.85;
  const maxSizeKB = options.maxSizeKB ?? s.maxSizeKB ?? 500;
  const maxDimensionPx = options.maxDimensionPx ?? s.maxDimensionPx ?? 1600;

  if (file.size > MAX_INPUT_SIZE_MB * 1024 * 1024) {
    throw new Error('الصورة كبيرة جداً (الحد ' + MAX_INPUT_SIZE_MB + 'MB)');
  }

  const originalKB = file.size / 1024;
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > maxDimensionPx || h > maxDimensionPx) {
    const ratio = Math.min(maxDimensionPx / w, maxDimensionPx / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  let q = quality;
  let compressed = canvas.toDataURL('image/jpeg', q);
  let sizeKB = (compressed.length * 3 / 4) / 1024;

  let attempts = 0;
  while (sizeKB > maxSizeKB && q > 0.4 && attempts < 6) {
    q -= 0.1;
    compressed = canvas.toDataURL('image/jpeg', q);
    sizeKB = (compressed.length * 3 / 4) / 1024;
    attempts++;
  }

  const savedPercent = originalKB > 0
    ? Math.round((1 - sizeKB / originalKB) * 100)
    : 0;

  return {
    dataUrl: compressed,
    sizeKB: Math.round(sizeKB),
    width: w,
    height: h,
    savedPercent,
  };
}

/* ==========================================================================
   4. thumbnail
   ========================================================================== */

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
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.7);
}
