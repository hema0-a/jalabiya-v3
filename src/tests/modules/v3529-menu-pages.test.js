/* ==========================================================================
   v3529-menu-pages.test.js — إخفاء/إظهار صفحات القائمة الجانبية (v3.5.29)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { events } from '../../core/events.js';
import { settings } from '../../data/repos/settings.js';
import { createSidebar } from '../../ui/sidebar.js';
import { NAV_GROUPS, ALL_NAV_ITEMS, PROTECTED_NAV_IDS, sanitizeHidden } from '../../services/nav-groups.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import { menuPagesSection } from '../../pages/settings/section-menu-pages.js';
import { buildResetPatch, canReset } from '../../services/settings-tools.js';

register('v3.5.29 صفحات القائمة (إخفاء/إظهار)', async (t) => {
  /* --- منطق نقي --- */
  await t.test('1. sanitizeHidden: يُسقط المحميّة والمجهولة والمكررة وغير النصية',
    JSON.stringify(sanitizeHidden(['orders', 'dashboard', 'settings', 'nope', 'orders', 5, null, 'loans'])) === JSON.stringify(['orders', 'loans']));
  await t.test('2. sanitizeHidden: غير مصفوفة ← []', sanitizeHidden(undefined).length === 0 && sanitizeHidden('orders').length === 0 && sanitizeHidden({}).length === 0);
  await t.test('3. الصفحتان المحميتان هما الرئيسية والإعدادات', PROTECTED_NAV_IDS.join() === 'dashboard,settings');
  await t.test('4. الافتراضي navigation.hidden = [] والإعدادات تدمجه', Array.isArray(DEFAULT_SETTINGS.navigation.hidden) && DEFAULT_SETTINGS.navigation.hidden.length === 0 && Array.isArray((await settings.get()).navigation.hidden));
  const rp = buildResetPatch('menu-pages', DEFAULT_SETTINGS);
  await t.test('5. استرجاع القسم يُظهر كل الصفحات (navigation.hidden = [])', canReset('menu-pages') && JSON.stringify(rp) === JSON.stringify({ navigation: { hidden: [] } }));

  /* --- القائمة الجانبية --- */
  const favs = ['orders', 'payments'];
  const sb = createSidebar({ sections: NAV_GROUPS, accordion: true, activeId: 'dashboard', favorites: { get: () => favs, toggle: () => ({ favorites: favs, added: false, full: false, max: 6 }) } });
  document.body.appendChild(sb.node);
  try {
    const rowOf = (id) => { const b = sb.node.querySelector('.sidebar__groups .sidebar__item[data-id="' + id + '"]'); return b && (b.closest('.sidebar__row') || b); };
    const favIds = () => Array.from(sb.node.querySelectorAll('.sidebar__fav-list .sidebar__item')).map((b) => b.getAttribute('data-id'));
    await t.test('6. setHidden مصدَّرة، ومبدئياً كل الصفحات ظاهرة والمفضلة كاملة',
      typeof sb.setHidden === 'function' && ALL_NAV_ITEMS.every((i) => rowOf(i.id) && rowOf(i.id).style.display !== 'none') && favIds().join() === 'orders,payments');
    sb.setHidden(['payments', 'loans']);
    await t.test('7. إخفاء صفحة يخفي صفها فقط ويبقي غيرها', rowOf('payments').style.display === 'none' && rowOf('loans').style.display === 'none' && rowOf('orders').style.display !== 'none');
    await t.test('8. الصفحة المخفية تختفي من المفضلة أيضاً', favIds().join() === 'orders');
    const growth = NAV_GROUPS.find((g) => g.id === 'growth');
    sb.setHidden(growth.items.map((i) => i.id));
    const growthNode = rowOf(growth.items[0].id).closest('.collapsible') || rowOf(growth.items[0].id).parentElement.parentElement;
    const groupHidden = Array.from(sb.node.querySelectorAll('.sidebar__groups > *')).some((n) => n.style.display === 'none' && n.contains(rowOf(growth.items[0].id)));
    await t.test('9. إخفاء كل صفحات مجموعة يخفي المجموعة كلها', groupHidden && !!growthNode);
    sb.setHidden([]);
    await t.test('10. إظهار الكل يعيد كل شيء (الصفوف والمجموعات والمفضلة)',
      ALL_NAV_ITEMS.every((i) => rowOf(i.id).style.display !== 'none') &&
      Array.from(sb.node.querySelectorAll('.sidebar__groups > *')).every((n) => n.style.display !== 'none') && favIds().join() === 'orders,payments');
    sb.setHidden(null);
    await t.test('11. setHidden بقيمة غير صالحة لا ترمي وتُظهر الكل', ALL_NAV_ITEMS.every((i) => rowOf(i.id).style.display !== 'none'));
  } finally { sb.node.remove(); }

  /* --- قسم الإعدادات --- */
  await t.test('12. القسم أول أقسام النظام وبأيقونته وعنوانه', SYSTEM_SECTIONS[0] === menuPagesSection && menuPagesSection.id === 'menu-pages' && menuPagesSection.title === 'صفحات القائمة');
  const saved = [];
  const emitted = [];
  const off = events.on('nav:hidden', (ids) => emitted.push(ids));
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    await menuPagesSection.render(body, { navigation: { hidden: ['loans', 'dashboard'] } }, async (p) => { saved.push(p); });
    const toggleOf = (id) => body.querySelector('[data-page-id="' + id + '"]');
    await t.test('13. مفتاح لكل صفحة (28) والمخفية مسبقاً مطفأة (والمحمية تُتجاهل من القائمة المحفوظة)',
      body.querySelectorAll('[data-page-id]').length === ALL_NAV_ITEMS.length &&
      toggleOf('loans').querySelector('input').checked === false && toggleOf('orders').querySelector('input').checked === true &&
      toggleOf('dashboard').querySelector('input').checked === true);
    await t.test('14. الرئيسية والإعدادات مقفولتان (disabled)', toggleOf('dashboard').querySelector('input').disabled && toggleOf('settings').querySelector('input').disabled);
    const ord = toggleOf('orders').querySelector('input');
    ord.checked = false; ord.dispatchEvent(new Event('change', { bubbles: true }));
    await t.test('15. إطفاء مفتاح يحفظ القائمة (navigation.hidden) ويبثّ nav:hidden فوراً',
      JSON.stringify(saved[saved.length - 1]) === JSON.stringify({ navigation: { hidden: ['loans', 'orders'] } }) &&
      JSON.stringify(emitted[emitted.length - 1]) === JSON.stringify(['loans', 'orders']));
    body.querySelector('[data-action="show-all-pages"]').click();
    await t.test('16. «إظهار كل الصفحات» يفرّغ القائمة ويبثّها ويُشغّل المفاتيح',
      JSON.stringify(saved[saved.length - 1]) === JSON.stringify({ navigation: { hidden: [] } }) && emitted[emitted.length - 1].length === 0 &&
      toggleOf('loans').querySelector('input').checked === true && toggleOf('orders').querySelector('input').checked === true);
  } finally { if (typeof off === 'function') off(); body.remove(); }
});
