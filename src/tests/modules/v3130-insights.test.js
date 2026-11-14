/* ==========================================================================
   v3130-insights.test.js — تحليلات 3.13.0: مقارنة الفئات · توزيع المصروفات · أداء الاستلام ·
   قوة كلمة المرور · الطلب الكبير · المُرشِّحون · خريطة الالتزامات · مستحقات الموردين · عقود الربط
   ========================================================================== */
import { register } from '../registry.js';
import { getPeriodRange } from '../../data/repos/house-expenses.js';
import { HOUSE_EXPENSE_CATEGORIES } from '../../core/config.js';
import {
  MONTH_NAMES_AR, compareCategories, breakdownByCategory, pickupStats, passwordStrength,
  highValueThreshold, isHighValue, referrerInsights, annualMap,
} from '../../services/insights.js';
import { overdueSupplierDues } from '../../services/suppliers.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);
const at = (m, d) => new Date(2026, m, d, 10).getTime();
const DAY = 86400000;

register('v3.13.0 التحليلات والتحسينات', async (t) => {
  /* ---- مقارنة الفئات ---- */
  const ex = [
    { date: at(5, 3), amount: 300, category: 'food' }, { date: at(4, 3), amount: 200, category: 'food' },
    { date: at(5, 4), amount: 100, category: 'bills' }, { date: at(3, 1), amount: 999, category: 'food' },
    { date: at(4, 9), amount: 400, category: 'transport' }, null, { amount: 5 },
  ];
  const cmp = compareCategories(ex, NOW, HOUSE_EXPENSE_CATEGORIES);
  await t.test('1. مقارنة الفئات: شهران فقط، والأكبر تغيّراً أولاً', cmp.rows.length === 3 && cmp.rows[0].id === 'transport' && cmp.rows[0].delta === -400);
  await t.test('2. نسبة التغيّر؛ وفئة جديدة بلا شهر سابق ⟵ null', cmp.rows.find((r) => r.id === 'food').pct === 50 && cmp.rows.find((r) => r.id === 'bills').pct === null);
  await t.test('3. إجمالي الشهرين والفرق', cmp.totals.thisMonth === 400 && cmp.totals.lastMonth === 600 && cmp.totals.delta === -200);
  await t.test('4. مقارنة بلا بيانات أو بيانات فاسدة ⟵ فارغة بلا انهيار', compareCategories(null, NOW).rows.length === 0 && compareCategories([null, {}], NOW, []).totals.delta === 0);
  await t.test('5. فئة غير معروفة تُنسب إلى «أخرى»', compareCategories([{ date: at(5, 1), amount: 5, category: 'zzz' }], NOW, HOUSE_EXPENSE_CATEGORIES).rows[0].label === 'أخرى');
  await t.test('6. مقارنة يناير تقرأ ديسمبر السنة السابقة', compareCategories([{ date: new Date(2025, 11, 20).getTime(), amount: 70, category: 'food' }, { date: new Date(2026, 0, 5).getTime(), amount: 100, category: 'food' }], new Date(2026, 0, 15), HOUSE_EXPENSE_CATEGORIES).rows[0].lastMonth === 70);

  /* ---- توزيع المصروفات ---- */
  const bd = breakdownByCategory([{ category: 'fabric', amount: 600 }, { category: 'rent', amount: 300 }, { category: 'water', amount: 100 }, { amount: 0 }, null], (id) => id.toUpperCase());
  await t.test('7. التوزيع: مرتّب بالأكبر ونسب الإجمالي', bd.total === 1000 && bd.rows[0].id === 'fabric' && bd.rows[0].pct === 60 && bd.rows[0].label === 'FABRIC');
  await t.test('8. أكثر من الحد ⟵ الباقي في «أخرى» ومجموع النسب 100', (() => { const e = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c, i) => ({ category: c, amount: 100 - i })); const r = breakdownByCategory(e, (x) => x, 4); return r.rows.length === 4 && r.rows[3].id === '_rest' && r.rows.reduce((s, x) => s + x.pct, 0) >= 99; })());
  await t.test('9. توزيع بلا مبالغ ⟵ صفر وصفوف فارغة', breakdownByCategory([], (x) => x).total === 0 && breakdownByCategory(null).rows.length === 0);

  /* ---- أداء الاستلام ---- */
  const pk = pickupStats([
    { status: 'delivered', readyAt: at(5, 1), deliveredAt: at(5, 3) }, { status: 'delivered', readyAt: at(5, 1), deliveredAt: at(5, 9) },
    { status: 'delivered', readyAt: at(5, 5), deliveredAt: at(5, 6) }, { status: 'ready', readyAt: at(5, 1) },
    { status: 'delivered', readyAt: at(5, 8) }, { status: 'delivered', readyAt: at(5, 9), deliveredAt: at(5, 8) },
  ], NOW);
  await t.test('10. أداء الاستلام: العينة المكتملة فقط (جاهز وسُلّم بتاريخ منطقي)', pk.sample === 3);
  await t.test('11. متوسط الانتظار ونسبة الاستلام خلال 3 أيام وأطول انتظار', pk.avgWaitDays === 3.7 && pk.within3Pct === 67 && pk.over7Count === 1 && pk.longestDays === 8);
  await t.test('12. بلا عينة أو خارج النافذة ⟵ null', pickupStats([], NOW) === null && pickupStats(null, NOW) === null && pickupStats([{ status: 'delivered', readyAt: NOW.getTime() - 200 * DAY, deliveredAt: NOW.getTime() - 199 * DAY }], NOW) === null);

  /* ---- كلمة المرور ---- */
  await t.test('13. كلمة فارغة ⟵ درجة 0 بلا نصائح', (() => { const r = passwordStrength(''); return r.score === 0 && r.tips.length === 0 && passwordStrength(null).score === 0; })());
  await t.test('14. كلمات شائعة/متسلسلة/مكررة ضعيفة (1) مع تنبيه', ['password', '123456', '12345678', 'aaaaaaaa', 'Qwerty'].every((p) => passwordStrength(p).score === 1) && passwordStrength('password').tips.some((x) => x.includes('شائعة')));
  await t.test('15. قصيرة ⟵ نصيحة الطول', passwordStrength('ab1').tips.some((x) => x.includes('8')));
  await t.test('16. متوسطة وجيدة وقوية بترتيب تصاعدي', passwordStrength('abcdefgh').score < passwordStrength('Abcdefg1').score && passwordStrength('Abcdefg1').score <= passwordStrength('Tr0ub4dor&3xyz!').score && passwordStrength('Tr0ub4dor&3xyz!').score === 4);
  await t.test('17. الدرجة بين 1 و4 لأي كلمة غير فارغة، ولكل درجة لون وتسمية', ['a', 'zzzzzzzzzzzzzzzz', 'ح', 'Ab1!Ab1!Ab1!'].every((p) => { const r = passwordStrength(p); return r.score >= 1 && r.score <= 4 && r.label && r.color; }));

  /* ---- الطلب الكبير ---- */
  const base = Array.from({ length: 10 }, (_, i) => ({ amount: 100 + i * 10, createdAt: at(5, 1), status: 'new' }));
  const th = highValueThreshold(base, NOW);
  await t.test('18. حدّ الطلب الكبير من توزيع طلباتك (≥ P90 و1.5×الوسيط)', th === 225);
  await t.test('19. عينة صغيرة (أقل من 8) ⟵ لا حدّ (لا شارات)', highValueThreshold(base.slice(0, 7), NOW) === Infinity && isHighValue({ amount: 1e9 }, Infinity) === false);
  await t.test('20. isHighValue: عند الحد وأكثر فقط، والصفر والفارغ لا', isHighValue({ amount: th }, th) && !isHighValue({ amount: th - 1 }, th) && !isHighValue(null, th) && !isHighValue({ amount: 0 }, 0));
  await t.test('21. الملغاة والقديمة (أكثر من 180 يوماً) خارج الحساب', highValueThreshold(base.map((o) => ({ ...o, status: 'cancelled' })), NOW) === Infinity && highValueThreshold(base.map((o) => ({ ...o, createdAt: NOW.getTime() - 400 * DAY })), NOW) === Infinity);

  /* ---- المُرشِّحون ---- */
  const refs = [
    { referrerName: 'أحمد', status: 'pending', reward: 50 }, { referrerName: ' أحمد ', status: 'pending', reward: 50 }, { referrerName: 'أحمد', status: 'pending', reward: 20 },
    { referrerName: 'منى', status: 'paid', reward: 30 }, { referrerName: 'منى', status: 'pending', reward: 10 }, { referrerName: '' }, null,
  ];
  const ri = referrerInsights(refs);
  await t.test('22. المُرشِّحون: تجميع بالاسم المنظَّف والأكثر أولاً', ri.rows.length === 2 && ri.rows[0].name === 'أحمد' && ri.rows[0].count === 3 && ri.rows[1].count === 2);
  await t.test('23. المعلّق والمبلغ المستحق والمدفوع', ri.rows[0].pending === 3 && ri.rows[0].pendingAmount === 120 && ri.rows[1].paid === 1 && ri.rows[1].pending === 1);
  await t.test('24. تنبيه المكافأة: 3+ إحالات بلا أي مدفوع فقط', ri.needReward.length === 1 && ri.needReward[0].name === 'أحمد' && referrerInsights(refs, 2).needReward.length === 1 && referrerInsights(null).rows.length === 0);

  /* ---- خريطة الالتزامات ---- */
  const am = annualMap([
    { name: 'إيجار', amount: 1000, frequency: 'monthly' }, { name: 'تأمين', amount: 6000, frequency: 'annual', dueMonth: 9 },
    { name: 'رسوم', amount: 900, frequency: 'quarterly', dueMonth: 6 }, { name: 'موقوف', amount: 5000, frequency: 'monthly', active: false },
    { name: 'مرة', amount: 700, frequency: 'once' },
  ], NOW);
  await t.test('25. الخريطة: 12 شهراً تبدأ من الشهر الحالي', am.months.length === 12 && am.months[0].month === 5 && am.months[0].year === 2026 && am.months[7].month === 0 && am.months[7].year === 2027);
  await t.test('26. شهري كل شهر، وسنوي في شهره، وربع سنوي كل 3 شهور من شهره، والموقوف و«مرة» خارجها', am.months[0].total === 1900 && am.months[3].total === 7900 && am.months[1].total === 1000 && am.months[3].items.includes('تأمين') && !am.months.some((m) => m.items.includes('موقوف') || m.items.includes('مرة')));
  await t.test('27. الأثقل والمتوسط والإجمالي', am.peak.month === 8 && am.peak.total === 7900 && am.total === 21600 && am.average === 1800);
  await t.test('28. الأقساط المنتهية تتوقف في الخريطة (remainingOf)', (() => { const r = annualMap([{ name: 'قسط', amount: 500, frequency: 'monthly' }], NOW, () => 3); return r.months.slice(0, 3).every((m) => m.total === 500) && r.months.slice(3).every((m) => m.total === 0) && r.total === 1500; })());
  await t.test('29. بلا شهر استحقاق ⟵ شهر الإنشاء، وبلا بيانات ⟵ صفر بلا انهيار', annualMap([{ amount: 1200, frequency: 'annual', createdAt: at(10, 5) }], NOW).months.find((m) => m.total === 1200).month === 10 && annualMap(null, NOW).total === 0 && annualMap(null, NOW).peak === null);
  await t.test('30. أسماء الأشهر 12', MONTH_NAMES_AR.length === 12 && new Set(MONTH_NAMES_AR).size === 12);

  /* ---- فترات مصروف البيت ---- */
  const r30 = getPeriodRange('last30'), r90 = getPeriodRange('last90');
  await t.test('31. آخر 30 يوماً و90 يوماً تنتهي بنهاية اليوم وتمتد 30 و90 يوماً', Math.round((r30.toMs - r30.fromMs) / DAY) === 30 && Math.round((r90.toMs - r90.fromMs) / DAY) === 90 && r30.toMs > Date.now() && r30.toMs - Date.now() <= DAY);
  await t.test('32. الفترات القديمة كما كانت', getPeriodRange('all').fromMs === 0 && getPeriodRange('month').toMs > getPeriodRange('month').fromMs);

  /* ---- مستحقات الموردين القديمة ---- */
  const sup = overdueSupplierDues([
    { supplier: { name: 'أ' }, owed: 500, lastDate: NOW.getTime() - 45 * DAY }, { supplier: { name: 'ب' }, owed: 900, lastDate: NOW.getTime() - 40 * DAY },
    { supplier: { name: 'ج' }, owed: 300, lastDate: NOW.getTime() - 5 * DAY }, { supplier: { name: 'د' }, owed: -50, lastDate: NOW.getTime() - 90 * DAY }, { supplier: { name: 'هـ' }, owed: 0, lastDate: 0 }, null,
  ], NOW.getTime(), 30);
  await t.test('33. مستحقات الموردين القديمة: عليك فقط ومنذ أكثر من 30 يوماً والأكبر أولاً', sup.length === 2 && sup[0].supplier.name === 'ب');
  await t.test('34. مدخل فاسد ⟵ فارغ', overdueSupplierDues(null).length === 0);

  /* ---- عقود الربط ---- */
  const inv = await src('pages/inventory.js');
  await t.test('35. المخزون: فلتر النواقص يجمع مع الفئة والبحث ويُصفَّر عند الدخول', inv.includes("lowOnly: false") && inv.includes("'data-filter': 'low-only'") && inv.includes('if (state.lowOnly) list = list.filter((i) => isLowStockItem(i, state.globalThreshold));') && inv.includes('state.lowOnly = false;'));
  const exp = await src('pages/expenses.js');
  await t.test('36. المصروفات: التوزيع يتبع الفترة المختارة ويشارك التصنيفات مع النموذج', exp.includes('breakdownByCategory(filtered') && exp.includes('id: \'expenses-breakdown\'') && exp.includes('EXPENSE_CATEGORIES.forEach'));
  const he = await src('pages/house-expenses.js');
  await t.test('37. مصروف البيت: فترتان جديدتان والمقارنة في الشهر الحالي فقط', he.includes("{ id: 'last30'") && he.includes("{ id: 'last90'") && he.includes("if (state.period === 'month') {   /* v3.13.0") && he.includes('compareCategories(allList'));
  const od = await src('pages/orders.js'); const oc = await src('pages/orders/cards.js');
  await t.test('38. الطلبات: الحدّ يُحسب مرة عند التحميل والشارة لا تُعرض للملغاة', od.includes('state.hvThreshold = highValueThreshold(state.orders)') && oc.includes("o.status !== 'cancelled' && ctx.state && isHighValue(o, ctx.state.hvThreshold)"));
  const cf = await src('pages/commitments-forms.js'); const cv = await src('pages/commitments-views.js');
  await t.test('39. الالتزامات: حقل شهر الاستحقاق يُحفظ بين 1 و12 والخريطة مربوطة بالأقساط', cf.includes("'data-role': 'due-month-select'") && cf.includes('Math.max(1, Math.min(12, Number(dueMonthSelect.value)))') && cv.includes('annualMap(state.withPayments, new Date(), remainingMonths)'));
  const pu = await src('pages/pickups.js'); const rf = await src('pages/referrals.js'); const cs = await src('pages/cloud-sync.js');
  await t.test('40. الاستلام والإحالات وكلمة المرور مربوطة', pu.includes('pickupStats(ord, new Date())') && rf.includes('referrerInsights(state.items)') && rf.includes("id: 'ref-insights'") && cs.includes('attachPasswordMeter(passInput)'));
  await t.test('41. حد التسجيل لم يتغيّر (المقياس إرشاد لا منع)', (await src('sync/auth-sync.js')).includes("String(password).length < 6) return 'كلمة المرور 6 أحرف على الأقل'"));
  const nc = await src('ui/notifications-center.js'); const sf = await src('pages/suppliers-forms.js'); const sp = await src('pages/suppliers.js');
  await t.test('42. إشعار الموردين مغلَّف بـ try/catch حتى لا يعطّل بقية الإشعارات', /مستحقات موردين قديمة[\s\S]*?try \{[\s\S]*?overdueSupplierDues\(balancesBySupplier\(sup, ent\), Date\.now\(\), 30\)[\s\S]*?catch \(e\) \{ \/\* الموردون اختياريون/.test(nc));
  await t.test('43. تعديل حركة المورد: يحدّث مصروفها المرتبط ولا يكرّر المصروف', sf.includes('await supplierEntries.update(existing.id, patch, opts)') && sf.includes('store: STORES.EXPENSES, id: existing.expenseId, patch:') && sf.includes('await supplierEntries.create({ ...patch, supplierId: supplier.id }, opts)') && sf.includes('if (isPurchase && !(isEdit && existing.expenseId))') && sp.includes("'data-action': 'edit-entry'"));
  const ui = await src('ui/insight-cards.js');
  await t.test('44. بطاقات التحليل: عرض فقط بلا innerHTML ولا كتابة بيانات ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui) && !/\.(create|update|remove|delete)\(/.test(ui));
});
