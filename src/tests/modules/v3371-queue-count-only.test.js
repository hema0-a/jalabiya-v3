/* ==========================================================================
   v3371-queue-count-only.test.js — عدّاد «رسائل اليوم» في لوحة التحكم (v3.3.71)
   ==========================================================================
   buildQueue({countOnly, precomputed}): نفس الأرقام تماماً بلا بناء نصوص ولا إعادة حساب.
   + حارس: dashboard.js بلا import() ديناميكي (القاعدة: static imports فقط).
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { buildQueue } from '../../services/message-queue.js';
import { computePickups } from '../../services/pickup-reminders.js';
import { computeReceivables } from '../../services/receivables.js';
import { loadLog, clearLog } from '../../services/message-log.js';

const DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dataset(now) {
  const soon = new Date(now + 2 * DAY);
  return {
    now,
    customers: [
      { id: 'a', name: 'سالم أحمد', phone: '01011111111' },
      { id: 'b', name: 'محمود سالم', phone: '01022222222' },
      { id: 'c', name: 'مدين', phone: '01033333333' },
      { id: 'd', name: 'مميز', phone: '01044444444', vip: true },
      { id: 'e', name: 'بلا هاتف', phone: '' },
    ],
    orders: [
      { id: 'o1000001', customerId: 'a', status: 'ready', amount: 1000, readyAt: now - 6 * DAY },
      { id: 'o1000002', customerId: 'e', status: 'ready', amount: 400, readyAt: now - 1 * DAY },
      { id: 'o1000003', customerId: 'c', status: 'delivered', amount: 500, deliveredAt: now - 12 * DAY },
      { id: 'o1000004', customerId: 'b', status: 'delivered', amount: 300, deliveredAt: now - DAY },
    ],
    payments: [{ id: 'p1', orderId: 'o1000004', customerId: 'b', amount: 300, createdAt: now - DAY }],
    occasions: [{ id: 'eid', name: 'عيد', icon: '🎉', month: soon.getMonth() + 1, day: soon.getDate(), enabled: true }],
    referrals: [{ id: 'r1', referrerName: 'سالم أحمد', referredName: 'محمود سالم', reward: 100, status: 'pending' }],
    workshop: { name: 'ن' },
    log: [],
  };
}
const keys = (q) => q.tasks.map((x) => x.key).join('|');

register('v3.3.71 buildQueue: countOnly + precomputed (pure)', async (t) => {
  const now = new Date(2026, 9, 12, 12).getTime();
  const base = dataset(now);
  const full = buildQueue(base);
  t.test('0. مجموعة الاختبار تغطي كل الأنواع (استلام/مستحقات/مكافآت/تهاني)',
    ['pickup', 'debt', 'referral', 'greeting'].every((k) => full.counts[k] && full.counts[k].total > 0));

  const co = buildQueue({ ...base, countOnly: true });
  t.test('1. countOnly: نفس العدّادات تماماً', JSON.stringify(co.counts) === JSON.stringify(full.counts));
  t.test('2. countOnly: نفس المهام وبنفس الترتيب', keys(co) === keys(full));
  t.test('3. countOnly: لا نصوص مبنية', co.tasks.length > 0 && co.tasks.every((x) => x.text === ''));
  t.test('4. الوضع الكامل لا يتأثر: كل المهام لها نص', full.tasks.every((x) => typeof x.text === 'string' && x.text.length > 0));
  t.test('5. countOnly لا يغيّر recentlySent/lastSentAt', co.tasks.every((x, i) => x.recentlySent === full.tasks[i].recentlySent && x.lastSentAt === full.tasks[i].lastSentAt));

  const pre = {
    pickups: computePickups(base.orders, base.payments, base.customers, now),
    receivables: computeReceivables(base.orders, base.payments, base.customers, now),
  };
  const withPre = buildQueue({ ...base, precomputed: pre });
  t.test('6. precomputed: نفس النتيجة (مهام ونصوص وعدّادات)', JSON.stringify(withPre) === JSON.stringify(full));
  const both = buildQueue({ ...base, countOnly: true, precomputed: pre });
  t.test('7. الاثنان معاً: نفس العدّادات', JSON.stringify(both.counts) === JSON.stringify(full.counts));

  /* دليل أن precomputed يُستعمل فعلاً (لا يُعاد حسابه): نتيجة وهمية بعنصر واحد */
  const fake = { items: [{ orderId: 'o9999999', customerId: 'a', name: 'وهمي', phone: '0100', amount: 10, remaining: 10, ageDays: 9, late: true }], lateCount: 1 };
  const viaFake = buildQueue({ ...base, precomputed: { pickups: fake } });
  const pk = viaFake.tasks.filter((x) => x.type === 'pickup');
  t.test('8. precomputed.pickups يُستعمل كما هو (لا يُحسب ثانية)', pk.length === 1 && pk[0].key === 'pickup:o9999999');
  t.test('9. شكل precomputed غير صالح ⇐ يُعاد الحساب (لا انهيار)',
    keys(buildQueue({ ...base, precomputed: { pickups: { bad: 1 }, receivables: 'x' } })) === keys(full));
  t.test('10. precomputed فارغ/null آمن', keys(buildQueue({ ...base, precomputed: null })) === keys(full));
  t.test('11. لا يُعدَّل المُدخل المشترك (الأعداد كما هي بعد الاستخدام)',
    pre.pickups.items.length === computePickups(base.orders, base.payments, base.customers, now).items.length);
});

register('v3.3.71 dashboard: counter wiring + static imports (UI)', async (t) => {
  await settingsRepo.clear();
  clearLog();
  const cust = await customersRepo.create({ name: 't3371q-cust', phone: '01055555555' });
  const o = await ordersRepo.create({ customerId: cust.id, status: 'ready', amount: 900, deposit: 0, readyAt: Date.now() - 9 * DAY, dueDate: Date.now() });
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await dashboardPage.render(box);
    const [cs, os, ps, st] = await Promise.all([customersRepo.list(), ordersRepo.list(), paymentsRepo.list(), settingsRepo.get()]);
    const expected = buildQueue({ orders: os, payments: ps, customers: cs, occasions: st.occasions || [], cfg: st.autoMessages || null,
      workshop: st.workshop || {}, log: loadLog(), referrals: [] }).counts;
    const group = [...box.querySelectorAll('.dash-group')].find((g) => g.textContent.includes('رسائل بانتظار الإرسال'));
    t.test('1. مجموعة «رسائل بانتظار الإرسال» تظهر', !!group);
    const m = group && group.textContent.match(/استلام (\d+)/);
    t.test('2. رقم «استلام» في اللوحة = ما يحسبه الطابور الكامل', !!m && Number(m[1]) === expected.pickup.pending);
    t.test('3. الطلب الجاهز المتأخر محسوب (≥ 1)', expected.pickup.pending >= 1);
  } finally {
    dashboardPage.destroy();
    box.remove();
    await ordersRepo.remove(o.id).catch(() => {});
    await customersRepo.remove(cust.id).catch(() => {});
    await settingsRepo.clear();
    clearLog();
  }

  /* حارس القاعدة: لا import() ديناميكي في dashboard.js، والاستيرادان ثابتان في أعلاه */
  const src = await (await fetch(new URL('../../pages/dashboard.js', import.meta.url))).text();
  t.test('4. dashboard.js بلا import() ديناميكي', !/\bimport\s*\(/.test(src));
  t.test('5. backup-nudge و auto-backup مستوردان ثابتاً',
    /^import \{ backupNudge \} from '\.\.\/services\/backup-nudge\.js';/m.test(src) &&
    /^import \{ getLastExternalBackupAt \} from '\.\.\/services\/auto-backup\.js';/m.test(src));
});
