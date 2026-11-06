/* ==========================================================================
   v392-investment.test.js — خطة الاستثمار وصافي الثروة (v3.9.2)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import {
  normalizePocket, normalizeInvestment, totalPct, totalBalance, suggestedSurplus, distributeSurplus, applyDistribution,
  withdraw, setBalance, netWorth, recordNetWorth, unallocatedLastMonth, MAX_POCKETS, MAX_HISTORY, MAX_WITHDRAWALS,
} from '../../services/investment.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const P = () => [{ id: 'a', name: 'ذهب', targetPct: 50, balance: 0 }, { id: 'b', name: 'طوارئ', targetPct: 30, balance: 0 }, { id: 'c', name: 'شهادات', targetPct: 20, balance: 0 }];
const D = (m, d = 10) => new Date(2026, m, d, 12);

register('v3.9.2 الاستثمار وصافي الثروة', async (t) => {
  await t.test('1. الافتراضي والمزامنة', DEFAULT_SETTINGS.investment.pockets.length === 0 && SETTINGS_SYNC_KEYS.includes('investment'));
  await t.test('2. normalizePocket: اسم مطلوب وقصّ القيم', normalizePocket({ name: ' ' }) === null && normalizePocket(null) === null
    && (() => { const p = normalizePocket({ name: 'س', targetPct: 500, balance: -9, color: 'bad' }, 1); return p.targetPct === 100 && p.balance === 0 && /^#/.test(p.color); })());
  await t.test('3. normalizeInvestment: حد الجيوب وإزالة المكرر', (() => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, name: 'ج' + i }));
    return normalizeInvestment({ pockets: many }).pockets.length === MAX_POCKETS && normalizeInvestment({ pockets: [{ id: 'x', name: 'أ' }, { id: 'x', name: 'ب' }] }).pockets.length === 1;
  })());
  await t.test('4. مدخلات فارغة/فاسدة', normalizeInvestment(null).pockets.length === 0 && normalizeInvestment({ withdrawals: [null, { pocketId: 'a', amount: -5, date: 1 }] }).withdrawals.length === 0);
  await t.test('5. مجموع النسب والأرصدة', totalPct(P()) === 100 && totalBalance([{ balance: 5 }, { balance: 7.5 }]) === 12.5);
  await t.test('6. الفائض المقترح لا يقل عن صفر', suggestedSurplus({ income: 10000, workshopExpenses: 4000, commitments: 1000, house: 2000 }) === 3000 && suggestedSurplus({ income: 100, house: 900 }) === 0 && suggestedSurplus(null) === 0);
  await t.test('7. التوزيع بالنسب ومجموعه = المبلغ', (() => { const a = distributeSurplus(P(), 1001); return a.length === 3 && Math.round(a.reduce((s, x) => s + x.amount, 0) * 100) === 100100 && a[0].amount === 500.5; })());
  await t.test('8. تطبيع النسب إن لم تُكمل 100', (() => { const a = distributeSurplus([{ id: 'a', name: 'أ', targetPct: 40 }, { id: 'b', name: 'ب', targetPct: 40 }], 1000); return a[0].amount === 500 && a[1].amount === 500; })());
  await t.test('9. نسبة صفر لا تأخذ شيئاً، ولا نسب ⟵ فارغ', distributeSurplus([{ id: 'a', name: 'أ', targetPct: 0 }], 100).length === 0 && distributeSurplus(P(), 0).length === 0 && distributeSurplus([], 500).length === 0);
  await t.test('10. الباقي لأكبر نسبة (ثلاثة أثلاث)', (() => { const a = distributeSurplus([{ id: 'a', name: 'أ', targetPct: 1 }, { id: 'b', name: 'ب', targetPct: 1 }, { id: 'c', name: 'ج', targetPct: 1 }], 100); return Math.round(a.reduce((s, x) => s + x.amount, 0) * 100) === 10000; })());
  const inv1 = applyDistribution({ pockets: P() }, distributeSurplus(P(), 1000), D(5));
  await t.test('11. تطبيق التوزيع: أرصدة + نقطة نمو + سجل شهري', inv1.pockets[0].balance === 500 && inv1.pockets[0].history[0].ym === '2026-06' && inv1.distributions[0].amount === 1000);
  await t.test('12. توزيع ثانٍ في نفس الشهر يتراكم بلا تكرار نقطة النمو', (() => { const x = applyDistribution(inv1, distributeSurplus(inv1.pockets, 200), D(5, 20)); return x.pockets[0].balance === 600 && x.pockets[0].history.length === 1 && x.distributions.length === 1 && x.distributions[0].amount === 1200; })());
  await t.test('13. لا يعدّل المُدخل', P()[0].balance === 0 && (() => { const orig = P(); applyDistribution({ pockets: orig }, [{ id: 'a', amount: 5 }], D(5)); return orig[0].balance === 0; })());
  await t.test('14. سحب ناجح: الرصيد والسجل', (() => { const r = withdraw(inv1, 'a', 200, 'فتحت شهادة', D(5, 12)); return r.ok && r.inv.pockets[0].balance === 300 && r.inv.withdrawals.length === 1 && r.inv.withdrawals[0].reason === 'فتحت شهادة' && r.inv.withdrawals[0].pocketName === 'ذهب'; })());
  await t.test('15. سحب مرفوض: زائد/صفر/جيب مجهول', !withdraw(inv1, 'a', 600, '', D(5)).ok && !withdraw(inv1, 'a', 0, '', D(5)).ok && !withdraw(inv1, 'zz', 10, '', D(5)).ok && withdraw(inv1, 'a', 600, '', D(5)).error.includes('500'));
  await t.test('16. سحب كامل الرصيد مسموح', withdraw(inv1, 'a', 500, '', D(5)).inv.pockets[0].balance === 0);
  await t.test('17. حد سجل السحوبات', (() => { let cur = { pockets: [{ id: 'a', name: 'أ', balance: 1e6 }] }; for (let i = 0; i < MAX_WITHDRAWALS + 5; i++) cur = withdraw(cur, 'a', 1, '', D(5, 1 + (i % 25))).inv; return cur.withdrawals.length === MAX_WITHDRAWALS; })());
  await t.test('18. تصحيح الرصيد يدوياً', setBalance(inv1, 'a', 777, D(6)).pockets[0].balance === 777 && setBalance(inv1, 'a', -5, D(6)).pockets[0].balance === 0);
  await t.test('19. سجل النمو محدود بـ 24 شهراً', (() => { let cur = { pockets: [{ id: 'a', name: 'أ', balance: 0 }] }; for (let m = 0; m < 30; m++) cur = setBalance(cur, 'a', m + 1, new Date(2024, m, 1)); return cur.pockets[0].history.length === MAX_HISTORY && cur.pockets[0].history[MAX_HISTORY - 1].balance === 30; })());
  await t.test('20. صافي الثروة', (() => { const w = netWorth({ pockets: 5000, goals: 1000, inventory: 2000, debt: 3000 }); return w.assets === 8000 && w.debt === 3000 && w.net === 5000; })());
  await t.test('21. صافي الثروة سالب ممكن، وقيم فاسدة آمنة', netWorth({ pockets: 100, debt: 900 }).net === -800 && netWorth({ pockets: 'x', debt: -5 }).net === 0 && netWorth().net === 0);
  await t.test('22. recordNetWorth: يسجّل ثم يتجاهل التغيير الطفيف', (() => { const a = recordNetWorth({}, 1000, D(5)); return a.netWorthHistory[0].value === 1000 && recordNetWorth(a, 1000.2, D(5)) === null && recordNetWorth(a, 1500, D(5)).netWorthHistory[0].value === 1500 && recordNetWorth(a, 1500, D(6)).netWorthHistory.length === 2; })());
  await t.test('23. تنبيه الفائض غير الموزَّع', (() => {
    const now = D(6);                      /* يوليو، الماضي = يونيو */
    const w = unallocatedLastMonth({ pockets: P() }, 3000, now);
    const done = unallocatedLastMonth(applyDistribution({ pockets: P() }, distributeSurplus(P(), 3000), D(5)), 3000, now);
    return w && w.ym === '2026-06' && w.distributed === 0 && done === null && unallocatedLastMonth({}, 0, now) === null;
  })());
  const ui = await src('ui/investment-card.js');
  await t.test('24. البطاقة: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
  const fc = await src('pages/financial-center.js');
  await t.test('25. مربوطة بالمركز المالي', fc.includes('buildInvestmentCard()'));
});
