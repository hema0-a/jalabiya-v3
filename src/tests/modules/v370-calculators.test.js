/* ==========================================================================
   v370-calculators.test.js — حاسبة القماش + محاكي «ماذا لو» (v3.7.0)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import {
  normalizeTemplate, normalizeFabricConfig, perPieceCm, calcFabric, formulaText, MAX_TEMPLATES,
} from '../../services/fabric-calc.js';
import { simulate, loanInstallment, normalizeScenario, surplusOf } from '../../services/whatif.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const T = { id: 'a', name: 'جلابية', addCm: 10, multiplier: 2, subtractCm: 30 };

register('v3.7.0 حاسبة القماش', async (t) => {
  await t.test('1. المعادلة: (150+10)×2−30 = 290 سم', perPieceCm(T, 150) === 290);
  await t.test('2. لا تقل عن صفر', perPieceCm({ addCm: 0, multiplier: 1, subtractCm: 500 }, 100) === 0);
  await t.test('3. العدد يضاعف الكمية', calcFabric(T, 150, 3, {}).totalM === 8.7);
  await t.test('4. الهالك 10% يزيد الإجمالي', calcFabric(T, 150, 1, { wastePercent: 10 }).totalM === 3.19);
  await t.test('5. التقريب لأعلى لأقرب 0.5', calcFabric(T, 150, 1, { roundTo: 0.5 }).billedM === 3);
  await t.test('6. التقريب لا يغيّر الرقم المضبوط', calcFabric({ addCm: 0, multiplier: 1, subtractCm: 0 }, 300, 1, { roundTo: 0.5 }).billedM === 3);
  await t.test('7. التكلفة = الأمتار × سعر المتر', calcFabric(T, 150, 1, {}, 100).cost === 290);
  await t.test('8. بلا سعر ⟵ تكلفة 0', calcFabric(T, 150, 1, {}).cost === 0);
  await t.test('9. عدد غير صالح ⟵ 1', calcFabric(T, 150, 0, {}).qty === 1 && calcFabric(T, 150, 'x', {}).qty === 1);
  await t.test('10. قالب بلا اسم مرفوض', normalizeTemplate({ name: '  ' }) === null && normalizeTemplate(null) === null);
  await t.test('11. قصّ القيم المتطرفة', (() => { const x = normalizeTemplate({ name: 'ب', addCm: 9999, multiplier: 99, subtractCm: -5 }); return x.addCm === 500 && x.multiplier === 10 && x.subtractCm === 0; })());
  await t.test('12. normalizeFabricConfig: حد القوالب وإزالة المكرر', (() => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: 'i' + i, name: 'n' + i }));
    return normalizeFabricConfig({ templates: many }).templates.length === MAX_TEMPLATES
      && normalizeFabricConfig({ templates: [T, T] }).templates.length === 1;
  })());
  await t.test('13. قيم فاسدة ⟵ افتراضيات آمنة', (() => { const c = normalizeFabricConfig({ wastePercent: 'x', roundTo: 7 }); return c.wastePercent === 0 && c.roundTo === 0; })());
  await t.test('14. الهالك مقصوص عند 50', normalizeFabricConfig({ wastePercent: 500 }).wastePercent === 50);
  await t.test('15. formulaText', formulaText(T, 150) === '(150 + 10) × 2 − 30');
  await t.test('16. الافتراضي في config ومفتاح التزامن', DEFAULT_SETTINGS.fabricCalc.templates.length === 0 && SETTINGS_SYNC_KEYS.includes('fabricCalc'));
  const dlg = await src('ui/fabric-calc-dialog.js');
  await t.test('17. النافذة: static imports وبلا innerHTML', !/innerHTML/.test(dlg) && !/\bimport\(/.test(dlg));
  const pc = await src('pages/pricing-calculator.js');
  await t.test('18. زر الحاسبة في حاسبة التسعير', pc.includes('openFabricCalcDialog') && pc.includes("'fabric-calc'"));
});

register('v3.7.0 محاكي ماذا لو', async (t) => {
  const B = { income: 10000, workshopExpenses: 4000, commitments: 1000, house: 2000 };
  await t.test('1. الفائض الأساسي', surplusOf(B) === 3000 && simulate(B, {}).surplusBefore === 3000);
  await t.test('2. سيناريو فارغ ⟵ بلا تغيير', (() => { const r = simulate(B, {}); return r.monthlyDelta === 0 && r.verdict === 'same'; })());
  await t.test('3. زيادة دخل 10%', simulate(B, { incomePct: 10 }).monthlyDelta === 1000);
  await t.test('4. التزام جديد 500', (() => { const r = simulate(B, { newCommitment: 500 }); return r.monthlyDelta === -500 && r.verdict === 'worse' && r.yearlyDelta === -6000; })());
  await t.test('5. خفض البيت 10%', simulate(B, { housePct: -10 }).monthlyDelta === 200);
  await t.test('6. قسط القرض بدون فائدة', loanInstallment(12000, 12, 0) === 1000);
  await t.test('7. قسط القرض بفائدة 20%', loanInstallment(12000, 12, 20) === 1200);
  await t.test('8. مدة صفر ⟵ قسط 0', loanInstallment(1000, 0, 0) === 0);
  await t.test('9. عجز بعد السيناريو', simulate(B, { newCommitment: 4000 }).negativeAfter === true);
  await t.test('10. مدخلات فاسدة تُقصّ', (() => { const s = normalizeScenario({ incomePct: 'x', expensePct: -500, loanMonths: 9999 }); return s.incomePct === 0 && s.expensePct === -100 && s.loanMonths === 120; })());
  await t.test('11. خط أساس فاسد لا يكسر', simulate(null, null).surplusAfter === 0);
  const fc = await src('pages/financial-center.js');
  await t.test('12. البطاقة مربوطة في المركز المالي', fc.includes('buildWhatIfCard()'));
  const card = await src('ui/whatif-card.js');
  await t.test('13. البطاقة بلا innerHTML', !/innerHTML/.test(card));
});
