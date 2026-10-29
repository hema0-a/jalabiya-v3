/* ==========================================================================
   v3388-media-diagnostic.test.js — التشخيص يقرأ مخزن orderMedia (v3.3.88)
   ==========================================================================
   قبل v3.3.88 كانت الأداة تقيس ما بداخل سجلات الطلبات فقط، فتعرض صفراً للوسائط الجديدة
   (المحفوظة في orderMedia منذ v3.3.87). هنا: التصنيف، والتجميع من المصدرين، والمفصول عن طلب،
   والحكم على السرعة، والقراءة الفعلية من القاعدة، والواجهة.
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';
import { orders } from '../../data/repos/orders.js';
import { orderMedia } from '../../data/repos/order-media.js';
import { dataCarePage } from '../../pages/data-care.js';
import { mediaRecordInfo, diagnoseOrderMedia, assessMedia, emptyMediaReport, addOrderToReport } from '../../services/media-diagnostic.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = 1048576;
const du = (n) => 'data:image/jpeg;base64,' + 'A'.repeat(n);
const len = (s) => s.length;

/** قارئ دفعات وهمي (يحاكي readBatchAfter: مرتّب بالمعرّف، والمفتاح الأخير للدفعة). */
function reader(rows) {
  const sorted = [...rows].sort((a, b) => (String(a && a.id) < String(b && b.id) ? -1 : 1));
  const calls = [];
  const fn = async (after, limit) => {
    calls.push({ after, limit });
    const start = after === undefined ? 0 : sorted.findIndex((r) => r && r.id === after) + 1;
    const records = sorted.slice(start, start + limit);
    const lastKey = records.length ? records[records.length - 1].id : after;
    return { records, lastKey, done: start + records.length >= sorted.length };
  };
  fn.calls = calls;
  return fn;
}
const noYield = async () => {};

register('v3.3.88 media diagnostic — مخزن orderMedia', async (t) => {
  /* ---- التصنيف ---- */
  const a = mediaRecordInfo({ id: 'o1:ref', data: du(10) });
  await t.test('1. mediaRecordInfo: ref = صورة، والحجم = طول data',
    a && a.orderId === 'o1' && a.slot === 'ref' && a.kind === 'image' && a.bytes === len(du(10)));
  const b = mediaRecordInfo({ id: 'o1:sig', data: du(5) });
  const c = mediaRecordInfo({ id: 'o1:del-d7', data: du(5) });
  await t.test('2. sig وdel-* = توقيع', b.kind === 'signature' && c.kind === 'signature' && c.slot === 'del-d7');
  const d = mediaRecordInfo({ id: 'junk', orderId: 'o4', slot: 'sig', bytes: 321 });
  await t.test('3. معرّف غير مفهوم: يُستعان بـ orderId/slot والحقل bytes عند غياب data',
    d.orderId === 'o4' && d.kind === 'signature' && d.bytes === 321);
  const e = mediaRecordInfo({ id: 'o1:weird', data: du(4) });
  const e2 = mediaRecordInfo({ id: 'o1:weird', orderId: 'o1', slot: 'weird', data: du(4) });
  await t.test('4. خانة غير معروفة: بلا نوع (kind=null) فلا تُنسب لصورة ولا توقيع', e.kind === null && e2.kind === null && e2.slot === 'weird');
  await t.test('5. غير الكائنات تُرجع null، وbytes سالب/غائب = 0',
    mediaRecordInfo(null) === null && mediaRecordInfo('x') === null && mediaRecordInfo({ id: 'o1:ref' }).bytes === 0
    && mediaRecordInfo({ id: 'o1:ref', bytes: -5 }).bytes === 0);

  /* ---- سيناريو مختلط: مضمَّن + مفصول + مصغّرات + بلا طلب ---- */
  const o1 = { id: 'o1', customerId: 'c1', referenceImage: du(1000), signature: du(200), refThumb: du(30) };
  const o2 = { id: 'o2', customerId: 'c2', referenceImage: '', signature: '', hasReferenceImage: true, hasSignature: true, refThumb: du(40) };
  const o3 = { id: 'o3', customerId: 'c3', signature: du(300) };
  const media = [
    { id: 'o2:ref', data: du(5000) }, { id: 'o2:sig', data: du(700) }, { id: 'o2:del-d1', data: du(300) },
    { id: 'o1:ref', data: du(400) },                       /* طلب له صورة مضمَّنة وأخرى مفصولة */
    { id: 'o9:ref', data: du(800) },                       /* طلب غير موجود */
    { id: 'garbage', data: du(60) },                       /* معرّف غير مفهوم */
  ];
  const progress = [];
  let yields = 0;
  const r = await diagnoseOrderMedia({
    batchSize: 2, topN: 5, readBatch: reader([o1, o2, o3]), readMediaBatch: reader(media),
    yieldFn: async () => { yields++; }, onProgress: (p) => progress.push(p),
  });
  const inlineImg = len(o1.referenceImage);
  const inlineSig = len(o1.signature) + len(o3.signature);
  const sepImg = len(media[0].data) + len(media[3].data);
  const sepSig = len(media[1].data) + len(media[2].data);
  await t.test('6. المضمَّن داخل الطلبات يُحسب كما كان', r.inline.imageBytes === inlineImg && r.inline.signatureBytes === inlineSig && r.inline.totalBytes === inlineImg + inlineSig);
  await t.test('7. المفصول المنسوب لطلبات موجودة: عدد السجلات والطلبات والأحجام (صور/توقيعات)',
    r.separated.records === 4 && r.separated.orders === 2 && r.separated.imageBytes === sepImg && r.separated.signatureBytes === sepSig && r.separated.totalBytes === sepImg + sepSig);
  await t.test('8. بلا طلب موجود (طلب غائب + معرّف غير مفهوم): تُحسب مفصولةً عن المنسوب',
    r.detached.records === 2 && r.detached.bytes === len(media[4].data) + len(media[5].data));
  await t.test('9. الحقول القديمة = المجموع المنسوب (مضمَّن + مفصول) دون المنفصلة عن طلب',
    r.imageBytes === inlineImg + sepImg && r.signatureBytes === inlineSig + sepSig && r.totalBytes === inlineImg + inlineSig + sepImg + sepSig);
  await t.test('10. عدّ الطلبات: الطلب بصورة مضمَّنة ومفصولة يُعدّ مرة واحدة',
    r.totalOrders === 3 && r.ordersWithImage === 2 && r.ordersWithSignature === 3 && r.ordersWithMedia === 3);
  await t.test('11. مصغّرات القوائم تُحسب مستقلة، وما يُقرأ مع القائمة = مضمَّن + مصغّرات (لا المفصول)',
    r.thumbBytes === len(o1.refThumb) + len(o2.refThumb) && r.listBytes === r.inline.totalBytes + r.thumbBytes);
  await t.test('12. الأكبر حجماً بعد دمج المصدرين: o2 (كله مفصول) ثم o1 ثم o3',
    r.topOrders.map((x) => x.id).join() === 'o2,o1,o3'
    && r.topOrders[0].totalBytes === len(media[0].data) + len(media[1].data) + len(media[2].data)
    && r.topOrders[0].customerId === 'c2' && r.topOrders[1].totalBytes === len(o1.referenceImage) + len(o1.signature) + len(media[3].data)
    && r.topOrders[2].totalBytes === len(o3.signature));
  await t.test('13. المتوسط يُحسب على المجموع المنسوب وطلبات الوسائط', r.avgBytesPerMediaOrder === Math.round(r.totalBytes / 3));
  const phases = progress.map((p) => p.phase);
  await t.test('14. التقدّم: مرحلة الطلبات ثم الوسائط، وعدّاد الوسائط تصاعدي وينتهي بـ 6',
    phases.indexOf('media') > phases.lastIndexOf('orders') && progress.filter((p) => p.phase === 'media').map((p) => p.mediaScanned).join() === '2,4,6'
    && progress.filter((p) => p.phase === 'orders').pop().scanned === 3);
  await t.test('15. يُرخي التحكم بين الدفعات في المرحلتين (طلبان: دفعتان + وسائط: ثلاث دفعات)', yields === 1 + 2 && r.mediaScanned === true);

  /* ---- متى لا نقرأ مخزن الوسائط ---- */
  const mediaReader = reader(media);
  const legacy = await diagnoseOrderMedia({ readBatch: reader([o1, o2, o3]), yieldFn: noYield });
  await t.test('16. مع قارئ طلبات مخصّص بلا قارئ وسائط: لا مرحلة وسائط (سلوك الاختبارات القديمة)',
    legacy.mediaScanned === false && legacy.separated.records === 0 && legacy.detached.records === 0 && legacy.totalBytes === inlineImg + inlineSig);
  const off = await diagnoseOrderMedia({ readBatch: reader([o1]), readMediaBatch: null, yieldFn: noYield });
  await t.test('17. readMediaBatch:null يعطّلها صراحةً', off.mediaScanned === false && mediaReader.calls.length === 0);

  /* ---- الإيقاف ---- */
  let n = 0;
  const cancelInMedia = await diagnoseOrderMedia({
    batchSize: 2, readBatch: reader([o1, o2, o3]), readMediaBatch: reader(media), yieldFn: noYield,
    shouldCancel: () => { n += 1; return n > 3; },   /* دفعتا طلبات تمرّان، ثم يُوقَف عند أول وسائط */
  });
  await t.test('18. الإيقاف أثناء مرحلة الوسائط: cancelled=true وتقرير جزئي بلا استثناء',
    cancelInMedia.cancelled === true && cancelInMedia.totalOrders === 3 && cancelInMedia.separated.records < 4);
  const cancelEarly = await diagnoseOrderMedia({ batchSize: 1, readBatch: reader([o1, o2]), readMediaBatch: reader(media), yieldFn: noYield, shouldCancel: () => true });
  await t.test('19. الإيقاف قبل بدء الطلبات: لا قراءة وسائط (التصنيف يحتاج الطلبات كاملة)', cancelEarly.cancelled === true && cancelEarly.mediaScanned === false && cancelEarly.totalOrders === 0);

  /* ---- حدود ---- */
  const empty = await diagnoseOrderMedia({ readBatch: reader([]), readMediaBatch: reader([]), yieldFn: noYield });
  await t.test('20. لا طلبات ولا وسائط: أصفار بلا انقسام على صفر', empty.totalBytes === 0 && empty.avgBytesPerMediaOrder === 0 && empty.separated.records === 0 && empty.listBytes === 0);
  const onlyMedia = await diagnoseOrderMedia({ readBatch: reader([]), readMediaBatch: reader([{ id: 'x1:ref', data: du(9) }]), yieldFn: noYield });
  await t.test('21. وسائط بلا أي طلب: كلها «بلا طلب» ولا تُنسب', onlyMedia.detached.records === 1 && onlyMedia.totalBytes === 0 && onlyMedia.ordersWithMedia === 0);
  const rep = emptyMediaReport();
  addOrderToReport(rep, o1, 5);
  await t.test('22. addOrderToReport (الواجهة القديمة) يغذّي المضمَّن والمصغّرات أيضاً',
    rep.inline.totalBytes === inlineImg + len(o1.signature) && rep.thumbBytes === len(o1.refThumb) && rep.listBytes === rep.inline.totalBytes + rep.thumbBytes);

  /* ---- الحكم على السرعة ---- */
  const base = (inlineTotal, thumb, sepTotal, detachedBytes = 0) => {
    const x = emptyMediaReport();
    x.inline.totalBytes = inlineTotal; x.thumbBytes = thumb; x.listBytes = inlineTotal + thumb;
    x.separated.totalBytes = sepTotal; x.totalBytes = inlineTotal + sepTotal; x.detached.bytes = detachedBytes;
    return x;
  };
  const a1 = assessMedia(base(0, 50 * 1024, 80 * MB));
  await t.test('23. كل شيء مفصول (80MB) والمضمَّن صغير: «ok» ويشرح أنها لا تؤثر على السرعة',
    a1.level === 'ok' && /مخزن مستقل/.test(a1.text) && /لا أثر/.test(a1.text));
  await t.test('24. ما يُقرأ مع القائمة 3MB: info؛ و12MB: warn ويوصي بنقل المضمَّن',
    assessMedia(base(3 * MB, 0, 0)).level === 'info' && assessMedia(base(12 * MB, 0, 0)).level === 'warn' && /نقل/.test(assessMedia(base(12 * MB, 0, 0)).text));
  await t.test('25. المصغّرات تُحسب ضمن ما يُقرأ مع القائمة (9MB مضمَّن + 3MB مصغّرات ⟵ warn)', assessMedia(base(9 * MB, 3 * MB, 0)).level === 'warn');
  const share = assessMedia(base(0, 1 * MB, 8 * MB, 1 * MB), 100 * MB);
  await t.test('26. نسبة التخزين تشمل المنسوب والمنفصل عن طلب والمصغّرات (10 من 100MB = 10%)', share.sharePercent === 10);
  await t.test('27. تقرير بالشكل القديم (بلا inline) يُقيَّم بإجماليه كما كان',
    assessMedia({ totalBytes: 12 * MB }).level === 'warn' && assessMedia({ totalBytes: 1 * MB }).level === 'ok' && assessMedia(null).level === 'ok');
});

register('v3.3.88 media diagnostic — قاعدة فعلية + واجهة', async (t) => {
  const IDS = ['t3388-1', 't3388-2', 't3388-3'];
  const cleanup = async () => {
    for (const id of IDS) { try { await orderMedia.removeByOrder(id); } catch (e) { /* ignore */ } try { await idb.remove(STORES.ORDERS, id); } catch (e) { /* ignore */ } }
    try { await idb.remove(STORES.ORDER_MEDIA, 't3388-ghost:ref'); } catch (e) { /* ignore */ }
  };
  await cleanup();
  const imgA = du(3000), imgB = du(1200), sigA = du(150);
  try {
    await orders.create({ id: 't3388-1', customerId: 'c1', amount: 100, status: 'pending', referenceImage: imgA, signature: sigA });
    await orders.create({ id: 't3388-2', customerId: 'c1', amount: 100, status: 'pending', referenceImage: imgB });
    await orders.create({ id: 't3388-3', customerId: 'c2', amount: 100, status: 'pending' });
    /* وسيط لطلب غير موجود */
    await idb.writeBatch({ [STORES.ORDER_MEDIA]: { records: [{ id: 't3388-ghost:ref', orderId: 't3388-ghost', slot: 'ref', data: du(500), bytes: len(du(500)), createdAt: 1, updatedAt: 1 }] } });

    const premise = await orderMedia.find('t3388-1', 'ref');
    await t.test('1. (شرط الاختبار) الصورة الجديدة صارت في orderMedia لا داخل سجل الطلب',
      !!premise && !(await idb.get(STORES.ORDERS, 't3388-1')).referenceImage);

    const before = idb.getWriteVersion ? idb.getWriteVersion() : null;
    const rep = await diagnoseOrderMedia({ batchSize: 2, yieldFn: noYield });
    /* القاعدة قد تحوي طلبات أخرى من اختبارات سابقة: نقيس ما أضفناه فقط عبر topOrders الشامل */
    const mine = (await diagnoseOrderMedia({ batchSize: 2, topN: 1000, yieldFn: noYield })).topOrders.filter((x) => IDS.includes(String(x.id)));
    const m1 = mine.find((x) => x.id === 't3388-1'), m2 = mine.find((x) => x.id === 't3388-2');
    await t.test('2. القراءة الحقيقية تنسب وسائط الطلبات إلى طلباتها بأحجام دقيقة (صور وتوقيعات)',
      mine.length === 2 && m1.imageBytes === len(imgA) && m1.signatureBytes === len(sigA) && m2.imageBytes === len(imgB) && m2.signatureBytes === 0);
    await t.test('3. ما في orderMedia يظهر في «المفصول» (لا صفراً كما كان قبل الإصلاح) وبلا مضمَّن للطلبات الجديدة',
      rep.separated.records >= 3 && rep.separated.imageBytes >= len(imgA) + len(imgB) && rep.separated.signatureBytes >= len(sigA) && rep.mediaScanned === true);
    await t.test('4. الوسيط لطلب غير موجود يُعدّ «بلا طلب» ولا يدخل المنسوب', rep.detached.records >= 1 && rep.detached.bytes >= len(du(500)));
    await t.test('5. للقراءة فقط: لا تغيّر القاعدة (نسخة الكتابة ثابتة، والسجلات كما هي)',
      (before === null || idb.getWriteVersion() === before) && (await orderMedia.find('t3388-1', 'ref')).data === imgA);
    await t.test('6. ما يُقرأ مع قائمة الطلبات = المضمَّن + المصغّرات فقط (المفصول لا يدخل فيه)',
      rep.separated.totalBytes > 0 && rep.listBytes === rep.inline.totalBytes + rep.thumbBytes);

    /* ---- الواجهة ---- */
    const box = document.createElement('div'); document.body.appendChild(box);
    try {
      await dataCarePage.render(box);
      const btn = [...box.querySelectorAll('button')].find((b) => b.textContent.includes('افحص حجم الصور والتوقيعات'));
      await t.test('7. زر الفحص موجود في صفحة صيانة البيانات', !!btn);
      if (btn) {
        btn.click();
        /* ننتظر صف نتيجة لا يرد في نص المقدمة (المقدمة نفسها تذكر «مخزن الوسائط المستقل») */
        const end = Date.now() + 20000;
        while (Date.now() < end && !box.textContent.includes('يُقرأ مع قائمة الطلبات')) await sleep(30);
        const txt = box.textContent;
        await t.test('8. الواجهة تعرض: المخزن المستقل (بعدد الوسائط) + ما يُقرأ مع القائمة + الوسائط بلا طلب',
          txt.includes('يُقرأ مع قائمة الطلبات') && /في مخزن الوسائط المستقل[^()]*\(\d+ وسيط\)/.test(txt) && txt.includes('وسائط بلا طلب في القائمة'));
        await t.test('9. الحكم يشرح أن المفصول لا يُقرأ مع القائمة (لا تحذير «داخل الطلبات» الخاطئ)', txt.includes('لا تُقرأ مع قائمة الطلبات'));
      }
    } finally { try { dataCarePage.destroy(); } catch (e) { /* ignore */ } box.remove(); }
  } finally { await cleanup(); }
});
