/* ==========================================================================
   v3521c-exif-orientation.test.js — اتجاه EXIF في ضغط الصور (v3.5.21) — للمتصفح فقط
   ==========================================================================
   صور الكاميرا الرأسية على أندرويد تحمل علامة EXIF. الخطر: أن يقلب مسار الـWorker (createImageBitmap) أو المسار
   الرئيسي (Image + Canvas) الصورة بخلاف ما يعرضه المتصفح. يولّد الاختبار JPEG حقيقياً داخل المتصفح (أرباع ملوّنة
   R,G / B,Y) ويحقن في رأسه مقطع EXIF بالاتجاه 1..8، ثم يتحقق لكل اتجاه من:
     أبعاد الناتج ومواضع الألوان الأربعة = ما يعرضه <img> الأصلي = القيمة المرجعية من مواصفة EXIF
   في ثلاثة مسارات: الـWorker · المسار الرئيسي · المصغّر.
   ========================================================================== */

import { register } from '../registry.js';
import { compress, generateThumbnail } from '../../services/image-compressor.js';
import { isImageWorkerSupported } from '../../services/image-worker-client.js';

/** المخزَّن 48×24: R أعلى-يسار · G أعلى-يمين · B أسفل-يسار · Y أسفل-يمين. المتوقَّع (أبعاد + TL TR BL BR) لكل اتجاه: */
const EXPECTED = {
  1: '48x24 RGBY', 2: '48x24 GRYB', 3: '48x24 YBGR', 4: '48x24 BYRG',
  5: '24x48 RBGY', 6: '24x48 BRYG', 7: '24x48 YGBR', 8: '24x48 GYRB',
};

const hasDom = typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof File !== 'undefined';

/** JPEG من أرباع ملوّنة (مخزَّنة 48×24). */
async function quadrantJpegBytes() {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 24;
  const x = c.getContext('2d');
  const fill = (color, px, py) => { x.fillStyle = color; x.fillRect(px, py, 24, 12); };
  fill('#ff0000', 0, 0); fill('#00ff00', 24, 0); fill('#0000ff', 0, 12); fill('#ffff00', 24, 12);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 1));
  return new Uint8Array(await blob.arrayBuffer());
}

/** يحقن مقطع EXIF APP1 (علامة Orientation فقط) بعد SOI مباشرة. */
function withExifOrientation(jpeg, o) {
  const app1 = new Uint8Array([
    0xFF, 0xE1, 0x00, 0x22,                               // APP1 · الطول 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                   // "Exif\0\0"
    0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,      // TIFF: big-endian · IFD0 عند 8
    0x00, 0x01,                                           // إدخال واحد
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00,   // Orientation = o (SHORT)
    0x00, 0x00, 0x00, 0x00,                               // لا IFD تالٍ
  ]);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

/** «الأبعاد + ألوان TL TR BL BR» لصورة مصدرها src (رابط أو data URL). */
async function quads(src) {
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const name = (d) => {
    const [r, g, b] = d;
    if (r > 200 && g < 70 && b < 70) return 'R';
    if (g > 200 && r < 70 && b < 70) return 'G';
    if (b > 200 && r < 70 && g < 70) return 'B';
    if (r > 200 && g > 200 && b < 100) return 'Y';
    return '?';
  };
  const at = (fx, fy) => name(x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data);
  return c.width + 'x' + c.height + ' ' + at(0.25, 0.25) + at(0.75, 0.25) + at(0.25, 0.75) + at(0.75, 0.75);
}

register('v3.5.21 EXIF orientation', async (t) => {
  if (!hasDom) { t.log('  ⏭️ اختبارات اتجاه EXIF تُشغَّل في المتصفح فقط'); return; }

  const base = await quadrantJpegBytes();
  const fileFor = (o) => new File([withExifOrientation(base, o)], 'cam-' + o + '.jpg', { type: 'image/jpeg' });

  /* سلامة الاختبار نفسه: المتصفح يطبّق EXIF على <img> كما نتوقع، وإلا لا معنى لمقارنة المسارات به */
  const nativeResults = {};
  for (let o = 1; o <= 8; o++) {
    const url = URL.createObjectURL(fileFor(o));
    try { nativeResults[o] = await quads(url); } finally { URL.revokeObjectURL(url); }
  }
  const browserHonorsExif = Object.keys(EXPECTED).every((o) => nativeResults[o] === EXPECTED[o]);

  await t.test('1. المتصفح يطبّق EXIF على <img> كما في المواصفة (أساس المقارنة)', () => browserHonorsExif);

  for (let o = 1; o <= 8; o++) {
    await t.test((o + 1) + '. اتجاه EXIF=' + o + ': الـWorker والمسار الرئيسي والمصغّر = ' + EXPECTED[o], async () => {
      const file = fileFor(o);
      const opts = { quality: 0.95, maxSizeKB: 100000 };
      const worker = await quads((await compress(file, { ...opts, useWorker: true })).dataUrl);
      const main = await quads((await compress(file, { ...opts, useWorker: false })).dataUrl);
      /* المصغّر مربّع (قص من المنتصف): نقارن بالألوان لا بالأبعاد */
      const thumb = (await quads(await generateThumbnail(file, 48))).split(' ')[1];
      const expectedColors = EXPECTED[o].split(' ')[1];
      const workerMatters = isImageWorkerSupported();
      return main === EXPECTED[o] && (!workerMatters || worker === EXPECTED[o]) && worker.split(' ')[1] === expectedColors
        && thumb === expectedColors;
    });
  }
});
