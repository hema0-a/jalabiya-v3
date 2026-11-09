/* ==========================================================================
   v3162-integrity-relations.test.js — فحص السلامة يعرف روابط مخازن 3.12–3.16 (v3.16.2)
   ========================================================================== */
import { register } from '../registry.js';
import { scanIntegrity, ISSUE_LABELS } from '../../services/data-integrity.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const types = (r) => r.issues.map((i) => i.type).sort();
const base = { customers: [{ id: 'c1' }], orders: [{ id: 'o1', customerId: 'c1', amount: 100, deposit: 0 }], payments: [], appointments: [], quotes: [] };

register('v3.16.2 سلامة الروابط الجديدة', async (t) => {
  await t.test('1. بلا مدخلات المخازن الجديدة ⟵ السلوك القديم تماماً (لا مشاكل)', scanIntegrity(base).total === 0 && scanIntegrity({}).total === 0 && scanIntegrity().total === 0);
  await t.test('2. حالة رجوع لطلب غير موجود ⟵ تحذير aftercare_orphan_order', (() => { const r = scanIntegrity({ ...base, aftercare: [{ id: 'a1', orderId: 'gone', customerId: 'c1' }] }); return types(r).join() === 'aftercare_orphan_order' && r.issues[0].severity === 'warn' && r.issues[0].store === 'aftercare' && r.issues[0].id === 'a1' && !r.issues[0].fix; })());
  await t.test('3. طلب موجود أو في السلة ليس يتيماً', scanIntegrity({ ...base, aftercare: [{ id: 'a1', orderId: 'o1' }] }).total === 0 && scanIntegrity({ ...base, aftercare: [{ id: 'a1', orderId: 'gone' }], trashOrderIds: ['gone'] }).total === 0);
  await t.test('4. لا حكم على الحالات بلا طلبات محمَّلة (فحص جزئي)', scanIntegrity({ customers: [], orders: [], aftercare: [{ id: 'a1', orderId: 'x' }] }).total === 0);
  await t.test('5. حالة لعميل محذوف ⟵ معلومة (info) لا تحذير', (() => { const r = scanIntegrity({ ...base, aftercare: [{ id: 'a1', orderId: 'o1', customerId: 'zz' }] }); return types(r).join() === 'aftercare_missing_customer' && r.issues[0].severity === 'info'; })());
  await t.test('6. حضور لعامل غير موجود ⟵ تحذير، ويُتخطى إن لم تُمرَّر قائمة العمال', types(scanIntegrity({ ...base, workers: [{ id: 'w1' }], attendance: [{ id: 'x1', workerId: 'w9', day: '2026-06-01', status: 'absent' }, { id: 'x2', workerId: 'w1', day: '2026-06-01', status: 'half' }] })).join() === 'attendance_orphan_worker' && scanIntegrity({ ...base, attendance: [{ id: 'x1', workerId: 'w9' }] }).total === 0 && scanIntegrity({ ...base, workers: [{ id: 'w1' }] }).total === 0);
  await t.test('7. حركة مورد لمورد غير موجود ⟵ تحذير، ويُتخطى بلا قائمة الموردين', types(scanIntegrity({ ...base, suppliers: [{ id: 's1' }], supplierEntries: [{ id: 'e1', supplierId: 's9' }, { id: 'e2', supplierId: 's1' }] })).join() === 'supplier_entry_orphan' && scanIntegrity({ ...base, supplierEntries: [{ id: 'e1', supplierId: 's9' }] }).total === 0);
  await t.test('8. عدّادات الأنواع والمجموع', (() => { const r = scanIntegrity({ ...base, aftercare: [{ id: 'a1', orderId: 'g1' }, { id: 'a2', orderId: 'g2' }], workers: [], attendance: [{ id: 'x', workerId: 'w' }], suppliers: [], supplierEntries: [{ id: 'e', supplierId: 's' }] }); return r.total === 4 && r.counts.aftercare_orphan_order === 2 && r.counts.attendance_orphan_worker === 1 && r.counts.supplier_entry_orphan === 1; })());
  await t.test('9. مدخلات فاسدة (null داخل القوائم) لا تُسقط الفحص', scanIntegrity({ ...base, aftercare: [null, {}], attendance: [null], workers: [null], supplierEntries: [null], suppliers: [null] }).total === 0);
  await t.test('10. لكل نوع جديد تسمية عربية في ISSUE_LABELS', ['aftercare_orphan_order', 'aftercare_missing_customer', 'attendance_orphan_worker', 'supplier_entry_orphan'].every((k) => typeof ISSUE_LABELS[k] === 'string' && ISSUE_LABELS[k].length > 5));
  const ri = await src('services/relation-inputs.js'); const ss = await src('ui/system-status-card.js'); const dc = await src('pages/data-care.js');
  await t.test('11. المحمّل قراءة فقط ويرجع كائناً فارغاً عند الفشل', !/\.(create|update|remove|delete)\(/.test(ri) && ri.includes('catch (e) {\n    return {};') && ri.includes('supplierEntries.list()'));
  await t.test('12. البطاقة وصفحة العناية بالبيانات تمرّران المدخلات الجديدة', ss.includes('loadRelationInputs()') && ss.includes('...mi, ...rel') && dc.includes('loadRelationInputs()') && dc.includes('...mi, ...rel'));
});
