/* ==========================================================================
   audit-3345.test.js — سياسة العربون + مكافآت الإحالة التلقائية (v3.3.45)
   ========================================================================== */

import { register } from '../registry.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { referrals as referralsRepo } from '../../data/repos/referrals.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';
import { referralsPage } from '../../pages/referrals.js';
import { depositGuard } from '../../ui/deposit-guard.js';
import { normalizePolicy, checkDeposit, isStartTransition } from '../../services/deposit-policy.js';
import { resolveCustomer, computeReferralRewards, referralVars } from '../../services/referral-rewards.js';
import { buildVars, findUnknownVariables, getTemplateSync, DEFAULT_TEMPLATES } from '../../services/message-templates.js';
import { buildQueue } from '../../services/message-queue.js';
import { getOrderMessageOptions } from '../../services/auto-messages.js';
import { clearLog } from '../../services/message-log.js';

const DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findBtn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));

register('audit v3.3.45 deposit policy (pure)', async (t) => {
  t.test('1. الافتراضي مفعّل 30%', normalizePolicy(undefined).enabled === true && normalizePolicy({}).minPercent === 30);
  t.test('2. نسبة خارج 1–100 تعود 30', normalizePolicy({ minPercent: 0 }).minPercent === 30 && normalizePolicy({ minPercent: 150 }).minPercent === 30);
  t.test('3. نسبة صالحة تُحفظ', normalizePolicy({ minPercent: 50 }).minPercent === 50);
  t.test('4. تعطيل صريح', normalizePolicy({ enabled: false }).enabled === false);

  const o = { amount: 1000 };
  let c = checkDeposit(o, 0, {});
  t.test('5. بلا عربون: ناقص 300', c.applies && !c.ok && c.required === 300 && c.shortfall === 300 && c.percentPaid === 0);
  c = checkDeposit(o, 300, {});
  t.test('6. عربون = الحد: كافٍ', c.ok && c.shortfall === 0);
  c = checkDeposit(o, 299, {});
  t.test('7. أقل بجنيه: ناقص 1', !c.ok && c.shortfall === 1 && c.percentPaid === 30);
  t.test('8. مبلغ صفر: لا ينطبق', checkDeposit({ amount: 0 }, 0, {}).applies === false && checkDeposit({ amount: 0 }, 0, {}).ok === true);
  t.test('9. معطّل: لا ينطبق ويُعدّ كافياً', checkDeposit(o, 0, { enabled: false }).ok === true);
  t.test('10. مدخلات تالفة لا تُسقط', checkDeposit(null, undefined, null).ok === true);
  t.test('11. الانتقال المقصود: معلق ← قيد التنفيذ فقط',
    isStartTransition({ status: 'pending' }, 'in_progress') && !isStartTransition({ status: 'in_progress' }, 'ready') && !isStartTransition(null, 'in_progress'));

  const v = buildVars({ id: 'o123456', amount: 1000 }, { name: 'س' }, {}, { paid: 100, depositPercent: 50 });
  t.test('12. {depositDue} = 50% − المدفوع = 400', v.depositDue.includes('400'));
  t.test('13. depositPercent لا يتسرب كمتغير', !('depositPercent' in v));
  t.test('14. قالب «طلب عربون» موجود وبلا متغيرات خاطئة',
    findUnknownVariables(getTemplateSync('deposit_request').text, 'order').length === 0);
});

register('audit v3.3.45 deposit message + guard (DB)', async (t) => {
  await settingsRepo.clear();
  clearLog();
  await settingsRepo.update({ depositPolicy: { enabled: true, minPercent: 50 } });
  const order = { id: 'o8888881', amount: 1000, deposit: 0, customerId: 'c1' };
  const opts = await getOrderMessageOptions(order, { id: 'c1', name: 'سالم', phone: '' }, {});
  t.test('1. رسالة «طلب عربون» تستخدم نسبة الإعدادات (500)', opts.find((o) => o.id === 'deposit_request').text.includes('500'));

  const cust = await customersRepo.create({ name: 't3345-cust', phone: '01012345678' });
  const mk = (extra) => ordersRepo.create({ customerId: cust.id, status: 'pending', amount: 1000, deposit: 0, ...extra });
  const made = [];
  try {
    const o1 = await mk(); made.push(o1);
    const p1 = depositGuard(o1, 'in_progress');
    await sleep(80);
    t.test('2. عربون ناقص: نافذة تحذير بزر «ابدأ على أي حال» و«اطلب العربون»', !!findBtn('ابدأ على أي حال') && !!findBtn('اطلب العربون'));
    findBtn('ابدأ على أي حال').click();
    t.test('3. «ابدأ على أي حال» ← true', (await p1) === true);

    const o2 = await mk(); made.push(o2);
    const p2 = depositGuard(o2, 'in_progress');
    await sleep(80);
    findBtn('إلغاء').click();
    t.test('4. «إلغاء» ← false', (await p2) === false);

    const o3 = await mk({ deposit: 600 }); made.push(o3);
    t.test('5. مقدم كافٍ ← true بلا نافذة', (await depositGuard(o3, 'in_progress')) === true && !findBtn('ابدأ على أي حال'));
    t.test('6. انتقال آخر (جاهز) ← true بلا فحص', (await depositGuard({ ...o1, status: 'in_progress' }, 'ready')) === true);

    await settingsRepo.update({ depositPolicy: { enabled: false } });
    t.test('7. السياسة معطّلة ← true بلا نافذة', (await depositGuard(o1, 'in_progress')) === true && !findBtn('ابدأ على أي حال'));
  } finally {
    for (const o of made) { try { await ordersRepo.remove(o.id); } catch (e) { /* ignore */ } }
    try { await customersRepo.remove(cust.id); } catch (e) { /* ignore */ }
    document.querySelectorAll('.modal, .modal-overlay').forEach((n) => n.remove());
    await settingsRepo.clear();
    clearLog();
  }
});

register('audit v3.3.45 referral rewards (pure)', async (t) => {
  const customers = [
    { id: 'a', name: 'سالم أحمد', phone: '01011111111' },
    { id: 'b', name: 'محمود سالم', phone: '01022222222' },
    { id: 'd1', name: 'مكرر', phone: '' }, { id: 'd2', name: 'مكرر', phone: '' },
  ];
  t.test('1. الربط بالمعرّف', resolveCustomer(customers, { id: 'b' }).id === 'b');
  t.test('2. الربط بالهاتف (صيغ مختلفة)', resolveCustomer(customers, { phone: '+201022222222' }).id === 'b' && resolveCustomer(customers, { phone: '01022222222' }).id === 'b');
  t.test('3. الربط بالاسم الوحيد (مسافات/حالة)', resolveCustomer(customers, { name: '  سالم   أحمد ' }).id === 'a');
  t.test('4. الاسم المكرر لا يُخمَّن', resolveCustomer(customers, { name: 'مكرر' }) === null);
  t.test('5. غير موجود = null', resolveCustomer(customers, { name: 'لا أحد' }) === null && resolveCustomer(null, { id: 'a' }) === null);

  const refs = [
    { id: 'r1', referrerName: 'سالم أحمد', referredName: 'محمود سالم', referredPhone: '01022222222', reward: 100, status: 'pending' },
    { id: 'r2', referrerName: 'سالم أحمد', referredName: 'غريب', reward: 50, status: 'pending' },
    { id: 'r3', referrerName: 'سالم أحمد', referredName: 'محمود سالم', reward: 50, status: 'paid' },
    { id: 'r4', referrerName: 'سالم أحمد', referredName: 'مكرر', reward: 0 },
  ];
  const orders = [
    { id: 'o1', customerId: 'b', status: 'in_progress', createdAt: 1 },
    { id: 'o3', customerId: 'b', status: 'delivered', deliveredAt: 3000 },
    { id: 'o2', customerId: 'b', status: 'delivered', deliveredAt: 2000 },
    { id: 'o9', customerId: 'b', status: 'cancelled' },
  ];
  const res = computeReferralRewards(refs, customers, orders);
  const by = Object.fromEntries(res.map((x) => [x.referral.id, x]));
  t.test('6. المدفوعة تُستثنى', !by.r3);
  t.test('7. المُحال المسلَّم له طلب ⇒ due وأول طلب هو الأقدم تسليماً', by.r1.state === 'due' && by.r1.order.id === 'o2' && by.r1.referrer.id === 'a');
  t.test('8. المُحال غير الموجود ⇒ unlinked', by.r2.state === 'unlinked');
  t.test('9. اسم مكرر ⇒ unlinked', by.r4.state === 'unlinked');
  t.test('10. بلا طلب مُسلَّم ⇒ waiting', computeReferralRewards(refs.slice(0, 1), customers, orders.slice(0, 1))[0].state === 'waiting');
  t.test('11. الطلب الملغى لا يُحسب', computeReferralRewards(refs.slice(0, 1), customers, [orders[3]])[0].state === 'waiting');

  const vars = referralVars(by.r1, { name: 'ن' });
  t.test('12. المتغيرات: المُرشِّح والمُحال والمكافأة', vars.customer === 'سالم أحمد' && vars.referred === 'محمود سالم' && vars.rewardLine.includes('100'));
  t.test('13. مكافأة صفر ⇒ سطر فارغ (يُحذف من الرسالة)', referralVars({ ...by.r1, reward: 0 }, '').rewardLine === '');
  t.test('14. القالب الافتراضي بلا متغيرات خاطئة', (() => { const d = DEFAULT_TEMPLATES.find((x) => x.id === 'referral_reward'); return findUnknownVariables(d.text, d.scope).length === 0; })());
});

register('audit v3.3.45 referral rewards in the message queue', async (t) => {
  const now = Date.now();
  const customers = [
    { id: 'a', name: 'سالم أحمد', phone: '01011111111' },
    { id: 'b', name: 'محمود سالم', phone: '01022222222' },
    { id: 'z', name: 'زيد', phone: '' },
  ];
  const orders = [{ id: 'o2', customerId: 'b', status: 'delivered', deliveredAt: now - DAY, amount: 500 }];
  const referrals = [
    { id: 'r1', referrerName: 'سالم أحمد', referredName: 'محمود سالم', reward: 100, status: 'pending' },
    { id: 'r2', referrerName: 'زيد', referredName: 'محمود سالم', reward: 0, status: 'pending' },
  ];
  const q = buildQueue({ orders, payments: [{ id: 'p', orderId: 'o2', customerId: 'b', amount: 500 }], customers, referrals, log: [], now });
  const tasks = q.tasks.filter((x) => x.type === 'referral');
  t.test('1. مهمتان للمكافآت', tasks.length === 2);
  const t1 = tasks.find((x) => x.ref === 'r1');
  t.test('2. نص الشكر فيه اسم المُحال والمكافأة', t1.text.includes('محمود سالم') && t1.text.includes('100'));
  t.test('3. المُرشِّح له هاتف ⇒ قابل للإرسال', t1.hasPhone && !t1.recentlySent && t1.kind === 'referral_reward');
  const t2 = tasks.find((x) => x.ref === 'r2');
  t.test('4. المُرشِّح بلا هاتف ⇒ لا يُرسَل', !t2.hasPhone);
  t.test('5. مكافأة صفر: لا سطر مكافأة في الرسالة', !t2.text.includes('مكافأتك'));
  t.test('6. العدّاد يفصل المكافآت', q.counts.referral.pending === 1 && q.counts.referral.total === 2);

  const sent = buildQueue({ orders, payments: [], customers, referrals, log: [{ k: 'referral_reward', r: 'r1', c: 'a', t: now - 1000 }], now });
  t.test('7. بعد فتح الشكر لا يتكرر', sent.tasks.find((x) => x.ref === 'r1').recentlySent === true);
  const off = buildQueue({ orders, payments: [], customers, referrals, log: [], now, cfg: { templates: { referral_reward: { enabled: false } } } });
  t.test('8. تعطيل القالب يلغي المهام', !off.tasks.some((x) => x.type === 'referral'));
  const paid = buildQueue({ orders, payments: [], customers, referrals: [{ ...referrals[0], status: 'paid' }], log: [], now });
  t.test('9. بعد دفع المكافأة تختفي', !paid.tasks.some((x) => x.type === 'referral'));
});

register('audit v3.3.45 referrals page + settings section (UI)', async (t) => {
  await settingsRepo.clear();
  clearLog();
  const a = await customersRepo.create({ name: 't3345-referrer', phone: '01033333333' });
  const b = await customersRepo.create({ name: 't3345-referred', phone: '01044444444' });
  const o = await ordersRepo.create({ customerId: b.id, status: 'delivered', amount: 700, deliveredAt: Date.now() });
  const r = await referralsRepo.create({ referrerName: 't3345-referrer', referredName: 't3345-referred', referredPhone: '01044444444', reward: 80, status: 'pending', date: Date.now() });
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await referralsPage.render(box);
    t.test('1. الإحالة تظهر «🎁 جاهزة للمكافأة»', box.textContent.includes('جاهزة للمكافأة'));
    t.test('2. زر «شكر + مكافأة» مفعّل', (() => { const b2 = [...box.querySelectorAll('button')].find((x) => x.textContent.includes('شكر + مكافأة')); return !!b2 && !b2.disabled; })());
    t.test('3. فلتر «🎁 جاهزة» يحسب 1 على الأقل', box.querySelector('#ref-filters').textContent.includes('جاهزة (1)') || /جاهزة \(\d+\)/.test(box.querySelector('#ref-filters').textContent));

    await referralsRepo.update(r.id, { status: 'paid' });
    await referralsPage.render(box);
    t.test('4. بعد الدفع لا تظهر كجاهزة', !box.textContent.includes('جاهزة للمكافأة'));
  } finally {
    referralsPage.destroy();
    box.remove();
    await referralsRepo.remove(r.id).catch(() => {});
    await ordersRepo.remove(o.id).catch(() => {});
    await customersRepo.remove(a.id).catch(() => {});
    await customersRepo.remove(b.id).catch(() => {});
  }

  const sec = DATA_SECTIONS.find((x) => x.id === 'deposit-policy');
  const pending = [];
  const body = document.createElement('div');
  await sec.render(body, await settingsRepo.get(), (patch) => { pending.push(settingsRepo.update(patch)); });
  const tog = body.querySelector('.toggle__input');
  tog.checked = false; tog.dispatchEvent(new Event('change', { bubbles: true }));
  await Promise.all(pending);
  t.test('5. قسم العربون يحفظ التعطيل', (await settingsRepo.get()).depositPolicy.enabled === false);
  await settingsRepo.clear();
  clearLog();
});
