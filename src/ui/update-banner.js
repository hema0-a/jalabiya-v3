/* ==========================================================================
   update-banner.js — شريط «تحديث جديد متاح»
   ==========================================================================
   showUpdateBanner({ onUpdate, onLater, text })
     - شريط علوي غير حاجب (role="status") بزرّين: «حدّث الآن» و«لاحقاً».
     - نسخة واحدة فقط في الصفحة (استدعاء ثانٍ يُرجع الموجود).
     - يُرجع { node, setBusy(bool), remove() }.
   hideUpdateBanner() — يزيله إن وُجد.
   بدلاً من window.confirm الحاجبة التي كانت تظهر مرة واحدة ولا تعود.
   ========================================================================== */

import { el } from '../core/dom.js';

const BANNER_ID = 'update-banner';

/**
 * @param {{onUpdate?:Function, onLater?:Function, text?:string}} [opts]
 * @returns {{node:HTMLElement, setBusy:(busy:boolean)=>void, remove:()=>void, existed:boolean}}
 */
export function showUpdateBanner(opts = {}) {
  const { onUpdate, onLater, text = '🎉 يتوفر تحديث جديد للتطبيق' } = opts;

  const existing = document.getElementById(BANNER_ID);
  if (existing) return handleOf(existing, true);

  const updateBtn = el('button', {
    type: 'button',
    className: 'update-banner__btn update-banner__btn--primary',
    dataset: { action: 'update' },
    onClick: () => { if (typeof onUpdate === 'function') onUpdate(); },
  }, 'حدّث الآن');

  const laterBtn = el('button', {
    type: 'button',
    className: 'update-banner__btn',
    dataset: { action: 'later' },
    onClick: () => { if (typeof onLater === 'function') onLater(); },
  }, 'لاحقاً');

  const node = el('div', {
    id: BANNER_ID,
    className: 'update-banner',
    role: 'status',
    'aria-live': 'polite',
  }, [
    el('span', { className: 'update-banner__text', text }),
    el('div', { className: 'update-banner__actions' }, [updateBtn, laterBtn]),
  ]);

  document.body.appendChild(node);
  return handleOf(node, false);
}

function handleOf(node, existed) {
  return {
    node,
    existed,
    setBusy(busy) {
      const upd = node.querySelector('[data-action="update"]');
      const later = node.querySelector('[data-action="later"]');
      if (upd) { upd.disabled = !!busy; upd.textContent = busy ? 'جارٍ التحديث…' : 'حدّث الآن'; }
      if (later) later.disabled = !!busy;
      node.setAttribute('aria-busy', busy ? 'true' : 'false');
    },
    remove() { node.remove(); },
  };
}

/** يزيل الشريط إن وُجد. */
export function hideUpdateBanner() {
  const n = document.getElementById(BANNER_ID);
  if (n) n.remove();
}
