/* ==========================================================================
   v342-ledger-conflicts-ui.test.js — قسم تعارضات الدفتر في البطاقة (v3.4.2، يعمل في المتصفح)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { settings } from '../../data/repos/settings.js';
import { customers, walletOf } from '../../data/repos/customers.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { _resetShadowState, resetShadowFailures } from '../../services/ledger-shadow.js';
import { reportDeps } from '../../services/ledger-report.js';
import { normalizeAuthority } from '../../services/ledger-authority.js';
import { setDerivedAutoSync } from '../../services/ledger-apply.js';
import { logLedgerConflicts, loadLedgerIssues, clearLedgerIssues } from '../../services/ledger-union.js';
import { buildLedgerShadowCard } from '../../ui/ledger-shadow-card.js';
import { modal } from '../../ui/modal.js';

const ISSUES_KEY = 'jalabiya_v3_ledger_issues';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function walk(node, out = []) { for (const c of node.children || []) { out.push(c); walk(c, out); } return out; }
const find = (root, pred) => walk(root).find(pred) || null;
const byRole = (root, role) => find(root, (n) => n.getAttribute && n.getAttribute('data-role') === role);
const byAction = (root, action, id) => find(root, (n) => n.getAttribute && n.getAttribute('data-action') === action && (!id || n.getAttribute('data-id') === id));
async function until(cond, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(25); } return false; }
const clickModal = (text) => { const b = find(document.body, (n) => n.tagName === 'BUTTON' && n.textContent.trim() === text); if (b) b.click(); return !!b; };
const entry = (over) => ({ id: 'k:u1', v: 1, unit: 'wallet', acct: 'c1', delta: 10000, type: 'topup', at: 1_800_000_000_000, dev: 'devA', seq: 1, ref: null, rev: null, note: '', ...over });

register('v3.4.2 ledger conflicts — الواجهة في البطاقة', async (t) => {
  const prevAuth = normalizeAuthority((await settings.get()).ledgerAuthority);
  const prevSync = reportDeps.syncState;
  const prevIssues = localStorage.getItem(ISSUES_KEY);
  const reset = async () => { await ledgerRepo.clearAll(); await idb.clear('customers'); await idb.clear('inventory'); _resetShadowState(); resetShadowFailures(); clearLedgerIssues(); };
  setDerivedAutoSync(false);
  try {
    await reset();
    reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });
    await settings.update({ ledgerAuthority: { enabled: true, enabledAt: Date.now() } });
    const c = await customers.create({ name: 'منى', phone: '01000000343' });
    await customers.walletTopUp(c.id, 100);

    const card = buildLedgerShadowCard();
    const box = byRole(card, 'ledger-conflicts');
    await sleep(250);
    await t.test('1. بلا تعارضات ⟵ القسم مخفي', box.hidden === true);

    logLedgerConflicts([
      { id: 'k:u1', kept: entry({ id: 'k:u1', acct: String(c.id), delta: 5000 }), dropped: entry({ id: 'k:u1', acct: String(c.id), delta: 7000, dev: 'devB', note: 'من جهاز آخر' }) },
      { id: 'k:u2', kept: entry({ id: 'k:u2', unit: 'stock', acct: 'i-none', delta: 1000 }), dropped: entry({ id: 'k:u2', unit: 'stock', acct: 'i-none', delta: 2000 }) },
    ]);
    byAction(card, 'ledger-refresh').click();
    await until(() => box.hidden === false && !!byAction(box, 'ledger-conflict-keep', 'k:u1'));
    const rec1 = byAction(box, 'ledger-conflict-record', 'k:u1');
    const rec2 = byAction(box, 'ledger-conflict-record', 'k:u2');
    await t.test('2. القسم ظاهر بعنوان العدد، ويعرض اسم العميلة والحركتين المحفوظة والمُسقَطة',
      /تعارضات معرّفات الدفتر \(2\)/.test(box.textContent) && /منى/.test(box.textContent) && /المحفوظة/.test(box.textContent) && /المُسقَطة/.test(box.textContent) && /50/.test(box.textContent) && /70/.test(box.textContent));
    await t.test('3. تسجيل المُسقَطة متاح للمحفظة ومعطَّل للمخزون مع السبب', rec1.disabled === false && rec2.disabled === true && /المخزون/.test(box.textContent));

    /* اعتماد المحفوظ للمخزون */
    byAction(box, 'ledger-conflict-keep', 'k:u2').click();
    await until(() => clickModal('اعتمد المحفوظ'));
    await until(() => !byAction(box, 'ledger-conflict-keep', 'k:u2'));
    await t.test('4. اعتماد المحفوظ عبر الواجهة: يختفي التعارض ويُسجَّل في سجل التسويات ولا يُكتب شيء في الدفتر',
      loadLedgerIssues().conflicts.length === 1 && loadLedgerIssues().resolved[0].action === 'keep' && (await ledgerRepo.list()).every((e) => !String(e.id).includes('conflict')));

    /* تسجيل المُسقَطة */
    const before = walletOf(await customers.find(c.id)).balance;
    byAction(box, 'ledger-conflict-record', 'k:u1').click();
    await until(() => clickModal('سجّل التسوية'));
    await until(() => box.hidden === true, 8000);
    await t.test('5. تسجيل المُسقَطة عبر الواجهة: يتغيّر الرصيد +70 بسطر جديد، ويُحسم التعارض ويختفي القسم',
      walletOf(await customers.find(c.id)).balance === before + 70 && box.hidden === true && loadLedgerIssues().conflicts.length === 0
      && (await ledgerRepo.list()).some((e) => e.id === 'k:conflict:k:u1' && e.delta === 7000));
    await t.test('6. زر «راجعتُ انحرافات العدّادات» لا يمسح تعارضات معلّقة (لا ظهور له بلا انحراف)',
      byAction(card, 'ledger-ack-issues').hidden === true);

    /* غير مفعَّل: التسجيل معطَّل */
    await settings.update({ ledgerAuthority: { enabled: false } });
    logLedgerConflicts([{ id: 'k:u3', kept: entry({ id: 'k:u3', acct: String(c.id) }), dropped: entry({ id: 'k:u3', acct: String(c.id), delta: 900 }) }]);
    byAction(card, 'ledger-refresh').click();
    await until(() => !!byAction(box, 'ledger-conflict-record', 'k:u3'));
    await t.test('7. الدفتر غير مفعَّل ⟵ تسجيل التسوية معطَّل مع السبب، واعتماد المحفوظ متاح',
      byAction(box, 'ledger-conflict-record', 'k:u3').disabled === true && /تفعيل الدفتر/.test(box.textContent) && !!byAction(box, 'ledger-conflict-keep', 'k:u3'));
  } finally {
    reportDeps.syncState = prevSync;
    setDerivedAutoSync(true);
    if (modal.closeAll) modal.closeAll();
    await reset();
    await settings.update({ ledgerAuthority: prevAuth });
    if (prevIssues === null) localStorage.removeItem(ISSUES_KEY); else localStorage.setItem(ISSUES_KEY, prevIssues);
  }
});
