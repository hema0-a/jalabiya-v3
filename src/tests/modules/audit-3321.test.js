/* ==========================================================================
   audit-3321.test.js — اختبارات انحدار لإصلاحات v3.3.21 (مزامنة سحابية بلا فقدان بيانات)
   ========================================================================== */

import { register } from '../registry.js';
import * as fsync from '../../sync/firestore-sync.js';
import * as idb from '../../data/idb.js';

/* Firestore وهمي في الذاكرة مع معاملات وخطّاف قبل كل كتابة (لمحاكاة جهاز آخر / انقطاع) */
function fakeFirestore() {
  const store = new Map();
  const hooks = { beforeSet: null };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fsMod = {
    doc: (db, path) => ({ path }),
    setDoc: async (ref, data) => {
      if (hooks.beforeSet) await hooks.beforeSet(ref.path);
      store.set(ref.path, clone(data));
    },
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
    deleteDoc: async (ref) => { store.delete(ref.path); },
    runTransaction: async (db, fn) => {
      const writes = [];
      const tx = {
        get: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
        set: (ref, data) => writes.push([ref.path, data]),
      };
      await fn(tx);
      for (const [p, d] of writes) store.set(p, clone(d));
    },
  };
  return { store, hooks, backend: { db: {}, fsMod } };
}

const MAIN = 'users_v3/u3321/data/main';

register('audit v3.3.21 cloud sync safety', async (t) => {
  const fake = fakeFirestore();
  fsync._setBackendForTest(fake.backend);
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  fsync.setKnownRev(null);

  for (let i = 0; i < 12; i++) await idb.put('orders', { id: 'o' + i, updatedAt: 100, who: 'local' });
  await idb.put('customers', { id: 'c1', updatedAt: 100 });

  const r1 = await fsync.push('u3321');
  const m1 = fake.store.get(MAIN);
  await t.test('1. أول رفع (لا سحابة) ينجح ويكتب شرائح بجيل جديد ويسجّل رقم النسخة',
    r1.ok === true && !!m1.gen && fake.store.has('users_v3/u3321/data/store_orders_g' + m1.gen + '_0') &&
    fsync.getKnownRev() === m1.updatedAt);

  const r2 = await fsync.push('u3321');
  const m2 = fake.store.get(MAIN);
  await t.test('2. الرفع التالي يستبدل الجيل ويحذف شرائح الجيل السابق',
    r2.ok === true && m2.gen !== m1.gen &&
    !fake.store.has('users_v3/u3321/data/store_orders_g' + m1.gen + '_0') &&
    fake.store.has('users_v3/u3321/data/store_orders_g' + m2.gen + '_0'));

  /* جهاز آخر غيّر السحابة */
  const other = JSON.parse(JSON.stringify(m2)); other.updatedAt += 5000;
  fake.store.set(MAIN, other);
  const r3 = await fsync.push('u3321');
  await t.test('3. سحابة تغيّرت من جهاز آخر → الرفع يُوقَف ولا يُمسّ شيء',
    r3.ok === false && r3.code === 'remote-changed' && fake.store.get(MAIN).updatedAt === other.updatedAt);

  const r3b = await fsync.push('u3321', { force: true });
  await t.test('4. force يتجاوز الحماية (قرار صريح)', r3b.ok === true);

  fsync.setKnownRev(null);
  const r4 = await fsync.push('u3321');
  await t.test('5. جهاز لم يزامن قط والسحابة فيها بيانات → يُوقَف (firstSync)',
    r4.ok === false && r4.code === 'remote-changed' && r4.firstSync === true);

  /* انقطاع في منتصف الرفع: النسخة السحابية تبقى سليمة بلا شرائح يتيمة */
  fsync.setKnownRev(fake.store.get(MAIN).updatedAt);
  await idb.put('customers', { id: 'c2', updatedAt: 200 });
  const keysBefore = JSON.stringify([...fake.store.keys()].sort());
  const mainBefore = JSON.stringify(fake.store.get(MAIN));
  let n = 0;
  fake.hooks.beforeSet = async () => { n++; if (n === 2) throw new Error('انقطع الاتصال'); };
  const r5 = await fsync.push('u3321');
  fake.hooks.beforeSet = null;
  const pulledAfterFail = await fsync.pull('u3321');
  await t.test('6. انقطاع منتصف الرفع: السحابة سليمة ولا شرائح يتيمة',
    r5.ok === false && JSON.stringify(fake.store.get(MAIN)) === mainBefore &&
    JSON.stringify([...fake.store.keys()].sort()) === keysBefore &&
    pulledAfterFail.ok === true && pulledAfterFail.data.stores.orders.length === 12);

  /* جهاز آخر يعتمد نسخته أثناء رفعنا */
  const keys7 = JSON.stringify([...fake.store.keys()].sort());
  let fired = false;
  fake.hooks.beforeSet = async () => {
    if (fired) return; fired = true;
    const m = JSON.parse(JSON.stringify(fake.store.get(MAIN))); m.updatedAt += 999;
    fake.store.set(MAIN, m);
  };
  const r6 = await fsync.push('u3321');
  fake.hooks.beforeSet = null;
  await t.test('7. تغيّرت السحابة أثناء الرفع → المعاملة ترفض ولا يُستبدل شيء',
    r6.ok === false && r6.code === 'remote-changed' &&
    JSON.stringify([...fake.store.keys()].sort()) === keys7);

  /* حماية البيانات المحلية الناقصة */
  fsync.setKnownRev(fake.store.get(MAIN).updatedAt);
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  await idb.put('customers', { id: 'only' });
  const r7 = await fsync.push('u3321');
  await t.test('8. بيانات محلية أقل من نصف السحابة → الرفع يُوقَف (shrink)',
    r7.ok === false && r7.code === 'shrink');

  fsync._setBackendForTest(null);
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  fsync.setKnownRev(null);
});

register('audit v3.3.21 cloud merge', async (t) => {
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  fsync.setKnownRev(null);

  await idb.put('orders', { id: 'L1', updatedAt: 50, who: 'local-only' });
  await idb.put('orders', { id: 'S', updatedAt: 200, who: 'local-newer' });
  await idb.put('orders', { id: 'T', updatedAt: 10, who: 'local-older' });
  const snap = { updatedAt: 777, stores: { orders: [
    { id: 'S', updatedAt: 100, who: 'cloud-older' },
    { id: 'T', updatedAt: 90, who: 'cloud-newer' },
    { id: 'C1', updatedAt: 5, who: 'cloud-only' },
  ] } };

  const an = await fsync.analyzeLocalVsCloud(snap);
  await t.test('1. التحليل يعدّ: محلي فقط 1، محلي أحدث 1، جديد من السحابة 1، أحدث في السحابة 1',
    an.ok && an.localOnly === 1 && an.localNewer === 1 && an.added === 1 && an.updated === 1);

  const ap = await fsync.apply(snap, { mode: 'merge' });
  const o = Object.fromEntries((await idb.getAll('orders')).map((x) => [x.id, x.who]));
  await t.test('2. الدمج: لا يُمسح سجل محلي، الأحدث يفوز، وسجلات السحابة الجديدة تُضاف',
    ap.ok && o.L1 === 'local-only' && o.S === 'local-newer' && o.T === 'cloud-newer' &&
    o.C1 === 'cloud-only' && Object.keys(o).length === 4);
  await t.test('3. بعد الدمج يعرف الجهاز نسخة السحابة (يسمح بالرفع التالي)', fsync.getKnownRev() === 777);

  const rep = await fsync.apply(snap);
  await t.test('4. وضع الاستبدال الافتراضي ما زال يستبدل', rep.ok && (await idb.getAll('orders')).length === 3);

  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  fsync.setKnownRev(null);
});

register('audit v3.3.22 dirty tracking & auto-sync', async (t) => {
  const dirty = await import('../../sync/dirty-state.js');
  const auto = await import('../../sync/auto-sync.js');
  const fake = fakeFirestore();
  fsync._setBackendForTest(fake.backend);
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  fsync.setKnownRev(null);
  dirty.installTracking(fsync.SYNC_STORES);
  dirty.markClean();

  await idb.put('orders', { id: 'd1', updatedAt: 1 });
  await t.test('1. أي كتابة في مخزن مُزامَن تضع علامة «غير مرفوع»', !!dirty.getState().dirtySince);

  await idb.put('settings', { id: 'x', v: 1 }).catch(() => {});
  dirty.markClean();
  await idb.put('settings', { id: 'x', v: 2 }).catch(() => {});
  await t.test('2. الكتابة في مخزن غير مُزامَن (settings) لا تضع علامة', !dirty.getState().dirtySince);

  await idb.put('orders', { id: 'd2', updatedAt: 2 });
  const r = await fsync.push('u3322');
  await t.test('3. الرفع الناجح يمسح العلامة ويسجّل وقت آخر رفع',
    r.ok === true && !dirty.getState().dirtySince && !!dirty.getState().lastPush);

  /* تعديل أثناء الرفع يبقى «غير مرفوع» */
  fake.hooks.beforeSet = async () => { fake.hooks.beforeSet = null; await new Promise((x) => setTimeout(x, 5)); await idb.put('orders', { id: 'd3', updatedAt: 3 }); };
  const r2 = await fsync.push('u3322');
  await t.test('4. تعديل أثناء الرفع يبقى مُعلَّماً غير مرفوع', r2.ok === true && !!dirty.getState().dirtySince);

  /* auto-sync: لا يرفع بلا مستخدم، ويتوقف عند التعارض */
  const skip = await auto.tryAutoPush();
  await t.test('5. الرفع التلقائي لا يعمل بلا مستخدم مسجّل', skip && skip.skipped === true);

  auto.setUser({ uid: 'u3322' });
  const other = JSON.parse(JSON.stringify(fake.store.get('users_v3/u3322/data/main'))); other.updatedAt += 5000;
  fake.store.set('users_v3/u3322/data/main', other);
  const res = await auto.tryAutoPush();
  await t.test('6. تعارض: الرفع التلقائي يتوقف ويضع علامة «يحتاج قرارك» ولا يلمس السحابة',
    res && res.ok === false && !!auto.getBlocked() && fake.store.get('users_v3/u3322/data/main').updatedAt === other.updatedAt);

  const again = await auto.tryAutoPush();
  await t.test('7. بعد التعارض لا يكرّر المحاولة حتى يقرر المستخدم', again && again.skipped === true);
  auto.onManualSyncDone();
  await t.test('8. القرار اليدوي يرفع الإيقاف', auto.getBlocked() === null);

  auto.setUser(null);
  fsync._setBackendForTest(null);
  dirty.markClean();
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  fsync.setKnownRev(null);
});
