/* ==========================================================================
   v3365-record-schema.test.js — نسخة بيانات لكل سجل + ترحيل تلقائي (v3.3.65)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { SYNC_STORES } from '../../sync/firestore-sync.js';
import {
  RECORD_STORES, RECORD_MIGRATIONS, META_FIELDS, deepEqual, recordVersion, latestVersion,
  fieldTime, stampForWrite, isRecordStore,
} from '../../data/record-meta.js';
import {
  validateMigrations, migrateRecord, runRecordMigrations, installBatchMigrationHook, hasMigrationsFor,
} from '../../data/record-schema.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ينتظر حتى يُرجع fn قيمة صادقة (حتى ms) — بدل sleep ثابت يتذبذب تحت الضغط. */
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) { /* ignore */ } await sleep(10); }
  return null;
}

/** قاعدة بيانات وهمية في الذاكرة لاختبار المشغّل. */
function fakeDb(initial = {}, opts = {}) {
  const stores = JSON.parse(JSON.stringify(initial));
  const log = { writes: [], reads: [] };
  return {
    stores, log,
    async getAll(s) { log.reads.push(s); return JSON.parse(JSON.stringify(stores[s] || [])); },
    async writeBatch(plan) {
      if (opts.failWrite) throw new Error('disk full');
      for (const [s, p] of Object.entries(plan)) {
        log.writes.push({ store: s, ids: p.records.map((r) => r.id) });
        for (const r of p.records) {
          const i = (stores[s] = stores[s] || []).findIndex((x) => x.id === r.id);
          if (i >= 0) stores[s][i] = JSON.parse(JSON.stringify(r)); else stores[s].push(JSON.parse(JSON.stringify(r)));
        }
      }
      return {};
    },
  };
}
const memCache = () => { let v = {}; return { get: () => ({ ...v }), set: (o) => { v = { ...o }; }, peek: () => v }; };
const okBackup = () => { const calls = []; const fn = async (o) => { calls.push(o); return { ok: true, id: 'bk1' }; }; fn.calls = calls; return fn; };

register('v3.3.65 record-meta (pure)', async (t) => {
  await t.test('1. RECORD_STORES تطابق SYNC_STORES تماماً (نفس العناصر)',
    RECORD_STORES.length === SYNC_STORES.length && RECORD_STORES.every((s) => SYNC_STORES.includes(s)));
  await t.test('2. سجل الترحيلات الفعلي صالح (فارغ الآن) وكل السجلات نسخة 1',
    validateMigrations(RECORD_MIGRATIONS).length === 0 && RECORD_STORES.every((s) => latestVersion(s) === 1));

  await t.test('3. deepEqual: أوليات وكائنات ومصفوفات (الترتيب مهم) وDate وNaN',
    deepEqual(1, 1) && !deepEqual(1, 2) && deepEqual('a', 'a') && deepEqual(NaN, NaN) && deepEqual(null, null)
    && !deepEqual(null, undefined) && deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })
    && !deepEqual([1, 2], [2, 1]) && !deepEqual({ a: 1 }, { a: 1, b: 2 })
    && deepEqual(new Date(5), new Date(5)) && !deepEqual(new Date(5), new Date(6)));
  await t.test('4. deepEqual: المفتاح undefined = غائب، وBlob بالمرجع',
    deepEqual({ a: 1, b: undefined }, { a: 1 }) && deepEqual(undefined, undefined)
    && !deepEqual(new Blob(['x']), new Blob(['x'])) && (() => { const b = new Blob(['x']); return deepEqual(b, b); })());

  await t.test('5. recordVersion: غياب _v أو قيمة غير صالحة = 1',
    recordVersion({}) === 1 && recordVersion(null) === 1 && recordVersion({ _v: 3 }) === 3
    && recordVersion({ _v: 0 }) === 1 && recordVersion({ _v: 'x' }) === 1 && recordVersion({ _v: 2.5 }) === 1);
  const reg = { customers: [{ to: 2, up() {} }, { to: 3, up() {} }] };
  await t.test('6. latestVersion يقرأ أعلى to ويعطي 1 لغير المذكور', latestVersion('customers', reg) === 3 && latestVersion('orders', reg) === 1);

  /* ---- fieldTime ---- */
  await t.test('7. fieldTime: _ft ثم _fb ثم updatedAt',
    fieldTime({ _ft: { a: 50 }, _fb: 10, updatedAt: 99 }, 'a') === 50
    && fieldTime({ _ft: { a: 50 }, _fb: 10, updatedAt: 99 }, 'b') === 10
    && fieldTime({ updatedAt: 99 }, 'b') === 99 && fieldTime(null, 'x') === 0);

  /* ---- stampForWrite ---- */
  const base = { id: 'x', name: 'A', phone: '1', createdAt: 100, updatedAt: 100 };
  const created = stampForWrite('customers', undefined, { ...base }, 500);
  await t.test('8. سجل جديد: يُختم _v=1 بلا _ft/_fb', created._v === 1 && !('_ft' in created) && !('_fb' in created) && created.name === 'A');

  const upd = stampForWrite('customers', { ...base, _v: 1 }, { ...base, name: 'B', updatedAt: 200 }, 200);
  await t.test('9. تعديل حقل: _ft للحقل المتغيّر فقط و_fb = updatedAt السابق',
    upd._ft && upd._ft.name === 200 && !('phone' in upd._ft) && upd._fb === 100 && upd.name === 'B');

  const upd2 = stampForWrite('customers', upd, { ...upd, phone: '2', updatedAt: 300 }, 300);
  await t.test('10. التعديل الثاني يراكم _ft ولا يغيّر _fb', upd2._ft.name === 200 && upd2._ft.phone === 300 && upd2._fb === 100);

  const noop = stampForWrite('customers', upd2, { ...upd2, updatedAt: 400 }, 400);
  await t.test('11. كتابة بلا تغيير حقول: تُحفظ أزمنة الحقول السابقة كما هي', deepEqual(noop._ft, upd2._ft) && noop._fb === 100);

  const staleIn = stampForWrite('customers', upd2, { ...upd2, name: 'C', _ft: { name: 1 }, _fb: 1, updatedAt: 500 }, 500);
  await t.test('12. _ft/_fb القديمة في المُدخل تُتجاهل (تُشتق من السجل المخزَّن)', staleIn._ft.name === 500 && staleIn._fb === 100);

  const hi = stampForWrite('customers', { ...base, _v: 5 }, { ...base, updatedAt: 200 }, 200);
  await t.test('13. _v لا يُخفَّض أبداً (سجل من تطبيق أحدث)', hi._v === 5);

  const withMig = stampForWrite('customers', undefined, { ...base }, 1, reg);
  await t.test('14. السجل الجديد يُختم بآخر نسخة معروفة للمخزن', withMig._v === 3);

  const frozen = Object.freeze({ ...base, updatedAt: 5 });
  let threw = false; try { stampForWrite('customers', { ...base }, frozen, 5); } catch (e) { threw = true; }
  await t.test('15. المُدخل لا يُعدَّل (يعمل على نسخة)', !threw && !('_v' in frozen));

  await t.test('16. مخزن غير متزامن أو بلا updatedAt رقمي: يُترك كما هو',
    stampForWrite('settings', undefined, { id: 's', updatedAt: 1 }, 1)._v === undefined
    && stampForWrite('customers', undefined, { id: 'q' }, 1)._v === undefined
    && !isRecordStore('backups') && isRecordStore('orders'));

  await t.test('17. حقول META لا تُعدّ «تغييراً»', ['id', 'createdAt', 'updatedAt', '_v', '_ft', '_fb'].every((k) => META_FIELDS.has(k)));
});

register('v3.3.65 record migrations (runner)', async (t) => {
  const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: 'n' + i, createdAt: 1, updatedAt: 2, ...extra }));
  const steps = () => ({
    customers: [
      { to: 2, up(r) { r.trail = (r.trail || '') + 'a'; r.tier = r.tier || 'std'; return r; } },
      { to: 3, up(r) { r.trail = (r.trail || '') + 'b'; delete r.legacy; } },
    ],
  });

  /* 1) خطوات متتالية بالترتيب */
  {
    const db = fakeDb({ customers: mk(3, { legacy: 1 }) });
    const bk = okBackup(); const cache = memCache();
    const res = await runRecordMigrations({ migrations: steps(), db, backup: bk, cache });
    const r0 = db.stores.customers[0];
    await t.test('1. v1→v3 بالترتيب (a ثم b) وختم _v=3 وحذف الحقل القديم',
      res.ok && res.migrated === 3 && r0.trail === 'ab' && r0._v === 3 && r0.tier === 'std' && !('legacy' in r0));
    await t.test('2. نسخة أمان واحدة قبل أول كتابة، وتسمية واضحة', bk.calls.length === 1 && /قبل ترحيل البيانات/.test(bk.calls[0].label) && res.backupId === 'bk1');
    await t.test('3. id/createdAt/updatedAt لا تتغير', r0.id === 'r0' && r0.createdAt === 1 && r0.updatedAt === 2);

    const res2 = await runRecordMigrations({ migrations: steps(), db, backup: bk, cache });
    await t.test('4. التشغيل الثاني: لا شيء يتغير ولا قراءة (مخزن مفحوص) ولا نسخة جديدة',
      res2.ok && res2.migrated === 0 && res2.scanned === 0 && bk.calls.length === 1 && res2.perStore.customers.skipped === true);
    const res3 = await runRecordMigrations({ migrations: steps(), db, backup: bk, cache, force: true });
    await t.test('5. force يتجاوز «مفحوص» لكنه idempotent (0 مُرحَّل ولا نسخة)', res3.migrated === 0 && res3.scanned === 3 && bk.calls.length === 1);
  }

  /* 2) سجلات حديثة/أحدث لا تُلمس */
  {
    const db = fakeDb({ customers: [{ id: 'old', createdAt: 1, updatedAt: 2 }, { id: 'cur', _v: 3, createdAt: 1, updatedAt: 2 }, { id: 'future', _v: 9, x: 1, createdAt: 1, updatedAt: 2 }] });
    const res = await runRecordMigrations({ migrations: steps(), db, backup: okBackup(), cache: memCache() });
    await t.test('6. تُكتب القديمة فقط؛ الحالية والأحدث (من تطبيق أحدث) لا تُلمس',
      res.migrated === 1 && db.log.writes[0].ids.join() === 'old' && db.stores.customers[2]._v === 9 && db.stores.customers[2].x === 1);
  }

  /* 3) لا شيء قديم = لا نسخة احتياطية ولا كتابة */
  {
    const db = fakeDb({ customers: [{ id: 'a', _v: 3 }] }); const bk = okBackup(); const cache = memCache();
    const res = await runRecordMigrations({ migrations: steps(), db, backup: bk, cache });
    await t.test('7. لا سجل قديم: لا نسخة احتياطية ولا كتابة، وتُسجَّل نسخة الفحص',
      res.ok && bk.calls.length === 0 && db.log.writes.length === 0 && cache.peek().customers === 3);
  }

  /* 4) فشل النسخة الاحتياطية = لا ترحيل */
  {
    const db = fakeDb({ customers: mk(2) });
    const res = await runRecordMigrations({ migrations: steps(), db, backup: async () => ({ ok: false, error: 'quota' }), cache: memCache() });
    await t.test('8. فشل نسخة الأمان يوقف الترحيل بلا أي كتابة',
      res.ok === false && res.aborted === true && db.log.writes.length === 0 && /نسخة أمان/.test(res.error) && !('_v' in db.stores.customers[0]));
    const res2 = await runRecordMigrations({ migrations: steps(), db, backup: async () => { throw new Error('boom'); }, cache: memCache() });
    await t.test('9. استثناء من النسخة الاحتياطية يُعامل كفشل (لا ينتشر)', res2.aborted === true && db.log.writes.length === 0);
  }

  /* 5) فشل ترحيل سجل واحد: لا يُكتب نصف مرحَّل، والباقي يُرحَّل، ولا يُعلَّم المخزن مفحوصاً */
  {
    let poison = true;
    const migs = { customers: [{ to: 2, up(r) { if (r.id === 'r1' && poison) throw new Error('bad shape'); r.ok = true; return r; } }] };
    const db = fakeDb({ customers: mk(3) }); const cache = memCache();
    const res = await runRecordMigrations({ migrations: migs, db, backup: okBackup(), cache });
    const r1 = db.stores.customers[1];
    await t.test('10. فشل سجل واحد: يبقى كما هو بلا نصف ترحيل، والآخران يُرحَّلان، والنتيجة ok=false',
      res.ok === false && res.migrated === 2 && res.failed === 1 && !('ok' in r1) && !('_v' in r1) && db.stores.customers[0]._v === 2);
    await t.test('11. المخزن غير معلَّم «مفحوصاً» فيُعاد المحاولة', cache.peek().customers === undefined);
    poison = false;
    const res2 = await runRecordMigrations({ migrations: migs, db, backup: okBackup(), cache });
    await t.test('12. بعد زوال السبب: يُرحَّل المتبقي فقط ثم يُعلَّم مفحوصاً',
      res2.ok && res2.migrated === 1 && db.log.writes[1].ids.join() === 'r1' && cache.peek().customers === 2);
  }

  /* 6) up يُرجع غير كائن / يعدّل id */
  {
    const migs = { customers: [{ to: 2, up(r) { if (r.id === 'r0') return 42; r.id = 'HACK'; r.createdAt = 999; r.updatedAt = 999; return r; } }] };
    const db = fakeDb({ customers: mk(2) });
    const res = await runRecordMigrations({ migrations: migs, db, backup: okBackup(), cache: memCache() });
    const r1 = db.stores.customers.find((x) => x.name === 'n1');
    await t.test('13. إرجاع غير كائن = فشل السجل؛ وتغيير id/createdAt/updatedAt داخل up يُلغى',
      res.failed === 1 && res.migrated === 1 && r1.id === 'r1' && r1.createdAt === 1 && r1.updatedAt === 2);
  }

  /* 7) سجل ترحيلات غير صالح */
  {
    const bad = { customers: [{ to: 3, up() {} }] };
    const bad2 = { customers: [{ to: 2, up() {} }, { to: 2, up() {} }] };
    const bad3 = { customers: [{ to: 2 }] };
    const db = fakeDb({ customers: mk(2) });
    const r = await runRecordMigrations({ migrations: bad, db, backup: okBackup(), cache: memCache() });
    await t.test('14. فجوة في الأرقام / تكرار / بلا up: يوقف كل شيء بلا كتابة',
      r.aborted && db.log.writes.length === 0 && db.log.reads.length === 0
      && validateMigrations(bad2).length > 0 && validateMigrations(bad3).length > 0 && validateMigrations(null).length > 0);
  }

  /* 8) فشل الكتابة */
  {
    const db = fakeDb({ customers: mk(2) }, { failWrite: true }); const cache = memCache();
    const res = await runRecordMigrations({ migrations: steps(), db, backup: okBackup(), cache });
    await t.test('15. فشل الكتابة: ok=false ولا يُعلَّم مفحوصاً ولا يُرمى', res.ok === false && res.failed === 2 && cache.peek().customers === undefined);
  }

  /* 9) only */
  {
    const migs = { customers: steps().customers, orders: [{ to: 2, up(r) { r.o = 1; } }] };
    const db = fakeDb({ customers: mk(1), orders: mk(1) });
    await runRecordMigrations({ migrations: migs, db, backup: okBackup(), cache: memCache(), only: ['orders'] });
    await t.test('16. only يحصر الفحص بمخازن محددة', db.stores.orders[0]._v === 2 && !('_v' in db.stores.customers[0]) && db.log.reads.join() === 'orders');
  }

  /* 10) migrateRecord نقية */
  {
    const rec = { id: 'z', createdAt: 1, updatedAt: 2 };
    const r = migrateRecord('customers', rec, steps());
    await t.test('17. migrateRecord لا تُغيّر المُدخل ولا تكتب', r.changed && r.to === 3 && !('_v' in rec) && !('trail' in rec));
    await t.test('18. migrateRecord: سجل حديث = changed:false', migrateRecord('customers', { id: 'q', _v: 3 }, steps()).changed === false);
    await t.test('19. hasMigrationsFor', hasMigrationsFor(['customers'], steps()) && !hasMigrationsFor(['orders'], steps()) && !hasMigrationsFor([], steps()));
  }

  /* 11) خطّاف ما بعد الكتابة الدفعية */
  {
    const calls = []; let cb;
    const migs = steps();
    installBatchMigrationHook({ onBatchWrite: (f) => { cb = f; }, run: async (names) => { calls.push(names); }, delayMs: 5, migrations: migs });
    cb(['orders']); await sleep(60);
    const ignored = calls.length === 0;
    cb(['customers', 'orders']); cb(['customers']); cb(['customers']);
    await waitFor(() => calls.length >= 1); await sleep(40);   /* يمهل لأي تشغيل زائد خاطئ ليظهر */
    await t.test('20. الخطّاف: يتجاهل مخازن بلا ترحيل، ويدمج الإشعارات المتتالية في تشغيل واحد',
      ignored && calls.length === 1 && calls[0].join() === 'customers');
    const calls2 = [];
    installBatchMigrationHook({ onBatchWrite: (f) => { cb = f; }, run: async () => { calls2.push(1); throw new Error('x'); }, delayMs: 5, migrations: migs });
    cb(['customers']); await waitFor(() => calls2.length >= 1);
    cb(['customers']); await waitFor(() => calls2.length >= 2);
    await t.test('21. فشل التشغيل داخل الخطّاف لا يوقفه (يعمل لاحقاً)', calls2.length === 2);
  }
});

register('v3.3.65 idb.put stamping (IndexedDB حقيقي)', async (t) => {
  const made = [];
  try {
    const c = await customersRepo.create({ name: 't3365-stamp', phone: '01000000065' });
    made.push(c.id);
    const s0 = await idb.get('customers', c.id);
    await t.test('1. السجل الجديد في القاعدة: _v=1 بلا _ft/_fb', s0._v === 1 && !('_ft' in s0) && !('_fb' in s0));

    await sleep(5);
    await customersRepo.update(c.id, { name: 't3365-renamed' });
    const s1 = await idb.get('customers', c.id);
    await t.test('2. update لحقل واحد: _ft للاسم فقط، و_fb = updatedAt القديم',
      s1._ft && Number.isFinite(s1._ft.name) && !('phone' in s1._ft) && s1._fb === s0.updatedAt && s1.name === 't3365-renamed');

    await sleep(5);
    await customersRepo.update(c.id, { phone: '01000000066' });
    const s2 = await idb.get('customers', c.id);
    await t.test('3. تعديل حقل ثانٍ يراكم أزمنة الحقول', s2._ft.name === s1._ft.name && s2._ft.phone >= s1._ft.name && s2._fb === s1._fb);

    await sleep(5);
    await customersRepo.update(c.id, { phone: '01000000066' });
    const s3 = await idb.get('customers', c.id);
    await t.test('4. تحديث بالقيمة نفسها لا يغيّر زمن الحقل', s3._ft.phone === s2._ft.phone && s3._ft.name === s2._ft.name);

    await Promise.all([customersRepo.update(c.id, { note: 'a' }), customersRepo.update(c.id, { address: 'b' })]);
    const s4 = await idb.get('customers', c.id);
    await t.test('5. تعديلان متزامنان على حقلين: كلاهما يُسجَّل ولا يضيع أحدهما',
      s4.note === 'a' && s4.address === 'b' && Number.isFinite(s4._ft.note) && Number.isFinite(s4._ft.address));

    /* put مباشر (مسار غير المستودع) يُختم أيضاً */
    const cur = await idb.get('customers', c.id);
    await idb.put('customers', { ...cur, name: 't3365-direct', updatedAt: Date.now() });
    const s5 = await idb.get('customers', c.id);
    await t.test('6. idb.put المباشر يُختم أيضاً', s5._ft.name >= s4._ft.name && s5.name === 't3365-direct' && s5._v === 1);

    /* writeBatch لا يختم (سجلات جاهزة من السحابة/النسخة) */
    const bid = 't3365-batch-' + Date.now(); made.push(bid);
    await idb.writeBatch({ customers: { records: [{ id: bid, name: 'b', createdAt: 1, updatedAt: 2 }] } });
    const sb = await idb.get('customers', bid);
    await t.test('7. writeBatch لا يضيف _v/_ft (يحفظ السجل كما هو)', !('_v' in sb) && !('_ft' in sb));

    /* مخزن غير متزامن */
    const sid = 't3365-set';
    await idb.put('settings', { id: sid, key: sid, value: 1, updatedAt: Date.now() });
    const ss = await idb.get('settings', sid);
    await t.test('8. مخزن الإعدادات (غير متزامن) لا يُختم', ss && !('_v' in ss));
    await idb.remove('settings', sid);

    /* فشل مفتاح: put بلا id لا يكسر */
    let threw = false;
    try { await idb.put('customers', { name: 'no-id', updatedAt: 1 }); } catch (e) { threw = true; }
    await t.test('9. سجل بلا id يُرفض بخطأ واضح (لا تجميد ولا كتابة جزئية)', threw === true);

    /* ---- المشغّل على IndexedDB الحقيقي (سجلات legacy بلا _v) ---- */
    const qids = ['t3365-q1', 't3365-q2'];
    await idb.writeBatch({ quotes: { records: qids.map((id, i) => ({ id, label: 'q' + i, createdAt: 1, updatedAt: 7 })) } });
    let backed = 0;
    const migs = { quotes: [{ to: 2, up(r) { r.mig = (r.mig || 0) + 1; return r; } }] };
    const res = await runRecordMigrations({
      migrations: migs, backup: async () => { backed++; return { ok: true, id: 'fake' }; },
      cache: { get: () => ({}), set: () => {} }, only: ['quotes'],
    });
    const q1 = await idb.get('quotes', 't3365-q1');
    await t.test('10. مشغّل حقيقي على IndexedDB: يُرحَّل السجل ويُختم _v=2 مع بقاء updatedAt وباقي الحقول',
      res.ok && res.migrated >= 2 && backed === 1 && q1._v === 2 && q1.mig === 1 && q1.updatedAt === 7 && q1.label === 'q0');
    const again = await runRecordMigrations({ migrations: migs, backup: async () => { backed++; return { ok: true }; }, cache: { get: () => ({}), set: () => {} }, only: ['quotes'] });
    const q1b = await idb.get('quotes', 't3365-q1');
    await t.test('11. إعادة التشغيل على القاعدة الحقيقية: لا ترحيل ثانٍ ولا نسخة ثانية (idempotent)',
      again.ok && again.migrated === 0 && backed === 1 && q1b.mig === 1);
    for (const id of qids) await idb.remove('quotes', id);
  } finally {
    for (const id of made) { try { await idb.remove('customers', id); } catch (e) { /* ignore */ } }
  }
});
