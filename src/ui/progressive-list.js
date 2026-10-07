/* ==========================================================================
   progressive-list.js — عرض تدريجي (Lazy / Load More)
   ==========================================================================
   - يعرض أول N عنصر، ثم "تحميل المزيد" عند التمرير أو الضغط.
   - يستخدم IntersectionObserver (أداء أفضل من scroll listener).
   - يدعم:
     · render(item, index) → HTMLElement
     · emptyState() → HTMLElement (اختياري)
   - Static imports فقط.
   ========================================================================== */

import { el, clear } from '../core/dom.js';

/* --- الحدود الافتراضية --- */
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_ROOT_MARGIN = '200px';

/**
 * إنشاء قائمة تدريجية.
 *
 * @param {Object} options
 * @param {Array} options.items — كل العناصر
 * @param {Function} options.render — (item, index) => HTMLElement
 * @param {number} [options.pageSize=20] — عدد العناصر في كل دفعة
 * @param {string} [options.rootMargin='200px'] — مسافة التحميل المسبق
 * @param {Function} [options.emptyState] — () => HTMLElement (يُستدعى إن فارغة)
 * @param {string} [options.loadingText='جاري التحميل...'] — نص أثناء التحميل
 * @param {string} [options.endText='لا توجد عناصر أخرى'] — نص عند الانتهاء
 * @returns {{
 *   node:HTMLElement,
 *   setItems:Function,
 *   refresh:Function,
 *   destroy:Function,
 *   getRenderedCount:Function
 * }}
 */
export function createProgressiveList(options = {}) {
  const {
    items = [],
    render,
    pageSize = DEFAULT_PAGE_SIZE,
    rootMargin = DEFAULT_ROOT_MARGIN,
    emptyState = null,
    loadingText = 'جاري التحميل...',
    endText = 'لا توجد عناصر أخرى',
  } = options;

  if (typeof render !== 'function') {
    throw new TypeError('[progressive-list] render function is required');
  }

  /* --- الحالة الداخلية --- */
  let allItems = Array.isArray(items) ? [...items] : [];
  let renderedCount = 0;
  let isLoading = false;
  let isDone = false;
  let observer = null;

  /* --- المكونات --- */
  const listEl = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '0' },
  });

  const footerEl = el('div', {
    style: {
      padding: '16px', textAlign: 'center',
      fontSize: '12px', color: '#999',
    },
  });

  const sentinelEl = el('div', {
    style: { height: '1px', width: '100%' },
  });

  const loadMoreBtn = el('button', {
    className: 'btn btn--secondary btn--sm',
    type: 'button',
    style: { display: 'none' },
    onClick: () => loadNextBatch(),
  }, '⬇️ تحميل المزيد');

  const footer = el('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '8px', padding: '12px 0',
    },
  }, [loadMoreBtn]);

  const node = el('div', {}, [listEl, footer, sentinelEl]);

  /* ==========================================================
     Render batch
     ========================================================== */

  /**
   * رسم دفعة جديدة.
   */
  function loadNextBatch() {
    if (isLoading || isDone) return;
    isLoading = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = loadingText;

    const start = renderedCount;
    const end = Math.min(start + pageSize, allItems.length);
    const slice = allItems.slice(start, end);

    /* رسم كل عنصر */
    slice.forEach((item, i) => {
      try {
        const nodeItem = render(item, start + i);
        if (nodeItem) listEl.appendChild(nodeItem);
      } catch (e) {
        console.error('[progressive-list] render failed:', e);
      }
    });

    renderedCount = end;
    isLoading = false;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = '⬇️ تحميل المزيد';

    /* تحديث حالة Footer */
    updateFooter();
  }

  /**
   * تحديث الـ footer (زر / نهاية).
   */
  function updateFooter() {
    if (renderedCount >= allItems.length) {
      isDone = true;
      loadMoreBtn.style.display = 'none';
      /* إظهار نص النهاية فقط إن كان هناك عناصر */
      if (allItems.length > pageSize) {
        clear(footerEl);
        footerEl.textContent = endText;
        footerEl.style.display = '';
      } else {
        footerEl.style.display = 'none';
      }
      /* فصل الـ observer */
      if (observer) { observer.disconnect(); observer = null; }
    } else {
      isDone = false;
      loadMoreBtn.style.display = '';
      footerEl.style.display = 'none';
    }
  }

  /**
   * إعادة الرسم من الصفر.
   */
  function refresh() {
    clear(listEl);
    clear(footerEl);
    renderedCount = 0;
    isDone = false;
    isLoading = false;
    loadMoreBtn.style.display = 'none';
    footerEl.style.display = 'none';

    /* حالة الفراغ */
    if (allItems.length === 0) {
      if (typeof emptyState === 'function') {
        try { listEl.appendChild(emptyState()); } catch (e) { console.error(e); }
      }
      if (observer) { observer.disconnect(); observer = null; }
      return;
    }

    /* الدفعة الأولى */
    loadNextBatch();

    /* ربط المراقب إن لزم */
    if (observer) { observer.disconnect(); }
    if (typeof IntersectionObserver !== 'undefined' && !isDone) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoading && !isDone) {
            loadNextBatch();
          }
        });
      }, { rootMargin, threshold: 0 });
      observer.observe(sentinelEl);
    }
  }

  /**
   * تحديث العناصر (مع الحفاظ على موضع التمرير قدر الإمكان).
   * @param {Array} newItems
   */
  function setItems(newItems) {
    allItems = Array.isArray(newItems) ? [...newItems] : [];
    refresh();
  }

  /* --- التهيئة الأولى --- */
  refresh();

  return {
    node,
    setItems,
    refresh,
    destroy() {
      if (observer) { observer.disconnect(); observer = null; }
      clear(listEl);
      clear(footerEl);
      allItems = [];
      renderedCount = 0;
    },
    getRenderedCount: () => renderedCount,
  };
}
