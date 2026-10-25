/* ==========================================================================
   sidebar.js — القائمة الجانبية: أقسام مسطّحة أو أكورديون + مفضلة (v3.5.0)
   ==========================================================================
   الوضع الافتراضي (بلا خيارات جديدة) كما كان: أقسام بعناوين ثابتة.
   accordion: true  ← كل قسم مجموعة قابلة للطي (يُفتح قسم واحد فقط)، ويُفتح تلقائياً
                      القسم الذي فيه الصفحة النشطة (حتى عند التنقل بالروابط أو الرجوع).
   favorites: { get(): string[], toggle(id): {favorites, added, full, max} }
                      ← زر ☆/★ بجانب كل صفحة + قسم «المفضلة» في الأعلى.
   كل النصوص تُدرج عبر el({ text }) (آمنة ضد XSS) — بلا innerHTML.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { createCollapsible } from './collapsible.js';
import { toast } from './toast.js';

/**
 * @param {Object} [options]
 * @returns {{node:HTMLElement, setActive:(id:string)=>void, getActive:()=>string, refreshFavorites:()=>void}}
 */
export function createSidebar(options = {}) {
  const {
    title = 'التطبيق',
    subtitle = '',
    logo = '📱',
    sections = [],
    items = [],
    activeId = '',
    onSelect = null,
    footer = '',
    accordion = false,
    favorites = null,
  } = options;

  const effectiveSections = sections.length > 0
    ? sections
    : (items.length > 0 ? [{ title: '', items }] : []);

  let currentActive = activeId;

  /* فهرس الصفحات + مجموعة كل صفحة (للفتح التلقائي) */
  const itemIndex = new Map();
  const groupOfItem = new Map();
  const groupApis = new Map();
  effectiveSections.forEach((section, si) => {
    const gid = section.id || ('section-' + si);
    (section.items || []).forEach((item) => {
      itemIndex.set(item.id, item);
      groupOfItem.set(item.id, gid);
    });
  });

  const header = el('div', { className: 'sidebar__header' }, [
    el('div', { className: 'sidebar__logo' }, logo),
    el('div', {}, [
      el('h2', { className: 'sidebar__title', text: title }),
      subtitle ? el('p', { className: 'sidebar__subtitle', text: subtitle }) : null,
    ]),
  ]);

  const nav = el('nav', { className: 'sidebar__nav', role: 'navigation' });

  /* --- زر صفحة --- */
  function makeItemButton(item) {
    return el('button', {
      type: 'button',
      className: 'sidebar__item' + (item.id === currentActive ? ' sidebar__item--active' : ''),
      'data-id': item.id,
      'aria-current': item.id === currentActive ? 'page' : null,
      onClick: () => {
        setActive(item.id);
        if (typeof onSelect === 'function') onSelect(item.id);
      },
    }, [
      el('span', { className: 'sidebar__icon' }, item.icon || '•'),
      el('span', { className: 'sidebar__label', text: item.label }),
    ]);
  }

  /* --- صف صفحة = زر + نجمة التثبيت (إن فُعّلت المفضلة) --- */
  function makeRow(item) {
    const btn = makeItemButton(item);
    if (!favorites) return btn;
    const star = el('button', {
      type: 'button',
      className: 'sidebar__star',
      'data-fav-id': item.id,
      onClick: () => onStarClick(item),
    });
    paintStar(star, favSet.has(item.id), item.label);
    return el('div', { className: 'sidebar__row' }, [btn, star]);
  }

  function paintStar(star, pinned, label) {
    star.textContent = pinned ? '★' : '☆';
    star.setAttribute('aria-pressed', String(pinned));
    star.setAttribute('aria-label', (pinned ? 'إزالة «' : 'تثبيت «') + label + (pinned ? '» من المفضلة' : '» في المفضلة'));
  }

  /* --- المفضلة --- */
  let favSet = new Set();
  let favList = null;
  let favHint = null;

  function readFavSet() {
    let list = [];
    try { list = favorites ? favorites.get() : []; } catch (_) { list = []; }
    favSet = new Set(list.filter((id) => itemIndex.has(id)));
    return Array.from(favSet);
  }

  function repaintStars() {
    nav.querySelectorAll('.sidebar__star').forEach((star) => {
      const id = star.getAttribute('data-fav-id');
      const item = itemIndex.get(id);
      paintStar(star, favSet.has(id), item ? item.label : '');
    });
  }

  function renderFavorites() {
    if (!favorites || !favList) return;
    const ids = readFavSet();
    clear(favList);
    ids.forEach((id) => favList.appendChild(makeRow(itemIndex.get(id))));
    favHint.hidden = ids.length > 0;
    repaintStars();
  }

  function onStarClick(item) {
    let res = null;
    try { res = favorites.toggle(item.id); } catch (_) { res = null; }
    if (res && res.full) {
      toast.info('وصلت للحد الأقصى (' + res.max + ' صفحات) — أزل صفحة من المفضلة أولاً');
      return;
    }
    renderFavorites();
  }

  if (favorites) {
    favList = el('div', { className: 'sidebar__fav-list' });
    favHint = el('div', { className: 'sidebar__fav-hint', text: 'اضغط ☆ بجانب أي صفحة لتثبيتها هنا' });
    nav.appendChild(el('div', { className: 'sidebar__section sidebar__section--fav' }, [
      el('div', { className: 'sidebar__section-title', text: '⭐ المفضلة' }),
      favList,
      favHint,
    ]));
  }

  /* --- الأقسام --- */
  const groupsWrap = accordion ? el('div', { className: 'sidebar__groups' }) : nav;
  const activeGroupId = groupOfItem.get(currentActive) || null;

  effectiveSections.forEach((section, si) => {
    const gid = section.id || ('section-' + si);
    const rows = (section.items || []).map(makeRow);

    if (accordion) {
      const itemsWrap = el('div', { className: 'sidebar__group-items' }, rows);
      const api = createCollapsible({
        id: 'nav-' + gid,
        title: section.title || '',
        icon: section.icon || '',
        content: itemsWrap,
        group: 'sidebar-nav',
        persist: false,                       /* الفتح يتبع الصفحة النشطة لا تفضيلاً محفوظاً */
        defaultOpen: gid === activeGroupId,
      });
      groupApis.set(gid, api);
      groupsWrap.appendChild(api.node);
    } else {
      const sectionWrap = el('div', { className: 'sidebar__section' });
      if (section.title) {
        sectionWrap.appendChild(el('div', { className: 'sidebar__section-title', text: section.title }));
      }
      rows.forEach((r) => sectionWrap.appendChild(r));
      nav.appendChild(sectionWrap);
    }
  });
  if (accordion) nav.appendChild(groupsWrap);

  renderFavorites();

  function setActive(id) {
    currentActive = id;
    nav.querySelectorAll('.sidebar__item').forEach((n) => {
      const on = n.getAttribute('data-id') === id;
      n.classList.toggle('sidebar__item--active', on);
      if (on) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current');
    });
    if (accordion) {
      const api = groupApis.get(groupOfItem.get(id));
      if (api && !api.isOpen()) api.open();
    }
  }

  const footerNode = footer
    ? el('div', { className: 'sidebar__footer', text: footer })
    : null;

  const children = [header, nav];
  if (footerNode) children.push(footerNode);

  const node = el('aside', { className: 'sidebar' }, children);

  return { node, setActive, getActive: () => currentActive, refreshFavorites: renderFavorites };
}
