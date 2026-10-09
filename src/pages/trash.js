/* ==========================================================================
   trash.js — صفحة سلة المحذوفات
   ==========================================================================
   - بطاقات إحصائية (إجمالي / متبقية بحسب الحد).
   - تنبيه بحذف تلقائي بعد 7 أيام.
   - فلترة بالمخزن الأصلي + بحث.
   - استرجاع + حذف نهائي + مسح الكل.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { trash } from '../data/repos/trash.js';
import { LIMITS } from '../core/config.js';
import { formatDate, relativeTime } from '../core/utils.js';

/* --- ثوابت --- */
const AUTO_DELETE_DAYS = 7;

const STORE_MAP = {
  'customers':        { label: 'العملاء',          icon: '👥' },
  'orders':           { label: 'الطلبات',          icon: '📋' },
  'payments':         { label: 'الدفعات',          icon: '💰' },
  'inventory':        { label: 'المخزون',          icon: '📦' },
  'workers':          { label: 'العمال',           icon: '👷' },
  'expenses':         { label: 'مصروفات الورشة',  icon: '💸' },
  'appointments':     { label: 'المواعيد',         icon: '📅' },
  'portfolio':        { label: 'معرض الأعمال',     icon: '📸' },
  'commitments':      { label: 'الالتزامات',       icon: '💳' },
  'house-expenses':   { label: 'مصاريف البيت',    icon: '🏠' },
  'personal-loans':   { label: 'القروض',           icon: '💵' },
};

/* --- الحالة --- */
let state = {
  container: null,
  items: [],
  activeFilter: 'all',
  searchQuery: '',
};

/* ==========================================================================
   1. أدوات
   ========================================================================== */

/**
 * جلب تفاصيل المخزن الأصلي.
 * @param {string} store
 * @returns {{label:string, icon:string}}
 */
function storeInfo(store) {
  return STORE_MAP[store] || { label: store || 'غير معروف', icon: '📄' };
}

/**
 * حساب الأيام المتبقية قبل الحذف التلقائي.
 * @param {number} deletedAt
 * @returns {number}
 */
function daysLeft(deletedAt) {
  const ageMs = Date.now() - (deletedAt || 0);
  const ageDays = Math.floor(ageMs / 86400000);
  return Math.max(0, AUTO_DELETE_DAYS - ageDays);
}

/**
 * استخراج اسم العنصر من بياناته (للعرض).
 * @param {Object} item
 * @returns {string}
 */
function itemTitle(item) {
  const d = item.data || {};
  return String(d.name || d.title || d.personName || d.id || 'بدون اسم');
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  /* الحذف التلقائي الفعلي بعد AUTO_DELETE_DAYS (كان معروضاً في الواجهة دون تنفيذ) */
  try { await trash.purgeExpired(AUTO_DELETE_DAYS); }
  catch (e) { console.warn('[Trash] purge failed:', e); }
  const all = await trash.list();
  state.items = all.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
}

/* ==========================================================================
   3. عمليات
   ========================================================================== */

async function restoreItem(item) {
  const info = storeInfo(item.originalStore);
  const ok = await modal.confirm({
    title: 'استرجاع عنصر',
    message: 'استرجاع "' + itemTitle(item) + '" إلى ' + info.label + '؟',
    confirmText: 'استرجاع', cancelText: 'إلغاء',
  });
  if (!ok) return;
  try {
    const restored = await trash.restore(item.id);
    if (!restored) {
      toast.danger('تعذّر الاسترجاع');
      return;
    }
    toast.success('تم الاسترجاع');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

async function deletePermanent(item) {
  const ok = await modal.confirm({
    title: 'حذف نهائي',
    message: 'سيُحذف "' + itemTitle(item) + '" نهائياً. لا يمكن التراجع!',
    confirmText: 'حذف نهائي', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.remove(item.id);
    toast.success('تم الحذف النهائي');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

async function clearAll() {
  const ok = await modal.confirm({
    title: 'تفريغ السلة',
    message: 'سيتم حذف كل العناصر نهائياً. لا يمكن التراجع!',
    confirmText: 'تفريغ الكل', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  const ok2 = await modal.confirm({
    title: 'تأكيد نهائي',
    message: 'هل أنت متأكد 100%؟',
    confirmText: 'نعم، فرّغ الكل', cancelText: 'إلغاء', danger: true,
  });
  if (!ok2) return;
  try {
    await trash.clear();
    toast.success('تم تفريغ السلة');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

/* ==========================================================================
   4. تفاصيل العنصر
   ========================================================================== */

function openDetail(item) {
  const info = storeInfo(item.originalStore);
  const left = daysLeft(item.deletedAt);

  const body = el('div', {}, [
    el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
    }, [
      el('span', { style: { fontSize: '32px' } }, info.icon),
      el('div', {}, [
        el('div', { style: { fontSize: '16px', fontWeight: '600', color: '#123C2F' } },
          itemTitle(item)),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } },
          'من: ' + info.label),
      ]),
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'تاريخ الحذف'),
      el('div', { style: { fontSize: '13px', color: '#123C2F' } },
        formatDate(item.deletedAt) + ' — ' + relativeTime(item.deletedAt)),
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'الأيام المتبقية'),
      el('div', {
        style: {
          fontSize: '14px', fontWeight: '600',
          color: left <= 1 ? '#C62828' : (left <= 3 ? '#F57C00' : '#2E7D32'),
        },
      }, left + ' يوم'),
    ]),
    el('details', { style: { marginTop: '12px' } }, [
      el('summary', { style: { fontSize: '12px', color: '#2E8B6F', cursor: 'pointer' } },
        '📎 البيانات المحفوظة'),
      el('pre', {
        style: {
          fontSize: '11px', color: '#666', background: '#F6F1E6',
          padding: '8px', borderRadius: '6px', marginTop: '6px',
          overflow: 'auto', maxHeight: '250px',
          direction: 'ltr', textAlign: 'left',
        },
      }, JSON.stringify(item.data || {}, null, 2)),
    ]),
  ]);

  modal.open({
    title: 'تفاصيل العنصر المحذوف',
    body,
    closable: true,
    actions: [
      { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
      {
        text: '♻️ استرجاع', variant: 'primary',
        onClick: async () => {
          modal.close();
          await restoreItem(item);
        },
      },
      {
        text: '🗑️ حذف نهائي', variant: 'danger',
        onClick: async () => {
          modal.close();
          await deletePermanent(item);
        },
      },
    ],
  });
}

/* ==========================================================================
   5. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#trash-stats');
  if (!wrap) return;
  clear(wrap);

  const total = state.items.length;
  const max = LIMITS.maxTrashItems || 200;
  const soon = state.items.filter((i) => daysLeft(i.deletedAt) <= 1).length;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🗑️'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي (الحد: ' + max + ')'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏰'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: soon > 0 ? '#C62828' : '#666' } },
      String(soon)),
    el('span', { className: 'stat__label' }, 'حذف قريب'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#trash-filters');
  if (!wrap) return;
  clear(wrap);

  const storesInTrash = new Set(state.items.map((i) => i.originalStore).filter(Boolean));
  if (storesInTrash.size === 0) return;

  /* الكل */
  const allActive = state.activeFilter === 'all';
  wrap.appendChild(el('button', {
    type: 'button',
    className: 'btn btn--sm ' + (allActive ? 'btn--primary' : 'btn--ghost'),
    style: { marginInlineEnd: '4px', marginBottom: '4px' },
    onClick: () => {
      state.activeFilter = 'all';
      renderFilters();
      renderList();
    },
  }, '🎯 الكل (' + state.items.length + ')'));

  /* لكل مخزن */
  storesInTrash.forEach((store) => {
    const info = storeInfo(store);
    const count = state.items.filter((i) => i.originalStore === store).length;
    const active = state.activeFilter === store;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = store;
        renderFilters();
        renderList();
      },
    }, info.icon + ' ' + info.label + ' (' + count + ')'));
  });
}

function applyFilters() {
  let list = state.items;
  if (state.activeFilter !== 'all') {
    list = list.filter((i) => i.originalStore === state.activeFilter);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((i) => {
      const title = itemTitle(i).toLowerCase();
      const info = storeInfo(i.originalStore).label.toLowerCase();
      return title.includes(q) || info.includes(q);
    });
  }
  return list;
}

function buildTrashRow(item) {
  const info = storeInfo(item.originalStore);
  const left = daysLeft(item.deletedAt);
  const color = left <= 1 ? '#C62828' : (left <= 3 ? '#F57C00' : '#2E8B6F');

  const card = el('div', {
    className: 'card',
    style: {
      marginBottom: '8px',
      padding: '10px 12px',
      cursor: 'pointer',
      borderRight: '4px solid ' + color,
    },
    'data-id': item.id,
    onClick: () => openDetail(item),
  });

  /* السطر 1: العنوان + الأيام */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
        info.icon + ' ' + itemTitle(item)),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        'من: ' + info.label),
      el('div', { style: { fontSize: '11px', color: '#999', marginTop: '2px' } },
        '🗑️ ' + relativeTime(item.deletedAt)),
    ]),
    el('span', {
      style: {
        fontSize: '11px',
        fontWeight: '600',
        color,
        background: left <= 1 ? '#FFEBEE' : (left <= 3 ? '#FFF3E0' : '#E8F5E9'),
        padding: '2px 8px',
        borderRadius: '10px',
        whiteSpace: 'nowrap',
      },
    }, 'متبقي ' + left + ' يوم'),
  ]));

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => restoreItem(item),
    }, '♻️ استرجاع'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deletePermanent(item),
    }, '🗑️ حذف نهائي'),
  ]));

  return card;
}

function renderList() {
  const wrap = state.container?.querySelector('#trash-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters();

  if (list.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '🗑️'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'السلة فارغة'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'العناصر المحذوفة ستظهر هنا'),
    ]));
    return;
  }

  list.forEach((i) => wrap.appendChild(buildTrashRow(i)));
}

async function refreshAll() {
  try {
    await loadData();
    renderStats();
    renderFilters();
    renderList();
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   6. API
   ========================================================================== */

export const trashPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '🗑️ سلة المحذوفات'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'استرجع أو احذف نهائياً'),
    ]));

    /* تنبيه */
    container.appendChild(el('div', {
      style: {
        padding: '10px 12px',
        background: '#FFF3E0',
        color: '#E65100',
        borderRadius: '8px',
        fontSize: '12px',
        marginBottom: '12px',
        lineHeight: '1.5',
      },
    }, '⚠️ العناصر تُحذف نهائياً بعد ' + AUTO_DELETE_DAYS + ' أيام من الحذف.'));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'trash-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر تفريغ السلة */
    container.appendChild(el('button', {
      className: 'btn btn--ghost btn--block', type: 'button',
      style: { marginBottom: '12px', color: '#C62828' },
      onClick: () => clearAll(),
    }, '🗑️ تفريغ السلة كاملة'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'trash-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* القائمة */
    container.appendChild(el('div', { id: 'trash-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      items: [],
      activeFilter: 'all',
      searchQuery: '',
    };
  },
};
