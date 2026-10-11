/* ==========================================================================
   audit-3335.test.js — أداء الجوال (v3.3.35)
   - الطلبات والدفعات تُرسم تدريجياً (كانت ترسم كل السجلات: 70 ألف عنصر DOM وأكثر من 3 ثوانٍ).
   - الإقلاع يحمّل وحداته بالتوازي (كان 19 await متتالياً).
   ========================================================================== */

import { register } from '../registry.js';
import { writeBatch } from '../../data/idb.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

register('audit v3.3.35 progressive orders & payments', async (t) => {
  const N = 90;
  const now = Date.now();
  const oIds = [], pIds = [];
  const orders = [], payments = [];
  for (let i = 0; i < N; i++) {
    oIds.push('t3335-o' + i); pIds.push('t3335-p' + i);
    orders.push({ id: 't3335-o' + i, customerId: 't3335-c', status: 'pending', amount: 500, items: [{ name: 'جلابية', price: 500, quantity: 1 }], createdAt: now - i, updatedAt: now });
    payments.push({ id: 't3335-p' + i, orderId: 't3335-o' + i, customerId: 't3335-c', amount: 100, method: 'cash', createdAt: now - i, updatedAt: now });
  }
  await writeBatch({ orders: { records: orders }, payments: { records: payments } });

  const box = document.createElement('div');
  document.body.appendChild(box);
  let ordersCards = -1, paymentsCards = -1, ordersHasMore = false, ordersAfterMore = -1;
  let ordersPageMod = null, paymentsPageMod = null;
  try {
    ordersPageMod = (await import('../../pages/orders.js')).ordersPage;
    await ordersPageMod.render(box);
    await sleep(50);
    const ol = box.querySelector('#orders-list');
    /* كل بطاقة طلب = ابن مباشر لعنصر القائمة الداخلي */
    ordersCards = ol.firstElementChild.firstElementChild.children.length;
    const more = [...ol.querySelectorAll('button')].find((b) => b.textContent.includes('تحميل المزيد'));
    ordersHasMore = !!more && more.style.display !== 'none';
    if (more) { more.click(); await sleep(30); }
    ordersAfterMore = ol.firstElementChild.firstElementChild.children.length;
  } finally {
    try { ordersPageMod && ordersPageMod.destroy(); } catch (e) { /* ignore */ }
    box.innerHTML = '';
  }
  try {
    paymentsPageMod = (await import('../../pages/payments.js')).paymentsPage;
    await paymentsPageMod.render(box);
    await sleep(50);
    paymentsCards = box.querySelector('#payments-list').firstElementChild.firstElementChild.children.length;
  } finally {
    try { paymentsPageMod && paymentsPageMod.destroy(); } catch (e) { /* ignore */ }
    box.remove();
    await writeBatch({ orders: { deletes: oIds }, payments: { deletes: pIds } });
  }

  await t.test('1. الطلبات: أول دفعة 30 بطاقة فقط لا الكل (90)', ordersCards === 30);
  await t.test('2. الطلبات: زر «تحميل المزيد» ظاهر ويضيف دفعة أخرى', ordersHasMore && ordersAfterMore === 60);
  await t.test('3. الدفعات: أول دفعة 30 بطاقة فقط لا الكل (90)', paymentsCards === 30);
});

register('audit v3.3.35 boot imports are parallel', async (t) => {
  const src = await (await fetch('./src/main.js')).text();
  const boot = src.slice(src.indexOf('let APP_CONFIG;'), src.indexOf("showError('Failed to load core modules'"));
  await t.test('1. لا await import متتالٍ في إقلاع الوحدات الأساسية (Promise.all)',
    !/await import\(/.test(boot.replace(/await Promise\.all\(\[[\s\S]*?\]\);/, '')) && /Promise\.all\(\[/.test(boot));
});
