/* ==========================================================================
   modal.js — نوافذ منبثقة (Modal + Confirm)
   ==========================================================================
   API:
     modal.open({title, body, actions, closable, onClose, variant})
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

/* --- إنهاء نافذة: إزالة + استعادة التركيز + onClose (مصدر واحد للمسارين) --- */
function finalize(item) {
  if (item.node && item.node.parentNode) {
    item.node.parentNode.removeChild(item.node);
  }
  if (stack.length === 0) {
    document.body.style.overflow = '';
  }
  /* ♿ إعادة التركيز للعنصر الذي فتح النافذة (إن كان ما زال في الصفحة) */
  const back = item.restoreFocus;
  if (back && typeof back.focus === 'function' && document.contains(back)) {
    try { back.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  if (typeof item.onClose === 'function') {
    try { item.onClose(); } catch (e) { console.error(e); }
  }
  events.emit('modal:closed', { id: item.id });
}

/* --- إغلاق النافذة العلوية --- */
function closeTop() {
  if (stack.length === 0) return;
  finalize(stack.pop());
}

/* --- إغلاق كل النوافذ --- */
function closeAll() {
  while (stack.length > 0) closeTop();
}

/* --- عناصر قابلة للتركيز (لحبس Tab) --- */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * سحب الـ bottom-sheet للأسفل لإغلاقه (جوال فقط، من المقبض أو الرأس).
 * - يتبع الإصبع، ويُغلق عند تجاوز 100px أو سرعة سحب عالية، وإلا يرتدّ.
 * - لا يتعارض مع تمرير المحتوى (السحب من المقبض/الرأس فقط، touch-action:none).
 */
function attachSheetSwipe({ modalNode, grabber, header, handle }) {
  const mq = window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let dragging = false;

  const onDown = (e) => {
    if (!mq || !mq.matches) return;
    if (e.target.closest && e.target.closest('.modal__close')) return;
    dragging = true;
    startY = e.clientY;
    startT = e.timeStamp;
    dy = 0;
    modalNode.style.animation = 'none';     // fill-mode:both في CSS يطغى على transform المُدخَل
    modalNode.style.transition = 'none';
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);          // للأسفل فقط
    modalNode.style.transform = 'translateY(' + dy + 'px)';
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    const velocity = dy / Math.max(1, e.timeStamp - startT);   // px/ms
    modalNode.style.transition = 'transform 200ms var(--ease-out, ease-out)';
    if (dy > 100 || (dy > 30 && velocity > 0.6)) {
      modalNode.style.transform = 'translateY(100%)';
      setTimeout(() => handle.close(), 180);
    } else {
      modalNode.style.transform = '';
    }
  };

  [grabber, header].forEach((n) => {
    n.classList.add('modal__draggable');
    n.addEventListener('pointerdown', onDown);
    n.addEventListener('pointermove', onMove);
    n.addEventListener('pointerup', onUp);
    n.addEventListener('pointercancel', onUp);
  });
}

/**
 * فتح نافذة منبثقة.
 * @param {Object} options
 * @param {string} [options.title='']
 * @param {Node|string} [options.body='']
 * @param {Array<{text:string, variant?:string, action?:string, onClick?:Function}>} [options.actions]
 * @param {boolean} [options.closable=true]
  * @param {Function} [options.onClose]
 * @param {'centered'|'sheet'} [options.variant='centered'] — نمط العرض (sheet = bottom-sheet على الجوال)
 * @returns {{id:string, node:HTMLElement, close:Function}}
 */
export function open(options = {}) {
  const {
    title = '',
    body = '',
    actions = [],
    closable = true,
    onClose = null,
    variant = 'centered',
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
    el('h3', { className: 'modal__title', id: 'modal-title-' + id, text: title }),
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
        const btn = el('button', {
          className: 'btn btn--' + (a.variant || 'primary'),
          type: 'button',
          'data-action': a.action || '',
        }, a.text || '');
        /* 🛡️ حماية من النقر المزدوج (v3.3.50): كان الزر يتجاهل الـ Promise المُرجَع من المعالج، فنقرتان
           متتاليتان على «إضافة/حفظ» أنشأتا سجلين (دفعة مكررة تضاعف مبلغاً). الآن لا يُستدعى المعالج
           ثانية قبل انتهاء الأول، ويُعطَّل الزر أثناءه ويعود بعده (مثلاً عند فشل التحقق وبقاء النافذة). */
        let busy = false;
        const release = () => { busy = false; btn.disabled = false; };
        btn.addEventListener('click', () => {
          if (typeof a.onClick !== 'function' || busy) return;
          busy = true;
          btn.disabled = true;
          let r;
          try { r = a.onClick(); } catch (e) { release(); throw e; }
          if (r && typeof r.then === 'function') r.finally(release);   // finally: يحافظ على ظهور الأخطاء كما كان
          else release();
        });
        return btn;
      }))
    : null;

  /* مقبض السحب — يظهر فقط في bottom-sheet على الجوال (CSS) */
  const isSheet = variant === 'sheet';
  const grabber = (isSheet && closable)
    ? el('div', { className: 'modal__grabber', 'aria-hidden': 'true' })
    : null;

  /* Modal */
  const modalNode = el('div', {
    className: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': title ? 'modal-title-' + id : null,
    tabindex: '-1',
  }, [grabber, header, bodyWrap, footer]);

  /* Backdrop */
const backdrop = el('div', {
  className: 'modal-backdrop' +
    (variant === 'sheet' ? ' modal-backdrop--sheet' : ''),
  'data-modal-id': id,
}, [modalNode]);

  if (closable) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeTop();
    });
  }

  const restoreFocus = document.activeElement;
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const handle = {
    id,
    node: backdrop,
    close: () => {
      const idx = stack.findIndex((m) => m.id === id);
      if (idx === -1) return;
      finalize(stack.splice(idx, 1)[0]);
    },
  };

  stack.push({ id, node: backdrop, onClose, restoreFocus });

  /* ♿ تركيز النافذة نفسها (لا أول حقل: لا نُظهر لوحة المفاتيح تلقائياً على الجوال) */
  try { modalNode.focus({ preventScroll: true }); } catch { /* ignore */ }

  /* ♿ حبس Tab داخل النافذة العلوية فقط */
  backdrop.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || stack[stack.length - 1]?.id !== id) return;
    const items = Array.from(modalNode.querySelectorAll(FOCUSABLE))
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (items.length === 0) { e.preventDefault(); modalNode.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === modalNode)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  });

  if (grabber) attachSheetSwipe({ modalNode, grabber, header, handle });

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

/**
 * قبل حفظ تعديل سجل (v3.5.3): إن تغيّر السجل في قاعدة البيانات بعد فتح النموذج
 * (مزامنة تلقائية من جهاز آخر أو تبويب آخر) يُسأل المستخدم قبل أن يستبدل الحفظ تلك التغييرات بصمت.
 * فشل الفحص لا يمنع الحفظ.
 * @param {(id:string) => Promise<Object|null>} find — دالة قراءة السجل الحالي (مثل repo.find)
 * @param {{id:string, updatedAt?:number}} existing — السجل كما فُتح به النموذج
 * @param {string} [what] — وصف السجل في الرسالة
 * @returns {Promise<boolean>} true = تابع الحفظ
 */
export async function confirmIfStale(find, existing, what = 'هذا السجل') {
  try {
    const fresh = await find(existing.id);
    if (!fresh) return true;   // محذوف: رسالة update الفارغة تتولى الأمر
    if ((Number(fresh.updatedAt) || 0) === (Number(existing.updatedAt) || 0)) return true;
    return await confirm({
      title: 'تغيّر السجل أثناء التعديل',
      message: 'تم تعديل ' + what + ' من مكان آخر (مزامنة أو تبويب آخر) بعد فتح النموذج.\nالحفظ الآن سيستبدل تلك التغييرات بما في النموذج. هل تريد المتابعة؟',
      confirmText: 'نعم، احفظ', cancelText: 'مراجعة',
    });
  } catch (e) { return true; }
}
