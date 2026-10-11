/* ==========================================================================
   audit-3342.test.js — وضع الإدخال السريع + حدّ الخصم (v3.3.42)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import * as draftMgr from '../../services/draft-manager.js';
import {
  computeTotals, discountPercentOf, isDiscountExcessive, MAX_DISCOUNT_PERCENT,
} from '../../pages/orders.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type = 'input') => el.dispatchEvent(new Event(type, { bubbles: true }));
const MODE_KEY = 'jalabiya_v3_order_form_mode';
const visible = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;

register('audit v3.3.42 discount guard (pure)', async (t) => {
  const items = [{ name: 'جلابية', price: 1000, quantity: 1 }];
  const pct = (v) => computeTotals(items, 'percent', v, []);
  const fix = (v) => computeTotals(items, 'fixed', v, []);
  t.test('1. الحد الافتراضي 20%', MAX_DISCOUNT_PERCENT === 20);
  t.test('2. بلا خصم = 0%', discountPercentOf(computeTotals(items, 'none', 0, [])) === 0);
  t.test('3. 20% بالضبط مسموح', !isDiscountExcessive(pct(20)));
  t.test('4. 21% مفرط', isDiscountExcessive(pct(21)));
  t.test('5. خصم ثابت 250 من 1000 = 25% مفرط', discountPercentOf(fix(250)) === 25 && isDiscountExcessive(fix(250)));
  t.test('6. خصم ثابت 100 = 10% غير مفرط', !isDiscountExcessive(fix(100)));
  t.test('7. مجموع صفر لا ينفجر', discountPercentOf(computeTotals([], 'percent', 50, [])) === 0);
  t.test('8. حدّ مخصّص', isDiscountExcessive(pct(10), 5) && !isDiscountExcessive(pct(5), 5));
});

register('audit v3.3.42 quick order mode + discount confirm (UI)', async (t) => {
  try { localStorage.removeItem(MODE_KEY); } catch { /* ignore */ }
  try { draftMgr.clear('order-form'); } catch { /* ignore */ }
  const cust = await customersRepo.create({ name: 't3342-cust', phone: '0100342' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  const created = [];
  let mod = null;
  const closeModal = () => document.querySelector('.modal [data-action="cancel"]')?.click();
  const openForm = async () => {
    Array.from(box.querySelectorAll('button')).find((b) => b.textContent.includes('إضافة طلب')).click();
    await sleep(150);
    return document.querySelector('.modal');
  };
  try {
    mod = (await import('../../pages/orders.js')).ordersPage;
    await mod.render(box);
    let m = await openForm();
    const form = m.querySelector('.order-form');
    const deposit = () => Array.from(m.querySelectorAll('.field')).find((f) => f.textContent.includes('المقدم'));
    t.test('1. المبدّل ظاهر للطلب الجديد وافتراضه «كامل»', !!m.querySelector('.order-mode') && !form.classList.contains('order-form--quick'));
    t.test('2. في الوضع الكامل المقدم والخيارات ظاهرة', visible(deposit()) && visible(m.querySelector('.order-extras')));

    m.querySelector('[data-mode="quick"]').click();
    t.test('3. الوضع السريع يخفي المقدم والخيارات الإضافية وزر إضافة بند',
      form.classList.contains('order-form--quick') && !visible(deposit()) && !visible(m.querySelector('.order-extras')) &&
      !Array.from(m.querySelectorAll('button')).some((b) => b.textContent.includes('إضافة بند') && visible(b)));
    t.test('4. يبقى العميل والبند والتاريخ ظاهرة',
      visible(m.querySelector('select.select')) && visible(m.querySelector('.order-item input')) && visible(m.querySelector('input[type="date"][aria-label="تاريخ التسليم"]')));
    t.test('5. الاختيار يُحفظ', (() => { try { return localStorage.getItem(MODE_KEY) === 'quick'; } catch { return false; } })());
    t.test('6. aria-pressed صحيح', m.querySelector('[data-mode="quick"]').getAttribute('aria-pressed') === 'true' &&
      m.querySelector('[data-mode="full"]').getAttribute('aria-pressed') === 'false');
    closeModal(); await sleep(100);

    /* إعادة الفتح تتذكر الوضع السريع، والحفظ بثلاثة حقول يعمل */
    try { draftMgr.clear('order-form'); } catch { /* ignore */ }
    m = await openForm();
    t.test('7. الفتح التالي يتذكر الوضع السريع', m.querySelector('.order-form').classList.contains('order-form--quick'));
    m.querySelector('select.select').value = cust.id; fire(m.querySelector('select.select'), 'change');
    const nameIn = m.querySelector('.order-item input');
    nameIn.value = 'جلابية سريعة'; fire(nameIn);
    const priceIn = Array.from(m.querySelectorAll('.order-item input[type="number"]')).find((i) => i.min !== '1' && i !== nameIn);
    if (priceIn) { priceIn.value = '400'; fire(priceIn); }
    m.querySelector('[data-action="save"]').click();
    await sleep(500);
    const mine = (await ordersRepo.list()).filter((o) => o.customerId === cust.id);
    mine.forEach((o) => created.push(o.id));
    t.test('8. الحفظ في الوضع السريع أنشأ الطلب (العميل + البند فقط)', mine.length === 1 && mine[0].items.length === 1 && mine[0].amount === 400 && mine[0].deposit === 0);

    /* حدّ الخصم: بلا تأكيد لا يُحفظ */
    await mod.render(box);
    try { draftMgr.clear('order-form'); } catch { /* ignore */ }
    m = await openForm();
    m.querySelector('[data-mode="full"]').click();
    m.querySelector('select.select').value = cust.id; fire(m.querySelector('select.select'), 'change');
    const n2 = m.querySelector('.order-item input'); n2.value = 'ثوب'; fire(n2);
    const p2 = Array.from(m.querySelectorAll('.order-item input[type="number"]')).find((i) => i.min !== '1' && i !== n2);
    p2.value = '1000'; fire(p2);
    const ex = m.querySelector('.order-extras'); ex.open = true;
    const dsel = Array.from(ex.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === 'percent')); dsel.value = 'percent'; fire(dsel, 'change');
    const dval = ex.querySelector('input[type="number"]'); dval.value = '50'; fire(dval);
    t.test('9. تحذير الخصم المفرط يظهر فوراً', !!m.querySelector('.order-hint--warn[role="alert"]'));
    const before = (await ordersRepo.list()).length;
    m.querySelector('[data-action="save"]').click();
    await sleep(250);
    const confirmBtn = document.querySelector('.modal [data-action="confirm"]');
    t.test('10. الحفظ يطلب تأكيداً ولم يُحفظ بعد', !!confirmBtn && (await ordersRepo.list()).length === before);
    document.querySelector('.modal [data-action="cancel"]:not([data-x])') && null;
    const cancels = Array.from(document.querySelectorAll('.modal [data-action="cancel"]'));
    cancels[cancels.length - 1]?.click();
    await sleep(250);
    t.test('11. «تعديل الخصم» يُبقي النموذج مفتوحاً ولا يحفظ', !!document.querySelector('.order-form') && (await ordersRepo.list()).length === before);
    dval.value = '10'; fire(dval);
    t.test('12. بعد تصحيح الخصم يختفي التحذير', !m.querySelector('.order-hint--warn[role="alert"]'));
    m.querySelector('[data-action="save"]').click();
    await sleep(500);
    const after = (await ordersRepo.list()).filter((o) => o.customerId === cust.id);
    after.forEach((o) => { if (!created.includes(o.id)) created.push(o.id); });
    t.test('13. خصم ≤ 20% يُحفظ بلا تأكيد', after.length === 2 && !document.querySelector('.modal [data-action="confirm"]'));
  } finally {
    try { localStorage.removeItem(MODE_KEY); } catch { /* ignore */ }
    try { draftMgr.clear('order-form'); } catch { /* ignore */ }
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    if (mod && mod.destroy) mod.destroy();
    box.remove();
    for (const id of created) { try { await ordersRepo.remove(id); } catch { /* ignore */ } }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
  }
});
