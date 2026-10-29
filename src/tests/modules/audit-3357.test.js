/* ==========================================================================
   audit-3357.test.js — شريط التنقّل السفلي ليد واحدة (v3.3.57)
   ========================================================================== */

import { register } from '../registry.js';
import {
  mountBottomNav, unmountBottomNav, setBottomNavEnabled, isBottomNavEnabled, STORAGE_KEY, NAV_ITEMS, _internal as nav_internal,
} from '../../ui/bottom-nav.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

register('audit v3.3.57 bottom nav (one-hand mode)', async (t) => {
  const css = await (await fetch('styles/components.css')).text();
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  unmountBottomNav();
  let sidebarToggles = 0;
  let route = 'orders';
  const went = [];
  const sync = () => nav_internal.sync();
  try {
    t.test('1. مفعّل افتراضياً', isBottomNavEnabled() === true);
    t.test('2. التثبيت ينجح مرة ويرفض الثانية', mountBottomNav({ toggleSidebar: () => { sidebarToggles++; } }, { route: () => route, navigate: (h) => { went.push(h); route = h.replace('#/', ''); sync(); } }) === true && mountBottomNav({}) === false);
    const nav = document.querySelector('.bottom-nav');
    t.test('3. خمسة أزرار بالترتيب', !!nav && nav.querySelectorAll('.bottom-nav__item').length === 5 && NAV_ITEMS.length === 5);
    t.test('4. ظاهر + فئة has-bottom-nav على body', !nav.hidden && document.body.classList.contains('has-bottom-nav'));
    t.test('5. زر «الطلبات» نشط عند #/orders', nav.querySelector('[data-nav="orders"]').getAttribute('aria-current') === 'page' && !nav.querySelector('[data-nav="dashboard"]').hasAttribute('aria-current'));
    nav.querySelector('[data-nav="customers"]').click();
    t.test('6. النقر ينقل للعملاء ويحدّث الزر النشط', went[0] === '#/customers' && nav.querySelector('[data-nav="customers"]').classList.contains('bottom-nav__item--active'));
    nav.querySelector('[data-nav="more"]').click();
    t.test('7. «المزيد» يفتح القائمة الجانبية', sidebarToggles === 1);
    nav.querySelector('[data-nav="add"]').click();
    await sleep(120);
    t.test('8. «＋» يفتح الإجراءات السريعة', !!document.querySelector('.modal') && document.querySelector('.modal').textContent.includes('طلب جديد'));
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());

    route = 'wall'; sync();
    t.test('9. مخفي في شاشة الورشة', nav.hidden && !document.body.classList.contains('has-bottom-nav'));
    route = 'dashboard'; sync();
    t.test('10. يعود عند مغادرتها', !nav.hidden);

    setBottomNavEnabled(false);
    t.test('11. الإيقاف يخفيه ويحفظ التفضيل', nav.hidden && !document.body.classList.contains('has-bottom-nav') && localStorage.getItem(STORAGE_KEY) === 'off' && !isBottomNavEnabled());
    setBottomNavEnabled(true);
    t.test('12. إعادة التفعيل', !nav.hidden && isBottomNavEnabled());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    t.test('13. يُخفى أثناء الكتابة', nav.classList.contains('bottom-nav--typing'));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    input.remove();
    t.test('14. ويعود بعدها', !nav.classList.contains('bottom-nav--typing'));

    const { events } = await import('../../core/events.js');
    events.emit('layout:sidebar-toggled', { open: true });
    t.test('14b. يُخفى والقائمة الجانبية مفتوحة', nav.classList.contains('bottom-nav--drawer'));
    events.emit('layout:sidebar-toggled', { open: false });
    t.test('14c. ويعود بعد إغلاقها', !nav.classList.contains('bottom-nav--drawer'));

    t.test('15. CSS: للجوال فقط ويُخفي الزر العائم',
      /@media \(max-width: 767px\)\s*\{\s*\.bottom-nav:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex/.test(css) && /body\.has-bottom-nav \.fab\s*\{\s*display:\s*none/.test(css));
    t.test('16. أهداف اللمس ≥ 56px', /\.bottom-nav__item\s*\{[^}]*min-height:\s*56px/.test(css));
    unmountBottomNav();
    t.test('17. الإزالة تنظّف', !document.querySelector('.bottom-nav') && !document.body.classList.contains('has-bottom-nav'));
  } finally {
    unmountBottomNav();
    try { if (saved === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, saved); } catch { /* ignore */ }
  }
});
