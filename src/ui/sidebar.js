/* ==========================================================================
   sidebar.js — القائمة الجانبية مع دعم الأقسام
   ========================================================================== */

import { el } from '../core/dom.js';

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
  } = options;

  const effectiveSections = sections.length > 0
    ? sections
    : (items.length > 0 ? [{ title: '', items }] : []);

  let currentActive = activeId;
  const itemNodes = new Map();

  const header = el('div', { className: 'sidebar__header' }, [
    el('div', { className: 'sidebar__logo' }, logo),
    el('div', {}, [
      el('h2', { className: 'sidebar__title', text: title }),
      subtitle ? el('p', { className: 'sidebar__subtitle', text: subtitle }) : null,
    ]),
  ]);

  const nav = el('nav', { className: 'sidebar__nav', role: 'navigation' });

  function setActive(id) {
    currentActive = id;
    itemNodes.forEach((node, itemId) => {
      node.classList.toggle('sidebar__item--active', itemId === id);
    });
  }

  effectiveSections.forEach((section) => {
    const sectionWrap = el('div', { className: 'sidebar__section' });

    if (section.title) {
      sectionWrap.appendChild(el('div', {
        className: 'sidebar__section-title',
        text: section.title,
      }));
    }

    (section.items || []).forEach((item) => {
      const btn = el('button', {
        type: 'button',
        className: 'sidebar__item' + (item.id === currentActive ? ' sidebar__item--active' : ''),
        'data-id': item.id,
        onClick: () => {
          setActive(item.id);
          if (typeof onSelect === 'function') onSelect(item.id);
        },
      }, [
        el('span', { className: 'sidebar__icon' }, item.icon || '•'),
        el('span', { className: 'sidebar__label', text: item.label }),
      ]);
      itemNodes.set(item.id, btn);
      sectionWrap.appendChild(btn);
    });

    nav.appendChild(sectionWrap);
  });

  const footerNode = footer
    ? el('div', { className: 'sidebar__footer', text: footer })
    : null;

  const children = [header, nav];
  if (footerNode) children.push(footerNode);

  const node = el('aside', { className: 'sidebar' }, children);

  return { node, setActive, getActive: () => currentActive };
}
