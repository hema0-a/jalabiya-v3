/* ==========================================================================
   dom.js — أدوات التعامل مع DOM بأمان
   ==========================================================================
   كل بناء عنصر يمر عبر el() — لا innerHTML مباشر.
   الأحداث تُدار عبر on() مع إرجاع دالة إلغاء.
   ========================================================================== */

/**
 * بناء عنصر DOM بشكل آمن.
 * - النصوص تُضاف عبر createTextNode (لا XSS).
 * - السمات تُضاف عبر setAttribute.
 * - الأحداث عبر مفاتيح تبدأ بـ on (مثل onClick).
 * @param {string} tag - اسم الوسم (div, button, ...)
 * @param {Object} [props] - خصائص: سمات، dataset، style، أحداث، text
 * @param {Array|Node|string|number} [children] - أبناء (عناصر، نصوص، أرقام)
 * @returns {HTMLElement}
 * @example
 *   el('div', { className: 'card' }, [
 *     el('h3', { text: 'عنوان' }),
 *     el('button', { onClick: save, className: 'btn' }, 'حفظ')
 *   ])
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    // أحداث: onClick, onInput, ...
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    }
    // className / class
    else if (key === 'className' || key === 'class') {
      node.className = String(value);
    }
    // dataset: { id: '5' } → data-id="5"
    else if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => { node.dataset[k] = v; });
    }
    // style: { color: 'red' }
    else if (key === 'style' && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => { node.style[k] = v; });
    }
    // hidden
    else if (key === 'hidden') {
      node.hidden = Boolean(value);
    }
    // text → createTextNode (آمن ضد XSS)
    else if (key === 'text') {
      node.textContent = String(value);
    }
    // سمات عادية
    else {
      node.setAttribute(key, String(value));
    }
  });

  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  });

  return node;
}

/**
 * اختصار querySelector.
 * @param {string} selector
 * @param {Document|HTMLElement} [root=document]
 * @returns {HTMLElement|null}
 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * اختصار querySelectorAll — يُرجع Array (لا NodeList).
 * @param {string} selector
 * @param {Document|HTMLElement} [root=document]
 * @returns {HTMLElement[]}
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * إضافة مستمع حدث — يُرجع دالة إلغاء.
 * @param {EventTarget} element
 * @param {string} event
 * @param {Function} handler
 * @param {Object|boolean} [options]
 * @returns {Function} unsubscribe
 */
export function on(element, event, handler, options) {
  element.addEventListener(event, handler, options);
  return () => element.removeEventListener(event, handler, options);
}

/**
 * إزالة مستمع حدث.
 */
export function off(element, event, handler, options) {
  element.removeEventListener(event, handler, options);
}

/**
 * إزالة كل أبناء عنصر.
 * @param {HTMLElement} element
 */
export function clear(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * إظهار عنصر (إزالة hidden).
 * @param {HTMLElement} element
 */
export function show(element) {
  if (element) element.hidden = false;
}

/**
 * إخفاء عنصر (إضافة hidden).
 * @param {HTMLElement} element
 */
export function hide(element) {
  if (element) element.hidden = true;
}
