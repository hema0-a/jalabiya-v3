/* ==========================================================================
   sub-page.js — نظام الصفحات الفرعية (Master → Detail)
   ==========================================================================
   قائمة أقسام → نقر → صفحة فرعية (slide من اليمين) → زر رجوع للقائمة.
   مستقل عن التطبيق. Static imports فقط.
   ========================================================================== */

import { el, clear } from '../core/dom.js';

/**
 * إنشاء مدير صفحة فرعية.
 * @param {Object} options
 * @param {string} options.baseId — معرّف أساسي (مثال: 'settings')
 * @param {Array<{id:string,title:string,icon?:string,render:(c:HTMLElement,id:string)=>void|Promise<void>}>} options.sections
 * @param {Function} [options.onOpen]  — (id) => void
 * @param {Function} [options.onClose] — () => void
 * @returns {{node:HTMLElement, openSection:Function, closeSection:Function, isOpen:Function, getCurrentSection:Function}}
 */
export function createSubPageManager(options = {}) {
  const baseId = String(options.baseId || 'sub');
  const sections = Array.isArray(options.sections) ? options.sections : [];
  const onOpen = (typeof options.onOpen === 'function') ? options.onOpen : null;
  const onClose = (typeof options.onClose === 'function') ? options.onClose : null;

  let currentId = null;

  /* قائمة الأقسام */
  const listEl = el('div', {
    className: 'sub-page__list',
    role: 'navigation',
    'aria-label': 'الأقسام',
  });

  sections.forEach((sec) => {
    listEl.appendChild(el('button', {
      type: 'button',
      className: 'sub-page__item',
      'data-section-id': sec.id,
      onClick: () => openSection(sec.id),
    }, [
      el('span', { className: 'sub-page__item-icon', 'aria-hidden': 'true' }, sec.icon || '📄'),
      el('span', { className: 'sub-page__item-title', text: sec.title }),
      el('span', { className: 'sub-page__item-arrow', 'aria-hidden': 'true' }, '‹'),
    ]));
  });

  /* حاوية التفاصيل + زر الرجوع */
  const contentWrap = el('div', { className: 'sub-page__content' });
  const backBtn = el('button', {
    type: 'button',
    className: 'sub-page__back',
    onClick: () => closeSection(),
  }, '→ عودة');
  const detailEl = el('div', {
    className: 'sub-page__detail',
    'aria-hidden': 'true',
  }, [backBtn, contentWrap]);

  /* الجذر */
  const node = el('div', {
    className: 'sub-page',
    'data-base-id': baseId,
  }, [listEl, detailEl]);

  /**
   * فتح قسم.
   * @param {string} id
   */
  async function openSection(id) {
    if (!id) return;
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;

    currentId = id;
    clear(contentWrap);

    try {
      const r = sec.render(contentWrap, id);
      if (r && typeof r.then === 'function') await r;
    } catch (e) {
      console.error('[sub-page] render failed:', e);
      contentWrap.appendChild(el('div', {
        style: { padding: '16px', color: '#C62828', fontSize: '13px' },
      }, 'فشل تحميل القسم: ' + (e.message || String(e))));
    }

    node.classList.add('sub-page--open');
    detailEl.setAttribute('aria-hidden', 'false');
    listEl.setAttribute('aria-hidden', 'true');

    node.querySelectorAll('.sub-page__item').forEach((item) => {
      const active = item.getAttribute('data-section-id') === id;
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (onOpen) { try { onOpen(id); } catch (e) { console.error(e); } }
  }

  /**
   * إغلاق القسم والعودة للقائمة.
   */
  function closeSection() {
    if (!currentId) return;
    currentId = null;

    node.classList.remove('sub-page--open');
    detailEl.setAttribute('aria-hidden', 'true');
    listEl.setAttribute('aria-hidden', 'false');

    node.querySelectorAll('.sub-page__item').forEach((item) => {
      item.setAttribute('aria-current', 'false');
    });

    setTimeout(() => {
      if (currentId === null) clear(contentWrap);
    }, 350);

    if (onClose) { try { onClose(); } catch (e) { console.error(e); } }
  }

  return {
    node,
    openSection,
    closeSection,
    isOpen: () => currentId !== null,
    getCurrentSection: () => currentId,
  };
}
