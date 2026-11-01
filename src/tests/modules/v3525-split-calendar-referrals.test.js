/* ==========================================================================
   v3525-split-calendar-referrals.test.js — تقسيم calendar.js وreferrals.js (v3.5.25، بلا تغيير سلوك)
   ==========================================================================
   يتحقق أن: الواجهة العامة للصفحتين لم تتغيّر، والوحدات الجديدة تؤدي دورها، والصفحتان ترسمان وتتفاعلان
   وتُدمَّران بأمان، ولا استيراد دائري ولا import() ولا innerHTML، ولا ملف منها يتجاوز 300 سطر.
   ========================================================================== */
import { register } from '../registry.js';
import * as calMod from '../../pages/calendar.js';
import * as calUtils from '../../pages/calendar-utils.js';
import * as calGrid from '../../pages/calendar-grid.js';
import * as calDay from '../../pages/calendar-day.js';
import * as refMod from '../../pages/referrals.js';
import * as refForm from '../../pages/referrals-form.js';
import * as refCard from '../../pages/referrals-card.js';
import * as refList from '../../pages/referrals-list.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAL_FILES = ['calendar', 'calendar-utils', 'calendar-grid', 'calendar-day'];
const REF_FILES = ['referrals', 'referrals-form', 'referrals-card', 'referrals-list'];

register('v3.5.25 calendar + referrals — تقسيم الملفات', async (t) => {
  /* --- 1) الواجهات العامة --- */
  await t.test('1. calendar.js يصدّر calendarPage فقط (render + destroy)',
    Object.keys(calMod).join() === 'calendarPage' && typeof calMod.calendarPage.render === 'function' && typeof calMod.calendarPage.destroy === 'function');
  await t.test('2. referrals.js يصدّر referralsPage فقط (render + destroy)',
    Object.keys(refMod).join() === 'referralsPage' && typeof refMod.referralsPage.render === 'function' && typeof refMod.referralsPage.destroy === 'function');
  await t.test('3. وحدات التقويم تصدّر أسماءها',
    ['monthStartMs', 'monthEndMs', 'startOfDayMs', 'isSameDay', 'formatArabicDate', 'shortDate', 'eventsForDay'].every((k) => typeof calUtils[k] === 'function') &&
    ['renderHeader', 'renderFilters', 'renderStats', 'renderGrid', 'renderLegend'].every((k) => typeof calGrid[k] === 'function') &&
    typeof calDay.renderUpcoming === 'function' && typeof calDay.openDayModal === 'function');
  await t.test('4. وحدات الإحالات تصدّر أسماءها',
    ['openReferralForm', 'openRewardPercentForm', 'currentPercent'].every((k) => typeof refForm[k] === 'function') &&
    typeof refCard.buildReferralCard === 'function' &&
    ['renderStats', 'renderPercentCard', 'renderFilters', 'renderList'].every((k) => typeof refList[k] === 'function'));

  /* --- 2) calendar-utils: دوال نقية --- */
  const ts = new Date(2026, 9, 29, 15, 30).getTime();
  await t.test('5. utils: monthStartMs/monthEndMs حدّا الشهر', calUtils.monthStartMs(2026, 9) === new Date(2026, 9, 1).getTime() && calUtils.monthEndMs(2026, 9) === new Date(2026, 10, 1).getTime());
  await t.test('6. utils: startOfDayMs وisSameDay', calUtils.startOfDayMs(ts) === new Date(2026, 9, 29).getTime() && calUtils.isSameDay(ts, ts + 3600000 * 2) && !calUtils.isSameDay(ts, ts + 86400000));
  await t.test('7. utils: shortDate = يوم/شهر وformatArabicDate يحوي السنة', calUtils.shortDate(ts) === '29/10' && calUtils.formatArabicDate(ts).includes('2026') && calUtils.formatArabicDate(ts).includes('29'));
  const ev = [{ date: ts, id: 'a' }, { date: ts + 86400000, id: 'b' }];
  await t.test('8. utils: eventsForDay يفلتر حسب اليوم من الحالة الممرَّرة', calUtils.eventsForDay({ events: ev }, ts).length === 1 && calUtils.eventsForDay({ events: ev }, ts)[0].id === 'a');

  /* --- 3) صفحة التقويم --- */
  const cbox = document.createElement('div');
  document.body.appendChild(cbox);
  try {
    await calMod.calendarPage.render(cbox);
    await sleep(80);
    const cells = Array.from(cbox.querySelectorAll('[aria-label]')).filter((c) => /\d{4}$/.test(c.getAttribute('aria-label')));
    await t.test('9. التقويم يرسم شبكة الشهر (28–31 خلية يوم)', cells.length >= 28 && cells.length <= 31);
    const before = cbox.textContent;
    const nextBtn = cbox.querySelector('button[aria-label="الشهر التالي"]');
    nextBtn.click();
    await sleep(150);
    await t.test('10. زر «الشهر التالي» يغيّر الشهر المعروض', cbox.textContent !== before);
    Array.from(cbox.querySelectorAll('button')).find((b) => b.textContent.includes('اليوم')).click();
    await sleep(150);
    const cells2 = Array.from(cbox.querySelectorAll('[aria-label]')).filter((c) => /\d{4}$/.test(c.getAttribute('aria-label')));
    cells2[0].click();
    await sleep(150);
    await t.test('11. الضغط على يوم يفتح نافذة تفاصيل اليوم', !!document.querySelector('.modal'));
    document.querySelectorAll('.modal').forEach((m) => m.remove());
  } finally {
    calMod.calendarPage.destroy();
    calMod.calendarPage.destroy();
    cbox.remove();
  }
  await t.test('12. destroy مرتين لا يرمي خطأ (تقويم)', true);

  /* --- 4) صفحة الإحالات --- */
  const rbox = document.createElement('div');
  document.body.appendChild(rbox);
  try {
    await refMod.referralsPage.render(rbox);
    await t.test('13. الإحالات ترسم الإحصائيات والنسبة والفلاتر الأربعة والقائمة',
      !!rbox.querySelector('#ref-stats') && !!rbox.querySelector('#ref-percent') && !!rbox.querySelector('#ref-list') &&
      rbox.querySelectorAll('#ref-filters button').length === 4 && !!rbox.querySelector('[data-action="edit-percent"]'));
    const s = rbox.querySelector('input[type=search]');
    s.value = 'zzzz-لا-يوجد-مطلقاً'; s.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    await t.test('14. البحث بلا نتائج يعرض «لا نتائج»', rbox.querySelector('#ref-list').textContent.includes('لا نتائج'));
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true }));
    rbox.querySelector('[data-filter="paid"]').click();
    await sleep(50);
    await t.test('15. الضغط على فلتر يجعله الزر الأساسي', rbox.querySelector('[data-filter="paid"]').className.includes('btn--primary'));
    rbox.querySelector('[data-action="edit-percent"]').click();
    await sleep(150);
    await t.test('16. زر «تعديل النسبة» يفتح نافذة النسبة', !!document.querySelector('.modal') && document.querySelector('.modal').textContent.includes('نسبة المكافأة'));
    document.querySelectorAll('.modal').forEach((m) => m.remove());
  } finally {
    refMod.referralsPage.destroy();
    refMod.referralsPage.destroy();
    rbox.remove();
  }
  await t.test('17. destroy مرتين لا يرمي خطأ (إحالات)', true);

  /* --- 5) حراس المصدر --- */
  const texts = await Promise.all([...CAL_FILES, ...REF_FILES].map(async (f) => (await fetch(new URL('../../pages/' + f + '.js', import.meta.url))).text()));
  await t.test('18. حراس: لا import() ديناميكي ولا innerHTML في الملفات الثمانية', texts.every((s) => !/\bimport\s*\(/.test(s) && !/\.innerHTML\s*=/.test(s)));
  await t.test('19. حراس: وحدات التقويم الثلاث لا تستورد calendar.js (لا دوران)', texts.slice(1, 4).every((s) => !/from\s+'\.\/calendar\.js'/.test(s)));
  await t.test('20. حراس: وحدات الإحالات الثلاث لا تستورد referrals.js (لا دوران)', texts.slice(5).every((s) => !/from\s+'\.\/referrals\.js'/.test(s)));
  await t.test('21. حراس: لا ملف منها يتجاوز 300 سطر', texts.every((s) => s.split('\n').length <= 300));
});
