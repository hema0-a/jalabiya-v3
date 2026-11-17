/* ==========================================================================
   v3210-push-appointments-receivables.test.js — الإشعار يكتمل بالمواعيد والمستحقات ويفتح مركز العمل (v3.21.0)
   ========================================================================== */
import { register } from '../registry.js';
import { buildDigest, pushOptions, serverPrefs } from '../../services/push-digest.js';
import { briefCounts } from '../../services/daily-brief.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const DAY = 86400000;
const NOW = new Date(2026, 10, 11, 10, 0).getTime();   /* الأربعاء 2026-11-11 بتوقيت الجهاز */
const ymd = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const base = { settings: { notifications: { push: { enabled: true, includeNames: true } } }, orders: [], customers: [], now: NOW };
const at = (d, h = 12) => new Date(2026, 10, d, h).getTime();

register('v3.21.0 الإشعار: مواعيد اليوم وغداً + مستحقات متأخرة + فتح مركز العمل', async (t) => {
  await t.test('1. المفتاحان الجديدان مفعّلان افتراضياً ويُطفآن ويصلان للخادمة', pushOptions({}).appointments === true && pushOptions({}).receivables === true && pushOptions({ notifications: { push: { appointments: false, receivables: false } } }).appointments === false && serverPrefs({ notifications: { push: { receivables: false } } }, 'UTC').receivables === false && serverPrefs({}, 'UTC').appointments === true);
  const appts = [
    { id: 'a1', title: 'قياس جلابية', date: at(11, 15), status: 'pending' },
    { id: 'a2', title: 'تسليم', date: at(12, 9), status: 'pending' },
    { id: 'a3', title: 'منجز', date: at(11, 9), status: 'done' },
    { id: 'a4', title: 'ملغى', date: at(11, 9), status: 'cancelled' },
    { id: 'a5', title: 'أمس', date: at(10, 9), status: 'pending' },
    { id: 'a6', title: 'بعد غد', date: at(13, 9), status: 'pending' },
    { id: 'a7', title: 'بلا تاريخ', status: 'pending' },
  ];
  await t.test('2. digest.ap: اليوم وغداً فقط وغير المنجز/الملغى، بتوقيت الجهاز', (() => { const d = buildDigest({ ...base, appointments: appts }); return d.ap.length === 2 && d.ap[0].d === '2026-11-11' && d.ap[1].d === '2026-11-12'; })());
  await t.test('3. العنوان يُرفع فقط مع includeNames (وإلا يبقى الموعد بلا نص)', (() => { const on = buildDigest({ ...base, appointments: appts }); const off = buildDigest({ ...base, settings: { notifications: { push: { enabled: true, includeNames: false } } }, appointments: appts }); return on.ap[0].t === 'قياس جلابية' && off.ap.every((a) => a.t === undefined); })());
  await t.test('4. المفتاح مطفأ أو لا مواعيد ⟵ لا digest.ap', !('ap' in buildDigest({ ...base, settings: { notifications: { push: { enabled: true, appointments: false } } }, appointments: appts })) && !('ap' in buildDigest({ ...base, appointments: [] })) && !('ap' in buildDigest(base)));
  await t.test('5. digest.rc: يلزم عدد وإجمالي موجبان، ويُقرَّبان، ويُطفأ بالمفتاح', (() => {
    const a = buildDigest({ ...base, receivables: { n: 3, a: 4500.6 } });
    const bad = [{ n: 0, a: 100 }, { n: 2, a: 0 }, { n: 'x', a: 'y' }, null].every((r) => !('rc' in buildDigest({ ...base, receivables: r })));
    const off = !('rc' in buildDigest({ ...base, settings: { notifications: { push: { enabled: true, receivables: false } } }, receivables: { n: 3, a: 4500 } }));
    return a.rc.n === 3 && a.rc.a === 4501 && bad && off;
  })());
  await t.test('6. لا أسماء عملاء في المستحقات (أرقام مجمَّعة فقط)', (() => { const d = buildDigest({ ...base, receivables: { n: 2, a: 900, names: ['س'], customers: [{ name: 'محمد' }] } }); return JSON.stringify(d.rc) === '{"n":2,"a":900}'; })());
  await t.test('7. توأم التطبيق يصنّف نسبةً ليوم الحساب: ملخص أمس يُحسب بيوم اليوم', (() => { const d = buildDigest({ ...base, now: NOW - DAY, appointments: [{ id: 'x', title: 'غداً بالأمس', date: at(11, 12), status: 'pending' }] }); const c = briefCounts(d, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, daysBefore: 1 }, {}, NOW).counts; return d.ap[0].d === '2026-11-11' && c.appointmentsToday === 1 && c.appointmentsTomorrow === 0; })());

  const ps = await src('sync/push-sync.js'); const sp = await src('pages/settings/section-push.js'); const logic = await src('../functions/push-logic.js');
  await t.test('8. المجمّع: المواعيد والمستحقات بنفس حساب صفحة الديون، ومراقبة المواعيد تُعيد رفع الملخص', ps.includes('computeReceivables(ords, pays, custs, Date.now())') && ps.includes('appointmentsRepo.list()') && ps.includes("'payments', 'expenses', 'appointments'") && ps.includes('receivables, appointments: appts'));
  await t.test('9. الإعدادات: صفّا التفعيل الجديدان', sp.includes("row('appointments'") && sp.includes("row('receivables'"));
  await t.test('10. الخادمة: وجهة الإشعار «مركز العمل» لغير الطلبات', logic.includes("lines.length ? '#/actions' : '#/dashboard'") && logic.includes("'#/orders'"));
});
