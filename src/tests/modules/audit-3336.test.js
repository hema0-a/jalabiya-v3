/* ==========================================================================
   audit-3336.test.js — تحسينات تجربة الاستخدام على الجوال (v3.3.36)
   - أهداف اللمس ≥ 40px على الشاشات اللمسية، وبطاقات إحصاء مدمجة، ومساحة أسفل المحتوى للزر العائم.
   - شرائح فلترة الطلبات صف قابل للتمرير بدل الالتفاف.
   ========================================================================== */

import { register } from '../registry.js';

register('audit v3.3.36 mobile UX polish', async (t) => {
  const css = await (await fetch('styles/components.css')).text();
  t.test('1. أهداف اللمس 40px للشاشات اللمسية', /@media \(pointer: coarse\)[\s\S]*?\.btn--sm\s*\{[^}]*min-height:\s*40px/.test(css));
  t.test('2. أزرار الأيقونات الصغيرة 40px للمس', /@media \(pointer: coarse\)[\s\S]*?\.btn--icon\.btn--sm\s*\{[^}]*width:\s*40px/.test(css));
  t.test('3. بطاقات الإحصاء مدمجة على الجوال', /@media \(max-width: 480px\)\s*\{\s*\.stat\s*\{[^}]*display:\s*grid/.test(css));
  t.test('4. مساحة أسفل المحتوى للزر العائم', /\.app-shell__content\s*\{\s*padding-bottom:\s*calc\(88px/.test(css));
  t.test('5. touch-action: manipulation على العناصر التفاعلية', /touch-action:\s*manipulation/.test(css));

  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    const mod = (await import('../../pages/orders.js')).ordersPage;
    await mod.render(box);
    const f = box.querySelector('#orders-filters');
    t.test('6. فلاتر الطلبات صف قابل للتمرير', !!f && f.classList.contains('scroll-row'));
    t.test('7. الصف لا يلتف (nowrap + overflow-x)', !!f && getComputedStyle(f).flexWrap === 'nowrap' && getComputedStyle(f).overflowX === 'auto');
    t.test('8. الصف يحوي شرائح الحالات', !!f && f.querySelectorAll('button[data-filter]').length >= 2);
    if (mod.destroy) mod.destroy();
  } finally {
    box.remove();
  }
});
