/* ==========================================================================
   universal-search.js — البحث الشامل (Ctrl+K)
   ==========================================================================
   - نافذة منبثقة ببحث موحد في كل الكيانات.
   - تنقل بالكيبورد (↑ ↓ Enter Esc).
   - نتائج مصنّفة + عدّاد.
   - نقرة أو Enter → انتقال للصفحة.
   - V2 كان يفتح modal، V3 يستخدم modal.js الموجود.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { searchAll } from '../data/search.js';
import { debounce } from '../core/utils.js';

/* --- ثوابت --- */
const DEBOUNCE_MS = 250;

/* --- الحالة --- */
let state = {
  query: '',
  results: null,
  flatResults: [],
  selectedIndex: 0,
  isOpen: false,
  _inputEl: null,
  _resultsEl: null,
  _counterEl: null,
};

/* --- خريطة الانتقال (نوع → صفحة + عنوان) --- */
const TYPE_ROUTES = {
  customer:   { page: '#/customers',    label: 'العملاء' },
  order:      { page: '#/orders',       label: 'الطلبات' },
  payment:    { page: '#/payments',     label: 'الدفعات' },
  inventory:  { page: '#/inventory',    label: 'المخزون' },
  worker:     { page: '#/workers',      label: 'العمال' },
  expense:    { page: '#/expenses',     label: 'المصروفات' },
  commitment: { page: '#/commitments',  label: 'الالتزامات' },
  goal:       { page: '#/commitments',  label: 'الأهداف' },
  loan:       { page: '#/loans',        label: 'القروض' },
  referral:   { page: '#/referrals',    label: 'الإحالات' },
  portfolio:  { page: '#/portfolio',    label: 'المعرض' },
};

/* --- أقسام العرض --- */
const SECTIONS = [
  { key: 'customers',   label: 'العملاء',         icon: '👤', type: 'customer' },
  { key: 'orders',      label: 'الطلبات',         icon: '📋', type: 'order' },
  { key: 'payments',    label: 'الدفعات',         icon: '💰', type: 'payment' },
  { key: 'inventory',   label: 'المخزون',         icon: '📦', type: 'inventory' },
  { key: 'workers',     label: 'العمال',          icon: '👷', type: 'worker' },
  { key: 'expenses',    label: 'المصروفات',       icon: '💸', type: 'expense' },
  { key: 'commitments', label: 'الالتزامات',      icon: '💳', type: 'commitment' },
  { key: 'goals',       label: 'أهداف الادخار',   icon: '🏦', type: 'goal' },
  { key: 'loans',       label: 'القروض',          icon: '💵', type: 'loan' },
  { key: 'referrals',   label: 'الإحالات',        icon: '🤝', type: 'referral' },
  { key: 'portfolio',   label: 'معرض الأعمال',    icon: '📸', type: 'portfolio' },
];

/* ==========================================================================
   1. أدوات
   ========================================================================== */

/**
 * تسطيح النتائج في مصفوفة واحدة (للتنقل بالكيبورد).
 * @param {Object} results
 * @returns {Array}
 */
function flattenResults(results) {
  const flat = [];
  SECTIONS.forEach((sec) => {
    (results[sec.key] || []).forEach((item) => {
      flat.push({ ...item, _section: sec.key });
    });
  });
  return flat;
}

/**
 * الانتقال إلى صفحة العنصر.
 * @param {Object} item
 */
function goToItem(item) {
  const route = TYPE_ROUTES[item.type];
  if (!route) return;

  modal.close();
  state.isOpen = false;

  /* تغيير hash → main.js سيستدعي renderPage */
  const target = route.page;
  if (location.hash !== target) {
    location.hash = target;
  } else {
    /* نفس الصفحة — أعد تحميلها */
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

/* ==========================================================================
   2. رسم الواجهة
   ========================================================================== */

/**
 * بناء صف نتيجة.
 * @param {Object} item
 * @param {number} globalIndex
 * @returns {HTMLElement}
 */
function buildResultRow(item, globalIndex) {
  const isSelected = globalIndex === state.selectedIndex;
  const route = TYPE_ROUTES[item.type];

  const row = el('div', {
    className: 'usearch__row' + (isSelected ? ' usearch__row--selected' : ''),
    'data-index': String(globalIndex),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 12px',
      borderRadius: '8px',
      cursor: 'pointer',
      background: isSelected ? 'rgba(31, 109, 87, 0.1)' : 'transparent',
      borderRight: isSelected ? '3px solid #1F6D57' : '3px solid transparent',
      transition: 'background 120ms ease',
    },
    onMouseEnter: () => {
      state.selectedIndex = globalIndex;
      renderResults();
    },
    onClick: () => goToItem(item),
  });

  /* الأيقونة */
  row.appendChild(el('span', {
    style: { fontSize: '20px', lineHeight: '1', flexShrink: '0' },
  }, item.icon || '📄'));

  /* النص */
  row.appendChild(el('div', {
    style: { flex: '1', minWidth: '0' },
  }, [
    el('div', {
      style: {
        fontSize: '14px',
        fontWeight: '500',
        color: '#123C2F',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    }, item.title || '—'),
    item.subtitle ? el('div', {
      style: {
        fontSize: '11px',
        color: '#666',
        marginTop: '2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    }, item.subtitle) : null,
  ]));

  /* نوع + شارة */
  row.appendChild(el('div', {
    style: { flexShrink: '0', textAlign: 'left' },
  }, [
    item.status ? el('span', {
      style: {
        fontSize: '10px',
        padding: '2px 8px',
        borderRadius: '10px',
        background: item.status.color + '20',
        color: item.status.color,
        fontWeight: '600',
      },
    }, item.status.label) : null,
    !item.status && route ? el('span', {
      style: { fontSize: '10px', color: '#999' },
    }, route.label) : null,
  ]));

  return row;
}

/**
 * إعادة رسم قائمة النتائج.
 */
function renderResults() {
  const c = state._resultsEl;
  if (!c) return;
  while (c.firstChild) c.removeChild(c.firstChild);

  if (!state.query || state.query.trim().length < 2) {
    c.appendChild(el('div', {
      style: {
        textAlign: 'center',
        padding: '40px 20px',
        color: '#999',
        fontSize: '13px',
      },
    }, 'اكتب حرفين على الأقل للبحث...'));
    if (state._counterEl) state._counterEl.textContent = '';
    return;
  }

  if (!state.results || state.results.totalCount === 0) {
    c.appendChild(el('div', {
      style: {
        textAlign: 'center',
        padding: '40px 20px',
        color: '#999',
        fontSize: '13px',
      },
    }, 'لا توجد نتائج لـ "' + state.query + '"'));
    if (state._counterEl) state._counterEl.textContent = '0';
    return;
  }

  /* إجمالي */
  if (state._counterEl) {
    state._counterEl.textContent = state.results.totalCount + ' نتيجة';
  }

  /* الأقسام */
  let globalIndex = 0;
  SECTIONS.forEach((sec) => {
    const items = state.results[sec.key] || [];
    if (items.length === 0) return;

    /* عنوان القسم */
    c.appendChild(el('div', {
      style: {
        fontSize: '11px',
        fontWeight: '700',
        color: '#1F6D57',
        padding: '12px 12px 6px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      },
    }, sec.icon + ' ' + sec.label + ' (' + items.length + ')'));

    /* الصفوف */
    items.forEach((item) => {
      c.appendChild(buildResultRow(item, globalIndex));
      globalIndex++;
    });
  });
}

/**
 * تحديث التحديد بعد التنقل بالكيبورد.
 */
function updateSelection() {
  renderResults();
  /* scroll into view */
  const el_ = state._resultsEl?.querySelector('[data-index="' + state.selectedIndex + '"]');
  if (el_ && typeof el_.scrollIntoView === 'function') {
    el_.scrollIntoView({ block: 'nearest' });
  }
}

/* ==========================================================================
   3. البحث
   ========================================================================== */

const runSearch = debounce(async () => {
  const q = state.query.trim();
  if (q.length < 2) {
    state.results = null;
    state.flatResults = [];
    state.selectedIndex = 0;
    renderResults();
    return;
  }

  try {
    const results = await searchAll(q);
    /* قد تتغيّر الحالة أثناء الانتظار */
    if (state.query.trim() !== q) return;

    state.results = results;
    state.flatResults = flattenResults(results);
    state.selectedIndex = 0;
    renderResults();
  } catch (e) {
    console.error('[universal-search] search failed:', e);
  }
}, DEBOUNCE_MS);

/* ==========================================================================
   4. Keyboard Handler
   ========================================================================== */

/**
 * معالجة مفاتيح الكيبورد داخل البحث.
 * @param {KeyboardEvent} e
 */
function handleKeydown(e) {
  if (!state.isOpen) return;

  const len = state.flatResults.length;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (len > 0) {
      state.selectedIndex = (state.selectedIndex + 1) % len;
      updateSelection();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (len > 0) {
      state.selectedIndex = (state.selectedIndex - 1 + len) % len;
      updateSelection();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = state.flatResults[state.selectedIndex];
    if (item) goToItem(item);
  } else if (e.key === 'Escape') {
    modal.close();
    state.isOpen = false;
  }
}

/* ==========================================================================
   5. API العام
   ========================================================================== */

/**
 * فتح نافذة البحث الشامل.
 */
export function openUniversalSearch() {
  if (state.isOpen) return;
  state.isOpen = true;
  state.query = '';
  state.results = null;
  state.flatResults = [];
  state.selectedIndex = 0;

  /* حقل البحث */
  const input = el('input', {
    type: 'text',
    placeholder: '🔍 ابحث عن عميل، طلب، دفعة، صنف... (حرفان على الأقل)',
    autocomplete: 'off',
    style: {
      width: '100%',
      padding: '14px 16px',
      fontSize: '16px',
      fontFamily: 'inherit',
      border: 'none',
      borderBottom: '2px solid #E5DDD0',
      outline: 'none',
      background: 'transparent',
      color: '#123C2F',
    },
  });

  input.addEventListener('input', () => {
    state.query = input.value;
    state.selectedIndex = 0;
    runSearch();
  });

  input.addEventListener('keydown', handleKeydown);

  state._inputEl = input;

  /* العدّاد */
  const counter = el('span', {
    style: {
      fontSize: '11px',
      color: '#666',
      padding: '0 16px',
    },
  });
  state._counterEl = counter;

  /* نتائج */
  const results = el('div', {
    style: {
      maxHeight: '60vh',
      overflowY: 'auto',
      padding: '8px',
    },
  });
  state._resultsEl = results;

  /* التخطيط */
  const wrap = el('div', {}, [
    input,
    el('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #F0EAE0',
      },
    }, [
      el('span', {
        style: { fontSize: '11px', color: '#999', padding: '8px 16px' },
      }, '↑↓ للتنقل · Enter للفتح · Esc للإغلاق'),
      counter,
    ]),
    results,
  ]);

  modal.open({
    title: '🔍 بحث شامل',
    body: wrap,
    closable: true,
    variant: 'sheet',
    onClose: () => {
      state.isOpen = false;
      state._inputEl = null;
      state._resultsEl = null;
      state._counterEl = null;
    },
  });

  /* تركيز تلقائي */
  setTimeout(() => {
    try { input.focus(); } catch (e) { /* ignore */ }
  }, 100);

  /* رسم أولي */
  renderResults();
}

/* ==========================================================================
   6. تصدير داخلي للاختبار
   ========================================================================== */

export const _internal = {
  flattenResults,
  getState: () => state,
};
