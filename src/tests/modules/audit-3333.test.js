/* ==========================================================================
   audit-3333.test.js — دمج العملاء يشمل كل المخازن المرتبطة بعميل (v3.3.33)
   ========================================================================== */

import { register } from '../registry.js';
import { SCHEMA } from '../../data/schema.js';
import { CUSTOMER_LINKED_STORES } from '../../services/customer-merge.js';
import { scanIntegrity } from '../../services/data-integrity.js';

register('audit v3.3.33 customer merge coverage', async (t) => {
  const withCustomerIndex = Object.keys(SCHEMA).filter((s) =>
    SCHEMA[s].indexes.some((i) => i.name === 'by_customerId' && i.keyPath === 'customerId'));

  await t.test('1. كل مخزن له فهرس by_customerId يدخل في الدمج (لا سجل يُترك على عميل محذوف)',
    withCustomerIndex.every((s) => CUSTOMER_LINKED_STORES.includes(s)));
  await t.test('2. عروض الأسعار ضمن المخازن المنقولة عند الدمج', CUSTOMER_LINKED_STORES.includes('quotes'));
  await t.test('3. لا مخزن في قائمة الدمج بلا فهرس by_customerId (findByIndex كان سيفشل)',
    CUSTOMER_LINKED_STORES.every((s) => withCustomerIndex.includes(s)));
});

register('audit v3.3.33 quotes integrity', async (t) => {
  const r = scanIntegrity({
    customers: [{ id: 'c1' }], orders: [{ id: 'o1', customerId: 'c1', amount: 10 }],
    quotes: [{ id: 'q1', customerId: 'gone' }, { id: 'q2', customerId: 'c1', orderId: 'nope' }, { id: 'q3', customerId: 'c1', orderId: 'o1' }],
  });
  await t.test('1. عرض لعميل محذوف يُكشف', r.counts.quote_missing_customer === 1);
  await t.test('2. عرض مربوط بطلب غير موجود يُكشف مع إصلاح فكّ الربط',
    r.counts.quote_orphan_order === 1 && r.issues.find((i) => i.type === 'quote_orphan_order').fix.store === 'quotes');
  await t.test('3. العرض السليم لا يُبلَّغ عنه', r.total === 2);
  await t.test('4. غياب quotes لا يُسقط الفحص', scanIntegrity({ customers: [], orders: [] }).total === 0);
});

register('audit v3.3.33 portfolio details reachable', async (t) => {
  const { portfolio } = await import('../../data/repos/portfolio.js');
  const { portfolioPage } = await import('../../pages/portfolio.js');
  const item = await portfolio.create({ title: 'اختبار-3333', category: 'men', image: 'data:image/png;base64,AAAA', note: 'ن' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btnByText = (txt) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(txt));
  let ok = false;
  try {
    await portfolioPage.render(box);
    await sleep(30);
    const card = box.querySelector('[data-id="' + item.id + '"]');
    card.click(); await sleep(30);
    const full = btnByText('التفاصيل الكاملة');
    full.click(); await sleep(60);
    ok = !!btnByText('🗑️ حذف') && !!btnByText('⬇️ حفظ الصورة');
  } finally {
    try { portfolioPage.destroy && portfolioPage.destroy(); } catch (e) { /* ignore */ }
    await portfolio.remove(item.id);
    document.querySelectorAll('.modal, .modal-backdrop, .overlay').forEach((x) => x.remove());
    box.remove();
  }
  await t.test('1. من بطاقة المعرض يمكن الوصول لحذف الصورة وحفظها (التفاصيل الكاملة)', ok);
});
