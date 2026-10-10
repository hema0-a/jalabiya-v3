/* ==========================================================================
   house-expenses.js — صفحة مصاريف البيت
   ==========================================================================
   - 4 بطاقات إحصائية + مقارنة شهرية.
   - فلترة بالفترة (3) + بحث + 10 تصنيفات.
   - CRUD كامل + تصدير CSV + طباعة.
   - Service Worker معطَّل → لا Cache issues.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { houseExpenses } from '../data/repos/house-expenses.js';
import { exportCSV, printReport, buildCategoryBars } from '../services/house-expenses-export.js';
import {
  HOUSE_EXPENSE_CATEGORIES,
  HOUSE_EXPENSE_CATEGORY_COLORS,
  LIMITS,
} from '../core/config.js';
import { formatEGP, formatDate, localDateInput, parseDateInput } from '../core/utils.js';

/* --- الحالة --- */
let state = {
  container: null,
  period: 'month',
  activeCategory: 'all',
  searchQuery: '',
  stats: null,
  categoryStats: [],
  monthComparison: null,
};

const CAT_MAP = {};
HOUSE_EXPENSE_CATEGORIES.forEach((c) => { CAT_MAP[c.id] = c; });

/* ==========================================================================
   1. أدوات
   ========================================================================== */

function getCategoryLabel(catId) {
  const cat = CAT_MAP[catId];
  return cat ? cat.label : 'أخرى';
}

function getCategoryIcon(catId) {
  const cat = CAT_MAP[catId];
  return cat ? cat.icon : '📌';
}

function getCategoryColor(catId) {
  return HOUSE_EXPENSE_CATEGORY_COLORS[catId] || '#95A5A6';
}

function safeDiv(a, b, fallback = 0) {
  const n = Number(b);
  if (!isFinite(n) || n === 0) return fallback;
  return (Number(a) || 0) / n;
}

/* ==========================================================================
   2. المتوسط اليومي
   ========================================================================== */

function getDaysInPeriod(period, filtered) {
  const now = new Date();
  if (period === 'month') return now.getDate();
  if (period === 'year') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    return Math.floor((now - startOfYear) / 86400000) + 1;
  }
  if (filtered.length === 0) return 1;
  const dates = filtered.map((e) => e.date).filter(Boolean).sort();
  if (dates.length === 0) return 1;
  const first = new Date(dates[0]).setHours(0, 0, 0, 0);
  const last = new Date(dates[dates.length - 1]).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((last - first) / 86400000) + 1);
}

/* ==========================================================================
   3. المقارنة الشهرية
   ========================================================================== */

function getMonthlyComparison(allExpenses) {
  const now = new Date();
  const thisM = now.getMonth();
  const thisY = now.getFullYear();
  const lastM = thisM === 0 ? 11 : thisM - 1;
  const lastY = thisM === 0 ? thisY - 1 : thisY;

  const thisTotal = allExpenses
    .filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getMonth() === thisM && d.getFullYear() === thisY;
    })
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const lastTotal = allExpenses
    .filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getMonth() === lastM && d.getFullYear() === lastY;
    })
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const changePercent = lastTotal > 0
    ? Math.round(((thisTotal - lastTotal) / lastTotal) * 100)
    : 0;

  return { thisTotal, lastTotal, changePercent };
}

/* ==========================================================================
   4. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [stats, categoryStats, allList] = await Promise.all([
    houseExpenses.getStats(state.period),
    houseExpenses.getCategoryStats(state.period),
    houseExpenses.list(),
  ]);
  state.stats = stats;
  state.categoryStats = categoryStats;
  state.monthComparison = getMonthlyComparison(allList);
}

/* ==========================================================================
   5. الفلتر
   ========================================================================== */

function renderPeriodFilter() {
  const wrap = el('div', {
    role: 'tablist',
    'aria-label': 'فترة التقرير',
    style: { display: 'flex', gap: '4px', marginBottom: '12px' },
  });
  const items = [
    { id: 'month', label: '📅 هذا الشهر' },
    { id: 'year',  label: '🗓️ هذا العام' },
    { id: 'all',   label: '📊 الكل' },
  ];
  items.forEach((it) => {
    const active = state.period === it.id;
    wrap.appendChild(el('button', {
      type: 'button', role: 'tab',
      'aria-selected': String(active),
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => { state.period = it.id; refreshAll(); },
    }, it.label));
  });
  return wrap;
}

/* ==========================================================================
   6. بطاقات الإحصائية
   ========================================================================== */

function renderStats() {
  const s = state.stats;
  const days = getDaysInPeriod(state.period, s.filtered);
  const avgDaily = days > 0 ? s.total / days : 0;

  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' },
  });

  /* هذا الشهر + مقارنة */
  const thisMonthCard = el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value', style: { fontSize: '14px' } }, formatEGP(s.total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]);
  if (state.period === 'month' && state.monthComparison) {
    const mc = state.monthComparison;
    if (mc.lastTotal > 0 && mc.changePercent !== 0) {
      const up = mc.changePercent > 0;
      thisMonthCard.appendChild(el('div', {
        style: {
          fontSize: '10px', fontWeight: '600',
          color: up ? '#C62828' : '#2E7D32',
          marginTop: '2px',
        },
      }, (up ? '▲ +' : '▼ ') + mc.changePercent + '% من الشهر الماضي'));
    }
  }
  grid.appendChild(thisMonthCard);

  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📊'),
    el('span', { className: 'stat__value', style: { fontSize: '14px' } }, String(s.count)),
    el('span', { className: 'stat__label' }, 'عدد'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💸'),
    el('span', { className: 'stat__value', style: { fontSize: '14px' } }, formatEGP(s.avg)),
    el('span', { className: 'stat__label' }, 'متوسط'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value', style: { fontSize: '14px' } }, formatEGP(avgDaily)),
    el('span', { className: 'stat__label' }, 'يومي'),
  ]));

  return grid;
}

/* ==========================================================================
   7. نموذج إضافة/تعديل
   ========================================================================== */

function openExpenseForm(existing = null) {
  const isEdit = existing !== null;

  const catSelect = el('select', { className: 'select' });
  HOUSE_EXPENSE_CATEGORIES.forEach((c) => {
    const o = el('option', { value: c.id }, c.icon + ' ' + c.label);
    if (isEdit ? existing.category === c.id : c.id === 'food') o.selected = true;
    catSelect.appendChild(o);
  });

  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.amount || '') : '',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = isEdit && existing.date
    ? localDateInput(existing.date)
    : localDateInput();

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) noteInput.value = existing.note || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التصنيف *'), catSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ *'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const actions = [
    { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
    {
      text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
      onClick: async () => {
        const amount = Number(amountInput.value);
        if (!amount || !Number.isFinite(amount) || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
        if (!dateInput.value) return toast.warning('التاريخ مطلوب');
        const data = {
          category: catSelect.value,
          amount,
          date: parseDateInput(dateInput.value),
          note: noteInput.value.trim(),
        };
        try {
          if (isEdit) { await houseExpenses.update(existing.id, data); toast.success('تم التحديث'); }
          else { await houseExpenses.create(data); toast.success('تمت الإضافة'); }
          handle.close();
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    },
  ];

  if (isEdit) {
    actions.splice(1, 0, {
      text: '🗑️ حذف', variant: 'danger', action: 'delete',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف مصروف',
          message: 'حذف هذا المصروف؟',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          await houseExpenses.remove(existing.id);
          toast.success('تم الحذف');
          handle.close();
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    });
  }

  const handle = modal.open({
    title: isEdit ? 'تعديل مصروف' : 'إضافة مصروف',
    body,
    actions,
  });
}

/* ==========================================================================
   8. قائمة المصاريف
   ========================================================================== */

function renderFilters() {
  const wrap = state.container?.querySelector('#he-filters');
  if (!wrap) return;
  clear(wrap);

  const all = [{ id: 'all', label: 'الكل', icon: '📁' }, ...HOUSE_EXPENSE_CATEGORIES];
  all.forEach((c) => {
    const active = state.activeCategory === c.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => { state.activeCategory = c.id; renderList(); },
    }, c.icon + ' ' + c.label));
  });
}

function applyFilters() {
  let list = state.stats ? state.stats.filtered : [];
  if (state.activeCategory !== 'all') {
    list = list.filter((e) => (e.category || 'other') === state.activeCategory);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const note = String(e.note || '').toLowerCase();
      const label = getCategoryLabel(e.category).toLowerCase();
      return note.includes(q) || label.includes(q);
    });
  }
  return list;
}

function renderList() {
  const wrap = state.container?.querySelector('#he-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters();

  if (list.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🏠'),
      el('h2', { className: 'empty-state__title' }, state.searchQuery ? 'لا نتائج' : 'لا توجد مصاريف'),
      el('p', { className: 'empty-state__text' }, state.searchQuery ? 'جرّب كلمة أخرى' : 'اضغط "إضافة مصروف" للبدء'),
    ]));
    return;
  }

  list.forEach((e) => {
    const color = getCategoryColor(e.category);
    const card = el('div', {
      className: 'card',
      style: {
        marginBottom: '8px',
        borderRight: '4px solid ' + color,
        padding: '10px 12px',
        cursor: 'pointer',
      },
      'data-id': e.id,
      onClick: () => openExpenseForm(e),
    });

    card.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
    }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '14px' } },
          getCategoryIcon(e.category) + ' ' + getCategoryLabel(e.category)),
        el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
          '📅 ' + formatDate(e.date) + (e.note ? ' · 📝 ' + e.note : '')),
      ]),
      el('div', { style: { fontWeight: '700', color: '#123C2F', fontSize: '15px' } },
        formatEGP(e.amount)),
    ]));

    wrap.appendChild(card);
  });
}

/* ==========================================================================
   9. إحصائيات قليلة
   ========================================================================== */

function renderLowDataNotice() {
  if (!state.stats) return null;
  const count = state.stats.count;
  if (count === 0 || count >= LIMITS.lowDataThreshold) return null;
  return el('div', {
    style: {
      background: '#FFF3E0', color: '#E65100', padding: '8px 10px',
      borderRadius: '8px', marginBottom: '12px', fontSize: '12px',
    },
  }, 'ℹ️ البيانات قليلة — النتائج تقريبية.');
}

/* ==========================================================================
   10. الصفحة الرئيسية
   ========================================================================== */

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  /* Header */
  c.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '🏠 مصاريف البيت'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'تتبع مصاريف المنزل'),
  ]));

  /* زر إضافة */
  c.appendChild(el('button', {
    className: 'btn btn--primary btn--block', type: 'button',
    style: { marginBottom: '12px' },
    onClick: () => openExpenseForm(),
  }, '➕ إضافة مصروف'));

  /* فلتر الفترة */
  c.appendChild(renderPeriodFilter());

  /* Empty state عام */
  if (!state.stats || state.stats.count === 0) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🏠'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مصاريف'),
      el('p', { className: 'empty-state__text' }, 'ابدأ بإضافة أول مصروف'),
    ]));
    return;
  }

  /* إحصائيات */
  c.appendChild(renderStats());

  /* تنبيه بيانات قليلة */
  const notice = renderLowDataNotice();
  if (notice) c.appendChild(notice);

  /* شرائط الفئات */
  const bars = buildCategoryBars(state.categoryStats);
  bars.classList.add('no-print');
  c.appendChild(bars);

  /* البحث */
  const searchInput = el('input', {
    className: 'input', type: 'search',
    placeholder: '🔍 ابحث...',
    style: { marginBottom: '8px' },
  });
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    renderList();
  });
  c.appendChild(searchInput);

  /* الفلاتر */
  c.appendChild(el('div', {
    id: 'he-filters',
    style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
  }));
  renderFilters();

  /* قائمة */
  c.appendChild(el('div', { id: 'he-list' }));
  renderList();

  /* تصدير */
  c.appendChild(el('div', {
    className: 'no-print',
    style: { display: 'flex', gap: '6px', marginTop: '12px' },
  }, [
    el('button', {
      className: 'btn btn--primary btn--sm', type: 'button',
      style: { flex: '1' },
      onClick: () => {
        try {
          exportCSV(state.period, applyFilters(), state.stats.total);
          toast.success('تم التصدير');
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '📊 CSV'),
    el('button', {
      className: 'btn btn--secondary btn--sm', type: 'button',
      style: { flex: '1' },
      onClick: () => printReport(state.container),
    }, '📄 طباعة'),
  ]));
}

/* ==========================================================================
   11. تحديث
   ========================================================================== */

async function refreshAll() {
  try {
    await loadData();
    renderPage();
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   12. API
   ========================================================================== */

export const houseExpensesPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.period = 'month';
    state.activeCategory = 'all';
    state.searchQuery = '';
    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      period: 'month',
      activeCategory: 'all',
      searchQuery: '',
      stats: null,
      categoryStats: [],
      monthComparison: null,
    };
  },
};
