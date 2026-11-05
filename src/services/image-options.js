/* ==========================================================================
   image-options.js — خيارات ضغط الصور من الإعدادات (v3.6.1)
   ==========================================================================
   دوال نقية بلا DOM/IndexedDB. كانت إعدادات «ضغط الصور» تُحفظ ولا يقرؤها أي كود؛
   الآن تُطبَّق عند التفعيل (imageCompression.enabled) على صور الطلبات والمعرض.
   معطّلة افتراضياً: الصور كما كانت تماماً.
   ========================================================================== */

export const QUALITY_RANGE = [0.4, 0.95];
export const SIZE_RANGE_KB = [50, 3000];
export const DIMENSION_RANGE_PX = [400, 4000];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** خيارات الضغط المحفوظة بقيم آمنة (قصّ المدى)، أو null إن كانت ناقصة/فاسدة. */
export function savedCompression(settings) {
  const ic = (settings && settings.imageCompression) || {};
  const q = Number(ic.quality), s = Number(ic.maxSizeKB), d = Number(ic.maxDimensionPx);
  if (!(isFinite(q) && q > 0) || !(isFinite(s) && s > 0) || !(isFinite(d) && d > 0)) return null;
  return {
    quality: Math.round(clamp(q, QUALITY_RANGE[0], QUALITY_RANGE[1]) * 100) / 100,
    maxSizeKB: Math.round(clamp(s, SIZE_RANGE_KB[0], SIZE_RANGE_KB[1])),
    maxDimensionPx: Math.round(clamp(d, DIMENSION_RANGE_PX[0], DIMENSION_RANGE_PX[1])),
  };
}

/**
 * هل تُطبَّق إعدادات الضغط المخصّصة على هذا الاستخدام؟
 * @param {'orders'|'portfolio'} target
 */
export function compressionApplies(settings, target) {
  const ic = (settings && settings.imageCompression) || {};
  if (ic.enabled !== true) return false;
  if (target === 'orders') return ic.applyOrders !== false;
  if (target === 'portfolio') return ic.applyPortfolio !== false;
  return false;
}

/** الخيارات الفعلية: المحفوظة إن فُعِّلت وانطبقت، وإلا fallback كما هو. */
export function imageCompressionOptions(target, settings, fallback) {
  if (!compressionApplies(settings, target)) return fallback;
  return savedCompression(settings) || fallback;
}
