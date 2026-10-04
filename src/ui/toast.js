/* ==========================================================================
   toast.js — إشعارات قصيرة (Toast Notifications)
   ==========================================================================
   API:
     toast.success('رسالة')   → إشعار أخضر
     toast.warning('رسالة')   → إشعار برتقالي
     toast.danger('رسالة')    → إشعار أحمر
     toast.info('رسالة')      → إشعار أزرق
     toast.show('رسالة', {type, duration, closable})
     toast.clear()            → إزالة كل الإشعارات
   ========================================================================== */

import { el } from '../core/dom.js';
import { events } from '../core/events.js';

const CONTAINER_ID = 'toast-container';
const DEFAULT_DURATION = 3000;

const ICONS = {
  success: '✅',
  warning: '⚠️',
  danger:  '❌',
  info:    'ℹ️',
  default: '💬',
};

/**
 * إرجاع حاوية الإشعارات (إنشاؤها عند أول استخدام).
 * @returns {HTMLElement}
 */
function getContainer() {
  let c = document.getElementById(CONTAINER_ID);
  if (!c) {
    c = el('div', { id: CONTAINER_ID, className: 'toast-container' });
    document.body.appendChild(c);
  }
  return c;
}

/**
 * عرض إشعار.
 * @param {string} message
 * @param {Object} [options]
 * @param {string} [options.type='default']
 * @param {number} [options.duration=3000] — 0 = بلا إخفاء تلقائي
 * @param {boolean} [options.closable=true]
 * @returns {{close: Function, node: HTMLElement}}
 */
function show(message, options = {}) {
  const {
    type = 'default',
    duration = DEFAULT_DURATION,
    closable = true,
  } = options;

  const container = getContainer();
  const node = el('div', {
    className: 'toast toast--' + type,
    role: 'status',
  });

  const icon = el('span', {
    className: 'toast__icon',
    text: ICONS[type] || ICONS.default,
  });

  const msg = el('span', {
    className: 'toast__msg',
    text: String(message ?? ''),
  });

  node.appendChild(icon);
  node.appendChild(msg);

  let timer = null;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    node.style.transition = 'opacity 150ms';
    node.style.opacity = '0';
    setTimeout(() => {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 150);
    events.emit('toast:closed', { message, type });
  }

  if (closable) {
    const closeBtn = el('button', {
      className: 'toast__close',
      type: 'button',
      'aria-label': 'إغلاق',
      onClick: close,
    }, '×');
    node.appendChild(closeBtn);
  }

  container.appendChild(node);
  events.emit('toast:shown', { message, type });

  if (duration > 0) {
    timer = setTimeout(close, duration);
  }

  return { close, node };
}

export const toast = {
  show,
  success: (msg, opts = {}) => show(msg, { ...opts, type: 'success' }),
  warning: (msg, opts = {}) => show(msg, { ...opts, type: 'warning' }),
  danger:  (msg, opts = {}) => show(msg, { ...opts, type: 'danger'  }),
  info:    (msg, opts = {}) => show(msg, { ...opts, type: 'info'    }),
  error:   (msg, opts = {}) => show(msg, { ...opts, type: 'danger'  }),
  clear() {
    const c = document.getElementById(CONTAINER_ID);
    if (!c) return;
    while (c.firstChild) c.removeChild(c.firstChild);
  },
};
