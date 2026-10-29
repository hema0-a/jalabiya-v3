/* ==========================================================================
   vip-rules.js — ترقية VIP تلقائية (v3.3.30)
   ==========================================================================
   ترقية فقط: لا يُنزَّل VIP يدوي أبداً. المعيار: طلبات مسلَّمة (غير ملغاة).
   ========================================================================== */

const KEY = 'jalabiya_v3_vip_rules';
export const DEFAULT_VIP_RULES = { enabled: true, minOrders: 5, minSpent: 5000 };

export function loadVipRules() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        enabled: raw.enabled !== false,
        minOrders: Math.max(0, Number(raw.minOrders) || 0),
        minSpent: Math.max(0, Number(raw.minSpent) || 0),
      };
    }
  } catch (e) { /* افتراضي */ }
  return { ...DEFAULT_VIP_RULES };
}
export function saveVipRules(r) {
  try { localStorage.setItem(KEY, JSON.stringify({
    enabled: r.enabled !== false, minOrders: Math.max(0, Number(r.minOrders) || 0), minSpent: Math.max(0, Number(r.minSpent) || 0),
  })); } catch (e) { /* التخزين قد يفشل */ }
}

export function customerStats(ordersList) {
  const m = new Map();
  for (const o of Array.isArray(ordersList) ? ordersList : []) {
    if (!o || o.status !== 'delivered' || !o.customerId) continue;
    const s = m.get(o.customerId) || { count: 0, spent: 0 };
    s.count++; s.spent += Number(o.amount) || 0;
    m.set(o.customerId, s);
  }
  return m;
}

/** عملاء مؤهلون للترقية (غير VIP حالياً). المعيار صفر = معطَّل. */
export function computeVipPromotions(customers, ordersList, rules = DEFAULT_VIP_RULES) {
  const stats = customerStats(ordersList);
  const minO = Number(rules.minOrders) || 0;
  const minS = Number(rules.minSpent) || 0;
  if (minO <= 0 && minS <= 0) return [];
  const out = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!c || c.vip === true) continue;
    const s = stats.get(c.id);
    if (!s) continue;
    if ((minO > 0 && s.count >= minO) || (minS > 0 && s.spent >= minS)) {
      out.push({ id: c.id, name: c.name, count: s.count, spent: Math.round(s.spent * 100) / 100 });
    }
  }
  return out.sort((a, b) => b.spent - a.spent);
}
