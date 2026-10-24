/* ==========================================================================
   v341-media-migration.test.js — ترحيل الوسائط القديمة المضمَّنة (v3.4.1)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';
import { _setWriteGateForTest, getOrderMedia } from '../../data/repos/order-media.js';
import { mediaId } from '../../services/order-media.js';
import { computePickups } from '../../services/pickup-reminders.js';
import {
  REASON, planOrderMigration, pinDerivedDates, buildMigrationWrite, verifyMigrated, evaluateMigrationReadiness,
  scanInlineMedia, migrateOrder, runMigration, startMigration, isMigrationRunning, _resetForTest,
} from '../../services/media-migration.js';

/* صورة PNG حقيقية 1×1 (تُفكّ فيُولَّد لها مصغّر) وتوقيع كبير بصيغة dataURL */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SIG = 'data:image/png;base64,' + 'QUJD'.repeat(3000);
const OLD = 1700000000000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
/* السجل كما خُزِّن فعلاً (idb قد يضيف حقولاً وصفية)، فهو خط الأساس للمقارنة لا الكائن المُدخَل */
const raw = async (id) => JSON.stringify(await idb.get(STORES.ORDERS, id));

async function seed(recs) { for (const r of recs) await idb.put(STORES.ORDERS, r); }
async function cleanup(ids) {
  for (const id of ids) {
    try { await idb.remove(STORES.ORDERS, id); } catch (e) { /* ignore */ }
    for (const slot of ['ref', 'sig', 'del-d1']) { try { await idb.remove(STORES.ORDER_MEDIA, mediaId(id, slot)); } catch (e) { /* ignore */ } }
  }
}
const order = (id, extra) => ({ id, customerId: 'cx341', status: 'pending', amount: 500, createdAt: OLD - 1000, updatedAt: OLD, items: [], ...extra });

register('v3.4.1 media migration: pure planning and building', async (t) => {
  const full = order('p1', { referenceImage: PNG, signature: SIG, deliveries: [{ id: 'd1', at: 1, items: [], signature: SIG }] });
  const frozen = clone(full);
  const plan = planOrderMigration(full);
  t.test('1. تخطيط ref + sig + توقيع تسليم = 3 مسافات بحجمها', plan.slots.map((s) => s.slot).sort().join() === 'del-d1,ref,sig' && plan.bytes === PNG.length + 2 * SIG.length);
  t.test('2. التخطيط لا يعدّل المدخل', JSON.stringify(full) === JSON.stringify(frozen));
  t.test('3. طلب بلا وسائط ⟵ لا مسافات ولا تخطي', (() => { const p = planOrderMigration(order('p2')); return p.slots.length === 0 && p.skipped.length === 0; })());
  t.test('4. قيمة ليست dataURL تُتخطّى ولا تُرحَّل', (() => { const p = planOrderMigration(order('p3', { signature: 'abc' })); return p.slots.length === 0 && p.skipped[0].reason === REASON.NOT_DATA_URL; })());
  t.test('5. توقيع تسليم بلا معرّف يُتخطّى', (() => { const p = planOrderMigration(order('p4', { deliveries: [{ at: 1, signature: SIG }] })); return p.slots.length === 0 && p.skipped[0].reason === REASON.DELIVERY_NO_ID; })());
  t.test('6. معرّف تسليم مكرّر: الأول يُرحَّل والثاني يُتخطّى', (() => { const p = planOrderMigration(order('p5', { deliveries: [{ id: 'd1', signature: SIG }, { id: 'd1', signature: SIG }] })); return p.slots.length === 1 && p.skipped[0].reason === REASON.DUPLICATE_SLOT; })());
  t.test('7. معرّف طلب فيه نقطتان: لا ترحيل', (() => { const p = planOrderMigration(order('a:b', { signature: SIG })); return p.slots.length === 0 && p.skipped[0].reason === REASON.BAD_ORDER_ID; })());
  t.test('8. مدخلات تالفة لا تُسقط', planOrderMigration(null).slots.length === 0 && planOrderMigration('x').slots.length === 0);

  t.test('9. تثبيت التواريخ: جاهز بلا readyAt ⟵ updatedAt', pinDerivedDates({ status: 'ready', updatedAt: 55, createdAt: 9 }).readyAt === 55);
  t.test('10. جاهز بلا updatedAt ⟵ createdAt', pinDerivedDates({ status: 'ready', createdAt: 9 }).readyAt === 9);
  t.test('11. مسلَّم بلا deliveredAt ⟵ updatedAt', pinDerivedDates({ status: 'delivered', updatedAt: 77 }).deliveredAt === 77);
  t.test('12. القيم الصريحة لا تُمسّ والمعلّق لا يُثبَّت', Object.keys(pinDerivedDates({ status: 'ready', readyAt: 5, updatedAt: 9 })).length === 0 && Object.keys(pinDerivedDates({ status: 'pending', updatedAt: 9 })).length === 0);

  const w = buildMigrationWrite(full, plan, { thumb: 'data:image/jpeg;base64,TT', now: OLD + 5000 });
  const r = w.record;
  t.test('13. السجل المبني: حقول مُفرَّغة وأعلام وbundle', w.ok && r.referenceImage === '' && r.hasReferenceImage === true && r.signature === '' && r.hasSignature === true && r.refThumb === 'data:image/jpeg;base64,TT');
  t.test('14. توقيع التسليمة أُفرغ وعُلِّم', r.deliveries[0].signature === '' && r.deliveries[0].hasSignature === true && r.deliveries[0].id === 'd1');
  t.test('15. updatedAt أحدث وmediaMigratedAt موجود وبقية الحقول كما هي', r.updatedAt > OLD && r.mediaMigratedAt === OLD + 5000 && r.amount === 500 && r.customerId === 'cx341' && r.status === 'pending');
  t.test('16. سجلات الوسائط: المعرّف والحجم والبيانات', w.mediaRecords.length === 3 && w.mediaRecords.every((m) => m.id === mediaId('p1', m.slot) && m.bytes === m.data.length && m.orderId === 'p1'));
  t.test('17. freedBytes = مجموع المنقول', w.freedBytes === plan.bytes);

  const conflict = new Map([['ref', { data: 'data:image/png;base64,ZZZ', createdAt: 1 }]]);
  const wc = buildMigrationWrite(full, plan, { existingMedia: conflict });
  t.test('18. وسيط مخزَّن بقيمة مختلفة: لا يُكتب فوقه ويبقى مضمَّناً', wc.ok && !wc.moved.some((m) => m.slot === 'ref') && wc.record.referenceImage === PNG && wc.skipped.some((s) => s.reason === REASON.STORE_CONFLICT));
  const same = new Map([['ref', { data: PNG, createdAt: 123 }]]);
  t.test('19. وسيط مخزَّن بنفس القيمة: يُعاد كتابته ويحفظ createdAt', buildMigrationWrite(full, plan, { existingMedia: same }).mediaRecords.find((m) => m.slot === 'ref').createdAt === 123);
  t.test('20. كل المسافات متعارضة ⟵ ok=false بلا سجل', (() => { const p1 = planOrderMigration(order('p6', { signature: SIG })); return buildMigrationWrite(order('p6', { signature: SIG }), p1, { existingMedia: new Map([['sig', { data: 'x' }]]) }).ok === false; })());
  t.test('21. توقيعات التسليمات الأخرى (بلا مسافة منقولة) لا تُمسّ', (() => {
    const o = order('p7', { signature: SIG, deliveries: [{ id: 'd1', signature: SIG }, { id: 'd2', note: 'x' }] });
    const b = buildMigrationWrite(o, planOrderMigration(o), {});
    return b.record.deliveries[1].note === 'x' && b.record.deliveries[0].signature === '';
  })());

  const moved = w.moved;
  const stored = new Map(moved.map((m) => [m.slot, { data: m.data }]));
  t.test('22. تحقق: نتيجة سليمة', verifyMigrated(w.record, moved, stored).ok === true);
  t.test('23. تحقق: وسيط مختلف ⟵ فشل', verifyMigrated(w.record, moved, new Map([...stored, ['sig', { data: 'x' }]])).ok === false);
  t.test('24. تحقق: حقل لم يُفرَّغ ⟵ فشل', verifyMigrated({ ...w.record, signature: SIG }, moved, stored).ok === false && verifyMigrated(null, moved, stored).ok === false);
});

register('v3.4.1 media migration: readiness (pure)', async (t) => {
  const cleanSync = { usedCloud: true, dirtySince: null, blocked: null, conflicts: 0, queueSize: 0 };
  const ok = { writable: true, storeExists: true, sync: cleanSync, storage: { usage: 1e6, quota: 1e9 }, inlineBytes: 1e6, candidates: 3, running: false };
  const now = 1e12;
  const good = { ok: true, errors: [], createdAt: now - 1000, counts: { customers: 1, orders: 2, payments: 3, inventory: 4, ledger: 5 } };
  const live = { ...good.counts };
  const r0 = evaluateMigrationReadiness(ok, now);
  t.test('1. قبل النسخة: يمكن المحاولة لكن ليس «جاهزاً»', r0.canAttempt === true && r0.ready === false && r0.checks.some((c) => c.id === 'backup' && !c.ok));
  t.test('2. مع نسخة سليمة تطابق الحيّ: جاهز', evaluateMigrationReadiness({ ...ok, backup: good, live }, now).ready === true);
  t.test('3. حارس الكتابة مغلق ⟵ مانع', evaluateMigrationReadiness({ ...ok, writable: false }, now).canAttempt === false);
  t.test('4. مخزن الوسائط غائب ⟵ مانع', evaluateMigrationReadiness({ ...ok, storeExists: false }, now).canAttempt === false);
  t.test('5. تغييرات لم تُرفع ⟵ مانع', evaluateMigrationReadiness({ ...ok, sync: { ...cleanSync, dirtySince: now } }, now).canAttempt === false);
  t.test('6. تعارضات مزامنة/طابور معلّق ⟵ مانع', evaluateMigrationReadiness({ ...ok, sync: { ...cleanSync, conflicts: 2 } }, now).canAttempt === false && evaluateMigrationReadiness({ ...ok, sync: { ...cleanSync, queueSize: 1 } }, now).canAttempt === false);
  t.test('7. مساحة غير كافية ⟵ مانع', evaluateMigrationReadiness({ ...ok, storage: { usage: 9.9e8, quota: 1e9 }, inlineBytes: 5e7 }, now).canAttempt === false);
  t.test('8. تعذّر تقدير المساحة لا يمنع', evaluateMigrationReadiness({ ...ok, storage: null }, now).canAttempt === true);
  t.test('9. بلا مرشّحين ⟵ لا شيء للترحيل', (() => { const r = evaluateMigrationReadiness({ ...ok, candidates: 0, backup: good, live }, now); return !r.ready && !r.canAttempt && r.reason.includes('لا توجد'); })());
  t.test('10. ترحيل يعمل ⟵ مانع', evaluateMigrationReadiness({ ...ok, running: true }, now).canAttempt === false);
  t.test('11. نسخة قديمة/غير مطابقة ⟵ ليس جاهزاً', evaluateMigrationReadiness({ ...ok, backup: { ...good, createdAt: now - 3600000 }, live }, now).ready === false && evaluateMigrationReadiness({ ...ok, backup: good, live: { ...live, orders: 9 } }, now).ready === false);
});

register('v3.4.1 media migration: real DB migration', async (t) => {
  _resetForTest(); _setWriteGateForTest(null);
  const A = order('t341a', { status: 'delivered', referenceImage: PNG, signature: SIG, deliveries: [{ id: 'd1', at: 1, items: [], signature: SIG }], note: 'A' });
  const B = order('t341b', { status: 'ready', referenceImage: PNG, note: 'B' });
  const C = order('t341c', { hasReferenceImage: true, refThumb: 'data:image/jpeg;base64,TT', note: 'C' });
  const D = order('t341d', { signature: 'abc', note: 'D' });
  const ids = [A.id, B.id, C.id, D.id];
  await cleanup(ids);
  await idb.put(STORES.ORDER_MEDIA, { id: mediaId('t341c', 'ref'), orderId: 't341c', slot: 'ref', data: PNG, bytes: PNG.length, createdAt: 1, updatedAt: 1 });
  await seed([A, B, C, D]);
  const base = {}; for (const id of ids) base[id] = await raw(id);
  try {
    const scan = await scanInlineMedia({ batchSize: 2 });
    const mine = scan.candidates.filter((c) => ids.includes(c.id));
    t.test('1. المسح يجد المرشّحين (A وB) فقط ويعدّ المتروك (D)', mine.map((c) => c.id).sort().join() === 't341a,t341b' && (scan.byReason[REASON.NOT_DATA_URL] || 0) >= 1);
    t.test('2. المسح لا يحمل نصوص الصور (بيانات وصفية فقط)', mine.every((c) => !('data' in c) && c.slots.every((s) => typeof s === 'string')));
    t.test('3. المسح للقراءة فقط: السجلات كما هي', (await raw('t341a')) === base.t341a);

    const nowT = OLD + 10 * 86400000;
    const ageBefore = computePickups([B], [], [{ id: 'cx341', name: 'x' }], nowT).items[0].ageDays;

    const sum = await runMigration(ids);
    t.test('4. الملخص: 2 رُحِّلا، والباقي متروك، بلا إخفاق', sum.migrated === 2 && sum.failed === 0 && sum.raced === 0 && sum.skipped === 2 && sum.freedBytes > 0);

    const a = await idb.get(STORES.ORDERS, 't341a'); const b = await idb.get(STORES.ORDERS, 't341b');
    t.test('5. A: الحقول المضمَّنة أُفرغت والأعلام صحيحة', a.referenceImage === '' && a.hasReferenceImage === true && a.signature === '' && a.hasSignature === true && a.deliveries[0].signature === '' && a.deliveries[0].hasSignature === true);
    t.test('6. القراءة المزدوجة تعيد الأصل حرفاً بحرف (ref وsig وتوقيع التسليمة)',
      (await getOrderMedia(a, 'ref')) === PNG && (await getOrderMedia(a, 'sig')) === SIG && (await getOrderMedia(a, 'del-d1')) === SIG);
    t.test('7. مصغّر القائمة وُلِّد من الصورة', typeof a.refThumb === 'string' && a.refThumb.startsWith('data:image/jpeg') && sum.thumbFailed === 0);
    t.test('8. السجل صار خفيفاً (أقل من 5KB)', JSON.stringify(a).length < 5000 && JSON.stringify(b).length < 5000);
    t.test('9. بقية حقول الطلب لم تتغيّر', a.note === 'A' && a.amount === 500 && a.customerId === 'cx341' && a.status === 'delivered' && a.createdAt === A.createdAt);
    t.test('10. التواريخ المشتقة مثبّتة: deliveredAt وreadyAt = updatedAt القديم', a.deliveredAt === OLD && b.readyAt === OLD && a.updatedAt > OLD && a.mediaMigratedAt > 0);
    t.test('11. عمر «جاهز للاستلام» لم يتغيّر بسبب الترحيل', computePickups([b], [], [{ id: 'cx341', name: 'x' }], nowT).items[0].ageDays === ageBefore);
    t.test('12. الطلب المفصول سلفاً لم يُمسّ', (await raw('t341c')) === base.t341c);
    t.test('13. الطلب بقيمة غير dataURL لم يُمسّ', (await raw('t341d')) === base.t341d);

    const again = await runMigration(ids);
    t.test('14. إعادة التشغيل: لا شيء يُرحَّل (idempotent) والسجلات ثابتة', again.migrated === 0 && (await raw('t341a')) === JSON.stringify(a));
  } finally { await cleanup(ids); }
});

register('v3.4.1 media migration: failure injection and safety', async (t) => {
  _resetForTest(); _setWriteGateForTest(null);
  const mk = (id, extra) => order(id, { referenceImage: PNG, signature: SIG, ...extra });
  const ids = ['t341f1', 't341f2', 't341f3', 't341f4', 't341f5', 't341f6'];
  await cleanup(ids);
  try {
    /* أ) فشل الكتابة (غير الحارس): لا مساس بالطلب ولا وسائط */
    const f1 = mk('t341f1'); await seed([f1]); const b1 = await raw('t341f1');
    const r1 = await migrateOrder('t341f1', { deps: { write: async () => { throw new Error('boom'); } } });
    t.test('1. فشل الكتابة ⟵ failed والطلب كما هو بلا وسائط', r1.status === 'failed' && (await raw('t341f1')) === b1 && !(await idb.get(STORES.ORDER_MEDIA, mediaId('t341f1', 'ref'))));

    /* ب) ذرّية المعاملة: حارس مختلف يُلغي الكل (لا وسائط ولا طلب) */
    let code = '';
    try {
      await idb.writeBatch({ [STORES.ORDER_MEDIA]: { records: [{ id: mediaId('t341f1', 'ref'), orderId: 't341f1', slot: 'ref', data: PNG, bytes: 1, createdAt: 1, updatedAt: 1 }] }, [STORES.ORDERS]: { records: [{ ...f1, referenceImage: '' }] } },
        { guards: { [STORES.ORDERS]: new Map([['t341f1', 12345]]) } });
    } catch (e) { code = e.code; }
    t.test('2. المعاملة الذرّية: حارس مخالف يُلغي كل شيء', code === 'guard-mismatch' && (await raw('t341f1')) === b1 && !(await idb.get(STORES.ORDER_MEDIA, mediaId('t341f1', 'ref'))));

    /* ج) سباق: قراءة قديمة أولاً ثم حديثة ⟵ تنجح بإعادة المحاولة */
    const f2 = mk('t341f2'); await seed([f2]);
    let calls = 0;
    const staleOnce = async (id) => { const r = await idb.get(STORES.ORDERS, id); calls += 1; return calls === 1 ? { ...r, updatedAt: (r.updatedAt || 0) - 5 } : r; };
    const r2 = await migrateOrder('t341f2', { deps: { readOrder: staleOnce } });
    t.test('3. سباق عابر: إعادة المحاولة بقراءة جديدة تنجح', r2.status === 'migrated' && calls >= 2);

    /* د) سباق دائم ⟵ raced بلا مساس */
    const f3 = mk('t341f3'); await seed([f3]); const b3 = await raw('t341f3');
    const alwaysStale = async (id) => { const r = await idb.get(STORES.ORDERS, id); return { ...r, updatedAt: (r.updatedAt || 0) - 5 }; };
    const r3 = await migrateOrder('t341f3', { deps: { readOrder: alwaysStale } });
    t.test('4. سباق دائم ⟵ raced والطلب كما هو', r3.status === 'raced' && (await raw('t341f3')) === b3);

    /* هـ) فشل التحقق ⟵ يُستعاد الطلب الأصلي */
    const f4 = mk('t341f4'); await seed([f4]); const u4 = (await idb.get(STORES.ORDERS, 't341f4')).updatedAt;
    let mediaReads = 0;
    const lyingRead = async (orderId, slot) => { mediaReads += 1; return mediaReads <= 2 ? undefined : { data: 'data:image/png;base64,BAD' }; };
    const r4 = await migrateOrder('t341f4', { deps: { readMedia: lyingRead } });
    const back = await idb.get(STORES.ORDERS, 't341f4');
    t.test('5. فشل التحقق ⟵ failed واستُعيدت الحقول المضمَّنة', r4.status === 'failed' && r4.reason.startsWith('verify-failed') && back.referenceImage === PNG && back.signature === SIG && back.updatedAt > u4);

    /* و) وسيط مخزَّن بقيمة مختلفة ⟵ لا كتابة فوقه؛ الباقي يُرحَّل */
    const f5 = mk('t341f5'); await seed([f5]);
    await idb.put(STORES.ORDER_MEDIA, { id: mediaId('t341f5', 'ref'), orderId: 't341f5', slot: 'ref', data: 'data:image/png;base64,OTHER', bytes: 5, createdAt: 1, updatedAt: 1 });
    const r5 = await migrateOrder('t341f5');
    const o5 = await idb.get(STORES.ORDERS, 't341f5'); const m5 = await idb.get(STORES.ORDER_MEDIA, mediaId('t341f5', 'ref'));
    t.test('6. تعارض مخزن: الصورة تبقى مضمَّنة والوسيط الموجود لم يُمسّ، والتوقيع رُحِّل',
      r5.status === 'migrated' && o5.referenceImage === PNG && m5.data.endsWith('OTHER') && o5.signature === '' && o5.hasSignature === true && r5.skipped.some((s) => s.reason === REASON.STORE_CONFLICT));

    /* ز) حارس الكتابة مغلق ⟵ لا مساس */
    const f6 = mk('t341f6'); await seed([f6]); const b6 = await raw('t341f6');
    _setWriteGateForTest(() => false);
    const r6 = await migrateOrder('t341f6');
    _setWriteGateForTest(null);
    t.test('7. حارس MEDIA_MIN_BUILD مغلق ⟵ failed بلا مساس', r6.status === 'failed' && r6.reason === 'media-writes-disabled' && (await raw('t341f6')) === b6);

    t.test('8. طلب غير موجود ⟵ missing', (await migrateOrder('t341nope')).status === 'missing');

    /* ح) الإيقاف: لا يُرحَّل ما بعد الإيقاف */
    await cleanup(['t341f6', 't341f1']); await seed([f6, f1]);   /* أعد طلبين قديمين لاختبار الإيقاف */
    let n = 0;
    const cs = await runMigration(['t341f6', 't341f1'], { shouldCancel: () => { n += 1; return n > 1; } });
    t.test('9. الإيقاف: يتوقف بعد الأول ويُبلَّغ cancelled', cs.cancelled === true && cs.migrated + cs.failed + cs.skipped + cs.raced === 1 && (await idb.get(STORES.ORDERS, 't341f1')).referenceImage === PNG);

    const prog = []; await runMigration(['t341nope'], { onProgress: (p) => prog.push(p) });
    t.test('10. التقدّم يُبلَّغ بعد كل طلب', prog.length === 1 && prog[0].done === 1 && prog[0].total === 1);
  } finally { _setWriteGateForTest(null); await cleanup(ids); }
});

register('v3.4.1 media migration: start ceremony (backup, gates, lock)', async (t) => {
  _resetForTest(); _setWriteGateForTest(null);
  const ids = ['t341s1', 't341s2'];
  await cleanup(ids);
  const recs = ids.map((id) => order(id, { referenceImage: PNG, signature: SIG }));
  await seed(recs);
  const baseRaw = {}; for (const r of recs) baseRaw[r.id] = await raw(r.id);
  const cleanSync = { usedCloud: true, dirtySince: null, blocked: null, conflicts: 0, queueSize: 0 };
  const counts = { customers: 1, orders: 2, payments: 3, inventory: 4, ledger: 5 };
  const now = Date.now();
  const calls = { backup: 0, verify: 0 };
  const deps = (over) => ({
    readSync: () => cleanSync, countLive: async () => ({ ...counts }), storageStatus: async () => ({ usage: 1, quota: 1e12 }),
    storeExists: async () => true, now: () => now, yieldFn: async () => {},
    createBackup: async () => { calls.backup += 1; return { ok: true, id: 'bk1' }; },
    verifyBackup: async () => { calls.verify += 1; return { ok: true, errors: [], createdAt: now, counts: { ...counts } }; },
    ...over,
  });
  const scan = async () => scanInlineMedia();
  const mine = async () => { const s = await scan(); return { ...s, candidates: s.candidates.filter((c) => ids.includes(c.id)), inlineBytes: s.candidates.filter((c) => ids.includes(c.id)).reduce((n, c) => n + c.bytes, 0) }; };
  const untouched = async () => { for (const r of recs) if ((await raw(r.id)) !== baseRaw[r.id]) return false; return true; };
  try {
    const sc = await mine();
    const dirty = await startMigration({ scan: sc, deps: deps({ readSync: () => ({ ...cleanSync, dirtySince: now }) }) });
    t.test('1. مزامنة غير نظيفة ⟵ blocked قبل أي نسخة أو كتابة', dirty.status === 'blocked' && calls.backup === 0 && await untouched());

    const none = await startMigration({ scan: { candidates: [], inlineBytes: 0 }, deps: deps() });
    t.test('2. لا مرشّحين ⟵ blocked بلا نسخة', none.status === 'blocked' && calls.backup === 0);

    const failB = await startMigration({ scan: sc, deps: deps({ createBackup: async () => ({ ok: false, error: 'no space' }) }) });
    t.test('3. فشل النسخة ⟵ failed بلا مساس', failB.status === 'failed' && failB.reason.includes('no space') && await untouched());

    const badV = await startMigration({ scan: sc, deps: deps({ verifyBackup: async () => ({ ok: false, errors: ['corrupt'], createdAt: now, counts }) }) });
    t.test('4. نسخة لم تجتز الفحص ⟵ blocked بلا مساس', badV.status === 'blocked' && await untouched());

    const mism = await startMigration({ scan: sc, deps: deps({ countLive: async () => ({ ...counts, orders: 99 }) }) });
    t.test('5. بيانات تغيّرت بعد النسخة ⟵ blocked بلا مساس', mism.status === 'blocked' && await untouched());

    const thrown = await startMigration({ scan: sc, deps: deps({ createBackup: async () => { throw new Error('crash'); } }) });
    t.test('6. استثناء أثناء النسخة ⟵ failed وفُكَّ القفل', thrown.status === 'failed' && isMigrationRunning() === false && await untouched());

    const phases = []; const prog = [];
    const ok = await startMigration({ scan: sc, deps: deps(), onPhase: (p) => phases.push(p), onProgress: (p) => prog.push(p.done) });
    t.test('7. المسار السعيد: نسخة ثم ترحيل بترتيب صحيح', ok.status === 'done' && phases.join() === 'backup,migrate' && ok.backupId === 'bk1' && ok.summary.migrated === 2 && prog.join() === '1,2');
    t.test('8. بعد الانتهاء: القفل مفكوك والوسائط مطابقة', isMigrationRunning() === false && (await getOrderMedia(await idb.get(STORES.ORDERS, 't341s1'), 'ref')) === PNG);

    /* قفل: ترحيل آخر يعمل ⟵ busy */
    localStorage.setItem('jalabiya_v3_media_migration_lock', String(Date.now()));
    const busy = await startMigration({ scan: sc, deps: deps() });
    localStorage.removeItem('jalabiya_v3_media_migration_lock');
    t.test('9. قفل قائم (تبويب آخر) ⟵ busy بلا نسخة جديدة', busy.status === 'busy');

    await cleanup(ids); await seed(recs); for (const r of recs) baseRaw[r.id] = await raw(r.id);   /* أعد الطلبات القديمة لاختبار الإيقاف */
    const cancelled = await startMigration({ scan: await mine(), deps: deps(), shouldCancel: () => true });
    t.test('10. إيقاف فوري بعد النسخة ⟵ cancelled وبلا ترحيل', cancelled.status === 'cancelled' && cancelled.summary.migrated === 0 && await untouched());
  } finally { _resetForTest(); await cleanup(ids); }
});
