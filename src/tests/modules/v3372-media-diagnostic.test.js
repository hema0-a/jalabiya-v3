/* ==========================================================================
   v3372-media-diagnostic.test.js — تشخيص حجم الصور والتوقيعات (v3.3.72)
   ==========================================================================
   يغطي: حساب الأحجام، الفحص على دفعات، الإيقاف، الإرخاء بين الدفعات، عدم تعديل البيانات،
   وقارئ الدفعات في طبقة التخزين (قراءة فقط) على قاعدة البيانات الفعلية.
   ========================================================================== */

import { register } from '../registry.js';
import {
  fieldBytes, orderMediaBytes, emptyMediaReport, addOrderToReport,
  diagnoseOrderMedia, assessMedia, formatKB,
} from '../../services/media-diagnostic.js';
import { readBatchAfter, getWriteVersion } from '../../data/idb.js';
import { orders } from '../../data/repos/orders.js';
import { orderMedia } from '../../data/repos/order-media.js';
import { STORES } from '../../core/config.js';

/** orders.clear() لا يحذف وسائط orderMedia (منذ v3.3.87 تُحفظ الصور هناك) فنحذف وسائط طلبات الاختبار صراحةً. */
const dropMedia = async () => {
  for (let i = 1; i <= 7; i++) { try { await orderMedia.removeByOrder('ord' + i); } catch (e) { /* ignore */ } }
};

const img = (n) => 'data:image/jpeg;base64,' + 'A'.repeat(n);

/** 7 طلبات اصطناعية: صور وتوقيعات متفاوتة. */
function sampleOrders() {
  return [
    { id: 'o1', customerId: 'c1', referenceImage: img(1000) },
    { id: 'o2', customerId: 'c1', signature: img(500) },
    { id: 'o3', customerId: 'c2', referenceImage: img(3000), signature: img(200) },
    { id: 'o4', customerId: 'c2' },
    { id: 'o5', customerId: 'c3', deliveries: [{ id: 'd1', signature: img(400) }, { id: 'd2' }], signature: img(100) },
    { id: 'o6', customerId: 'c3', referenceImage: '' },
    { id: 'o7', customerId: 'c4', referenceImage: img(2000) },
  ];
}

/** قارئ دفعات اصطناعي فوق مصفوفة (يحاكي readBatchAfter). */
function fakeReader(list, counter = { calls: 0 }) {
  const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
  return async (after, limit) => {
    counter.calls += 1;
    const rest = after === undefined ? sorted : sorted.filter((o) => o.id > after);
    const records = rest.slice(0, limit);
    return { records, lastKey: records.length ? records[records.length - 1].id : after, done: rest.length <= limit };
  };
}

register('v3.3.72 media diagnostic', async (t) => {
  /* --- حساب الأحجام --- */
  await t.test('1. fieldBytes: نص → طوله، Blob → size، غير ذلك 0',
    fieldBytes('abcd') === 4 && fieldBytes({ size: 77 }) === 77 && fieldBytes(null) === 0 &&
    fieldBytes(undefined) === 0 && fieldBytes(12) === 0 && fieldBytes({ size: -5 }) === 0);

  const m = orderMediaBytes({ referenceImage: img(100), signature: img(50), deliveries: [{ signature: img(30) }, null, { note: 'x' }] });
  await t.test('2. orderMediaBytes: توقيع الطلب + توقيعات التسليمات يُجمعان، والصورة منفصلة',
    m.imageBytes === img(100).length && m.signatureBytes === img(50).length + img(30).length &&
    m.totalBytes === m.imageBytes + m.signatureBytes && m.hasImage && m.hasSignature);
  await t.test('3. مدخلات غريبة (null/نص/أرقام) لا تُسقط الدالة',
    orderMediaBytes(null).totalBytes === 0 && orderMediaBytes('x').totalBytes === 0 && orderMediaBytes({ deliveries: 'bad' }).totalBytes === 0);

  /* --- الفحص على دفعات --- */
  const data = sampleOrders();
  const counter = { calls: 0 };
  let yields = 0;
  const progress = [];
  const report = await diagnoseOrderMedia({
    batchSize: 3, readBatch: fakeReader(data, counter),
    yieldFn: async () => { yields += 1; }, onProgress: (p) => progress.push(p.scanned),
  });
  const expectImage = 1000 + 3000 + 2000 + 3 * 'data:image/jpeg;base64,'.length;
  const expectSig = 500 + 200 + 400 + 100 + 4 * 'data:image/jpeg;base64,'.length;
  await t.test('4. العدّ: 7 طلبات، 3 بصور، 3 بتوقيعات، 5 بأيٍّ منهما',
    report.totalOrders === 7 && report.ordersWithImage === 3 && report.ordersWithSignature === 3 && report.ordersWithMedia === 5);
  await t.test('5. الأحجام: صور وتوقيعات وإجمالي', report.imageBytes === expectImage && report.signatureBytes === expectSig && report.totalBytes === expectImage + expectSig);
  await t.test('6. أكبر الطلبات مرتبة تنازلياً (حد 5): o3 ثم o7 ثم o1', report.topOrders.length === 5 &&
    report.topOrders[0].id === 'o3' && report.topOrders[1].id === 'o7' && report.topOrders[2].id === 'o1');
  await t.test('7. المتوسط = الإجمالي ÷ طلبات الوسائط', report.avgBytesPerMediaOrder === Math.round(report.totalBytes / 5));
  await t.test('8. القراءة على دفعات (3 دفعات بحجم 3) مع إرخاء بينها وتقدّم تصاعدي',
    counter.calls === 3 && yields === 2 && progress.join() === '3,6,7');
  await t.test('9. topN يُحترم', (await diagnoseOrderMedia({ batchSize: 4, topN: 2, readBatch: fakeReader(data), yieldFn: async () => {} })).topOrders.length === 2);

  /* --- الإيقاف والأخطاء --- */
  let polls = 0;
  const cut = await diagnoseOrderMedia({ batchSize: 2, readBatch: fakeReader(data), yieldFn: async () => {}, shouldCancel: () => (polls++ >= 1) });
  await t.test('10. الإيقاف: تقرير جزئي بعلامة cancelled', cut.cancelled === true && cut.totalOrders === 2);
  let threw = false;
  try { await diagnoseOrderMedia({ readBatch: async () => { throw new Error('boom'); } }); } catch (e) { threw = /boom/.test(e.message); }
  await t.test('11. خطأ القراءة يصل للمستدعي (لا يُبتلع)', threw);
  const empty = await diagnoseOrderMedia({ readBatch: async () => ({ records: [], lastKey: undefined, done: true }) });
  await t.test('12. مخزن فارغ: كل شيء صفر بلا قسمة على صفر', empty.totalOrders === 0 && empty.totalBytes === 0 && empty.avgBytesPerMediaOrder === 0);

  /* --- للقراءة فقط: لا تعديل للبيانات --- */
  const frozen = JSON.stringify(data);
  data.forEach((o) => Object.freeze(o));
  await diagnoseOrderMedia({ batchSize: 3, readBatch: fakeReader(data), yieldFn: async () => {} });
  await t.test('13. الفحص لا يعدّل الطلبات (تعمل حتى مع كائنات مجمَّدة)', JSON.stringify(data) === frozen);

  /* --- التقييم والتنسيق --- */
  const R = (bytes) => ({ totalBytes: bytes });
  await t.test('14. التقييم: 0 → لا وسائط، <2MB → صغير، <10MB → متوسط، غير ذلك → تحذير',
    assessMedia(R(0)).level === 'ok' && /لا توجد/.test(assessMedia(R(0)).text) && assessMedia(R(1.9 * 1048576)).level === 'ok' &&
    assessMedia(R(5 * 1048576)).level === 'info' && assessMedia(R(11 * 1048576)).level === 'warn');
  await t.test('15. نسبة التخزين: 5MB من 50MB = 10%، وبلا قيمة استخدام → null',
    assessMedia(R(5 * 1048576), 50 * 1048576).sharePercent === 10 && assessMedia(R(5 * 1048576)).sharePercent === null && assessMedia(R(5), 0).sharePercent === null);
  await t.test('16. formatKB', formatKB(1536) === '1.5 KB' && formatKB(0) === '0 KB' && formatKB(-1) === '—' && formatKB('x') === '—');
  const rep = emptyMediaReport();
  addOrderToReport(rep, { id: 'z', referenceImage: img(10) });
  await t.test('17. addOrderToReport يجمع في التقرير الممرَّر', rep.totalOrders === 1 && rep.ordersWithImage === 1 && rep.topOrders[0].id === 'z');

  /* --- قارئ الدفعات على قاعدة البيانات الفعلية (قراءة فقط) --- */
  await orders.clear();
  await dropMedia();
  try {
    for (let i = 1; i <= 7; i++) {
      await orders.create({ id: 'ord' + i, customerId: 'c' + (i % 2), amount: 100, status: 'pending',
        referenceImage: i % 2 ? img(100 * i) : '', signature: i === 3 ? img(50) : '' });
    }
    const beforeVersion = getWriteVersion();
    const seen = [];
    let after; let done = false; let batches = 0;
    while (!done && batches < 10) {
      const b = await readBatchAfter(STORES.ORDERS, after, 3);
      b.records.forEach((r) => seen.push(r.id));
      after = b.lastKey; done = b.done; batches += 1;
    }
    await t.test('18. readBatchAfter: يقرأ الـ7 كلها مرة واحدة بالترتيب وبدفعات ≤3',
      seen.length === 7 && new Set(seen).size === 7 && seen.join() === [...seen].sort().join() && batches >= 3 && done === true);
    const first = await readBatchAfter(STORES.ORDERS, undefined, 2);
    const next = await readBatchAfter(STORES.ORDERS, first.lastKey, 100);
    await t.test('19. «بعد مفتاح» غير شامل، وحد كبير يعيد الباقي مع done', first.records.length === 2 && next.records.length === 5 && next.done === true &&
      !next.records.some((r) => first.records.some((f) => f.id === r.id)));
    const real = await diagnoseOrderMedia({ batchSize: 2, yieldFn: async () => {} });
    const expectedImages = [1, 3, 5, 7].reduce((s, i) => s + img(100 * i).length, 0);
    await t.test('20. التشخيص على القاعدة الفعلية: 7 طلبات و4 بصور وتوقيع واحد وحجم دقيق',
      real.totalOrders === 7 && real.ordersWithImage === 4 && real.ordersWithSignature === 1 &&
      real.imageBytes === expectedImages && real.signatureBytes === img(50).length);
    await t.test('21. للقراءة فقط: رقم الكتابة لم يتغيّر وعدد السجلات كما هو', getWriteVersion() === beforeVersion && (await orders.count()) === 7);
  } finally {
    await orders.clear();
    await dropMedia();
  }
});
