/* ==========================================================================
   v3110-daily-need.test.js — الاحتياج اليومي · خط الأمان · أولوية الالتزام · وضع الشهر الصعب (v3.11.0)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import { getSmartAlerts } from '../../services/commitments-calculator.js';
import {
  PRIORITIES, normalizePriority, priorityMeta, normalizePersonalControls, filterForHardMonth,
  workDaysInLast, requiredDaily, monthProgress, safetyStatus, todaySurplus, deferrableSuggestion,
} from '../../services/daily-need.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);                       /* الأربعاء 10 يونيو 2026 */
const at = (m, d) => new Date(2026, m, d, 10).getTime();
const monthlyOf = (c) => Number(c.amount) || 0;
const base = (o) => Object.assign({ commitments: [{ amount: 3000, active: true }], houseExpenses: [{ date: at(5, 9), amount: 900 }], payments: [], monthlyOf, dayOff: 0, now: NOW }, o || {});

register('v3.11.0 الاحتياج اليومي وخط الأمان', async (t) => {
  await t.test('1. normalizePriority: الصالح كما هو وغيره ⟵ مهم', normalizePriority('essential') === 'essential' && normalizePriority('deferrable') === 'deferrable' && normalizePriority('x') === 'important' && normalizePriority(undefined) === 'important');
  await t.test('2. ثلاث أولويات بأيقونات وأسماء', PRIORITIES.length === 3 && priorityMeta('essential').icon === '🔴' && priorityMeta('deferrable').label === 'ممكن يتأجل' && priorityMeta(null).id === 'important');
  await t.test('3. normalizePersonalControls: يُفعَّل بـ true صريحة فقط', normalizePersonalControls({ hardMonth: true }).hardMonth === true && normalizePersonalControls({ hardMonth: 'yes' }).hardMonth === false && normalizePersonalControls(null).hardMonth === false);
  const list = [{ n: 1, priority: 'essential' }, { n: 2, priority: 'deferrable' }, { n: 3 }, null];
  await t.test('4. وضع الشهر الصعب معطَّل ⟵ نفس القائمة', filterForHardMonth(list, false) === list);
  await t.test('5. وضع الشهر الصعب مفعّل ⟵ الضرورية فقط (والقديم بلا أولوية «مهم» يُستبعد)', (() => { const r = filterForHardMonth(list, true); return r.length === 1 && r[0].n === 1; })());
  await t.test('6. filterForHardMonth: قيمة غير مصفوفة ⟵ مصفوفة فارغة', Array.isArray(filterForHardMonth(null, true)) && filterForHardMonth(undefined, true).length === 0);
  await t.test('7. أيام الشغل: 30 يوماً والأحد إجازة ⟵ 26', workDaysInLast(NOW, 30, 0) === 26);
  await t.test('8. أيام الشغل: بلا إجازة ⟵ 30، وإجازة بتاريخ تُخصم', workDaysInLast(NOW, 30, { weekdays: [], dates: [] }) === 30 && workDaysInLast(NOW, 30, { weekdays: [], dates: ['2026-06-09'] }) === 29);
  await t.test('9. أيام الشغل لا تقل عن 1 (لا قسمة على صفر)', workDaysInLast(NOW, 1, { weekdays: [], dates: ['2026-06-10'] }) === 1);
  const r = requiredDaily(base());
  await t.test('10. المطلوب يومياً: التزامات ÷ أيام الشغل + مصروف بيت ÷ 30', r.monthlyCommitments === 3000 && r.wdays === 26 && r.commitmentsPerDay === 115 && r.houseTotal === 900 && r.housePerDay === 30 && r.total === 145);
  await t.test('11. الالتزام غير النشط لا يُحسب', requiredDaily(base({ commitments: [{ amount: 3000, active: true }, { amount: 5000, active: false }] })).monthlyCommitments === 3000);
  await t.test('12. مصروف بيت أقدم من 30 يوماً لا يُحسب', requiredDaily(base({ houseExpenses: [{ date: at(3, 1), amount: 9999 }, { date: at(5, 9), amount: 300 }] })).houseTotal === 300);
  await t.test('13. بلا بيانات ⟵ أصفار بلا انهيار', (() => { const z = requiredDaily({ now: NOW }); return z.total === 0 && z.monthlyCommitments === 0 && z.wdays >= 1; })());
  const p = monthProgress(base({ payments: [{ createdAt: at(5, 2), amount: 1000 }, { createdAt: at(5, 10), amount: 500 }, { createdAt: at(4, 20), amount: 7777 }] }));
  await t.test('14. تقدّم الشهر: دفعات هذا الشهر فقط', p.requiredMonthly === 3900 && p.collectedMonth === 1500 && p.pct === 38 && p.remaining === 2400);
  await t.test('15. تقدّم الشهر: بلا مطلوب ⟵ null', monthProgress({ now: NOW, monthlyOf }) === null);
  await t.test('16. النسبة مقصوصة عند 100 والمتبقي صفر', (() => { const x = monthProgress(base({ payments: [{ createdAt: at(5, 2), amount: 99999 }] })); return x.pct === 100 && x.remaining === 0; })());
  await t.test('17. مستوى الأمان: آمن/تنبيه/خطر مقارنةً بمكانك من الشهر', safetyStatus(40, NOW).level === 'safe' && safetyStatus(24, NOW).level === 'warn' && safetyStatus(23, NOW).level === 'danger' && safetyStatus(40, NOW).expectedPct === 33);
  await t.test('18. فائض اليوم: دفعات اليوم − الاحتياج', (() => { const s = todaySurplus(base({ payments: [{ createdAt: at(5, 10), amount: 500 }, { createdAt: at(5, 9), amount: 800 }] })); return s.revenueToday === 500 && s.required === 145 && s.surplus === 355; })());
  await t.test('19. عجز اليوم ⟵ سالب، وبلا احتياج ⟵ null', todaySurplus(base()).surplus === -145 && todaySurplus({ now: NOW, monthlyOf }) === null);
  const dc = [{ amount: 3000, active: true }, { amount: 300, active: true, priority: 'deferrable' }];
  await t.test('20. اقتراح التأجيل: الطاقة أقل من المطلوب وعندك «ممكن يتأجل»', (() => { const s = deferrableSuggestion(base({ commitments: dc, capacity: 100 })); return s && s.count === 1 && s.deferrableTotal === 300 && s.currentTotal > s.reducedTotal && s.reducedTotal === Math.round(s.currentTotal - 300 / 26); })());
  await t.test('21. لا اقتراح إن كفت الطاقة أو لا يوجد مؤجَّل أو الالتزام غير نشط', deferrableSuggestion(base({ commitments: dc, capacity: 5000 })) === null && deferrableSuggestion(base({ capacity: 100 })) === null && deferrableSuggestion(base({ commitments: [{ amount: 3000 }, { amount: 300, active: false, priority: 'deferrable' }], capacity: 100 })) === null);
  await t.test('22. الطاقة غير الصالحة تُستبدل بالافتراضية 500', deferrableSuggestion(base({ commitments: [{ amount: 90000 }, { amount: 300, priority: 'deferrable' }], capacity: 0 })) !== null && deferrableSuggestion(base({ commitments: dc, capacity: 0 })) === null);

  const td = new Date().getDate();
  const odDay = Math.max(1, td - 1);
  const stats = { commitmentsCount: 2, paidCount: 0, overdueCount: 2, goalsCount: 0, totalGoalCurrent: 0, totalGoalTarget: 0 };
  const items = [
    { name: 'إيجار', active: true, dueDay: odDay, remaining: 100, priority: 'essential' },
    { name: 'نادي', active: true, dueDay: odDay, remaining: 100, priority: 'deferrable' },
  ];
  await t.test('23. التنبيهات بلا خيار ⟵ كما كانت (متأخران)', td === 1 || getSmartAlerts(stats, items).some((a) => a.text.startsWith('2 ')));
  await t.test('24. التنبيهات في الشهر الصعب ⟵ المتأخر الضروري فقط', td === 1 || (() => { const a = getSmartAlerts(stats, items, { hardMonth: true }); return a.some((x) => x.text.startsWith('1 ')) && !a.some((x) => x.text.includes('نادي')); })());
  await t.test('25. «ممتاز» لا يظهر في الشهر الصعب', !getSmartAlerts({ ...stats, paidCount: 2, overdueCount: 0 }, [], { hardMonth: true }).some((x) => x.text.includes('ممتاز')));
  await t.test('26. الافتراضيات والمزامنة', DEFAULT_SETTINGS.personalControls.hardMonth === false && SETTINGS_SYNC_KEYS.includes('personalControls'));

  const ui = await src('ui/daily-need-cards.js');
  await t.test('27. البطاقات: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
  await t.test('28. البطاقات تقرأ ولا تكتب إلا مفتاح الشهر الصعب', !/\.(create|delete|remove)\(/.test(ui) && ui.includes("settings.update({ personalControls:"));
  const views = await src('pages/commitments-views.js');
  await t.test('29. البطاقات مربوطة بصفحة الالتزامات وتنبيهاتها تمرّر الشهر الصعب', views.includes('buildDailyNeedCards()') && views.includes('{ hardMonth: !!state.hardMonth }'));
  const forms = await src('pages/commitments-forms.js');
  await t.test('30. نموذج الالتزام: حقل الأهمية يُحفظ مُنقّى', forms.includes("'data-role': 'priority-select'") && forms.includes('priority: normalizePriority(prioSelect.value)'));
  const load = await src('pages/commitments-load.js');
  await t.test('31. تحميل الصفحة يقرأ وضع الشهر الصعب', load.includes('state.hardMonth = normalizePersonalControls('));
  const nc = await src('ui/notifications-center.js');
  await t.test('32. مركز الإشعارات يحترم الشهر الصعب', nc.includes('filterForHardMonth(activeCommitments, hardMonth)'));
});
