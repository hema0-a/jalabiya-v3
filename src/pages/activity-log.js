/* ==========================================================================
   activity-log.js — صفحة سجل النشاط
   ==========================================================================
   - بطاقتان إحصائيتان (إجمالي / اليوم).
   - بحث + فلترة بالنوع.
   - قائمة مجمّعة حسب اليوم.
   - نافذة تفاصيل + حذف.
   - زر مسح السجل بالكامل.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { activity } from '../data/repos/activity.js';
import { formatDate, formatTime, relativeTime } from '../core/utils.js';

/* --- الحالة --- */
let state = {
  container: null,
  items: [],
  stats: null,
  activeFilter: 'all',
  searchQuery: '',
};

/* --- خريطة الأنواع (أيقونات + ألوان) --- */
const TYPE_MAP = {
  'customer:added':    { label: 'إضافة عميل',      icon: '👤', color: '#2E7D32' },
  'customer:updated':  { label: 'تعديل عميل',      icon: '✏️', color: '#1565C0' },
  'customer:deleted':  { label: 'حذف عميل',        icon: '🗑️', color: '#C62828' },
  'order:added':       { label: 'طلب جديد',        icon: '📋', color: '#2E7D32' },
  'order:updated':     { label: 'تعديل طلب',       icon: '✏️', color: '#1565C0' },
  'order:delivered':   { label: 'تسليم طلب',       icon: '✅', color: '#2E7D32' },
  'order:cancelled':   { label: 'إلغاء طلب',       icon: '❌', color: '#C62828' },
  'payment:added':     { label: 'دفعة',            icon: '💰', color: '#2E7D32' },
  'payment:deleted':   { label: 'حذف دفعة',        icon: '🗑️', color: '#C62828' },
  'expense:added':     { label: 'مصروف',           icon: '💸', color: '#F57C00' },
  'worker:added':      { label: 'إضافة عامل',      icon: '👷', color: '#2E7D32' },
  'inventory:updated': { label: 'تحديث مخزون',     icon: '📦', color: '#1565C0' },
  'settings:updated':  { label: 'تحديث إعدادات',   icon: '⚙️', color: '#666' },
  'trash:restored':    { label: 'استرجاع',         icon: '♻️', color: '#2E7D32' },
};

/**
 * جلب تفاصيل النوع (أيقونة + لون + اسم).
 * @param {string} type
 * @returns {{label:string, icon:string, color:string}}
 */
function typeInfo(type) {
  return TYPE_MAP[type] || { label: type || 'نشاط', icon: '📌', color: '#666' };
}

/* ==========================================================================
   1. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [items, stats] = await Promise.all([
    activity.listRecent(200),
    activity.getStats(),
  ]);
  state.items = items;
  state.stats = stats;
}

/* ==========================================================================
   2. عمليات
   ========================================================================== */

async function deleteItem(item) {
  const ok = await modal.confirm({
    title: 'حذف نشاط',
    message: 'حذف هذا السجل نهائياً؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await activity.remove(item.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

async function clearAll() {
  const ok = await modal.confirm({
    title: 'مسح السجل بالكامل',
    message: 'سيتم حذف كل سجلات النشاط. لا يمكن التراجع!',
    confirmText: 'مسح الكل', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  const ok2 = await modal.confirm({
    title: 'تأكيد نهائي',
    message: 'هل أنت متأكد 100%؟',
    confirmText: 'نعم، امسح الكل', cancelText: 'إلغاء', danger: true,
  });
  if (!ok2) return;
  try {
    await activity.clear();
    toast.success('تم مسح السجل');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

/* ==========================================================================
   3. تفاصيل النشاط
   ========================================================================== */

function openDetail(item) {
  const info = typeInfo(item.type);

  const body = el('div', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } }, [
      el('span', { style: { fontSize: '32px' } }, info.icon),
      el('div', {}, [
        el('div', { style: { fontSize: '16px', fontWeight: '600', color: info.color } }, info.label),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, relativeTime(item.timestamp)),
      ]),
    ]),
    el('div', { style: { fontSize: '13px', color: '#123C2F', marginBottom: '8px', lineHeight: '1.5' } },
      item.description || '—'),
    item.timestamp ? el('div', { style: { fontSize: '12px', color: '#666' } },
      '📅 ' + formatDate(item.timestamp) + ' — 🕐 ' + formatTime(item.timestamp)) : null,
    item.entityId ? el('div', { style: { fontSize: '11px', color: '#999', marginTop: '8px', fontFamily: 'monospace' } },
      'ID: ' + item.entityId) : null,
    item.metadata ? el('details', { style: { marginTop: '12px' } }, [
      el('summary', { style: { fontSize: '12px', color: '#2E8B6F', cursor: 'pointer' } }, '📎 التفاصيل التقنية'),
      el('pre', {
        style: {
          fontSize: '11px', color: '#666', background: '#F6F1E6',
          padding: '8px', borderRadius: '6px', marginTop: '6px',
          overflow: 'auto', maxHeight: '200px',
          direction: 'ltr', textAlign: 'left',
        },
      }, JSON.stringify(item.metadata, null, 2)),
    ]) : null,
  ]);

  modal.open({
    title: 'تفاصيل النشاط',
    body,
    closable: true,
    actions: [
      { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
      {
        text: '🗑️ حذف', variant: 'danger',
        onClick: async () => {
          modal.close();
          await deleteItem(item);
        },
      },
    ],
  });
}

/* ==========================================================================
   4. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#act-stats');
  if (!wrap) return;
  clear(wrap);

  const s = state.stats;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📜'),
    el('span', { className: 'stat__value', style: { fontSize: '20px' } }, String(s.total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value', style: { fontSize: '20px', color: '#2E7D32' } }, String(s.today)),
    el('span', { className: 'stat__label' }, 'اليوم'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#act-filters');
  if (!wrap) return;
  clear(wrap);

  const types = Object.keys(state.stats.byType || {});
  if (types.length === 0) return;

  /* زر "الكل" */
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
  }, '🎯 الكل (' + state.stats.total + ')'));

  /* أزرار الأنواع */
  types.forEach((type) => {
    const info = typeInfo(type);
    const active = state.activeFilter === type;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = type;
        renderFilters();
        renderList();
      },
    }, info.icon + ' ' + info.label + ' (' + state.stats.byType[type] + ')'));
  });
}

function applyFilters() {
  let list = state.items;
  if (state.activeFilter !== 'all') {
    list = list.filter((a) => a.type === state.activeFilter);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((a) =>
      String(a.description || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function buildActivityRow(item) {
  const info = typeInfo(item.type);

  const row = el('div', {
    className: 'card',
    style: {
      marginBottom: '6px',
      padding: '10px 12px',
      cursor: 'pointer',
      borderRight: '3px solid ' + info.color,
    },
    'data-id': item.id,
    onClick: () => openDetail(item),
  });

  row.appendChild(el('div', {
    style: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  }, [
    el('span', { style: { fontSize: '22px', lineHeight: '1', flexShrink: '0' } }, info.icon),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontSize: '12px', fontWeight: '600', color: info.color, marginBottom: '2px' } },
        info.label),
      el('div', { style: { fontSize: '13px', color: '#123C2F', lineHeight: '1.4', wordBreak: 'break-word' } },
        item.description || '—'),
      el('div', { style: { fontSize: '11px', color: '#999', marginTop: '4px' } },
        relativeTime(item.timestamp)),
    ]),
  ]));

  return row;
}

function renderList() {
  const wrap = state.container?.querySelector('#act-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters();

  if (list.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '📜'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا يوجد نشاط'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'سيظهر هنا كل ما يحدث في التطبيق'),
    ]));
    return;
  }

  /* تجميع حسب اليوم */
  const groups = new Map();
  list.forEach((item) => {
    const d = new Date(item.timestamp || 0);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b - a);

  sortedKeys.forEach((dayMs) => {
    const items = groups.get(dayMs);
    const isToday = (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.getTime() === dayMs;
    })();

    wrap.appendChild(el('div', {
      style: {
        fontSize: '12px',
        fontWeight: '600',
        color: '#1F6D57',
        margin: '12px 0 6px 0',
        paddingBottom: '4px',
        borderBottom: '1px solid #E5DDD0',
      },
    }, (isToday ? '📌 اليوم — ' : '📅 ') + formatDate(dayMs) + ' (' + items.length + ')'));

    items.forEach((item) => wrap.appendChild(buildActivityRow(item)));
  });
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
   5. API
   ========================================================================== */

export const activityLogPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '📜 سجل النشاط'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'كل ما يحدث في التطبيق'),
    ]));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'act-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر مسح الكل */
    container.appendChild(el('button', {
      className: 'btn btn--ghost btn--block', type: 'button',
      style: { marginBottom: '12px', color: '#C62828' },
      onClick: () => clearAll(),
    }, '🗑️ مسح السجل بالكامل'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث في الوصف...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'act-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* القائمة */
    container.appendChild(el('div', { id: 'act-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      items: [],
      stats: null,
      activeFilter: 'all',
      searchQuery: '',
    };
  },
};
