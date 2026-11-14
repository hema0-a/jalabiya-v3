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
import { integrityDue, summarizeScan, runIntegrityIfDue, INTEGRITY_KEY, INTEGRITY_EVERY_MS } from '../../services/integrity-weekly.js';
import { buildActionCenter } from '../../services/action-center.js';
import { getRecentMerged, getRecentPersisted, report } from '../../core/error-handler.js';
import { activity } from '../../data/repos/activity.js';

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

register('v3.19.2 alongside create/patch (عرض→طلب، مورد→مصروف)', async (t) => {
  const quotesRepo = createRepository(STORES.QUOTES);
  const ordersRepo = createRepository(STORES.ORDERS);
  const expRepo = createRepository(STORES.EXPENSES);
  const entRepo = createRepository(STORES.SUPPLIER_ENTRIES);

  /* عرض ⟵ طلب: الإنشاء + تعديل العرض معاً */
  const q = await quotesRepo.create({ status: 'sent', items: [] });
  const oid = 'order-from-quote-1';
  const order = await ordersRepo.create({ id: oid, amount: 300, status: 'pending', fromQuoteId: q.id }, {
    alongside: [{ store: STORES.QUOTES, id: q.id, patch: { status: 'accepted', orderId: oid } }],
  });
  const q2 = await quotesRepo.find(q.id);
  await t.test('1. الطلب أُنشئ بالمعرّف المحدد', order.id === oid && !!(await ordersRepo.find(oid)));
  await t.test('2. والعرض صار مقبولاً ومربوطاً بالطلب (معاً)', q2.status === 'accepted' && q2.orderId === oid);

  /* مصروف مرتبط مفقود ⟵ تُلغى المعاملة كلها: لا حركة جديدة */
  let threw = false;
  try {
    await ordersRepo.create({ id: 'order-should-not-exist', amount: 1 }, {
      alongside: [{ store: STORES.QUOTES, id: 'no-such-quote', patch: { status: 'accepted' } }],
    });
  } catch (e) { threw = e && e.code === 'alongside-missing'; }
  await t.test('3. سجل مرتبط مفقود ⟵ يُرفض بالرمز alongside-missing', threw);
  await t.test('4. ولا يُنشأ الطلب (ذرّية)', (await ordersRepo.find('order-should-not-exist')) === undefined);

  /* مورد ⟵ مصروف: حركة جديدة + مصروف مربوط بمعرّفه */
  const exId = 'exp-linked-1';
  const ent = await entRepo.create({ supplierId: 's1', kind: 'purchase', amount: 90, expenseId: exId }, {
    alongside: [{ store: STORES.EXPENSES, data: { id: exId, category: 'fabric', amount: 90 } }],
  });
  const ex = await expRepo.find(exId);
  await t.test('5. الحركة والمصروف حُفظا معاً ومربوطان', !!ent && ex && ex.amount === 90 && (await entRepo.find(ent.id)).expenseId === exId);

  /* تعديل الحركة + تعديل مصروفها */
  await entRepo.update(ent.id, { amount: 120 }, { alongside: [{ store: STORES.EXPENSES, id: exId, patch: { amount: 120 } }] });
  await t.test('6. تعديل الحركة يعدّل مصروفها معاً', (await entRepo.find(ent.id)).amount === 120 && (await expRepo.find(exId)).amount === 120);

  await expRepo.remove(exId); await entRepo.remove(ent.id);
  await ordersRepo.remove(oid); await quotesRepo.remove(q.id);
});

/* ===== v3.20.0 ===== */
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

register('v3.20.0 integrity-weekly', async (t) => {
  const W = INTEGRITY_EVERY_MS; const now = 10 * W;
  await t.test('1. لا فحص سابق ⟵ حان', integrityDue(null, now).due === true);
  await t.test('2. فحص حديث ⟵ لم يحن', integrityDue({ at: now - 1000, total: 0 }, now).due === false);
  await t.test('3. مضى أسبوع ⟵ حان', integrityDue({ at: now - W - 1 }, now).due === true);
  await t.test('4. بدأ ولم يكتمل (انهيار محتمل) ⟵ يُتخطّى أسبوعاً', integrityDue({ at: now - 2 * W, startedAt: now - 1000 }, now).reason === 'crash-guard');
  await t.test('5. التلخيص يعدّ الأخطاء والتحذيرات', (() => { const r = summarizeScan({ issues: [{ severity: 'error' }, { severity: 'warn' }, { severity: 'warn' }, { severity: 'info' }] }); return r.total === 4 && r.errors === 1 && r.warns === 2; })());
  await t.test('6. مدخل null لا ينهار', summarizeScan(null).total === 0);

  const st = memStore();
  const r1 = await runIntegrityIfDue({ storage: st, now, scan: async () => ({ issues: [{ severity: 'error' }, { severity: 'warn' }] }) });
  const saved = JSON.parse(st.getItem(INTEGRITY_KEY));
  await t.test('7. أول تشغيل يحفظ النتيجة', r1.ran && saved.total === 2 && saved.errors === 1 && saved.at === now && !saved.startedAt);
  const r2 = await runIntegrityIfDue({ storage: st, now: now + 1000, scan: async () => { throw new Error('should not run'); } });
  await t.test('8. بعدها مباشرة لا يعيد الفحص', r2.ran === false && r2.reason === 'recent');
  const st2 = memStore();
  const r3 = await runIntegrityIfDue({ storage: st2, now, scan: async () => { throw new Error('boom'); } });
  const s3 = JSON.parse(st2.getItem(INTEGRITY_KEY));
  await t.test('9. فشل الفحص لا يرمي ويمنع تكراره فوراً', r3.ran === false && /boom/.test(r3.reason) && s3.at === now);

  const withIssues = buildActionCenter({ now: Date.now(), integrity: { total: 3, errors: 1 } });
  const item = withIssues.items.find((i) => i.kind === 'integrity');
  await t.test('10. بند «سلامة البيانات» يظهر في مركز العمل عند وجود ملاحظات', !!item && item.route === '#/settings/data-care' && /3 ملاحظة/.test(item.subtitle));
  await t.test('11. ولا يظهر عند صفر ملاحظات', !buildActionCenter({ now: Date.now(), integrity: { total: 0 } }).items.some((i) => i.kind === 'integrity'));
});

register('v3.20.0 tab sync (BroadcastChannel)', async (t) => {
  if (typeof BroadcastChannel === 'undefined') { await t.test('0. BroadcastChannel غير متاح هنا (تخطٍّ)', true); return; }
  idb.startTabSync();
  const probe = new BroadcastChannel('jalabiya_v3_idb');
  if (typeof probe.unref === 'function') probe.unref();
  const got = [];
  probe.onmessage = (e) => got.push(e.data);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const repo = createRepository(STORES.TODOS);
  const rec = await repo.create({ title: 'tab-sync-test' });
  await wait(60);
  await t.test('1. كتابتي تُعلَن للتبويبات الأخرى باسم المخزن', got.some((m) => Array.isArray(m.names) && m.names.includes(STORES.TODOS) && typeof m.tab === 'string'));

  const seen = []; idb.onRemoteWrite((names) => seen.push(names));
  const v0 = idb.getWriteVersion();
  probe.postMessage({ tab: 'another-tab', names: [STORES.ORDERS] });
  await wait(60);
  await t.test('2. إعلان تبويب آخر يزيد عدّاد الكتابة (يُبطل الكاش)', idb.getWriteVersion() === v0 + 1);
  await t.test('3. ويستدعي onRemoteWrite بأسماء المخازن', seen.length === 1 && seen[0][0] === STORES.ORDERS);

  const own = got.find((m) => m.names.includes(STORES.TODOS));
  const v1 = idb.getWriteVersion();
  probe.postMessage({ tab: own.tab, names: [STORES.ORDERS] });
  await wait(60);
  await t.test('4. صدى كتابتي نفسها لا يُحسب (لا حلقة)', idb.getWriteVersion() === v1 && seen.length === 1);
  probe.postMessage({ nonsense: true });
  await wait(30);
  await t.test('5. رسالة مشوّهة تُتجاهل', idb.getWriteVersion() === v1);
  await repo.remove(rec.id);
  probe.close();
});

register('v3.20.0 persisted errors', async (t) => {
  const marker = 'persisted-error-test-' + Date.now();
  await activity.log({ type: 'error:promise', description: '[promise] ' + marker, metadata: { stack: 'at x', url: '#/orders', context: {} } });
  await activity.log({ type: 'order:created', description: 'ليس خطأ' });
  const p = await getRecentPersisted(30);
  const hit = p.find((e) => e.message === marker);
  await t.test('1. الخطأ المحفوظ يُقرأ بشكل getRecent (kind/message/url)', !!hit && hit.kind === 'promise' && hit.url === '#/orders');
  await t.test('2. أنشطة غير الأخطاء لا تدخل', !p.some((e) => /ليس خطأ/.test(e.message)));
  const origErr = console.error; console.error = () => {};
  try { await report(new Error('mem-only-' + marker), {}); } catch (_) { /* ignore */ }
  console.error = origErr;
  const merged = await getRecentMerged(30);
  await t.test('3. الدمج يجمع الذاكرة والمحفوظ', merged.some((e) => e.message === marker) && merged.some((e) => /mem-only-/.test(e.message)));
  await t.test('4. بلا تكرار (الخطأ الذي في الذاكرة وفي السجل يظهر مرة)', merged.filter((e) => /mem-only-/.test(e.message)).length === 1);
});
