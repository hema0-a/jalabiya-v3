/* ==========================================================================
   topbar.js — الشريط العلوي (مع دعم زر الرجوع)
   ==========================================================================
   API:
     const topbar = createTopbar({
       title, onMenuClick, actions, showMenu, onBack
     });
     topbar.node
     topbar.setTitle(str)
     topbar.setActions([])
     topbar.setBackAction(fn | null)   // fn → يُظهر ← | null → يُخفيها ويُظهر ☰
     topbar.isBackVisible()
   ========================================================================== */

import { el } from '../core/dom.js';

/**
 * إنشاء الشريط العلوي.
 * @param {Object} [options]
 * @param {string} [options.title='']
 * @param {Function} [options.onMenuClick]
 * @param {Function} [options.onBack] — إن مُرّر → يبدأ بزر الرجوع
 * @param {Array<{id:string, icon:string, onClick:Function, label?:string}>} [options.actions]
 * @param {boolean} [options.showMenu=true]
 * @returns {{node:HTMLElement, setTitle:Function, setActions:Function, setBackAction:Function, isBackVisible:Function}}
 */
export function createTopbar(options = {}) {
  const {
    title = '',
    onMenuClick = null,
    actions = [],
    showMenu = true,
    onBack = null,
  } = options;

  let backHandler = null;
  let backVisible = false;

  /* --- زر القائمة (يمين — يظهر على الجوال) --- */
  const menuBtn = el('button', {
    type: 'button',
    className: 'topbar__menu',
    'aria-label': 'فتح القائمة',
    onClick: () => {
      if (typeof onMenuClick === 'function') onMenuClick();
    },
  }, '☰');

  /* --- زر الرجوع (يحل مكان القائمة عند فتح قسم فرعي) --- */
  const backBtn = el('button', {
    type: 'button',
    className: 'topbar__back is-hidden',
    'aria-label': 'رجوع',
    onClick: () => {
      if (typeof backHandler === 'function') backHandler();
    },
  }, '←');

  /* --- العنوان --- */
  const titleEl = el('h1', { className: 'topbar__title', text: title });

  /* --- منطقة الأزرار (يسار) --- */
  const actionsWrap = el('div', { className: 'topbar__actions' });

  /**
   * استبدال الأزرار الحالية.
   * @param {Array<{id:string, icon:string, onClick:Function, label?:string}>} newActions
   */
  function setActions(newActions = []) {
    while (actionsWrap.firstChild) actionsWrap.removeChild(actionsWrap.firstChild);
    newActions.forEach((a) => {
      actionsWrap.appendChild(el('button', {
        type: 'button',
        className: 'btn btn--icon btn--sm',
        'data-action': a.id || '',
        'aria-label': a.label || '',
        onClick: () => {
          if (typeof a.onClick === 'function') a.onClick();
        },
      }, a.icon || '•'));
    });
  }

  setActions(actions);

  /**
   * تفعيل/تعطيل زر الرجوع.
   * - Function → يُظهر ← ويُخفي ☰
   * - null     → يُخفي ← ويُظهر ☰ (إن كان showMenu مفعَّلاً)
   * @param {Function|null} fn
   */
  function setBackAction(fn) {
    if (typeof fn === 'function') {
      backHandler = fn;
      backVisible = true;
      backBtn.classList.remove('is-hidden');
      menuBtn.classList.add('is-hidden');
    } else {
      backHandler = null;
      backVisible = false;
      backBtn.classList.add('is-hidden');
      menuBtn.classList.remove('is-hidden');
    }
  }

  if (typeof onBack === 'function') {
    setBackAction(onBack);
  }

  /* --- Assembly --- */
  const node = el('header', { className: 'topbar' }, [
    menuBtn,
    backBtn,
    titleEl,
    actionsWrap,
  ]);

  return {
    node,
    setTitle: (str) => { titleEl.textContent = String(str ?? ''); },
    setActions,
    setBackAction,
    isBackVisible: () => backVisible,
  };
}
