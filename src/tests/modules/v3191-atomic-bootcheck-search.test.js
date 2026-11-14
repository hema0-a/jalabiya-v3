/* ==========================================================================
   v3191-atomic-bootcheck-search.test.js — ذرّية التسليم + فحص الإقلاع + كاش البحث
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';
import { createRepository } from '../../data/repository.js';
import { customers } from '../../data/repos/customers.js';
import { searchAll, clearSearchCache } from '../../data/search.js';
import { assessStartup } from '../../services/boot-check.js';
import { describeSaveError } from '../../core/save-error.js';

register('v3.19.1 writeAtomic + update alongside', async (t) => {
  const repo = createRepository(STORES.ORDERS);
  const payRepo = createRepository(STORES.PAYMENTS);
  const o = await repo.create({ amount: 500, status: 'ready' });

  /* 1. نجاح: السجلان يُحفظان معاً */
  const upd = await repo.update(o.id, { status: 'delivered' }, {
    alongside: [{ store: STORES.PAYMENTS, data: { orderId: o.id, amount: 200, notes: 'atomic-test' } }],
  });
  const pays = await payRepo.findByIndex('by_orderId', o.id);
  await t.test('1. التحديث والدفعة حُفظا معاً', upd && upd.status === 'delivered' && pays.length === 1 && pays[0].amount === 200);
  await t.test('2. الدفعة لها id وطوابع زمنية', !!pays[0].id && typeof pays[0].createdAt === 'number' && typeof pays[0].updatedAt === 'number');
  await t.test('3. السجلان مختومان (_v) كأي كتابة عادية', typeof (await repo.find(o.id))._v === 'number' && typeof pays[0]._v === 'number');

  /* 2. فشل أحد السجلين ⟵ لا شيء يُحفظ (الدفعة تحمل id مكرراً لسجل بنوع غير قابل للتخزين) */
  const before = await repo.find(o.id);
  let threw = false;
  try {
    await idb.writeAtomic([
      { store: STORES.ORDERS, key: o.id, build: (ex) => ({ ...ex, status: 'cancelled', updatedAt: Date.now() }) },
      { store: STORES.PAYMENTS, key: 'x-fail', build: () => { throw new Error('boom'); } },
    ]);
  } catch (e) { threw = e && e.message === 'boom'; }
  const after = await repo.find(o.id);
  await t.test('4. خطأ في خطوة ⟵ يُرفض الوعد بالخطأ نفسه', threw);
  await t.test('5. ولا يُحفظ تعديل الخطوة الأخرى (ذرّية)', after.status === before.status);

  /* 3. طلب غير موجود ⟵ null ولا دفعة يتيمة */
  const none = await repo.update('no-such-order', { status: 'x' }, { alongside: [{ store: STORES.PAYMENTS, data: { orderId: 'no-such-order', amount: 1 } }] });
  const orphan = await payRepo.findByIndex('by_orderId', 'no-such-order');
  await t.test('6. طلب غير موجود ⟵ null بلا دفعة يتيمة', none === null && orphan.length === 0);

  /* 4. بدون alongside السلوك القديم كما هو */
  const plain = await repo.update(o.id, { notes: 'n' });
  await t.test('7. update العادي لم يتغيّر', plain && plain.notes === 'n');

  await t.test('8. رسالة فشل الكتابة الذرّية مفهومة', /تعذّر إكمال الكتابة/.test(describeSaveError(new Error('[idb] atomic write aborted'))));

  for (const p of pays) await payRepo.remove(p.id);
  await repo.remove(o.id);
});

register('v3.19.1 boot-check', async (t) => {
  const D = 86400000;
  const now = Date.now();
  await t.test('1. خطأ فتح القاعدة ⟵ open-failed', assessStartup({ openError: new Error('x') }).status === 'open-failed');
  await t.test('2. جهاز جديد (بلا نسخ سابقة) ⟵ ok', assessStartup({ recordCount: 0, backupCount: 0 }).status === 'ok');
  await t.test('3. فارغ + نسخ سابقة ⟵ possible-wipe', assessStartup({ lastAutoBackupAt: now - D, recordCount: 0, backupCount: 0 }).status === 'possible-wipe');
  await t.test('4. نسخة خارجية فقط سابقة + فارغ ⟵ possible-wipe', assessStartup({ lastExternalBackupAt: now - D }).status === 'possible-wipe');
  await t.test('5. فيه بيانات ⟵ ok', assessStartup({ lastAutoBackupAt: now, recordCount: 5 }).status === 'ok');
  await t.test('6. فيه نسخ داخلية فقط ⟵ ok (القاعدة لم تُمسح)', assessStartup({ lastAutoBackupAt: now, backupCount: 2 }).status === 'ok');
  await t.test('7. «ابدأ ببيانات جديدة» يُسكت التنبيه', assessStartup({ lastAutoBackupAt: now - D, ackedAt: now - D }).status === 'ok');
  await t.test('8. نسخة أحدث بعد الإقرار + فارغ ⟵ ينبّه من جديد', assessStartup({ lastAutoBackupAt: now, ackedAt: now - D }).status === 'possible-wipe');
  await t.test('9. مدخل null لا ينهار', assessStartup(null).status === 'ok');

  if (typeof document !== 'undefined') {
    const { renderDbFailure } = await import('../../ui/db-failure.js');
    const host = document.createElement('div');
    renderDbFailure(host, { status: 'possible-wipe', onImport: () => {}, onStartFresh: () => {} });
    await t.test('10. شاشة الفقد فيها استيراد + ابدأ جديداً', host.querySelectorAll('button').length === 3 && !!host.querySelector('input[type=file]'));
    const h2 = document.createElement('div');
    renderDbFailure(h2, { status: 'open-failed', onRetry: () => {} });
    await t.test('11. شاشة الفتح فيها إعادة المحاولة فقط', h2.querySelectorAll('button').length === 1);
  }
});

register('v3.19.1 search cache', async (t) => {
  clearSearchCache();
  const a = await customers.create({ name: 'زبون كاش ألف', phone: '01099990001' });
  const r1 = await searchAll('كاش ألف');
  await t.test('1. يجد العميل', r1.customers.some((x) => x.id === a.id));

  const b = await customers.create({ name: 'زبون كاش ألفين', phone: '01099990002' });
  const r2 = await searchAll('كاش ألف');
  await t.test('2. إضافة عميل تُبطل الكاش (يظهر الجديد فوراً)', r2.customers.some((x) => x.id === b.id));

  await customers.update(a.id, { name: 'اسم مختلف تماماً' });
  const r3 = await searchAll('كاش ألف');
  await t.test('3. تعديل الاسم يظهر فوراً (لا نتيجة قديمة)', !r3.customers.some((x) => x.id === a.id));

  await customers.remove(b.id);
  const r4 = await searchAll('كاش ألفين');
  await t.test('4. حذف عميل يختفي من البحث فوراً', !r4.customers.some((x) => x.id === b.id));

  const v = idb.getWriteVersion();
  await searchAll('اسم مختلف'); await searchAll('اسم مختلف');
  await t.test('5. البحث نفسه لا يزيد عدّاد الكتابة', idb.getWriteVersion() === v);

  await customers.remove(a.id);
  clearSearchCache();
});
