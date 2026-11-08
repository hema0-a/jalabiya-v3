/* ==========================================================================
   v3120-suppliers.test.js — الموردون والمشتريات (v3.12.0)
   ========================================================================== */
import { register } from '../registry.js';
import { STORES, DB_CONFIG } from '../../core/config.js';
import { SCHEMA } from '../../data/schema.js';
import { RECORD_STORES } from '../../data/record-meta.js';
import { SYNC_STORES } from '../../sync/firestore-sync.js';
import { NAV_IDS, groupIdOf } from '../../services/nav-groups.js';
import { canAccess, FINANCE_LOCK_PAGES } from '../../services/roles.js';
import {
  KINDS, normalizeKind, checkSupplierInput, checkEntryInput, entryPricePerMeter,
  supplierBalance, balancesBySupplier, totalOwed, monthSummary, priceBoard,
} from '../../services/suppliers.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);
const at = (m, d) => new Date(2026, m, d, 10).getTime();
const S = [{ id: 's1', name: 'مصنع النيل' }, { id: 's2', name: 'تاجر القماش' }, { id: 's3', name: 'محل الأمل' }];
const E = [
  { supplierId: 's1', kind: 'purchase', amount: 1000, meters: 50, item: 'قماش أبيض', date: at(4, 1) },
  { supplierId: 's1', kind: 'payment', amount: 400, date: at(4, 5) },
  { supplierId: 's1', kind: 'purchase', amount: 1200, meters: 50, item: 'قماش  أبيض', date: at(5, 2) },
  { supplierId: 's2', kind: 'purchase', amount: 900, meters: 50, item: 'قماش ابيض', date: at(5, 3) },
  { supplierId: 's2', kind: 'payment', amount: 1000, date: at(5, 4) },
];

register('v3.12.0 الموردون والمشتريات', async (t) => {
  await t.test('1. نوعان: مشتريات ودفعة، وأي قيمة غريبة ⟵ مشتريات', KINDS.length === 2 && normalizeKind('payment') === 'payment' && normalizeKind('x') === 'purchase' && normalizeKind(undefined) === 'purchase');
  await t.test('2. checkSupplierInput: الاسم مطلوب ويُنقّى والهاتف يُنظَّف', (() => {
    const bad = checkSupplierInput({ name: '   ' });
    const ok = checkSupplierInput({ name: ' مصنع <b>النيل</b> ', phone: '010-1234 5678abc', notes: 'ملاحظة' });
    return !bad.ok && bad.error && ok.ok && ok.data.name === 'مصنع b النيل /b' && ok.data.phone === '01012345678' && ok.data.notes === 'ملاحظة';
  })());
  await t.test('3. checkSupplierInput: مدخل فاسد ⟵ رفض بلا انهيار', !checkSupplierInput(null).ok && !checkSupplierInput({ name: 5 }).ok);
  await t.test('4. checkEntryInput: المبلغ لازم موجب ومعقول', !checkEntryInput({ amount: 0 }).ok && !checkEntryInput({ amount: -5 }).ok && !checkEntryInput({ amount: 'abc' }).ok && !checkEntryInput({ amount: 1e9 }).ok && checkEntryInput({ amount: '12.345' }).data.amount === 12.35);
  await t.test('5. checkEntryInput: المشتريات تحمل الصنف والأمتار، والدفعة لا', (() => {
    const p = checkEntryInput({ kind: 'purchase', amount: 100, item: ' قماش ', meters: '5.5' });
    const d = checkEntryInput({ kind: 'payment', amount: 100, item: 'x', meters: 9 });
    return p.data.item === 'قماش' && p.data.meters === 5.5 && d.data.kind === 'payment' && !('item' in d.data) && !('meters' in d.data);
  })());
  await t.test('6. checkEntryInput: أمتار سالبة مرفوضة وفارغة = 0', !checkEntryInput({ kind: 'purchase', amount: 10, meters: -2 }).ok && checkEntryInput({ kind: 'purchase', amount: 10, meters: '' }).data.meters === 0);
  await t.test('7. سعر المتر: المبلغ ÷ الأمتار للمشتريات فقط', entryPricePerMeter(E[0]) === 20 && entryPricePerMeter(E[1]) === null && entryPricePerMeter({ kind: 'purchase', amount: 10, meters: 0 }) === null && entryPricePerMeter(null) === null);
  await t.test('8. رصيد مورد: مشتريات − دفعات وآخر تاريخ', (() => { const b = supplierBalance(E.filter((e) => e.supplierId === 's1')); return b.purchased === 2200 && b.paid === 400 && b.owed === 1800 && b.count === 3 && b.lastDate === at(5, 2); })());
  await t.test('9. الدفع الزائد ⟵ رصيد سالب (له عندك)', supplierBalance(E.filter((e) => e.supplierId === 's2')).owed === -100);
  await t.test('10. حركات فاسدة أو بمبلغ صفر تُهمَل', supplierBalance([null, {}, { kind: 'purchase', amount: 0 }, { kind: 'purchase', amount: 50 }]).owed === 50 && supplierBalance(null).owed === 0);
  const rows = balancesBySupplier(S, E);
  await t.test('11. الأرصدة مرتّبة: الأكثر مستحقاً أولاً', rows[0].supplier.id === 's1' && rows[0].owed === 1800 && rows[rows.length - 1].supplier.id === 's2');
  await t.test('12. مورد بلا حركات يظهر برصيد صفر', (() => { const r = rows.find((x) => x.supplier.id === 's3'); return r && r.owed === 0 && r.count === 0 && r.lastPricePerMeter === null; })());
  await t.test('13. آخر سعر متر للمورد هو الأحدث تاريخاً', rows.find((x) => x.supplier.id === 's1').lastPricePerMeter === 24);
  await t.test('14. حركات بمورد غير موجود تُهمَل ولا تنهار', balancesBySupplier(S, [{ supplierId: 'zz', kind: 'purchase', amount: 5 }, null]).every((r) => r.owed === 0) && balancesBySupplier(null, null).length === 0);
  await t.test('15. إجمالي المستحق: الأرصدة الموجبة فقط (السالب لا يخصم)', totalOwed(rows) === 1800 && totalOwed(null) === 0);
  await t.test('16. ملخص الشهر: مشتريات ودفعات هذا الشهر فقط', (() => { const m = monthSummary(E, NOW); return m.purchased === 2100 && m.paid === 1000; })());
  const board = priceBoard(S, E);
  await t.test('17. لوحة الأسعار: الصنف نفسه يُدمَج رغم اختلاف الهمزة والمسافات', board.length === 1 && board[0].rows.length === 2);
  await t.test('18. الأرخص أولاً وعليه علامة، والفرق صحيح', board[0].cheapestId === 's2' && board[0].rows[0].lastPrice === 18 && board[0].rows[1].lastPrice === 24 && board[0].spread === 6);
  await t.test('19. متوسط سعر المورد على كل مشترياته من الصنف', (() => { const r = board[0].rows.find((x) => x.supplierId === 's1'); return r.count === 2 && r.avgPrice === 22 && r.lastPrice === 24; })());
  await t.test('20. صنف عند مورد واحد: بلا أرخص ولا فرق', (() => { const b = priceBoard(S, [E[0]]); return b.length === 1 && b[0].cheapestId === null && b[0].spread === 0; })());
  await t.test('21. بلا صنف أو بلا أمتار ⟵ لا تدخل اللوحة', priceBoard(S, [{ supplierId: 's1', kind: 'purchase', amount: 100, meters: 5, item: '' }, { supplierId: 's1', kind: 'purchase', amount: 100, item: 'x' }]).length === 0);
  await t.test('22. الأصناف متعددة الموردين أولاً ثم حد أقصى', (() => {
    const e2 = E.concat([{ supplierId: 's3', kind: 'purchase', amount: 50, meters: 5, item: 'خيط', date: at(5, 9) }]);
    const b = priceBoard(S, e2); const b1 = priceBoard(S, e2, { max: 1 });
    return b.length === 2 && b[0].rows.length === 2 && b1.length === 1;
  })());
  await t.test('23. المخزنان مسجَّلان في STORES والمخطط مع فهارسهما', STORES.SUPPLIERS === 'suppliers' && STORES.SUPPLIER_ENTRIES === 'supplierEntries' && SCHEMA.suppliers && SCHEMA.supplierEntries.indexes.some((i) => i.name === 'by_supplierId') && SCHEMA.supplierEntries.indexes.every((i) => i.keyPath !== 'active'));
  await t.test('24. إصدار القاعدة 13 على الأقل', DB_CONFIG.version >= 13);
  await t.test('25. المخزنان في قائمتي المزامنة والسجلات متطابقتين', ['suppliers', 'supplierEntries'].every((k) => RECORD_STORES.includes(k) && SYNC_STORES.includes(k)) && RECORD_STORES.length === SYNC_STORES.length);
  const bk = await src('pages/settings/section-backup-io.js');
  await t.test('26. المخزنان في تصدير واستيراد النسخ الاحتياطي (الموضعين)', (bk.match(/'suppliers', 'supplierEntries'/g) || []).length === 2);
  await t.test('27. الصفحة في القائمة (مجموعة الورشة) ومحميّة بالقفل المالي', NAV_IDS.has('suppliers') && groupIdOf('suppliers') === 'workshop' && FINANCE_LOCK_PAGES.includes('suppliers'));
  await t.test('28. الصلاحيات: المالك والمدير نعم، الاستقبال لا', canAccess('owner', 'suppliers') && canAccess('manager', 'suppliers') && !canAccess('receptionist', 'suppliers'));
  const main = await src('main.js');
  await t.test('29. الراوتر يحمّل الصفحة وخريطة التصدير موجودة', main.includes("case 'suppliers':          return await import('./pages/suppliers.js');") && main.includes("suppliers:            'suppliersPage'"));
  const page = await src('pages/suppliers.js'); const forms = await src('pages/suppliers-forms.js');
  await t.test('30. الصفحة والنماذج: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(page + forms) && !/\bimport\(/.test(page + forms));
  await t.test('31. تسجيل المشتريات كمصروف اختياري ولا تُسجَّل الدفعات كمصروف', forms.includes("data-role': 'entry-as-expense'") && forms.includes('if (isPurchase && expenseCb && expenseCb.checked)') && (forms.match(/expenses\.create\(/g) || []).length === 1 && forms.includes("category: 'fabric'"));
  await t.test('32. حذف الحركة يحذف مصروفها المرتبط فقط إن وُجد (expenseId)', forms.includes('if (entry.expenseId) await expenses.remove(entry.expenseId)'));
  await t.test('33. حذف المورد يحذف حركاته ويُبقي المصروفات المسجَّلة', forms.includes('supplierEntries.listBySupplier(supplier.id)') && forms.includes('المصروفات المسجَّلة من مشترياته تبقى'));
});
