/* ==========================================================================
   audit-3347.test.js — الطلبات المعرَّضة للتأخر + استرجاع الرقم بالحساب + نسخة خارج الجهاز
   ========================================================================== */

import { register } from '../registry.js';
import { assessOrderRisks } from '../../services/order-risk.js';
import { getOrderParts } from '../../services/order-scheduler.js';
import { dayKey } from '../../core/day-math.js';
import { recoverPinWithCloud } from '../../security/pin-recovery.js';
import { setPin, isPinSet } from '../../security/pin-crypto.js';
import { auth } from '../../security/auth.js';
import { STORAGE_KEYS } from '../../core/config.js';
import { customers } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { shareLatestBackup, daysSinceExternalBackup, markExternalBackup, getLastExternalBackupAt } from '../../services/auto-backup.js';

const dayAt = (n, h = 12) => { const b = new Date(); return new Date(b.getFullYear(), b.getMonth(), b.getDate() + n, h, 0, 0, 0); };
const ord = (id, n, status, extra = {}) => ({ id, status, amount: 500, dueDate: dayAt(n).getTime(), ...extra });
const cfg = { dailyOrderLimit: 700, dayOffWeekday: dayAt(6).getDay() };
const codes = (r) => r.reasons.map((x) => x.code);

register('audit v3.3.47 risk / pin recovery / external backup', async (t) => {
  /* --- مخاطر التأخر --- */
  let r = assessOrderRisks([ord('a', 0, 'pending')], cfg);
  await t.test('1. موعده اليوم وحالته انتظار → خطر', r.length === 1 && r[0].level === 'danger' && codes(r[0]).includes('due_today_not_ready'));
  await t.test('2. موعده اليوم وهو «جاهز» → ليس معرَّضاً', assessOrderRisks([ord('a', 0, 'ready')], cfg).length === 0);
  r = assessOrderRisks([ord('b', 1, 'pending')], cfg);
  await t.test('3. موعده غداً ولم يبدأ → تحذير', r.length === 1 && r[0].level === 'warn' && codes(r[0]).includes('due_tomorrow_not_started'));
  await t.test('4. موعده غداً وقيد التنفيذ → ليس معرَّضاً', assessOrderRisks([ord('b', 1, 'in_progress')], cfg).length === 0);
  await t.test('5. المتأخر فعلاً والمسلَّم والملغى والبلا موعد لا يُقيَّمون',
    assessOrderRisks([ord('c', -1, 'pending'), ord('d', 0, 'delivered'), ord('e', 0, 'cancelled'), { id: 'f', status: 'pending' }], cfg).length === 0);

  const plan = (n) => [{ day: dayKey(dayAt(n)), amount: 500 }];
  const started = { ...ord('g', 5, 'pending'), workPlan: plan(-2).concat(plan(5)).map((p, i) => ({ day: p.day, amount: i === 0 ? 200 : 300 })) };
  await t.test('6. بدأت خطته ومضى أول يوم وهو ما زال انتظاراً → تحذير plan_not_started',
    codes(assessOrderRisks([started], cfg)[0] || { reasons: [] }).includes('plan_not_started'));
  await t.test('7. نفس الطلب وهو قيد التنفيذ → لا تحذير', assessOrderRisks([{ ...started, status: 'in_progress' }], cfg).length === 0);

  const over = [ord('h', 3, 'in_progress'), ord('i', 3, 'in_progress', { amount: 600 })];     /* 1100 على حد 700 */
  r = assessOrderRisks(over, cfg);
  await t.test('8. حِمل يوم تسليمهما 1100 على حد 700 → الاثنان overbooked', r.length === 2 && r.every((x) => codes(x).includes('overbooked')));
  await t.test('9. بلا حد يومي لا تُقيَّم أسباب الخطة/الحِمل', assessOrderRisks(over, { dailyOrderLimit: 0 }).length === 0);
  r = assessOrderRisks([ord('w', 1, 'pending'), ord('x', 0, 'pending')], cfg);
  await t.test('10. الترتيب: الأخطر أولاً', r.length === 2 && r[0].order.id === 'x' && r[0].level === 'danger');
  await t.test('11. getOrderParts مرتّبة وتحترم الخطة المحفوظة',
    (() => { const p = getOrderParts({ amount: 500, dueDate: dayAt(2).getTime(), workPlan: [{ day: dayKey(dayAt(2)), amount: 200 }, { day: dayKey(dayAt(1)), amount: 300 }] }, cfg); return p.length === 2 && p[0].amount === 300; })());

  /* --- استرجاع الرقم بحساب المزامنة --- */
  await setPin('1995');
  let called = 0;
  let res = await recoverPinWithCloud('', '', { login: async () => { called++; return { ok: true }; } });
  await t.test('12. حقول فارغة: لا يُستدعى تسجيل الدخول والرقم باقٍ', !res.success && called === 0 && isPinSet());
  res = await recoverPinWithCloud('a@b.com', 'bad', { login: async () => ({ ok: false, error: 'كلمة المرور غير صحيحة' }) });
  await t.test('13. حساب خاطئ: يفشل بسبب واضح والرقم باقٍ', !res.success && /كلمة المرور/.test(res.error) && isPinSet());
  res = await recoverPinWithCloud('a@b.com', 'x', { login: async () => { throw new Error('offline'); } });
  await t.test('14. انقطاع الاتصال لا يُسقط الدالة', !res.success && /offline/.test(res.error) && isPinSet());
  localStorage.setItem(STORAGE_KEYS.V3_FAILED_ATTEMPTS, '7');
  localStorage.setItem(STORAGE_KEYS.V3_LOCK_UNTIL, String(Date.now() + 60000));
  res = await recoverPinWithCloud(' a@b.com ', 'ok', {
    login: async (e, p) => ({ ok: e === 'a@b.com' && p === 'ok', user: { uid: 'owner1' } }),
    getOwnerUid: () => 'owner1', logout: async () => ({ ok: true }),
  });
  await t.test('15. حساب صحيح: يُزال الرقم وتُصفَّر المحاولات والقفل',
    res.success && !isPinSet() && auth.getAttempts() === 0 && !auth.isLocked());

  /* --- نسخة خارج الجهاز --- */
  localStorage.removeItem(STORAGE_KEYS.V3_LAST_EXTERNAL_BACKUP);
  await t.test('16. لم تُحفظ قط → null', daysSinceExternalBackup() === null && getLastExternalBackupAt() === 0);
  markExternalBackup(Date.now() - 3 * 86400000 - 1000);
  await t.test('17. بعد 3 أيام → 3', daysSinceExternalBackup() === 3);
  await customers.clear(); await ordersRepo.clear();
  let shared = null;
  const nav = { canShare: () => true, share: async (d) => { shared = d; } };
  localStorage.removeItem(STORAGE_KEYS.V3_LAST_EXTERNAL_BACKUP);
  let out = await shareLatestBackup({ navigator: nav, download: async () => false });
  await t.test('18. المشاركة تنجح وتُسجَّل كنسخة خارجية', out.ok && out.method === 'share' && shared && shared.files.length === 1 && daysSinceExternalBackup() === 0);
  localStorage.removeItem(STORAGE_KEYS.V3_LAST_EXTERNAL_BACKUP);
  out = await shareLatestBackup({ navigator: { canShare: () => true, share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } }, download: async () => true });
  await t.test('19. إلغاء المشاركة لا يُسجَّل ولا يُنزَّل', out.cancelled === true && getLastExternalBackupAt() === 0);
  let dl = 0;
  out = await shareLatestBackup({ navigator: {}, download: async () => { dl++; return true; } });
  await t.test('20. بلا دعم مشاركة ينزّل الملف', out.ok && out.method === 'download' && dl === 1);
});
