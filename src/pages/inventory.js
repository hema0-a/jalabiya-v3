/* ==========================================================================
   inventory.js — صفحة المخزون (CRUD + 7 فئات + سعر + حد أدنى + معاينة)
   ==========================================================================
   - 7 فئات: قماش، خيوط، إكسسوارات، أزرار، أدوات، صباغة، أخرى.
   - كل صنف: name, category, quantity, minQuantity, price, unit, notes.
   - إحصائيات: عدد + قيمة المخزون + نواقص.
   - Quick Preview.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { inventory } from '../data/repos/inventory.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewInventory } from '../ui/quick-preview.js';
import { formatEGP } from '../core/utils.js';

/* --- الفئات (7) --- */
const CATEGORIES = [
  { id: 'fabric',    label: 'قماش',        icon: '🧵' },
  { id: 'thread',    label: 'خيوط',        icon: '🪡' },
  { id: 'accessory', label: 'إكسسوارات',   icon: '✨' },
  { id: 'button',    label: 'أزرار',       icon: '🔘' },
  { id: 'tool',      label: 'أدوات',       icon: '🛠️' },
  { id: 'dye',       label: 'صباغة',       icon: '🎨' },
  { id: 'other',     label: 'أخرى',        icon: '📦' },
];

const CATEGORY_MAP = {};
CATEGORIES.forEach((c) => { CATEGORY_MAP[c.id] = c; });

/* --- الحالة --- */
let state = {
  items: [],
  activeCategory: 'all',
  searchQuery: '',
  container: null,
  stats: null,
};

/* ==========================================================================
   1. الفلترة (مُصدَّرة للاختبار)
   ========================================================================== */

/**
 * فلترة حسب الفئة.
 * @param {Array} list
 * @param {string} category — 'all' أو id فئة
 * @returns {Array}
 */
export function filterInventory(list, category) {
  if (category === 'all') return list;
  return list.filter((i) => i.category === category);
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [list, stats] = await Promise.all([
    inventory.list(),
    inventory.getStats(),
  ]);
  list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  state.items = list;
  state.stats = stats;
}

/* ==========================================================================
   3. النموذج
   ========================================================================== */

function openItemForm(existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم الصنف',
    value: isEdit ? (existing.name || '') : '',
  });

  const categorySelect = el('select', { className: 'select' });
  CATEGORIES.forEach((c) => {
    const o = el('option', { value: c.id }, c.icon + ' ' + c.label);
    if (isEdit ? existing.category === c.id : c.id === 'fabric') o.selected = true;
    categorySelect.appendChild(o);
  });

  const qtyInput = el('input', {
    className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.5',
    value: isEdit ? (existing.quantity || '') : '',
  });

  const minQtyInput = el('input', {
    className: 'input', type: 'number', placeholder: '5 (افتراضي)', min: '0', step: '0.5',
    value: isEdit ? (existing.minQuantity || '') : '',
  });

  const priceInput = el('input', {
    className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01',
    value: isEdit ? (existing.price || '') : '',
  });

  const unitInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: متر، كيلو، قطعة',
    value: isEdit ? (existing.unit || '') : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الفئة'), categorySelect]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الكمية'), qtyInput]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الحد الأدنى'), minQtyInput]),
    ]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'سعر الوحدة (ج.م)'), priceInput]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الوحدة'), unitInput]),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل صنف' : 'إضافة صنف',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = {
            name,
            category: categorySelect.value,
            quantity: Number(qtyInput.value) || 0,
            minQuantity: Number(minQtyInput.value) || 0,
            price: Number(priceInput.value) || 0,
            unit: unitInput.value.trim(),
            notes: notesInput.value.trim(),
          };
          try {
            if (isEdit) { await inventory.update(existing.id, data); toast.success('تم التحديث'); }
            else { await inventory.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. عمليات
   ========================================================================== */

async function deleteItem(item) {
  const ok = await modal.confirm({
    title: 'حذف صنف',
    message: 'حذف "' + item.name + '" من المخزون؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('inventory', item);
    await inventory.remove(item.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

async function adjustStock(item, delta) {
  try {
    await inventory.adjustStock(item.id, delta);
    toast.info((delta > 0 ? '+' : '') + delta + ' ' + item.name);
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

/* ==========================================================================
   5. بطاقة صنف
   ========================================================================== */

function buildItemCard(item) {
  const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
  const threshold = Number(item.minQuantity) > 0 ? Number(item.minQuantity) : 5;
  const isLow = Number(item.quantity) < threshold;

  const card = el('div', {
    className: 'card',
    style: {
      marginBottom: '8px',
      cursor: 'pointer',
      borderRight: '4px solid ' + (isLow ? '#C62828' : '#1F6D57'),
      padding: '10px 12px',
    },
    'data-id': item.id,
    onClick: () => previewInventory(item, () => openItemForm(item)),
  });

  /* الرأس */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        cat.icon + ' ' + item.name),
      el('div', { style: { fontSize: '12px', color: '#2E8B6F', marginTop: '2px' } },
        cat.label + (item.unit ? ' · ' + item.unit : '')),
    ]),
    el('div', {
      style: {
        padding: '4px 12px',
        borderRadius: '12px',
        background: isLow ? '#FFEBEE' : '#E8F5E9',
        color: isLow ? '#C62828' : '#2E7D32',
        fontWeight: '700',
        fontSize: '14px',
      },
    }, String(item.quantity)),
  ]));

  /* الأسعار */
  if (item.price > 0 || item.minQuantity > 0) {
    card.appendChild(el('div', {
      style: { display: 'flex', gap: '12px', fontSize: '11px', color: '#666', marginBottom: '8px', flexWrap: 'wrap' },
    }, [
      item.price > 0 ? el('span', {}, '💰 ' + formatEGP(item.price) + ' / وحدة') : null,
      item.price > 0 && item.quantity > 0
        ? el('span', { style: { fontWeight: '600', color: '#B8863B' } },
            '📊 القيمة: ' + formatEGP(item.price * item.quantity))
        : null,
      item.minQuantity > 0 ? el('span', {}, '📉 الحد: ' + item.minQuantity) : null,
      isLow ? el('span', { style: { color: '#C62828', fontWeight: '600' } }, '⚠️ نقص') : null,
    ].filter(Boolean)));
  }

  if (item.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, item.notes));
  }

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => adjustStock(item, 1),
    }, '+1'),
    el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => adjustStock(item, -1),
    }, '-1'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openItemForm(item),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteItem(item),
    }, '🗑️'),
  ]));

  return card;
}

/* ==========================================================================
   6. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#inventory-stats');
  if (!wrap) return;
  clear(wrap);

  const s = state.stats;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📦'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, String(s.count)),
    el('span', { className: 'stat__label' }, 'أصناف'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#B8863B' } },
      formatEGP(s.totalValue)),
    el('span', { className: 'stat__label' }, 'قيمة المخزون'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⚠️'),
    el('span', {
      className: 'stat__value',
      style: { fontSize: '18px', color: s.lowCount > 0 ? '#C62828' : '#666' },
    }, String(s.lowCount)),
    el('span', { className: 'stat__label' }, 'نواقص'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#inventory-filters');
  if (!wrap) return;
  clear(wrap);

  const all = [{ id: 'all', label: 'الكل', icon: '📁' }, ...CATEGORIES];
  all.forEach((c) => {
    const isActive = state.activeCategory === c.id;
    wrap.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': c.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeCategory = c.id;
        renderFilters();
        renderList();
      },
    }, c.icon + ' ' + c.label));
  });
}

function applyFilters() {
  let list = state.items;
  if (state.activeCategory !== 'all') {
    list = list.filter((i) => (i.category || 'other') === state.activeCategory);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((i) =>
      String(i.name || '').toLowerCase().includes(q) ||
      String(i.notes || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderList() {
  const lc = state.container?.querySelector('#inventory-list');
  if (!lc) return;
  clear(lc);

  const filtered = applyFilters();

  if (filtered.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '🧵'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا يوجد أصناف'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة صنف" للبدء'),
    ]));
    return;
  }

  filtered.forEach((i) => lc.appendChild(buildItemCard(i)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderFilters();
  renderList();
}

/* ==========================================================================
   7. API
   ========================================================================== */

export const inventoryPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeCategory = 'all';
    state.searchQuery = '';

    container.appendChild(el('div', {
      id: 'inventory-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openItemForm(),
    }, '➕ إضافة صنف'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الملاحظات...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    container.appendChild(el('div', {
      id: 'inventory-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'inventory-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      items: [], activeCategory: 'all', searchQuery: '',
      container: null, stats: null,
    };
  },
};
