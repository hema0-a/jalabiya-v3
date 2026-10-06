/* ==========================================================================
   inventory.js — صفحة المخزون (CRUD + معاينة سريعة)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { inventory } from '../data/repos/inventory.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewInventory } from '../ui/quick-preview.js';

let state = { items: [], activeCategory: 'all', container: null };

export function filterInventory(list, category) {
  if (category === 'all') return list;
  return list.filter((i) => i.category === category);
}

async function loadData() {
  const list = await inventory.list();
  list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  state.items = list;
}

function openItemForm(existing = null) {
  const isEdit = existing !== null;
  const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'اسم الصنف' });
  if (isEdit) nameInput.value = existing.name || '';

  const categorySelect = el('select', { className: 'select' });
  [['fabric', 'قماش'], ['thread', 'خيوط'], ['accessory', 'إكسسوارات'], ['tool', 'أدوات'], ['other', 'أخرى']].forEach(([v, l]) => {
    categorySelect.appendChild(el('option', { value: v }, l));
  });
  if (isEdit) categorySelect.value = existing.category || 'fabric';

  const qtyInput = el('input', { className: 'input', type: 'number', placeholder: '0', min: '0' });
  if (isEdit && existing.quantity != null) qtyInput.value = String(existing.quantity);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الفئة'), categorySelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الكمية'), qtyInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل صنف' : 'إضافة صنف',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary',
        action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = {
            name,
            category: categorySelect.value,
            quantity: Number(qtyInput.value) || 0,
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

async function deleteItem(item) {
  const ok = await modal.confirm({
    title: 'حذف صنف',
    message: 'حذف "' + item.name + '" من المخزون؟',
    confirmText: 'حذف',
    cancelText: 'إلغاء',
    danger: true,
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

function buildItemCard(item) {
  const categories = { fabric: 'قماش', thread: 'خيوط', accessory: 'إكسسوارات', tool: 'أدوات', other: 'أخرى' };
  const isLow = Number(item.quantity) < 5;

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': item.id,
    onClick: () => previewInventory(item, () => openItemForm(item)),
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, item.name),
        el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, categories[item.category] || ''),
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
    ]),
    el('div', {
      style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
      onClick: (e) => e.stopPropagation(),
    }, [
      el('button', { className: 'btn btn--sm btn--ghost', onClick: () => adjustStock(item, 1) }, '+1'),
      el('button', { className: 'btn btn--sm btn--ghost', onClick: () => adjustStock(item, -1) }, '-1'),
      el('button', { className: 'btn btn--sm btn--secondary', onClick: () => openItemForm(item) }, '✏️'),
      el('button', { className: 'btn btn--sm btn--danger', onClick: () => deleteItem(item) }, '🗑️'),
    ]),
  ]);

  return card;
}

function renderStats() {
  const wrap = state.container?.querySelector('#inventory-stats');
  if (!wrap) return;
  clear(wrap);
  const total = state.items.length;
  const low = state.items.filter((i) => Number(i.quantity) < 5).length;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🧵'),
    el('span', { className: 'stat__value' }, String(total)),
    el('span', { className: 'stat__label' }, 'أصناف'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⚠️'),
    el('span', { className: 'stat__value' }, String(low)),
    el('span', { className: 'stat__label' }, 'نقص مخزون'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#inventory-filters');
  if (!wrap) return;
  clear(wrap);
  const cats = [
    { id: 'all', label: 'الكل' },
    { id: 'fabric', label: 'قماش' },
    { id: 'thread', label: 'خيوط' },
    { id: 'accessory', label: 'إكسسوارات' },
    { id: 'tool', label: 'أدوات' },
    { id: 'other', label: 'أخرى' },
  ];
  cats.forEach((c) => {
    const isActive = state.activeCategory === c.id;
    wrap.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': c.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => { state.activeCategory = c.id; renderFilters(); renderList(); },
    }, c.label));
  });
}

function renderList() {
  const lc = state.container?.querySelector('#inventory-list');
  if (!lc) return;
  clear(lc);
  const filtered = filterInventory(state.items, state.activeCategory);
  if (filtered.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🧵'),
      el('h2', { className: 'empty-state__title' }, 'لا يوجد أصناف'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة صنف" للبدء'),
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

export const inventoryPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeCategory = 'all';
    container.appendChild(el('div', {
      id: 'inventory-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openItemForm(),
    }, '➕ إضافة صنف'));
    container.appendChild(el('div', {
      id: 'inventory-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));
    container.appendChild(el('div', { id: 'inventory-list' }));
    await refreshAll();
  },
  destroy() { state = { items: [], activeCategory: 'all', container: null }; },
};
