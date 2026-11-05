/* ==========================================================================
   fabric-calc.js — حاسبة استهلاك القماش (v3.7.0)
   ==========================================================================
   طول القماش للقطعة = (طول العميل + زيادة) × مضاعف − خصم   (بالسنتيمتر)
   لكل نوع قطعة قالب (زيادة · مضاعف · خصم) يُسجَّل مرة واحدة. بعد ذلك:
   × عدد القطع، + نسبة هالك اختيارية، وتقريب لأعلى لأقرب 0.1/0.25/0.5 متر اختيارياً.
   دوال نقية بلا DOM/IndexedDB. القوالب تُحفظ في settings.fabricCalc (وتتزامن مع الأجهزة).
   ========================================================================== */

export const MAX_TEMPLATES = 30;
export const MAX_NAME = 40;
export const ROUND_OPTIONS = [0, 0.1, 0.25, 0.5];   /* بالمتر؛ 0 = بلا تقريب */
export const MAX_WASTE = 50;

const finite = (v, d) => { const n = Number(v); return isFinite(n) ? n : d; };
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const r2 = (n) => Math.round(n * 100) / 100;

export function newTemplateId() {
  return 'fab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** قالب صالح أو null (الاسم مطلوب). قيم خارج المدى تُقصّ. */
export function normalizeTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  const name = typeof t.name === 'string' ? t.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!name) return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : newTemplateId(),
    name,
    addCm: r2(clamp(finite(t.addCm, 0), -200, 500)),
    multiplier: r2(clamp(finite(t.multiplier, 1), 0.1, 10)),
    subtractCm: r2(clamp(finite(t.subtractCm, 0), 0, 1000)),
  };
}

/** إعدادات الحاسبة بقيم آمنة. */
export function normalizeFabricConfig(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const seen = new Set();
  const templates = [];
  for (const raw of Array.isArray(c.templates) ? c.templates : []) {
    const t = normalizeTemplate(raw);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    templates.push(t);
    if (templates.length >= MAX_TEMPLATES) break;
  }
  const waste = finite(c.wastePercent, 0);
  const roundTo = ROUND_OPTIONS.includes(Number(c.roundTo)) ? Number(c.roundTo) : 0;
  return { templates, wastePercent: r2(clamp(waste, 0, MAX_WASTE)), roundTo };
}

/** طول القماش لقطعة واحدة بالسم (لا يقل عن صفر). */
export function perPieceCm(template, heightCm) {
  const t = template || {};
  const h = Math.max(0, finite(heightCm, 0));
  return Math.max(0, (h + finite(t.addCm, 0)) * finite(t.multiplier, 1) - finite(t.subtractCm, 0));
}

/**
 * الحساب الكامل.
 * @param {Object} template
 * @param {number} heightCm
 * @param {number} qty — عدد القطع (≥ 1)
 * @param {{wastePercent?:number, roundTo?:number}} [cfg]
 * @param {number} [meterPrice] — لتقدير التكلفة (0 = بلا)
 */
export function calcFabric(template, heightCm, qty, cfg, meterPrice = 0) {
  const c = normalizeFabricConfig({ ...(cfg || {}), templates: [] });
  const q = Math.max(1, Math.floor(finite(qty, 1)));
  const one = perPieceCm(template, heightCm);
  const baseCm = one * q;
  const totalCm = baseCm * (1 + c.wastePercent / 100);
  const totalM = totalCm / 100;
  const billedM = c.roundTo > 0 ? Math.ceil(totalM / c.roundTo - 1e-9) * c.roundTo : totalM;
  const price = Math.max(0, finite(meterPrice, 0));
  return {
    qty: q,
    perPieceCm: r2(one),
    perPieceM: r2(one / 100),
    baseCm: r2(baseCm),
    totalCm: r2(totalCm),
    totalM: r2(totalM),
    billedM: r2(billedM),
    cost: price > 0 ? r2(billedM * price) : 0,
  };
}

/** نص المعادلة للعرض: (150 + 10) × 2 − 30 */
export function formulaText(template, heightCm) {
  const t = template || {};
  return '(' + finite(heightCm, 0) + (finite(t.addCm, 0) < 0 ? ' − ' + Math.abs(finite(t.addCm, 0)) : ' + ' + finite(t.addCm, 0)) + ') × ' + finite(t.multiplier, 1) + ' − ' + finite(t.subtractCm, 0);
}
