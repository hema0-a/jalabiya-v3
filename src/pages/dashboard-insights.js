/* ==========================================================================
   dashboard-insights.js — بطاقة «يومك في لمحة» في لوحة التحكم (v3.5.22)
   ==========================================================================
   رسالة تحفيزية بحسب الوقت + «الإجراء التالي» + إنتاجية الأسبوع + نصائح ذكية مبنية على النشاط.
   - الحساب كله في services/daily-insights.js (نقي). هنا: قراءة البيانات وبناء الواجهة فقط.
   - تُحمَّل بعد الرسم الأول داخل خانة جاهزة (كتذكير النسخة الاحتياطية) فلا تؤخّر اللوحة، وفشلها لا يُسقطها.
   API: buildInsightsCard(model) → HTMLElement · loadInsightsModel(now?) → Promise<Object> · mountInsights(slot) → Promise<void>
   ========================================================================== */

import { el } from '../core/dom.js';
import { startOfDay, startOfNextDay } from '../core/day-math.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { customers } from '../data/repos/customers.js';
import { inventory } from '../data/repos/inventory.js';
import { revenuePayments } from '../services/payments-view.js';
import { customerStats } from '../services/vip-rules.js';
import { buildInsights } from '../services/daily-insights.js';

const TIP_COLORS = {
  success: ['#E8F5E9', '#2E7D32'],
  info: ['#E3F2FD', '#1565C0'],
  warning: ['#FFF3E0', '#E65100'],
  danger: ['#FFEBEE', '#C62828'],
};

/** أكثر عميل VIP شراءً (من الطلبات المُسلَّمة) أو ''. */
function topVipName(customersList, ordersList) {
  const stats = customerStats(ordersList);
  let best = null;
  for (const c of customersList) {
    if (!c || c.vip !== true) continue;
    const s = stats.get(c.id);
    if (s && (!best || s.spent > best.spent)) best = { name: c.name, spent: s.spent };
  }
  return best ? String(best.name || '') : '';
}

/**
 * قراءة المستودعات وبناء نموذج البطاقة. كل مصدر ثانوي يفشل بهدوء (يُعدّ صفراً).
 * @param {number} [now=Date.now()]
 */
export async function loadInsightsModel(now = Date.now()) {
  const [ords, pays, exps, low, custs] = await Promise.all([
    orders.list(),
    payments.list().catch(() => []),
    expenses.list().catch(() => []),
    inventory.getLowStock().then((l) => l.length).catch(() => 0),
    customers.list().catch(() => []),
  ]);
  const from = startOfDay(now);
  const to = startOfNextDay(from);
  const todayRevenue = revenuePayments(pays, ords)
    .filter((p) => (p.createdAt || 0) >= from && (p.createdAt || 0) < to)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const todayExpenses = exps
    .filter((e) => (e.date || 0) >= from && (e.date || 0) < to)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return buildInsights({ orders: ords, todayRevenue, todayExpenses, lowStock: low, topVipName: topVipName(custs, ords), now });
}

/**
 * بناء البطاقة من نموذج buildInsights (دالة نقية بالنسبة للـDOM: لا قراءة بيانات).
 * @param {Object} model
 * @returns {HTMLElement}
 */
export function buildInsightsCard(model) {
  const { motivation, nextAction: na, productivity: pr, tips, weekOrders } = model;

  const next = el('a', {
    className: 'dash-insights__next', href: na.hash, 'data-role': 'next-action',
    style: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', padding: '10px 12px', borderRadius: '10px', borderRight: '4px solid ' + na.color, background: '#FAFAF7', marginBottom: '12px' },
  }, [
    el('span', { style: { fontSize: '24px' }, 'aria-hidden': 'true' }, na.icon),
    el('span', { style: { flex: '1', minWidth: '0' } }, [
      el('span', { style: { display: 'block', fontSize: '14px', fontWeight: '700', color: na.color } }, na.title),
      el('span', { style: { display: 'block', fontSize: '12px', color: '#666', marginTop: '2px' } }, na.subtitle),
    ]),
  ]);

  const bar = el('div', {
    role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pr.percent),
    'aria-label': 'إنتاجية الأسبوع',
    style: { background: '#E5DDD0', height: '10px', borderRadius: '5px', overflow: 'hidden' },
  }, [el('div', { style: { width: pr.percent + '%', height: '100%', background: pr.color } })]);

  const productivity = el('div', { 'data-role': 'productivity', style: { marginBottom: '12px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' } }, [
      el('span', { style: { color: '#666' } }, '📈 إنتاجية الأسبوع: ' + pr.icon + ' ' + pr.level + ' (' + weekOrders + ' طلب)'),
      el('strong', { style: { color: pr.color } }, pr.percent + '%'),
    ]),
    bar,
    el('div', { style: { fontSize: '11px', color: '#666', textAlign: 'center', marginTop: '6px' } }, pr.message),
  ]);

  const tipsWrap = el('div', { 'data-role': 'tips' }, tips.map((t) => {
    const [bg, fg] = TIP_COLORS[t.type] || TIP_COLORS.info;
    return el('div', {
      className: 'dash-insights__tip',
      style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 10px', borderRadius: '8px', background: bg, color: fg, fontSize: '12px', lineHeight: '1.6', marginBottom: '6px' },
    }, [el('span', { 'aria-hidden': 'true' }, t.icon), el('span', {}, t.text)]);
  }));

  return el('div', { className: 'card dash-insights', 'data-role': 'insights', style: { marginBottom: '16px', padding: '12px' } }, [
    el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', marginBottom: '10px' } }, '✨ ' + motivation),
    next,
    productivity,
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#123C2F', marginBottom: '6px' } }, '💡 نصائح ذكية لك'),
    tipsWrap,
  ]);
}

/**
 * يملأ الخانة بالبطاقة. أي فشل في القراءة أو الرسم يترك الخانة فارغة دون إسقاط اللوحة.
 * @param {HTMLElement} slot
 */
export async function mountInsights(slot) {
  try {
    const model = await loadInsightsModel();
    if (slot && slot.isConnected) slot.appendChild(buildInsightsCard(model));
  } catch (e) {
    console.warn('[Dashboard] insights failed:', e);
  }
}
