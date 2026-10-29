/* ==========================================================================
   deposit-policy.js — سياسة العربون  [v3.3.45]
   ==========================================================================
   تحذير قبل بدء التنفيذ (pending → in_progress) إن كان المدفوع (مقدم + دفعات)
   أقل من نسبة محدّدة من إجمالي الطلب. نقي بلا IndexedDB/DOM.
   لا يمنع شيئاً: المستخدم يقرر «ابدأ على أي حال».
   ========================================================================== */

export const DEFAULT_DEPOSIT_POLICY = { enabled: true, minPercent: 30 };

/**
 * إعدادات صالحة دائماً (نسبة بين 1 و100).
 * @param {Object} [p] — settings.depositPolicy
 */
export function normalizePolicy(p) {
  const raw = p && typeof p === 'object' ? p : {};
  const pct = Number(raw.minPercent);
  return {
    enabled: raw.enabled !== false,
    minPercent: pct >= 1 && pct <= 100 ? Math.round(pct * 100) / 100 : DEFAULT_DEPOSIT_POLICY.minPercent,
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * هل العربون كافٍ؟
 * @param {{amount:number}} order
 * @param {number} paid — المدفوع الفعلي (مقدم + دفعات)
 * @param {Object} [policy]
 * @returns {{applies:boolean, ok:boolean, required:number, paid:number, shortfall:number, percentPaid:number, percentRequired:number}}
 */
export function checkDeposit(order, paid, policy) {
  const pol = normalizePolicy(policy);
  const amount = Number(order && order.amount) || 0;
  const p = Math.max(0, Number(paid) || 0);
  const required = r2(amount * pol.minPercent / 100);
  const applies = pol.enabled && amount > 0;
  const shortfall = Math.max(0, r2(required - p));
  return {
    applies,
    ok: !applies || shortfall <= 0.009,
    required, paid: p, shortfall,
    percentPaid: amount > 0 ? Math.round((p / amount) * 100) : 0,
    percentRequired: pol.minPercent,
  };
}

/** هل هذا الانتقال هو «بدء التنفيذ» الذي نفحص عنده؟ */
export function isStartTransition(order, toStatus) {
  return !!order && order.status === 'pending' && toStatus === 'in_progress';
}
