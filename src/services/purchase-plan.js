/* ==========================================================================
   purchase-plan.js — اقتراح المشتريات من الطلبات المفتوحة (v3.19.0) — دوال نقية
   ==========================================================================
   يربط ثلاثة أشياء كانت منفصلة: الطلبات المفتوحة ⟵ القماش اللازم (قوالب حاسبة القماش) ⟵ المخزون ⟵ أرخص مورد.
   ⚠️ تقدير لا قياس: الطلبات لا تحفظ مقاس كل عميل، فيُحسب لكل قطعة بـ«متوسط الطول» الذي تحدده أنت (افتراضي 150 سم)،
      وتُطابَق بنود الطلب مع قوالب الحاسبة بالاسم؛ ما لا يطابق قالباً يُذكر ولا يُخمَّن.
   المقارنة على مستوى «إجمالي القماش بالمتر» لأن الطلب لا يحدد قماشاً بعينه.
   ========================================================================== */

import { calcFabric } from './fabric-calc.js';
import { normalizeItemName } from './item-catalog.js';
import { priceBoard } from './suppliers.js';

const DAY = 86400000;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
export const DEFAULT_AVG_HEIGHT_CM = 150;
const ymdOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const isMeters = (u) => { const k = String(u || '').trim(); return !k || /متر|^م$|^m$/i.test(k); };

/** أفضل قالب يطابق اسم البند (الأطول اسماً أولاً). */
export function matchTemplate(itemName, templates) {
  const k = normalizeItemName(itemName); if (!k) return null;
  const list = (Array.isArray(templates) ? templates : []).filter((t) => t && t.name).map((t) => ({ t, key: normalizeItemName(t.name) })).filter((x) => x.key).sort((a, b) => b.key.length - a.key.length);
  for (const x of list) if (k.includes(x.key) || x.key.includes(k)) return x.t;
  return null;
}

/**
 * @param {{now?:number, orders?:Array, templates?:Array, fabricCfg?:Object, avgHeightCm?:number, inventory?:Array, suppliers?:Array, entries?:Array}} s
 */
export function buildPurchasePlan(input = {}) {
  const s = input || {};
  const now = n(s.now) || Date.now();
  const avg = n(s.avgHeightCm) > 0 ? n(s.avgHeightCm) : DEFAULT_AVG_HEIGHT_CM;
  const cfg = s.fabricCfg || {};
  const orders = (Array.isArray(s.orders) ? s.orders : []).filter((o) => o && (o.status === 'pending' || o.status === 'in_progress') && Array.isArray(o.items));

  const byTpl = new Map(); const unmatched = new Map();
  let pieces = 0; let matchedPieces = 0; let needRaw = 0; let earliest = 0;
  for (const o of orders) {
    let usedFabric = false;
    for (const it of o.items) {
      const q = Math.max(1, Math.floor(n(it && it.quantity) || 1));
      pieces += q;
      const t = matchTemplate(it && it.name, s.templates);
      if (!t) { const key = normalizeItemName(it && it.name) || 'بند'; const u = unmatched.get(key) || { name: String((it && it.name) || 'بند'), qty: 0 }; u.qty += q; unmatched.set(key, u); continue; }
      const r = calcFabric(t, avg, q, { wastePercent: cfg.wastePercent, roundTo: 0 });
      matchedPieces += q; needRaw += r.totalM; usedFabric = true;
      const row = byTpl.get(t.id || t.name) || { name: t.name, pieces: 0, meters: 0 }; row.pieces += q; row.meters += r.totalM; byTpl.set(t.id || t.name, row);
    }
    if (usedFabric && n(o.dueDate) > 0 && (!earliest || n(o.dueDate) < earliest)) earliest = n(o.dueDate);
  }
  const roundTo = n(cfg.roundTo);
  const needM = r2(roundTo > 0 ? Math.ceil(needRaw / roundTo - 1e-9) * roundTo : needRaw);

  const inv = Array.isArray(s.inventory) ? s.inventory : [];
  let stockM = 0; let otherUnits = 0;
  for (const i of inv) { if (!i || i.category !== 'fabric') continue; if (isMeters(i.unit)) stockM += n(i.quantity); else otherUnits++; }
  stockM = r2(stockM);
  const shortM = r2(Math.max(0, needM - stockM));

  /* أرخص مورد: أقل متوسط لآخر سعر متر عبر الأصناف التي يوردها */
  const board = priceBoard(s.suppliers, s.entries, { max: 100 });
  const per = new Map();
  for (const row of board) for (const r of row.rows) { const x = per.get(r.supplierId) || { id: r.supplierId, name: r.name, sum: 0, count: 0 }; x.sum += n(r.lastPrice); x.count++; per.set(r.supplierId, x); }
  const best = [...per.values()].map((x) => ({ ...x, avg: r2(x.sum / x.count) })).sort((a, b) => a.avg - b.avg || b.count - a.count)[0] || null;
  const supplier = best ? { id: best.id, name: best.name, pricePerM: best.avg, estCost: shortM > 0 ? r2(shortM * best.avg) : 0 } : null;

  /* نواقص بقية المخزون (أقل من الحد الأدنى) */
  const lowItems = inv.filter((i) => i && n(i.minQuantity) > 0 && n(i.quantity) < n(i.minQuantity) && !(i.category === 'fabric' && isMeters(i.unit)))
    .map((i) => ({ name: String(i.name || 'صنف'), quantity: n(i.quantity), minQuantity: n(i.minQuantity), unit: String(i.unit || ''), short: r2(n(i.minQuantity) - n(i.quantity)) }))
    .sort((a, b) => b.short - a.short);
  /* القماش بالمتر تحت الحد الأدنى يُعامل كنقص أيضاً */
  const lowFabric = inv.filter((i) => i && i.category === 'fabric' && isMeters(i.unit) && n(i.minQuantity) > 0 && n(i.quantity) < n(i.minQuantity))
    .map((i) => ({ name: String(i.name || 'قماش'), quantity: n(i.quantity), minQuantity: n(i.minQuantity), unit: String(i.unit || 'متر'), short: r2(n(i.minQuantity) - n(i.quantity)) }));

  const orderBy = earliest && shortM > 0 ? ymdOf(earliest - 2 * DAY) : '';
  const assumptions = ['تقدير بمتوسط طول ' + avg + ' سم للقطعة (غيّره حسب زبائنك).'];
  if (otherUnits) assumptions.push(otherUnits + ' صنف قماش بوحدة غير المتر لم يُحتسب في المخزون.');
  if (!n(cfg.wastePercent)) assumptions.push('بلا نسبة هالك (يمكن ضبطها في حاسبة القماش).');
  return {
    orders: orders.length, pieces, matchedPieces, needM, stockM, shortM, orderBy,
    byTemplate: [...byTpl.values()].map((r) => ({ ...r, meters: r2(r.meters) })).sort((a, b) => b.meters - a.meters),
    unmatched: [...unmatched.values()].sort((a, b) => b.qty - a.qty),
    supplier, lowItems: [...lowFabric, ...lowItems], assumptions,
    usable: (Array.isArray(s.templates) ? s.templates : []).length > 0,
    avgHeightCm: avg, now,
  };
}
