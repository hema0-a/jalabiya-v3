/* ==========================================================================
   v380-production-board.test.js — لوحة الإنتاج وتركيز اليوم (v3.8.0)
   ========================================================================== */
import { register } from '../registry.js';
import { buildBoard, loadRatio, suggestWorker, canBulkMove, splitBulk, orderRow, FOCUS_LIMIT } from '../../services/production-board.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12, 0, 0).getTime();
const day = (n) => new Date(2026, 5, 10 + n, 9, 0, 0).getTime();
const W = [{ id: 'w1', name: 'أحمد' }, { id: 'w2', name: 'سعيد' }, { id: 'w3', name: 'معطّل', active: false }];
const C = [{ id: 'c1', name: 'محمد علي' }];
const O = [
  { id: 'o1', customerId: 'c1', status: 'pending', dueDate: day(-2), workerId: 'w1', items: [{ name: 'جلابية', qty: 2 }] },
  { id: 'o2', customerId: 'c1', status: 'in_progress', dueDate: day(0), workerId: 'w1', items: [{ name: 'عباية', qty: 1 }] },
  { id: 'o3', customerId: 'c1', status: 'pending', dueDate: day(5), workerId: 'w2' },
  { id: 'o4', customerId: 'c1', status: 'pending', dueDate: day(1) },
  { id: 'o5', customerId: 'c1', status: 'ready', dueDate: day(-1), workerId: 'w1' },
  { id: 'o6', customerId: 'c1', status: 'delivered', workerId: 'w2' },
  { id: 'o7', customerId: 'c1', status: 'pending', dueDate: day(9), workerId: 'w3' },
  { id: 'o8', customerId: 'c1', status: 'pending', workerId: 'ghost', urgent: true },
];

register('v3.8.0 لوحة الإنتاج', async (t) => {
  const b = buildBoard({ orders: O, workers: W, customers: C }, NOW);
  await t.test('1. الطلبات النشطة فقط (pending/in_progress)', b.totals.active === 6);
  await t.test('2. العمال النشطون فقط في اللوحة', b.workers.length === 2 && !b.workers.some((w) => w.worker.id === 'w3'));
  await t.test('3. حمل أحمد: طلبان نشطان (الجاهز لا يُحسب) وقطعتان+قطعة', (() => { const a = b.workers.find((w) => w.worker.id === 'w1'); return a.count === 2 && a.pieces === 3; })());
  await t.test('4. المتأخر يُحسب لكل عامل', b.workers.find((w) => w.worker.id === 'w1').lateCount === 1 && b.totals.late === 1);
  await t.test('5. عامل معطَّل/محذوف ⟵ غير مُسند', b.unassigned.map((r) => r.id).sort().join() === 'o4,o7,o8');
  await t.test('6. الترتيب: الأكثر حملاً أولاً', b.workers[0].worker.id === 'w1');
  await t.test('7. الأولوية داخل العامل: المتأخر ثم اليوم', b.workers[0].orders.map((r) => r.id).join() === 'o1,o2');
  await t.test('8. تركيز اليوم: متأخر + اليوم + غداً + العاجل، بلا البعيد', (() => { const ids = b.focus.map((r) => r.id); return ids.includes('o1') && ids.includes('o2') && ids.includes('o4') && ids.includes('o8') && !ids.includes('o3') && !ids.includes('o7'); })());
  await t.test('9. تركيز اليوم يبدأ بالأشد تأخراً', b.focus[0].id === 'o1');
  await t.test('10. سقف التركيز', (() => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, status: 'pending', dueDate: day(-1) }));
    return buildBoard({ orders: many, workers: [], customers: [] }, NOW).focus.length === FOCUS_LIMIT;
  })());
  await t.test('11. orderRow: بلا موعد ⟵ daysLeft null وليس متأخراً', (() => { const r = orderRow({ id: 'z', status: 'pending' }, () => 'س', NOW); return r.daysLeft === null && !r.late && r.pieces === 1; })());
  await t.test('12. مدخلات فارغة/فاسدة لا تكسر', buildBoard().totals.active === 0 && buildBoard({ orders: [null, {}], workers: [null] }, NOW).totals.active === 0);
  await t.test('13. loadRatio', loadRatio(2, 4) === 0.5 && loadRatio(5, 0) === 0 && loadRatio(9, 4) === 1);
  await t.test('14. suggestWorker: الأخفّ حملاً', suggestWorker(b).id === 'w2' && suggestWorker({ workers: [] }) === null);
  await t.test('15. canBulkMove: القواعد', canBulkMove({ status: 'pending' }, 'in_progress') && canBulkMove({ status: 'pending' }, 'ready')
    && canBulkMove({ status: 'in_progress' }, 'ready') && !canBulkMove({ status: 'in_progress' }, 'in_progress')
    && !canBulkMove({ status: 'ready' }, 'ready') && !canBulkMove({ status: 'pending' }, 'delivered') && !canBulkMove(null, 'ready'));
  await t.test('16. splitBulk يفصل المسموح والمتخطّى', (() => {
    const r = splitBulk(O, ['o1', 'o2', 'o5', 'nope'], 'in_progress');
    return r.ok.map((o) => o.id).join() === 'o1' && r.skipped.map((o) => o.id).join() === 'o2,o5';
  })());
  const ui = await src('ui/production-board.js');
  await t.test('17. الواجهة: بلا innerHTML ولا import ديناميكي، وتستعمل depositGuard والتراجع', !/innerHTML/.test(ui) && !/\bimport\(/.test(ui) && ui.includes('depositGuard(') && ui.includes('toast.undo('));
  const v = await src('pages/workers-views.js');
  await t.test('18. تبويب «الإنتاج» في صفحة العمال', v.includes("id: 'board'") && v.includes('mountProductionBoard('));
});
