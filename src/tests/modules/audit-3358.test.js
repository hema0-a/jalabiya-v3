/* ==========================================================================
   audit-3358.test.js — سحب البطاقة + تخصيص الشريط السفلي + ملخص الصباح (v3.3.58)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { attachSwipe, SWIPE_THRESHOLD } from '../../ui/swipe.js';
import {
  mountBottomNav, unmountBottomNav, getNavSlots, setNavSlots, navItems, SLOTS_KEY, DEFAULT_SLOTS, NAV_CHOICES,
} from '../../ui/bottom-nav.js';
import { dayKey, shouldShowMorning, buildMorningModel, MORNING_FROM_HOUR } from '../../services/morning-summary.js';
import { maybeShowMorningSummary, ENABLED_KEY, LAST_KEY } from '../../ui/morning-summary.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;
const ptr = (type, x, y, id = 1, pointerType = 'touch') => new PointerEvent(type, { bubbles: true, pointerType, pointerId: id, clientX: x, clientY: y });
const drag = async (node, dx, dy = 0, pointerType = 'touch', startOn = node) => {
  startOn.dispatchEvent(ptr('pointerdown', 200, 200, 1, pointerType));
  const steps = 6;
  for (let i = 1; i <= steps; i++) node.dispatchEvent(ptr('pointermove', 200 + (dx * i) / steps, 200 + (dy * i) / steps, 1, pointerType));
  node.dispatchEvent(ptr('pointerup', 200 + dx, 200 + dy, 1, pointerType));
  await sleep(20);
};

register('audit v3.3.58 swipe gesture', async (t) => {
  const log = [];
  const card = document.createElement('div');
  card.innerHTML = '<span class="txt">بطاقة</span><button type="button">زر</button>';
  document.body.appendChild(card);
  const off = attachSwipe(card, { onLeft: () => log.push('L'), onRight: () => log.push('R') });
  try {
    t.test('1. العتبة 90px', SWIPE_THRESHOLD === 90);
    await drag(card, -140);
    t.test('2. سحب يساراً بعد العتبة ينفّذ onLeft', log.join() === 'L');
    await drag(card, 140);
    t.test('3. سحب يميناً ينفّذ onRight', log.join() === 'L,R');
    await drag(card, -40);
    t.test('4. سحب قصير لا ينفّذ', log.length === 2);
    await drag(card, -30, 120);
    t.test('5. الحركة العمودية (تمرير) لا تنفّذ', log.length === 2);
    await drag(card, -160, 0, 'mouse');
    t.test('6. الماوس لا يفعّل السحب', log.length === 2);
    await drag(card, -160, 0, 'touch', card.querySelector('button'));
    t.test('7. البدء من زر لا يفعّل السحب', log.length === 2);
    t.test('8. البطاقة تعود لمكانها بعد السحب', card.style.transform === '' && !card.hasAttribute('data-swipe'));
    let clicks = 0;
    card.addEventListener('click', () => clicks++);
    await drag(card, -150);
    card.click();
    t.test('9. النقرة بعد السحب تُبتلع (لا تفتح المعاينة)', clicks === 0);
    await sleep(450);
    card.click();
    t.test('10. وبعدها تعود النقرات طبيعية', clicks === 1);
    off();
    const before = log.length;
    await drag(card, -150);
    t.test('11. الإزالة توقف السحب', log.length === before && !card.classList.contains('swipe-card'));
    const half = document.createElement('div');
    document.body.appendChild(half);
    const l2 = [];
    const off2 = attachSwipe(half, { onLeft: () => l2.push('L') });
    await drag(half, 160);
    t.test('12. اتجاه بلا إجراء لا ينفّذ شيئاً', l2.length === 0);
    off2(); half.remove();
  } finally { off(); card.remove(); }
});

register('audit v3.3.58 swipe on order card', async (t) => {
  const { ordersPage } = await import('../../pages/orders.js');
  const cust = await customersRepo.create({ name: 't3358-swipe', phone: '01058000058' });
  const o = await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 400, deposit: 400, dueDate: Date.now() + 2 * D, items: [{ name: 'ثوب', price: 400, quantity: 1 }] });
  const box = document.createElement('div');
  document.body.appendChild(box);
  try { localStorage.setItem('jalabiya_v3_swipe_tip', '1'); } catch { /* ignore */ }
  try {
    await ordersPage.render(box);
    await sleep(250);
    const cardOf = () => Array.from(box.querySelectorAll('.swipe-card')).find((c) => c.textContent.includes('t3358-swipe'));
    let card = cardOf();
    t.test('1. بطاقة الطلب قابلة للسحب', !!card);
    await drag(card, 150, 0, 'touch', card.querySelector('.card__title, div'));
    await sleep(350);
    t.test('2. السحب يميناً يفتح رسائل العميل', !!document.querySelector('.modal'));
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    await sleep(50);
    card = cardOf();
    await drag(card, -150, 0, 'touch', card.querySelector('div'));
    await sleep(600);
    const after = await ordersRepo.find(o.id);
    t.test('3. السحب يساراً يقدّم الحالة (قيد التنفيذ ← جاهز)', after.status === 'ready');
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
  } finally {
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    if (ordersPage.destroy) ordersPage.destroy();
    box.remove();
    try { await ordersRepo.remove(o.id); } catch { /* ignore */ }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
  }
});

register('audit v3.3.58 bottom nav slots', async (t) => {
  let saved = null;
  try { saved = localStorage.getItem(SLOTS_KEY); localStorage.removeItem(SLOTS_KEY); } catch { /* ignore */ }
  unmountBottomNav();
  try {
    t.test('1. الافتراضي: الرئيسية/الطلبات/العملاء', getNavSlots().join() === DEFAULT_SLOTS.join());
    t.test('2. الترتيب الظاهر مع ＋ في الوسط و«المزيد» أخيراً', navItems().map((i) => i.id).join() === 'dashboard,orders,add,customers,more');
    mountBottomNav({ toggleSidebar() {} }, { route: () => 'orders', navigate() {} });
    const ids = () => Array.from(document.querySelectorAll('.bottom-nav [data-nav]')).map((b) => b.getAttribute('data-nav')).join();
    t.test('3. الشريط يعرض الافتراضي', ids() === 'dashboard,orders,add,customers,more');
    t.test('4. حفظ اختيار جديد يعيد رسم الشريط فوراً', setNavSlots(['payments', 'orders', 'appointments']) === true && ids() === 'payments,orders,add,appointments,more');
    t.test('5. الاختيار يُحفظ', getNavSlots().join() === 'payments,orders,appointments');
    t.test('6. تكرار صفحة مرفوض ولا يغيّر شيئاً', setNavSlots(['orders', 'orders', 'customers']) === false && ids() === 'payments,orders,add,appointments,more');
    t.test('7. معرّف غير معروف مرفوض', setNavSlots(['payments', 'nope', 'customers']) === false);
    t.test('8. العدد الخاطئ مرفوض', setNavSlots(['payments', 'orders']) === false);
    try { localStorage.setItem(SLOTS_KEY, '{bad json'); } catch { /* ignore */ }
    t.test('9. تخزين تالف يرجع للافتراضي', getNavSlots().join() === DEFAULT_SLOTS.join());
    t.test('10. كل الخيارات لها أيقونة واسم ومسار', NAV_CHOICES.every((c) => c.icon && c.label && /^#\//.test(c.hash)));
    t.test('11. الزر النشط يتبع الصفحة المخصّصة', (() => { setNavSlots(['orders', 'payments', 'customers']); return !!document.querySelector('.bottom-nav [data-nav="orders"].bottom-nav__item--active'); })());
  } finally {
    unmountBottomNav();
    try { if (saved === null) localStorage.removeItem(SLOTS_KEY); else localStorage.setItem(SLOTS_KEY, saved); } catch { /* ignore */ }
  }
});

register('audit v3.3.58 morning summary', async (t) => {
  const at = (h) => new Date(2026, 9, 14, h, 0, 0).getTime();
  t.test('1. مفتاح اليوم', dayKey(at(9)) === '2026-10-14');
  t.test('2. يُعرض لأول مرة في اليوم', shouldShowMorning({ enabled: true, last: '2026-10-13', now: at(9) }) === true);
  t.test('3. لا يتكرر في نفس اليوم', shouldShowMorning({ enabled: true, last: '2026-10-14', now: at(11) }) === false);
  t.test('4. لا يُعرض قبل الرابعة فجراً', MORNING_FROM_HOUR === 4 && shouldShowMorning({ enabled: true, last: '', now: at(3) }) === false);
  t.test('5. الإيقاف يمنعه', shouldShowMorning({ enabled: false, last: '', now: at(9) }) === false);

  const now = at(9);
  const customers = [{ id: 'c1', name: 'سعد' }, { id: 'c2', name: 'منى' }];
  const orders = [
    { id: 'o1', customerId: 'c1', status: 'in_progress', dueDate: now - 3 * D },
    { id: 'o2', customerId: 'c2', status: 'pending', dueDate: at(15) },
    { id: 'o3', customerId: 'c2', status: 'ready', amount: 100, readyAt: now - D },
  ];
  const appointments = [{ id: 'a1', customerId: 'c1', date: at(16), title: 'قياس' }];
  const m = buildMorningModel({ orders, customers, appointments, payments: [] }, now);
  const ids = m.sections.map((s) => s.id);
  t.test('6. الأقسام غير الفارغة فقط', ids.join() === 'late,today,ready,appts,week');
  t.test('7. المتأخر بالاسم والأيام', m.sections[0].names[0] === 'سعد (3 يوم)');
  t.test('8. موعد اليوم باسم العميل', m.sections.find((s) => s.id === 'appts').names[0] === 'سعد — قياس');
  t.test('9. الإجمالي = مجموع الأعداد', m.total === m.sections.reduce((n, s) => n + s.count, 0) && m.total > 0);
  t.test('10. بلا بيانات: لا أقسام', buildMorningModel({}, now).total === 0 && buildMorningModel({}, now).sections.length === 0);

  /* النافذة الفعلية */
  let savedOn = null; let savedLast = null;
  try { savedOn = localStorage.getItem(ENABLED_KEY); savedLast = localStorage.getItem(LAST_KEY); localStorage.removeItem(ENABLED_KEY); localStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
  const cust = await customersRepo.create({ name: 't3358-morning', phone: '01058000059' });
  const t10 = new Date(); t10.setHours(10, 0, 0, 0);
  const late = await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 300, deposit: 0, dueDate: t10.getTime() - 2 * D });
  try {
    const r1 = await maybeShowMorningSummary(t10.getTime());
    await sleep(100);
    const m1 = document.querySelector('.modal');
    t.test('11. النافذة تظهر بالملخص وزر فتح اللوحة', r1 === 'shown' && !!m1 && m1.textContent.includes('ملخص الصباح') && m1.textContent.includes('طلبات متأخرة') && !!m1.querySelector('[data-action="open-dashboard"]'));
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    const r2 = await maybeShowMorningSummary(t10.getTime());
    t.test('12. لا تتكرر في اليوم نفسه', r2 === 'skipped' && !document.querySelector('.modal'));
    try { localStorage.setItem(ENABLED_KEY, 'off'); localStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
    t.test('13. الإيقاف من الإعدادات يمنعها', (await maybeShowMorningSummary(t10.getTime())) === 'skipped');
  } finally {
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    try { if (savedOn === null) localStorage.removeItem(ENABLED_KEY); else localStorage.setItem(ENABLED_KEY, savedOn); } catch { /* ignore */ }
    try { if (savedLast === null) localStorage.removeItem(LAST_KEY); else localStorage.setItem(LAST_KEY, savedLast); } catch { /* ignore */ }
    try { await ordersRepo.remove(late.id); } catch { /* ignore */ }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
  }
});
