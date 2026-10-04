/* ==========================================================================
   topbar.js — الشريط العلوي
   ==========================================================================
   API:
     const topbar = createTopbar({
       title, onMenuClick, actions, showMenu
     });
     topbar.node            → HTMLElement
     topbar.setTitle(str)   → void
     topbar.setActions([])  → void
   ========================================================================== */

import { el } from '../core/dom.js';

/**
 * إنشاء الشريط العلوي.
 * @param {Object} [options]
 * @param {string} [options.title='']
 * @param {Function} [options.onMenuClick] — يُستدعى عند ضغط زر القائمة
 * @param {Array<{id:string, icon:string, onClick:Function, label?:string}>} [options.actions]
 * @param {boolean} [options.showMenu=true]
 * @returns {{node:HTMLElement, setTitle:Function, setActions:Function}}
 */
export function createTopbar(options = {}) {
  const {
    title = '',
    onMenuClick = null,
    actions = [],
    showMenu = true,
  } = options;

  /* زر القائمة (للموبايل) */
  const menuBtn = el('button', {
    type: 'button',
    className: 'topbar__menu',
    'aria-label': 'فتح القائمة',
    onClick: () => {
      if (typeof onMenuClick === 'function') onMenuClick();
    },
  }, '☰');

  /* العنوان */
  const titleEl = el('h1', { className: 'topbar__title', text: title });

  /* منطقة الأزرار */
  const actionsWrap = el('div', { className: 'topbar__actions' });

  /**
   * استبدال الأزرار الحالية.
   * @param {Array<{id:string, icon:string, onClick:Function, label?:string}>} newActions
   */
  function setActions(newActions = []) {
    while (actionsWrap.firstChild) actionsWrap.removeChild(actionsWrap.firstChild);
    newActions.forEach((a) => {
      const btn = el('button', {
        type: 'button',
        className: 'btn btn--icon btn--sm',
        'data-action': a.id || '',
        'aria-label': a.label || '',
        onClick: () => {
          if (typeof a.onClick === 'function') a.onClick();
        },
      }, a.icon || '•');
      actionsWrap.appendChild(btn);
    });
  }

  setActions(actions);

  /* Assembly */
  const children = [];
  if (showMenu) children.push(menuBtn);
  children.push(titleEl, actionsWrap);

  const node = el('header', { className: 'topbar' }, children);

  return {
    node,
    setTitle: (str) => { titleEl.textContent = String(str ?? ''); },
    setActions,
  };
}
