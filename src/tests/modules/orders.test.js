/* ==========================================================================
   orders.test.js — اختبارات صفحة الطلبات
   ========================================================================== */

import { register } from '../registry.js';
import { ordersPage, filterOrders } from '../../pages/orders.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { customers as customersRepo } from '../../data/repos/customers.js';

register('pages/orders.js', async (t) => {
  await ordersRepo.clear();
  await customersRepo.clear();

  const list1 = [
    { id: '1', status: 'pending' },
    { id: '2', status: 'in_progress' },
    { id: '3', status: 'delivered' },
  ];
  await t.test('1. filterOrders all → all items',
    filterOrders(list1, 'all').length === 3);

  await t.test('2. filterOrders by status',
    filterOrders(list1, 'pending').length === 1 &&
    filterOrders(list1, 'pending')[0].id === '1');

  await t.test('3. filterOrders unknown status → empty',
    filterOrders(list1, 'unknown').length === 0);

  const c4 = document.createElement('div');
  await ordersPage.render(c4);
  await t.test('4. render builds page structure',
    c4.querySelector('#orders-stats') !== null &&
    c4.querySelector('#orders-filters') !== null &&
    c4.querySelector('#orders-list') !== null &&
    c4.querySelector('button.btn--primary') !== null);

  const cust = await customersRepo.create({ name: 'أحمد', phone: '0101' });
  await ordersRepo.create({
    customerId: cust.id,
    status: 'pending',
    amount: 500,
    dueDate: Date.now() + 86400000,
  });
  await ordersRepo.create({
    customerId: cust.id,
    status: 'in_progress',
    amount: 300,
  });
  const c5 = document.createElement('div');
  await ordersPage.render(c5);
  const cards5 = c5.querySelectorAll('.card[data-id]');
  await t.test('5. render with data shows cards', cards5.length === 2);

  const pendingBtn = c5.querySelector('#orders-filters [data-filter="pending"]');
  await t.test('6. filter button exists in DOM', pendingBtn !== null);
  if (pendingBtn) {
    pendingBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    const cards6 = c5.querySelectorAll('.card[data-id]');
    await t.test('7. clicking filter shows only matching orders',
      cards6.length === 1);
  } else {
    await t.test('7. clicking filter shows only matching orders', false);
  }

  const c8 = document.createElement('div');
  await ordersPage.render(c8);
  const stat8 = c8.querySelector('#orders-stats');
  const statsText = stat8 ? stat8.textContent : '';
  await t.test('8. stats display total orders count',
    statsText.includes('2') && statsText.includes('إجمالي'));

  ordersPage.destroy();
  await ordersRepo.clear();
  await customersRepo.clear();
});
