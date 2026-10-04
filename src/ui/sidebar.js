/* ==========================================================================
   sidebar.js — القائمة الجانبية
   ==========================================================================
   API:
     const sidebar = createSidebar({
       title, subtitle, logo,
       items: [{id, icon, label}],
       activeId,
       onSelect: (id) => {},
       footer
     });
     sidebar.node           → HTMLElement
     sidebar.setActive(id)  → void
     sidebar.getActive()    → string
   ========================================================================== */

import { el } from '../core/dom.js';

/**
 * إنشاء القائمة الجانبية.
 * @param {Object} [options]
 * @param {string} [options.title='التطبيق']
 * @param {string} [options.subtitle='']
 * @param {string} [options.logo='📱']
 * @param {Array<{id:string, icon:string, label:string}>} [options.items=[]]
 * @param {string} [options.activeId='']
 * @param {Function} [options.onSelect]
 * @param {string} [options.footer='']
 * @returns {{node:HTMLElement, setActive:Function, getActive:Function}}
 */
export function createSidebar(options = {}) {
  const {
    title = 'التطبيق',
    subtitle = '',
    logo = '📱',
    items = [],
    activeId = '',
    onSelect = null,
    footer = '',
  } = options;

  let currentActive = activeId;
  const itemNodes = new Map();

  /* Header */
  const header = el('div', { className: 'sidebar__header' }, [
    el('div', { className: 'sidebar__logo' }, logo),
    el('div', {}, [
      el('h2', { className: 'sidebar__title', text: title }),
      subtitle
        ? el('p', { className: 'sidebar__subtitle', text: subtitle })
        : null,
    ]),
  ]);

  /* Nav */
  const nav = el('nav', { className: 'sidebar__nav', role: 'navigation' });

  /**
   * تعيين العنصر النشط.
   * @param {string} id
   */
  function setActive(id) {
    currentActive = id;
    itemNodes.forEach((node, itemId) => {
      node.classList.toggle('sidebar__item--active', itemId === id);
    });
  }

  items.forEach((item) => {
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
    nav.appendChild(btn);
  });

  /* Footer (اختياري) */
  const footerNode = footer
    ? el('div', { className: 'sidebar__footer', text: footer })
    : null;

  /* Assembly */
  const children = [header, nav];
  if (footerNode) children.push(footerNode);

  const node = el('aside', { className: 'sidebar' }, children);

  return {
    node,
    setActive,
    getActive: () => currentActive,
  };
}
