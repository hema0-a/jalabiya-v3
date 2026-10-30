/* ==========================================================================
   orders-views.js — عروض الصفحة: قائمة · كانبان · تجميع + مبدّل العروض والفلاتر (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون تغيير منطق. API: renderView(ctx) · disposeOrdersList().
   كل دالة تقرأ ctx.state عند كل استدعاء (لا تحتفظ بمرجع لـ orders/customerMap).
   ordersList (القائمة التدريجية) تعيش هنا، وorders.js يستدعي disposeOrdersList في destroy.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { clusterBySize } from '../services/size-clusters.js';
import { STATUS_MAP, STATUS_ORDER, KANBAN_PAGE, kanbanSorted, filterOrders, groupOrders, orderType } from './orders/logic.js';
import { buildOrderCard, buildMiniCard, groupOrderRow, groupCard } from './orders/cards.js';

/* --- الحالة --- */
/* القائمة التدريجية: رسم 30 طلباً ثم المزيد عند التمرير (كانت ترسم الكل: 70 ألف عنصر DOM عند 4000 طلب) */
let ordersList = null;
export function disposeOrdersList() {
  if (ordersList) { try { ordersList.destroy(); } catch (e) { /* ignore */ } ordersList = null; }
}

/* ==========================================================================
   10. كانبان + تجميع
   ========================================================================== */

function renderKanban(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#orders-list');
  if (!wrap) return;
  disposeOrdersList();
  clear(wrap);

  const board = el('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))',
      gap: '8px', overflowX: 'auto', paddingBottom: '12px',
    },
  });

  STATUS_ORDER.forEach((status) => {
    const sInfo = STATUS_MAP[status];
    const items = kanbanSorted(status, state.orders.filter((o) => o.status === status));
    const limit = (state.kanbanLimit && state.kanbanLimit[status]) || KANBAN_PAGE;

    const column = el('div', {
      style: { background: '#F6F1E6', borderRadius: '12px', padding: '10px', minHeight: '200px' },
    });

    column.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px', paddingBottom: '6px',
        borderBottom: '2px solid ' + sInfo.color },
    }, [
      el('span', { style: { fontSize: '13px', fontWeight: '700', color: sInfo.color } }, sInfo.label),
      el('span', {
        style: { fontSize: '11px', fontWeight: '600', color: '#fff',
          background: sInfo.color, padding: '2px 8px', borderRadius: '10px' },
      }, String(items.length)),
    ]));

    if (items.length === 0) {
      column.appendChild(el('div', {
        style: { fontSize: '11px', color: '#999', textAlign: 'center', padding: '20px 0' },
      }, 'لا يوجد'));
    } else {
      items.slice(0, limit).forEach((o) => column.appendChild(buildMiniCard(ctx, o, { color: sInfo.color })));
      /* كان العمود يُقصّ عند 30 بلا أي إشارة (والشارة تعرض العدد الكامل) فتختفي طلبات — صار «عرض المزيد» */
      if (items.length > limit) {
        const rest = items.length - limit;
        column.appendChild(el('button', {
          type: 'button', className: 'btn btn--sm btn--ghost', 'data-kanban-more': status,
          style: { width: '100%', marginTop: '6px' },
          onClick: () => { state.kanbanLimit[status] = limit + KANBAN_PAGE; renderKanban(ctx); },
        }, 'عرض ' + Math.min(KANBAN_PAGE, rest) + ' أخرى (متبقٍ ' + rest + ')'));
      }
    }
    board.appendChild(column);
  });

  wrap.appendChild(board);
}

function renderGrouping(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#orders-list');
  if (!wrap) return;
  disposeOrdersList();
  clear(wrap);

  const active = state.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const opts = state.grouping;
  const groups = groupOrders(active, { sameTypeOnly: opts.sameTypeOnly });
  const clusters = opts.tolerance > 0
    ? clusterBySize(active, state.customerMap, opts.tolerance, orderType, opts.sameTypeOnly)
    : [];

  if (groups.length === 0 && clusters.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🎯'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مجموعات'),
      el('p', { className: 'empty-state__text' }, 'لم يتم العثور على طلبات متشابهة.'),
    ]));
    return;
  }

  groups.forEach((g) => {
    const c = state.customerMap[g.customerId];
    wrap.appendChild(groupCard('👤 ' + (c ? c.name : 'عميل محذوف'),
      '📦 ' + g.type + ' — ' + g.orders.length + ' طلب', g.totalAmount,
      g.orders.map((o) => groupOrderRow(ctx, o, null)), '#1F6D57'));
  });

  if (clusters.length > 0) {
    wrap.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '700', color: '#123C2F', margin: '12px 0 8px' } },
      '📏 قياسات متقاربة (±' + opts.tolerance + ' سم) — لدفعة قص واحدة'));
    clusters.forEach((cl) => {
      wrap.appendChild(groupCard('📦 ' + cl.type,
        cl.orders.length + ' طلب لـ ' + cl.customers.length + ' عملاء', cl.totalAmount,
        cl.orders.map((o) => groupOrderRow(ctx, o, state.customerMap[o.customerId])), '#B8863B'));
    });
  }
}

/* ==========================================================================
   11. الرسم الرئيسي
   ========================================================================== */

function buildViewToggle(ctx) {
  const { state } = ctx;
  const wrap = el('div', {
    style: {
      display: 'flex', gap: '4px', marginBottom: '12px',
      background: '#F6F1E6', padding: '4px', borderRadius: '10px',
    },
  });

  const views = [
    { id: 'list',     icon: '📋', label: 'قائمة' },
    { id: 'kanban',   icon: '🗂️', label: 'كانبان' },
    ...(state.grouping.enabled ? [{ id: 'grouping', icon: '🎯', label: 'تجميع' }] : []),
  ];

  views.forEach((v) => {
    const isActive = state.activeView === v.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => { state.activeView = v.id; renderView(ctx); },
    }, v.icon + ' ' + v.label));
  });

  return wrap;
}

function renderFilters(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#orders-filters');
  if (!wrap) return;
  clear(wrap);
  if (state.activeView !== 'list') return;

  const counts = { all: state.orders.length };
  STATUS_ORDER.forEach((s) => { counts[s] = 0; });
  state.orders.forEach((o) => { if (counts[o.status] != null) counts[o.status]++; });

  const riskCount = state.riskMap ? state.riskMap.size : 0;
  if (state.activeFilter === 'at_risk' && riskCount === 0) state.activeFilter = 'all';
  const items = [
    { id: 'all', label: 'الكل', count: counts.all },
    ...(riskCount > 0 ? [{ id: 'at_risk', label: '⚠️ معرَّض للتأخر', count: riskCount }] : []),
    ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_MAP[s].label, count: counts[s] })),
  ];

  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': it.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters(ctx);
        renderList(ctx);
      },
    }, it.label + ' (' + it.count + ')'));
  });
  /* الشريحة النشطة تظهر دائماً داخل الصف القابل للتمرير */
  wrap.querySelector('.btn--primary')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
}

const SWIPE_TIP_KEY = 'jalabiya_v3_swipe_tip';
function showSwipeTipOnce() {
  try {
    if (localStorage.getItem(SWIPE_TIP_KEY)) return;
    localStorage.setItem(SWIPE_TIP_KEY, '1');
  } catch { return; }
  toast.info('💡 اسحب بطاقة الطلب: يساراً لتقدّم حالته، ويميناً لمراسلة العميل');
}

function renderList(ctx) {
  const { state } = ctx;
  const listContainer = state.container?.querySelector('#orders-list');
  if (!listContainer) return;
  disposeOrdersList();
  clear(listContainer);

  const filtered = filterOrders(state.orders, state.activeFilter, state.riskMap);

  if (filtered.length === 0) {
    listContainer.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '📦'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد طلبات'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة طلب" للبدء'),
    ]));
    return;
  }

  showSwipeTipOnce();
  ordersList = createProgressiveList({
    items: filtered,
    pageSize: 30,
    render: (o) => buildOrderCard(ctx, o),
  });
  listContainer.appendChild(ordersList.node);
}

export function renderView(ctx) {
  const { state } = ctx;
  const toggleWrap = state.container.querySelector('#orders-view-toggle');
  if (toggleWrap) {
    clear(toggleWrap);
    toggleWrap.appendChild(buildViewToggle(ctx));
  }

  renderFilters(ctx);

  if (state.activeView === 'kanban') renderKanban(ctx);
  else if (state.activeView === 'grouping') renderGrouping(ctx);
  else renderList(ctx);
}
