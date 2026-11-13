/* ==========================================================================
   qitan-calc.js — حاسبة القيطان الخام (v3.19.0) — دوال نقية بلا DOM
   ==========================================================================
   القاعدة الثابتة: كل 1.70 م من القيطان الخام تنتج 1.30 م من المنتج النهائي (الفاقد في الفتل والتثبيت).
     معامل التحويل = 1.70 ÷ 1.30 ≈ 1.30769
     الخام المطلوب = الطول النهائي × المعامل
     الموصى بشراؤه = الخام المطلوب × (1 + هامش الأمان%)  — الهامش (افتراضي 5%، المعتاد 5–10%) يغطي الفينش والعُقد وأطراف التثبيت.
   تقبل الطول بالسنتيمتر أو المتر، وعدد القطع (يُضرب في الطول الواحد). المخرجات بالأمتار مقرَّبة لـ 3 خانات.
   أي مدخل غير صالح ⟵ { ok:false, error } بلا استثناء، ولا يُخمَّن شيء.
   ========================================================================== */

export const QITAN_RAW_M = 1.70;
export const QITAN_FINAL_M = 1.30;
export const QITAN_RATIO = QITAN_RAW_M / QITAN_FINAL_M;   /* 1.3076923… */
export const DEFAULT_MARGIN_PCT = 5;
export const MAX_MARGIN_PCT = 30;
export const MAX_QTY = 999;
export const MARGIN_PRESETS = Object.freeze([0, 5, 7.5, 10]);

const r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v) => (v === '' || v == null ? NaN : Number(v));

/** يحوّل الطول إلى متر. الوحدات: 'm' (متر) · 'cm' (سنتيمتر). غير ذلك ⟵ NaN. */
export function toMeters(value, unit = 'm') {
  const v = num(value);
  if (!Number.isFinite(v)) return NaN;
  if (unit === 'cm') return v / 100;
  if (unit === 'm') return v;
  return NaN;
}

/**
 * @param {{finalLength:number|string, unit?:'m'|'cm', marginPct?:number|string, quantity?:number|string}} a
 * @returns {{ok:true, finalM:number, quantity:number, totalFinalM:number, exactRawM:number, recommendedRawM:number, extraM:number,
 *            marginPct:number, ratio:number, recommendedCm:number} | {ok:false, error:string}}
 */
export function calcQitan(a = {}) {
  const finalM = toMeters(a.finalLength, a.unit || 'm');
  if (!Number.isFinite(finalM)) return { ok: false, error: 'أدخل الطول النهائي المطلوب بأرقام' };
  if (finalM <= 0) return { ok: false, error: 'الطول النهائي يجب أن يكون أكبر من صفر' };
  let margin = a.marginPct === undefined || a.marginPct === '' ? DEFAULT_MARGIN_PCT : num(a.marginPct);
  if (!Number.isFinite(margin)) margin = DEFAULT_MARGIN_PCT;
  margin = Math.min(MAX_MARGIN_PCT, Math.max(0, margin));
  let q = a.quantity === undefined || a.quantity === '' ? 1 : Math.floor(num(a.quantity));
  if (!Number.isFinite(q) || q < 1) q = 1;
  q = Math.min(MAX_QTY, q);

  const totalFinal = finalM * q;
  const exact = totalFinal * QITAN_RATIO;
  const recommended = exact * (1 + margin / 100);
  /* الأرقام المعروضة تتّسق حسابياً: الخام + الهامش = الموصى به (الفرق من المقرَّبين لا من الأصليين) */
  const exactR = r3(exact); const recR = r3(recommended);
  return {
    ok: true, finalM: r3(finalM), quantity: q, totalFinalM: r3(totalFinal),
    exactRawM: exactR, recommendedRawM: recR, extraM: r3(recR - exactR),
    marginPct: margin, ratio: r3(QITAN_RATIO), recommendedCm: Math.round(recommended * 100),
  };
}
