/* ==========================================================================
   v3111-daily-tip.test.js — نصيحة اليوم المالية + المحفوظات ⭐ (v3.11.1)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import {
  GENERIC_TIPS, MAX_SAVED, dayOfYear, dynamicTips, tipPool, pickTip, normalizeDailyTips, saveTip, removeTip,
} from '../../services/daily-tip.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);
const at = (m, d) => new Date(2026, m, d, 10).getTime();

register('v3.11.1 نصيحة اليوم المالية', async (t) => {
  await t.test('1. مكتبة عامة: 25 نصيحة غير مكررة وغير فارغة', GENERIC_TIPS.length === 25 && new Set(GENERIC_TIPS).size === 25 && GENERIC_TIPS.every((x) => typeof x === 'string' && x.length > 10));
  await t.test('2. dayOfYear: 1 يناير = 1، و10 يونيو 2026 = 161', dayOfYear(new Date(2026, 0, 1)) === 1 && dayOfYear(NOW) === 161);
  await t.test('3. pickTip ثابتة في اليوم نفسه مهما اختلفت الساعة', pickTip(GENERIC_TIPS, new Date(2026, 5, 10, 1)) === pickTip(GENERIC_TIPS, new Date(2026, 5, 10, 23)));
  await t.test('4. pickTip: offset يغيّرها ويلتفّ على الحوض', pickTip(GENERIC_TIPS, NOW, 1) !== pickTip(GENERIC_TIPS, NOW, 0) && pickTip(GENERIC_TIPS, NOW, GENERIC_TIPS.length) === pickTip(GENERIC_TIPS, NOW, 0) && typeof pickTip(GENERIC_TIPS, NOW, -3) === 'string');
  await t.test('5. pickTip: حوض فارغ/غير صالح ⟵ العامة بلا انهيار', typeof pickTip([], NOW) === 'string' && typeof pickTip(null, NOW) === 'string');
  const he = [{ date: at(4, 5), amount: 1000 }, { date: at(5, 3), amount: 1300 }];
  await t.test('6. مصروف البيت أعلى بأكثر من 15% ⟵ نصيحة بالنسبة', dynamicTips({ houseExpenses: he, now: NOW }).some((x) => x.includes('30%')));
  await t.test('7. أقل من 15% أو بلا شهر سابق ⟵ لا نصيحة', dynamicTips({ houseExpenses: [{ date: at(4, 5), amount: 1000 }, { date: at(5, 3), amount: 1100 }], now: NOW }).length === 0 && dynamicTips({ houseExpenses: [{ date: at(5, 3), amount: 1300 }], now: NOW }).length === 0);
  await t.test('8. التزامات تنتهي خلال شهرين ⟵ نصيحة بالعدد (النشطة فقط)', (() => { const rem = (c) => c.r; const r = dynamicTips({ commitments: [{ r: 1 }, { r: 2 }, { r: 3 }, { r: 0 }, { r: null }, { r: 1, active: false }], remainingMonthsOf: rem, now: NOW }); return r.length === 1 && r[0].includes('2 التزام'); })());
  await t.test('9. هبوط صافي الثروة أكثر من 5% ⟵ نصيحة', dynamicTips({ netWorthHistory: [{ ym: '2026-04', value: 1000 }, { ym: '2026-05', value: 900 }], now: NOW }).length === 1 && dynamicTips({ netWorthHistory: [{ value: 1000 }, { value: 980 }], now: NOW }).length === 0);
  await t.test('10. بيانات فاسدة ⟵ لا كسر', dynamicTips({ houseExpenses: [null, {}, { date: 'x', amount: 'y' }], commitments: [null], netWorthHistory: [null, undefined], remainingMonthsOf: () => { throw new Error('x'); }, now: NOW }).length === 0 && dynamicTips(null).length === 0);
  await t.test('11. الحوض: نصائح بياناتك أولاً ثم العامة', (() => { const p = tipPool({ houseExpenses: he, now: NOW }); return p.length === 26 && p[0].includes('30%') && p[1] === GENERIC_TIPS[0]; })());
  await t.test('12. normalizeDailyTips: ينقّي ويزيل المكرر ويقصّ', (() => { const r = normalizeDailyTips({ saved: [{ id: 'a', text: ' نص  <b>1</b> ', date: '2026-06-10T00:00' }, { id: 'b', text: 'نص b 1 /b' }, { id: 'c', text: '' }, { id: '', text: 'بلا معرّف' }, null, { id: 'd', text: 'س'.repeat(900) }] }); return r.saved.length === 2 && r.saved[0].text === 'نص b 1 /b' && r.saved[0].date === '2026-06-10' && r.saved[1].text.length === 400; })());
  await t.test('13. normalizeDailyTips: مدخل فاسد ⟵ قائمة فارغة', normalizeDailyTips(null).saved.length === 0 && normalizeDailyTips({ saved: 'x' }).saved.length === 0);
  await t.test('14. saveTip: يضيف الأحدث أولاً', (() => { const a = saveTip([], 'نصيحة أ', 'i1', '2026-06-10'); const b = saveTip(a.saved, 'نصيحة ب', 'i2', '2026-06-10'); return a.added && b.added && b.saved[0].text === 'نصيحة ب' && b.saved.length === 2; })());
  await t.test('15. saveTip: مكررة أو فارغة ⟵ لا تُضاف', (() => { const a = saveTip([], 'نصيحة', 'i1', ''); return !saveTip(a.saved, ' نصيحة ', 'i2', '').added && !saveTip(a.saved, '   ', 'i3', '').added; })());
  await t.test('16. saveTip: حد أقصى 30', (() => { let s = []; for (let i = 0; i < 35; i++) s = saveTip(s, 'نصيحة رقم ' + i, 'id' + i, '').saved; return s.length === MAX_SAVED && s[0].text === 'نصيحة رقم 34'; })());
  await t.test('17. removeTip: يحذف بالمعرّف فقط', (() => { let s = saveTip([], 'أ', 'x', '').saved; s = saveTip(s, 'ب', 'y', '').saved; const r = removeTip(s, 'x'); return r.length === 1 && r[0].id === 'y' && removeTip(s, 'zzz').length === 2; })());
  await t.test('18. الافتراضيات والمزامنة', Array.isArray(DEFAULT_SETTINGS.dailyTips.saved) && DEFAULT_SETTINGS.dailyTips.saved.length === 0 && SETTINGS_SYNC_KEYS.includes('dailyTips'));
  const ui = await src('ui/daily-tip-card.js');
  await t.test('19. البطاقة: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
  await t.test('20. البطاقة تكتب المحفوظات فقط ولا تلمس البيانات المالية', ui.includes('settings.update({ dailyTips:') && !/(houseExpenses|commitments)\.(create|update|delete|remove)\(/.test(ui));
  await t.test('21. نصيحة اليوم تُثبَّت محلياً بتخزين مغلَّف بـ try/catch', ui.includes("'jalabiya_v3_daily_tip'") && /try \{ const c = JSON\.parse\(localStorage/.test(ui) && /try \{ localStorage\.setItem/.test(ui));
  const fc = await src('pages/financial-center.js');
  await t.test('22. البطاقة مربوطة بالمركز المالي بعد النصائح الذكية', fc.indexOf('renderTips()') < fc.indexOf('buildDailyTipCard()') && fc.indexOf('buildDailyTipCard()') < fc.indexOf('buildWhatIfCard()'));
});
