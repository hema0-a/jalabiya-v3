/* ==========================================================================
   v3522-v2-features.test.js — ميزات v2 المُستعادة في v3.5.22
   ==========================================================================
   1) خطة المواسم (occasion-plan)  2) نسبة مكافأة الإحالات  3) يومك في لمحة (daily-insights + البطاقة + اللوحة)
   4) استعادة كلمة المرور وإنشاء الحساب (auth-sync + صفحة المزامنة)  5) إزالة المزامنة من القائمة الجانبية.
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { settings } from '../../data/repos/settings.js';
import { formatEGP } from '../../core/utils.js';
import {
  daysUntilOccasion, occasionAlertLevel, suggestOccasionPricing, generatePreparationPlan,
} from '../../services/occasion-plan.js';
import {
  DEFAULT_REWARD_PERCENT, parseRewardPercent, rewardPercentOf, suggestedReward,
} from '../../services/referral-rewards.js';
import { buildInsights, productivityOf, moodOfHour, motivationFor, MAX_TIPS } from '../../services/daily-insights.js';
import { buildInsightsCard } from '../../pages/dashboard-insights.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { occasionsPage } from '../../pages/occasions.js';
import { referralsPage } from '../../pages/referrals.js';
import { cloudSyncPage } from '../../pages/cloud-sync.js';
import * as authSync from '../../sync/auth-sync.js';
import { LAYOUT_KEY } from '../../services/dashboard-layout.js';
import { NAV_IDS } from '../../services/nav-groups.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) { /* ignore */ } await sleep(30); }
  return null;
}
const DAY = 86400000;

/* ========================================================================== */

register('v3.5.22 occasion-plan — اقتراحات التسعير وخطة الاستعداد', async (t) => {
  const now = new Date(2026, 2, 10, 15, 0, 0).getTime();   /* 10 مارس 2026 */

  await t.test('1. daysUntilOccasion: بعد 5 أيام / اليوم نفسه = 0 / فاتت هذا العام ← العام القادم',
    daysUntilOccasion({ month: 3, day: 15 }, now).daysLeft === 5 &&
    daysUntilOccasion({ month: 3, day: 10 }, now).daysLeft === 0 &&
    daysUntilOccasion({ month: 3, day: 9 }, now).daysLeft === 364 &&
    daysUntilOccasion({ month: 3, day: 9 }, now).date.getFullYear() === 2027);

  const lv = (n) => occasionAlertLevel(n);
  await t.test('2. occasionAlertLevel: critical/high/medium/low وتسميات اليوم وغداً',
    lv(0).priority === 'critical' && lv(0).label === 'اليوم!' && lv(1).label === 'غداً' && lv(3).priority === 'critical' &&
    lv(5).priority === 'high' && lv(10).priority === 'medium' && lv(20).priority === 'low' && lv(20).label === 'بعد 20 يوم');

  const orders = [
    { id: 'a', createdAt: new Date(2025, 2, 5).getTime(), amount: 1000, status: 'delivered' },
    { id: 'b', createdAt: new Date(2025, 2, 20).getTime(), amount: 2000, status: 'pending' },
    { id: 'c', createdAt: new Date(2025, 2, 21).getTime(), amount: 9000, status: 'cancelled' },   /* ملغى: يُهمل */
    { id: 'd', createdAt: new Date(2026, 2, 5).getTime(), amount: 5000, status: 'pending' },      /* العام الحالي: يُهمل */
    { id: 'e', createdAt: new Date(2025, 3, 5).getTime(), amount: 7000, status: 'pending' },      /* شهر آخر: يُهمل */
  ];
  const tips = suggestOccasionPricing({ month: 3, day: 15 }, orders, now);
  await t.test('3. اقتراحات قريبة (5 أيام): استعجال + خصم + متوسط العام الماضي (1500) + توقّع الزيادة',
    tips.length === 4 && tips[0].icon === '⚡' && tips[1].icon === '🎁' && tips[2].icon === '💰' &&
    tips[2].text.includes(formatEGP(1500)) && tips[3].icon === '📈');

  const far = suggestOccasionPricing({ month: 3, day: 15 }, [], new Date(2026, 0, 1).getTime());
  await t.test('4. موسم بعيد وبلا طلبات: توقّع الزيادة فقط (لا استعجال ولا خصم ولا متوسط)',
    far.length === 1 && far[0].icon === '📈');

  const mid = suggestOccasionPricing({ month: 3, day: 20 }, 'bad', now);
  await t.test('5. 10 أيام: خصم + توقّع (بلا استعجال)، ومُدخل الطلبات غير المصفوفة لا يكسر',
    mid.length === 2 && mid[0].icon === '🎁');

  const fitr = generatePreparationPlan({ name: 'عيد الفطر المبارك' });
  const unknown = generatePreparationPlan({ name: 'مناسبة خاصة' });
  const copy = generatePreparationPlan({ name: 'مناسبة خاصة' });
  copy.push('x');
  await t.test('6. خطة خاصة بالموسم + العامة (7)، وغير المعروف = 4 عامة، ولا مراجع مشتركة بين الاستدعاءات',
    fitr.length === 7 && fitr[0].includes('جلابيب العيد') && unknown.length === 4 && generatePreparationPlan({ name: 'مناسبة خاصة' }).length === 4 &&
    generatePreparationPlan(null).length === 4);
});

/* ========================================================================== */

register('v3.5.22 referral reward percent — المنطق', async (t) => {
  await t.test('1. parseRewardPercent: فارغ/خارج النطاق/نص ← null، والصالح يُقرَّب لمنزلتين',
    parseRewardPercent('') === null && parseRewardPercent(null) === null && parseRewardPercent('101') === null &&
    parseRewardPercent('-1') === null && parseRewardPercent('abc') === null && parseRewardPercent('7.456') === 7.46 &&
    parseRewardPercent('0') === 0 && parseRewardPercent(100) === 100);

  await t.test('2. rewardPercentOf: الافتراضي 5 عند النقص أو التلف، وصفر مسموح',
    DEFAULT_REWARD_PERCENT === 5 && rewardPercentOf({}) === 5 && rewardPercentOf(null) === 5 &&
    rewardPercentOf({ referrals: { rewardPercent: 'x' } }) === 5 && rewardPercentOf({ referrals: { rewardPercent: 12.5 } }) === 12.5 &&
    rewardPercentOf({ referrals: { rewardPercent: 0 } }) === 0);

  await t.test('3. suggestedReward: نسبة من المبلغ مقرّبة، وصفر عند عدم وجود مبلغ أو نسبة',
    suggestedReward({ amount: 1000 }, 5) === 50 && suggestedReward({ amount: 333 }, 7.5) === 24.98 &&
    suggestedReward(null, 5) === 0 && suggestedReward({ amount: 0 }, 5) === 0 && suggestedReward({ amount: 1000 }, 0) === 0);

  const s = await settings.get();
  await t.test('4. الإعدادات الافتراضية تحمل referrals.rewardPercent = 5', !!s.referrals && s.referrals.rewardPercent === 5);
});

/* ========================================================================== */

register('v3.5.22 daily-insights — الإنتاجية والنصائح والإجراء التالي', async (t) => {
  const now = new Date(2026, 2, 10, 9, 0, 0).getTime();
  const mk = (over) => ({ id: String(Math.random()), status: 'pending', createdAt: now - 10 * DAY, amount: 100, ...over });

  await t.test('1. مستويات الإنتاجية بعتبات 3/8/15',
    productivityOf(0).level === 'منخفض' && productivityOf(0).percent === 20 && productivityOf(3).level === 'عادي' && productivityOf(7).level === 'عادي' &&
    productivityOf(8).level === 'متوسط' && productivityOf(14).percent === 65 && productivityOf(15).level === 'عالي' && productivityOf(15).percent === 100 &&
    productivityOf(0).message.length > 5);

  await t.test('2. moodOfHour + رسائل التحفيز',
    moodOfHour(5) === 'morning' && moodOfHour(11) === 'morning' && moodOfHour(12) === 'afternoon' && moodOfHour(17) === 'evening' &&
    moodOfHour(21) === 'night' && moodOfHour(3) === 'night' && motivationFor('morning').includes('طلب جديد') && motivationFor('???').length > 3);

  const empty = buildInsights({ orders: [], now });
  await t.test('3. لا طلبات: منخفض + «لم تسجّل» + إجراء «تحت السيطرة»',
    empty.productivity.level === 'منخفض' && empty.tips[0].text.includes('لم تسجّل') && empty.nextAction.title.includes('تحت السيطرة') &&
    empty.nextAction.hash === '#/dashboard' && empty.mood === 'morning');

  const busy = buildInsights({
    now, todayRevenue: 500, todayExpenses: 800, lowStock: 2, topVipName: 'سيد',
    orders: [
      mk({ createdAt: now - 1000 }),                                   /* أُضيف اليوم */
      mk({ dueDate: now - 2 * DAY }),                                 /* متأخر */
      mk({ dueDate: now + 3600000 }),                                 /* اليوم */
      mk({ status: 'ready' }),
      mk({ status: 'cancelled', createdAt: now - 1000 }),             /* ملغى: لا يُحسب */
      mk({ status: 'delivered', dueDate: now - 5 * DAY }),            /* مسلَّم: ليس متأخراً */
    ],
  });
  const sm = busy.summary;
  await t.test('4. الملخص: أُضيف اليوم 1 · متأخر 1 · اليوم 1 · جاهز 1 · صافي سالب · مخزون 2',
    sm.addedToday === 1 && sm.overdue === 1 && sm.dueToday === 1 && sm.ready === 1 && sm.todayNet === -300 && sm.lowStock === 2);
  await t.test('5. الإجراء التالي يبدأ بالمتأخر، والنصائح بحد أقصى 5 والأولى «أضفت 1 طلب»',
    busy.nextAction.title === 'ابدأ بالطلبات المتأخرة' && busy.nextAction.hash === '#/orders' &&
    busy.tips.length === MAX_TIPS && busy.tips[0].text.includes('أضفت 1 طلب') && busy.tips[1].type === 'danger');

  const onlyDue = buildInsights({ now, orders: [mk({ dueDate: now + 3600000 })] });
  const onlyStock = buildInsights({ now, orders: [], lowStock: 3 });
  const onlyReady = buildInsights({ now, orders: [mk({ status: 'ready' })] });
  await t.test('6. أولوية الإجراء: التسليم اليوم ثم المخزون ثم الجاهز',
    onlyDue.nextAction.title === 'تسليمات اليوم' && onlyStock.nextAction.title === 'مراجعة المخزون' && onlyStock.nextAction.hash === '#/inventory' &&
    onlyReady.nextAction.title === 'تسليم الطلبات الجاهزة');

  const week = buildInsights({ now, orders: Array.from({ length: 9 }, () => mk({ createdAt: now - 2 * DAY })) });
  await t.test('7. طلبات الأسبوع تُعدّ بلا الملغى وتحدّد المستوى: 9 ← متوسط، ونصيحة «في المسار الصحيح»',
    week.weekOrders === 9 && week.productivity.level === 'متوسط' && week.tips.some((x) => x.text.includes('9 طلب هذا الأسبوع')));

  await t.test('8. مدخلات تالفة لا تكسر', buildInsights({ orders: 'x', todayRevenue: 'abc', lowStock: -4 }).tips.length >= 1 && buildInsights().nextAction.hash === '#/dashboard');

  const card = buildInsightsCard(busy);
  const bar = card.querySelector('[role="progressbar"]');
  await t.test('9. البطاقة: رسالة + إجراء بوجهة صحيحة + شريط الإنتاجية + نصائح',
    card.getAttribute('data-role') === 'insights' && card.querySelector('[data-role="next-action"]').getAttribute('href') === '#/orders' &&
    !!bar && bar.getAttribute('aria-valuenow') === String(busy.productivity.percent) &&
    card.querySelectorAll('.dash-insights__tip').length === busy.tips.length && card.textContent.includes('نصائح ذكية'));
});

/* ========================================================================== */

register('v3.5.22 dashboard — بطاقة «يومك في لمحة» (DOM)', async (t) => {
  const prev = localStorage.getItem(LAYOUT_KEY);
  localStorage.removeItem(LAYOUT_KEY);
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await dashboardPage.render(box);
    const shown = await waitFor(() => box.querySelector('[data-role="insights"]'));
    await t.test('1. الافتراضي: البطاقة تظهر بعد الرسم الأول وفيها إجراء ونصائح',
      !!shown && !!shown.querySelector('[data-role="next-action"]') && shown.querySelectorAll('.dash-insights__tip').length >= 1);
    await t.test('2. الأقسام السبعة وبطاقات الأرقام الأربع لم تتأثر',
      box.querySelectorAll('.dash-section').length === 7 && box.querySelectorAll('.stat--link').length === 4);

    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ hidden: ['insights'], order: [] }));
    await dashboardPage.render(box);
    await sleep(300);
    await t.test('3. إخفاؤها من «تخصيص اللوحة» يزيلها بلا أثر على الباقي',
      !box.querySelector('[data-role="insights"]') && !box.querySelector('[data-role="insights-slot"]') && box.querySelectorAll('.dash-section').length === 7);
  } finally {
    try { dashboardPage.destroy(); } catch (e) { /* ignore */ }
    box.remove();
    if (prev === null) localStorage.removeItem(LAYOUT_KEY); else localStorage.setItem(LAYOUT_KEY, prev);
  }
});

/* ========================================================================== */

register('v3.5.22 occasions + referrals — الصفحات (DOM)', async (t) => {
  const before = await settings.get();
  const savedOcc = before.occasions;
  const savedRefs = before.referrals;
  const now = new Date();
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const seeded = [];
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    /* --- المواسم --- */
    await settings.update({ occasions: [{ id: 't3522-occ', name: 'عيد الفطر', month: soon.getMonth() + 1, day: soon.getDate(), icon: '🎉', alertDays: 14, enabled: true }] });
    await occasionsPage.render(box);
    const alert = await waitFor(() => box.querySelector('.occ-alert'));
    await t.test('1. موسم داخل فترة تنبيهه (3 أيام): بطاقة تنبيه بالاقتراحات وخطة الاستعداد',
      !!alert && alert.textContent.includes('اقتراحات') && alert.textContent.includes('خطة الاستعداد') && alert.textContent.includes('جلابيب العيد') &&
      alert.textContent.includes('رسوم استعجال'));
    occasionsPage.destroy(); box.textContent = '';

    await settings.update({ occasions: [{ id: 't3522-occ', name: 'موسم بعيد', month: ((soon.getMonth() + 6) % 12) + 1, day: 15, icon: '🎊', alertDays: 14, enabled: true }] });
    await occasionsPage.render(box);
    await t.test('2. موسم بعيد: لا بطاقة تنبيه، والصفحة تعمل', !box.querySelector('.occ-alert') && !!box.querySelector('#occ-list'));
    occasionsPage.destroy(); box.textContent = '';

    /* --- الإحالات: نسبة + اقتراح --- */
    const stamp = Date.now();
    const cust = { id: 't3522-c', name: 'عميل نسبة اختبار 3522', phone: '01099990000', createdAt: stamp, updatedAt: stamp };
    const ord = { id: 't3522-o', customerId: 't3522-c', status: 'delivered', amount: 1000, createdAt: stamp, updatedAt: stamp, deliveredAt: stamp };
    const ref = { id: 't3522-r', referrerName: 'مرشّح 3522', referredName: 'عميل نسبة اختبار 3522', referredPhone: '', reward: 0, status: 'pending', date: stamp, createdAt: stamp, updatedAt: stamp };
    await idb.put('customers', cust); seeded.push(['customers', cust.id]);
    await idb.put('orders', ord); seeded.push(['orders', ord.id]);
    await idb.put('referrals', ref); seeded.push(['referrals', ref.id]);
    await settings.update({ referrals: { rewardPercent: 5 } });

    await referralsPage.render(box);
    const pct = await waitFor(() => box.querySelector('#ref-percent [data-action="edit-percent"]'));
    await t.test('3. بطاقة النسبة الافتراضية تظهر (5%) وبها زر «تعديل النسبة»',
      !!pct && box.querySelector('#ref-percent').textContent.includes('5%'));
    const sug = await waitFor(() => box.querySelector('.ref-suggest'));
    await t.test('4. إحالة جاهزة بلا مكافأة: اقتراح 5% من 1000 = 50 ج',
      !!sug && sug.textContent.includes(formatEGP(50)) && sug.textContent.includes('5%'));
    sug.querySelector('[data-action="apply-suggested"]').click();
    await sleep(100);
    const applied = await waitFor(() => !box.querySelector('.ref-suggest'));
    const stored = await idb.get('referrals', 't3522-r');
    await t.test('5. زر «اعتماد» يكتب المكافأة 50 في السجل ويخفي الاقتراح',
      !!applied && stored.reward === 50);
    referralsPage.destroy(); box.textContent = '';
  } finally {
    try { occasionsPage.destroy(); referralsPage.destroy(); } catch (e) { /* ignore */ }
    box.remove();
    for (const [store, id] of seeded) { try { await idb.remove(store, id); } catch (e) { /* ignore */ } }
    try { await settings.update({ occasions: savedOcc, referrals: savedRefs }); } catch (e) { /* ignore */ }
  }
});

/* ========================================================================== */

register('v3.5.22 auth-sync + cloud-sync — استعادة كلمة المرور وإنشاء حساب', async (t) => {
  const v = authSync.validateSignUp;
  await t.test('1. validateSignUp: بريد غير صالح / كلمة قصيرة / تأكيد غير مطابق / سليم = null',
    typeof v('bad', '123456', '123456') === 'string' && typeof v('', '123456', '123456') === 'string' &&
    v('a@b.com', '12345', '12345').includes('6') && v('a@b.com', '123456', '1234567').includes('مطابق') && v('a@b.com', '123456', '123456') === null &&
    v(' a@b.com ', '123456', '123456') === null);

  const s1 = await authSync.signUp('bad', 'abcdef');
  const s2 = await authSync.signUp('a@b.com', '123');
  const r1 = await authSync.resetPassword('');
  const r2 = await authSync.resetPassword('not-an-email');
  await t.test('2. signUp/resetPassword بمدخلات خاطئة ترجعان {ok:false,error} بلا شبكة ولا استثناء',
    s1.ok === false && typeof s1.error === 'string' && s2.ok === false && typeof s2.error === 'string' &&
    r1.ok === false && typeof r1.error === 'string' && r2.ok === false && typeof r2.error === 'string');

  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await cloudSyncPage.render(box);
    if (authSync.isConfigured()) {
      const forgot = box.querySelector('[data-action="forgot-password"]');
      const toSignup = box.querySelector('[data-action="show-signup"]');
      await t.test('3. بطاقة الدخول: زر «نسيت كلمة المرور؟» وزر «إنشاء حساب جديد» ولا نص «Firebase Console» القديم',
        !!forgot && !!toSignup && !box.textContent.includes('Firebase Console'));
      toSignup.click();
      const signupBtn = await waitFor(() => box.querySelector('[data-action="signup"]'));
      await t.test('4. التحويل لنموذج إنشاء الحساب: ثلاث خانات (بريد/كلمة/تأكيد) وزر رجوع',
        !!signupBtn && box.querySelectorAll('input').length === 3 && !!box.querySelector('[data-action="show-login"]'));
      box.querySelector('[data-action="show-login"]').click();
      await t.test('5. الرجوع يعيد بطاقة الدخول', !!(await waitFor(() => box.querySelector('[data-action="forgot-password"]'))));
    } else {
      await t.test('3. Firebase غير مُهيّأ: الصفحة تعرض التحذير بلا أزرار الحساب',
        box.textContent.includes('غير مُهيّأ') && !box.querySelector('[data-action="show-signup"]'));
    }
  } finally { try { cloudSyncPage.destroy(); } catch (e) { /* ignore */ } box.remove(); }
});

/* ========================================================================== */

register('v3.5.22 nav — المزامنة السحابية خارج القائمة الجانبية', async (t) => {
  await t.test('1. cloud-sync ليست في NAV_IDS', !NAV_IDS.has('cloud-sync'));
  const sidebarHtml = document.querySelector('.sidebar, nav');
  await t.test('2. لا رابط #/cloud-sync داخل القائمة الجانبية الحالية', !sidebarHtml || !sidebarHtml.querySelector('a[href="#/cloud-sync"], [data-page="cloud-sync"]'));
});
