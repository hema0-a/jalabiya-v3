/* ==========================================================================
   audit-3361.test.js — اختيار العميل بالبحث (v3.3.61): منطق البحث + الواجهة
   ========================================================================== */

import { register } from '../registry.js';
import { normalizeSearch, filterCustomers, createCustomerPicker } from '../../ui/customer-picker.js';
import { modal } from '../../ui/modal.js';

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
/* انتظار مشروط (أمتن من مهلة ثابتة تحت ضغط الجهاز) */
const until = async (fn, timeout = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (fn()) return true; await wait(25); }
  return !!fn();
};
const searchInput = () => q('input[type="search"]').find((i) => i.getAttribute('aria-label') === 'بحث عن عميل');
const q = (sel) => Array.from(document.body.querySelectorAll(sel));
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

const customers = [
  { id: 'c1', name: 'محمد علي', phone: '01001234567' },
  { id: 'c2', name: 'أحمد محمود', phone: '01112223344' },
  { id: 'c3', name: 'علي محمد', phone: '01255556666' },
  { id: 'c4', name: 'إبراهيم', phone: '' },
  { id: 'c5', name: 'فاطمة الزهراء', phone: '01099998888' },
  { id: 'c6', name: 'ابراهيم خليل', phone: '01500007777' },
];
const ids = (r) => r.items.map((c) => c.id);

register('audit v3.3.61 customer search logic', async (t) => {
  await t.test('1. تطبيع: التشكيل والتطويل والهمزات والتاء المربوطة والياء والأرقام العربية',
    normalizeSearch('  أَحْمَـد  ') === 'احمد' && normalizeSearch('فاطمة') === 'فاطمه' && normalizeSearch('علىٰ') === 'علي' &&
    normalizeSearch('٠١٠٠١٢٣') === '0100123' && normalizeSearch('إبراهيم') === normalizeSearch('ابراهيم'));

  await t.test('2. بلا استعلام: كل العملاء مرتّبون بالاسم', filterCustomers(customers, '').total === 6);

  let r = filterCustomers(customers, 'محمد');
  await t.test('3. «محمد»: البداية أولاً (محمد علي) ثم ما يحويها (علي محمد)، و«أحمد محمود» لا تطابق',
    ids(r).join() === 'c1,c3');

  r = filterCustomers(customers, 'علي محمد');
  await t.test('4. كلمات متفرقة: «علي محمد» تجد «محمد علي» و«علي محمد»', ids(r).includes('c1') && ids(r).includes('c3') && ids(r)[0] === 'c3');

  r = filterCustomers(customers, 'ابراهيم');
  await t.test('5. اختلاف الهمزة لا يهم: «ابراهيم» تجد «إبراهيم» و«ابراهيم خليل»', ids(r).length === 2 && ids(r).includes('c4') && ids(r).includes('c6'));

  r = filterCustomers(customers, '٠١٠٠١٢٣');
  await t.test('6. أرقام عربية = بحث بالهاتف', ids(r).join() === 'c1');

  r = filterCustomers(customers, '8888');
  await t.test('7. جزء من آخر الهاتف', ids(r).join() === 'c5');

  r = filterCustomers(customers, 'غير موجود');
  await t.test('8. لا مطابقة → قائمة فارغة وtotal=0', r.items.length === 0 && r.total === 0);

  const many = Array.from({ length: 200 }, (_, i) => ({ id: 'm' + i, name: 'عميل ' + i, phone: '' }));
  r = filterCustomers(many, 'عميل');
  await t.test('9. قصّ النتائج عند 60 مع total الحقيقي (200)', r.items.length === 60 && r.total === 200);

  await t.test('10. مدخلات تالفة لا تُسقط البحث',
    filterCustomers(null, 'x').total === 0 && filterCustomers([{ id: 'z' }, null, { name: 'بلا معرّف' }], 'a').total === 0 &&
    filterCustomers([{ id: 'n', name: null, phone: null }], 'x').total === 0);
});

register('audit v3.3.61 customer picker UI', async (t) => {
  let changes = 0;
  const picker = createCustomerPicker({ customers, value: 'c3', onChange: () => {} });
  picker.addEventListener('change', () => { changes++; });
  document.body.appendChild(picker);
  try {
    await t.test('1. يعرض العميل المبدئي (اسم + هاتف) و value يعيد معرّفه',
      picker.value === 'c3' && /علي محمد/.test(picker.textContent) && /01255556666/.test(picker.textContent));

    picker.value = 'nope';
    await t.test('2. معرّف غير موجود (عميل محذوف) → فارغ مع النص التوضيحي', picker.value === '' && /اختر عميلاً/.test(picker.textContent));

    picker.value = 'c5';
    await t.test('3. الإسناد البرمجي يحدّث الحقل بلا إطلاق change (كحال select)', picker.value === 'c5' && changes === 0 && /فاطمة/.test(picker.textContent));

    picker.querySelector('button').click();
    await until(() => !!searchInput());
    const input = searchInput();
    await t.test('4. الضغط يفتح نافذة بحث بحقل مُركَّز وكل العملاء', !!input && q('[data-customer-id]').length === 6);

    input.value = 'ابراهيم'; fire(input, 'input');
    await t.test('5. الكتابة تضيّق القائمة فوراً', q('[data-customer-id]').length === 2);

    input.value = 'zzz'; fire(input, 'input');
    await t.test('6. لا نتيجة: رسالة واضحة', q('[data-customer-id]').length === 0 && q('div').some((d) => d.children.length === 0 && /لا يوجد عميل بهذا/.test(d.textContent)));

    input.value = '0100'; fire(input, 'input');
    const row = q('[data-customer-id]').find((b) => b.getAttribute('data-customer-id') === 'c1');
    row.click();
    await until(() => !searchInput());
    await t.test('7. اختيار صف: يضبط القيمة ويُطلق change مرة ويغلق النافذة',
      picker.value === 'c1' && changes === 1 && !searchInput());

    picker.querySelector('button').click();
    await until(() => !!searchInput());
    const input2 = searchInput();
    input2.value = 'فاطمة'; fire(input2, 'input');
    input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await until(() => !searchInput());
    await t.test('8. Enter يختار أول نتيجة', picker.value === 'c5' && changes === 2);

    picker.querySelector('button').click();
    await until(() => !!searchInput());
    const cancel = q('button').find((b) => b.textContent.trim() === 'إلغاء');
    cancel.click();
    await until(() => !searchInput());
    await t.test('9. إلغاء النافذة لا يغيّر الاختيار', picker.value === 'c5' && changes === 2 && !searchInput());

    const empty = createCustomerPicker({ customers: [] });
    await t.test('10. بلا عملاء: القيمة فارغة ولا أخطاء', empty.value === '');
  } finally {
    modal.closeAll();
    picker.remove();
  }
});
