/* ==========================================================================
   order-profit.js — ربحية الطلبات (v3.3.28)
   ==========================================================================
   التكلفة (order.cost) اختيارية: قماش + خيط + أجر… يُدخلها المستخدم في نموذج الطلب.
   - الإيراد = amount (بعد الخصم والرسوم). الربح = الإيراد − التكلفة.
   - الطلب بلا تكلفة مُدخلة لا يدخل في الملخص (لا نفترض تكلفة صفر فنبالغ في الربح).
   - الملغى لا يُحتسب. حساب عرض فقط: لا يكتب في قاعدة البيانات.
   ========================================================================== */

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {Object} order
 * @returns {{revenue:number, cost:number, profit:number, margin:number, hasCost:boolean}}
 */
export function orderProfit(order) {
  const revenue = Math.max(0, Number(order && order.amount) || 0);
  const cost = Math.max(0, Number(order && order.cost) || 0);
  const hasCost = cost > 0;
  const profit = r2(revenue - cost);
  const margin = hasCost && revenue > 0 ? r2((profit / revenue) * 100) : 0;
  return { revenue, cost, profit, margin, hasCost };
}

/**
 * ملخص ربحية الطلبات المسلَّمة التي أُدخلت تكلفتها.
 * @param {Array} ordersList
 * @returns {{count:number, revenue:number, cost:number, profit:number, margin:number,
 *            losing:Array<{id:*, profit:number}>, skipped:number}}
 *   skipped = طلبات مسلَّمة بلا تكلفة (غير محتسبة)
 */
export function summarizeProfit(ordersList) {
  const list = Array.isArray(ordersList) ? ordersList : [];
  let count = 0, revenue = 0, cost = 0, skipped = 0;
  const losing = [];
  for (const o of list) {
    if (!o || o.status !== 'delivered') continue;
    const p = orderProfit(o);
    if (!p.hasCost) { skipped++; continue; }
    count++; revenue += p.revenue; cost += p.cost;
    if (p.profit < 0) losing.push({ id: o.id, profit: p.profit });
  }
  const profit = r2(revenue - cost);
  return {
    count, revenue: r2(revenue), cost: r2(cost), profit,
    margin: revenue > 0 ? r2((profit / revenue) * 100) : 0,
    losing, skipped,
  };
}
