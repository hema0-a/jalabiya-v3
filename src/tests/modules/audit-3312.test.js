/* ==========================================================================
   audit-3312.test.js — اختبارات انحدار لإصلاحات v3.3.12 (أمان القفل)
   ========================================================================== */

import { register } from '../registry.js';
import { hashPin, hashPinV2, verifyPin, isLegacyHash, generateSalt } from '../../security/pin-crypto.js';
import { auth } from '../../security/auth.js';
import { STORAGE_KEYS, LIMITS } from '../../core/config.js';
import { apply as applySnapshot } from '../../sync/firestore-sync.js';
import * as idb from '../../data/idb.js';
import { restoreBackup } from '../../services/auto-backup.js';
import { withDepositPayments, orderPaidBreakdown, unrecordedDeposit } from '../../services/payments-view.js';

register('audit v3.3.12 pin security', async (t) => {
  const salt = generateSalt();

  const v2 = await hashPinV2('1234', salt);
  await t.test('1. hashPinV2 يبدأ بـ v2$ ويختلف عن SHA-256 المفرد',
    v2.startsWith('v2$') && v2.length === 3 + 64 && v2 !== await hashPin('1234', salt));

  await t.test('2. verifyPin يقبل v2 الصحيح ويرفض الخاطئ',
    (await verifyPin('1234', v2, salt)) === true && (await verifyPin('1235', v2, salt)) === false);

  const legacy = await hashPin('4321', salt);
  await t.test('3. verifyPin ما زال يقبل hash القديم (توافق خلفي)',
    isLegacyHash(legacy) === true && isLegacyHash(v2) === false && (await verifyPin('4321', legacy, salt)) === true);

  /* ترقية صامتة: مستخدم قديم يدخل بنجاح → يُخزَّن hash جديد بنفس الرقم */
  auth.reset();
  localStorage.setItem(STORAGE_KEYS.V3_PIN_SALT, salt);
  localStorage.setItem(STORAGE_KEYS.V3_PIN_HASH, legacy);
  const res = await auth.unlock('4321');
  const stored = localStorage.getItem(STORAGE_KEYS.V3_PIN_HASH);
  const again = await auth.unlock('4321');
  await t.test('4. الدخول بـ hash قديم ينجح ويُرقّى إلى v2 والرقم نفسه ما زال يعمل',
    res.success === true && stored.startsWith('v2$') && again.success === true);

  /* قفل متصاعد: كل محاولة فاشلة بعد الحد تضاعف المدة */
  auth.reset();
  await auth.setPinAndSave('1234');
  for (let i = 0; i < LIMITS.maxPinAttempts; i++) auth._recordFailure();
  const first = auth.getLockRemainingMs();
  localStorage.removeItem(STORAGE_KEYS.V3_LOCK_UNTIL);
  auth._recordFailure();
  const second = auth.getLockRemainingMs();
  await t.test('5. مدة القفل تتضاعف مع الفشل المتكرر',
    first > 0 && second > first * 1.5 && second <= 15 * 60 * 1000);

  auth.reset();
  await t.test('6. changePin مع hash جديد: القديم يعمل والخاطئ يُرفض',
    (await auth.setPinAndSave('1111')) === true &&
    (await auth.changePin('2222', '3333')) === false &&
    (await auth.changePin('1111', '3333')) === true &&
    (await auth.unlock('3333')).success === true);
  auth.reset();
});

register('audit v3.3.12 deposit rule', async (t) => {
  const sum = (l) => l.reduce((a, p) => a + p.amount, 0);
  const order = { id: 'o1', customerId: 'c1', status: 'pending', amount: 1000, deposit: 500 };

  await t.test('1. مقدم 500 بلا دفعات → 500',
    sum(withDepositPayments([], [order])) === 500);

  await t.test('2. مقدم 500 + دفعة لاحقة 300 → 800 (المقدم لا يضيع)',
    sum(withDepositPayments([{ id: 'p1', orderId: 'o1', amount: 300 }], [order])) === 800);

  await t.test('3. المقدم سُجّل كدفعة 500 يدوياً → لا يُعدّ مرتين',
    sum(withDepositPayments([{ id: 'p1', orderId: 'o1', amount: 500 }], [order])) === 500);

  await t.test('4. الطلب الملغى لا يُضاف مقدمه، ودفعات طلب آخر لا تُخفي مقدم هذا',
    sum(withDepositPayments([], [{ ...order, status: 'cancelled' }])) === 0 &&
    sum(withDepositPayments([{ id: 'p9', orderId: 'other', amount: 500 }], [order])) === 1000);

  const b = orderPaidBreakdown(order, [{ amount: 300 }]);
  await t.test('5. orderPaidBreakdown: مسجّل 300 + مقدم 500 = 800 والحدود الطرفية',
    b.recorded === 300 && b.deposit === 500 && b.paid === 800 &&
    unrecordedDeposit(0, []) === 0 && unrecordedDeposit('abc', null) === 0);
});

register('audit v3.3.12 sync apply safety', async (t) => {
  await idb.clear('customers'); await idb.clear('expenses');
  await idb.put('customers', { id: 'keep-c', name: 'محلي' });
  await idb.put('expenses', { id: 'keep-e', amount: 10 });

  /* snapshot ناقص: يحتوي customers فقط → expenses المحلي لا يُمسح */
  const r = await applySnapshot({ stores: { customers: [{ id: 'cloud-c', name: 'سحابي' }] } });
  const cust = await idb.getAll('customers');
  const exp = await idb.getAll('expenses');
  await t.test('1. المخزن الغائب من النسخة السحابية لا يُمسح محلياً',
    r.ok === true && exp.length === 1 && exp[0].id === 'keep-e');
  await t.test('2. المخزن الموجود يُستبدل', cust.length === 1 && cust[0].id === 'cloud-c');

  const bad = await applySnapshot({ stores: { foo: [] } });
  await t.test('3. snapshot بلا أي مخزن صالح يُرفض ولا يمسح شيئاً',
    bad.ok === false && (await idb.getAll('expenses')).length === 1);

  await idb.clear('customers'); await idb.clear('expenses');
});

register('audit v3.3.12 restore safety', async (t) => {
  await idb.clear('customers'); await idb.clear('referrals');
  await idb.put('customers', { id: 'cur-c', name: 'حالي' });
  await idb.put('referrals', { id: 'cur-r', name: 'إحالة حالية' });
  /* نسخة قديمة بلا مخزن الإحالات */
  await idb.put('backups', { id: 'old-backup-test', createdAt: 1, stores: { customers: [{ id: 'bk-c', name: 'من النسخة' }] } });

  const res = await restoreBackup('old-backup-test');
  const cust = await idb.getAll('customers');
  const refs = await idb.getAll('referrals');
  await t.test('1. الاستعادة تنجح وتستبدل المخازن الموجودة في النسخة',
    res.ok === true && cust.length === 1 && cust[0].id === 'bk-c');
  await t.test('2. مخزن غائب من النسخة القديمة (referrals) لا يُمسح',
    refs.length === 1 && refs[0].id === 'cur-r');

  const empty = await restoreBackup('missing-id');
  await t.test('3. نسخة غير موجودة → خطأ بلا مسح', empty.ok === false && (await idb.getAll('referrals')).length === 1);

  await idb.remove('backups', 'old-backup-test');
  for (const b of await idb.getAll('backups')) { if (String(b.label || '').includes('قبل الاستعادة')) await idb.remove('backups', b.id); }
  await idb.clear('customers'); await idb.clear('referrals');
});
