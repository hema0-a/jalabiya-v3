/* ==========================================================================
   audit-3354.test.js — كشف العملاء المكررين عند الإدخال (v3.3.54)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { findSimilarCustomers, looseNameKey } from '../../services/customer-merge.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type = 'input') => el.dispatchEvent(new Event(type, { bubbles: true }));

register('audit v3.3.54 duplicate detection (pure)', async (t) => {
  const list = [
    { id: 'a', name: 'أحمد محمد', phone: '01012345678' },
    { id: 'b', name: 'فاطمة', phone: '' },
    { id: 'c', name: 'منى علي', phone: '+20 10 1234 5678' },
  ];
  t.test('1. تطبيع الاسم: همزات/تاء مربوطة/تشكيل', looseNameKey('أَحمد  محمّد') === looseNameKey('احمد محمد') && looseNameKey('فاطمة') === looseNameKey('فاطمه'));
  const byPhone = findSimilarCustomers({ name: 'غيره', phone: '0101 234 5678' }, list);
  t.test('2. نفس الهاتف بصيغ مختلفة (+20 وفراغات)', byPhone.length === 2 && byPhone.every((m) => m.reason === 'phone'));
  const byName = findSimilarCustomers({ name: 'احمد محمد', phone: '' }, list);
  t.test('3. نفس الاسم بعد التطبيع', byName.length === 1 && byName[0].customer.id === 'a' && byName[0].reason === 'name');
  t.test('4. الاستبعاد الذاتي عند التعديل', findSimilarCustomers({ name: 'أحمد محمد', phone: '01012345678' }, list, { excludeId: 'a' }).every((m) => m.customer.id !== 'a'));
  t.test('5. لا تطابق → فارغ', findSimilarCustomers({ name: 'جديد تماماً', phone: '01199999999' }, list).length === 0);
  t.test('6. هاتف قصير/فارغ لا يطابق', findSimilarCustomers({ name: 'x', phone: '123' }, list).length === 0);
  t.test('7. التطابق بالهاتف يسبق الاسم', (() => {
    const r = findSimilarCustomers({ name: 'فاطمه', phone: '01012345678' }, list);
    return r[0].reason === 'phone' && r[r.length - 1].reason === 'name';
  })());
  t.test('8. مدخلات غريبة لا تنهار', findSimilarCustomers(null, null).length === 0);
});

register('audit v3.3.54 duplicate detection (UI)', async (t) => {
  const exist = await customersRepo.create({ name: 't3354 سعيد', phone: '01055500011' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  const made = [];
  let mod = null;
  const openForm = async () => {
    Array.from(box.querySelectorAll('button')).find((b) => b.textContent.includes('إضافة عميل')).click();
    await sleep(150);
    return document.querySelector('.modal');
  };
  try {
    try { (await import('../../services/draft-manager.js')).clear('customer-form'); } catch { /* ignore */ }
    mod = (await import('../../pages/customers.js')).customersPage;
    await mod.render(box);
    let m = await openForm();
    const hint = () => m.querySelector('[data-role="dup-hint"]');
    const [nameIn, phoneIn] = m.querySelectorAll('input[type="text"], input[type="tel"]');
    t.test('1. بلا إدخال لا يظهر تنبيه', getComputedStyle(hint()).display === 'none');
    phoneIn.value = '0105 550 0011'; fire(phoneIn);
    t.test('2. تنبيه فوري بنفس الرقم مع اسم العميل', hint().textContent.includes('t3354 سعيد') && hint().textContent.includes('نفس الرقم') && getComputedStyle(hint()).display !== 'none');
    nameIn.value = 'مختلف t3354'; fire(nameIn);
    const before = (await customersRepo.list()).length;
    m.querySelector('[data-action="save"]').click();
    await sleep(250);
    t.test('3. الحفظ يطلب تأكيداً ولم يُحفظ بعد', !!document.querySelector('.modal [data-action="confirm"]') && (await customersRepo.list()).length === before);
    const cancels = Array.from(document.querySelectorAll('.modal [data-action="cancel"]'));
    cancels[cancels.length - 1].click();
    await sleep(250);
    t.test('4. «رجوع للتعديل» يبقي النموذج ولا يحفظ', !!document.querySelector('.modal input[type="tel"]') && (await customersRepo.list()).length === before);
    phoneIn.value = '01077700022'; fire(phoneIn);
    t.test('5. تغيير الرقم يزيل التنبيه', getComputedStyle(hint()).display === 'none');
    m.querySelector('[data-action="save"]').click();
    await sleep(500);
    const after = await customersRepo.list();
    after.filter((c) => c.name === 'مختلف t3354').forEach((c) => made.push(c.id));
    t.test('6. رقم غير مكرر يُحفظ بلا تأكيد', after.length === before + 1 && !document.querySelector('.modal [data-action="confirm"]'));
  } finally {
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    if (mod && mod.destroy) mod.destroy();
    box.remove();
    for (const id of [exist.id, ...made]) { try { await customersRepo.remove(id); } catch { /* ignore */ } }
    try { (await import('../../services/draft-manager.js')).clear('customer-form'); } catch { /* ignore */ }
  }
});
