/* ==========================================================================
   v3387-order-media-write.test.js — الكتابة الجديدة في orderMedia (v3.3.87)
   الصورة المرجعية والتوقيعات الجديدة تذهب إلى المخزن عبر مستودع الطلبات، والمضمَّن القديم يبقى كما هو (بلا ترحيل ضمني).
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { orders } from '../../data/repos/orders.js';
import { orderMedia, getOrderMedia, _setWriteGateForTest } from '../../data/repos/order-media.js';
import {
  externalizeMedia, hasReferenceImage, hasOrderSignature, deliveryHasSignature, isMediaData, mediaWritesAllowed, MEDIA_MIN_BUILD,
} from '../../services/order-media.js';
import { MIN_CLIENT_BUILD, writerStamp } from '../../sync/min-version.js';

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(100_000);
const IMG2 = 'data:image/jpeg;base64,' + 'B'.repeat(500);
const SIG = 'data:image/png;base64,iVBORw0KGgo';
const SIG2 = 'data:image/png;base64,ZZZZ';
const THUMB = 'data:image/jpeg;base64,/9j/THUMB';
const slotsOf = (r) => r.puts.map((p) => p.slot).sort().join();

async function resetAll() {
  for (const s of ['orders', 'orderMedia', 'trash']) await idb.clear(s);
  _setWriteGateForTest(null);
}

register('v3.3.87 externalizeMedia — المنطق النقي', async (t) => {
  const c = externalizeMedia({ customerId: 'c1', referenceImage: IMG, refThumb: THUMB, urgent: true }, null);
  await t.test('1. إنشاء بصورة: تذهب للمخزن ويُفرَّغ الحقل ويُضاف العلم والمصغّر يبقى',
    slotsOf(c) === 'ref' && c.puts[0].data === IMG && c.record.referenceImage === '' && c.record.hasReferenceImage === true && c.record.refThumb === THUMB && c.record.urgent === true && c.deletes.length === 0);
  const noThumb = externalizeMedia({ referenceImage: IMG }, null);
  await t.test('2. صورة بلا مصغّر ⟵ refThumb فارغ (القائمة تعرض رمزاً بديلاً)', noThumb.record.refThumb === '' && noThumb.record.hasReferenceImage === true);

  const empty = externalizeMedia({ customerId: 'c1', referenceImage: '', notes: 'x' }, null);
  await t.test('3. إنشاء بلا صورة: لا مخزن ولا علم', empty.puts.length === 0 && empty.deletes.length === 0 && empty.record.referenceImage === '' && !('hasReferenceImage' in empty.record));

  const legacy = { id: 'o', referenceImage: IMG, signature: SIG };
  const same = externalizeMedia({ referenceImage: IMG, signature: SIG, notes: 'غيّرت ملاحظة' }, legacy);
  await t.test('4. المضمَّن القديم غير المتغيّر يبقى مضمَّناً (لا ترحيل ضمني)', same.puts.length === 0 && same.record.referenceImage === IMG && same.record.signature === SIG && !('hasReferenceImage' in same.record));
  const changed = externalizeMedia({ referenceImage: IMG2 }, legacy);
  await t.test('5. صورة جديدة فوق مضمَّنة قديمة ⟵ تُفصَل (والقديمة المضمَّنة تُفرَّغ بالكتابة)', slotsOf(changed) === 'ref' && changed.record.referenceImage === '' && changed.record.hasReferenceImage === true);

  const slim = { id: 'o', referenceImage: '', hasReferenceImage: true, refThumb: THUMB, signature: '', hasSignature: true };
  const rm = externalizeMedia({ referenceImage: '' }, slim);
  await t.test('6. إفراغ صريح لمفصولة ⟵ حذف الوسيط وإسقاط العلم والمصغّر', rm.deletes.join() === 'ref' && rm.record.hasReferenceImage === false && rm.record.refThumb === '' && rm.puts.length === 0);
  const rmLegacy = externalizeMedia({ referenceImage: '' }, legacy);
  await t.test('7. إفراغ مضمَّنة قديمة ⟵ يُفرَّغ الحقل بلا حذف من المخزن', rmLegacy.deletes.length === 0 && rmLegacy.record.referenceImage === '');
  const spread = externalizeMedia({ ...slim, status: 'ready' }, slim);
  await t.test('8. نسخة من سجل مفصول ({...order, status}) ⟵ لا حذف ولا كتابة والعلم باقٍ (حماية من حذف عرَضي)',
    spread.puts.length === 0 && spread.deletes.length === 0 && spread.record.hasReferenceImage === true && spread.record.hasSignature === true && spread.record.status === 'ready');

  const sig = externalizeMedia({ signature: SIG }, slim);
  await t.test('9. التوقيع الجديد ⟵ sig في المخزن وعلم hasSignature', slotsOf(sig) === 'sig' && sig.record.signature === '' && sig.record.hasSignature === true);

  const exDel = { deliveries: [{ id: 'd1', signature: SIG }, { id: 'd2', signature: '', hasSignature: true }, { id: 'd3' }] };
  const dl = externalizeMedia({ deliveries: [{ id: 'd1', signature: SIG }, { id: 'd2', signature: '', hasSignature: true }, { id: 'd3' }, { id: 'd4', signature: SIG2 }, { signature: SIG2 }] }, exDel);
  await t.test('10. التسليمات: الجديدة بتوقيع ⟵ del-<id>؛ المضمَّنة القديمة غير المتغيّرة تبقى؛ المفصولة تبقى؛ بلا معرّف تبقى مضمَّنة',
    slotsOf(dl) === 'del-d4' && dl.record.deliveries[0].signature === SIG && dl.record.deliveries[1].hasSignature === true
    && dl.record.deliveries[3].signature === '' && dl.record.deliveries[3].hasSignature === true && dl.record.deliveries[4].signature === SIG2);
  const rev = externalizeMedia({ deliveries: [{ id: 'd1' }] }, { deliveries: [{ id: 'd1' }, { id: 'd2', hasSignature: true }, { id: 'd3', signature: SIG }] });
  await t.test('11. تراجع عن تسليمة مفصولة التوقيع ⟵ يُحذف وسيطها (المضمَّنة لا تحتاج حذفاً)', rev.deletes.join() === 'del-d2');

  const other = externalizeMedia({ referenceImage: 'http://x/y.jpg', signature: 5, notes: 'n' }, null);
  const none = externalizeMedia({ notes: 'x', amount: 5 }, { id: 'o' });
  await t.test('12. غير dataURL يبقى مضمَّناً ولا يُمسّ؛ وبلا حقول وسائط ⟵ السجل نفسه بلا علامات',
    other.puts.length === 0 && other.record.referenceImage === 'http://x/y.jpg' && other.record.signature === 5 && none.puts.length === 0 && JSON.stringify(none.record) === JSON.stringify({ notes: 'x', amount: 5 }));
  const input = { referenceImage: IMG, deliveries: [{ id: 'd1', signature: SIG }] };
  const copy = JSON.stringify(input);
  externalizeMedia(input, null);
  await t.test('13. لا تعدّل مدخلاتها', JSON.stringify(input) === copy);
  await t.test('14. أدوات العلامات: مضمَّن أو مفصول', hasReferenceImage({ referenceImage: IMG }) && hasReferenceImage({ hasReferenceImage: true }) && !hasReferenceImage({ referenceImage: '' }) && !hasReferenceImage(null)
    && hasOrderSignature({ hasSignature: true }) && hasOrderSignature({ signature: SIG }) && !hasOrderSignature({}) && deliveryHasSignature({ hasSignature: true }) && deliveryHasSignature({ signature: SIG }) && !deliveryHasSignature({ id: 'x' })
    && isMediaData(IMG) && !isMediaData('data:') && !isMediaData(5));
  await t.test('15. الحد الأدنى للمزامنة رُفع لما يعرف المخزن، والختم يحمله', MIN_CLIENT_BUILD >= MEDIA_MIN_BUILD && mediaWritesAllowed(MIN_CLIENT_BUILD) && writerStamp(null).minClientBuild === MIN_CLIENT_BUILD);
});

register('v3.3.87 orders repo — الكتابة عبر orderMedia (قاعدة فعلية)', async (t) => {
  await resetAll();
  try {
    const o = await orders.create({ customerId: 'c-t', status: 'new', amount: 100, notes: 'a', referenceImage: IMG, refThumb: THUMB });
    const stored = await idb.get('orders', o.id);
    const row = await orderMedia.find(o.id, 'ref');
    await t.test('1. إنشاء بصورة: سجل الطلب نحيف (بلا الصورة) والأصل في المخزن، والقراءة المزدوجة تُرجعه',
      stored.referenceImage === '' && stored.hasReferenceImage === true && stored.refThumb === THUMB && !!row && row.data === IMG && (await getOrderMedia(stored, 'ref')) === IMG);
    await t.test('2. حجم سجل الطلب صغير (بدل 100KB) ⟵ قراءة القوائم لا تسحب الصور', JSON.stringify(stored).length < 4000);
    await t.test('3. القوائم (orders.list) نحيفة أيضاً', JSON.stringify(await orders.list()).length < 4000);

    const o2 = await orders.create({ customerId: 'c-t', status: 'new', amount: 5, referenceImage: '' });
    await t.test('4. إنشاء بلا صورة: لا سجل وسائط ولا علامات', (await orderMedia.keys()).every((k) => !k.startsWith(o2.id + ':')) && !('hasReferenceImage' in (await idb.get('orders', o2.id))));

    const afterNote = await orders.update(o.id, { ...stored, notes: 'تعديل ملاحظة' });
    await t.test('5. تعديل غير مرتبط بالوسائط (نسخة من السجل النحيف) ⟵ الصورة والعلم والمصغّر كما هي', afterNote.notes === 'تعديل ملاحظة' && afterNote.hasReferenceImage === true && afterNote.refThumb === THUMB && (await orderMedia.find(o.id, 'ref')).data === IMG);
    await orders.update(o.id, { status: 'in_progress' });
    await t.test('6. تغيير حالة الطلب لا يمسّ الوسائط', (await orderMedia.find(o.id, 'ref')).data === IMG);

    await orders.update(o.id, { referenceImage: IMG2, refThumb: THUMB + '2' });
    const r2 = await orderMedia.find(o.id, 'ref');
    await t.test('7. صورة جديدة تستبدل القديمة في المخزن ويتحدّث المصغّر', r2.data === IMG2 && (await idb.get('orders', o.id)).refThumb === THUMB + '2' && (await orderMedia.listByOrder(o.id)).length === 1);

    await orders.update(o.id, { referenceImage: '' });
    const cleared = await idb.get('orders', o.id);
    await t.test('8. حذف الصورة يحذف الوسيط ويُسقط العلم والمصغّر', !(await orderMedia.find(o.id, 'ref')) && cleared.hasReferenceImage === false && cleared.refThumb === '' && !hasReferenceImage(cleared));

    /* التوقيع والتسليمات */
    await orders.update(o.id, { signature: SIG });
    const withSig = await idb.get('orders', o.id);
    await t.test('9. توقيع جديد ⟵ sig في المخزن والسجل نحيف وعلم hasSignature', withSig.signature === '' && withSig.hasSignature === true && (await orderMedia.find(o.id, 'sig')).data === SIG && (await getOrderMedia(withSig, 'sig')) === SIG);
    await orders.update(o.id, { deliveries: [{ id: 'd1', at: 1, items: [{ id: 'i1', qty: 1 }], signature: SIG2 }, { id: 'd2', at: 2, items: [{ id: 'i1', qty: 1 }] }] });
    const dRec = await idb.get('orders', o.id);
    await t.test('10. توقيع تسليمة ⟵ del-<id> والتسليمة النحيفة بعلم، وبلا توقيع تبقى بلا علم',
      dRec.deliveries[0].signature === '' && dRec.deliveries[0].hasSignature === true && !dRec.deliveries[1].hasSignature && (await getOrderMedia(dRec, 'del-d1')) === SIG2);
    await orders.update(o.id, { deliveries: [{ id: 'd2', at: 2, items: [{ id: 'i1', qty: 1 }] }], signature: '' });
    await t.test('11. التراجع عن التسليم يحذف وسائطه (التسليمة والتوقيع)', !(await orderMedia.find(o.id, 'del-d1')) && !(await orderMedia.find(o.id, 'sig')));

    /* مضمَّن قديم: لا ترحيل ضمني */
    await idb.put('orders', { id: 'leg1', customerId: 'c-t', status: 'new', amount: 1, referenceImage: IMG, signature: SIG, updatedAt: 1 });
    const before = (await orderMedia.keys()).length;
    const touched = await orders.update('leg1', { notes: 'ملاحظة', referenceImage: IMG, signature: SIG });
    await t.test('12. طلب قديم مضمَّن الوسائط: تعديله لا يُرحِّلها ضمنياً (تبقى مضمَّنة ولا سجلات جديدة)',
      touched.referenceImage === IMG && touched.signature === SIG && !touched.hasReferenceImage && (await orderMedia.keys()).length === before && (await getOrderMedia(touched, 'ref')) === IMG);
    const swapped = await orders.update('leg1', { referenceImage: IMG2 });
    await t.test('13. استبدال صورة قديمة مضمَّنة ⟵ تُفصَل الجديدة وتُفرَّغ المضمَّنة، والتوقيع القديم يبقى مضمَّناً',
      swapped.referenceImage === '' && swapped.hasReferenceImage === true && (await orderMedia.find('leg1', 'ref')).data === IMG2 && swapped.signature === SIG);

    const none = await orders.update('no-such-order', { referenceImage: IMG });
    await t.test('14. تحديث طلب غير موجود ⟵ null ولا بايتات يتيمة', none === null && !(await orderMedia.find('no-such-order', 'ref')));

    _setWriteGateForTest(() => false);
    let blocked = null;
    try { await orders.update(o.id, { referenceImage: IMG }); } catch (e) { blocked = e; }
    _setWriteGateForTest(null);
    await t.test('15. لو أُغلق حارس الكتابة ⟵ يفشل التحديث كله (لا طلب نصف مكتوب) والسجل كما كان', !!blocked && blocked.code === 'media-writes-disabled' && !hasReferenceImage(await idb.get('orders', o.id)));
  } finally {
    await resetAll();
  }
});
