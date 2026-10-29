/* ==========================================================================
   v354-accordion-merge.test.js — دمج تصميم الأكورديون (v3.5.4)
   المكوّن الموحّد createCollapsible صار بديل <details> الأصلي في: نموذج الطلب («خيارات إضافية»)،
   تفاصيل المحذوفات، تفاصيل سجل النشاط. أنماط جديدة: dashed · plain، وخاصية node.open.
   ========================================================================== */

import { register } from '../registry.js';
import { createCollapsible, _internal } from '../../ui/collapsible.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import * as draftMgr from '../../services/draft-manager.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkContent = () => { const d = document.createElement('div'); d.textContent = 'محتوى'; return d; };
const header = (c) => c.node.querySelector(':scope > .collapsible__header');
const wrap = (c) => c.node.querySelector(':scope > .collapsible__content');

register('v3.5.4 collapsible: الأنماط وclassName', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);
  const card = createCollapsible({ id: 'v354-card', title: 'بطاقة', content: mkContent() });
  const dashed = createCollapsible({ id: 'v354-dashed', title: 'منقّط', variant: 'dashed', content: mkContent() });
  const plain = createCollapsible({ id: 'v354-plain', title: 'خفيف', variant: 'plain', content: mkContent() });
  const bogus = createCollapsible({ id: 'v354-bogus', title: 'مجهول', variant: 'nonsense', content: mkContent() });
  await t.test('1. الافتراضي card: بلا صنف نمط إضافي',
    card.node.classList.contains('collapsible') && !card.node.classList.contains('collapsible--dashed') && !card.node.classList.contains('collapsible--plain'));
  await t.test('2. dashed يضيف collapsible--dashed', dashed.node.classList.contains('collapsible--dashed') && !dashed.node.classList.contains('collapsible--plain'));
  await t.test('3. plain يضيف collapsible--plain', plain.node.classList.contains('collapsible--plain') && !plain.node.classList.contains('collapsible--dashed'));
  await t.test('4. نمط مجهول يرجع إلى card', !bogus.node.classList.contains('collapsible--nonsense') && !bogus.node.className.includes('--dashed') && !bogus.node.className.includes('--plain'));
  const withCls = createCollapsible({ id: 'v354-cls', title: 'x', className: 'order-extras  extra-one', content: mkContent() });
  await t.test('5. className يُضاف على العقدة (ويُقصّ الفراغ الزائد)',
    withCls.node.classList.contains('order-extras') && withCls.node.classList.contains('extra-one'));
  await t.test('6. كل الأنماط تحمل نفس ARIA (region + aria-expanded + aria-controls)',
    [card, dashed, plain].every((c) => header(c).getAttribute('aria-expanded') === 'false'
      && wrap(c).getAttribute('role') === 'region' && header(c).getAttribute('aria-controls') === wrap(c).id));
  const sum = createCollapsible({ id: 'v354-sum', title: 'ع', variant: 'dashed', summary: 'تلميح', content: mkContent() });
  await t.test('7. ملخص dashed يظهر وهو مغلق ويُخفى بالـ CSS عند الفتح',
    sum.node.querySelector('.collapsible__summary').textContent === 'تلميح'
    && getComputedStyle(sum.node.querySelector('.collapsible__summary')).display !== 'none');
});

register('v3.5.4 collapsible: node.open يطابق <details>', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);
  const toggles = [];
  const c = createCollapsible({ id: 'v354-open', title: 'ت', persist: false, onToggle: (v) => toggles.push(v), content: mkContent() });
  document.body.appendChild(c.node);
  try {
    await t.test('1. open قراءة: مغلق افتراضياً', c.node.open === false);
    c.node.open = true;
    await t.test('2. open = true يفتح (حالة + class + aria + inert)',
      c.node.open === true && c.isOpen() && c.node.classList.contains('collapsible--open')
      && header(c).getAttribute('aria-expanded') === 'true' && wrap(c).inert === false && !wrap(c).hasAttribute('aria-hidden'));
    c.node.open = false;
    await t.test('3. open = false يغلق ويعيد inert + aria-hidden',
      c.node.open === false && !c.isOpen() && wrap(c).inert === true && wrap(c).getAttribute('aria-hidden') === 'true');
    header(c).click();
    await t.test('4. النقر على العنوان يُحدّث .open', c.node.open === true);
    await t.test('5. onToggle يُستدعى مرة لكل تغيير فعلي', toggles.join() === 'true,false,true');
    c.node.open = true;
    await t.test('6. ضبط نفس القيمة لا يُعيد الاستدعاء', toggles.length === 3);
    c.node.open = 0;
    await t.test('7. قيم falsy تُغلق والـ truthy تفتح (مثل <details>)', c.node.open === false && (c.node.open = 'yes', c.node.open === true));
  } finally { c.node.remove(); }
});

register('v3.5.4 collapsible: persist:false وdefaultOpen', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);
  const a = createCollapsible({ id: 'v354-np', title: 'أ', persist: false, defaultOpen: true, content: mkContent() });
  await t.test('1. defaultOpen يُحترم مع persist:false', a.node.open === true);
  a.node.open = false;
  await t.test('2. persist:false لا يكتب شيئاً في localStorage', !(('v354-np') in _internal.readState()));
  const b = createCollapsible({ id: 'v354-np', title: 'ب', persist: false, defaultOpen: true, content: mkContent() });
  await t.test('3. إعادة الإنشاء بنفس المعرّف تبدأ من defaultOpen لا من حالة سابقة', b.node.open === true);
  const p = createCollapsible({ id: 'v354-p', title: 'ج', content: mkContent() });
  p.open();
  await t.test('4. persist الافتراضي يحفظ الحالة (السلوك القديم لم يتغيّر)', _internal.readState()['v354-p'] === true);
  localStorage.removeItem(_internal.STATE_KEY);
});

register('v3.5.4 نموذج الطلب: «خيارات إضافية» صار مكوّناً موحّداً', async (t) => {
  try { draftMgr.clear('order-form'); } catch { /* ignore */ }
  try { localStorage.removeItem('jalabiya_v3_order_form_mode'); } catch { /* ignore */ }
  const cust = await customersRepo.create({ name: 't354-cust', phone: '0100354' });
  const created = [];
  const box = document.createElement('div');
  document.body.appendChild(box);
  const closeModal = () => document.querySelector('.modal [data-action="cancel"]')?.click();
  let mod = null;
  try {
    mod = (await import('../../pages/orders.js')).ordersPage;
    await mod.render(box);
    Array.from(box.querySelectorAll('button')).find((b) => b.textContent.includes('إضافة طلب')).click();
    await sleep(200);
    let m = document.querySelector('.modal');
    const ex = m.querySelector('.order-extras');
    await t.test('1. «خيارات إضافية» عقدة collapsible بنمط dashed (لا <details>)',
      !!ex && ex.classList.contains('collapsible') && ex.classList.contains('collapsible--dashed') && !m.querySelector('details'));
    await t.test('2. مطوية افتراضياً للطلب الجديد (open=false + aria + inert)',
      ex.open === false && ex.querySelector('.collapsible__header').getAttribute('aria-expanded') === 'false'
      && ex.querySelector('.collapsible__content').inert === true);
    await t.test('3. التلميح (خصم · رسوم...) ظاهر في العنوان وهي مغلقة',
      /خصم/.test(ex.querySelector('.collapsible__summary').textContent));
    await t.test('4. يحمل data-full (الوضع السريع يخفيه كما كان)', ex.getAttribute('data-full') === '1');
    const notes = ex.querySelector('textarea');
    notes.focus();
    const blockedWhenClosed = document.activeElement !== notes;
    ex.querySelector('.collapsible__header').click();
    await t.test('5. النقر يفتحها ويحرّر الحقول من inert',
      ex.open === true && ex.querySelector('.collapsible__content').inert === false
      && ex.querySelectorAll('textarea,select').length >= 2);
    notes.focus();
    await t.test('6. الحقول لا تُركَّز وهي مطوية (inert) وتُركَّز بعد الفتح', blockedWhenClosed && document.activeElement === notes);
    m.querySelector('[data-mode="quick"]').click();
    await t.test('7. الوضع السريع يخفيها كلياً', getComputedStyle(ex).display === 'none');
    closeModal(); await sleep(100);

    /* طلب فيه خصم وملاحظات: التعديل يفتحها تلقائياً */
    const o = await ordersRepo.create({
      customerId: cust.id, status: 'pending', amount: 900, deposit: 0, notes: 'ملاحظة اختبار',
      discountType: 'fixed', discountValue: 100, discountAmount: 100,
      items: [{ id: 'i1', name: 'ثوب', price: 1000, quantity: 1 }],
    });
    created.push(o.id);
    try { draftMgr.clear('order-form'); } catch { /* ignore */ }
    await mod.render(box); await sleep(150);
    const editBtn = Array.from(box.querySelectorAll('button')).find((b) => b.textContent.trim() === '✏️');
    if (editBtn) { editBtn.click(); await sleep(200); }
    m = document.querySelector('.modal');
    const ex2 = m && m.querySelector('.order-extras');
    await t.test('8. تعديل طلب فيه خصم وملاحظات: تُفتح تلقائياً', !!ex2 && ex2.open === true && ex2.querySelector('.collapsible__content').inert === false);
    await t.test('9. معرّف العقدة فريد لكل نموذج (لا تصادم ARIA)', !!ex2 && ex2.getAttribute('data-collapsible-id') === 'order-extras-' + o.id);
    closeModal(); await sleep(100);
  } finally {
    closeModal();
    for (const id of created) { try { await ordersRepo.remove(id); } catch { /* ignore */ } }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
    box.remove();
    try { draftMgr.clear('order-form'); } catch { /* ignore */ }
    try { localStorage.removeItem('jalabiya_v3_order_form_mode'); } catch { /* ignore */ }
  }
});

register('v3.5.4 لا بقايا <details> في الصفحات المدموجة', async (t) => {
  const read = async (p) => (await fetch(p)).text();
  const files = ['/src/pages/orders.js', '/src/pages/trash.js', '/src/pages/activity-log.js'];
  const texts = await Promise.all(files.map(read));
  await t.test('1. لا el(\'details\') ولا el(\'summary\') في الصفحات الثلاث', texts.every((s) => !/el\(\s*'(details|summary)'/.test(s)));
  await t.test('2. كلها تستورد createCollapsible (static import)', texts.every((s) => /import \{ createCollapsible \} from '\.\.\/ui\/collapsible\.js'/.test(s)));
  await t.test('3. لا innerHTML في الصفحات الثلاث ولا في المكوّن',
    [...texts, await read('/src/ui/collapsible.js')].every((s) => !/\.innerHTML\s*=/.test(s)));
  const css = await read('/styles/components.css');
  await t.test('4. CSS: لا قواعد order-extras__summary القديمة وفيها النمطان الجديدان',
    !/order-extras__summary/.test(css) && /\.collapsible--dashed/.test(css) && /\.collapsible--plain/.test(css));
});
