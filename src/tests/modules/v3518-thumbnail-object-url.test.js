/* ==========================================================================
   v3518-thumbnail-object-url.test.js — generateThumbnail برابط كائن (v3.5.18)
   ==========================================================================
   الغرض: لا نحوّل الصورة الأصلية (حتى 5MB) إلى نص Base64 لصنع مصغّر 200px (شاشة إضافة صورة للمعرض).
   القسم 1 (Node فقط، بـDOM وهمي يُثبَّت مؤقتاً ويُزال): حساب القص المربّع والمنتصف · الخلفية البيضاء قبل الرسم ·
     لا FileReader · رابط الكائن يُنشأ ويُلغى مرة واحدة حتى عند فشل فك الصورة · الحجم الافتراضي.
   القسم 2 (المتصفح فقط، Canvas حقيقي): أبعاد المصغّر · خلفية بيضاء للشفاف · لا readAsDataURL · رفض الملف غير الصورة.
   ========================================================================== */

import { register } from '../registry.js';
import { LIMITS } from '../../core/config.js';
import { generateThumbnail } from '../../services/image-compressor.js';

const hasRealDom = typeof document !== 'undefined' && typeof Image !== 'undefined'
  && typeof FileReader !== 'undefined' && typeof File !== 'undefined';

/**
 * DOM وهمي مؤقت لـNode: يسجّل رسم اللوحة وإنشاء/إلغاء روابط الكائن واستدعاءات FileReader.
 * @param {Record<string,{w:number,h:number}>} meta — أبعاد كل ملف وهمي بمعرّفه
 */
function installFakeDom(meta) {
  const saved = {
    document: globalThis.document, FileReader: globalThis.FileReader, Image: globalThis.Image,
    create: URL.createObjectURL, revoke: URL.revokeObjectURL,
  };
  const rec = { canvas: [], created: [], revoked: [], readerCalls: 0 };
  globalThis.document = {
    createElement: () => {
      const c = {
        width: 300, height: 150,
        getContext: () => ({
          set fillStyle(v) { rec.canvas.push('fillStyle:' + v); },
          fillRect: (...a) => rec.canvas.push('fillRect:' + a.join(',')),
          drawImage: (_img, ...a) => rec.canvas.push('drawImage:' + a.join(',')),
        }),
        toDataURL: (type, q) => { rec.canvas.push('toDataURL:' + type + ':' + q + ':' + c.width + 'x' + c.height); return 'data:image/jpeg;base64,THUMB'; },
      };
      return c;
    },
  };
  globalThis.FileReader = class { readAsDataURL() { rec.readerCalls++; setTimeout(() => this.onerror && this.onerror(), 0); } };
  globalThis.Image = class {
    set src(v) {
      setTimeout(() => {
        const m = meta[v];
        if (!m) { this.onerror && this.onerror(); return; }
        this.naturalWidth = m.w; this.naturalHeight = m.h;
        this.onload && this.onload();
      }, 0);
    }
  };
  URL.createObjectURL = (f) => { rec.created.push(f.id); return f.id; };
  URL.revokeObjectURL = (u) => { rec.revoked.push(u); };
  return {
    rec,
    restore() {
      globalThis.document = saved.document; globalThis.FileReader = saved.FileReader; globalThis.Image = saved.Image;
      URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke;
    },
  };
}

/** لوحة شفافة بالكامل كملف PNG (المتصفح). */
function transparentPng(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return new Promise((resolve) => c.toBlob((b) => resolve(new File([b], 'clear.png', { type: 'image/png' })), 'image/png'));
}
function loadImg(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('load')); i.src = src; });
}

register('v3.5.18 generateThumbnail object URL', async (t) => {
  if (!hasRealDom) {
    /* ---------- القسم 1: Node بـDOM وهمي ---------- */
    await t.test('1. أفقية 400×200 بحجم 100 ⟵ قص مربّع من المنتصف (100,0,200,200 ← 0,0,100,100) ولوحة 100×100', async () => {
      const dom = installFakeDom({ a: { w: 400, h: 200 } });
      try {
        const out = await generateThumbnail({ id: 'a' }, 100);
        return out.startsWith('data:image/jpeg') && dom.rec.canvas.includes('drawImage:100,0,200,200,0,0,100,100')
          && dom.rec.canvas.includes('toDataURL:image/jpeg:0.7:100x100');
      } finally { dom.restore(); }
    });

    await t.test('2. رأسية 200×400 ⟵ قص من المنتصف رأسياً (0,100,200,200)', async () => {
      const dom = installFakeDom({ p: { w: 200, h: 400 } });
      try {
        await generateThumbnail({ id: 'p' }, 100);
        return dom.rec.canvas.includes('drawImage:0,100,200,200,0,0,100,100');
      } finally { dom.restore(); }
    });

    await t.test('3. الخلفية البيضاء تُرسم قبل الصورة (الشفاف لا يخرج أسود)', async () => {
      const dom = installFakeDom({ a: { w: 300, h: 300 } });
      try {
        await generateThumbnail({ id: 'a' }, 50);
        const iFill = dom.rec.canvas.indexOf('fillRect:0,0,50,50');
        const iDraw = dom.rec.canvas.findIndex((x) => x.startsWith('drawImage:'));
        return dom.rec.canvas[0] === 'fillStyle:#fff' && iFill > 0 && iDraw > iFill;
      } finally { dom.restore(); }
    });

    await t.test('4. لا FileReader إطلاقاً (لا Base64 للأصل) ورابط الكائن يُنشأ ويُلغى مرة واحدة', async () => {
      const dom = installFakeDom({ a: { w: 300, h: 300 } });
      try {
        await generateThumbnail({ id: 'a' }, 50);
        return dom.rec.readerCalls === 0 && dom.rec.created.length === 1 && dom.rec.revoked.length === 1 && dom.rec.revoked[0] === dom.rec.created[0];
      } finally { dom.restore(); }
    });

    await t.test('5. ملف لا يُفك كصورة ⟵ رفض بالرسالة نفسها، والرابط يُلغى رغم الفشل', async () => {
      const dom = installFakeDom({});
      try {
        let msg = '';
        try { await generateThumbnail({ id: 'bad' }, 50); } catch (e) { msg = e.message; }
        return msg === 'فشل تحميل الصورة' && dom.rec.created.length === 1 && dom.rec.revoked.length === 1 && dom.rec.readerCalls === 0;
      } finally { dom.restore(); }
    });

    await t.test('6. الحجم الافتراضي = LIMITS.imageThumbnailSize', async () => {
      const dom = installFakeDom({ a: { w: 800, h: 600 } });
      try {
        await generateThumbnail({ id: 'a' });
        const s = LIMITS.imageThumbnailSize;
        return dom.rec.canvas.includes('toDataURL:image/jpeg:0.7:' + s + 'x' + s);
      } finally { dom.restore(); }
    });
    return;
  }

  /* ---------- القسم 2: المتصفح (Canvas حقيقي) ---------- */
  await t.test('7. [متصفح] المصغّر مربّع بالحجم المطلوب JPEG', async () => {
    const out = await generateThumbnail(await transparentPng(500, 300), 64);
    const img = await loadImg(out);
    return out.startsWith('data:image/jpeg') && img.naturalWidth === 64 && img.naturalHeight === 64;
  });

  await t.test('8. [متصفح] PNG شفاف ⟵ مصغّر بخلفية بيضاء', async () => {
    const out = await generateThumbnail(await transparentPng(300, 300), 48);
    const img = await loadImg(out);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(2, 2, 1, 1).data;
    return d[0] > 240 && d[1] > 240 && d[2] > 240;
  });

  await t.test('9. [متصفح] لا يستدعي FileReader.readAsDataURL على الأصل', async () => {
    const proto = FileReader.prototype;
    const orig = proto.readAsDataURL;
    let calls = 0;
    proto.readAsDataURL = function (...a) { calls++; return orig.apply(this, a); };
    try {
      await generateThumbnail(await transparentPng(300, 300), 48);
      return calls === 0;
    } finally { proto.readAsDataURL = orig; }
  });

  await t.test('10. [متصفح] ملف ليس صورة ⟵ رفض ولا استثناء غير ملتقط', async () => {
    try { await generateThumbnail(new File(['not an image'], 'x.png', { type: 'image/png' }), 48); return false; }
    catch (e) { return /فشل تحميل الصورة/.test(e.message); }
  });
});
