/* ==========================================================================
   deposit-policy.js — سياسة العربون  [v3.3.45]
   ==========================================================================
   تحذير قبل بدء التنفيذ (pending → in_progress) إن كان المدفوع (مقدم + دفعات)
   أقل من نسبة محدّدة من إجمالي الطلب. نقي بلا IndexedDB/DOM.
   لا يمنع شيئاً: المستخدم يقرر «ابدأ على أي حال».
   ========================================================================== */

export const DEFAULT_DEPOSIT_POLICY = {
  enabled: true, minPercent: 30,
  /* v3.5.37 (كلها معطَّلة افتراضياً): حد أدنى بمبلغ ثابت، نسبة أعلى للطلبات الكبيرة، إعفاء VIP، إعفاء الصغيرة */
  minAmount: 0, bigOrderThreshold: 0, bigOrderPercent: 50, exemptVip: false, skipBelowAmount: 0,
};

/**
 * إعدادات صالحة دائماً (نسبة بين 1 و100).
 * @param {Object} [p] — settings.depositPolicy
 */
export function normalizePolicy(p) {
  const raw = p && typeof p === 'object' ? p : {};
  const pct = Number(raw.minPercent);
  const nn = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
  const big = Number(raw.bigOrderPercent);
  return {
    enabled: raw.enabled !== false,
    minPercent: pct >= 1 && pct <= 100 ? Math.round(pct * 100) / 100 : DEFAULT_DEPOSIT_POLICY.minPercent,
    minAmount: nn(raw.minAmount),
    bigOrderThreshold: nn(raw.bigOrderThreshold),
    bigOrderPercent: big >= 1 && big <= 100 ? Math.round(big * 100) / 100 : DEFAULT_DEPOSIT_POLICY.bigOrderPercent,
    exemptVip: raw.exemptVip === true,
    skipBelowAmount: nn(raw.skipBelowAmount),
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * هل العربون كافٍ؟
 * @param {{amount:number}} order
 * @param {number} paid — المدفوع الفعلي (مقدم + دفعات)
 * @param {Object} [policy]
 * @param {{customer?:Object}} [ctx] — العميل (لإعفاء VIP)
 * @returns {{applies:boolean, ok:boolean, required:number, paid:number, shortfall:number, percentPaid:number, percentRequired:number}}
 */
export function checkDeposit(order, paid, policy, ctx) {
  const pol = normalizePolicy(policy);
  const amount = Number(order && order.amount) || 0;
  const p = Math.max(0, Number(paid) || 0);
  /* النسبة الفعلية: الأعلى للطلبات الكبيرة، والحد الأدنى بمبلغ ثابت (لا يتجاوز مبلغ الطلب) */
  const effPct = pol.bigOrderThreshold > 0 && amount >= pol.bigOrderThreshold ? pol.bigOrderPercent : pol.minPercent;
  const byPct = r2(amount * effPct / 100);
  const required = amount > 0 ? r2(Math.min(amount, Math.max(byPct, pol.minAmount))) : 0;
  const vip = !!(pol.exemptVip && ctx && ctx.customer && ctx.customer.vip === true);
  const small = pol.skipBelowAmount > 0 && amount < pol.skipBelowAmount;
  const applies = pol.enabled && amount > 0 && !vip && !small;
  const shortfall = Math.max(0, r2(required - p));
  return {
    applies,
    ok: !applies || shortfall <= 0.009,
    required, paid: p, shortfall,
    percentPaid: amount > 0 ? Math.round((p / amount) * 100) : 0,
    percentRequired: required === byPct ? effPct : r2(required / amount * 100),
  };
}

/** هل هذا الانتقال هو «بدء التنفيذ» الذي نفحص عنده؟ */
export function isStartTransition(order, toStatus) {
  return !!order && order.status === 'pending' && toStatus === 'in_progress';
}
