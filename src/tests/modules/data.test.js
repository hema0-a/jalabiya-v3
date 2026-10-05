/* ==========================================================================
   data.test.js — اختبارات طبقة البيانات
   ==========================================================================
   22 اختباراً: schema(6) + idb(8) + repository(8)
   ========================================================================== */

import { register } from '../registry.js';
import { SCHEMA, validateSchema, SETTINGS_ID, STORE_NAMES } from '../../data/schema.js';
import * as idb from '../../data/idb.js';
import { createRepository } from '../../data/repository.js';
import { LIMITS } from '../../core/config.js';

/* ===== schema.js (6) ===== */
register('schema.js', async (t) => {
  const schemaKeys = Object.keys(SCHEMA);
await t.test('1. SCHEMA has 11 stores', schemaKeys.length === 11);

  let validOk = true;
  try { validateSchema(); }
  catch (e) { validOk = false; t.log('    err: ' + e.message); }
  await t.test('2. validateSchema passes', validOk);

  let keyPathsOk = true;
  Object.values(SCHEMA).forEach((store) => {
    if (store.keyPath !== 'id' || store.autoIncrement !== false) {
      keyPathsOk = false;
    }
  });
  await t.test('3. keyPath=id + autoIncrement=false', keyPathsOk);

  let indexesOk = true;
  Object.values(SCHEMA).forEach((store) => {
    if (!Array.isArray(store.indexes)) { indexesOk = false; return; }
    store.indexes.forEach((i) => {
      if (!i.name || !i.keyPath || typeof i.unique !== 'boolean') {
        indexesOk = false;
      }
    });
  });
  await t.test('4. indexes have valid shape', indexesOk);

  let noDup = true;
  Object.values(SCHEMA).forEach((store) => {
    const names = store.indexes.map((i) => i.name);
    if (new Set(names).size !== names.length) noDup = false;
  });
  await t.test('5. no duplicate index names', noDup);

  const idsOk = SETTINGS_ID === 'main';
const namesOk = Array.isArray(STORE_NAMES) && STORE_NAMES.length === 11;
await t.test('6. SETTINGS_ID + STORE_NAMES correct', idsOk && namesOk);
});

/* ===== idb.js (8) ===== */
register('idb.js', async (t) => {
  await idb.clear('customers').catch(() => {});
  const db = await idb.openDB();
  await t.test('1. openDB returns DB', db && typeof db.name === 'string');

  await idb.put('customers', { id: 'test-1', name: 'أحمد', phone: '01012345678' });
  const got = await idb.get('customers', 'test-1');
  await t.test('2. put + get round-trip', got && got.name === 'أحمد');

  const all = await idb.getAll('customers');
  await t.test('3. getAll returns array', Array.isArray(all) && all.length === 1);

  const cnt = await idb.count('customers');
  await t.test('4. count === 1', cnt === 1);

  await idb.put('customers', { id: 'test-2', name: 'محمد', phone: '01111111111' });
  const byPhone = await idb.getByIndex('customers', 'by_phone', '01111111111');
  await t.test('5. getByIndex finds by phone',
    Array.isArray(byPhone) && byPhone.length === 1 && byPhone[0].name === 'محمد');

  await idb.remove('customers', 'test-1');
  const afterRemove = await idb.get('customers', 'test-1');
  await t.test('6. remove deletes record', afterRemove === undefined);

  await idb.clear('customers');
  const afterClear = await idb.count('customers');
  await t.test('7. clear empties store', afterClear === 0);

  const nothing = await idb.get('customers', 'no-such-id');
  await t.test('8. get missing → undefined', nothing === undefined);
});

/* ===== repository.js (8) ===== */
register('repository.js', async (t) => {
  const r = createRepository('customers');
  await r.clear();

  const r1 = await r.create({ name: 'أحمد', phone: '01012345678' });
  await t.test('1. create returns record with id',
    r1 && typeof r1.id === 'string' && r1.id.length > 0);

  await t.test('2. create sets timestamps',
    typeof r1.createdAt === 'number' && typeof r1.updatedAt === 'number');

  const r2 = await r.create({ name: 'محمد' });
  await t.test('3. unique ids', r1.id !== r2.id);

  const found = await r.find(r1.id);
  await t.test('4. find returns created', found && found.name === 'أحمد');

  const all = await r.list();
  await t.test('5. list returns all', Array.isArray(all) && all.length === 2);

  const beforeUpdatedAt = r1.updatedAt;
  await new Promise((res) => setTimeout(res, 10));
  const updated = await r.update(r1.id, { name: 'أحمد علي' });
  await t.test('6. update merges + bumps updatedAt',
    updated && updated.name === 'أحمد علي' && updated.updatedAt > beforeUpdatedAt);

  const nullUpdate = await r.update('no-such-id', { name: 'x' });
  await t.test('7. update non-existent → null', nullUpdate === null);

  await r.remove(r1.id);
  const afterRemove = await r.find(r1.id);
  await t.test('8. remove works', afterRemove === undefined);

  await r.clear();
});
