/* ==========================================================================
   v3380-stock-shadow-merge.test.js — المخزون في الدفتر الظلّي + إصلاح دمج العملاء (v3.3.80)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { customers, walletOf } from '../../data/repos/customers.js';
import { inventory } from '../../data/repos/inventory.js';
import { trash } from '../../data/repos/trash.js';
import { orders } from '../../data/repos/orders.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { balanceOf } from '../../services/ledger.js';
import {
  shadowDeps, getShadowFailures, resetShadowFailures, _resetShadowState, recordStockMove,
} from '../../services/ledger-shadow.js';
import {
  ensureOpening, buildShadowReport, loadShadowReport, reportDeps, formatAmount, SHADOW_UNITS,
} from '../../services/ledger-report.js';
import { mergeCustomers } from '../../services/customer-merge-exec.js';

async function resetAll() {
  await ledgerRepo.clearAll();
  await idb.clear('customers');
  await idb.clear('inventory');
  await idb.clear('trash');
  _resetShadowState();
  resetShadowFailures();
  reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });
}
const ORIGINAL_SYNC_STATE = reportDeps.syncState;
const restoreReportDeps = () => { reportDeps.syncState = ORIGINAL_SYNC_STATE; };
const stockOf = async (id) => balanceOf(await ledgerRepo.list(), 'stock', id);

register('v3.3.80 ledger — حركات المخزون الظلّية', async (t) => {
  await resetAll();
  t.test('1. وحدة المخزون ضمن وحدات الوضع الظلّي', SHADOW_UNITS.includes('stock'));

  const it = await inventory.create({ name: 'قماش أبيض', category: 'fabric', quantity: 10, unit: 'متر' });
  let rows = await ledgerRepo.list();
  t.test('2. إنشاء صنف بكمية 10 ⟵ سطر stock_in = 10000', rows.length === 1 && rows[0].unit === 'stock' && rows[0].type === 'stock_in' && rows[0].delta === 10000 && rows[0].acct === it.id);

  const zero = await inventory.create({ name: 'زر', quantity: 0 });
  t.test('3. إنشاء صنف بكمية صفر لا يكتب شيئاً', (await ledgerRepo.count()) === 1 && (await stockOf(zero.id)) === 0);

  await inventory.adjustStock(it.id, 1);
  await inventory.adjustStock(it.id, -3);
  t.test('4. ±التعديل السريع يُسجَّل بنوعيه والرصيد 8', (await stockOf(it.id)) === 8000
    && (await ledgerRepo.list()).filter((e) => e.type === 'stock_out').length === 1);

  await inventory.update(it.id, { quantity: 12.5, name: 'قماش أبيض ممتاز' });
  t.test('5. تعديل الكمية من النموذج يُسجَّل بفرقه (4.5) والرصيد 12.5', (await stockOf(it.id)) === 12500);

  const nameOnly = await ledgerRepo.count();
  await inventory.update(it.id, { notes: 'ملاحظة' });
  t.test('6. تعديل لا يمسّ الكمية لا يكتب في الدفتر', (await ledgerRepo.count()) === nameOnly);

  /* القصّ عند الصفر: يُسجَّل الفرق الفعلي لا المطلوب */
  const few = await inventory.create({ name: 'خيط', quantity: 1 });
  await inventory.adjustStock(few.id, -5);
  t.test('7. نقص أكبر من المتاح يُقصّ عند 0 والدفتر يطابق (0 لا −4)', (await inventory.find(few.id)).quantity === 0 && (await stockOf(few.id)) === 0);
  const c0 = await ledgerRepo.count();
  await inventory.adjustStock(few.id, -1);
  t.test('8. نقص من صنف كميته صفر لا يكتب سطراً', (await ledgerRepo.count()) === c0);

  const rep = buildShadowReport([], await ledgerRepo.list(), { items: await inventory.list() });
  t.test('9. التقرير: الكميات القديمة تطابق الدفتر', rep.ok === true && rep.items === 3 && rep.mismatches === 0);

  /* حذف واسترجاع */
  const del = await inventory.find(it.id);
  await trash.addToTrash('inventory', del);
  await inventory.remove(it.id);
  t.test('10. حذف صنف يسحب كميته من الدفتر (0) ويطابق', (await stockOf(it.id)) === 0
    && buildShadowReport([], await ledgerRepo.list(), { items: await inventory.list() }).ok);
  const tr = (await trash.list()).find((x) => x.originalId === it.id);
  await trash.restore(tr.id);
  t.test('11. استرجاع الصنف من السلة يعيد كميته للدفتر (12.5) ويطابق', (await stockOf(it.id)) === 12500
    && buildShadowReport([], await ledgerRepo.list(), { items: await inventory.list() }).ok);
  const again = await recordStockMove(it.id, 12.5, { type: 'adjust', moveId: 'restore:' + tr.id });
  t.test('12. تكرار نفس معرّف الحركة لا يكرّر السطر', again.written === 0 && again.skipped === 1 && (await stockOf(it.id)) === 12500);

  /* فشل الدفتر لا يُفشل المخزون */
  const orig = shadowDeps.append;
  shadowDeps.append = () => Promise.reject(new Error('محاكاة'));
  let threw = false; let made = null;
  try { made = await inventory.create({ name: 'صنف الفشل', quantity: 4 }); await inventory.adjustStock(made.id, 2); } catch (e) { threw = true; }
  shadowDeps.append = orig;
  t.test('13. فشل الدفتر لا يُفشل إنشاء الصنف ولا تعديله', !threw && (await inventory.find(made.id)).quantity === 6);
  t.test('14. عدّاد الفشل زاد (2) والتقرير يرصد الفرق', getShadowFailures() === 2
    && buildShadowReport([], await ledgerRepo.list(), { items: await inventory.list() }).rows.some((r) => r.acct === made.id && r.kind === 'no_opening'));

  /* صفر وغير صالح */
  t.test('15. حركة صفرية أو بلا صنف لا ترمي', (await recordStockMove(it.id, 0)).written === 0 && (await recordStockMove(null, 1)).failed === 1);
  t.test('16. صيغة المقدار: 2.5 وحدة', formatAmount('stock', 2500) === '2.5 وحدة');
  resetShadowFailures();
  await resetAll();
  restoreReportDeps();
});

register('v3.3.80 ledger — افتتاح المخزون والتقرير', async (t) => {
  await resetAll();
  const a = await inventory.create({ name: 'أ', quantity: 3 });
  await idb.clear('ledger');                       /* كأنّ الصنف سبق الدفتر */
  _resetShadowState();
  const b = await idb.put('inventory', { id: 'b1', name: 'ب', quantity: 2.5, createdAt: 1 }) && { id: 'b1' };
  const rep0 = buildShadowReport([], await ledgerRepo.list(), { items: await inventory.list() });
  t.test('1. قبل الافتتاح: كل الأصناف no_opening', rep0.rows.length === 2 && rep0.rows.every((r) => r.kind === 'no_opening' && r.unit === 'stock'));
  const r1 = await ensureOpening({});
  t.test('2. الافتتاح يكتب سطراً لكل صنف بكمية', r1.status === 'written' && r1.written === 2 && (await stockOf(a.id)) === 3000 && (await stockOf(b.id)) === 2500);
  t.test('3. معرّف الافتتاح ثابت k:opening:stock:<صنف>', (await ledgerRepo.list()).some((e) => e.id === 'k:opening:stock:' + a.id));
  t.test('4. التشغيل الثاني لا يكتب شيئاً', (await ensureOpening({})).status === 'nothing');
  t.test('5. loadShadowReport يشمل الأصناف ويطابق', (await loadShadowReport()).ok === true);

  /* كمية تغيّرت بعيداً عن المستودع (مثل مزامنة/استعادة) ⟵ فرق مرصود */
  await idb.put('inventory', { ...(await inventory.find(a.id)), quantity: 9 });
  const rep = await loadShadowReport();
  t.test('6. تغيير كمية خارج المستودع يظهر فرقاً: الدفتر أقل بـ6', !rep.ok && rep.rows.length === 1 && rep.rows[0].kind === 'ledger_less' && rep.rows[0].diff === -6000);

  /* صنف حُذف خارج المستودع ⟵ حساب يتيم */
  await idb.remove('inventory', b.id);
  const rep2 = await loadShadowReport();
  t.test('7. صنف حُذف خارج المستودع ⟵ orphan_account', rep2.rows.some((r) => r.acct === b.id && r.kind === 'orphan_account'));

  /* التمرير بلا items لا يُدخل المخزون في التقرير (توافق مع 3.3.79) */
  const noItems = buildShadowReport([], await ledgerRepo.list());
  t.test('8. بلا items لا تُحسب أصناف ولا تُعدّ أيتاماً', noItems.rows.length === 0 && noItems.items === 0);

  /* ensureOpening مع customers فقط لا يفتتح المخزون */
  await ledgerRepo.clearAll(); _resetShadowState();
  const r = await ensureOpening({ customers: [] });
  t.test('9. ensureOpening({customers}) لا يمسّ المخزون', r.status === 'nothing' && (await ledgerRepo.count()) === 0);
  await resetAll();
  restoreReportDeps();
});

register('v3.3.80 ledger — دمج العملاء ينقل المحفظة', async (t) => {
  await resetAll();
  const primary = await customers.create({ name: 'عميل أساسي', phone: '01000000001', creditBalance: 100, points: 10 });
  const dup = await customers.create({ name: 'عميل مكرر', phone: '01000000001', creditBalance: 40.5, points: 7 });
  const empty = await customers.create({ name: 'مكرر فارغ', phone: '01000000001', creditBalance: 0, points: 0 });
  await ensureOpening({});
  const o = await orders.create({ customerId: dup.id, status: 'new', total: 100 });

  const res = await mergeCustomers(primary, [dup, empty]);
  const p = walletOf(await customers.find(primary.id));
  t.test('1. المحفظة المنقولة تُضاف للباقي: 140.5 جنيه و17 نقطة', p.balance === 140.5 && p.points === 17);
  t.test('2. يُبلَّغ بما نُقل (عميل واحد فقط له محفظة)', res.moved.length === 1 && res.moved[0].balance === 40.5 && res.moved[0].points === 7);
  t.test('3. المكرر حُذف من العملاء والطلب انتقل للباقي', !(await customers.find(dup.id)) && !(await customers.find(empty.id))
    && (await orders.find(o.id)).customerId === primary.id);

  const inTrash = (await trash.list()).find((x) => x.originalId === dup.id);
  const tw = walletOf(inTrash.data);
  t.test('4. سجل المكرر في السلة بمحفظة مُفرَّغة (الاسترجاع لا يضاعف المال)', tw.balance === 0 && tw.points === 0);

  const rep = await loadShadowReport();
  const ledgerOk = rep.rows.every((r) => r.kind === 'orphan_account' ? true : false);
  t.test('5. الدفتر يطابق: الباقي 140.5/17 والمدموج صفر (لا فروق غير الأيتام)', ledgerOk
    && balanceOf(await ledgerRepo.list(), 'wallet', primary.id) === 14050
    && balanceOf(await ledgerRepo.list(), 'points', primary.id) === 17
    && balanceOf(await ledgerRepo.list(), 'wallet', dup.id) === 0);
  t.test('6. المجموع قبل/بعد الدمج ثابت (لا مال مفقود ولا مكرر)', p.balance === 140.5);

  /* استرجاع المكرر من السلة لا يعيد رصيده القديم */
  await trash.restore(inTrash.id);
  t.test('7. استرجاع المكرر يعيده بصفر', walletOf(await customers.find(dup.id)).balance === 0);

  /* نقل محفظة بلا رصيد */
  const x = await customers.create({ name: 'س', creditBalance: 0, points: 0 });
  const y = await customers.create({ name: 'ص', creditBalance: 5, points: 0 });
  const nr = await customers.walletTransfer(x.id, y.id);
  t.test('8. نقل من عميل بلا محفظة لا يفعل شيئاً (moved=false)', nr.moved === false && walletOf(await customers.find(y.id)).balance === 5);

  /* فشل الخصم ⟵ عكس الإيداع وعدم الحذف */
  const m = await customers.create({ name: 'م', creditBalance: 30, points: 0 });
  const n = await customers.create({ name: 'ن', creditBalance: 10, points: 0 });
  const origAdjust = customers.walletAdjust;
  let calls = 0;
  customers.walletAdjust = async (...args) => { calls++; if (calls === 2) throw new Error('محاكاة فشل الخصم'); return origAdjust.apply(customers, args); };
  let threw = false;
  try { await mergeCustomers(n, [m]); } catch (e) { threw = true; }
  customers.walletAdjust = origAdjust;
  const mW = walletOf(await customers.find(m.id)); const nW = walletOf(await customers.find(n.id));
  t.test('9. فشل الخصم ⟵ يتوقف الدمج ولا يُحذف المكرر', threw && !!(await customers.find(m.id)));
  t.test('10. وبقي المجموع سليماً: المكرر 30 والباقي 10 (الإيداع عُكس)', mW.balance === 30 && nW.balance === 10);

  /* اتجاه نفس العميل */
  t.test('11. نقل عميل إلى نفسه مرفوض', await (async () => { try { await customers.walletTransfer(n.id, n.id); return false; } catch (e) { return true; } })());
  await resetAll();
  restoreReportDeps();
});
