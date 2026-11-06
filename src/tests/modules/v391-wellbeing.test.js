/* ==========================================================================
   v391-wellbeing.test.js — الرفاهية المالية: تحدي الشهر · التزام مستتر · ميزانية صامتة (v3.9.1)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import {
  normalizeChallengePct, normalizeWellbeing, challengeState, descKey, detectHiddenCommitments, moodLevel,
} from '../../services/wellbeing.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);           /* 10 يونيو 2026 (30 يوماً) */
const at = (m, d) => new Date(2026, m, d, 10).getTime();
const E = (note, amount, m, d = 5, category) => ({ note, amount, date: at(m, d), category });

register('v3.9.1 الرفاهية المالية', async (t) => {
  await t.test('1. normalizeChallengePct: افتراضي وحدود', normalizeChallengePct(undefined) === 5 && normalizeChallengePct('x') === 5 && normalizeChallengePct(0) === 5 && normalizeChallengePct(999) === 50 && normalizeChallengePct(-4) === 1 && normalizeChallengePct(12.4) === 12);
  await t.test('2. normalizeWellbeing: تنظيف وإزالة المكرر', (() => { const w = normalizeWellbeing({ challengePct: 8, dismissedHidden: ['a', 'a', 5, '', 'b'] }); return w.challengePct === 8 && w.dismissedHidden.join() === 'a,b' && normalizeWellbeing(null).challengePct === 5; })());
  await t.test('3. الافتراضيات والمزامنة', DEFAULT_SETTINGS.wellbeing.challengePct === 5 && DEFAULT_SETTINGS.display.silentBudget === false && SETTINGS_SYNC_KEYS.includes('wellbeing'));
  const exp = [E('x', 1000, 4), E('y', 2000, 4), E('z', 1000, 5, 2)];     /* مايو=4: 3000 */
  const s = challengeState(exp, 10, NOW);
  await t.test('4. الشهر الماضي والهدف', s.hasBaseline && s.prevTotal === 3000 && s.target === 2700 && s.curTotal === 1000);
  await t.test('5. تحت الهدف وفي الوتيرة (1000 ≤ 2700×10/30=900؟ لا)', s.achieved === true && s.onPace === false);
  await t.test('6. المتبقي والمسموح يومياً', s.remaining === 1700 && s.dailyAllowance === 85 && s.dayNum === 10 && s.totalDays === 30);
  await t.test('7. التوقّع لنهاية الشهر', s.projected === 3000);
  await t.test('8. تجاوز الهدف', (() => { const r = challengeState([E('a', 3000, 4), E('b', 2800, 5, 3)], 10, NOW); return r.over && !r.achieved && r.remaining === 0; })());
  await t.test('9. بلا شهر ماضٍ ⟵ لا أساس', challengeState([E('a', 500, 5)], 10, NOW).hasBaseline === false && challengeState(null, 10, NOW).hasBaseline === false);
  await t.test('10. في الوتيرة: صرف قليل', challengeState([E('a', 3000, 4), E('b', 100, 5)], 10, NOW).onPace === true);
  await t.test('11. نسبة التقدّم مقصوصة عند 100', challengeState([E('a', 1000, 4), E('b', 5000, 5, 2)], 10, NOW).pct === 100);
  await t.test('12. descKey: توحيد عربي', descKey('  اشتراك  الإنترنت ') === descKey('اشتراك الانترنت') && descKey(null) === '');
  const base = [E('اشتراك الإنترنت', 300, 5, 3), E('اشتراك الإنترنت', 310, 4, 4), E('اشتراك الإنترنت', 290, 3, 5), E('مرة واحدة', 900, 5), E('مرة واحدة', 100, 4), E('مرة واحدة', 5000, 3)];
  const h = detectHiddenCommitments(base, [], [], NOW);
  await t.test('13. يكشف المتكرر المتقارب فقط', h.length === 1 && h[0].desc === 'اشتراك الإنترنت' && h[0].avgAmount === 300 && h[0].months === 3);
  await t.test('14. يستبعد ما صار التزاماً', detectHiddenCommitments(base, [{ name: 'اشتراك الانترنت' }], [], NOW).length === 0);
  await t.test('15. يستبعد المتجاهَل', detectHiddenCommitments(base, [], [descKey('اشتراك الإنترنت')], NOW).length === 0);
  await t.test('16. أقل من 3 شهور ⟵ لا', detectHiddenCommitments(base.slice(0, 2), [], [], NOW).length === 0);
  await t.test('17. مبالغ متباعدة (>20%) ⟵ لا', detectHiddenCommitments([E('س', 100, 5), E('س', 300, 4), E('س', 100, 3)], [], [], NOW).length === 0);
  await t.test('18. شهران في نفس الشهر لا يُعدّان شهرين', detectHiddenCommitments([E('ص', 100, 5, 1), E('ص', 100, 5, 2), E('ص', 100, 4)], [], [], NOW).length === 0);
  await t.test('19. خارج نافذة 6 شهور ⟵ لا', detectHiddenCommitments([E('ع', 100, 0), E('ع', 100, 1), E('ع', 100, 2)], [], [], new Date(2026, 11, 20)).length === 0);
  await t.test('20. بلا وصف أو مبلغ ⟵ يُتجاهل بلا كسر', detectHiddenCommitments([E('', 100, 5), E('', 100, 4), E('', 100, 3), null, {}], [], [], NOW).length === 0);
  await t.test('21. moodLevel: آمن/تنبيه/خطر', moodLevel(40, NOW) === 'safe' && moodLevel(30, NOW) === 'warn' && moodLevel(10, NOW) === 'danger' && moodLevel(0, NOW, false) === null);
  const ui = await src('ui/wellbeing-cards.js');
  await t.test('22. البطاقات: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
  const sb = await src('ui/silent-budget.js');
  await t.test('23. الميزانية الصامتة: طبقة لا تلتقط النقر وبلا innerHTML', sb.includes("pointerEvents: 'none'") && !/innerHTML\s*=/.test(sb));
  const he = await src('pages/house-expenses.js');
  await t.test('24. البطاقتان مربوطتان بمصاريف البيت', he.includes('buildChallengeCard()') && he.includes('buildHiddenCommitmentsCard()'));
  const ds = await src('ui/display-settings.js');
  const sw = await src('pages/settings/sections-workshop.js');
  await t.test('25. التفعيل من أوضاع العرض ويُطبَّق عند الإقلاع', ds.includes('applySilentBudget(!!d.silentBudget)') && sw.includes("'silentBudget'"));
});
