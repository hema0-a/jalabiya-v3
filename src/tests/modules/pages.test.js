/* pages.test.js */
import { register } from '../registry.js';
import { customersPage, filterCustomers } from '../../pages/customers.js';
import { customers as customersRepo } from '../../data/repos/customers.js';

register('pages/customers.js', async (t) => {
  await customersRepo.clear();

  const list1 = [{ name: 'A' }, { name: 'B' }];
  await t.test('1. filterCustomers empty query all', filterCustomers(list1, '').length === 2);

  const list2 = [
    { name: 'Ahmed Ali', phone: '0101' },
    { name: 'Mohamed', phone: '0102' },
    { name: 'Sara', phone: '0103' },
  ];
  await t.test('2. filterCustomers by name', filterCustomers(list2, 'Ahmed').length === 1);

  const list3 = [{ name: 'Ahmed' }, { name: 'Sara' }];
  await t.test('3. filterCustomers case-insensitive',
    filterCustomers(list3, 'ahmed').length === 1 &&
    filterCustomers(list3, 'AHMED').length === 1);

  await t.test('4. filterCustomers by phone', filterCustomers(list2, '0102').length === 1);
  await t.test('5. filterCustomers no match', filterCustomers(list2, 'xyz').length === 0);

  const c6 = document.createElement('div');
  await customersPage.render(c6);
  await t.test('6. render builds structure',
    c6.querySelector('#customers-stats') !== null &&
    c6.querySelector('#customers-list') !== null &&
    c6.querySelector('input[type="search"]') !== null);

  await customersRepo.create({ name: 'Ahmed', phone: '0101' });
  await customersRepo.create({ name: 'Mohamed', phone: '0102' });
  const c7 = document.createElement('div');
  await customersPage.render(c7);
  const cards7 = c7.querySelectorAll('.card[data-id]');
  await t.test('7. render with data shows cards', cards7.length === 2);

  const search8 = c7.querySelector('input[type="search"]');
  search8.value = 'Ahmed';
  search8.dispatchEvent(new Event('input', { bubbles: true }));
  const cards8 = c7.querySelectorAll('.card[data-id]');
  await t.test('8. search filters cards', cards8.length === 1);

  customersPage.destroy();
  await customersRepo.clear();
});
