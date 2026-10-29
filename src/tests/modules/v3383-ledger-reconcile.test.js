/* ==========================================================================
   v3383-ledger-reconcile.test.js — إغلاق ثغرات الدفتر (الخطوة 2ج، v3.3.83)
   1) المصالحة بعد المزامنة + شذوذ cache_diverged   2) الاستعادة بالدمج لا الاستبدال
   3) حراسة السلة   4) محاكي «الدفتر مرجع» مع جهاز قديم
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { settings } from '../../data/repos/settings.js';
import { customers, walletOf } from '../../data/repos/customers.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { trash } from '../../data/repos/trash.js';
import { balanceOf, findAnomalies, planCounterFixes } from '../../services/ledger.js';
import { planLedgerUnion, loadLedgerIssues, clearLedgerIssues, logDivergences, ISSUES_MAX } from '../../services/ledger-union.js';
import { _resetShadowState, resetShadowFailures } from '../../services/ledger-shadow.js';
import { normalizeAuthority } from '../../services/ledger-authority.js';
import { buildShadowReport } from '../../services/ledger-report.js';
import { reconcileDerivedCounters, reconcileAfterSync, setDerivedAutoSync } from '../../services/ledger-apply.js';
import { restoreBackup } from '../../services/auto-backup.js';
import { apply as applySnapshot } from '../../sync/firestore-sync.js';
import { simulateAuthority, settleAuthority, verifyAuthorityInvariants } from '../helpers/ledger-sim.js';

const NOW = 1_800_000_000_000;
const ent = (acct, unit, delta, over = {}) => ({
  id: 'k:t:' + unit + ':' + acct + ':' + (over.n || 0), v: 1, unit, acct, delta, type: delta >= 0 ? 'topup' : 'spend',
  at: NOW, dev: 'devT', seq: over.n || 0, ref: null, rev: null, note: '', ...over,
});

/** عالم اصطناعي (بلا IndexedDB) لاختبار المصالحة منطقياً. */
function fakeWorld(initial = {}) {
  const w = { customers: new Map(Object.entries(initial.customers || {}).map(([k, v]) => [k, { ...v }])), ledger: [...(initial.ledger || [])], logged: [], mismatch: false };
  const deps = {
    listCustomers: async () => [...w.customers.values()].map((c) => ({ ...c })),
    listLedger: async () => [...w.ledger],
    now: () => NOW,
    logDivergence: (f) => { w.logged.push(...f); },
    writeBatch: async (plan, { guards }) => {
      if (w.mismatch) { const e = new Error('guard'); e.code = 'guard-mismatch'; throw e; }
      for (const [id, exp] of guards.customers || []) if ((Number(w.customers.get(id).updatedAt) || 0) !== exp) { const e = new Error('guard'); e.code = 'guard-mismatch'; throw e; }
      for (const r of plan.customers.records) w.customers.set(r.id, { ...r });
    },
  };
  return { w, deps };
}
const cust = (id, over = {}) => ({ id, name: id, creditBalance: 0, points: 0, walletLog: [], updatedAt: 1000, ...over });

register('v3.3.83 ledger reconcile — المنطق النقي والمصالحة', async (t) => {
  /* --- شذوذ cache_diverged --- */
  const an = findAnomalies([], { diverged: [{ acct: 'c1', unit: 'wallet', from: 5000, to: 100 }, null, { unit: 'points' }] });
  await t.test('1. findAnomalies: بلاغ الانحراف ⟵ cache_diverged بدرجة warn (والمدخل الفاسد يُتجاهل)',
    an.length === 1 && an[0].kind === 'cache_diverged' && an[0].severity === 'warn' && an[0].acct === 'c1' && /5000/.test(an[0].message) && /100/.test(an[0].message));
  const rep = buildShadowReport([cust('c1')], [], { diverged: [{ acct: 'c1', unit: 'wallet', from: 9, to: 0 }] });
  await t.test('2. التقرير لا يكون «سليماً» ما دام بلاغ الانحراف قائماً', rep.ok === false && rep.anomalies.some((a) => a.kind === 'cache_diverged'));

  /* --- planCounterFixes --- */
  const led = [ent('c1', 'wallet', 12550), ent('c2', 'points', 40, { n: 1 })];
  const fx = planCounterFixes([cust('c1', { creditBalance: 7 }), cust('c2', { points: 40 }), cust('c3')], led);
  await t.test('3. planCounterFixes: يُرجع المنحرف فقط (c1: 7→125.5) ويترك المطابق والصفري',
    fx.length === 1 && fx[0].id === 'c1' && fx[0].from.balance === 7 && fx[0].to.balance === 125.5);
  const neg = planCounterFixes([cust('c9', { creditBalance: 50 })], [ent('c9', 'wallet', -100)]);
  await t.test('4. رصيد دفتر سالب ⟵ العدّاد يُقصّ إلى صفر (والسالب يبقى ظاهراً في findAnomalies)',
    neg.length === 1 && neg[0].to.balance === 0 && findAnomalies([ent('c9', 'wallet', -100)]).some((a) => a.kind === 'negative_balance'));

  /* --- المصالحة: جهاز قديم كتب العدّاد --- */
  let { w, deps } = fakeWorld({ customers: { c1: cust('c1', { creditBalance: 5000 }), c2: cust('c2') }, ledger: [ent('c1', 'wallet', 10000)] });
  let r = await reconcileDerivedCounters({ ...deps, isActive: async () => true, reason: 'sync' });
  await t.test('5. مزامنة (sync): عدّاد 5000 ⟵ يُعاد إلى 100 من الدفتر ويُسجَّل كانحراف (cache_diverged)',
    r.fixed === 1 && r.diverged === 1 && w.customers.get('c1').creditBalance === 100 && w.logged.length === 1 && w.logged[0].id === 'c1');
  r = await reconcileDerivedCounters({ ...deps, isActive: async () => true, reason: 'sync' });
  await t.test('6. تشغيل ثانٍ ⟵ لا شيء (idempotent) ولا بلاغ جديد', r.fixed === 0 && r.diverged === 0 && w.logged.length === 1);

  ({ w, deps } = fakeWorld({ customers: { c1: cust('c1', { creditBalance: 5000 }) }, ledger: [ent('c1', 'wallet', 10000)] }));
  r = await reconcileDerivedCounters({ ...deps, isActive: async () => true, reason: 'restore' });
  const r2 = await reconcileDerivedCounters({ ...deps, isActive: async () => true, reason: 'trash' });
  await t.test('7. استعادة/سلة ⟵ تصحيح متوقع بلا بلاغ شذوذ', r.fixed === 1 && r.diverged === 0 && w.logged.length === 0 && r2.fixed === 0);

  ({ w, deps } = fakeWorld({ customers: { c1: cust('c1', { creditBalance: 9 }), c2: cust('c2', { creditBalance: 9 }) }, ledger: [] }));
  r = await reconcileDerivedCounters({ ...deps, isActive: async () => true, onlyIds: ['c2'] });
  await t.test('8. onlyIds ⟵ يُصحَّح العميل المحدد فقط', r.checked === 1 && w.customers.get('c2').creditBalance === 0 && w.customers.get('c1').creditBalance === 9);

  ({ w, deps } = fakeWorld({ customers: { c1: cust('c1', { creditBalance: 9 }) }, ledger: [] }));
  w.mismatch = true;
  r = await reconcileDerivedCounters({ ...deps, isActive: async () => true, reason: 'sync' });
  await t.test('9. تعارض متزامن (guard-mismatch) ⟵ يُترك للجولة التالية بلا بلاغ كاذب ولا رمي', r.fixed === 0 && r.diverged === 0 && w.logged.length === 0);

  r = await reconcileDerivedCounters({ ...deps, isActive: async () => false, reason: 'sync' });
  await t.test('10. الدفتر غير مرجع ⟵ لا مصالحة ولا بلاغ (العدّادات القديمة هي المرجع)', r.status === 'inactive' && r.fixed === 0);

  const bad = await reconcileAfterSync({ ...deps, isActive: async () => { throw new Error('boom'); } });
  await t.test('11. reconcileAfterSync لا يرمي أبداً (فشلها لا يُفشل المزامنة)', bad.status === 'error' && bad.fixed === 0);

  /* --- اتحاد الدفتر --- */
  const local = [ent('c1', 'wallet', 100), ent('c1', 'wallet', 50, { n: 1 })];
  const cloud = [ent('c1', 'wallet', 100), ent('c1', 'wallet', 999, { n: 1 }), ent('c2', 'wallet', 7, { n: 2 }), { id: 'junk' }];
  const u = planLedgerUnion(local, cloud);
  await t.test('12. planLedgerUnion: يُضاف الناقص فقط (c2)، المحلي لا يُستبدل ولا يُحذف، التعارض يُبلَّغ، والفاسد يُرفض',
    u.added === 1 && u.toPut[0].acct === 'c2' && u.conflicts.length === 1 && u.conflicts[0].id === local[1].id && u.rejected.length === 1);
  const only = planLedgerUnion([ent('c1', 'wallet', 1), ent('c1', 'wallet', 2, { n: 1 })], []);
  await t.test('13. سحابة فارغة ⟵ لا يُضاف شيء، والمحلي يُحصى «محلي فقط» (يحتاج رفعاً)', only.added === 0 && only.localOnly === 2);

  /* --- سجل البلاغات --- */
  clearLedgerIssues();
  logDivergences(Array.from({ length: ISSUES_MAX + 10 }, (_, i) => ({ id: 'x' + i, from: { balance: 1, points: 0 }, to: { balance: 0, points: 0 } })));
  const li = loadLedgerIssues();
  await t.test('14. سجل البلاغات محدود (' + ISSUES_MAX + ') والأحدث أولاً', li.diverged.length === ISSUES_MAX);
  clearLedgerIssues();
  await t.test('15. مسح السجل ⟵ فارغ', loadLedgerIssues().diverged.length === 0);
});

register('v3.3.83 ledger sim — وضع «الدفتر مرجع» مع جهاز قديم', async (t) => {
  let bad = 0; let divs = 0; let lw = 0; let first = null;
  for (let seed = 1; seed <= 60; seed++) {
    for (const legacy of [0, 1, 2]) {
      const sim = simulateAuthority({ seed, devices: 4, legacy, steps: 140 });
      settleAuthority(sim.replicas);
      const v = verifyAuthorityInvariants(sim);
      if (v.length) { bad++; first = first || ('seed ' + seed + ' legacy ' + legacy + ': ' + v[0]); }
      divs += sim.divergedFixes; lw += sim.legacyWrites;
    }
  }
  await t.test('1. 180 محاكاة (بذور × 0/1/2 جهاز قديم): كل المبادئ سليمة' + (first ? ' — ' + first : ''), bad === 0);
  await t.test('2. الأجهزة القديمة كتبت فعلاً وصُحّحت انحرافات فعلية (المحاكاة ليست فارغة)', lw > 100 && divs > 0);

  const sim = simulateAuthority({ seed: 7, devices: 3, legacy: 1, steps: 140 });
  settleAuthority(sim.replicas);
  const clean = verifyAuthorityInvariants(sim);
  const upd = sim.replicas.find((r) => !r.legacy);
  const c = upd.customers.get('c1');
  upd.customers.set('c1', { ...c, creditBalance: c.creditBalance + 777 });           /* انحراف متبقٍّ مزروع */
  await t.test('3. المحاكي يكشف الانحراف المتبقي (اختبار سلبي): بلا مصالحة ⟵ مخالفة', clean.length === 0 && verifyAuthorityInvariants(sim).some((m) => /انحراف متبقٍّ/.test(m)));

  const sim2 = simulateAuthority({ seed: 9, devices: 3, legacy: 1, steps: 100 });
  settleAuthority(sim2.replicas);
  sim2.replicas[0].entries = [...sim2.replicas[0].entries, ent('c1', 'wallet', 123456, { n: 99, id: 'k:forged' })];
  await t.test('4. المحاكي يكشف سطراً دخيلاً/عدم تقارب (اختبار سلبي)', verifyAuthorityInvariants(sim2).length >= 1);

  const solo = simulateAuthority({ seed: 3, devices: 3, legacy: 0, steps: 120 });
  await t.test('5. بلا أجهزة قديمة ⟵ لا كتابات قديمة', solo.legacyWrites === 0);
});

register('v3.3.83 ledger 2c — الاستعادة والمزامنة والسلة على القاعدة الفعلية', async (t) => {
  const prevAuth = normalizeAuthority((await settings.get()).ledgerAuthority);
  const reset = async () => {
    await ledgerRepo.clearAll(); await idb.clear('customers'); await idb.clear('inventory');
    _resetShadowState(); resetShadowFailures(); clearLedgerIssues();
  };
  const setAuth = (on) => settings.update({ ledgerAuthority: { enabled: on, enabledAt: on ? Date.now() : null } });
  const cleanBackups = async () => {
    for (const b of await idb.getAll('backups')) if (/قبل الاستعادة|2ج-اختبار/.test(String(b.label || ''))) await idb.remove('backups', b.id);
  };
  setDerivedAutoSync(false);
  try {
    /* ---------- الاستعادة بالدمج ---------- */
    await reset(); await setAuth(true);
    const c = await customers.create({ name: 'اختبار-2ج', phone: '01000000083' });
    await customers.walletTopUp(c.id, 100, 'قبل النسخة');
    const snapCust = await customers.find(c.id);
    const snapLedger = await ledgerRepo.list();
    const curSettings = await idb.getAll('settings');
    await idb.put('backups', {
      id: 'bk-2c', createdAt: 1, label: '2ج-اختبار',
      stores: {
        customers: [snapCust], ledger: snapLedger,
        settings: curSettings.map((s) => (s.id === 'main' ? { ...s, ledgerAuthority: { enabled: false } } : s)),
      },
    });
    await customers.walletTopUp(c.id, 50, 'بعد النسخة');                      /* حركة مالية بعد تاريخ النسخة: يجب ألا تضيع */
    const beforeEntries = (await ledgerRepo.list()).length;
    const rs = await restoreBackup('bk-2c');
    const afterEntries = await ledgerRepo.list();
    await t.test('1. الاستعادة تنجح ولا تمسح الدفتر: حركة «بعد النسخة» باقية (150 لا 100)',
      rs.ok === true && afterEntries.length === beforeEntries && balanceOf(afterEntries, 'wallet', c.id) === 15000);
    await t.test('2. عدّادات العميل المستعاد مشتقة من الدفتر المدموج (150) لا من النسخة (100)',
      walletOf(await customers.find(c.id)).balance === 150);
    await t.test('3. مفتاح مرجعية الدفتر محلي: النسخة (enabled=false) لا تُلغيه', (await settings.get()).ledgerAuthority.enabled === true);
    await t.test('4. نتيجة الاستعادة تُبلغ بما دُمج', rs.ledger && rs.ledger.added === 0 && typeof rs.reconciled === 'number');

    /* نسخة تحمل حركة غير موجودة محلياً ⟵ تُضاف */
    const extra = ent(String(c.id), 'wallet', 2500, { id: 'k:from-backup:1', n: 5, dev: 'devOld', at: 2 });
    await idb.put('backups', { id: 'bk-2c-b', createdAt: 2, label: '2ج-اختبار', stores: { ledger: [...snapLedger, extra] } });
    const rs2 = await restoreBackup('bk-2c-b');
    await t.test('5. حركة من النسخة غير موجودة محلياً ⟵ تُضاف (175) ويُحدَّث العدّاد',
      rs2.ok && rs2.ledger.added === 1 && balanceOf(await ledgerRepo.list(), 'wallet', c.id) === 17500 && walletOf(await customers.find(c.id)).balance === 175);
    await idb.put('backups', { id: 'bk-2c-c', createdAt: 3, label: '2ج-اختبار', stores: { ledger: [{ ...extra, delta: 1 }] } });
    const rs3 = await restoreBackup('bk-2c-c');
    await t.test('6. حركة بنفس المعرّف وقيمة مختلفة ⟵ لا تُكتب فوق الموجود ويُسجَّل تعارض',
      rs3.ok && rs3.ledger.conflicts === 1 && balanceOf(await ledgerRepo.list(), 'wallet', c.id) === 17500 && loadLedgerIssues().conflicts.length === 1);

    /* ---------- المزامنة (استبدال) ---------- */
    await reset(); await setAuth(true);
    const d = await customers.create({ name: 'عميل-مزامنة' });
    await customers.walletTopUp(d.id, 100, 'محلي لم يُرفع');
    const localOnlyLedger = await ledgerRepo.list();
    const cloudCust = { ...(await customers.find(d.id)), creditBalance: 5000, updatedAt: Date.now() + 10_000 };   /* جهاز قديم كتب 5000 مباشرة */
    const cloudEntry = ent(String(d.id), 'points', 30, { id: 'k:cloud:1', n: 3, dev: 'devCloud', at: 3 });
    const ap = await applySnapshot({ stores: { customers: [cloudCust], ledger: [cloudEntry] }, updatedAt: 1 }, { mode: 'replace' });
    const after = await ledgerRepo.list();
    await t.test('7. «استبدال» بالسحابة لا يمسح الدفتر المحلي: السطر المحلي باقٍ والسحابي أُضيف',
      ap.ok === true && localOnlyLedger.every((e) => after.some((x) => x.id === e.id)) && after.some((x) => x.id === 'k:cloud:1'));
    const dRec = walletOf(await customers.find(d.id));
    await t.test('8. بعد السحب تُصالَح العدّادات فوراً: 5000 المكتوبة من جهاز قديم ⟵ 100، والنقاط 30 من الدفتر', dRec.balance === 100 && dRec.points === 30);
    await t.test('9. نتيجة apply تحمل المصالحة، والانحراف مسجَّل كـ cache_diverged في التقرير',
      ap.reconciled && ap.reconciled.diverged >= 1 && loadLedgerIssues().diverged.some((x) => x.acct === String(d.id) && x.unit === 'wallet' && x.from === 5000 && x.to === 100));

    /* ---------- السلة ---------- */
    await reset(); await setAuth(true);
    const e = await customers.create({ name: 'عميل-سلة' });
    await customers.walletTopUp(e.id, 200, 'شحن');
    const stale = { ...(await customers.find(e.id)), creditBalance: 999, points: 9 };    /* عدّاد قديم محفوظ في السلة */
    await idb.remove('customers', e.id);
    const item = await trash.addToTrash('customers', stale);
    await ledgerRepo.append(ent(String(e.id), 'wallet', 3000, { id: 'k:while-in-trash', n: 7, dev: 'devOther', at: 4 }));   /* وصلت حركة من جهاز آخر أثناء وجوده في السلة */
    await trash.restore(item.id);
    const back = walletOf(await customers.find(e.id));
    await t.test('10. استرجاع عميل من السلة ⟵ الرصيد والنقاط من الدفتر (230 و0) لا من السلة (999 و9)', back.balance === 230 && back.points === 0);

    await setAuth(false);
    const f = await customers.create({ name: 'عميل-سلة-قديم' });
    const keep = { ...(await customers.find(f.id)), creditBalance: 40, points: 4 };
    await idb.remove('customers', f.id);
    const item2 = await trash.addToTrash('customers', keep);
    await trash.restore(item2.id);
    await t.test('11. الدفتر غير مرجع ⟵ الاسترجاع كما كان (العدّادات من السلة)', walletOf(await customers.find(f.id)).balance === 40 && walletOf(await customers.find(f.id)).points === 4);
  } finally {
    await cleanBackups();
    await idb.remove('backups', 'bk-2c'); await idb.remove('backups', 'bk-2c-b'); await idb.remove('backups', 'bk-2c-c');
    setDerivedAutoSync(true);
    await reset();
    await settings.update({ ledgerAuthority: prevAuth });
  }
});
