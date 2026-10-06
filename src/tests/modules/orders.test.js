/* orders.test.js - pages/orders */
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
  await t.test('1. filterOrders all', filterOrders(list1, 'all').length === 3);
  await t.test('2. filterOrders by status', filterOrders(list1, 'pending').length === 1);
  await t.test('3. filterOrders unknown', filterOrders(list1, 'unknown').length === 0);

  const c4 = document.createElement('div');
  await ordersPage.render(c4);
  await t.test('4. render builds structure',
    c4.querySelector('#orders-stats') !== null &&
    c4.querySelector('#orders-filters') !== null &&
    c4.querySelector('#orders-list') !== null);

  const cust = await customersRepo.create({ name: 'Ahmed', phone: '0101' });
  await ordersRepo.create({
    customerId: cust.id, status: 'pending',
    amount: 500, dueDate: Date.now() + 86400000,
  });
  await ordersRepo.create({
    customerId: cust.id, status: 'in_progress', amount: 300,
  });
  const c5 = document.createElement('div');
  await ordersPage.render(c5);
  const cards5 = c5.querySelectorAll('.card[data-id]');
  await t.test('5. render with data shows cards', cards5.length === 2);

  const pendingBtn = c5.querySelector('#orders-filters [data-filter="pending"]');
  await t.test('6. filter button exists', pendingBtn !== null);
  if (pendingBtn) {
    pendingBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    await t.test('7. clicking filter shows matching', c5.querySelectorAll('.card[data-id]').length === 1);
  } else {
    await t.test('7. clicking filter shows matching', false);
  }

  const c8 = document.createElement('div');
  await ordersPage.render(c8);
  const stat8 = c8.querySelector('#orders-stats');
  await t.test('8. stats display count',
    stat8 && stat8.textContent.includes('2'));

  ordersPage.destroy();
  await ordersRepo.clear();
  await customersRepo.clear();
});
