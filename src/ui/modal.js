/* ==========================================================================
   modal.js — نوافذ منبثقة (Modal + Confirm)
   ==========================================================================
   API:
     modal.open({title, body, actions, closable, onClose})
     modal.close()        → إغلاق النافذة العلوية
     modal.closeAll()     → إغلاق كل النوافذ
     modal.confirm({title, message, confirmText, cancelText, danger})
                          → Promise<boolean>
   يدعم مكدس (Modals متعددة).
   ========================================================================== */

import { el } from '../core/dom.js';
import { events } from '../core/events.js';

/* --- المكدس --- */
const stack = [];
let _idCounter = 0;

/* --- إغلاق النافذة العلوية --- */
function closeTop() {
  if (stack.length === 0) return;
  const top = stack.pop();
  if (top.node && top.node.parentNode) {
    top.node.parentNode.removeChild(top.node);
  }
  if (stack.length === 0) {
    document.body.style.overflow = '';
  }
  if (typeof top.onClose === 'function') {
    try { top.onClose(); } catch (e) { console.error(e); }
  }
  events.emit('modal:closed', { id: top.id });
}

/* --- إغلاق كل النوافذ --- */
function closeAll() {
  while (stack.length > 0) closeTop();
}

/**
 * فتح نافذة منبثقة.
 * @param {Object} options
 * @param {string} [options.title='']
 * @param {Node|string} [options.body='']
 * @param {Array<{text:string, variant?:string, action?:string, onClick?:Function}>} [options.actions]
 * @param {boolean} [options.closable=true]
 * @param {Function} [options.onClose]
 * @returns {{id:string, node:HTMLElement, close:Function}}
 */
export function open(options = {}) {
  const {
    title = '',
    body = '',
    actions = [],
    closable = true,
    onClose = null,
  } = options;

  const id = 'modal-' + (++_idCounter);

  /* Header */
  const closeBtn = el('button', {
    className: 'modal__close',
    type: 'button',
    'aria-label': 'إغلاق',
    onClick: () => closeTop(),
  }, '×');

  const header = el('div', { className: 'modal__header' }, [
    el('h3', { className: 'modal__title', text: title }),
    closable ? closeBtn : null,
  ]);

  /* Body */
  const bodyNode = (body instanceof Node)
    ? body
    : el('div', { text: String(body ?? '') });
  const bodyWrap = el('div', { className: 'modal__body' }, [bodyNode]);

  /* Footer — فقط إن وُجدت أزرار */
  const footer = actions.length > 0
    ? el('div', { className: 'modal__footer' }, actions.map((a) => {
        return el('button', {
          className: 'btn btn--' + (a.variant || 'primary'),
          type: 'button',
          'data-action': a.action || '',
          onClick: () => {
            if (typeof a.onClick === 'function') a.onClick();
          },
        }, a.text || '');
      }))
    : null;

  /* Modal */
  const modalNode = el('div', {
    className: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
  }, [header, bodyWrap, footer]);

  /* Backdrop */
  const backdrop = el('div', {
    className: 'modal-backdrop',
    'data-modal-id': id,
  }, [modalNode]);

  if (closable) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeTop();
    });
  }

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const handle = {
    id,
    node: backdrop,
    close: () => {
      const idx = stack.findIndex((m) => m.id === id);
      if (idx === -1) return;
      const item = stack.splice(idx, 1)[0];
      if (item.node.parentNode) item.node.parentNode.removeChild(item.node);
      if (stack.length === 0) document.body.style.overflow = '';
      if (typeof item.onClose === 'function') {
        try { item.onClose(); } catch (e) { console.error(e); }
      }
      events.emit('modal:closed', { id });
    },
  };

  stack.push({ id, node: backdrop, onClose });
  events.emit('modal:opened', { id });
  return handle;
}

/**
 * نافذة تأكيد — Promise<boolean>.
 * true عند تأكيد، false عند إلغاء أو إغلاق.
 * @param {Object} options
 * @param {string} [options.title='تأكيد']
 * @param {string} [options.message='']
 * @param {string} [options.confirmText='تأكيد']
 * @param {string} [options.cancelText='إلغاء']
 * @param {boolean} [options.danger=false]
 * @returns {Promise<boolean>}
 */
export function confirm(options = {}) {
  const {
    title = 'تأكيد',
    message = '',
    confirmText = 'تأكيد',
    cancelText = 'إلغاء',
    danger = false,
  } = options;

  return new Promise((resolve) => {
    let resolved = false;
    const done = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    const handle = open({
      title,
      body: el('p', { text: message, style: { margin: '0' } }),
      actions: [
        {
          text: cancelText,
          variant: 'ghost',
          action: 'cancel',
          onClick: () => { done(false); handle.close(); },
        },
        {
          text: confirmText,
          variant: danger ? 'danger' : 'primary',
          action: 'confirm',
          onClick: () => { done(true); handle.close(); },
        },
      ],
      onClose: () => done(false),
    });
  });
}

/* --- ESC لإغلاق النافذة العلوية --- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length > 0) {
    closeTop();
  }
});

/* --- الواجهة العامة --- */
export const modal = {
  open,
  close: closeTop,
  closeAll,
  confirm,
};
