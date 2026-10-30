/* ==========================================================================
   v3516-image-compress-core.test.js — منطق ضغط الصور النقي + compressToBlob (v3.5.16)
   ==========================================================================
   القسم 1 (يعمل في أي بيئة): fitDimensions · savedPercentOf · fillWhite · searchEncoding بمرمِّز مُحقَن
     (نفس منطق الحلقتين القديم: الجودة أولاً ثم الأبعاد) + رفض المدخل الأكبر من الحد.
   القسم 2 (المتصفح فقط — يحتاج Canvas حقيقياً): الصورة الشفافة تخرج بخلفية بيضاء لا سوداء،
     compressToBlob يعيد Blob بنفس أبعاد compress()، والمصغّر الشفاف بخلفية بيضاء.
   ========================================================================== */

import { register } from '../registry.js';
import {
  compress, compressToBlob, thumbFromDataUrl,
  fitDimensions, savedPercentOf, fillWhite, searchEncoding,
} from '../../services/image-compressor.js';

/** مرمِّز وهمي يسجّل استدعاءاته: الحجم = دالة (w,h,q). */
function fakeEncoder(sizeFn) {
  const calls = [];
  const encode = (w, h, q) => { calls.push({ w, h, q }); return { sizeKB: sizeFn(w, h, q), payload: calls.length }; };
  return { calls, encode };
}

const hasCanvas = typeof document !== 'undefined' && typeof Image !== 'undefined'
  && typeof FileReader !== 'undefined' && typeof File !== 'undefined';

/** لوحة شفافة بالكامل كملف PNG. */
function transparentPng(w = 300, h = 300) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return new Promise((resolve) => c.toBlob((b) => resolve(new File([b], 'clear.png', { type: 'image/png' })), 'image/png'));
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('load'));
    i.src = src;
  });
}

/** لون بكسل قرب الزاوية (r,g,b) لصورة محمّلة. */
function cornerPixel(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(2, 2, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
}

const isWhite = (p) => p.r > 240 && p.g > 240 && p.b > 240;

register('v3.5.16 image-compress core', async (t) => {
  /* ---------- fitDimensions ---------- */
  await t.test('1. fitDimensions: داخل الحد ⟵ بلا تغيير ولا تكبير', () => {
    const r = fitDimensions(800, 600, 1600);
    return r.width === 800 && r.height === 600;
  });
  await t.test('2. fitDimensions: أفقية 4000×3000 ⟵ 1600×1200', () => {
    const r = fitDimensions(4000, 3000, 1600);
    return r.width === 1600 && r.height === 1200;
  });
  await t.test('3. fitDimensions: رأسية 3000×4000 ⟵ 1200×1600', () => {
    const r = fitDimensions(3000, 4000, 1600);
    return r.width === 1200 && r.height === 1600;
  });
  await t.test('4. fitDimensions: تقريب صحيح للنسبة غير الصحيحة', () => {
    const r = fitDimensions(3999, 2999, 1600);
    return r.width === Math.round(3999 * (1600 / 3999)) && r.height === Math.round(2999 * (1600 / 3999));
  });

  /* ---------- savedPercentOf ---------- */
  await t.test('5. savedPercentOf: 1000KB ⟵ 250KB = 75٪', () => savedPercentOf(1000, 250) === 75);
  await t.test('6. savedPercentOf: أصل بلا حجم ⟵ 0 (لا قسمة على صفر)', () => savedPercentOf(0, 10) === 0);

  /* ---------- fillWhite ---------- */
  await t.test('7. fillWhite: يملأ اللوحة كلها بالأبيض', () => {
    const rec = { rects: [], fillStyle: null, fillRect(...a) { this.rects.push([a, this.fillStyle]); } };
    fillWhite(rec, 640, 480);
    return rec.rects.length === 1 && rec.rects[0][0].join() === '0,0,640,480' && rec.rects[0][1] === '#fff';
  });

  /* ---------- searchEncoding ---------- */
  await t.test('8. searchEncoding: يكفي من أول مرة ⟵ ترميز واحد وجودة كما هي', async () => {
    const { calls, encode } = fakeEncoder(() => 100);
    const r = await searchEncoding({ width: 1000, height: 800, quality: 0.85, maxSizeKB: 500, encode });
    return calls.length === 1 && calls[0].q === 0.85 && r.width === 1000 && r.height === 800 && r.sizeKB === 100;
  });
  await t.test('9. searchEncoding: تخفيض الجودة وحدها يكفي ⟵ 5 ترميزات وبلا تغيير أبعاد', async () => {
    const { calls, encode } = fakeEncoder((w, h, q) => q * 1000);
    const r = await searchEncoding({ width: 1000, height: 800, quality: 0.85, maxSizeKB: 500, encode });
    return calls.length === 5 && calls.every((c) => c.w === 1000 && c.h === 800) && r.sizeKB <= 500;
  });
  await t.test('10. searchEncoding: حجم لا يتأثر بالجودة ⟵ 5 تخفيضات ثم 4 تصغيرات (10 ترميزات) بجودة 0.5', async () => {
    const { calls, encode } = fakeEncoder(() => 900);
    const r = await searchEncoding({ width: 1600, height: 1200, quality: 0.85, maxSizeKB: 500, encode });
    return calls.length === 10 && calls[9].q === 0.5 && r.width === 655 && r.height === 491;
  });
  await t.test('11. searchEncoding: التصغير يتوقف عند 400px (500×500 ⟵ 400×400 ثم يقف)', async () => {
    const { calls, encode } = fakeEncoder(() => 900);
    const r = await searchEncoding({ width: 500, height: 500, quality: 0.85, maxSizeKB: 500, encode });
    return calls.length === 7 && r.width === 400 && r.height === 400;
  });
  await t.test('12. searchEncoding: صورة صغيرة (≤400) لا تُصغَّر أبداً حتى لو تجاوزت الحد', async () => {
    const { calls, encode } = fakeEncoder(() => 900);
    const r = await searchEncoding({ width: 400, height: 300, quality: 0.85, maxSizeKB: 500, encode });
    return calls.length === 6 && r.width === 400 && r.height === 300;
  });
  await t.test('13. searchEncoding: التصغير حتى يتحقق الحد (الحجم ∝ المساحة)', async () => {
    const { encode } = fakeEncoder((w, h) => (w * h) / 1000);
    const r = await searchEncoding({ width: 1600, height: 1200, quality: 0.85, maxSizeKB: 1000, encode });
    return r.sizeKB <= 1000 && r.width < 1600 && r.width >= 400;
  });
  await t.test('14. searchEncoding: يعيد حمولة آخر ترميز (payload) كما أنتجها المرمِّز', async () => {
    const { calls, encode } = fakeEncoder((w, h, q) => q * 1000);
    const r = await searchEncoding({ width: 1000, height: 800, quality: 0.85, maxSizeKB: 500, encode });
    return r.payload === calls.length;
  });
  await t.test('15. searchEncoding: يقبل مرمِّزاً غير متزامن (Promise) كما سيكون في Worker', async () => {
    const calls = [];
    const encode = async (w, h, q) => { calls.push(q); return { sizeKB: q * 1000, payload: 'x' }; };
    const r = await searchEncoding({ width: 1000, height: 800, quality: 0.85, maxSizeKB: 500, encode });
    return calls.length === 5 && r.sizeKB <= 500 && r.payload === 'x';
  });

  /* ---------- حد المدخل (قبل أي لمس للـDOM) ---------- */
  await t.test('16. compress يرفض ملفاً أكبر من 5MB برسالة واضحة', async () => {
    try { await compress({ size: 6 * 1024 * 1024 }); return false; }
    catch (e) { return /كبيرة جداً/.test(e.message); }
  });
  await t.test('17. compressToBlob يرفض ملفاً أكبر من 5MB برسالة واضحة', async () => {
    try { await compressToBlob({ size: 6 * 1024 * 1024 }); return false; }
    catch (e) { return /كبيرة جداً/.test(e.message); }
  });

  /* ---------- المتصفح فقط: Canvas حقيقي ---------- */
  if (!hasCanvas) { t.log('  ⏭️ اختبارات Canvas تُشغَّل في المتصفح فقط'); return; }

  await t.test('18. [متصفح] PNG شفاف ⟵ compress يخرج بخلفية بيضاء لا سوداء', async () => {
    const r = await compress(await transparentPng());
    return isWhite(cornerPixel(await loadImg(r.dataUrl)));
  });
  await t.test('19. [متصفح] compressToBlob يعيد Blob من نوع JPEG وبخلفية بيضاء', async () => {
    const r = await compressToBlob(await transparentPng());
    if (!(r.blob instanceof Blob) || r.blob.type !== 'image/jpeg' || r.blob.size <= 0) return false;
    const url = URL.createObjectURL(r.blob);
    try { return isWhite(cornerPixel(await loadImg(url))); } finally { URL.revokeObjectURL(url); }
  });
  await t.test('20. [متصفح] compress وcompressToBlob يعطيان الأبعاد نفسها (حد 600px)', async () => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 800;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#336699'; ctx.fillRect(0, 0, 1000, 800);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'photo.png', { type: 'image/png' });
    const opts = { maxDimensionPx: 600, maxSizeKB: 100000 };
    const a = await compress(file, opts);
    const b = await compressToBlob(file, opts);
    return a.width === 600 && a.height === 480 && b.width === a.width && b.height === a.height;
  });
  await t.test('21. [متصفح] المصغّر من PNG شفاف بخلفية بيضاء', async () => {
    const f = await transparentPng(200, 200);
    const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
    const thumb = await thumbFromDataUrl(dataUrl, 48);
    return thumb.startsWith('data:image/jpeg') && isWhite(cornerPixel(await loadImg(thumb)));
  });
});
