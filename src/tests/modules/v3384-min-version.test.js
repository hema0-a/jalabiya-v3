/* ==========================================================================
   v3384-min-version.test.js — حارس الإصدار الأدنى للمزامنة (v3.3.84)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import * as fsync from '../../sync/firestore-sync.js';
import { APP_CONFIG } from '../../core/config.js';
import { MIN_CLIENT_BUILD, toBuild, clientBuild, checkClient, writerStamp, isOldWriter } from '../../sync/min-version.js';

const UID = 'u3384';
const MAIN = 'users_v3/' + UID + '/data/main';

/** Firestore وهمي يحاكي شرط firestore.rules على المستند الرئيسي (writerBuild صحيح ≥ الحد). */
function fakeFirestore() {
  const store = new Map();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const rule = (path, data) => {
    if (!path.endsWith('/data/main')) return;
    if (!(Number.isInteger(data.writerBuild) && data.writerBuild >= MIN_CLIENT_BUILD)) {
      const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e;
    }
  };
  const fsMod = {
    doc: (db, path) => ({ path }),
    setDoc: async (ref, data) => { rule(ref.path, data); store.set(ref.path, clone(data)); },
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
    deleteDoc: async (ref) => { store.delete(ref.path); },
    runTransaction: async (db, fn) => {
      const writes = [];
      const tx = { get: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }), set: (ref, d) => writes.push([ref.path, d]) };
      await fn(tx);
      for (const [p, d] of writes) { rule(p, d); store.set(p, clone(d)); }
    },
  };
  return { store, backend: { db: {}, fsMod } };
}

register('v3.3.84 min-version guard — المنطق النقي', async (t) => {
  await t.test('1. toBuild: 3.3.84 ⟵ 3003084، وغير الصالح ⟵ 0', toBuild('3.3.84') === 3003084 && toBuild('4.0.1') === 4000001 && toBuild('abc') === 0 && toBuild('3.3') === 0 && toBuild('3.1000.1') === 0 && toBuild(null) === 0);
  await t.test('2. ترتيب الإصدارات صحيح (3.3.9 < 3.3.84 < 3.4.0)', toBuild('3.3.9') < toBuild('3.3.84') && toBuild('3.3.84') < toBuild('3.4.0'));
  await t.test('3. بناء التطبيق = APP_CONFIG.version ولا يقل عن الحد (وإلا حجب نفسه)', clientBuild() === toBuild(APP_CONFIG.version) && clientBuild() >= MIN_CLIENT_BUILD);
  await t.test('4. checkClient: لا مستند/بلا حد ⟵ مسموح؛ حد أعلى من بنائي ⟵ مرفوض',
    checkClient(null).ok && checkClient({}).ok && checkClient({ minClientBuild: clientBuild() }).ok && !checkClient({ minClientBuild: clientBuild() + 1 }).ok);
  const st = writerStamp({ minClientBuild: MIN_CLIENT_BUILD + 5000 });
  await t.test('5. writerStamp: الحد الأدنى لا ينخفض أبداً ويحمل إصدار الكاتب',
    st.minClientBuild === MIN_CLIENT_BUILD + 5000 && writerStamp(null).minClientBuild === MIN_CLIENT_BUILD && st.writerBuild === clientBuild() && st.writerVersion === APP_CONFIG.version);
  await t.test('6. isOldWriter: بلا ختم أو أقل من الحد ⟵ قديم؛ مختوم بالحد ⟵ لا؛ لا مستند ⟵ لا',
    isOldWriter({}) && isOldWriter({ writerBuild: MIN_CLIENT_BUILD - 1 }) && !isOldWriter({ writerBuild: MIN_CLIENT_BUILD }) && !isOldWriter(null));
});

register('v3.3.84 min-version guard — الرفع والتنزيل (Firestore وهمي بقاعدة الأمان)', async (t) => {
  const fake = fakeFirestore();
  fsync._setBackendForTest(fake.backend);
  try {
    for (const s of fsync.SYNC_STORES) await idb.clear(s);
    fsync.setKnownRev(null);
    await idb.put('customers', { id: 'c1', updatedAt: 100 });

    const r1 = await fsync.push(UID);
    const m1 = fake.store.get(MAIN);
    await t.test('1. الرفع يختم المستند الرئيسي (writerBuild/minClientBuild/writerVersion) وتقبله قاعدة الأمان',
      r1.ok === true && m1.writerBuild === clientBuild() && m1.minClientBuild >= MIN_CLIENT_BUILD && m1.writerVersion === APP_CONFIG.version);

    /* جهاز قديم: يكتب المستند الرئيسي بلا ختم ⟵ تمنعه القاعدة (محاكاة firestore.rules) */
    let denied = false;
    try { await fake.backend.fsMod.setDoc({ path: MAIN }, { version: 2, gen: 'old', updatedAt: Date.now(), manifest: {} }); }
    catch (e) { denied = e.code === 'permission-denied'; }
    await t.test('2. كتابة مستند رئيسي بلا writerBuild (جهاز قديم) ⟵ permission-denied والسحابة لم تتغيّر', denied && fake.store.get(MAIN).gen === m1.gen);

    /* السحابة اشترطت حداً أعلى من بنائي */
    const raised = { ...fake.store.get(MAIN), minClientBuild: clientBuild() + 1 };
    fake.store.set(MAIN, raised);
    fsync.setKnownRev(raised.updatedAt);
    const keysBefore = JSON.stringify([...fake.store.keys()].sort());
    const r2 = await fsync.push(UID);
    const r2f = await fsync.push(UID, { force: true });
    await t.test('3. حد أعلى من بنائي ⟵ الرفع يُرفض (client-outdated) حتى مع force، ولا يُكتب شيء',
      r2.ok === false && r2.code === 'client-outdated' && r2f.code === 'client-outdated' &&
      JSON.stringify([...fake.store.keys()].sort()) === keysBefore && JSON.stringify(fake.store.get(MAIN)) === JSON.stringify(raised));
    const p2 = await fsync.pull(UID);
    await t.test('4. التنزيل أيضاً يُرفض (client-outdated) فلا يُطبَّق شيء محلياً', p2.ok === false && p2.code === 'client-outdated' && !p2.data);

    /* عودة الحد إلى بنائي: كل شيء يعمل، والحد لا ينخفض عند الرفع */
    const high = { ...raised, minClientBuild: clientBuild() };
    fake.store.set(MAIN, high);
    fsync.setKnownRev(high.updatedAt);
    const p3 = await fsync.pull(UID);
    await t.test('5. الحد = بنائي ⟵ التنزيل يعمل، والمستند المختوم بالحد لا يُعدّ كاتباً قديماً', p3.ok === true && p3.oldWriter === false);

    /* مستند كتبه إصدار قبل 3.3.84 (بلا ختم) ⟵ كشف الكاتب القديم */
    const legacy = { ...high }; delete legacy.writerBuild; delete legacy.writerVersion; delete legacy.minClientBuild;
    fake.store.set(MAIN, legacy);
    const p4 = await fsync.pull(UID);
    await t.test('6. مستند بلا ختم ⟵ pull ينجح مع oldWriter=true (تنبيه + مصالحة)', p4.ok === true && p4.oldWriter === true);

    fsync.setKnownRev(legacy.updatedAt);
    const r3 = await fsync.push(UID);
    const m3 = fake.store.get(MAIN);
    await t.test('7. أول رفع بعد مستند قديم الختم ⟵ ينجح ويختم من جديد (يصير الكاتب حديثاً)', r3.ok === true && m3.writerBuild === clientBuild() && m3.minClientBuild >= MIN_CLIENT_BUILD);
  } finally {
    fsync._setBackendForTest(null);
    fsync.setKnownRev(null);
    for (const s of fsync.SYNC_STORES) await idb.clear(s);
  }
});
