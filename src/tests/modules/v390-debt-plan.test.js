/* ==========================================================================
   v390-debt-plan.test.js — عدّاد التحرر واستراتيجية السداد (v3.9.0)
   ========================================================================== */
import { register } from '../registry.js';
import {
  parseMonth, endMonthFromRemaining, remainingMonths, termedCommitments, payoffOrder, freedomPlan, simulatePayoff, MAX_REMAINING,
} from '../../services/debt-plan.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 15);         /* يونيو 2026 */
const C = (id, name, amount, endMonth, extra) => ({ id, name, amount, frequency: 'monthly', endMonth, active: true, ...(extra || {}) });

register('v3.9.0 عدّاد التحرر', async (t) => {
  await t.test('1. parseMonth', parseMonth('2026-06') !== null && parseMonth('2026-13') === null && parseMonth('x') === null && parseMonth(null) === null);
  await t.test('2. endMonthFromRemaining: 1 = هذا الشهر', endMonthFromRemaining(1, NOW) === '2026-06' && endMonthFromRemaining(3, NOW) === '2026-08');
  await t.test('3. عبور السنة', endMonthFromRemaining(8, NOW) === '2027-01' && endMonthFromRemaining(20, NOW) === '2028-01');
  await t.test('4. قيم غير صالحة ⟵ null', endMonthFromRemaining(0, NOW) === null && endMonthFromRemaining('x', NOW) === null && endMonthFromRemaining(MAX_REMAINING + 1, NOW) === null && endMonthFromRemaining(2.9, NOW) === '2026-07');
  await t.test('5. remainingMonths يتناقص مع الزمن', remainingMonths({ endMonth: '2026-08' }, NOW) === 3 && remainingMonths({ endMonth: '2026-08' }, new Date(2026, 7, 1)) === 1 && remainingMonths({ endMonth: '2026-08' }, new Date(2026, 8, 1)) === 0);
  await t.test('6. بلا مدة ⟵ null', remainingMonths({}, NOW) === null && remainingMonths(null, NOW) === null);
  const list = [C('a', 'قسط ثلاجة', 1000, '2026-08'), C('b', 'قرض', 500, '2026-11'), C('c', 'إيجار', 3000, null), C('d', 'منتهٍ', 700, '2026-05'), C('e', 'مجمّد', 400, '2026-09', { active: false })];
  const tm = termedCommitments(list, NOW);
  await t.test('7. termed: النشط غير المنتهي ذو المدة فقط', tm.map((x) => x.id).join() === 'a,b');
  await t.test('8. الحسابات: المتبقي والإجمالي', tm[0].remaining === 3 && tm[0].total === 3000 && tm[1].remaining === 6 && tm[1].total === 3000);
  await t.test('9. الدورية تُحوَّل لمعادل شهري', termedCommitments([{ id: 'q', name: 'ربع', amount: 3000, frequency: 'quarterly', endMonth: '2026-08', active: true }], NOW)[0].monthly === 1000);
  await t.test('10. كرة الثلج: الأصغر إجمالياً أولاً', (() => {
    const o = payoffOrder([{ id: 'x', total: 900, monthly: 100 }, { id: 'y', total: 300, monthly: 50 }], 'snowball');
    return o[0].id === 'y' && o[0].rank === 1 && o[1].rank === 2;
  })());
  await t.test('11. الانهيار الجليدي: الأعلى قسطاً أولاً', payoffOrder([{ id: 'x', total: 900, monthly: 100 }, { id: 'y', total: 300, monthly: 50 }], 'avalanche')[0].id === 'x');
  await t.test('12. payoffOrder لا يعدّل الأصل', (() => { const a = [{ id: 'x', total: 9, monthly: 1 }, { id: 'y', total: 1, monthly: 1 }]; payoffOrder(a, 'snowball'); return a[0].id === 'x'; })());
  const fp = freedomPlan(tm, NOW);
  await t.test('13. عدّاد التحرر: 6 شهور والإجمالي 6000 والشهري 1500', fp.monthsToFree === 6 && fp.totalRemaining === 6000 && fp.monthlyNow === 1500 && fp.freeMonth === '2026-12');
  await t.test('14. جدول التخفيف: ينتهي القسط بعد 3 فيبقى 500', fp.timeline.length === 2 && fp.timeline[0].monthsFromNow === 3 && fp.timeline[0].freed === 1000 && fp.timeline[0].monthlyAfter === 500 && fp.timeline[1].monthlyAfter === 0);
  await t.test('15. قائمة فارغة', freedomPlan([], NOW).monthsToFree === 0 && simulatePayoff([], 'snowball', 100).months === 0);
  await t.test('16. محاكاة بلا إضافي: الأقساط المنتهية تُدحرج للتالي', (() => {
    const r = simulatePayoff([{ id: 'a', name: 'a', monthly: 100, remaining: 2, total: 200 }, { id: 'b', name: 'b', monthly: 100, remaining: 4, total: 400 }], 'snowball', 0);
    return r.baselineMonths === 4 && r.months === 3 && r.savedMonths === 1;
  })());
  await t.test('17. محاكاة بإضافي تقلّل المدة أكثر', (() => {
    const tmx = [{ id: 'a', name: 'a', monthly: 100, remaining: 2, total: 200 }, { id: 'b', name: 'b', monthly: 100, remaining: 4, total: 400 }];
    const r0 = simulatePayoff(tmx, 'snowball', 0); const r1 = simulatePayoff(tmx, 'snowball', 100);
    return r1.months < r0.months && r1.months >= 1;
  })());
  await t.test('18. محاكاة: المدة لا تتجاوز الأساس أبداً', (() => {
    const r = simulatePayoff(tm, 'avalanche', 0);
    return r.months <= r.baselineMonths && r.months >= 1;
  })());
  await t.test('19. محاكاة: إضافي ضخم ⟵ شهر واحد', simulatePayoff(tm, 'snowball', 1e6).months === 1);
  await t.test('20. محاكاة: إضافي سالب/نص يُعامل صفراً', simulatePayoff(tm, 'snowball', -50).extra === 0 && simulatePayoff(tm, 'snowball', 'x').extra === 0);
  const form = await src('pages/commitments-forms.js');
  await t.test('21. نموذج الالتزام: حقل الأقساط المتبقية يُحفظ كشهر نهاية', form.includes('remaining-input') && form.includes('endMonth: endMonthFromRemaining('));
  const views = await src('pages/commitments-views.js');
  await t.test('22. البطاقة مربوطة بالصفحة', views.includes('buildDebtPlanCard()'));
  const ui = await src('ui/debt-plan-card.js');
  await t.test('23. البطاقة: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
});
