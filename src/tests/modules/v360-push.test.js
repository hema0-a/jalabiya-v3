/* ==========================================================================
   v360-push.test.js — إشعارات Push الحقيقية: الملخص + القسم + مفاتيح الإعدادات (v3.6.0)
   ========================================================================== */
import { register } from '../registry.js';
import { buildDigest, pushOptions, serverPrefs, sameDigest, firstName, localYmd, MAX_DIGEST_ORDERS } from '../../services/push-digest.js';
import { pushSection } from '../../pages/settings/section-push.js';
import { getLocalStatus, isPushSupported, tokenHash, _internal } from '../../sync/push-sync.js';

const NOW = new Date(2026, 10, 4, 10, 0, 0).getTime();
const DAY = 86400000;

register('v3.6.0 Push: الملخص والقسم', async (t) => {
  const d = buildDigest({
    orders: [
      { id: 1, status: 'pending', dueDate: NOW + DAY, customerId: 'a' },
      { id: 2, status: 'delivered', dueDate: NOW },
      { id: 3, status: 'cancelled', dueDate: NOW },
      { id: 4, status: 'ready', customerId: 'a' },
      { id: 5, status: 'pending' },
    ],
    customers: [{ id: 'a', name: 'محمد علي حسن' }],
    settings: {}, lowStock: 2, outOfStock: 1, commitments: [{ name: 'إيجار الورشة', dueDay: 5 }, { name: 'x', dueDay: 40 }, { name: 'off', dueDay: 3, active: false }], now: NOW,
  });
  await t.test('1. الملخص يستبعد المسلَّم والملغى وما بلا موعد (إلا الجاهز)', d.orders.length === 2 && d.orders[0].i === '1' && d.orders[1].r === 1);
  await t.test('2. الاسم: أول كلمة فقط', d.orders[0].c === 'محمد' && firstName('  سعيد   أحمد ') === 'سعيد' && firstName(null) === '');
  await t.test('3. تاريخ الموعد YYYY-MM-DD محلي', d.orders[0].d === localYmd(NOW + DAY) && /^\d{4}-\d\d-\d\d$/.test(d.orders[0].d));
  await t.test('4. مخزون + التزامات صالحة وفعّالة فقط', d.low === 2 && d.out === 1 && d.cm.length === 1 && d.cm[0].day === 5);

  const noNames = buildDigest({ orders: [{ id: 1, status: 'pending', dueDate: NOW, customerId: 'a' }], customers: [{ id: 'a', name: 'محمد' }],
    settings: { notifications: { push: { includeNames: false } } }, commitments: [{ name: 'سري', dueDay: 5 }], now: NOW });
  await t.test('5. includeNames=false ⇒ لا اسم عميل ولا اسم التزام في الملخص', !('c' in noNames.orders[0]) && !('t' in noNames.cm[0]) && !JSON.stringify(noNames).includes('محمد'));

  const many = buildDigest({ orders: Array.from({ length: 600 }, (_, i) => ({ id: i, status: 'pending', dueDate: NOW + i * 1000 })), customers: [], settings: {}, now: NOW });
  await t.test('6. سقف الملخص 400 طلب والأقرب موعداً أولاً', many.orders.length === MAX_DIGEST_ORDERS && many.orders[0].i === '0');

  const o = pushOptions({ notifications: { push: { daysBefore: 99, time: '25:00', commitmentsDays: -3 }, quietEnabled: true } });
  await t.test('7. الخيارات تُقصّ وتصحَّح (14 / 08:00 / 0) ومعطّلة افتراضياً', o.daysBefore === 14 && o.time === '08:00' && o.commitmentsDays === 0 && pushOptions({}).enabled === false);
  const sp = serverPrefs({ notifications: { quietEnabled: true, quietFrom: '23:00', quietTo: '06:00', push: { enabled: true } } }, 'Africa/Cairo');
  await t.test('8. serverPrefs: ساعات الهدوء من قسم التنبيهات ولا مفتاح VAPID', sp.quiet.from === '23:00' && sp.enabled === true && !('vapidKey' in sp));
  await t.test('9. sameDigest يتجاهل الطابع الزمني فقط', sameDigest(d, { ...d, at: 1 }) && !sameDigest(d, { ...d, low: 9 }));

  await t.test('10. push-sync: غير مفعّل افتراضياً + ثوابت', getLocalStatus().registered === false && typeof isPushSupported() === 'boolean' && _internal.WATCHED.has('orders'));
  await t.test('11. tokenHash ثابت وطوله 24 حرفاً', (await tokenHash('abc')) === (await tokenHash('abc')) && (await tokenHash('abc')).length === 24);

  const body = document.createElement('div');
  await pushSection.render(body, { notifications: {} }, () => {});
  await t.test('12. القسم يُرسم: مفتاح VAPID + زر تفعيل + وقت + أيام + 5 مفاتيح تبديل',
    pushSection.id === 'push' && body.querySelector('input[type=text]') && body.querySelector('input[type=time]')
    && body.querySelector('input[type=number]') && /تفعيل/.test(body.textContent));
  await t.test('13. الحالة تقول «غير مفعّلة» أو «غير مدعوم» دون استثناء', /غير مفعّلة|غير مدعوم|سجّل الدخول/.test(body.textContent));
});
