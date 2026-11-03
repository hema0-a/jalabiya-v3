/* ==========================================================================
   v3534-day-off.test.js — أكثر من يوم إجازة + إجازات بتاريخ محدد (v3.5.34)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { addDaysNoon, dayKey, weekdayOf } from '../../core/day-math.js';
import {
  dayOffOf, isDayOff, dayOffReason, resolveDayOffSettings, normalizeHolidays, expandDateRange, isValidDateKey, MAX_HOLIDAYS,
} from '../../core/day-off.js';
import { getOrderParts, suggestDueDate, planOrder } from '../../services/order-scheduler.js';
import { buildCapacityStrip, describeChosenDay } from '../../services/capacity-strip.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { settings } from '../../data/repos/settings.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';

async function src(rel) {
  try { const r = await fetch(new URL('../../' + rel, import.meta.url)); return r.ok ? await r.text() : ''; } catch (e) { return ''; }
}
const J = JSON.stringify;

register('v3.5.34 أيام الإجازة (متعددة + تواريخ)', async (t) => {
  /* --- وحدة الإجازات: التوافق مع الرقم القديم --- */
  await t.test('1. رقم قديم: 5 ← [5]، undefined/null ← الأحد (كما كان)، خارج النطاق/نص ← لا إجازة',
    J(dayOffOf(5).weekdays) === '[5]' && J(dayOffOf(undefined).weekdays) === '[0]' && J(dayOffOf(null).weekdays) === '[0]' && dayOffOf(9).weekdays.length === 0 && dayOffOf('x').weekdays.length === 0 && dayOffOf(-1).weekdays.length === 0);
  const sp = dayOffOf({ weekdays: [6, 5, 5, 'a', 9, 1.5, 0], dates: ['2026-12-25', 'bad', '2026-02-30', { date: '2026-12-24' }, '2026-12-25'] });
  await t.test('2. الكائن يُنقّى: أيام صالحة فريدة مرتبة وتواريخ حقيقية فقط (يرفض 30 فبراير)', J(sp.weekdays) === '[0,5,6]' && J(sp.dates) === '["2026-12-24","2026-12-25"]');
  await t.test('3. الأيام السبعة كلها تُتجاهل (حماية من حلقة لا نهائية)', dayOffOf({ weekdays: [0, 1, 2, 3, 4, 5, 6] }).weekdays.length === 0);
  await t.test('4. التنقية idempotent والمواصفة مجمّدة', dayOffOf(sp) === sp && Object.isFrozen(sp) && Object.isFrozen(sp.weekdays));
  await t.test('5. isValidDateKey', isValidDateKey('2026-02-28') && !isValidDateKey('2026-02-29') && isValidDateKey('2028-02-29') && !isValidDateKey('2026-13-01') && !isValidDateKey(20260101) && !isValidDateKey(''));

  const base = new Date(2026, 11, 20, 12).getTime();   /* الأحد 20-12-2026 */
  const day = (n) => addDaysNoon(base, n);
  const spec = dayOffOf({ weekdays: [5], dates: ['2026-12-23'] });
  await t.test('6. isDayOff: الجمعة أسبوعياً والتاريخ المحدد، لا غيرهما', weekdayOf(day(0)) === 0 && isDayOff(day(5), spec) && isDayOff(day(3), spec) && !isDayOff(day(0), spec) && !isDayOff(day(4), spec) && !isDayOff(NaN, spec));
  await t.test('7. isDayOff يقبل الرقم القديم كما كان', isDayOff(day(0), 0) && !isDayOff(day(1), 0) && isDayOff(day(5), 5) && !isDayOff(day(0), -1) && !isDayOff(day(0), { weekdays: [], dates: [] }));
  await t.test('8. dayOffReason: weekly / date / فارغ', dayOffReason(day(5), spec) === 'weekly' && dayOffReason(day(3), spec) === 'date' && dayOffReason(day(1), spec) === '');

  /* --- من الإعدادات --- */
  await t.test('9. resolveDayOffSettings: القديم وحده ← يومه، والجديد يتقدّم، والفارغ = بلا إجازة أسبوعية، null يعود للقديم',
    J(resolveDayOffSettings({ dayOffWeekday: 5 }).weekdays) === '[5]' && J(resolveDayOffSettings({ dayOffWeekday: 5, dayOffWeekdays: [5, 6] }).weekdays) === '[5,6]'
    && resolveDayOffSettings({ dayOffWeekday: 5, dayOffWeekdays: [] }).weekdays.length === 0 && J(resolveDayOffSettings({ dayOffWeekday: 5, dayOffWeekdays: null }).weekdays) === '[5]'
    && J(resolveDayOffSettings({}).weekdays) === '[0]' && J(resolveDayOffSettings(null).weekdays) === '[0]' && resolveDayOffSettings({ dayOffWeekday: -1 }).weekdays.length === 0);
  await t.test('10. holidays تُقرأ نصوصاً أو كائنات', J(resolveDayOffSettings({ holidays: ['2026-12-25', { date: '2026-12-24', name: 'x' }, 'bad'] }).dates) === '["2026-12-24","2026-12-25"]');
  const nh = normalizeHolidays([{ date: '2026-12-25', name: '  عيد <b> ' }, '2026-12-24', { date: '2026-12-25', name: 'مكرر' }, { date: 'x' }, null]);
  await t.test('11. normalizeHolidays: ترتيب وإزالة تكرار وتنقية الاسم', nh.length === 2 && nh[0].date === '2026-12-24' && nh[0].name === '' && nh[1].name === 'عيد b' && normalizeHolidays('x').length === 0);
  await t.test('12. expandDateRange: نطاق وحيد وعكسي وطويل وغير صالح',
    J(expandDateRange('2026-12-30', '2027-01-02')) === '["2026-12-30","2026-12-31","2027-01-01","2027-01-02"]' && J(expandDateRange('2026-12-30', '')) === '["2026-12-30"]'
    && expandDateRange('2026-12-30', '2026-12-01').length === 0 && expandDateRange('2026-01-01', '2026-12-31').length === 31 && expandDateRange('bad', '').length === 0);
  await t.test('13. الإعدادات الافتراضية: dayOffWeekdays=null وholidays=[] والقديم 0 باقٍ',
    DEFAULT_SETTINGS.dailyLimit.dayOffWeekdays === null && Array.isArray(DEFAULT_SETTINGS.dailyLimit.holidays) && DEFAULT_SETTINGS.dailyLimit.dayOffWeekday === 0);
  const g = await settings.get();
  await t.test('14. settings.get تدمج الحقلين الجديدين', g.dailyLimit.dayOffWeekdays === null && Array.isArray(g.dailyLimit.holidays));
  const rp = buildResetPatch('daily-limit', DEFAULT_SETTINGS).dailyLimit;
  await t.test('15. استرجاع القسم يمسح الإجازات المتعددة والتواريخ', rp.dayOffWeekdays === null && rp.holidays.length === 0 && rp.dayOffWeekday === 0);

  /* --- الجدولة --- */
  const now = Date.now();
  const sixOff = dayOffOf({ weekdays: [0, 1, 2, 3, 4, 5] });
  const sg = suggestDueDate([], { dailyOrderLimit: 0, orderAmount: 0, minDays: 1, dayOffWeekday: sixOff });
  await t.test('16. اقتراح الموعد (بلا حد): يقفز لليوم الوحيد غير الإجازة (السبت)', weekdayOf(sg.timestamp) === 6);
  const hol = [1, 2, 3].map((n) => dayKey(addDaysNoon(now, n)));
  const sg2 = suggestDueDate([], { dailyOrderLimit: 0, orderAmount: 0, minDays: 1, dayOffWeekday: dayOffOf({ weekdays: [], dates: hol }) });
  await t.test('17. تواريخ الإجازة المتتالية تُتخطّى في الاقتراح (أول يوم بعدها)', dayKey(sg2.timestamp) === dayKey(addDaysNoon(now, 4)));
  const pl = planOrder([], { dailyOrderLimit: 100, orderAmount: 100, minDays: 1, dayOffWeekday: dayOffOf({ weekdays: [], dates: [dayKey(addDaysNoon(now, 1))] }) });
  await t.test('18. planOrder للأمام يتخطّى يوم الإجازة المحدد', !!pl && pl.plan[0].day === dayKey(addDaysNoon(now, 2)));
  const endTs = addDaysNoon(now, 6);
  const plb = planOrder([], { dailyOrderLimit: 100, orderAmount: 100, minDays: 1, endDate: endTs, dayOffWeekday: dayOffOf({ weekdays: [], dates: [dayKey(endTs)] }) });
  await t.test('19. planOrder للخلف: إن كان الموعد إجازة يُنهى قبله بيوم', !!plb && plb.plan[plb.plan.length - 1].day === dayKey(addDaysNoon(now, 5)));
  const due = addDaysNoon(now, 10);
  const ord = { id: 'o1', amount: 200, dueDate: due, status: 'new' };
  const partsHol = getOrderParts(ord, { dailyLimit: 100, dayOffWeekday: dayOffOf({ weekdays: [], dates: [dayKey(addDaysNoon(due, -1))] }) });
  await t.test('20. توزيع طلب كبير يتخطّى تاريخ الإجازة (due-2 وdue)', J(partsHol.map((p) => p.day)) === J([dayKey(addDaysNoon(due, -2)), dayKey(due)]));
  const partsNum = getOrderParts(ord, { dailyLimit: 100, dayOffWeekday: weekdayOf(addDaysNoon(due, -1)) });
  await t.test('21. الرقم القديم ما زال يعمل بنفس النتيجة', J(partsNum.map((p) => p.day)) === J([dayKey(addDaysNoon(due, -2)), dayKey(due)]));
  const partsAll = getOrderParts(ord, { dailyLimit: 100, dayOffWeekday: { weekdays: [0, 1, 2, 3, 4, 5, 6] } });
  await t.test('22. كل الأيام إجازة لا تعلّق الحلقة (تُتجاهل الأسبوعية)', partsAll.length === 2);

  /* --- شريط السعة --- */
  const cfg = { dailyOrderLimit: 500, dayOffWeekday: dayOffOf({ weekdays: [], dates: [dayKey(addDaysNoon(now, 2))] }) };
  const strip = buildCapacityStrip([], cfg, now, 5);
  await t.test('23. شريط السعة: اليوم المحدد إجازة (off) وغيره لا', strip[2].off === true && strip[2].status === 'off' && strip[1].off === false && strip[3].off === false);
  const dc = describeChosenDay([], cfg, addDaysNoon(now, 2), now);
  const dw = describeChosenDay([], { dailyOrderLimit: 500, dayOffWeekday: weekdayOf(addDaysNoon(now, 2)) }, addDaysNoon(now, 2), now);
  await t.test('24. وصف اليوم المختار: نص مختلف للتاريخ المحدد عن الأسبوعي', dc.level === 'off' && /تاريخ محدد/.test(dc.text) && dw.level === 'off' && /الأسبوعية/.test(dw.text));

  /* --- واجهة الإعدادات --- */
  const sec = DATA_SECTIONS.find((s) => s.id === 'daily-limit');
  const saves = [];
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    await sec.render(body, { dailyLimit: { dailyOrderLimit: 700, dayOffWeekday: 5, holidays: [{ date: '2020-01-01', name: 'قديمة' }, { date: '2099-01-01', name: 'عيد' }] } }, (p) => { saves.push(JSON.parse(JSON.stringify(p))); });
    const chips = () => Array.from(body.querySelectorAll('button[data-wd]'));
    const on = () => chips().filter((c) => c.classList.contains('settings-theme-card--active')).map((c) => Number(c.dataset.wd));
    await t.test('25. سبعة أيام والنشط هو الجمعة (من الإعداد القديم)', chips().length === 7 && J(on()) === '[5]');
    chips()[6].click();
    await t.test('26. إضافة السبت: يُحفظ [5,6] مع القديم=5', J(saves[0]) === J({ dailyLimit: { dayOffWeekdays: [5, 6], dayOffWeekday: 5 } }) && J(on()) === '[5,6]' && /الجمعة، السبت|السبت/.test(body.querySelector('[data-role="dayoff-note"]').textContent));
    chips()[5].click();
    await t.test('27. إلغاء الجمعة: [6] والقديم=6', J(saves[1]) === J({ dailyLimit: { dayOffWeekdays: [6], dayOffWeekday: 6 } }));
    chips()[6].click();
    await t.test('28. إلغاء الكل مسموح: [] والقديم=-1 مع نص «لا توجد إجازة»', J(saves[2]) === J({ dailyLimit: { dayOffWeekdays: [], dayOffWeekday: -1 } }) && /لا توجد/.test(body.querySelector('[data-role="dayoff-note"]').textContent) && on().length === 0);
    for (let i = 0; i < 6; i++) chips()[i].click();
    const n6 = saves.length;
    chips()[6].click();
    await t.test('29. لا يُسمح باختيار الأيام السبعة (السابع مرفوض بلا حفظ)', saves.length === n6 && on().length === 6 && !on().includes(6));

    const rows = () => Array.from(body.querySelectorAll('[data-holiday]'));
    await t.test('30. قائمة الإجازات بتاريخها واسمها، والمنتهية باهتة، وزر حذف المنتهية ظاهر',
      rows().length === 2 && rows()[0].dataset.holiday === '2020-01-01' && rows()[0].style.opacity === '0.5' && rows()[1].style.opacity === '1' && !!body.querySelector('[data-action="clean-holidays"]'));
    body.querySelector('[data-action="clean-holidays"]').click();
    const lastH = () => saves[saves.length - 1].dailyLimit.holidays;
    await t.test('31. حذف المنتهية يُبقي المستقبلية فقط ويحفظ', rows().length === 1 && J(lastH()) === J([{ date: '2099-01-01', name: 'عيد' }]) && !body.querySelector('[data-action="clean-holidays"]'));
    const from = body.querySelector('[data-role="holiday-from"]'); const to = body.querySelector('[data-role="holiday-to"]'); const nm = body.querySelector('[data-role="holiday-name"]');
    const add = body.querySelector('[data-action="add-holiday"]');
    const before = saves.length;
    add.click();
    await t.test('32. إضافة بلا تاريخ لا تحفظ', saves.length === before);
    from.value = '2099-02-10'; to.value = '2099-02-05'; add.click();
    await t.test('33. نهاية قبل البداية لا تحفظ', saves.length === before);
    from.value = '2099-02-10'; to.value = '2099-02-12'; nm.value = 'مناسبة'; add.click();
    await t.test('34. إضافة نطاق 3 أيام باسمه: تُحفظ مرتبة مع القائمة السابقة وتُفرَّغ الحقول',
      lastH().length === 4 && lastH()[1].date === '2099-02-10' && lastH()[3].date === '2099-02-12' && lastH()[2].name === 'مناسبة' && from.value === '' && nm.value === '' && rows().length === 4);
    const n2 = saves.length;
    from.value = '2099-02-11'; add.click();
    await t.test('35. إضافة يوم موجود: لا تكرار ولا حفظ', saves.length === n2 && rows().length === 4);
    body.querySelector('[data-holiday="2099-02-11"] [data-action="remove-holiday"]').click();
    await t.test('36. حذف إجازة واحدة يحفظ البقية', lastH().length === 3 && !lastH().some((h) => h.date === '2099-02-11') && rows().length === 3);
    await t.test('37. الحد الأقصى للإجازات معرَّف', MAX_HOLIDAYS === 120);
  } finally { body.remove(); document.querySelectorAll('.toast').forEach((x) => x.remove()); }

  /* --- ربط الشاشات --- */
  const cal = await src('pages/calendar.js'); const grid = await src('pages/calendar-grid.js'); const ord2 = await src('pages/orders.js'); const nc = await src('ui/notifications-center.js');
  await t.test('38. التقويم والطلبات ومركز التنبيهات تقرأ مواصفة الإجازة الكاملة (لا الرقم وحده) والشبكة تستعمل isDayOff',
    /resolveDayOffSettings\(s\.dailyLimit\)/.test(cal) && /isDayOff\(ts, state\.dayOffWeekday\)/.test(grid) && /resolveDayOffSettings\(s\.dailyLimit\)/.test(ord2) && /resolveDayOffSettings\(/.test(nc));
});
