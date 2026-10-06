/* ==========================================================================
   collapsible.js — أقسام قابلة للطي (Accordion)
   ==========================================================================
   مكوّن مستقل: قسم بعنوان قابل للنقر + محتوى يُظهر/يُخفى.
   - يحفظ الحالة في localStorage.
   - ARIA كامل (role="region" + aria-expanded + aria-controls).
   - Static imports فقط.
   ========================================================================== */

import { el } from '../core/dom.js';

/* --- مفتاح التخزين (متسق مع باقي مفاتيح jalabiya_v3_*) --- */
const STATE_KEY = 'jalabiya_v3_collapsed_state';

/**
 * قراءة حالة الأقسام من localStorage.
 * @returns {Object<string, boolean>}
 */
function readState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * حفظ حالة قسم واحد.
 * @param {string} id
 * @param {boolean} isOpen
 */
function writeState(id, isOpen) {
  try {
    const s = readState();
    s[id] = !!isOpen;
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('[collapsible] save state failed:', e);
  }
}

/**
 * إنشاء قسم قابل للطي.
 *
 * ملاحظة أمنية: العنوان يُدرج عبر el({ text }) الذي يستخدم
 * textContent — آمن ضد XSS تلقائياً (لا حاجة لـ escapeHtml).
 *
 * @param {Object} options
 * @param {string} options.id — معرّف فريد (للحفظ + ARIA)
 * @param {string} options.title — عنوان القسم
 * @param {HTMLElement} options.content — محتوى القسم (يُبنى خارجياً)
 * @param {boolean} [options.defaultOpen=false]
 * @param {Function} [options.onToggle] — (isOpen) => void
 * @returns {{node:HTMLElement, open:Function, close:Function, toggle:Function, isOpen:Function, setId:Function}}
 */
export function createCollapsible(options = {}) {
  let id = String(options.id || 'section_' + Date.now());
  const title = String(options.title || '');
  const contentEl = options.content;
  const defaultOpen = !!options.defaultOpen;
  const onToggle = (typeof options.onToggle === 'function') ? options.onToggle : null;

  const stored = readState();
  let isOpen = (id in stored) ? !!stored[id] : defaultOpen;

  const headerId = 'collapsible-header-' + id;
  const contentId = 'collapsible-content-' + id;

  const arrow = el('span', {
    className: 'collapsible__arrow',
    'aria-hidden': 'true',
  }, '▸');

  const titleEl = el('span', {
    className: 'collapsible__title',
    text: title,
  });

  const header = el('button', {
    type: 'button',
    className: 'collapsible__header',
    id: headerId,
    'aria-expanded': String(isOpen),
    'aria-controls': contentId,
    onClick: () => toggle(),
  }, [arrow, titleEl]);

  const contentWrap = el('div', {
    className: 'collapsible__content',
    id: contentId,
    role: 'region',
    'aria-labelledby': headerId,
  }, [contentEl]);

  const node = el('div', {
    className: 'collapsible' + (isOpen ? ' collapsible--open' : ''),
    'data-collapsible-id': id,
  }, [header, contentWrap]);

  /**
   * مزامنة الحالة الداخلية مع DOM.
   * (CSS يتحكم بالإظهار عبر .collapsible--open)
   */
  function syncDom() {
    header.setAttribute('aria-expanded', String(isOpen));
    node.classList.toggle('collapsible--open', isOpen);
  }

  /**
   * فتح القسم.
   */
  function open() {
    if (isOpen) return;
    isOpen = true;
    syncDom();
    writeState(id, true);
    if (onToggle) { try { onToggle(true); } catch (e) { console.error(e); } }
  }

  /**
   * إغلاق القسم.
   */
  function close() {
    if (!isOpen) return;
    isOpen = false;
    syncDom();
    writeState(id, false);
    if (onToggle) { try { onToggle(false); } catch (e) { console.error(e); } }
  }

  /**
   * تبديل حالة القسم.
   */
  function toggle() {
    if (isOpen) close();
    else open();
  }

  /**
   * تغيير معرّف القسم (ينقل الحالة في localStorage + يُحدّث ARIA).
   * @param {string} newId
   */
  function setId(newId) {
    const oldId = id;
    id = String(newId);
    const s = readState();
    if (oldId in s) {
      s[id] = s[oldId];
      delete s[oldId];
      try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
    }
    header.id = 'collapsible-header-' + id;
    contentWrap.id = 'collapsible-content-' + id;
    contentWrap.setAttribute('aria-labelledby', header.id);
    node.setAttribute('data-collapsible-id', id);
  }

  return {
    node,
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    setId,
  };
}

/**
 * فتح كل الأقسام داخل حاوية معيّنة.
 * @param {HTMLElement} rootEl — الحاوية (يُبحث داخلها عن .collapsible)
 */
export function openAll(rootEl) {
  if (!rootEl) return;
  const s = readState();
  rootEl.querySelectorAll('.collapsible').forEach((n) => {
    const cid = n.getAttribute('data-collapsible-id');
    if (cid) s[cid] = true;
    n.classList.add('collapsible--open');
    const h = n.querySelector('.collapsible__header');
    if (h) h.setAttribute('aria-expanded', 'true');
  });
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

/**
 * إغلاق كل الأقسام داخل حاوية معيّنة.
 * @param {HTMLElement} rootEl
 */
export function closeAll(rootEl) {
  if (!rootEl) return;
  const s = readState();
  rootEl.querySelectorAll('.collapsible').forEach((n) => {
    const cid = n.getAttribute('data-collapsible-id');
    if (cid) s[cid] = false;
    n.classList.remove('collapsible--open');
    const h = n.querySelector('.collapsible__header');
    if (h) h.setAttribute('aria-expanded', 'false');
  });
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { STATE_KEY, readState, writeState };
