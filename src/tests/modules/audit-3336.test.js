/* ==========================================================================
   audit-3336.test.js — تحسينات تجربة الاستخدام على الجوال (v3.3.36)
   - أهداف اللمس ≥ 40px على الشاشات اللمسية، وبطاقات إحصاء مدمجة، ومساحة أسفل المحتوى للزر العائم.
   - شرائح فلترة الطلبات صف قابل للتمرير بدل الالتفاف.
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import * as draftMgr from '../../services/draft-manager.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type = 'input') => el.dispatchEvent(new Event(type, { bubbles: true }));

register('audit v3.3.36 mobile UX polish', async (t) => {
  const css = await (await fetch('styles/components.css')).text();
  t.test('1. أهداف اللمس 40px للشاشات اللمسية', /@media \(pointer: coarse\)[\s\S]*?\.btn--sm\s*\{[^}]*min-height:\s*40px/.test(css));
  t.test('2. أزرار الأيقونات الصغيرة 40px للمس', /@media \(pointer: coarse\)[\s\S]*?\.btn--icon\.btn--sm\s*\{[^}]*width:\s*40px/.test(css));
  t.test('3. بطاقات الإحصاء مدمجة على الجوال', /@media \(max-width: 480px\)\s*\{\s*\.stat\s*\{[^}]*display:\s*grid/.test(css));
  t.test('4. مساحة أسفل المحتوى للزر العائم', /\.app-shell__content\s*\{\s*padding-bottom:\s*calc\(88px/.test(css));
  t.test('5. touch-action: manipulation على العناصر التفاعلية', /touch-action:\s*manipulation/.test(css));

  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    const mod = (await import('../../pages/orders.js')).ordersPage;
    await mod.render(box);
    const f = box.querySelector('#orders-filters');
    t.test('6. فلاتر الطلبات صف قابل للتمرير', !!f && f.classList.contains('scroll-row'));
    t.test('7. الصف لا يلتف (nowrap + overflow-x)', !!f && getComputedStyle(f).flexWrap === 'nowrap' && getComputedStyle(f).overflowX === 'auto');
    t.test('8. الصف يحوي شرائح الحالات', !!f && f.querySelectorAll('button[data-filter]').length >= 2);
    if (mod.destroy) mod.destroy();
  } finally {
    box.remove();
  }
});

/* --- نموذج الطلب (v3.3.36): بسيط، داخل حدود النافذة، اقتراح التاريخ يظهر نتيجته تحت الحقل --- */
register('audit v3.3.36 order form UX', async (t) => {
  const cust = await customersRepo.create({ name: 't3336-cust', phone: '0100336' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  let mod = null;
  const createdIds = [];
  try {
    mod = (await import('../../pages/orders.js')).ordersPage;
    await mod.render(box);
    const addBtn = Array.from(box.querySelectorAll('button')).find((b) => b.textContent.includes('إضافة طلب'));
    t.test('1. زر إضافة طلب موجود', !!addBtn);
    addBtn.click();
    await sleep(150);
    const modalEl = document.querySelector('.modal');
    t.test('2. النافذة فتحت', !!modalEl);
    const mr = modalEl.getBoundingClientRect();

    const outside = Array.from(modalEl.querySelectorAll('input,select,button,textarea')).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > mr.right + 1 || r.left < mr.left - 1);
    });
    t.test('3. لا عنصر يخرج عن حدود النافذة (' + outside.length + ')', outside.length === 0);

    const suggest = Array.from(modalEl.querySelectorAll('button')).find((b) => b.textContent.includes('اقتراح'));
    t.test('4. زر اقتراح التاريخ نصّه واضح وبعرض الحقل', !!suggest && suggest.getBoundingClientRect().width > 150);

    const extras = modalEl.querySelector('details.order-extras');
    t.test('5. «خيارات إضافية» مطوية افتراضياً', !!extras && !extras.open);
    t.test('6. الخصم والرسوم والملاحظات داخل الخيارات الإضافية', !!extras && extras.querySelectorAll('textarea,select').length >= 2);

    /* اقتراح موعد */
    const dateInput = modalEl.querySelector('input[type=date][aria-label="تاريخ التسليم"]');
    t.test('7. حقل تاريخ التسليم فارغ قبل الاقتراح', !!dateInput && dateInput.value === '');
    suggest.click();
    await sleep(100);
    const hint = modalEl.querySelector('.order-hint');
    t.test('8. الاقتراح يملأ التاريخ', !!dateInput.value);
    t.test('9. نتيجة الاقتراح تظهر تحت الحقل', !!hint && hint.textContent.trim().length > 5);
    dateInput.value = '2030-01-01'; fire(dateInput);
    t.test('10. تعديل التاريخ يدوياً يمسح رسالة الاقتراح', hint.textContent.trim() === '');
    suggest.click();
    await sleep(100);

    /* ملء بند + إجمالي البند */
    const sel = modalEl.querySelector('[data-role="customer-picker"]');   /* v3.3.61: اختيار العميل بالبحث */
    sel.value = cust.id; fire(sel, 'change');
    const nameIn = modalEl.querySelector('.order-item input[type=text]');
    const [priceIn, qtyIn] = modalEl.querySelectorAll('.order-item input[type=number]');
    nameIn.value = 'جلابية t3336'; fire(nameIn);
    priceIn.value = '500'; fire(priceIn);
    qtyIn.value = '2'; fire(qtyIn);
    const lineTotal = modalEl.querySelector('.order-item__total');
    t.test('11. إجمالي البند يظهر عند إدخال السعر والكمية', lineTotal.textContent.trim().length > 5);

    /* حفظ */
    const saveBtn = modalEl.querySelector('[data-action="save"]');
    saveBtn.click();
    await sleep(500);
    const mine = (await ordersRepo.list()).filter((o) => o.customerId === cust.id);
    mine.forEach((o) => createdIds.push(o.id));
    t.test('12. الطلب حُفظ بالمبلغ والتاريخ', mine.length === 1 && mine[0].amount === 1000 && !!mine[0].dueDate);
    t.test('13. النافذة أُغلقت بعد الحفظ', !document.querySelector('.modal'));

    /* لا تبقى مسودة بعد الحفظ الناجح (كان إغلاق النافذة يعيد حفظها فتعود بيانات الطلب السابق) */
    await sleep(800);
    t.test('14. لا مسودة متبقية بعد حفظ طلب جديد', !draftMgr.get('order-form'));
  } finally {
    for (const id of createdIds) { try { await ordersRepo.remove(id); } catch { /* */ } }
    try { await customersRepo.remove(cust.id); } catch { /* */ }
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    if (mod && mod.destroy) mod.destroy();
    box.remove();
  }
});
