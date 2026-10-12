/* ==========================================================================
   audit-3346-row.test.js — صف بند الطلب: قائمة منسدلة بدل datalist (يعمل في المتصفح)
   ========================================================================== */

import { register } from '../registry.js';
import { buildItemRow } from '../../pages/orders.js';

const cat = [
  { name: 'جلابية سادة', price: 500, source: 'type', count: 3 },
  { name: 'جلابية مطرزة', price: 800, source: 'type', count: 1 },
  { name: 'طاقية', price: 50, source: 'history', count: 5 },
];
const inputs = (row) => Array.from(row.querySelectorAll('input'));
const priceOf = (row) => inputs(row).find((i) => i.getAttribute('aria-label') === 'السعر');
const nameOf = (row) => inputs(row).find((i) => i.getAttribute('aria-label') === 'اسم البند');
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const mk = (item, c = cat) => buildItemRow({ id: 'x', name: '', price: 0, quantity: 1, ...item }, () => {}, c);

register('audit v3.3.46 item row dropdown', async (t) => {
  let row = mk({});
  let sel = row.querySelector('select');
  await t.test('1. قائمة منسدلة بخمسة خيارات (اختر + 3 + اسم آخر) وحقل الكتابة مخفي',
    !!sel && sel.querySelectorAll('option').length === 5 && sel.querySelectorAll('optgroup').length === 2 && nameOf(row).style.display === 'none');

  sel.value = 'جلابية سادة'; fire(sel, 'change');
  await t.test('2. اختيار نوع يضع الاسم ويملأ السعر', row._getValues().name === 'جلابية سادة' && row._getValues().price === 500);
  sel.value = 'جلابية مطرزة'; fire(sel, 'change');
  await t.test('3. تغيير الاختيار يستبدل السعر التلقائي', row._getValues().price === 800);
  priceOf(row).value = '777'; fire(priceOf(row), 'input');
  sel.value = 'طاقية'; fire(sel, 'change');
  await t.test('4. سعر أدخله المستخدم لا يُستبدل', row._getValues().name === 'طاقية' && row._getValues().price === 777);

  sel.value = '__custom__'; fire(sel, 'change');
  nameOf(row).value = 'قفطان'; fire(nameOf(row), 'input');
  await t.test('5. «اسم آخر» يُظهر حقل الكتابة ويُقرأ الاسم المكتوب', nameOf(row).style.display === '' && row._getValues().name === 'قفطان');

  row = mk({ name: 'جلابية سادة', price: 450, quantity: 2 }); sel = row.querySelector('select');
  await t.test('6. تعديل بند معروف: يُحدَّد في القائمة ويبقى سعره', sel.value === 'جلابية سادة' && row._getValues().price === 450 && row._getValues().quantity === 2);
  row = mk({ name: 'اسم قديم', price: 10 }); sel = row.querySelector('select');
  await t.test('7. بند قديم باسم غير معروف يظهر في حقل الكتابة', sel.value === '__custom__' && nameOf(row).style.display !== 'none' && row._getValues().name === 'اسم قديم');
  row = mk({}, []);
  await t.test('8. بلا قائمة: حقل الكتابة فقط', row.querySelector('select') === null && nameOf(row).style.display !== 'none');
});
