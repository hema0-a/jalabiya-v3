/* ==========================================================================
   v350-sidebar-accordion.test.js — أكورديون القائمة الجانبية + المفضلة (v3.5.0) — DOM
   ========================================================================== */
import { register } from '../registry.js';
import { createSidebar } from '../../ui/sidebar.js';
import { NAV_GROUPS } from '../../services/nav-groups.js';

/** مفضلة في الذاكرة (لا تلمس localStorage الحقيقي) */
function memFavs(initial = [], max = 3) {
  let list = [...initial];
  return {
    get: () => [...list],
    toggle: (id) => {
      if (list.includes(id)) { list = list.filter((x) => x !== id); return { favorites: [...list], added: false, full: false, max }; }
      if (list.length >= max) return { favorites: [...list], added: false, full: true, max };
      list.push(id); return { favorites: [...list], added: true, full: false, max };
    },
  };
}
const openGroups = (root) => Array.from(root.querySelectorAll('.collapsible--open')).map((n) => n.getAttribute('data-collapsible-id'));
const hdr = (root, gid) => root.querySelector('[data-collapsible-id="nav-' + gid + '"] > .collapsible__header');

register('v3.5.0 sidebar — أكورديون + مفضلة', async (t) => {
  const picked = [];
  const sb = createSidebar({
    sections: NAV_GROUPS, accordion: true, favorites: memFavs(['orders']), activeId: 'payments',
    onSelect: (id) => picked.push(id),
  });
  const root = sb.node;
  document.body.appendChild(root);
  try {
    await t.test('1. ست مجموعات أكورديون، والمفتوحة فقط مجموعة الصفحة النشطة (المال)',
      root.querySelectorAll('.sidebar__groups > .collapsible').length === 6 && openGroups(root).join() === 'nav-money');

    await t.test('2. الصفحة النشطة معلَّمة (active + aria-current) في مجموعتها',
      !!root.querySelector('.sidebar__group-items .sidebar__item--active[data-id="payments"][aria-current="page"]'));

    sb.setActive('settings');
    await t.test('3. setActive لصفحة في مجموعة أخرى يفتح مجموعتها ويطوي السابقة (حصري)',
      openGroups(root).join() === 'nav-system' && !!root.querySelector('.sidebar__item--active[data-id="settings"]') && !root.querySelector('.sidebar__item--active[data-id="payments"]'));

    hdr(root, 'workshop').click();
    await t.test('4. فتح مجموعة بالنقر يطوي الأخرى', openGroups(root).join() === 'nav-workshop');

    hdr(root, 'workshop').click();
    await t.test('5. نقر المجموعة المفتوحة يطويها (يمكن أن تُطوى الكل)', openGroups(root).length === 0);

    hdr(root, 'workshop').click();      /* نفتح المجموعة أولاً: لا ننقر داخل منطقة مطويّة (inert) */
    root.querySelector('.sidebar__group-items .sidebar__item[data-id="quotes"]').click();
    await t.test('6. نقر صفحة يستدعي onSelect بمعرّفها ويفتح مجموعتها', picked.join() === 'quotes' && openGroups(root).join() === 'nav-workshop');

    const favItems = () => Array.from(root.querySelectorAll('.sidebar__fav-list .sidebar__item')).map((n) => n.getAttribute('data-id'));
    await t.test('7. قسم المفضلة يعرض المثبّت مسبقاً ويُخفي التلميح', favItems().join() === 'orders' && root.querySelector('.sidebar__fav-hint').hidden === true);

    const star = (id) => root.querySelector('.sidebar__group-items .sidebar__star[data-fav-id="' + id + '"]');
    star('inventory').click();
    await t.test('8. نجمة صفحة تثبّتها فتظهر في المفضلة وتتحول ★ مع aria-pressed',
      favItems().join() === 'orders,inventory' && star('inventory').textContent === '★' && star('inventory').getAttribute('aria-pressed') === 'true');

    star('inventory').click();
    await t.test('9. نقر النجمة ثانية يزيل التثبيت', favItems().join() === 'orders' && star('inventory').textContent === '☆');

    star('inventory').click(); star('workers').click(); star('calendar').click();   /* الحد 3 في هذا الاختبار */
    await t.test('10. عند الامتلاء لا يُضاف رابع ولا يتغيّر شيء', favItems().join() === 'orders,inventory,workers' && star('calendar').textContent === '☆');

    const n0 = picked.length;
    root.querySelector('.sidebar__fav-list .sidebar__star').click();   /* يزيل أول مثبّت (orders) من قسم المفضلة نفسه */
    await t.test('11. نقر نجمة لا يُعدّ تنقلاً (onSelect لا يُستدعى) وإزالتها من المفضلة تعمل', picked.length === n0 && favItems().join() === 'inventory,workers');

    sb.setActive('inventory');
    await t.test('12. الصفحة النشطة تُعلَّم في المفضلة وفي مجموعتها معاً',
      root.querySelectorAll('.sidebar__item--active[data-id="inventory"]').length === 2);

    const empty = createSidebar({ sections: NAV_GROUPS, accordion: true, favorites: memFavs([]) });
    await t.test('13. بلا مفضلة: يظهر التلميح وتُرسم نجوم ☆ فقط', empty.node.querySelector('.sidebar__fav-hint').hidden === false && empty.node.querySelectorAll('.sidebar__star[aria-pressed="true"]').length === 0);

    const legacy = createSidebar({ sections: [{ title: 'أ', items: [{ id: 'a', icon: '1', label: 'ألف' }] }], activeId: 'a' });
    await t.test('14. الوضع القديم (بلا accordion/favorites) كما كان: عنوان ثابت وبلا أكورديون أو نجوم',
      !legacy.node.querySelector('.collapsible') && !legacy.node.querySelector('.sidebar__star') && legacy.node.querySelector('.sidebar__section-title').textContent === 'أ' && !!legacy.node.querySelector('.sidebar__item--active[data-id="a"]'));

    await t.test('15. نصوص العناوين تُدرج كنص (لا HTML): عنوان به وسم لا يُنشئ عنصراً',
      (() => {
        const x = createSidebar({ sections: [{ id: 'g', title: '<img src=x onerror=1>', items: [{ id: 'a', icon: '1', label: '<b>x</b>' }] }], accordion: true });
        return !x.node.querySelector('img') && !x.node.querySelector('b') && x.node.querySelector('.collapsible__title').textContent.includes('<img');
      })());
  } finally {
    root.remove();
  }
});
