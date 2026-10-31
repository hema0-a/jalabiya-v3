/* ==========================================================================
   v3519-mobile-images.test.js — تحسينات صور الجوال (v3.5.19)
   ==========================================================================
   1) resolvePickerCompression: الافتراضي كما قبل (0.82 · 300KB · 1200px) والمُمرَّر يتقدّم.
   2) صورة العميل تُضغط 800px/150KB بينما صورة الطلب تبقى بالافتراضي (فحص مصدر).
   3) مصغّرات القوائم (بطاقات الطلب والعملاء وكتالوج الأسعار وشبكة المعرض في الإعدادات) بـ decoding="async".
   فحوص المصدر تُجلب بـfetch كغيرها من حراس المشروع؛ وإن تعذّر الجلب (بيئة بلا خادم) تُتخطّى بتنبيه.
   ========================================================================== */

import { register } from '../registry.js';
import { resolvePickerCompression } from '../../ui/order-image-picker.js';

/** يجلب مصدر ملف أو يعيد null إن تعذّر (بيئة بلا خادم). */
async function source(path) {
  try {
    const r = await fetch('./' + path);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

/** يزيل التعليقات لفحص الكود الفعلي فقط. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const count = (src, needle) => src.split(needle).length - 1;

register('v3.5.19 mobile images', async (t) => {
  /* ---------- resolvePickerCompression ---------- */
  await t.test('1. الافتراضي كما قبل 3.5.19: جودة 0.82 · 300KB · 1200px', () => {
    const r = resolvePickerCompression();
    return r.quality === 0.82 && r.maxSizeKB === 300 && r.maxDimensionPx === 1200;
  });

  await t.test('2. المُمرَّر يتقدّم على الافتراضي (800px / 150KB)', () => {
    const r = resolvePickerCompression({ maxDimensionPx: 800, maxSizeKB: 150 });
    return r.maxDimensionPx === 800 && r.maxSizeKB === 150 && r.quality === 0.82;
  });

  await t.test('3. تمرير جزئي لا يمسّ بقية الحقول، وundefined يُعامل كغير ممرَّر', () => {
    const a = resolvePickerCompression({ quality: 0.7 });
    const b = resolvePickerCompression({ maxSizeKB: undefined, maxDimensionPx: undefined });
    return a.quality === 0.7 && a.maxSizeKB === 300 && a.maxDimensionPx === 1200
      && b.maxSizeKB === 300 && b.maxDimensionPx === 1200;
  });

  /* ---------- فحوص المصدر ---------- */
  const picker = await source('src/ui/order-image-picker.js');
  if (picker === null) { t.log('  ⏭️ فحوص المصدر تتطلب خادماً (fetch)'); return; }

  await t.test('4. المنتقي يضغط عبر resolvePickerCompression(options) ولا قيم صلبة 1200/300 داخل المعالج', () => {
    const code = stripComments(picker);
    return /compress\(file,\s*resolvePickerCompression\(options\)\)/.test(code)
      && !/maxDimensionPx:\s*1200,\s*\n\s*\}\)/.test(code);
  });

  await t.test('5. نموذج العميل يمرّر 800px و150KB لمنتقي الصورة', async () => {
    const code = stripComments(await source('src/pages/customers-form.js'));
    const call = code.slice(code.indexOf('createOrderImagePicker({'));
    const block = call.slice(0, call.indexOf('});') + 3);
    return /maxDimensionPx:\s*800/.test(block) && /maxSizeKB:\s*150/.test(block);
  });

  await t.test('6. نموذج الطلب لا يمرّر حدوداً (الصورة المرجعية تبقى 1200px/300KB)', async () => {
    const code = stripComments(await source('src/pages/orders/form-inputs.js'));
    const call = code.slice(code.indexOf('createOrderImagePicker({'));
    const block = call.slice(0, call.indexOf('});') + 3);
    return block.length > 30 && !/maxDimensionPx|maxSizeKB|quality/.test(block);
  });

  const SITES = [
    ['src/pages/orders/cards.js', 2, 'بطاقة الطلب + البطاقة المصغّرة'],
    ['src/pages/customers-cards.js', 1, 'أفاتار العميل'],
    ['src/ui/quick-preview-catalog.js', 1, 'مصغّرات كتالوج الأسعار'],
    ['src/pages/settings/sections-data.js', 1, 'شبكة اختيار صورة المعرض'],
  ];
  let n = 7;
  for (const [path, expected, label] of SITES) {
    const code = stripComments(await source(path) || '');
    await t.test(n++ + '. ' + label + ': ' + expected + ' صورة بـ decoding="async"', () => count(code, "decoding: 'async'") === expected);
  }

  await t.test('11. لا loading="lazy" على صور data: في القوائم (Chrome لا يؤجّلها؛ المفيد decoding فقط)', async () => {
    const files = SITES.map((s) => s[0]).concat(['src/ui/order-image-picker.js']);
    for (const f of files) {
      const code = stripComments(await source(f) || '');
      if (/loading:\s*'lazy'/.test(code)) return false;
    }
    return true;
  });
});
