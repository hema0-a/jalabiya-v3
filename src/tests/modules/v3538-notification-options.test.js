/* ==========================================================================
   v3538-notification-options.test.js — التنبيهات: مدة لكل نوع، حد المديونية، ساعات الهدوء، المتأخرة (v3.5.38)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { notificationOptions, isQuietNow, overdueNow, alertToggles } from '../../services/alert-rules.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { notificationsSection } from '../../pages/settings/section-notifications.js';
import { getNotifications } from '../../ui/notifications-center.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import { orders } from '../../data/repos/orders.js';
import { customers as customersRepo } from '../../data/repos/customers.js';

const DAY = 86400000;
const at = (h, m) => new Date(2026, 0, 15, h, m, 0);

register('v3.5.38 التنبيهات: خيارات متقدمة', async (t) => {
  const d = notificationOptions({});
  await t.test('1. الافتراضيات = السلوك السابق (3 / 14 / 5 / اليوم فقط / 0 / مفعّل / 0 / بلا هدوء)',
    d.dueSoonDays === 3 && d.seasonsDays === 14 && d.commitmentsDays === 5 && d.appointmentsDays === 0
    && d.debtMinAmount === 0 && d.overdue === true && d.overdueGraceDays === 0 && d.quietEnabled === false);
  await t.test('2. dueSoonDays الافتراضي يتبع leadDays الأكبر (7 ⇒ 7، 1 ⇒ 3)',
    notificationOptions({ notifications: { leadDays: 7 } }).dueSoonDays === 7 && notificationOptions({ notifications: { leadDays: 1 } }).dueSoonDays === 3);
  await t.test('3. قيم مخصصة تُقرأ وتُقصّ ضمن الحدود', (() => {
    const o = notificationOptions({ notifications: { dueSoonDays: 500, seasonsDays: 0, commitmentsDays: 99, appointmentsDays: 3.9, overdueGraceDays: 99 } });
    return o.dueSoonDays === 60 && o.seasonsDays === 1 && o.commitmentsDays === 28 && o.appointmentsDays === 3 && o.overdueGraceDays === 30;
  })());
  await t.test('4. قيم فاسدة ترجع للافتراضي', (() => {
    const o = notificationOptions({ notifications: { dueSoonDays: 'x', seasonsDays: NaN, debtMinAmount: -5, quietFrom: '25:99', quietTo: 'abc' } });
    return o.dueSoonDays === 3 && o.seasonsDays === 14 && o.debtMinAmount === 0 && o.quietFrom === '22:00' && o.quietTo === '07:00';
  })());
  await t.test('5. overdue=false يعطّل فقط عند false صريحة', notificationOptions({ notifications: { overdue: false } }).overdue === false && notificationOptions({ notifications: { overdue: 0 } }).overdue === true);
  const q = { quietEnabled: true, quietFrom: '22:00', quietTo: '07:00' };
  await t.test('6. هدوء يمرّ بمنتصف الليل: 23:00 و03:00 هدوء، 12:00 لا', isQuietNow(q, at(23, 0)) && isQuietNow(q, at(3, 0)) && !isQuietNow(q, at(12, 0)));
  await t.test('7. حدود الهدوء: 22:00 داخل، 07:00 خارج، 21:59 خارج', isQuietNow(q, at(22, 0)) && !isQuietNow(q, at(7, 0)) && !isQuietNow(q, at(21, 59)));
  const q2 = { quietEnabled: true, quietFrom: '13:00', quietTo: '16:00' };
  await t.test('8. هدوء نهاري (13–16)', isQuietNow(q2, at(14, 30)) && !isQuietNow(q2, at(16, 0)) && !isQuietNow(q2, at(12, 59)));
  await t.test('9. معطّل أو من = إلى ⇒ لا هدوء أبداً', !isQuietNow({ ...q, quietEnabled: false }, at(23, 0)) && !isQuietNow({ quietEnabled: true, quietFrom: '08:00', quietTo: '08:00' }, at(8, 0)) && !isQuietNow(null, at(23, 0)));
  await t.test('10. overdueNow: 0 = الآن، 3 أيام ترجع 3 أيام', overdueNow(1000 * DAY, 0) === 1000 * DAY && overdueNow(1000 * DAY, 3) === 997 * DAY && overdueNow(5, -2) === 5);
  const dn = DEFAULT_SETTINGS.notifications;
  await t.test('11. config: الافتراضيات الجديدة + المفاتيح القديمة سليمة',
    dn.dueSoonDays === null && dn.debtMinAmount === 0 && dn.overdue === true && dn.quietEnabled === false && dn.quietFrom === '22:00' && dn.leadDays === 2 && dn.seasons === true);
  await t.test('12. alertToggles لم تتغير', (() => { const a = alertToggles({}); return a.seasons && a.debts && a.leadDays === 2; })());
  const rp = buildResetPatch('notifications', DEFAULT_SETTINGS);
  await t.test('13. إعادة الضبط تعيد القيم الجديدة', rp && rp.notifications && rp.notifications.quietEnabled === false && rp.notifications.dueSoonDays === null);

  const body = document.createElement('div');
  await notificationsSection.render(body, { notifications: { ...dn } }, () => {});
  await t.test('14. الواجهة: 5 أرقام + مهلة + وقتان ومفتاح هدوء', body.querySelectorAll('input[type=number]').length === 6 && body.querySelectorAll('input[type=time]').length === 2);
  const saved = [];
  const body2 = document.createElement('div');
  await notificationsSection.render(body2, { notifications: { ...dn } }, (p) => saved.push(p));
  const tf = body2.querySelectorAll('input[type=time]')[0];
  tf.value = '23:30'; tf.dispatchEvent(new Event('change'));
  const nf = body2.querySelectorAll('input[type=number]')[0];
  nf.value = '5'; nf.dispatchEvent(new Event('change'));
  nf.value = ''; nf.dispatchEvent(new Event('change'));
  await t.test('15. الحفظ: وقت صحيح، رقم، وفراغ ⇒ null للافتراضي',
    saved[0] && saved[0].notifications.quietFrom === '23:30' && saved[1].notifications.dueSoonDays === 5 && saved[2].notifications.dueSoonDays === null);

  /* ---- تكامل: مركز التنبيهات ---- */
  const origN = (await settingsRepo.get()).notifications;
  const cust = await customersRepo.create({ name: 't3538-c', phone: '01053800001' });
  const o = await orders.create({ customerId: cust.id, status: 'pending', amount: 100, deposit: 0, dueDate: Date.now() - 5 * DAY });
  const lateCount = async () => {
    const l = await getNotifications();
    const x = l.find((n) => /طلب متأخر/.test(n.title));
    return x ? x.count : 0;
  };
  try {
    await settingsRepo.update({ notifications: { overdue: true, overdueGraceDays: 0 } });
    const base = await lateCount();
    await settingsRepo.update({ notifications: { overdueGraceDays: 30 } });
    const grace = await lateCount();
    await settingsRepo.update({ notifications: { overdueGraceDays: 0, overdue: false } });
    const off = await lateCount();
    await t.test('16. المركز: الطلب المتأخر يُحسب؛ مهلة 30 يوماً تستثنيه؛ إيقاف التنبيه يخفي الكل', base >= 1 && grace === base - 1 && off === 0);
    await settingsRepo.update({ notifications: { overdue: true, overdueGraceDays: 4 } });
    await t.test('17. مهلة 4 أيام: متأخر منذ 5 أيام ما زال يُحسب', (await lateCount()) === base);
  } finally {
    await orders.remove(o.id);
    await customersRepo.remove(cust.id);
    await settingsRepo.update({ notifications: origN });
  }
});
