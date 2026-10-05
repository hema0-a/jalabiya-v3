/* ==========================================================================
   pages2.test.js — اختبارات صفحات المرحلة 7
   ==========================================================================
   13 اختباراً: payments + inventory + workers + expenses + reports
   ========================================================================== */

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

/* ===== payments.js (2) ===== */
register('pages/payments.js', async (t) => {
  await paymentsRepo.clear();

  const c1 = document.createElement('div');
  await paymentsPage.render(c1);
  await t.test('1. render builds page structure',
    c1.querySelector('#payments-stats') !== null &&
    c1.querySelector('#payments-list') !== null &&
    c1.querySelector('button.btn--primary') !== null);

  const emptyText = c1.querySelector('#payments-list')?.textContent || '';
  await t.test('2. empty state shows message',
    emptyText.includes('لا توجد دفعات'));

  paymentsPage.destroy();
  await paymentsRepo.clear();
});

/* ===== inventory.js (3) ===== */
register('pages/inventory.js', async (t) => {
  const list = [
    { id: '1', name: 'قماش', category: 'fabric' },
    { id: '2', name: 'خيط', category: 'thread' },
    { id: '3', name: 'أزرار', category: 'accessory' },
  ];

  await t.test('1. filterInventory all → all items',
    filterInventory(list, 'all').length === 3);

  await t.test('2. filterInventory by category',
    filterInventory(list, 'fabric').length === 1 &&
    filterInventory(list, 'fabric')[0].id === '1');

  await inventoryRepo.clear();
  const c3 = document.createElement('div');
  await inventoryPage.render(c3);
  await t.test('3. render builds structure with filters',
    c3.querySelector('#inventory-stats') !== null &&
    c3.querySelector('#inventory-filters') !== null &&
    c3.querySelector('#inventory-list') !== null);

  inventoryPage.destroy();
  await inventoryRepo.clear();
});

/* ===== workers.js (3) ===== */
register('pages/workers.js', async (t) => {
  const list = [
    { id: '1', name: 'سيد', active: true },
    { id: '2', name: 'رمضان', active: false },
    { id: '3', name: 'عبد الله' },
  ];

  await t.test('1. filterWorkers all → all items',
    filterWorkers(list, 'all').length === 3);

  await t.test('2. filterWorkers active (excludes false)',
    filterWorkers(list, 'active').length === 2);

  await t.test('3. filterWorkers inactive',
    filterWorkers(list, 'inactive').length === 1 &&
    filterWorkers(list, 'inactive')[0].id === '2');

  await workersRepo.clear();
  const c = document.createElement('div');
  await workersPage.render(c);
  workersPage.destroy();
  await workersRepo.clear();
});

/* ===== expenses.js (3) ===== */
register('pages/expenses.js', async (t) => {
  const now = Date.now();
  const day = 86400000;
  const list = [
    { id: '1', amount: 100, date: now - 2 * day },
    { id: '2', amount: 200, date: now - 30 * day },
    { id: '3', amount: 300, date: now - 400 * day },
  ];

  await t.test('1. filterByPeriod all → all',
    filterByPeriod(list, 'all').length === 3);

  await t.test('2. filterByPeriod week → recent only',
    filterByPeriod(list, 'week').length === 1 &&
    filterByPeriod(list, 'week')[0].id === '1');

  await expensesRepo.clear();
  const c = document.createElement('div');
  await expensesPage.render(c);
  await t.test('3. render builds structure with filters',
    c.querySelector('#expenses-stats') !== null &&
    c.querySelector('#expenses-filters') !== null);

  expensesPage.destroy();
  await expensesRepo.clear();
});

/* ===== reports.js (2) ===== */
register('pages/reports.js', async (t) => {
  await t.test('1. getPeriodStart returns number',
    typeof getPeriodStart('week') === 'number' &&
    typeof getPeriodStart('month') === 'number' &&
    getPeriodStart('all') === 0);

  const report = await computeReport('month');
  await t.test('2. computeReport returns expected keys',
    report && 'revenue' in report && 'spent' in report &&
    'profit' in report && 'ordersCount' in report &&
    report.revenue === 0 && report.spent === 0 && report.profit === 0);

  await customersRepo.clear();
  await paymentsRepo.clear();
  await expensesRepo.clear();
});
