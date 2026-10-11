/* ==========================================================================
   audit-3338.test.js — نماذج المواعيد وعروض الأسعار على الشاشات الضيقة (v3.3.38)
   - التاريخ والوقت يتحوّلان لعمود واحد بدل تجاوز حدود النافذة.
   - بند عرض السعر بنفس تصميم بند الطلب (لا حقل سعر بعرض 55px).
   (فحص الشاشات 320/360 الفعلي في scripts/ci-check.cjs → narrow)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { quotes as quotesRepo } from '../../data/repos/quotes.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

register('audit v3.3.38 appointments & quotes forms', async (t) => {
  const css = await (await fetch('styles/components.css')).text();
  t.test('1. قاعدة .form-grid-2 تتحوّل لعمود واحد تلقائياً', /\.form-grid-2\s*\{[^}]*auto-fit[^}]*minmax\(150px/.test(css));

  const apSrc = await (await fetch('src/pages/appointments.js')).text();
  t.test('2. نموذج المواعيد يستخدم form-grid-2 لا شبكة 1fr 1fr ثابتة', apSrc.includes("className: 'form-grid-2'") && !apSrc.includes("gridTemplateColumns: '1fr 1fr'"));

  const cust = await customersRepo.create({ name: 't3338-cust', phone: '0100338' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  let mod = null; let quoteId = null;
  try {
    mod = (await import('../../pages/quotes.js')).quotesPage;
    await mod.render(box);
    const add = Array.from(box.querySelectorAll('button')).find((b) => /عرض جديد/.test(b.textContent));
    t.test('3. زر عرض جديد موجود', !!add);
    add.click();
    await sleep(150);
    const modalEl = document.querySelector('.modal');
    const row = modalEl && modalEl.querySelector('.order-item');
    t.test('4. بند العرض بتصميم بند الطلب', !!row);
    const price = row && row.querySelector('input[type=number]');
    t.test('5. حقل السعر عريض (' + (price ? Math.round(price.getBoundingClientRect().width) : 0) + 'px ≥ 80)', !!price && price.getBoundingClientRect().width >= 80);

    const sel = modalEl.querySelector('select');
    sel.value = cust.id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const [p, q] = modalEl.querySelectorAll('.order-item input[type=number]');
    p.value = '300'; p.dispatchEvent(new Event('input', { bubbles: true }));
    q.value = '3'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const total = Array.from(modalEl.querySelectorAll('div')).find((d) => /^الإجمالي:/.test(d.textContent.trim()) && d.children.length === 0);
    t.test('6. الإجمالي يتحدّث عند تغيير السعر/الكمية', !!total && /900|٩٠٠/.test(total.textContent));
    const save = Array.from(modalEl.querySelectorAll('button')).find((b) => b.textContent.trim() === 'حفظ');
    save.click();
    await sleep(500);
    const mine = (await quotesRepo.list()).filter((x) => x.customerId === cust.id);
    if (mine[0]) quoteId = mine[0].id;
    mine.slice(1).forEach(() => {});
    t.test('7. العرض حُفظ بمجموع البنود', mine.length === 1 && mine[0].items.length === 1 && mine[0].items[0].price === 300 && mine[0].items[0].quantity === 3);
  } finally {
    if (quoteId) { try { await quotesRepo.remove(quoteId); } catch { /* */ } }
    try { await customersRepo.remove(cust.id); } catch { /* */ }
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    if (mod && mod.destroy) mod.destroy();
    box.remove();
  }
});
