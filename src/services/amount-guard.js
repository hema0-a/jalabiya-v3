/* ==========================================================================
   amount-guard.js — فحص المبالغ المُدخلة (v3.3.50)
   ==========================================================================
   كانت نماذج الدفعات والمصروفات تقبل أي رقم موجب: 1e15 (مليون مليار) أو ثلاث خانات عشرية
   (12.345)، فتفسد كل المجاميع بصمت. وكان الطلب بسعر ناقص/فارغ يُحفظ بإجمالي صفر دون تنبيه.
   - invalid : ليس رقماً أو ≤ 0.
   - huge    : أكبر من MAX_AMOUNT (مستحيل لورشة) ← يُرفض.
   - confirm : أكبر من CONFIRM_AMOUNT ← يسأل المستخدم «هل الرقم صحيح؟» (غالباً أصفار زائدة).
   - ok      : يُقرَّب لخانتين.
   ========================================================================== */

export const MAX_AMOUNT = 100000000;      /* 100 مليون */
export const CONFIRM_AMOUNT = 1000000;    /* مليون */

export function roundMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/**
 * @param {*} value
 * @returns {{level:'invalid'|'huge'|'confirm'|'ok', amount:number}} amount مُقرَّب لخانتين
 */
export function checkAmount(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return { level: 'invalid', amount: 0 };
  const amount = roundMoney(raw);
  if (amount <= 0) return { level: 'invalid', amount: 0 };      /* 0.001 → 0 */
  if (amount > MAX_AMOUNT) return { level: 'huge', amount };
  if (amount > CONFIRM_AMOUNT) return { level: 'confirm', amount };
  return { level: 'ok', amount };
}
