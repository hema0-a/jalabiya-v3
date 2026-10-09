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
import * as fsync from '../../sync/firestore-sync.js';
import { wipeAllLocalData } from '../../ui/lock-screen.js';
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

/* Firestore وهمي في الذاكرة يفرض حد 1 MiB للمستند */
function fakeFirestore() {
  const store = new Map();
  const doc = (db, path) => ({ path });
  return {
    store,
    backend: {
      db: {},
      fsMod: {
        doc,
        setDoc: async (ref, data) => {
          if (new TextEncoder().encode(JSON.stringify(data)).length > 1048576) throw new Error('document too large');
          store.set(ref.path, JSON.parse(JSON.stringify(data)));
        },
        getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
        deleteDoc: async (ref) => { store.delete(ref.path); },
      },
    },
  };
}

register('audit v3.3.12 chunked sync', async (t) => {
  const fake = fakeFirestore();
  fsync._setBackendForTest(fake.backend);
  for (const s of fsync.SYNC_STORES) await idb.clear(s);

  /* ~2.4 MB من البيانات: كان يفشل بحد 1 MB في الصيغة القديمة */
  const big = 'x'.repeat(60000);
  for (let i = 0; i < 40; i++) await idb.put('orders', { id: 'o' + i, notes: big });
  await idb.put('customers', { id: 'c1', name: 'عميل' });
  await idb.put('workerPayments', { id: 'wp1', amount: 5 });
  await idb.put('referrals', { id: 'r1', name: 'إحالة' });

  const r = await fsync.push('uid1');
  const main = fake.store.get('users_v3/uid1/data/main');
  await t.test('1. رفع بيانات أكبر من 1 MB ينجح (شرائح) ويشمل المخازن الجديدة',
    r.ok === true && main.version === 2 && main.manifest.orders.chunks >= 3 &&
    main.manifest.workerPayments.count === 1 && main.manifest.referrals.count === 1);

  const pulled = await fsync.pull('uid1');
  await t.test('2. pull يعيد تجميع كل السجلات بالعدد نفسه',
    pulled.ok === true && pulled.data.stores.orders.length === 40 && pulled.data.stores.customers.length === 1);

  await idb.clear('orders'); await idb.clear('workerPayments');
  const ap = await fsync.apply(pulled.data);
  await t.test('3. apply يستعيد البيانات محلياً (دورة رفع/تنزيل كاملة)',
    ap.ok === true && (await idb.getAll('orders')).length === 40 && (await idb.getAll('workerPayments')).length === 1);

  /* شريحة مفقودة = رفض بلا تطبيق جزئي */
  fake.store.delete('users_v3/uid1/data/store_orders_1');
  const broken = await fsync.pull('uid1');
  await t.test('4. شريحة مفقودة → خطأ واضح بدل بيانات ناقصة', broken.ok === false);

  /* تقليل البيانات يحذف الشرائح الزائدة */
  for (let i = 1; i < 40; i++) await idb.remove('orders', 'o' + i);
  const r2 = await fsync.push('uid1');
  await t.test('5. إعادة الرفع بعد التقليل تحذف الشرائح الزائدة',
    r2.ok === true && !fake.store.has('users_v3/uid1/data/store_orders_1') && fake.store.has('users_v3/uid1/data/store_orders_0'));

  /* توافق مع الصيغة القديمة */
  fake.store.set('users_v3/uid2/data/main', { stores: { customers: [{ id: 'old1' }] }, updatedAt: 1 });
  const legacy = await fsync.pull('uid2');
  await t.test('6. pull يقرأ الصيغة القديمة (مستند واحد)', legacy.ok === true && legacy.data.stores.customers[0].id === 'old1');

  await idb.put('orders', { id: 'huge', notes: 'y'.repeat(800000) });
  const huge = await fsync.push('uid1');
  await t.test('7. سجل أكبر من 700KB يُرفض برسالة واضحة', huge.ok === false && /700KB/.test(huge.error));

  fsync._setBackendForTest(null);
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
});

register('audit v3.3.12 forgot pin', async (t) => {
  await idb.put('customers', { id: 'fp1', name: 'x' });
  await auth.setPinAndSave('1234');
  await wipeAllLocalData();
  await t.test('1. «نسيت الرقم»: تُمسح البيانات ويُزال الرقم والجلسة',
    (await idb.getAll('customers')).length === 0 && auth.hasPin() === false && auth.getSession() === null);
});
