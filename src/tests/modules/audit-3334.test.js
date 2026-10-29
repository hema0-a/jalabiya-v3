/* ==========================================================================
   audit-3334.test.js — حدود اليوم بالتقويم لا بالـ 24 ساعة (v3.3.34)
   مصر تطبّق التوقيت الصيفي: يوم الخريف 25 ساعة، فنهاية «اليوم» بـ start+24h تقع 23:00
   وتُسقط مواعيد الساعة الأخيرة من «مواعيد اليوم».
   ========================================================================== */

import { register } from '../registry.js';
import { startOfDay, startOfDayPlus, startOfNextDay, dayDiff } from '../../core/day-math.js';
import { getTodayRange } from '../../pages/appointments.js';

register('audit v3.3.34 calendar day boundaries', async (t) => {
  const mid = (y, m, d) => new Date(y, m, d).getTime();
  const noon = new Date(2026, 9, 29, 12, 0, 0).getTime();

  await t.test('1. startOfNextDay = منتصف الليل التالي بالتقويم المحلي (لأي يوم، بما فيه يوم تغيير التوقيت)',
    [[2026, 9, 29], [2026, 3, 24], [2026, 11, 31], [2026, 1, 28], [2028, 1, 28]]
      .every(([y, m, d]) => startOfNextDay(new Date(y, m, d, 12).getTime()) === mid(y, m, d + 1)));
  await t.test('2. startOfDayPlus يعدّ الأيام التقويمية ذهاباً وإياباً',
    startOfDayPlus(noon, -6) === mid(2026, 9, 23) && startOfDayPlus(noon, 0) === startOfDay(noon)
    && startOfDayPlus(noon, 3) === mid(2026, 10, 1));
  await t.test('3. قيمة غير صالحة تُرجع NaN ولا تُسقط الدالة',
    Number.isNaN(startOfDayPlus('x', 1)) && Number.isNaN(startOfNextDay(undefined)));
  await t.test('4. نطاق «اليوم» في صفحة المواعيد ينتهي عند منتصف الليل التالي بالضبط',
    (() => { const r = getTodayRange(); return r.start === startOfDay(Date.now()) && r.end === startOfNextDay(r.start); })());
  await t.test('5. dayDiff يعدّ أيام السنة بالتقويم عبر يومَي تغيير التوقيت',
    dayDiff(new Date(2026, 0, 1), new Date(2026, 9, 29, 0, 30)) === 301
    && dayDiff(new Date(2026, 0, 1), new Date(2026, 3, 25, 0, 30)) === 114);
});
