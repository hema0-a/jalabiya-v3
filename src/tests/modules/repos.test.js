/* ==========================================================================
   repos.test.js — اختبارات المستودعات المتخصصة
   ==========================================================================
   52 اختباراً:
   customers(8) + orders(6) + payments(5) + inventory(5) + workers(4)
   + settings(6) + appointments(6) + expenses(5) + trash(7)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { customers } from '../../data/repos/customers.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';
import { inventory } from '../../data/repos/inventory.js';
import { workers } from '../../data/repos/workers.js';
import { settings } from '../../data/repos/settings.js';
import { appointments } from '../../data/repos/appointments.js';
import { expenses } from '../../data/repos/expenses.js';
import { trash } from '../../data/repos/trash.js';
import { LIMITS } from '../../core/config.js';

/* ===== customers.js (8) ===== */
register('customers.js', async (t) => {
  await customers.clear();
  const a = await customers.create({ name: 'أحمد', phone: '01012345678', vip: false });
  const b = await customers.create({ name: 'محمد', phone: '01111111111', vip: true });
  const c2 = await customers.create({ name: 'علي', phone: '01222222222' });

  const byPhone = await customers.findByPhone('01012345678');
  await t.test('1. findByPhone returns match', byPhone && byPhone.id === a.id);

  const missing = await customers.findByPhone('9999999999');
  await t.test('2. findByPhone missing → null', missing === null);

  const searchA = await customers.searchByName('أحمد');
  await t.test('3. searchByName substring', searchA.length === 1 && searchA[0].id === a.id);

  const searchEmpty = await customers.searchByName('');
  await t.test('4. searchByName empty → all', searchEmpty.length === 3);

  const searchCase = await customers.searchByName('محمد');
  await t.test('5. searchByName arabic match', searchCase.length === 1 && searchCase[0].id === b.id);

  const vips = await customers.listVIP();
  await t.test('6. listVIP returns VIPs only', vips.length === 1 && vips[0].id === b.id);

  const toggled = await customers.toggleVIP(c2.id);
  await t.test('7. toggleVIP flips false → true', toggled && toggled.vip === true);

  const missingToggle = await customers.toggleVIP('no-such-id');
  await t.test('8. toggleVIP missing → null', missingToggle === null);

  await customers.clear();
});

/* ===== orders.js (6) ===== */
register('orders.js', async (t) => {
  await orders.clear();

  const o1 = await orders.create({
    customerId: 'c1',
    status: 'pending',
    dueDate: Date.now() + 86400000,
    amount: 500,
  });
  await orders.create({
    customerId: 'c1',
    status: 'in_progress',
    dueDate: Date.now() + 172800000,
    amount: 700,
  });
  await orders.create({
    customerId: 'c2',
    status: 'delivered',
    amount: 300,
  });

  const byCust = await orders.findByCustomer('c1');
  await t.test('1. findByCustomer returns 2', byCust.length === 2);

  const byStatus = await orders.listByStatus('pending');
  await t.test('2. listByStatus pending', byStatus.length === 1 && byStatus[0].id === o1.id);

  const active = await orders.getActive();
  await t.test('3. getActive excludes delivered', active.length === 2);

  const dueSoon = await orders.getDueSoon(3);
  await t.test('4. getDueSoon finds upcoming', dueSoon.length === 2);

  const stats = await orders.getStats();
  await t.test('5. getStats counts',
    stats.total === 3 &&
    stats.pending === 1 &&
    stats.inProgress === 1 &&
    stats.delivered === 1);

  await orders.remove(o1.id);
  const after = await orders.find(o1.id);
  await t.test('6. remove works', after === undefined);

  await orders.clear();
});

/* ===== payments.js (5) ===== */
register('payments.js', async (t) => {
  await payments.clear();

  await payments.create({ orderId: 'o1', customerId: 'c1', amount: 200 });
  await payments.create({ orderId: 'o1', customerId: 'c1', amount: 300 });
  await payments.create({ orderId: 'o2', customerId: 'c2', amount: 150 });

  const byOrder = await payments.findByOrder('o1');
  await t.test('1. findByOrder returns 2', byOrder.length === 2);

  const byCust = await payments.findByCustomer('c1');
  await t.test('2. findByCustomer returns 2', byCust.length === 2);

  const sumOrder = await payments.sumByOrder('o1');
  await t.test('3. sumByOrder = 500', sumOrder === 500);

  const sumCust = await payments.sumByCustomer('c1');
  await t.test('4. sumByCustomer = 500', sumCust === 500);

  const sumEmpty = await payments.sumByOrder('no-such');
  await t.test('5. sumByOrder missing = 0', sumEmpty === 0);

  await payments.clear();
});

/* ===== inventory.js (5) ===== */
register('inventory.js', async (t) => {
  await inventory.clear();

  const a = await inventory.create({ name: 'قماش كتان', category: 'fabric', quantity: 3 });
  await inventory.create({ name: 'خيط', category: 'thread', quantity: 20 });
  await inventory.create({ name: 'أزرار', category: 'accessory', quantity: 2 });

  const search = await inventory.searchByName('قماش');
  await t.test('1. searchByName', search.length === 1 && search[0].id === a.id);

  const byCat = await inventory.listByCategory('thread');
  await t.test('2. listByCategory', byCat.length === 1);

  const low = await inventory.getLowStock(5);
  await t.test('3. getLowStock < 5 → 2 items', low.length === 2);

  const adjusted = await inventory.adjustStock(a.id, 10);
  await t.test('4. adjustStock +10 = 13', adjusted && adjusted.quantity === 13);

  const floor = await inventory.adjustStock(a.id, -100);
  await t.test('5. adjustStock clamps to 0', floor && floor.quantity === 0);

  await inventory.clear();
});

/* ===== workers.js (4) ===== */
register('workers.js', async (t) => {
  await workers.clear();

  const a = await workers.create({ name: 'سيد', active: true });
  const b = await workers.create({ name: 'رمضان', active: false });
  await workers.create({ name: 'عبد الله' });

  const search = await workers.searchByName('سيد');
  await t.test('1. searchByName', search.length === 1 && search[0].id === a.id);

  const active = await workers.listActive();
  await t.test('2. listActive → 2 (سيد + عبد الله)', active.length === 2);

  const toggled = await workers.toggleActive(b.id);
  await t.test('3. toggleActive false → true', toggled && toggled.active === true);

  const missing = await workers.toggleActive('no-such-id');
  await t.test('4. toggleActive missing → null', missing === null);

  await workers.clear();
});

/* ===== settings.js (6) ===== */
register('settings.js', async (t) => {
  await settings.clear();

  const defaults = await settings.get();
  await t.test('1. get returns defaults when empty',
    defaults && defaults.appearance && defaults.appearance.theme === 'classic');

  const saved = await settings.save({
    workshop: { name: 'ورشة الأمل', phone: '01012345678' },
    appearance: { theme: 'ocean' },
  });
  await t.test('2. save returns record + id=main',
    saved && saved.id === 'main' && typeof saved.updatedAt === 'number');

  const after = await settings.get();
  await t.test('3. get after save reflects data',
    after.workshop.name === 'ورشة الأمل' && after.appearance.theme === 'ocean');

  await t.test('4. get merges missing keys with defaults',
    after.workshop.address === '' && after.display.darkMode === false);

  const updated = await settings.update({ workshop: { name: 'ورشة النور' } });
  await t.test('5. update shallow-merges workshop',
    updated.workshop.name === 'ورشة النور' && updated.workshop.phone === '01012345678');

  await settings.clear();
  const reset = await settings.get();
  await t.test('6. clear resets to defaults',
    reset.workshop.name === '' && reset.appearance.theme === 'classic');
});

/* ===== appointments.js (6) ===== */
register('appointments.js', async (t) => {
  await appointments.clear();

  const now = Date.now();
  const a1 = await appointments.create({
    customerId: 'c1',
    orderId: 'o1',
    date: now + 86400000,
    status: 'scheduled',
  });
  await appointments.create({
    customerId: 'c1',
    orderId: 'o2',
    date: now + 3 * 86400000,
    status: 'scheduled',
  });
  await appointments.create({
    customerId: 'c2',
    orderId: 'o3',
    date: now - 86400000,
    status: 'done',
  });

  const byCust = await appointments.findByCustomer('c1');
  await t.test('1. findByCustomer returns 2', byCust.length === 2);

  const byOrd = await appointments.findByOrder('o1');
  await t.test('2. findByOrder returns 1', byOrd.length === 1 && byOrd[0].id === a1.id);

  const scheduled = await appointments.listByStatus('scheduled');
  await t.test('3. listByStatus scheduled → 2', scheduled.length === 2);

  const upcoming = await appointments.getUpcoming(7);
  await t.test('4. getUpcoming excludes past', upcoming.length === 2);

  const today = await appointments.getToday();
  await t.test('5. getToday returns array', Array.isArray(today));

  await appointments.remove(a1.id);
  const after = await appointments.find(a1.id);
  await t.test('6. remove works', after === undefined);

  await appointments.clear();
});

/* ===== expenses.js (5) ===== */
register('expenses.js', async (t) => {
  await expenses.clear();

  const e1 = await expenses.create({ category: 'fabric', amount: 100, date: 1000 });
  await expenses.create({ category: 'fabric', amount: 200, date: 2000 });
  await expenses.create({ category: 'thread', amount: 50, date: 3000 });
  await expenses.create({ category: 'rent', amount: 500, date: 4000 });

  const byCat = await expenses.listByCategory('fabric');
  await t.test('1. listByCategory fabric → 2', byCat.length === 2);

  const byPeriod = await expenses.listByPeriod(1500, 3500);
  await t.test('2. listByPeriod [1500,3500] → 2', byPeriod.length === 2);

  const sumCat = await expenses.sumByCategory('fabric');
  await t.test('3. sumByCategory fabric = 300', sumCat === 300);

  const sumPeriod = await expenses.sumByPeriod(1000, 3000);
  await t.test('4. sumByPeriod [1000,3000] = 350', sumPeriod === 350);

  await expenses.remove(e1.id);
  const afterRemove = await expenses.find(e1.id);
  await t.test('5. remove works', afterRemove === undefined);

  await expenses.clear();
});

/* ===== trash.js (7) ===== */
register('trash.js', async (t) => {
  await trash.clear();
  const t1 = await trash.addToTrash('customers', { id: 'orig-1', name: 'أحمد' });
  await t.test('1. addToTrash creates record with metadata',
    t1 && t1.originalStore === 'customers' &&
    t1.originalId === 'orig-1' &&
    t1.data && t1.data.name === 'أحمد' &&
    typeof t1.deletedAt === 'number');

  await trash.addToTrash('orders', { id: 'orig-2' });
  await trash.addToTrash('customers', { id: 'orig-3' });
  const byStore = await trash.listByStore('customers');
  await t.test('2. listByStore filters by originalStore', byStore.length === 2);

  await trash.clear();
  await trash.create({ originalStore: 'x', originalId: 'a', data: { id: 'a' }, deletedAt: 100 });
  await trash.create({ originalStore: 'x', originalId: 'b', data: { id: 'b' }, deletedAt: 300 });
  await trash.create({ originalStore: 'x', originalId: 'c', data: { id: 'c' }, deletedAt: 200 });
  const recent = await trash.listRecent(2);
  await t.test('3. listRecent sorts desc + limits',
    recent.length === 2 && recent[0].deletedAt === 300 && recent[1].deletedAt === 200);

  await trash.clear();
  await idb.clear('customers');
  await idb.put('customers', { id: 'restore-me', name: 'فاطمة' });
  const trashItem = await trash.addToTrash('customers', { id: 'restore-me', name: 'فاطمة' });
  await idb.remove('customers', 'restore-me');
  const restored = await trash.restore(trashItem.id);
  const backInStore = await idb.get('customers', 'restore-me');
  const goneFromTrash = await trash.find(trashItem.id);
  await t.test('4. restore puts back + removes from trash',
    restored && restored.id === 'restore-me' &&
    backInStore && backInStore.name === 'فاطمة' &&
    goneFromTrash === undefined);

  const nullRestore = await trash.restore('no-such-id');
  await t.test('5. restore missing → null', nullRestore === null);

  await trash.clear();
  for (let i = 0; i < 5; i++) {
    await trash.create({ originalStore: 'x', originalId: String(i), data: {}, deletedAt: i });
  }
  const removedNoOp = await trash.prune();
  const countNoOp = await trash.count();
  await t.test('6. prune no-op when below limit', removedNoOp === 0 && countNoOp === 5);

  await trash.clear();
  const origMax = LIMITS.maxTrashItems;
  try {
    LIMITS.maxTrashItems = 3;
    for (let i = 0; i < 7; i++) {
      await trash.create({ originalStore: 'x', originalId: String(i), data: {}, deletedAt: i });
    }
    const removedPrune = await trash.prune();
    const countPrune = await trash.count();
    await t.test('7. prune trims to maxTrashItems (oldest first)',
      removedPrune === 4 && countPrune === 3);
  } finally {
    LIMITS.maxTrashItems = origMax;
  }

  await trash.clear();
  await idb.clear('customers');
});
