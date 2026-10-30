/* ==========================================================================
   v3517-image-worker.test.js — ضغط الصور في Web Worker (v3.5.17)
   ==========================================================================
   القسم 1 (أي بيئة): عميل الـWorker بـWorker وهمي — ربط الرد بالمهمة (id) · الأخطاء · المهلة · إنهاء الخمول ·
     إعادة الاستعمال · مفتاح الإيقاف · وأن الدوال النقية المُعاد تصديرها هي نفسها دوال النواة.
   القسم 2 (المتصفح فقط): عقد ملف الـWorker · الـWorker الحقيقي يعطي أبعاد المسار الرئيسي نفسها ·
     الشفاف أبيض في المسارين · التراجع التلقائي عند فشل/تعطّل الـWorker · useWorker:false.
   ========================================================================== */

import { register } from '../registry.js';
import * as core from '../../services/image-compress-core.js';
import * as comp from '../../services/image-compressor.js';
import {
  compressInWorker, isImageWorkerSupported, IMAGE_WORKER_ENABLED,
  _setWorkerFactoryForTest, _setTimingForTest, _setEnabledForTest, _stateForTest, _resetForTest,
} from '../../services/image-worker-client.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PARAMS = { quality: 0.8, maxSizeKB: 300, maxDimensionPx: 1200 };

/** Worker وهمي: يسجّل الرسائل ويتيح الرد يدوياً. onPost(inst, data) اختياري للرد التلقائي. */
function fakeWorkers(onPost) {
  const instances = [];
  const factory = () => {
    const inst = {
      onmessage: null, onerror: null, onmessageerror: null, terminated: false, posted: [],
      postMessage(d) { inst.posted.push(d); if (onPost) onPost(inst, d); },
      terminate() { inst.terminated = true; },
      reply(d) { inst.onmessage && inst.onmessage({ data: d }); },
    };
    instances.push(inst);
    return inst;
  };
  return { instances, factory };
}

const okReply = (d, extra = {}) => ({ id: d.id, ok: true, blob: { size: 1234, tag: 'blob' }, sizeKB: 1.2, width: 640, height: 480, ...extra });

/** يشغّل اختباراً ثم يعيد حالة العميل لأصلها مهما كانت النتيجة. */
async function withClean(fn) {
  try { return await fn(); } finally { _resetForTest(); }
}

const hasCanvas = typeof document !== 'undefined' && typeof Image !== 'undefined'
  && typeof FileReader !== 'undefined' && typeof File !== 'undefined';

function transparentPng(w = 300, h = 300) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return new Promise((resolve) => c.toBlob((b) => resolve(new File([b], 'clear.png', { type: 'image/png' })), 'image/png'));
}
function loadImg(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('load')); i.src = src; });
}
function cornerWhite(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(2, 2, 1, 1).data;
  return d[0] > 240 && d[1] > 240 && d[2] > 240;
}
async function solidPng(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#336699'; ctx.fillRect(0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new File([blob], 'photo.png', { type: 'image/png' });
}

register('v3.5.17 image worker', async (t) => {
  /* ---------- الدعم ومفتاح الإيقاف ---------- */
  await t.test('1. المفتاح الرئيسي IMAGE_WORKER_ENABLED مفعّل افتراضياً', IMAGE_WORKER_ENABLED === true);

  await t.test('2. isImageWorkerSupported يطابق قدرات المتصفح الفعلية', () => {
    const flagged = typeof location !== 'undefined' && /[?&]noimgworker=1/.test(location.search || '');
    const caps = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function'
      && !!(typeof OffscreenCanvas === 'function' && OffscreenCanvas.prototype && typeof OffscreenCanvas.prototype.convertToBlob === 'function');
    return isImageWorkerSupported() === (caps && !flagged);
  });

  await t.test('3. مفتاح الإيقاف: التعطيل ⟵ غير مدعوم دائماً، والعودة للأصل تعيد السلوك', () => withClean(() => {
    const before = isImageWorkerSupported();
    _setEnabledForTest(false);
    const off = isImageWorkerSupported();
    _setEnabledForTest(null);
    return off === false && isImageWorkerSupported() === before;
  }));

  await t.test('4. الدوال النقية المُعاد تصديرها من image-compressor هي نفسها دوال النواة', () =>
    comp.fitDimensions === core.fitDimensions && comp.savedPercentOf === core.savedPercentOf
    && comp.fillWhite === core.fillWhite && comp.searchEncoding === core.searchEncoding);

  /* ---------- عميل الـWorker ---------- */
  await t.test('5. نجاح: تُرسل id والملف والخيارات، وتُحلّ النتيجة بحقولها', () => withClean(async () => {
    const { instances, factory } = fakeWorkers((inst, d) => setTimeout(() => inst.reply(okReply(d)), 0));
    _setWorkerFactoryForTest(factory);
    const file = { size: 100, tag: 'file' };
    const r = await compressInWorker(file, PARAMS);
    const sent = instances[0].posted[0];
    return r.blob.tag === 'blob' && r.sizeKB === 1.2 && r.width === 640 && r.height === 480
      && sent.file === file && sent.quality === 0.8 && sent.maxSizeKB === 300 && sent.maxDimensionPx === 1200 && typeof sent.id === 'number';
  }));

  await t.test('6. ردّ ok:false ⟵ رفض بـ code الـWorker (unsupported مثلاً)', () => withClean(async () => {
    const { factory } = fakeWorkers((inst, d) => setTimeout(() => inst.reply({ id: d.id, ok: false, code: 'unsupported', error: 'x' }), 0));
    _setWorkerFactoryForTest(factory);
    try { await compressInWorker({}, PARAMS); return false; } catch (e) { return e.code === 'unsupported'; }
  }));

  await t.test('7. مهمتان متزامنتان وردّ معكوس الترتيب ⟵ كل مهمة تأخذ نتيجتها (ربط بالـid)', () => withClean(async () => {
    const { instances, factory } = fakeWorkers();
    _setWorkerFactoryForTest(factory);
    const p1 = compressInWorker({ n: 1 }, PARAMS);
    const p2 = compressInWorker({ n: 2 }, PARAMS);
    const [m1, m2] = instances[0].posted;
    instances[0].reply(okReply(m2, { width: 222 }));
    instances[0].reply(okReply(m1, { width: 111 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    return instances.length === 1 && r1.width === 111 && r2.width === 222 && m1.id !== m2.id;
  }));

  await t.test('8. مهمات متتالية تعيد استعمال Worker واحد', () => withClean(async () => {
    const { instances, factory } = fakeWorkers((inst, d) => setTimeout(() => inst.reply(okReply(d)), 0));
    _setWorkerFactoryForTest(factory);
    await compressInWorker({}, PARAMS);
    await compressInWorker({}, PARAMS);
    return instances.length === 1 && instances[0].posted.length === 2;
  }));

  await t.test('9. المهلة: لا ردّ ⟵ رفض worker-timeout وإنهاء الـWorker', () => withClean(async () => {
    const { instances, factory } = fakeWorkers();
    _setWorkerFactoryForTest(factory);
    _setTimingForTest({ job: 30, idle: 1000 });
    try { await compressInWorker({}, PARAMS); return false; }
    catch (e) { return e.code === 'worker-timeout' && instances[0].terminated && !_stateForTest().hasWorker && _stateForTest().pending === 0; }
  }));

  await t.test('10. خطأ الـWorker (onerror) ⟵ رفض المعلّق وإنهاؤه، والمهمة التالية تنشئ Worker جديداً', () => withClean(async () => {
    const { instances, factory } = fakeWorkers((inst) => setTimeout(() => inst.onerror && inst.onerror({ message: 'script failed' }), 0));
    _setWorkerFactoryForTest(factory);
    let code1 = '';
    try { await compressInWorker({}, PARAMS); } catch (e) { code1 = e.code; }
    const first = instances[0];
    let code2 = '';
    try { await compressInWorker({}, PARAMS); } catch (e) { code2 = e.code; }
    return code1 === 'worker-error' && first.terminated && instances.length === 2 && code2 === 'worker-error';
  }));

  await t.test('11. فشل إنشاء الـWorker ⟵ رفض worker-start بلا استثناء غير ملتقط', () => withClean(async () => {
    _setWorkerFactoryForTest(() => { throw new Error('boom'); });
    try { await compressInWorker({}, PARAMS); return false; } catch (e) { return e.code === 'worker-start' && _stateForTest().pending === 0; }
  }));

  await t.test('12. فشل postMessage ⟵ رفض worker-post ولا مهمة معلّقة', () => withClean(async () => {
    const { factory } = fakeWorkers(() => { throw new Error('DataCloneError'); });
    _setWorkerFactoryForTest(factory);
    try { await compressInWorker({}, PARAMS); return false; } catch (e) { return e.code === 'worker-post' && _stateForTest().pending === 0; }
  }));

  await t.test('13. الخمول: بعد انتهاء المهمة يُنهى الـWorker تلقائياً', () => withClean(async () => {
    const { instances, factory } = fakeWorkers((inst, d) => setTimeout(() => inst.reply(okReply(d)), 0));
    _setWorkerFactoryForTest(factory);
    _setTimingForTest({ job: 1000, idle: 30 });
    await compressInWorker({}, PARAMS);
    const armed = _stateForTest().idleArmed;
    await sleep(90);
    return armed && instances[0].terminated && !_stateForTest().hasWorker;
  }));

  await t.test('14. مهمة جديدة تُلغي مؤقّت الخمول فوراً (لا يُنهى Worker أثناء العمل)', () => withClean(async () => {
    const { instances, factory } = fakeWorkers();
    _setWorkerFactoryForTest(factory);
    _setTimingForTest({ job: 1000, idle: 20 });
    const p1 = compressInWorker({}, PARAMS);
    instances[0].reply(okReply(instances[0].posted[0]));
    await p1;
    const armedAfterFirst = _stateForTest().idleArmed;
    const p2 = compressInWorker({}, PARAMS);
    const armedWhileBusy = _stateForTest().idleArmed;
    await sleep(60);
    const stillAlive = !instances[0].terminated;
    instances[0].reply(okReply(instances[0].posted[1]));
    await p2;
    return armedAfterFirst === true && armedWhileBusy === false && stillAlive;
  }));

  await t.test('15. رد متأخر أو بـid مجهول يُتجاهل بلا أثر', () => withClean(async () => {
    const { instances, factory } = fakeWorkers();
    _setWorkerFactoryForTest(factory);
    const p = compressInWorker({}, PARAMS);
    instances[0].reply({ id: 99999, ok: true, blob: {}, sizeKB: 1, width: 1, height: 1 });
    const stillPending = _stateForTest().pending === 1;
    instances[0].reply(okReply(instances[0].posted[0]));
    await p;
    return stillPending && _stateForTest().pending === 0;
  }));

  /* ---------- المتصفح فقط ---------- */
  if (!hasCanvas) { t.log('  ⏭️ اختبارات المتصفح (الـWorker الحقيقي) تُشغَّل في المتصفح فقط'); return; }

  await t.test('16. [متصفح] عقد ملف الـWorker: يستورد النواة وحدها، بلا DOM ولا import() ولا innerHTML', async () => {
    const code = (await (await fetch('./src/workers/image-worker.js')).text())
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const imports = [...code.matchAll(/import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    return imports.length === 1 && imports[0] === '../services/image-compress-core.js'
      && !/\b(document|window|localStorage)\b/.test(code) && !/\bimport\s*\(/.test(code) && !/innerHTML/.test(code)
      && /imageOrientation:\s*'from-image'/.test(code);
  });

  await t.test('17. [متصفح] الـWorker الحقيقي يعطي أبعاد المسار الرئيسي نفسها (حد 600px) ونوع JPEG', () => withClean(async () => {
    const file = await solidPng(1000, 800);
    const opts = { maxDimensionPx: 600, maxSizeKB: 100000 };
    const viaMain = await comp.compressToBlob(file, { ...opts, useWorker: false });
    const viaWorker = await comp.compressToBlob(file, opts);
    return viaMain.width === 600 && viaMain.height === 480
      && viaWorker.width === viaMain.width && viaWorker.height === viaMain.height
      && viaWorker.blob instanceof Blob && viaWorker.blob.type === 'image/jpeg' && viaWorker.blob.size > 0;
  }));

  await t.test('18. [متصفح] PNG شفاف ⟵ خلفية بيضاء في مسار الـWorker وفي المسار الرئيسي', () => withClean(async () => {
    const file = await transparentPng();
    const a = await comp.compress(file);
    const b = await comp.compress(file, { useWorker: false });
    return cornerWhite(await loadImg(a.dataUrl)) && cornerWhite(await loadImg(b.dataUrl));
  }));

  await t.test('19. [متصفح] فشل الـWorker ⟵ compress ينجح تلقائياً على الخيط الرئيسي', () => withClean(async () => {
    if (!isImageWorkerSupported()) return true;
    _setWorkerFactoryForTest(() => { throw new Error('boom'); });
    const r = await comp.compress(await solidPng(800, 600), { maxDimensionPx: 400, maxSizeKB: 100000 });
    return r.width === 400 && r.height === 300 && r.dataUrl.startsWith('data:image/jpeg');
  }));

  await t.test('20. [متصفح] Worker معطّل لا يردّ ⟵ بعد المهلة compress ينجح على الخيط الرئيسي', () => withClean(async () => {
    if (!isImageWorkerSupported()) return true;
    _setWorkerFactoryForTest(() => ({ onmessage: null, postMessage() {}, terminate() {} }));
    _setTimingForTest({ job: 50, idle: 1000 });
    const r = await comp.compressToBlob(await solidPng(800, 600), { maxDimensionPx: 400, maxSizeKB: 100000 });
    return r.width === 400 && r.height === 300 && r.blob instanceof Blob;
  }));

  await t.test('21. [متصفح] useWorker:false لا يلمس الـWorker إطلاقاً', () => withClean(async () => {
    let created = 0;
    _setWorkerFactoryForTest(() => { created++; throw new Error('should not be called'); });
    const r = await comp.compress(await solidPng(800, 600), { useWorker: false, maxDimensionPx: 400, maxSizeKB: 100000 });
    return created === 0 && r.width === 400 && r.height === 300;
  }));
});
