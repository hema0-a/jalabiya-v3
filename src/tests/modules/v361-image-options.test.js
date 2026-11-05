/* ==========================================================================
   v361-image-options.test.js — ضغط الصور: الإعدادات تُطبَّق فعلاً عند التفعيل (v3.6.1)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { savedCompression, compressionApplies, imageCompressionOptions, QUALITY_RANGE, SIZE_RANGE_KB, DIMENSION_RANGE_PX } from '../../services/image-options.js';
import { resolvePickerCompression } from '../../ui/order-image-picker.js';
import { imageCompressionSection } from '../../pages/settings/section-image-compression.js';
import { buildResetPatch } from '../../services/settings-tools.js';

const on = (extra) => ({ imageCompression: { enabled: true, quality: 0.7, maxSizeKB: 800, maxDimensionPx: 2000, ...extra } });

register('v3.6.1 ضغط الصور: تطبيق الإعدادات', async (t) => {
  const fb = { quality: 0.82, maxSizeKB: 300, maxDimensionPx: 1200 };
  await t.test('1. الافتراضي (معطّل): النتيجة هي fallback نفسه تماماً', imageCompressionOptions('orders', {}, fb) === fb && imageCompressionOptions('orders', { imageCompression: { ...DEFAULT_SETTINGS.imageCompression } }, fb) === fb);
  await t.test('2. معطّل مع قيم محفوظة (قديمة) لا يُطبَّق', imageCompressionOptions('orders', { imageCompression: { enabled: false, quality: 0.5, maxSizeKB: 100, maxDimensionPx: 600 } }, fb) === fb);
  const o = imageCompressionOptions('orders', on(), fb);
  await t.test('3. مفعّل: تُستخدم القيم المحفوظة', o.quality === 0.7 && o.maxSizeKB === 800 && o.maxDimensionPx === 2000);
  await t.test('4. مفعّل لكل استخدام على حدة: applyOrders=false يستثني الطلبات فقط', imageCompressionOptions('orders', on({ applyOrders: false }), fb) === fb && imageCompressionOptions('portfolio', on({ applyOrders: false }), {}).maxSizeKB === 800);
  await t.test('5. applyPortfolio=false يستثني المعرض', imageCompressionOptions('portfolio', on({ applyPortfolio: false }), 'fb') === 'fb');
  await t.test('6. هدف غير معروف ⟵ fallback', imageCompressionOptions('customers', on(), fb) === fb);
  await t.test('7. قصّ المدى: قيم متطرفة تُقصّ', (() => {
    const s = savedCompression(on({ quality: 5, maxSizeKB: 99999, maxDimensionPx: 10 }));
    return s.quality === QUALITY_RANGE[1] && s.maxSizeKB === SIZE_RANGE_KB[1] && s.maxDimensionPx === DIMENSION_RANGE_PX[0];
  })());
  await t.test('8. قيم فاسدة/ناقصة ⟵ null فيعود fallback', savedCompression(on({ quality: 'x' })) === null && savedCompression({}) === null
    && imageCompressionOptions('orders', on({ maxSizeKB: 0 }), fb) === fb);
  await t.test('9. compressionApplies: enabled صريحة فقط', compressionApplies(on(), 'orders') && !compressionApplies(on({ enabled: 1 }), 'orders') && !compressionApplies(null, 'orders'));
  await t.test('10. الافتراضات في config: معطّل والتطبيق على الاثنين', DEFAULT_SETTINGS.imageCompression.enabled === false && DEFAULT_SETTINGS.imageCompression.applyOrders === true && DEFAULT_SETTINGS.imageCompression.applyPortfolio === true
    && DEFAULT_SETTINGS.imageCompression.quality === 0.85);
  await t.test('11. resolvePickerCompression لم يتغير (0.82/300/1200)', (() => { const r = resolvePickerCompression({}); return r.quality === 0.82 && r.maxSizeKB === 300 && r.maxDimensionPx === 1200; })());
  const rp = buildResetPatch('image-compression', DEFAULT_SETTINGS);
  await t.test('12. إعادة الضبط تعيد التعطيل', rp && rp.imageCompression.enabled === false);

  const saved = [];
  const body = document.createElement('div');
  await imageCompressionSection.render(body, { imageCompression: { ...DEFAULT_SETTINGS.imageCompression } }, (p) => saved.push(p));
  const sels = body.querySelectorAll('select');
  await t.test('13. ثلاث قوائم، والقسم معتّم عند التعطيل', sels.length === 3 && !!body.querySelector('[data-role="quality"]'));
  const q = body.querySelector('[data-role="quality"]');
  q.value = '0.5'; q.dispatchEvent(new Event('change'));
  const sz = body.querySelector('[data-role="maxSizeKB"]');
  sz.value = '3000'; sz.dispatchEvent(new Event('change'));
  await t.test('14. تغيير الجودة والحجم يحفظ رقماً', saved[0].imageCompression.quality === 0.5 && saved[1].imageCompression.maxSizeKB === 3000);
  const b2 = document.createElement('div');
  await imageCompressionSection.render(b2, { imageCompression: { ...DEFAULT_SETTINGS.imageCompression, maxSizeKB: 650, enabled: true } }, () => {});
  await t.test('15. قيمة قديمة غير مألوفة (650) تظهر كخيار محدَّد ولا تُفقد', b2.querySelector('[data-role="maxSizeKB"]').value === '650');
});
