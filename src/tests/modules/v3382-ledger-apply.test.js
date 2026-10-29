/* ==========================================================================
   v3382-ledger-apply.test.js — الدفتر مرجع للمحفظة والنقاط (الخطوة 2ب، v3.3.82)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { settings } from '../../data/repos/settings.js';
import { customers, walletOf } from '../../data/repos/customers.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { balanceOf } from '../../services/ledger.js';
import { _resetShadowState, resetShadowFailures } from '../../services/ledger-shadow.js';
import { buildShadowReport, ensureOpening, resetShadowLedger, reportDeps } from '../../services/ledger-report.js';
import { isAuthorityActive } from '../../services/ledger-flag.js';
import { normalizeAuthority } from '../../services/ledger-authority.js';
import {
  applyDeps, applyWalletMove, ledgerWalletOf, checkCustomerDeletable, reconcileDerivedCounters,
  setDerivedAutoSync, MAX_RETRIES, PROTECTED_MESSAGE,
} from '../../services/ledger-apply.js';

const NOW = 1_800_000_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };

/** قاعدة اصطناعية في الذاكرة تحاكي writeBatch مع الحراس (للاختبار المنطقي). */
function fakeWorld(initial = {}) {
  const w = {
    customers: new Map(Object.entries(initial.customers || {}).map(([k, v]) => [k, { ...v }])),
    ledger: [...(initial.ledger || [])],
    batches: 0, listCalls: 0, getCalls: 0, failNext: null, mismatchTimes: 0,
  };
  const deps = {
    getCustomer: async (id) => { w.getCalls += 1; const c = w.customers.get(String(id)); return c ? { ...c } : null; },
    listByAcct: async (acct) => { w.listCalls += 1; return w.ledger.filter((e) => e.acct === acct); },
    listLedger: async () => [...w.ledger],
    listCustomers: async () => [...w.customers.values()].map((c) => ({ ...c })),
    takeSeq: (() => { let n = 0; return async () => n++; })(),
    deviceId: () => 'devT',
    now: () => NOW,
    writeBatch: async (plan, { guards }) => {
      w.batches += 1;
      if (w.failNext) { const e = w.failNext; w.failNext = null; throw e; }
      if (w.mismatchTimes > 0) { w.mismatchTimes -= 1; const e = new Error('guard'); e.code = 'guard-mismatch'; throw e; }
      for (const [id, expected] of guards.customers || []) {
        const cur = w.customers.get(id);
        if ((Number(cur && cur.updatedAt) || 0) !== expected) { const e = new Error('guard'); e.code = 'guard-mismatch'; throw e; }
      }
      for (const [id] of guards.ledger || []) {
        if (w.ledger.some((e) => e.id === id)) { const e = new Error('guard'); e.code = 'guard-mismatch'; throw e; }
      }
      for (const rec of (plan.customers || { records: [] }).records) w.customers.set(rec.id, { ...rec });
      for (const rec of (plan.ledger || { records: [] }).records) w.ledger.push({ ...rec });
    },
  };
  return { w, deps };
}
const cust = (over = {}) => ({ id: 'c1', name: 'عميل', creditBalance: 0, points: 0, walletLog: [], updatedAt: 1000, ...over });
const opening = (acct, unit, delta) => ({ id: 'k:opening:' + unit + ':' + acct, v: 1, unit, acct, delta, type: 'opening', at: 1, dev: 'devT', seq: 0, ref: null, rev: null, note: '' });

register('v3.3.82 ledger apply — المنطق (قاعدة اصطناعية)', async (t) => {
  let { w, deps } = fakeWorld({ customers: { c1: cust() } });
  let res = await applyWalletMove('c1', { balance: 100, type: 'topup', note: 'شحن' }, deps);
  await t.test('1. شحن 100: النتيجة والعدّادات المشتقة وسطر الدفتر وسجل العميل في معاملة واحدة',
    res.balance === 100 && res.points === 0 && w.batches === 1 && w.customers.get('c1').creditBalance === 100
    && w.ledger.length === 1 && w.ledger[0].delta === 10000 && w.ledger[0].acct === 'c1' && w.ledger[0].unit === 'wallet'
    && w.customers.get('c1').walletLog.length === 1 && w.customers.get('c1').walletLog[0].balance === 100 && /^k:w:/.test(w.ledger[0].id));

  ({ w, deps } = fakeWorld({ customers: { c1: cust({ creditBalance: 500 }) }, ledger: [] }));
  let e = await rejects(applyWalletMove('c1', { balance: -100, type: 'spend' }, deps));
  await t.test('2. الرصيد يُتحقق من الدفتر لا من العدّاد: عدّاد 500 والدفتر صفر ⟵ «الرصيد لا يكفي» بلا كتابة',
    e && /الرصيد لا يكفي/.test(e.message) && w.batches === 0 && w.ledger.length === 0);

  ({ w, deps } = fakeWorld({ customers: { c1: cust({ creditBalance: 999 }) }, ledger: [opening('c1', 'wallet', 10000)] }));
  res = await applyWalletMove('c1', { balance: 50, type: 'topup' }, deps);
  await t.test('3. العدّاد المنحرف (999) يُشتق من الدفتر: 100 + 50 = 150 لا 999 + 50', res.balance === 150 && w.customers.get('c1').creditBalance === 150);

  ({ w, deps } = fakeWorld({ customers: { c1: cust() } }));
  res = await applyWalletMove('c1', { points: 30, type: 'earn', orderId: 'o9' }, deps);
  await t.test('4. نقاط: سطر points نوعه award ومرجعه الطلب والعدّاد 30',
    res.points === 30 && w.ledger.length === 1 && w.ledger[0].unit === 'points' && w.ledger[0].type === 'award' && w.ledger[0].ref.orderId === 'o9' && w.customers.get('c1').points === 30);
  res = await applyWalletMove('c1', { balance: 20, points: -10, type: 'adjust' }, deps);
  await t.test('5. رصيد ونقاط معاً ⟵ سطران في دفعة واحدة', w.batches === 2 && w.ledger.length === 3 && res.balance === 20 && res.points === 20);
  e = await rejects(applyWalletMove('c1', { points: -999, type: 'spend' }, deps));
  await t.test('6. نقاط لا تكفي ⟵ مرفوضة بلا كتابة', e && /النقاط لا تكفي/.test(e.message) && w.batches === 2);

  const before = fakeWorld({ customers: { c1: cust() } }); before.w.failNext = new Error('QuotaExceeded');
  e = await rejects(applyWalletMove('c1', { balance: 10, type: 'topup' }, before.deps));
  await t.test('7. فشل كتابة الدفتر ⟵ تفشل العملية كلها: يصل الخطأ ولا عدّاد ولا سطر ولا سجل',
    e && /QuotaExceeded/.test(e.message) && before.w.ledger.length === 0 && before.w.customers.get('c1').creditBalance === 0 && before.w.customers.get('c1').walletLog.length === 0);

  const retry = fakeWorld({ customers: { c1: cust() } }); retry.w.mismatchTimes = 1;
  res = await applyWalletMove('c1', { balance: 10, type: 'topup' }, retry.deps);
  await t.test('8. تعارض متزامن مرة ⟵ يُعاد الحساب من الدفتر ويمرّ (قراءتان)', res.balance === 10 && retry.w.getCalls === 2 && retry.w.listCalls === 2 && retry.w.ledger.length === 1);
  const stuck = fakeWorld({ customers: { c1: cust() } }); stuck.w.mismatchTimes = 99;
  e = await rejects(applyWalletMove('c1', { balance: 10, type: 'topup' }, stuck.deps));
  await t.test('9. تعارض دائم ⟵ بعد ' + MAX_RETRIES + ' محاولات خطأ واضح ولا كتابة', e && /تعديلات متزامنة/.test(e.message) && stuck.w.getCalls === MAX_RETRIES && stuck.w.ledger.length === 0);

  e = await rejects(applyWalletMove('nope', { balance: 1, type: 'topup' }, fakeWorld().deps));
  await t.test('10. عميل غير موجود ⟵ «العميل غير موجود»', e && /العميل غير موجود/.test(e.message));

  let seen = null;
  ({ w, deps } = fakeWorld({ customers: { c1: cust({ updatedAt: NOW }) } }));
  const wb = deps.writeBatch; deps.writeBatch = async (plan, opts) => { seen = { plan, opts }; return wb(plan, opts); };
  await applyWalletMove('c1', { balance: 5, type: 'topup' }, deps);
  await t.test('11. حارس العميل = updatedAt القديم، وحارس السطر = غير موجود، وupdatedAt الجديد أكبر ولو في الميلي ثانية نفسها',
    seen.opts.guards.customers.get('c1') === NOW && [...seen.opts.guards.ledger.values()].every((v) => v === null)
    && seen.plan.customers.records[0].updatedAt === NOW + 1);

  ({ w, deps } = fakeWorld({ customers: { c1: cust() }, ledger: [opening('c1', 'wallet', 10000)] }));
  w.customers.get('c1').creditBalance = 100;
  const out = await Promise.all([
    rejects(applyWalletMove('c1', { balance: -60, type: 'spend' }, deps)),
    rejects(applyWalletMove('c1', { balance: -60, type: 'spend' }, deps)),
  ]);
  await t.test('12. صرفان متزامنان 60+60 من 100 ⟵ ينجح واحد فقط (القفل) والرصيد 40 لا −20',
    out.filter((x) => x === null).length === 1 && out.filter((x) => x && /الرصيد لا يكفي/.test(x.message)).length === 1
    && w.customers.get('c1').creditBalance === 40 && balanceOf(w.ledger, 'wallet', 'c1') === 4000);

  ({ w, deps } = fakeWorld({ customers: { c1: cust() } }));
  await Promise.all(Array.from({ length: 12 }, () => applyWalletMove('c1', { balance: 10, type: 'topup' }, deps)));
  await t.test('13. 12 شحنة متزامنة × 10 ⟵ 120 بالضبط في الدفتر والعدّاد وسجل العميل', balanceOf(w.ledger, 'wallet', 'c1') === 12000 && w.customers.get('c1').creditBalance === 120 && w.customers.get('c1').walletLog.length === 12);

  ({ w, deps } = fakeWorld({ customers: { c1: cust({ creditBalance: 7 }), c2: cust({ id: 'c2', points: 3 }), c3: cust({ id: 'c3' }) },
    ledger: [opening('c1', 'wallet', 12550), opening('c2', 'points', 40)] }));
  const rec = await reconcileDerivedCounters({ ...deps, isActive: async () => true });
  await t.test('14. إعادة الاشتقاق تصحّح العدّادات المنحرفة فقط (c1: 125.5، c2: 40) وتترك المطابق',
    rec.status === 'ok' && rec.fixed === 2 && w.customers.get('c1').creditBalance === 125.5 && w.customers.get('c2').points === 40 && w.customers.get('c3').creditBalance === 0);
  const inactive = await reconcileDerivedCounters({ ...deps, isActive: async () => false });
  await t.test('15. غير مفعَّل ⟵ لا تفعل شيئاً', inactive.status === 'inactive' && inactive.fixed === 0);
  const lw = await ledgerWalletOf('c1', deps);
  const del = await checkCustomerDeletable('c1', deps);
  await t.test('16. ledgerWalletOf وفحص الحذف: عميل برصيد ⟵ ممنوع بسبب بالمبلغ، وبدونه مسموح',
    lw.balance === 125.5 && del.ok === false && /125.5 ج.م/.test(del.reason) && (await checkCustomerDeletable('c3', deps)).ok === true);
});

register('v3.3.82 ledger apply — على القاعدة الفعلية والحراس', async (t) => {
  const prevAuth = normalizeAuthority((await settings.get()).ledgerAuthority);
  const prevWB = applyDeps.writeBatch;
  const prevSync = reportDeps.syncState;
  reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });   /* لا تتأثر بحالة مزامنة اختبارات سابقة */
  const reset = async () => {
    await ledgerRepo.clearAll(); await idb.clear('customers'); await idb.clear('inventory');
    _resetShadowState(); resetShadowFailures();
  };
  const setAuth = (on) => settings.update({ ledgerAuthority: { enabled: on, enabledAt: on ? Date.now() : null } });
  setDerivedAutoSync(false);
  try {
    await reset(); await setAuth(true);
    await t.test('1. المفتاح مفعَّل ويقرؤه isAuthorityActive', (await isAuthorityActive()) === true);

    const c = await customers.create({ name: 'اختبار-2ب', phone: '01000000082' });
    let r = await customers.walletTopUp(c.id, 200, 'شحن');
    let rec = await customers.find(c.id);
    const report = await buildShadowReport();
    await t.test('2. walletTopUp عبر الدفتر: العدّاد مشتق والدفتر يطابقه والتقرير بلا فروق',
      r.balance === 200 && walletOf(rec).balance === 200 && balanceOf(await ledgerRepo.list(), 'wallet', c.id) === 20000 && report.mismatches === 0);

    r = await customers.walletAdjust(c.id, { balance: -50, type: 'spend', note: 'صرف' });
    await t.test('3. صرف 50 ⟵ 150 في العدّاد والدفتر', r.balance === 150 && (await ledgerWalletOf(c.id)).balance === 150);

    const lenBefore = (await ledgerRepo.list()).length;
    let e = await rejects(customers.walletAdjust(c.id, { balance: -500, type: 'spend' }));
    await t.test('4. صرف أكبر من الرصيد ⟵ مرفوض ولا سطر جديد ولا تغيّر', e && /الرصيد لا يكفي/.test(e.message) && (await ledgerRepo.list()).length === lenBefore && walletOf(await customers.find(c.id)).balance === 150);

    applyDeps.writeBatch = async () => { throw new Error('فشل اصطناعي'); };
    const cntBefore = (await ledgerRepo.list()).length;
    e = await rejects(customers.walletAdjust(c.id, { balance: 10, type: 'topup' }));
    applyDeps.writeBatch = prevWB;
    await t.test('5. فشل معاملة الدفتر ⟵ تفشل العملية كلها: لا سطر ولا تغيّر في الرصيد وسجله',
      e && /فشل اصطناعي/.test(e.message) && (await ledgerRepo.list()).length === cntBefore
      && walletOf(await customers.find(c.id)).balance === 150 && walletOf(await customers.find(c.id)).log.length === 2);

    /* حراس الحقول المشتقة */
    e = await rejects(customers.update(c.id, { creditBalance: 999 }));
    await t.test('6. update لرصيد مختلف ⟵ مرفوض بالرسالة الموحّدة', e && e.message === PROTECTED_MESSAGE && walletOf(await customers.find(c.id)).balance === 150);
    e = await rejects(customers.update(c.id, { points: 5 }));
    await t.test('7. update لنقاط مختلفة ⟵ مرفوض', e && e.message === PROTECTED_MESSAGE);
    const full = await customers.find(c.id);
    await customers.update(c.id, { ...full, name: 'اسم جديد' });
    await t.test('8. كائن عميل كامل بقيم الحقول نفسها ⟵ يُقبل ويُحفظ الاسم فقط والرصيد كما هو',
      (await customers.find(c.id)).name === 'اسم جديد' && walletOf(await customers.find(c.id)).balance === 150);
    e = await rejects(customers.modify(c.id, () => ({ creditBalance: 1 })));
    await t.test('9. modify يغيّر الرصيد ⟵ مرفوض', e && e.message === PROTECTED_MESSAGE);
    await customers.modify(c.id, () => ({ notes: 'ملاحظة' }));
    await t.test('10. modify لحقل عادي ⟵ يعمل', (await customers.find(c.id)).notes === 'ملاحظة');
    e = await rejects(customers.create({ name: 'x', creditBalance: 50 }));
    const c0 = await customers.create({ name: 'صفري', creditBalance: 0, points: 0, walletLog: [] });
    await t.test('11. create برصيد ابتدائي ⟵ مرفوض، وبقيم صفرية ⟵ يُقبل', e && e.message === PROTECTED_MESSAGE && !!c0.id);

    /* الحذف */
    e = await rejects(customers.remove(c.id));
    const can = await customers.canDelete(c.id);
    await t.test('12. حذف عميل له رصيد ⟵ ممنوع بسبب بالمبلغ (هذا ما ولّد حساب الـ5000 اليتيم)', e && /150 ج.م/.test(e.message) && can.ok === false && !!(await customers.find(c.id)));
    await customers.walletAdjust(c.id, { balance: -150, type: 'adjust', note: 'تصفير' });
    await customers.remove(c.id);
    await t.test('13. بعد التصفير ⟵ يُحذف', !(await customers.find(c.id)));

    /* النقل بين عميلين */
    const a = await customers.create({ name: 'أ' }); const b = await customers.create({ name: 'ب' });
    await customers.walletTopUp(a.id, 300); await customers.walletAdjust(a.id, { points: 40, type: 'earn' });
    const tr = await customers.walletTransfer(a.id, b.id, { fromName: 'أ', toName: 'ب' });
    const rep2 = await buildShadowReport();
    await t.test('14. walletTransfer عبر الدفتر: ينتقل 300 و40 نقطة، المصدر صفر، والتقرير بلا فروق',
      tr.moved && walletOf(await customers.find(b.id)).balance === 300 && walletOf(await customers.find(b.id)).points === 40
      && walletOf(await customers.find(a.id)).balance === 0 && rep2.mismatches === 0);
    await customers.remove(a.id);
    await t.test('15. بعد النقل ⟵ يُحذف المصدر بلا مانع', !(await customers.find(a.id)));

    /* تزامن حقيقي */
    await Promise.all(Array.from({ length: 8 }, () => customers.walletTopUp(b.id, 10)));
    await t.test('16. ثماني شحنات متزامنة ⟵ 380 بالضبط في الدفتر والعدّاد',
      (await ledgerWalletOf(b.id)).balance === 380 && walletOf(await customers.find(b.id)).balance === 380);

    /* إعادة الاشتقاق */
    const bRec = await customers.find(b.id);
    await idb.put('customers', { ...bRec, creditBalance: 999, points: 1 });          /* محاكاة استعادة/مزامنة بعدّاد قديم */
    const rc = await reconcileDerivedCounters();
    await t.test('17. عدّاد قديم بعد استعادة ⟵ يُصحَّح من الدفتر (380 و40)', rc.fixed >= 1 && walletOf(await customers.find(b.id)).balance === 380 && walletOf(await customers.find(b.id)).points === 40);

    setDerivedAutoSync(true);
    await idb.put('customers', { ...(await customers.find(b.id)), creditBalance: 5 });
    await sleep(900);
    setDerivedAutoSync(false);
    await t.test('18. مستمع الكتابة يعيد الاشتقاق تلقائياً بعد كتابة خارجية', walletOf(await customers.find(b.id)).balance === 380);

    /* الدفتر اليتيم لا يُمسّ */
    await ledgerRepo.append({ id: 'k:orphan:1', v: 1, unit: 'wallet', acct: 'ghost-customer', delta: 500000, type: 'topup', at: 1, dev: 'devX', seq: 0, ref: null, rev: null, note: '' });
    await reconcileDerivedCounters();
    await t.test('19. حساب يتيم (عميل غير موجود) يبقى في الدفتر كما هو ويُقرأ رصيده 5000', (await ledgerWalletOf('ghost-customer')).balance === 5000);

    /* إعادة الضبط والأسطر الافتتاحية */
    const rs = await resetShadowLedger();
    await t.test('20. إعادة ضبط الدفتر ممنوعة وهو مرجع ولا يُمسح شيء', rs.status === 'gated' && rs.gatedBy === 'authority' && (await ledgerRepo.count()) > 0);
    await idb.put('customers', { ...(await customers.find(b.id)), id: 'legacy-x', name: 'قديم', creditBalance: 300, points: 0 });
    const op = await ensureOpening({});
    await t.test('21. الأسطر الافتتاحية لا تكتب للمحفظة وهو مرجع (لا تصحيح باتجاه العدّاد)', (await ledgerWalletOf('legacy-x')).balance === 0 && op.status !== 'gated');

    /* المسار القديم عند الإلغاء */
    await reset(); await setAuth(false);
    const d = await customers.create({ name: 'قديم-مسار' });
    await customers.walletTopUp(d.id, 70);
    await customers.update(d.id, { points: 5 });
    await t.test('22. غير مفعَّل ⟵ المسار القديم كما كان: العدّاد مرجع، الدفتر ظلّي، والحقول تُكتب بلا حارس',
      walletOf(await customers.find(d.id)).balance === 70 && walletOf(await customers.find(d.id)).points === 5
      && balanceOf(await ledgerRepo.list(), 'wallet', d.id) === 7000 && (await isAuthorityActive()) === false);
  } finally {
    applyDeps.writeBatch = prevWB;
    reportDeps.syncState = prevSync;
    setDerivedAutoSync(true);
    await reset();
    await settings.update({ ledgerAuthority: prevAuth });
  }
});
