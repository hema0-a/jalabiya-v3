/* pages2.test.js - payments/inventory/workers/expenses/reports */
import { register } from '../registry.js';
import { paymentsPage } from '../../pages/payments.js';
import { inventoryPage, filterInventory } from '../../pages/inventory.js';
import { workersPage, filterWorkers } from '../../pages/workers.js';
import { expensesPage, filterByPeriod } from '../../pages/expenses.js';
import { reportsPage, getPeriodStart, computeReport } from '../../pages/reports.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';
import { inventory as inventoryRepo } from '../../data/repos/inventory.js';
import { workers as workersRepo } from '../../data/repos/workers.js';
import { expenses as expensesRepo } from '../../data/repos/expenses.js';

register('pages/payments.js', async (t) => {
  await paymentsRepo.clear();
  const c1 = document.createElement('div');
  await paymentsPage.render(c1);
  await t.test('1. render builds structure',
    c1.querySelector('#payments-stats') !== null &&
    c1.querySelector('#payments-list') !== null);
  const emptyText = c1.querySelector('#payments-list')?.textContent || '';
  await t.test('2. empty state', emptyText.length > 0);
  paymentsPage.destroy();
  await paymentsRepo.clear();
});

register('pages/inventory.js', async (t) => {
  const list = [
    { id: '1', name: 'Fabric', category: 'fabric' },
    { id: '2', name: 'Thread', category: 'thread' },
    { id: '3', name: 'Buttons', category: 'accessory' },
  ];
  await t.test('1. filterInventory all', filterInventory(list, 'all').length === 3);
  await t.test('2. filterInventory by category', filterInventory(list, 'fabric').length === 1);

  await inventoryRepo.clear();
  const c3 = document.createElement('div');
  await inventoryPage.render(c3);
  await t.test('3. render builds structure',
    c3.querySelector('#inventory-stats') !== null &&
    c3.querySelector('#inventory-filters') !== null);
  inventoryPage.destroy();
  await inventoryRepo.clear();
});

register('pages/workers.js', async (t) => {
  const list = [
    { id: '1', name: 'A', active: true },
    { id: '2', name: 'B', active: false },
    { id: '3', name: 'C' },
  ];
  await t.test('1. filterWorkers all', filterWorkers(list, 'all').length === 3);
  await t.test('2. filterWorkers active', filterWorkers(list, 'active').length === 2);
  await t.test('3. filterWorkers inactive', filterWorkers(list, 'inactive').length === 1);

  await workersRepo.clear();
  const c = document.createElement('div');
  await workersPage.render(c);
  workersPage.destroy();
  await workersRepo.clear();
});

register('pages/expenses.js', async (t) => {
  const now = Date.now();
  const day = 86400000;
  const list = [
    { id: '1', amount: 100, date: now - 2 * day },
    { id: '2', amount: 200, date: now - 30 * day },
    { id: '3', amount: 300, date: now - 400 * day },
  ];
  await t.test('1. filterByPeriod all', filterByPeriod(list, 'all').length === 3);
  await t.test('2. filterByPeriod week', filterByPeriod(list, 'week').length === 1);

  await expensesRepo.clear();
  const c = document.createElement('div');
  await expensesPage.render(c);
  await t.test('3. render builds structure', c.querySelector('#expenses-stats') !== null);
  expensesPage.destroy();
  await expensesRepo.clear();
});

register('pages/reports.js', async (t) => {
  await t.test('1. getPeriodStart returns number',
    typeof getPeriodStart('week') === 'number' &&
    getPeriodStart('all') === 0);

  const report = await computeReport('month');
  await t.test('2. computeReport returns keys',
    report && 'revenue' in report && 'spent' in report && 'profit' in report);

  await customersRepo.clear();
  await paymentsRepo.clear();
  await expensesRepo.clear();
});
