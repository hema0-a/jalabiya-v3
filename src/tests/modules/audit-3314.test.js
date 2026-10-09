/* ==========================================================================
   audit-3314.test.js — اختبارات انحدار لإصلاحات الفحص الشامل
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';

register('audit v3.3.14 write durability', async (t) => {
  const id = 'dur-test-' + Date.now();
  const v0 = idb.getWriteVersion();
  await idb.put(STORES.CUSTOMERS, { id, name: 'اختبار', createdAt: 1, updatedAt: 1 });
  await t.test('1. put يُنهي المعاملة ويزيد عدّاد الكتابة',
    idb.getWriteVersion() === v0 + 1 && (await idb.get(STORES.CUSTOMERS, id)).name === 'اختبار');

  let rejected = false;
  try { await idb.put(STORES.CUSTOMERS, { id: id + '-bad', fn() {} }); }
  catch (e) { rejected = true; }
  await t.test('2. قيمة غير قابلة للتخزين ترفض الوعد (لا نجاح كاذب)', rejected);

  await idb.remove(STORES.CUSTOMERS, id);
  await t.test('3. remove يُنهي المعاملة ويحذف السجل',
    (await idb.get(STORES.CUSTOMERS, id)) === undefined);
});
