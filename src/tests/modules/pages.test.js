/* ==========================================================================
   pages.test.js — اختبارات الصفحات
   ==========================================================================
   8 اختبارات: pages/customers
   ========================================================================== */

import { register } from '../registry.js';
import { customersPage, filterCustomers } from '../../pages/customers.js';
import { customers as customersRepo } from '../../data/repos/customers.js';

register('pages/customers.js', async (t) => {
  /* نظّف المخزن قبل البدء */
  await customersRepo.clear();

  /* 1. filterCustomers — استعلام فارغ */
  const list1 = [{ name: 'أحمد' }, { name: 'محمد' }];
  await t.test('1. filterCustomers empty query → all',
    filterCustomers(list1, '').length === 2 &&
    filterCustomers(list1, '   ').length === 2);

  /* 2. filterCustomers — بحث بالاسم (substring) */
  const list2 = [
    { name: 'أحمد علي', phone: '0101' },
    { name: 'محمد سيد', phone: '0102' },
    { name: 'سارة',     phone: '0103' },
  ];
  await t.test('2. filterCustomers by name (substring)',
    filterCustomers(list2, 'أحمد').length === 1 &&
    filterCustomers(list2, 'أحمد')[0].name === 'أحمد علي');

  /* 3. filterCustomers — غير حساس لحالة الأحرف */
  const list3 = [{ name: 'Ahmed' }, { name: 'Sara' }];
  await t.test('3. filterCustomers case-insensitive',
    filterCustomers(list3, 'ahmed').length === 1 &&
    filterCustomers(list3, 'AHMED').length === 1);

  /* 4. filterCustomers — بحث بالهاتف */
  await t.test('4. filterCustomers by phone',
    filterCustomers(list2, '0102').length === 1 &&
    filterCustomers(list2, '0102')[0].name === 'محمد سيد');

  /* 5. filterCustomers — لا نتائج */
  await t.test('5. filterCustomers no match → empty',
    filterCustomers(list2, 'xyz').length === 0);

  /* 6. render — بناء هيكل الصفحة */
  const c6 = document.createElement('div');
  await customersPage.render(c6);
  await t.test('6. render builds page structure',
    c6.querySelector('#customers-stats') !== null &&
    c6.querySelector('#customers-list') !== null &&
    c6.querySelector('input[type="search"]') !== null &&
    c6.querySelector('button.btn--primary') !== null);

  /* 7. render — عرض البطاقات مع بيانات */
  await customersRepo.create({ name: 'أحمد', phone: '0101' });
  await customersRepo.create({ name: 'محمد', phone: '0102' });
  const c7 = document.createElement('div');
  await customersPage.render(c7);
  const cards7 = c7.querySelectorAll('.card[data-id]');
  await t.test('7. render with data shows all cards', cards7.length === 2);

  /* 8. البحث الفوري يُفلتر البطاقات */
  const search8 = c7.querySelector('input[type="search"]');
  search8.value = 'أحمد';
  search8.dispatchEvent(new Event('input', { bubbles: true }));
  const cards8 = c7.querySelectorAll('.card[data-id]');
  await t.test('8. search filters visible cards live', cards8.length === 1);

  /* تنظيف */
  customersPage.destroy();
  await customersRepo.clear();
});
