/* ==========================================================================
   orders.js — صفحة الطلبات (المدخل): الحالة والتحميل والدورة الحيّة والواجهة العامة
   ==========================================================================
   - 3 طرق عرض: قائمة / كانبان / تجميع.
   - نموذج كامل + اقتراح موعد + صورة مرجعية + معاينة + طباعة + رسائل.
   - مؤقت العمل + توقيع التسليم + شريط الحد + تنبيهات عاجلة.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة).

   v3.5.6: تقسيم لوحة التحكم والطلبات — تقسيم صيانة بلا تغيير سلوك (2300 سطر ← مدخل + 8 وحدات):
     orders-logic.js (منطق نقي وثوابت) · orders-item-rows.js (صفّا البند والرسم) · orders-form.js (openOrderForm حرفياً)
     · orders-delivery.js (التسليم والتسليم الجزئي) · orders-actions.js (حذف/تقدّم/طباعة/رسائل/مؤقت/عارضو الصور)
     · orders-cards.js (البطاقات) · orders-summary.js (الشريط والتنبيهات والإحصاءات) · orders-views.js (قائمة/كانبان/تجميع/فلاتر).
   التواصل عبر ctx صريح { state, refresh, openForm } (لا EventBus، لا استيراد دائري). الوحدات لا تستورد هذا الملف.
   الواجهة العامة كما كانت: ordersPage · filterOrders · computeTotals · groupOrders · discountPercentOf · isDiscountExcessive
   · MAX_DISCOUNT_PERCENT · deliverWithSignature(order) · openPartialDelivery(order) · buildItemRow.
   ========================================================================== */

import { clear, el } from '../core/dom.js';
import { consumeNew } from '../core/deeplink.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { settings } from '../data/repos/settings.js';
import { createCollapsible } from '../ui/collapsible.js'; // يُستخدم من اختبار v354 — لا تحذفه
import { assessOrderRisks } from '../services/order-risk.js';
import { getTotalWorkTime, getActiveSession, formatDuration } from '../services/order-timing.js';
import { groupingOptions, fabricPickupDays } from '../services/alert-rules.js';
import { sessionsOf } from './orders-logic.js';
import { syncTypesDatalist } from './orders-item-rows.js';
import { renderStats, renderTopBanners } from './orders-summary.js';
import { renderView, disposeOrdersList } from './orders-views.js';
import { openOrderForm } from './orders-form.js';
import { deliverWithSignature as deliverWithSignatureImpl, openPartialDelivery as openPartialDeliveryImpl } from './orders-delivery.js';

/* --- إعادة تصدير الواجهة العامة (نفس الأسماء والتواقيع) --- */
export {
  filterOrders, computeTotals, MAX_DISCOUNT_PERCENT, discountPercentOf, isDiscountExcessive, groupOrders,
} from './orders-logic.js';
export { buildItemRow } from './orders-item-rows.js';

/* --- الحالة --- */
/* كائن واحد ثابت طوال عمر الوحدة: destroy يصفّره في مكانه (لا إعادة إسناد) فلا يبقى أي مرجع قديم في الوحدات. */
const state = {
  orders: [],
  riskMap: new Map(),
  customers: [],
  customerMap: {},
  activeFilter: 'all',
  activeView: 'list',
  kanbanLimit: {},
  scheduleConfig: { dayOffWeekday: 0, dailyOrderLimit: 0 },
  grouping: { enabled: false, sameTypeOnly: true, tolerance: 2 },
  pickupDays: 2,
  jalabiyaTypes: [],
  container: null,
  _timerInterval: null,
};

/* السياق الصريح الذي تستلمه الوحدات: الحالة + إعادة التحميل/الرسم + فتح النموذج. يُنشأ عند تحميل الوحدة
   (قبل أي render) كي تعمل openPartialDelivery/deliverWithSignature كما كانت عند استدعائها قبل فتح الصفحة. */
const ctx = {
  state,
  refresh: () => refreshAll(),
  openForm: (order) => openOrderForm(ctx, order),
};

/** تصفير الحالة في المكان (يطابق الشكل الذي كان destroy ينشئه سابقاً، بلا riskMap). */
function resetOrdersState(s) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    orders: [], customers: [], customerMap: {},
    activeFilter: 'all', activeView: 'list', kanbanLimit: {},
    scheduleConfig: { dayOffWeekday: 0, dailyOrderLimit: 0 },
    grouping: { enabled: false, sameTypeOnly: true, tolerance: 2 },
    pickupDays: 2,
    jalabiyaTypes: [],
    container: null, _timerInterval: null,
  });
}

/* --- أغلفة رفيعة بالتواقيع القديمة (order فقط) --- */
export function deliverWithSignature(order) { return deliverWithSignatureImpl(ctx, order); }
export function openPartialDelivery(order) { return openPartialDeliveryImpl(ctx, order); }

/* ==========================================================================
   3. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [ordersList, customersList, s] = await Promise.all([
    orders.list(),
    customers.list(),
    settings.get().catch(() => ({})),
  ]);
  /* العاجل (غير المسلَّم/الملغى) أولاً، ثم الأحدث (v3.3.51) */
  const urgentRank = (o) => (o.urgent && o.status !== 'delivered' && o.status !== 'cancelled') ? 1 : 0;
  ordersList.sort((a, b) => (urgentRank(b) - urgentRank(a)) || ((b.createdAt || 0) - (a.createdAt || 0)));
  state.orders = ordersList;
  state.customers = customersList;
  state.customerMap = {};
  customersList.forEach((c) => { state.customerMap[c.id] = c; });

  /* إعدادات التجميع واستلام القماش (v3.3.32: كانت تُحفظ ولا تُقرأ) */
  state.grouping = groupingOptions(s);
  state.pickupDays = fabricPickupDays(s);
  /* أنواع الجلابيب من الإعدادات: اقتراح اسم + تعبئة السعر تلقائياً في بنود الطلب (v3.3.32) */
  state.jalabiyaTypes = (Array.isArray(s && s.jalabiyaTypes) ? s.jalabiyaTypes : []).filter((t) => t && t.name);
  syncTypesDatalist(state.jalabiyaTypes);
  if (!state.grouping.enabled && state.activeView === 'grouping') state.activeView = 'list';

  if (s && s.dailyLimit) {
    state.scheduleConfig = {
      dayOffWeekday: Number(s.dailyLimit.dayOffWeekday ?? 0),
      dailyOrderLimit: Number(s.dailyLimit.dailyOrderLimit) || 0,
    };
  }

  /* الطلبات المعرَّضة للتأخر (شارة في البطاقة + فلتر) */
  try {
    state.riskMap = new Map(assessOrderRisks(state.orders, state.scheduleConfig).map((r) => [r.order.id, r]));
  } catch (e) { state.riskMap = new Map(); }
}

/* ==========================================================================
   12. المؤقت الحيّ
   ========================================================================== */

function startLiveTimer() {
  stopLiveTimer();
  state._timerInterval = setInterval(() => {
    if (!state.container) return;
    state.orders.forEach((o) => {
      const sessions = sessionsOf(o);
      if (!getActiveSession(sessions)) return;
      const badge = state.container.querySelector('[data-timer-id="' + o.id + '"]');
      if (!badge) return;
      badge.textContent = '⏱️ يعمل · ' + formatDuration(getTotalWorkTime(sessions));
    });
  }, 1000);
}

function stopLiveTimer() {
  if (state._timerInterval) { clearInterval(state._timerInterval); state._timerInterval = null; }
}

async function refreshAll() {
  await loadData();
  renderTopBanners(ctx);
  renderStats(ctx);
  renderView(ctx);
  startLiveTimer();
}

/* ==========================================================================
   13. API
   ========================================================================== */

export const ordersPage = {
  async render(container, sub) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.activeView = 'list';

    container.appendChild(el('div', { id: 'orders-daily-limit' }));
    container.appendChild(el('div', { id: 'orders-alerts' }));

    container.appendChild(el('div', {
      id: 'orders-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => ctx.openForm(),
    }, '➕ إضافة طلب'));

    container.appendChild(el('div', { id: 'orders-view-toggle' }));
    container.appendChild(el('div', {
      id: 'orders-filters',
      className: 'scroll-row',
      style: { marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'orders-list' }));

    await refreshAll();
    consumeNew(sub, 'orders', () => ctx.openForm());
  },

  destroy() {
    stopLiveTimer();
    disposeOrdersList();
    resetOrdersState(state);
  },
};
