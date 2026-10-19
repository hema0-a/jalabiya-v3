/* ==========================================================================
   v3381-ledger-authority-ui.test.js — لوحة تفعيل الدفتر في البطاقة (v3.3.81، يعمل في المتصفح)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { settings } from '../../data/repos/settings.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { listBackups, deleteBackup } from '../../services/auto-backup.js';
import { reportDeps } from '../../services/ledger-report.js';
import { _resetShadowState, resetShadowFailures } from '../../services/ledger-shadow.js';
import { normalizeAuthority } from '../../services/ledger-authority.js';
import { buildLedgerShadowCard } from '../../ui/ledger-shadow-card.js';
import { modal } from '../../ui/modal.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** كل العناصر تحت عقدة (بلا selectors كي تعمل في أي بيئة DOM). */
function walk(node, out = []) { for (const c of node.children || []) { out.push(c); walk(c, out); } return out; }
const find = (root, pred) => walk(root).find(pred) || null;
const byRole = (root, role) => find(root, (n) => n.getAttribute && n.getAttribute('data-role') === role);
const byAction = (root, action) => find(root, (n) => n.getAttribute && n.getAttribute('data-action') === action);
async function until(cond, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(25); }
  return false;
}
/** يضغط زراً في النافذة المنبثقة المفتوحة بنصّه. */
function clickModalButton(text) {
  const btn = find(document.body, (n) => n.tagName === 'BUTTON' && n.textContent.trim() === text);
  if (btn) btn.click();
  return !!btn;
}

register('v3.3.81 ledger authority — لوحة التفعيل في البطاقة', async (t) => {
  const prev = normalizeAuthority((await settings.get()).ledgerAuthority);
  const prevSync = reportDeps.syncState;
  const before = new Set((await listBackups()).map((b) => b.id));
  const reset = async () => {
    await ledgerRepo.clearAll(); await idb.clear('inventory'); await idb.clear('customers');
    _resetShadowState(); resetShadowFailures();
    await settings.update({ ledgerAuthority: { enabled: false, enabledAt: null, disabledAt: null, deviceId: null, backupId: null, backupAt: null, checkedAt: null } });
  };
  try {
    await reset();
    reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });

    const card = buildLedgerShadowCard();
    const box = byRole(card, 'ledger-authority');
    const state = () => box.getAttribute('data-state');
    const refresh = async () => { byAction(card, 'ledger-refresh').click(); await sleep(30); await until(() => !!state()); await sleep(60); };

    await t.test('1. نظام نظيف: اللوحة جاهزة بثلاثة شروط وزر التفعيل مفعَّل والنسخة «⏳ تُؤخذ تلقائياً»',
      await until(() => state() === 'ready')
      && walk(box).filter((n) => n.getAttribute && n.getAttribute('data-check')).length === 3
      && byAction(box, 'ledger-authority-activate').disabled === false
      && /⏳/.test(find(box, (n) => n.getAttribute && n.getAttribute('data-check') === 'backup').textContent));

    /* فرق حقيقي: صنف بكمية بلا سطر في الدفتر */
    await idb.put('inventory', { id: 'inv-ui', name: 'قماش', quantity: 5, createdAt: Date.now(), updatedAt: Date.now() });
    await refresh();
    const reason = byRole(box, 'authority-reason');
    await t.test('2. فرق ⟵ اللوحة محظورة، الزر معطَّل، والسبب ظاهر بوضوح',
      state() === 'blocked' && byAction(box, 'ledger-authority-activate').disabled === true && !!reason && /فرق/.test(reason.textContent) && /⛔/.test(reason.textContent));
    await idb.clear('inventory');

    reportDeps.syncState = () => ({ usedCloud: true, dirtySince: Date.now() });
    await refresh();
    await t.test('3. مزامنة غير نظيفة ⟵ محظورة مع السبب', state() === 'blocked' && /لم تُرفع/.test((byRole(box, 'authority-reason') || { textContent: '' }).textContent));
    reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });
    await refresh();
    await t.test('4. زوال الأسباب ⟵ تعود جاهزة', state() === 'ready');

    byAction(box, 'ledger-authority-activate').click();
    await until(() => find(document.body, (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'خذ نسخة وفعّل'));
    clickModalButton('خذ نسخة وفعّل');
    const enabled = await until(() => state() === 'enabled', 8000);
    const flag = normalizeAuthority((await settings.get()).ledgerAuthority);
    await t.test('5. التفعيل عبر الواجهة: حالة «مفعَّل»، والمفتاح محفوظ بنسخة موجودة، وزر الإلغاء ظاهر',
      enabled && flag.enabled === true && !!flag.backupId && (await listBackups()).some((b) => b.id === flag.backupId)
      && /مفعَّل/.test(byRole(box, 'authority-state').textContent) && !!byAction(box, 'ledger-authority-deactivate') && !byAction(box, 'ledger-authority-activate'));

    byAction(box, 'ledger-authority-deactivate').click();
    await until(() => find(document.body, (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'ألغِ التفعيل' && n.getAttribute('data-action') !== 'ledger-authority-deactivate'));
    clickModalButton('ألغِ التفعيل');
    const off = await until(() => state() !== 'enabled', 8000);
    await t.test('6. الإلغاء عبر الواجهة يعيد المفتاح مغلقاً وتعود اللوحة جاهزة',
      off && normalizeAuthority((await settings.get()).ledgerAuthority).enabled === false && state() === 'ready');
  } finally {
    reportDeps.syncState = prevSync;
    if (modal.closeAll) modal.closeAll();
    for (const b of await listBackups()) if (!before.has(b.id)) await deleteBackup(b.id);
    await reset();
    await settings.update({ ledgerAuthority: prev });
  }
});
