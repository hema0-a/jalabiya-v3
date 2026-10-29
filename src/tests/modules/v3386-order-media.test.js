/* ==========================================================================
   v3386-order-media.test.js — فصل وسائط الطلبات، المرحلة 1: المخزن والمستودع والقراءة المزدوجة (v3.3.86)
   بلا تغيير سلوك: لا شيء في التطبيق يكتب في orderMedia بعد (الكتابة محروسة حتى v3.3.87).
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { DB_CONFIG, STORES } from '../../core/config.js';
import { SCHEMA, validateSchema } from '../../data/schema.js';
import { RECORD_STORES } from '../../data/record-meta.js';
import { SYNC_STORES, apply as applySnapshot } from '../../sync/firestore-sync.js';
import { createBackup, getBackup, deleteBackup, restoreBackup } from '../../services/auto-backup.js';
import { MIN_CLIENT_BUILD } from '../../sync/min-version.js';
import { orderMedia, getOrderMedia, _setWriteGateForTest } from '../../data/repos/order-media.js';
import { trash } from '../../data/repos/trash.js';
import { scanIntegrity, ISSUE_LABELS } from '../../services/data-integrity.js';
import { loadMediaScanInputs } from '../../services/order-media-scan.js';
import {
  MEDIA_MIN_BUILD, mediaId, parseMediaId, isValidSlot, deliverySlot, inlineMediaOf, inlineValue, findOrphanMedia, mediaWritesAllowed,
} from '../../services/order-media.js';
import { runProbe, projectGrowth, formatReport } from '../../services/perf-probe.js';

const throwsAsync = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const IMG = 'data:image/jpeg;base64,/9j/AAAA';
const SIG = 'data:image/png;base64,iVBORw0K';

async function resetAll() {
  for (const s of ['orders', 'orderMedia', 'trash']) await idb.clear(s);
  _setWriteGateForTest(null);
}

register('v3.3.86 order-media — المنطق النقي', async (t) => {
  const id = mediaId('abc123', 'ref');
  await t.test('1. mediaId/parseMediaId ذهاباً وإياباً (ref وsig وdel-)',
    id === 'abc123:ref' && parseMediaId(id).orderId === 'abc123' && parseMediaId('x:sig').slot === 'sig' && parseMediaId('x:del-7').slot === 'del-7');
  await t.test('2. معرّفات غير صالحة: طلب بنقطتين/فارغ، مسافة خاطئة ⟵ خطأ؛ والتفكيك يُرجع null',
    (() => { let n = 0; for (const f of [() => mediaId('a:b', 'ref'), () => mediaId('', 'ref'), () => mediaId('a', 'bad'), () => mediaId(null, 'sig')]) { try { f(); } catch (e) { n++; } } return n === 4; })()
    && parseMediaId('nocolon') === null && parseMediaId(':ref') === null && parseMediaId('a:bad') === null && parseMediaId(5) === null);
  await t.test('3. isValidSlot وdeliverySlot (تُنظَّف النقطتان)', isValidSlot('ref') && isValidSlot('sig') && isValidSlot('del-3') && !isValidSlot('del-') && !isValidSlot('x') && !isValidSlot('del-a:b') && deliverySlot('a:b') === 'del-a_b');
  const o = { id: 'o1', referenceImage: IMG, signature: '', deliveries: [{ id: 'd9', signature: SIG }, { signature: SIG }, { signature: '' }, null] };
  const m = inlineMediaOf(o);
  await t.test('4. inlineMediaOf: الصورة والتوقيعات (بمعرّف التسليم أو الترتيب) وتُهمل الفارغة وغير الصالحة',
    Object.keys(m).sort().join() === 'del-1,del-d9,ref' && m.ref === IMG && inlineValue(o, 'sig') === '' && Object.keys(inlineMediaOf(null)).length === 0 && Object.keys(inlineMediaOf({ referenceImage: 5 })).length === 0);
  const f = findOrphanMedia(['live:ref', 'live:sig', 'gone:ref', 'trashed:ref', 'weird', 'x:nope'], ['live'], ['trashed']);
  await t.test('5. findOrphanMedia: اليتيم = لا طلب حيّ ولا في السلة؛ والمعرّف الفاسد منفصل؛ العدّ لكل طلب',
    f.orphans.join() === 'gone:ref' && f.invalid.join() === 'weird,x:nope' && f.byOrder.get('live') === 2);
  await t.test('6. حارس الكتابة: ممنوعة قبل رفع الحد (3003086) ومسموحة بعده', MEDIA_MIN_BUILD === 3003086 && !mediaWritesAllowed(3003085) && mediaWritesAllowed(3003086) && mediaWritesAllowed(4000000));
  await t.test('7. (3.3.87) رُفع الحد الأدنى للمزامنة فصار كافياً لكتابة الوسائط', MIN_CLIENT_BUILD >= MEDIA_MIN_BUILD && mediaWritesAllowed(MIN_CLIENT_BUILD));

  const s0 = scanIntegrity({ orders: [{ id: 'live' }], orderMediaKeys: ['live:ref', 'gone:sig', 'bad'], trashOrderIds: [] });
  const s1 = scanIntegrity({ orders: [{ id: 'live' }], orderMediaKeys: ['gone:sig'], trashOrderIds: ['gone'] });
  const s2 = scanIntegrity({ orders: [{ id: 'live' }] });
  await t.test('8. scanIntegrity: وسيط يتيم وسجل فاسد يُبلَّغان (بلا إصلاح تلقائي)؛ طلب في السلة ليس يتيماً؛ بلا مفاتيح ⟵ لا فحص',
    s0.counts.media_orphan === 1 && s0.counts.media_bad_key === 1 && s0.issues.every((i) => !i.fix) && !s1.counts.media_orphan && s2.total === 0
    && !!ISSUE_LABELS.media_orphan && !!ISSUE_LABELS.media_bad_key);
});

register('v3.3.86 order-media — المخزن (قاعدة فعلية) والترحيل 11→12', async (t) => {
  const db = await idb.openDB();
  await t.test('1. الإصدار الحالي 12 والمخزن والفهرس by_orderId موجودان والمخطط سليم',
    DB_CONFIG.version >= 12 && STORES.ORDER_MEDIA === 'orderMedia' && db.version === DB_CONFIG.version && db.objectStoreNames.contains('orderMedia')
    && [...db.transaction('orderMedia').objectStore('orderMedia').indexNames].join() === 'by_orderId'
    && SCHEMA.orderMedia.keyPath === 'id' && validateSchema() === true);
  await t.test('2. المخزن ضمن المزامنة وسجلات الختم ومتطابقان', SYNC_STORES.includes('orderMedia') && RECORD_STORES.includes('orderMedia') && [...SYNC_STORES].sort().join() === [...RECORD_STORES].sort().join());

  /* ترحيل حقيقي 11 → 12 على قاعدة منفصلة تحوي بيانات (حالة جهازك الآن: قاعدة v11) */
  const testName = 'jalabiya_v3_migtest12_' + Date.now();
  const origName = DB_CONFIG.name;
  let migOk = false; let kept = false; let hasStore = false; let hasIdx = false; let ver = 0; let ledgerKept = false;
  try {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(testName, 11);
      req.onupgradeneeded = () => {
        const d = req.result;
        Object.entries(SCHEMA).forEach(([name, cfg]) => {
          if (name === 'orderMedia') return;
          const s = d.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: cfg.autoIncrement });
          cfg.indexes.forEach((i) => s.createIndex(i.name, i.keyPath, { unique: i.unique }));
        });
      };
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction(['orders', 'ledger'], 'readwrite');
        tx.objectStore('orders').put({ id: 'mig-o1', customerId: 'c1', amount: 100, referenceImage: IMG });
        tx.objectStore('ledger').put({ id: 'mig-l1', v: 1, unit: 'wallet', acct: 'c1', delta: 100, at: 1, dev: 'd', seq: 0 });
        tx.oncomplete = () => { d.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    idb.closeDB();
    DB_CONFIG.name = testName;
    const d2 = await idb.openDB();
    ver = d2.version;
    hasStore = d2.objectStoreNames.contains('orderMedia');
    hasIdx = hasStore && d2.transaction('orderMedia').objectStore('orderMedia').indexNames.contains('by_orderId');
    const rec = await idb.get('orders', 'mig-o1');
    kept = !!rec && rec.referenceImage === IMG && rec.amount === 100;
    ledgerKept = !!(await idb.get('ledger', 'mig-l1'));
    migOk = true;
  } catch (e) { console.warn('[test migration 12]', e); }
  finally {
    idb.closeDB();
    DB_CONFIG.name = origName;
    await new Promise((r) => { const q = indexedDB.deleteDatabase(testName); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    await idb.openDB();
  }
  await t.test('3. ترحيل 11→12: ينجح ويُنشئ المخزن والفهرس ويُبقي الطلبات (بصورها) والدفتر كاملة', migOk && ver === DB_CONFIG.version && hasStore && hasIdx && kept && ledgerKept);
});

register('v3.3.86 order-media — المستودع والقراءة المزدوجة', async (t) => {
  await resetAll();
  _setWriteGateForTest(() => false);
  const e = await throwsAsync(() => orderMedia.put('o1', 'ref', IMG));
  await t.test('1. الحارس يعمل: عند إغلاقه ⟵ media-writes-disabled ولا يُكتب شيء (والافتراضي مفتوح منذ 3.3.87)', !!e && e.code === 'media-writes-disabled' && (await orderMedia.count()) === 0 && mediaWritesAllowed(MIN_CLIENT_BUILD));

  _setWriteGateForTest(() => true);
  try {
    const r1 = await orderMedia.put('o1', 'ref', IMG);
    await t.test('2. put: المعرّف orderId:slot ويحفظ orderId/slot/bytes وبصمات الوقت', r1.id === 'o1:ref' && r1.orderId === 'o1' && r1.slot === 'ref' && r1.bytes === IMG.length && r1.createdAt > 0 && r1.updatedAt >= r1.createdAt);
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await orderMedia.put('o1', 'ref', IMG + 'X');
    await t.test('3. تحديث نفس الوسيط يُبقي createdAt ويُحدّث البيانات وupdatedAt', r2.createdAt === r1.createdAt && r2.updatedAt > r1.updatedAt && (await orderMedia.find('o1', 'ref')).data === IMG + 'X' && (await orderMedia.count()) === 1);
    await orderMedia.put('o1', 'sig', SIG); await orderMedia.put('o2', 'ref', IMG);
    const list = await orderMedia.listByOrder('o1');
    const keys = (await orderMedia.keys()).slice().sort();
    await t.test('4. listByOrder بالفهرس (وسائط الطلب فقط) وkeys بلا قراءة صور', list.map((x) => x.slot).sort().join() === 'ref,sig' && keys.join() === 'o1:ref,o1:sig,o2:ref');
    await t.test('5. مدخلات فاسدة: بيانات فارغة/مسافة خاطئة/معرّف بنقطتين ⟵ خطأ بلا كتابة',
      !!(await throwsAsync(() => orderMedia.put('o1', 'sig', ''))) && !!(await throwsAsync(() => orderMedia.put('o1', 'zzz', IMG))) && !!(await throwsAsync(() => orderMedia.put('a:b', 'ref', IMG))) && (await orderMedia.count()) === 3);

    const live = { id: 'o1', referenceImage: 'INLINE', signature: '' };
    await t.test('6. القراءة المزدوجة: المضمَّن أولاً، ثم المخزن، وإلا فارغ',
      (await getOrderMedia(live, 'ref')) === 'INLINE' && (await getOrderMedia(live, 'sig')) === SIG && (await getOrderMedia(live, 'del-1')) === '' && (await getOrderMedia({ id: 'none' }, 'ref')) === '');
    await t.test('7. القراءة المزدوجة آمنة: طلب/مسافة غير صالحة ⟵ فارغ بلا رمي', (await getOrderMedia(null, 'ref')) === '' && (await getOrderMedia({ id: 'o1' }, 'bad')) === '' && (await getOrderMedia({}, 'ref')) === '');

    await orderMedia.remove('o2', 'ref');
    const n = await orderMedia.removeByOrder('o1');
    await t.test('8. remove وremoveByOrder يحذفان بدقة (ولا يمسّان طلباً آخر)', n === 2 && (await orderMedia.count()) === 0 && (await orderMedia.removeByOrder('')) === 0);

    /* ---------- السلة: الوسائط تُحذف مع الحذف النهائي لا قبله ---------- */
    const trashOrder = async (id) => { await orderMedia.put(id, 'ref', IMG); return trash.addToTrash('orders', { id, customerId: 'c1', amount: 1 }); };
    const t1 = await trashOrder('t1');
    await t.test('9. طلب في السلة: وسائطه باقية (قد يُسترجع) وليست يتيمة في الفحص', (await orderMedia.count()) === 1
      && scanIntegrity({ orders: [], ...(await loadMediaScanInputs()) }).counts.media_orphan === undefined);
    await trash.restore(t1.id);
    await t.test('10. استرجاع الطلب من السلة: يعود الطلب ووسائطه باقية', !!(await idb.get('orders', 't1')) && (await orderMedia.count()) === 1);
    await idb.remove('orders', 't1'); await orderMedia.removeByOrder('t1');

    const t2 = await trashOrder('t2');
    await trash.removeForever(t2.id);
    await t.test('11. الحذف النهائي لطلب من السلة يحذف وسائطه', (await orderMedia.count()) === 0 && (await trash.find(t2.id)) === undefined);

    await idb.put('orders', { id: 't3', customerId: 'c1', amount: 1 });
    const t3 = await trashOrder('t3');
    await trash.removeForever(t3.id);
    await t.test('12. إن وُجد طلب حيّ بالمعرّف نفسه لا تُحذف وسائطه', (await orderMedia.count()) === 1);
    await idb.remove('orders', 't3'); await orderMedia.removeByOrder('t3');

    const a = await trashOrder('t4'); const b = await trashOrder('t5');
    const cust = await trash.addToTrash('customers', { id: 'cx', name: 'عميل' });
    const cleared = await trash.clearAllForever();
    await t.test('13. تفريغ السلة نهائياً يحذف وسائط كل طلباتها ويفرّغها', cleared === 3 && (await orderMedia.count()) === 0 && (await trash.list()).length === 0 && !!a && !!b && !!cust);

    const t6 = await trashOrder('t6');
    await idb.put('trash', { ...t6, deletedAt: 1 });
    const purged = await trash.purgeExpired(7);
    await t.test('14. التنظيف التلقائي للمنتهي يحذف وسائط طلبه', purged >= 1 && (await orderMedia.count()) === 0);

    /* ---------- النسخ الاحتياطي ---------- */
    await orderMedia.put('b1', 'ref', IMG);
    const cb = await createBackup({ label: '2-اختبار-3386' });
    const bk = cb.ok ? await getBackup(cb.id) : null;
    await t.test('15. النسخة الاحتياطية تشمل مخزن orderMedia', !!bk && Array.isArray(bk.stores.orderMedia) && bk.stores.orderMedia.length === 1);
    await idb.clear('orderMedia');
    const rs = cb.ok ? await restoreBackup(cb.id) : { ok: false };
    await t.test('16. الاستعادة تُرجع الوسائط', rs.ok === true && (await orderMedia.find('b1', 'ref')) && (await orderMedia.find('b1', 'ref')).data === IMG);
    if (cb.ok) await deleteBackup(cb.id);
    for (const x of await idb.getAll('backups')) if (/قبل الاستعادة|2-اختبار-3386/.test(String(x.label || ''))) await idb.remove('backups', x.id);

    /* ---------- المزامنة ---------- */
    await idb.clear('orderMedia');
    const cloudRec = { id: 'c9:ref', orderId: 'c9', slot: 'ref', data: IMG, bytes: IMG.length, createdAt: 5, updatedAt: 5 };
    const ap = await applySnapshot({ stores: { orderMedia: [cloudRec] }, updatedAt: 1 }, { mode: 'merge' });
    await t.test('17. المزامنة (دمج) تُنزِّل وسائط السحابة إلى المخزن', ap.ok === true && (await orderMedia.find('c9', 'ref')) && (await orderMedia.find('c9', 'ref')).data === IMG);
  } finally {
    await resetAll();
  }
});

register('v3.3.86 perf-probe — تقدير النمو لا يضلّل + مخزن الوسائط', async (t) => {
  const mk = (data) => {
    let clock = 0;
    return {
      now: () => clock,
      getAll: async (s) => { clock += 5; return data[s] || []; },
      readBatch: async (s, after, n) => { const all = data[s] || []; const st = after == null ? 0 : after + 1; const recs = all.slice(st, st + n); return { records: recs, lastKey: st + recs.length - 1, done: st + recs.length >= all.length }; },
      yieldFn: async () => {}, openDB: async () => {}, storageEstimate: async () => null,
      storeNames: () => Object.values(STORES), env: () => ({ ua: 'T' }),
    };
  };
  const small = await runProbe({ deps: mk({ orders: [{ id: 'a', referenceImage: '', signature: 's'.repeat(10) }, { id: 'b' }] }) });
  const g0 = projectGrowth(small);
  const txt0 = formatReport(small);
  await t.test('1. بيانات قليلة ⟵ لا أرقام زمنية مضلِّلة (ms=null، المصدر none) والأحجام فقط مع تنبيه صريح',
    g0.source === 'none' && g0.reliable === false && g0.throughputMBs === null && g0.rows.length === 3 && g0.rows.every((r) => r.fullMs === null && r.slimMs === null)
    && /لا يُقدَّر/.test(txt0) && !/≈ \d+ ms/.test(txt0.split('تقدير النمو')[1] || ''));
  const synth = { rows: [{ orders: 100, mediaKB: 250, fullBytes: 25_600_000, full: { first: 300, median: 300 }, slim: { first: 4, median: 4 } }, { orders: 300, mediaKB: 250, fullBytes: 76_800_000, full: { first: 900, median: 900 }, slim: { first: 9, median: 9 } }], skipped: '' };
  const g1 = projectGrowth(small, [100, 1000], synth);
  await t.test('2. مع الاختبار التخيّلي ⟵ يُستعمل معدله (≈ 81 MB/s) وتظهر الأزمنة والمصدر',
    g1.source === 'synthetic' && g1.reliable && g1.throughputMBs > 70 && g1.throughputMBs < 90 && g1.rows.every((r) => r.fullMs !== null) && /من الاختبار التخيّلي/.test(formatReport(small, synth)));
  const big = Array.from({ length: 30 }, (_, i) => ({ id: 'o' + i, referenceImage: 'x'.repeat(200_000) }));
  const withSep = await runProbe({ deps: mk({ orders: [{ id: 'z' }], orderMedia: [{ id: 'z:ref', orderId: 'z', slot: 'ref', data: 'y'.repeat(300_000) }] }) });
  const sepRow = withSep.stores.find((r) => r.store === 'orderMedia');
  await t.test('3. مخزن orderMedia يُحسب كله وسائط، ويظهر «مفصولة» في الخلاصة بلا حكم «مضمَّنة» عند الصغر',
    sepRow.mediaBytes === sepRow.bytes && sepRow.bytes > 300_000 && withSep.orders.separatedBytes === sepRow.bytes && /مفصولة/.test(formatReport(withSep)) && big.length === 30);
  const m = await runProbe({ deps: mk({ orders: big }) });
  await t.test('4. وسائط كبيرة مضمَّنة ⟵ الخلاصة تنصح بالفصل (فوق 1MB فقط)', /فصلها عن سجل الطلب/.test(formatReport(m)) && !/فصلها عن سجل الطلب/.test(formatReport(small)));
});
