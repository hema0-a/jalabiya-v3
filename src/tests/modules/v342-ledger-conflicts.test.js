/* ==========================================================================
   v342-ledger-conflicts.test.js — حسم تعارضات معرّفات الدفتر (v3.4.2، المرحلة 2)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { settings } from '../../data/repos/settings.js';
import { customers, walletOf } from '../../data/repos/customers.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { balanceOf, makeEntry } from '../../services/ledger.js';
import { _resetShadowState, resetShadowFailures } from '../../services/ledger-shadow.js';
import { buildShadowReport, reportDeps } from '../../services/ledger-report.js';
import { normalizeAuthority } from '../../services/ledger-authority.js';
import { applyLedgerEntry, applyDeps, setDerivedAutoSync } from '../../services/ledger-apply.js';
import {
  logLedgerConflicts, loadLedgerIssues, clearLedgerIssues, clearDivergences, logDivergences,
  resolveLedgerConflict, ISSUES_MAX,
} from '../../services/ledger-union.js';
import {
  canRecordDropped, describeConflicts, keepStoredConflict, recordDroppedConflict, adjustmentKey,
} from '../../services/ledger-conflicts.js';

const NOW = 1_800_000_000_000;
const ISSUES_KEY = 'jalabiya_v3_ledger_issues';   /* سجل البلاغات المحلي: نحفظه ونعيده كي لا تلوّث الاختبارات سجل التسويات الحقيقي */
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };
const side = (over = {}) => ({ id: 'k:x1', v: 1, unit: 'wallet', acct: 'c1', delta: 10000, type: 'topup', at: NOW - 5000, dev: 'devA', seq: 1, ref: null, rev: null, note: '', ...over });
const conflict = (id = 'k:x1', keptOver = {}, droppedOver = {}) => ({ id, kept: side({ id, ...keptOver }), dropped: side({ id, delta: 25000, dev: 'devB', note: 'شحن من الجهاز الآخر', ...droppedOver }) });

function fakes(over = {}) {
  const calls = { apply: 0, built: null };
  const deps = {
    isAuthorityActive: async () => true,
    findCustomer: async (id) => (id === 'c1' ? { id: 'c1', name: 'سارة' } : null),
    findItem: async (id) => (id === 'i1' ? { id: 'i1', name: 'قماش' } : null),
    applyEntry: async (cid, build) => { calls.apply += 1; calls.built = build({ dev: 'devT', seq: 7, now: NOW }); return { status: 'added', entry: calls.built }; },
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}

register('v3.4.2 ledger conflicts — المنطق', async (t) => {
  const prevIssues = localStorage.getItem(ISSUES_KEY);
  try {
  /* --- أهلية التسجيل (نقية) --- */
  const ok = { authority: true, customerExists: true };
  await t.test('1. التسجيل ممكن: محفظة/نقاط + الدفتر مرجع + العميل موجود',
    canRecordDropped(side(), ok).ok && canRecordDropped(side({ unit: 'points', delta: 40 }), ok).ok);
  await t.test('2. المخزون ممنوع (ظلّي) بسبب واضح', !canRecordDropped(side({ unit: 'stock', delta: 5000 }), ok).ok && /المخزون/.test(canRecordDropped(side({ unit: 'stock' }), ok).reason));
  await t.test('3. غير مفعَّل ⟵ ممنوع، وعميل غير موجود ⟵ ممنوع', /تفعيل الدفتر/.test(canRecordDropped(side(), { ...ok, authority: false }).reason) && /غير موجود/.test(canRecordDropped(side(), { ...ok, customerExists: false }).reason));
  await t.test('4. مقدار صفري/كسري وبيانات ناقصة ⟵ ممنوع', !canRecordDropped(side({ delta: 0 }), ok).ok && !canRecordDropped(side({ delta: 1.5 }), ok).ok && !canRecordDropped(null, ok).ok);

  /* --- العرض --- */
  clearLedgerIssues();
  logLedgerConflicts([conflict('k:x1'), conflict('k:s1', { unit: 'stock', acct: 'i1', delta: 3000 }, { unit: 'stock', acct: 'i1', delta: 5000 })]);
  const { deps, calls } = fakes();
  const list = await describeConflicts(deps);
  const w = list.find((x) => x.id === 'k:x1'); const s = list.find((x) => x.id === 'k:s1');
  await t.test('5. العرض: اسم العميل/الصنف وجانبا التعارض وأهلية التسجيل لكل منهما',
    list.length === 2 && w.title === 'سارة' && w.kept.delta === 10000 && w.dropped.delta === 25000 && w.dropped.dev === 'devB' && w.canRecord.ok
    && s.title === 'قماش' && !s.canRecord.ok);

  /* --- اعتماد المحفوظ --- */
  let r = await keepStoredConflict('k:s1', deps);
  await t.test('6. اعتماد المحفوظ: يُحسم ويُسجَّل في سجل التسويات ولا يُكتب شيء في الدفتر',
    r.status === 'resolved' && calls.apply === 0 && loadLedgerIssues().conflicts.every((x) => x.id !== 'k:s1')
    && loadLedgerIssues().resolved[0].action === 'keep' && loadLedgerIssues().resolved[0].droppedDelta === 5000);
  r = await keepStoredConflict('k:s1', deps);
  await t.test('7. حسم تعارض محسوم أو غير موجود ⟵ missing بلا خطأ', r.status === 'missing');

  /* --- تسجيل المُسقَط --- */
  r = await recordDroppedConflict('k:x1', deps);
  const built = calls.built;
  await t.test('8. تسجيل المُسقَط: سطر جديد بمعرّف ثابت جديد (≠ الأصل) ونوع adjust ومقدار الوارد ومرجع الأصل',
    r.status === 'recorded' && calls.apply === 1 && built.id === 'k:' + adjustmentKey('k:x1') && built.id !== 'k:x1'
    && built.type === 'adjust' && built.unit === 'wallet' && built.acct === 'c1' && built.delta === 25000 && built.ref.conflictOf === 'k:x1'
    && built.at === NOW - 5000 && /تسوية/.test(built.note) && r.newId === built.id);
  await t.test('9. بعد التسجيل: التعارض محسوم في السجل بنوع record ومعرّف السطر الجديد',
    loadLedgerIssues().conflicts.length === 0 && loadLedgerIssues().resolved[0].action === 'record' && loadLedgerIssues().resolved[0].newId === built.id);
  r = await recordDroppedConflict('k:x1', deps);
  await t.test('10. تكرار الضغط بعد الحسم ⟵ missing ولا كتابة ثانية', r.status === 'missing' && calls.apply === 1);

  clearLedgerIssues(); logLedgerConflicts([conflict('k:x2')]);
  const f2 = fakes({ applyEntry: async (cid, build) => ({ status: 'exists', entry: build({ dev: 'd', seq: 1, now: NOW }) }) });
  r = await recordDroppedConflict('k:x2', f2.deps);
  await t.test('11. السطر مسجّل سابقاً (من جهاز آخر) ⟵ exists ويُحسم التعارض', r.status === 'exists' && loadLedgerIssues().conflicts.length === 0);

  clearLedgerIssues(); logLedgerConflicts([conflict('k:x3')]);
  r = await recordDroppedConflict('k:x3', fakes({ isAuthorityActive: async () => false }).deps);
  await t.test('12. غير مفعَّل ⟵ blocked والتعارض يبقى معلّقاً', r.status === 'blocked' && /تفعيل الدفتر/.test(r.reason) && loadLedgerIssues().conflicts.length === 1);
  r = await recordDroppedConflict('k:x3', fakes({ applyEntry: async () => { throw new Error('الرصيد لا يكفي'); } }).deps);
  await t.test('13. فشل الكتابة (رصيد لا يكفي) ⟵ failed بالسبب والتعارض يبقى معلّقاً', r.status === 'failed' && /الرصيد لا يكفي/.test(r.reason) && loadLedgerIssues().conflicts.length === 1);
  r = await recordDroppedConflict('k:none', fakes().deps);
  await t.test('14. تعارض غير موجود ⟵ missing', r.status === 'missing');

  /* --- سجل البلاغات --- */
  clearLedgerIssues(); logLedgerConflicts([conflict('k:y1')]); logDivergences([{ id: 'c1', from: { balance: 1, points: 0 }, to: { balance: 2, points: 0 } }]);
  clearDivergences();
  await t.test('15. clearDivergences يمسح الانحرافات ويُبقي التعارضات المعلّقة', loadLedgerIssues().diverged.length === 0 && loadLedgerIssues().conflicts.length === 1);
  resolveLedgerConflict('k:y1', 'keep');
  clearLedgerIssues();
  await t.test('16. clearLedgerIssues يُبقي سجل التسويات المحسومة كأثر تدقيق', loadLedgerIssues().resolved.some((x) => x.id === 'k:y1') && loadLedgerIssues().conflicts.length === 0);
  clearLedgerIssues();
  for (let i = 0; i < ISSUES_MAX + 5; i++) { logLedgerConflicts([conflict('k:z' + i)]); resolveLedgerConflict('k:z' + i, 'keep'); }
  await t.test('17. سجل التسويات محدود بـ ' + ISSUES_MAX, loadLedgerIssues().resolved.length === ISSUES_MAX);
  } finally {
    if (prevIssues === null) localStorage.removeItem(ISSUES_KEY); else localStorage.setItem(ISSUES_KEY, prevIssues);
  }
});

register('v3.4.2 ledger conflicts — القاعدة الفعلية', async (t) => {
  const prevAuth = normalizeAuthority((await settings.get()).ledgerAuthority);
  const prevSync = reportDeps.syncState;
  const prevIssues = localStorage.getItem(ISSUES_KEY);
  reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });
  setDerivedAutoSync(false);
  const reset = async () => {
    await ledgerRepo.clearAll(); await idb.clear('customers'); await idb.clear('inventory');
    _resetShadowState(); resetShadowFailures(); clearLedgerIssues();
  };
  try {
    await reset();
    await settings.update({ ledgerAuthority: { enabled: true, enabledAt: Date.now() } });
    const c = await customers.create({ name: 'عميلة-التعارض', phone: '01000000342' });
    await customers.walletTopUp(c.id, 100);
    const build = (delta, key = 'adj1', unit = 'wallet') => ({ dev, seq }) => makeEntry({ unit, acct: String(c.id), delta, type: 'adjust', key, note: 'اختبار' }, { dev, seq });

    let r = await applyLedgerEntry(c.id, build(25000));
    let rec = await customers.find(c.id);
    await t.test('1. applyLedgerEntry: يُلحق السطر ويشتق العدّاد (100 + 250 = 350) ويضيف أثراً في سجل العميل',
      r.status === 'added' && walletOf(rec).balance === 350 && balanceOf(await ledgerRepo.list(), 'wallet', c.id) === 35000
      && walletOf(rec).log[0].type === 'adjust' && walletOf(rec).log[0].balance === 250);
    const before = (await ledgerRepo.list()).length;
    r = await applyLedgerEntry(c.id, build(25000));
    await t.test('2. نفس المعرّف ثانية ⟵ exists بلا كتابة ولا تغيّر', r.status === 'exists' && (await ledgerRepo.list()).length === before && walletOf(await customers.find(c.id)).balance === 350);
    let e = await rejects(applyLedgerEntry(c.id, build(-99999, 'adj2')));
    await t.test('3. صرف يتجاوز الرصيد ⟵ مرفوض بلا أثر', e && /الرصيد لا يكفي/.test(e.message) && (await ledgerRepo.list()).length === before && walletOf(await customers.find(c.id)).balance === 350);
    e = await rejects(applyLedgerEntry(c.id, build(5000, 'adj3', 'stock')));
    await t.test('4. وحدة المخزون ⟵ مرفوضة', e && /المحفظة والنقاط فقط/.test(e.message));
    e = await rejects(applyLedgerEntry(c.id, ({ dev, seq }) => makeEntry({ unit: 'wallet', acct: 'غيره', delta: 100, type: 'adjust', key: 'adj4' }, { dev, seq })));
    await t.test('5. سطر لحساب آخر ⟵ مرفوض', e && /لا يخص هذا الحساب/.test(e.message));
    const wb = applyDeps.writeBatch; applyDeps.writeBatch = async () => { throw new Error('فشل اصطناعي'); };
    e = await rejects(applyLedgerEntry(c.id, build(100, 'adj5')));
    applyDeps.writeBatch = wb;
    await t.test('6. فشل المعاملة ⟵ لا سطر ولا تغيّر', e && /فشل اصطناعي/.test(e.message) && (await ledgerRepo.list()).length === before);
    const ptsC = await applyLedgerEntry(c.id, build(30, 'adj-p', 'points'));
    await t.test('7. النقاط أيضاً: +30 ويُشتق عدّاد النقاط', ptsC.points === 30 && walletOf(await customers.find(c.id)).points === 30);

    /* تدفق كامل: تعارض معلّق ⟵ تسجيل المُسقَط ⟵ الدفتر والعدّاد والتقرير */
    const kept = side({ id: 'k:dup', acct: String(c.id), delta: 5000 });
    const dropped = side({ id: 'k:dup', acct: String(c.id), delta: 7000, dev: 'devB', note: 'من الجهاز الآخر' });
    logLedgerConflicts([{ id: 'k:dup', kept, dropped }]);
    const listed = await describeConflicts();
    await t.test('8. العرض على بيانات فعلية: اسم العميلة والتسجيل ممكن', listed.length === 1 && listed[0].title === 'عميلة-التعارض' && listed[0].canRecord.ok);
    const beforeBal = walletOf(await customers.find(c.id)).balance;
    const rr = await recordDroppedConflict('k:dup');
    const rep = await buildShadowReport(await customers.list(), await ledgerRepo.list(), { authority: true });
    await t.test('9. تسجيل المُسقَط فعلياً: +70 في العدّاد والدفتر بسطر جديد، والأصل لم يُمسّ، وصفر فروق',
      rr.status === 'recorded' && walletOf(await customers.find(c.id)).balance === beforeBal + 70
      && (await ledgerRepo.list()).some((x) => x.id === 'k:' + adjustmentKey('k:dup') && x.delta === 7000 && x.ref.conflictOf === 'k:dup')
      && loadLedgerIssues().conflicts.length === 0 && rep.mismatches === 0);
    const again = await recordDroppedConflict('k:dup');
    await t.test('10. إعادة المحاولة بعد الحسم ⟵ missing ولا ازدواج', again.status === 'missing' && walletOf(await customers.find(c.id)).balance === beforeBal + 70);

    /* تزامن: خمس تسويات متوازية على العميلة نفسها */
    const base = walletOf(await customers.find(c.id)).balance;
    await Promise.all(Array.from({ length: 5 }, (_, i) => applyLedgerEntry(c.id, build(1000, 'par' + i))));
    await t.test('11. خمس تسويات متزامنة × 10 ⟵ +50 بالضبط', walletOf(await customers.find(c.id)).balance === base + 50);

    /* غير مفعَّل: لا تسجيل */
    await settings.update({ ledgerAuthority: { enabled: false } });
    logLedgerConflicts([{ id: 'k:off', kept: side({ id: 'k:off', acct: String(c.id) }), dropped: side({ id: 'k:off', acct: String(c.id), delta: 9900 }) }]);
    const len = (await ledgerRepo.list()).length;
    const off = await recordDroppedConflict('k:off');
    await t.test('12. غير مفعَّل ⟵ blocked ولا يُكتب شيء (يبقى التعارض معلّقاً)', off.status === 'blocked' && (await ledgerRepo.list()).length === len && loadLedgerIssues().conflicts.length === 1);
    const keep = await keepStoredConflict('k:off');
    await t.test('13. اعتماد المحفوظ يعمل دون تفعيل ولا يكتب شيئاً', keep.status === 'resolved' && (await ledgerRepo.list()).length === len);
  } finally {
    reportDeps.syncState = prevSync;
    setDerivedAutoSync(true);
    await reset();
    await settings.update({ ledgerAuthority: prevAuth });
    if (prevIssues === null) localStorage.removeItem(ISSUES_KEY); else localStorage.setItem(ISSUES_KEY, prevIssues);
  }
});
