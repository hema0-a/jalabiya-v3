/* ==========================================================================
   collapsible.js — أقسام قابلة للطي (Accordion) — v2
   ==========================================================================
   مكوّن مستقل: قسم بعنوان قابل للنقر + محتوى يُظهر/يُخفى.

   الميزات:
   - ARIA كامل (region + aria-expanded + aria-controls) و`inert` للمحتوى المغلق
     (لا يصل إليه Tab ولا قارئ الشاشة).
   - حركة سلسة بلا قفزات (الـ padding على عنصر داخلي لا على الـ grid).
   - وضع حصري (group): فتح قسم يُغلق إخوته في نفس المجموعة.
   - تحميل كسول: content يمكن أن يكون دالة (تُنفَّذ عند أول فتح، تدعم async).
   - ملخص تحت العنوان + شارة عدّاد (summary / badge) تُحدَّث لاحقاً.
   - تنقل بالكيبورد: ↑ ↓ Home End بين العناوين.
   - reveal(): فتح + تمرير + وميض (للروابط العميقة والتنبيهات).
   - حفظ الحالة في localStorage عبر كاش ذاكرة (بلا JSON.parse مع كل نقرة)
     وسقف 300 معرّف لمنع تراكم المعرّفات القديمة.
   - طباعة: كل الأقسام تُعرض مفتوحة.
   - أنماط (variant): card (افتراضي: بطاقة) · dashed (إطار منقّط للنماذج: «خيارات إضافية»)
     · plain (سطر خفيف داخل النوافذ: «التفاصيل التقنية»). كلها نفس المحرّك والـ ARIA.
   - className: صنف إضافي على العقدة (للربط بالاختبارات/الـ CSS الخاص).
   - node.open: خاصية قراءة/كتابة بنفس عقد <details> (get = مفتوح؟ · set = افتح/أغلق) فيسهل
     استبدال <details> الأصلي دون تغيير الكود الذي يقرأ `.open` أو يضبطه.
   - Static imports فقط.
   ========================================================================== */

import { el } from '../core/dom.js';

/* --- مفتاح التخزين (متسق مع باقي مفاتيح jalabiya_v3_*) --- */
const STATE_KEY = 'jalabiya_v3_collapsed_state';
const MAX_STORED = 300;

/* ==========================================================================
   حالة الأقسام (كاش ذاكرة مُتحقَّق منه بالنص الخام)
   ========================================================================== */
let cachedRaw = null;
let cachedObj = {};

/**
 * قراءة حالة الأقسام من localStorage.
 * يُعاد استعمال الكائن المُحلَّل ما دام النص الخام لم يتغير
 * (يبقى صحيحاً لو عدّله تبويب آخر أو اختبار أو مسح المستخدم).
 * @returns {Object<string, boolean>}
 */
function readState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw === cachedRaw) return cachedObj;
    cachedRaw = raw;
    if (!raw) { cachedObj = {}; return cachedObj; }
    const parsed = JSON.parse(raw);
    cachedObj = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    cachedRaw = null;
    cachedObj = {};
  }
  return cachedObj;
}

/** حفظ الكائن كاملاً (مع تقليم الأقدم عند تجاوز السقف). */
function persist(state) {
  try {
    const keys = Object.keys(state);
    if (keys.length > MAX_STORED) {
      keys.slice(0, keys.length - MAX_STORED).forEach((k) => { delete state[k]; });
    }
    const raw = JSON.stringify(state);
    localStorage.setItem(STATE_KEY, raw);
    cachedRaw = raw;
    cachedObj = state;
  } catch (e) {
    console.warn('[collapsible] save state failed:', e);
  }
}

/**
 * حفظ حالة قسم واحد.
 * @param {string} id
 * @param {boolean} isOpen
 */
function writeState(id, isOpen) {
  const s = { ...readState() };
  delete s[id];            // يعيد المعرّف لآخر الترتيب (الأحدث استعمالاً)
  s[id] = !!isOpen;
  persist(s);
}

/**
 * حذف حالات المعرّفات التي لم تعد موجودة.
 * @param {string[]} validIds — المعرّفات الصالحة (غيرها يُحذف)
 * @returns {number} عدد المحذوف
 */
export function pruneState(validIds = []) {
  const keep = new Set(validIds.map(String));
  const s = { ...readState() };
  let removed = 0;
  Object.keys(s).forEach((k) => { if (!keep.has(k)) { delete s[k]; removed++; } });
  if (removed) persist(s);
  return removed;
}

/* ==========================================================================
   سجل داخلي: عقدة DOM → واجهة القسم (WeakMap = بلا تسرّب ذاكرة)
   ========================================================================== */
const registry = new WeakMap();
let uid = 0;

const safeId = (v) => String(v).trim().replace(/\s+/g, '-');
const prefersReducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/**
 * إنشاء قسم قابل للطي.
 *
 * ملاحظة أمنية: العنوان والملخص يُدرجان عبر el({ text }) الذي يستخدم
 * textContent — آمن ضد XSS تلقائياً (لا حاجة لـ escapeHtml).
 *
 * @param {Object} options
 * @param {string} options.id — معرّف فريد (للحفظ + ARIA)
 * @param {string} options.title — عنوان القسم
 * @param {HTMLElement|(() => HTMLElement|Promise<HTMLElement>)} options.content
 *        — المحتوى، أو دالة تبنيه عند أول فتح (تحميل كسول).
 * @param {boolean} [options.defaultOpen=false]
 * @param {string}  [options.icon] — إيموجي/رمز قبل العنوان
 * @param {string}  [options.summary] — سطر صغير تحت العنوان
 * @param {number|string} [options.badge] — شارة عدّاد (0/فارغ = مخفية)
 * @param {string}  [options.group] — مجموعة حصرية: فتح قسم يُغلق إخوته (نفس الأب + نفس group)
 * @param {'card'|'dashed'|'plain'} [options.variant='card'] — شكل القسم (انظر رأس الملف)
 * @param {string}  [options.className] — صنف إضافي على العقدة
 * @param {boolean} [options.persist=true] — حفظ الحالة في localStorage
 * @param {Function} [options.onToggle] — (isOpen) => void
 * @returns {{node:HTMLElement, open:Function, close:Function, toggle:Function,
 *   isOpen:Function, setId:Function, setTitle:Function, setSummary:Function,
 *   setBadge:Function, reveal:Function, focus:Function}}
 */
export function createCollapsible(options = {}) {
  let id = safeId(options.id || 'section_' + (++uid));
  const contentSrc = options.content;
  const lazyBuilder = (typeof contentSrc === 'function') ? contentSrc : null;
  const group = options.group ? String(options.group) : '';
  const shouldPersist = options.persist !== false;
  const onToggle = (typeof options.onToggle === 'function') ? options.onToggle : null;

  const stored = shouldPersist ? readState() : {};
  let isOpen = (id in stored) ? !!stored[id] : !!options.defaultOpen;
  let mounted = false;
  let mounting = false;

  const headerId = () => 'collapsible-header-' + id;
  const contentId = () => 'collapsible-content-' + id;

  /* --- العنوان --- */
  const arrow = el('span', { className: 'collapsible__arrow', 'aria-hidden': 'true' });
  const iconEl = options.icon
    ? el('span', { className: 'collapsible__icon', 'aria-hidden': 'true', text: String(options.icon) })
    : null;
  const titleEl = el('span', { className: 'collapsible__title', text: String(options.title || '') });
  const summaryEl = el('span', { className: 'collapsible__summary', text: '' });
  const badgeEl = el('span', { className: 'collapsible__badge', hidden: true });
  const textWrap = el('span', { className: 'collapsible__text' }, [titleEl, summaryEl]);

  const header = el('button', {
    type: 'button',
    className: 'collapsible__header',
    id: headerId(),
    'aria-expanded': String(isOpen),
    'aria-controls': contentId(),
  }, [iconEl, textWrap, badgeEl, arrow]);

  /* --- المحتوى: wrap(grid) > body(overflow+padding) > المحتوى الفعلي --- */
  const bodyEl = el('div', { className: 'collapsible__body' });
  /* المحتوى العادي يُلحق فوراً (توافق v1)؛ الكسول فقط يؤجَّل لأول فتح */
  if (!lazyBuilder && contentSrc instanceof Node) {
    bodyEl.appendChild(contentSrc);
    mounted = true;
  }
  const contentWrap = el('div', {
    className: 'collapsible__content',
    id: contentId(),
    role: 'region',
    'aria-labelledby': headerId(),
  }, [bodyEl]);

  const variant = (options.variant === 'dashed' || options.variant === 'plain') ? options.variant : 'card';
  const extraClass = String(options.className || '').trim();
  const node = el('div', {
    className: 'collapsible'
      + (variant !== 'card' ? ' collapsible--' + variant : '')
      + (extraClass ? ' ' + extraClass : '')
      + (isOpen ? ' collapsible--open' : ''),
    'data-collapsible-id': id,
  }, [header, contentWrap]);
  if (group) node.setAttribute('data-collapsible-group', group);

  /* --- ملخص / شارة --- */
  function setSummary(text) {
    const t = (text === null || text === undefined) ? '' : String(text);
    summaryEl.textContent = t;
    summaryEl.hidden = !t;
  }
  function setBadge(n) {
    const empty = (n === null || n === undefined || n === '' || n === 0 || n === '0');
    badgeEl.textContent = empty ? '' : String(n);
    badgeEl.hidden = empty;
  }
  function setTitle(text) { titleEl.textContent = String(text || ''); }
  setSummary(options.summary);
  setBadge(options.badge);

  /* --- بناء المحتوى (فوري أو كسول) --- */
  async function mount() {
    if (mounted || mounting) return;
    if (!lazyBuilder) { mounted = true; return; }
    mounting = true;
    contentWrap.setAttribute('aria-busy', 'true');
    bodyEl.appendChild(el('div', { className: 'collapsible__loading', text: '…' }));
    try {
      const built = await lazyBuilder();
      bodyEl.textContent = '';
      if (built instanceof Node) bodyEl.appendChild(built);
      mounted = true;
    } catch (e) {
      console.error('[collapsible] lazy content failed:', e);
      bodyEl.textContent = '';
      bodyEl.appendChild(el('div', { className: 'collapsible__error', role: 'alert' }, [
        el('span', { text: 'تعذّر تحميل المحتوى ' }),
        el('button', {
          type: 'button',
          className: 'collapsible__retry',
          onClick: () => { mounting = false; mount(); },
        }, 'إعادة المحاولة'),
      ]));
    } finally {
      mounting = mounted ? false : mounting;
      contentWrap.removeAttribute('aria-busy');
    }
  }

  /* --- مزامنة DOM مع الحالة --- */
  function syncDom() {
    header.setAttribute('aria-expanded', String(isOpen));
    node.classList.toggle('collapsible--open', isOpen);
    /* inert: المحتوى المغلق لا يُركَّز عليه ولا يُقرأ */
    contentWrap.inert = !isOpen;
    if (isOpen) contentWrap.removeAttribute('aria-hidden');
    else contentWrap.setAttribute('aria-hidden', 'true');
  }

  /* --- إغلاق إخوة المجموعة --- */
  function closeSiblings() {
    if (!group || !node.parentElement) return;
    node.parentElement.querySelectorAll(':scope > .collapsible[data-collapsible-group]').forEach((sib) => {
      if (sib === node || sib.getAttribute('data-collapsible-group') !== group) return;
      const entry = registry.get(sib);
      if (entry) entry.apply(false, { scroll: false });
    });
  }

  /**
   * تطبيق حالة جديدة (داخلي — يستعمله openAll/closeAll والمجموعات).
   * @param {boolean} next
   * @param {{persist?:boolean, notify?:boolean, scroll?:boolean}} [opts]
   */
  function apply(next, opts = {}) {
    const { persist: doPersist = true, notify = true, scroll = true } = opts;
    next = !!next;
    if (next === isOpen) return;
    isOpen = next;
    if (isOpen) { mount(); closeSiblings(); }
    syncDom();
    if (shouldPersist && doPersist) writeState(id, isOpen);
    if (notify && onToggle) { try { onToggle(isOpen); } catch (e) { console.error(e); } }
    if (isOpen && scroll && group) keepHeaderVisible();
  }

  /* في الوضع الحصري: إغلاق قسم أعلى يسحب الصفحة، فنُبقي العنوان ظاهراً */
  function keepHeaderVisible() {
    requestAnimationFrame(() => {
      const r = header.getBoundingClientRect();
      if (r.top < 0) {
        header.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    });
  }

  const open = () => apply(true);
  const close = () => apply(false);
  const toggle = () => apply(!isOpen);

  /**
   * فتح + تمرير + وميض (روابط عميقة، تنبيهات، نتائج بحث).
   * @param {{highlight?:boolean, scroll?:boolean}} [opts]
   */
  function reveal(opts = {}) {
    const { highlight = true, scroll = true } = opts;
    apply(true);
    const run = () => {
      if (scroll) node.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      if (highlight && !prefersReducedMotion()) {
        node.classList.remove('collapsible--highlight');
        void node.offsetWidth;            // إعادة تشغيل الحركة
        node.classList.add('collapsible--highlight');
        node.addEventListener('animationend', () => node.classList.remove('collapsible--highlight'), { once: true });
      }
    };
    requestAnimationFrame(run);
  }

  function focus() { header.focus(); }

  /**
   * تغيير معرّف القسم (ينقل الحالة في localStorage + يُحدّث ARIA كاملاً).
   * @param {string} newId
   */
  function setId(newId) {
    const oldId = id;
    id = safeId(newId);
    if (shouldPersist) {
      const s = { ...readState() };
      if (oldId in s) {
        s[id] = s[oldId];
        delete s[oldId];
        persist(s);
      }
    }
    header.id = headerId();
    contentWrap.id = contentId();
    header.setAttribute('aria-controls', contentWrap.id);      // كان ناقصاً في v1
    contentWrap.setAttribute('aria-labelledby', header.id);
    node.setAttribute('data-collapsible-id', id);
  }

  /* --- أحداث: نقر + كيبورد --- */
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', (e) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const parent = node.parentElement;
    if (!parent) return;
    const headers = Array.from(parent.querySelectorAll(':scope > .collapsible > .collapsible__header'));
    const i = headers.indexOf(header);
    if (i === -1 || headers.length < 2) return;
    let target = i;
    if (e.key === 'ArrowDown') target = (i + 1) % headers.length;
    else if (e.key === 'ArrowUp') target = (i - 1 + headers.length) % headers.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = headers.length - 1;
    e.preventDefault();
    headers[target].focus();
  });

  /* واجهة مطابقة لـ <details>.open — قراءة: مفتوح؟ · كتابة: افتح/أغلق (بلا تمرير تلقائي) */
  Object.defineProperty(node, 'open', {
    configurable: true,
    get: () => isOpen,
    set: (v) => apply(!!v, { scroll: false }),
  });

  syncDom();
  if (isOpen) mount();

  const api = {
    node, open, close, toggle, isOpen: () => isOpen, setId,
    setTitle, setSummary, setBadge, reveal, focus,
  };
  registry.set(node, { api, apply });
  return api;
}

/**
 * فتح كل الأقسام داخل حاوية معيّنة (يستدعي onToggle ويبني المحتوى الكسول).
 * @param {HTMLElement} rootEl — الحاوية (يُبحث داخلها عن .collapsible)
 */
export function openAll(rootEl) { setAll(rootEl, true); }

/**
 * إغلاق كل الأقسام داخل حاوية معيّنة.
 * @param {HTMLElement} rootEl
 */
export function closeAll(rootEl) { setAll(rootEl, false); }

function setAll(rootEl, next) {
  if (!rootEl) return;
  const s = { ...readState() };
  let dirty = false;
  rootEl.querySelectorAll('.collapsible').forEach((n) => {
    const entry = registry.get(n);
    if (entry) {
      /* مكوّن حيّ: نمرّ عبر apply (onToggle + inert + كسول) ونؤجّل الحفظ لدفعة واحدة */
      entry.apply(next, { persist: false, scroll: false });
      if (n.getAttribute('data-collapsible-id')) {
        s[n.getAttribute('data-collapsible-id')] = next;
        dirty = true;
      }
    } else {
      /* عقدة قديمة بلا سجل: مسار DOM فقط (توافق رجعي) */
      const cid = n.getAttribute('data-collapsible-id');
      if (cid) { s[cid] = next; dirty = true; }
      n.classList.toggle('collapsible--open', next);
      const h = n.querySelector('.collapsible__header');
      if (h) h.setAttribute('aria-expanded', String(next));
    }
  });
  if (dirty) persist(s);
}

/**
 * كشف قسم بمعرّفه (فتح + تمرير + وميض) — للروابط العميقة.
 * @param {string} id
 * @param {HTMLElement|Document} [root=document]
 * @returns {boolean} هل وُجد القسم؟
 */
export function revealCollapsible(id, root = document) {
  const n = root.querySelector('[data-collapsible-id="' + String(id).replace(/"/g, '') + '"]');
  const entry = n && registry.get(n);
  if (!entry) return false;
  entry.api.reveal();
  return true;
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { STATE_KEY, MAX_STORED, readState, writeState };
