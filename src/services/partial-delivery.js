/* ==========================================================================
   partial-delivery.js — التسليم الجزئي للطلب (v3.3.59)
   ==========================================================================
   العميل قد يستلم جزءاً من الطلب (قطعتين من خمس) ويأتي لاحقاً للباقي.
   النموذج: order.deliveries = [{ id, at, items:[{id, qty}], note?, signature? }]
   - الوحدة = قطعة من بند (الكمية quantity). المسلَّم لكل بند = مجموع كميات التسليمات (بسقف كميته).
   - الطلب يبقى «جاهزاً/قيد التنفيذ» حتى تُسلَّم كل الوحدات، وعندها status='delivered' و deliveredAt = وقت آخر تسليم.
   - طلب بلا deliveries = سلوك التسليم الكامل القديم (لا تتغير بياناته).
   - طلب قديم بلا items: بند واحد افتراضي (id = '__single__') بكمية order.quantity.
   - قيمة المسلَّم = نصيبه من مبلغ الطلب الصافي (بعد الخصم والرسوم) بنسبة قيمة البنود.
   دوال نقية بلا DOM ولا قاعدة بيانات.
   ========================================================================== */

import { deliveryHasSignature } from './order-media.js';
import { uid } from '../core/utils.js';

export const SINGLE_ID = '__single__';

const toQty = (v) => Math.max(1, Math.round(Number(v)) || 1);
const cents = (v) => Math.round((Number(v) || 0) * 100);

/**
 * بنود الطلب كوحدات: [{id, name, price, quantity}]
 * @param {Object} order
 */
export function orderLines(order) {
  const items = Array.isArray(order && order.items) ? order.items : [];
  if (items.length > 0) {
    return items.map((it, i) => ({
      id: (it && it.id) || ('idx' + i),
      name: String((it && it.name) || 'بند'),
      price: Number(it && it.price) || 0,
      quantity: toQty(it && it.quantity),
    }));
  }
  return [{
    id: SINGLE_ID,
    name: String((order && (order.notes || order.garmentType)) || 'طلب جلابية'),
    price: Number(order && order.amount) || 0,
    quantity: toQty(order && order.quantity),
  }];
}

/** تسليمات الطلب بترتيب زمني (نسخة منظَّفة بلا عناصر غير صالحة). */
function cleanDeliveries(order) {
  const list = Array.isArray(order && order.deliveries) ? order.deliveries : [];
  return list
    .filter((d) => d && Array.isArray(d.items))
    .map((d) => ({
      ...d,
      at: Number(d.at) || 0,
      items: d.items.filter((e) => e && e.id != null && Number(e.qty) > 0)
        .map((e) => ({ id: e.id, qty: Math.round(Number(e.qty)) })),
    }))
    .filter((d) => d.items.length > 0)
    .sort((a, b) => a.at - b.at);
}

/**
 * تقدّم التسليم.
 * @param {Object} order
 * @returns {{
 *   state:'none'|'partial'|'full', totalUnits:number, deliveredUnits:number, remainingUnits:number,
 *   percent:number, lines:Array<{id,name,price,quantity,delivered,remaining}>,
 *   deliveredValue:number, remainingValue:number,
 *   history:Array<{id,at,note:string,hasSignature:boolean,units:number,items:Array<{id,name,qty}>}>
 * }}
 */
export function deliveryProgress(order) {
  const lines = orderLines(order);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const got = new Map(lines.map((l) => [l.id, 0]));
  const deliveries = cleanDeliveries(order);
  const isFull = !!order && order.status === 'delivered';

  const history = [];
  for (const d of deliveries) {
    const items = [];
    for (const e of d.items) {
      const line = byId.get(e.id);
      if (!line) continue;
      const take = Math.min(e.qty, line.quantity - got.get(e.id));
      if (take <= 0) continue;
      got.set(e.id, got.get(e.id) + take);
      items.push({ id: e.id, name: line.name, qty: take });
    }
    if (items.length > 0) {
      history.push({
        id: d.id, at: d.at, note: String(d.note || ''), hasSignature: deliveryHasSignature(d),
        units: items.reduce((s, x) => s + x.qty, 0), items,
      });
    }
  }

  const outLines = lines.map((l) => {
    const delivered = isFull ? l.quantity : got.get(l.id);
    return { ...l, delivered, remaining: l.quantity - delivered };
  });
  const totalUnits = outLines.reduce((s, l) => s + l.quantity, 0);
  const deliveredUnits = outLines.reduce((s, l) => s + l.delivered, 0);
  const grossTotal = outLines.reduce((s, l) => s + cents(l.price) * l.quantity, 0);
  const grossDelivered = outLines.reduce((s, l) => s + cents(l.price) * l.delivered, 0);
  const share = grossTotal > 0 ? grossDelivered / grossTotal : (totalUnits > 0 ? deliveredUnits / totalUnits : 0);
  const amountC = cents(order && order.amount);
  const deliveredC = Math.round(amountC * share);

  return {
    state: deliveredUnits >= totalUnits ? 'full' : deliveredUnits > 0 ? 'partial' : 'none',
    totalUnits, deliveredUnits, remainingUnits: totalUnits - deliveredUnits,
    percent: totalUnits > 0 ? Math.round((deliveredUnits / totalUnits) * 100) : 0,
    lines: outLines,
    deliveredValue: deliveredC / 100,
    remainingValue: (amountC - deliveredC) / 100,
    history,
  };
}

/** هل يمكن تسليم جزء الآن؟ (طلب نشط جاهز/قيد التنفيذ وفيه قطعتان فأكثر وما زال فيه متبقٍ) */
export function canPartialDeliver(order) {
  if (!order || (order.status !== 'ready' && order.status !== 'in_progress')) return false;
  const p = deliveryProgress(order);
  return p.totalUnits >= 2 && p.remainingUnits >= 1;
}

/** نص شارة للبطاقة: «🚚 سُلِّم 2 من 5» (فارغ إن لا تسليم جزئي). */
export function deliveryBadgeText(order) {
  const p = deliveryProgress(order);
  return p.state === 'partial' ? '🚚 سُلِّم ' + p.deliveredUnits + ' من ' + p.totalUnits : '';
}

/**
 * التحقق من اختيار تسليم.
 * @param {Object} order
 * @param {Object<string,number>} selection — { معرّف البند: الكمية }
 * @returns {{ok:true, entries:Array<{id,qty}>, units:number, completes:boolean}|{ok:false, error:string}}
 */
export function planDelivery(order, selection) {
  const prog = deliveryProgress(order);
  const entries = [];
  for (const line of prog.lines) {
    const raw = selection ? selection[line.id] : 0;
    if (raw === undefined || raw === null || raw === '') continue;
    const q = Number(raw);
    if (!Number.isFinite(q) || q < 0 || Math.floor(q) !== q) {
      return { ok: false, error: 'كمية غير صالحة للبند «' + line.name + '»' };
    }
    if (q === 0) continue;
    if (q > line.remaining) {
      return { ok: false, error: 'الكمية أكبر من المتبقي للبند «' + line.name + '» (المتبقي ' + line.remaining + ')' };
    }
    entries.push({ id: line.id, qty: q });
  }
  if (entries.length === 0) return { ok: false, error: 'اختر قطعة واحدة على الأقل للتسليم' };
  const units = entries.reduce((s, e) => s + e.qty, 0);
  return { ok: true, entries, units, completes: units >= prog.remainingUnits };
}

/**
 * يبني ما يُكتب على الطلب عند تسليم جزء (أو آخر جزء).
 * @param {Object} order
 * @param {Object<string,number>} selection
 * @param {Object} [opts] { now, note, signature, id }
 * @returns {{ok:true, patch:Object, completes:boolean, units:number, remainingUnits:number}|{ok:false, error:string}}
 */
export function applyDelivery(order, selection, opts = {}) {
  const plan = planDelivery(order, selection);
  if (!plan.ok) return plan;
  const now = Number(opts.now) || Date.now();
  const delivery = { id: opts.id || uid(), at: now, items: plan.entries };
  if (opts.note && String(opts.note).trim()) delivery.note = String(opts.note).trim();
  if (opts.signature) delivery.signature = opts.signature;

  const patch = { deliveries: [...(Array.isArray(order.deliveries) ? order.deliveries : []), delivery] };
  if (plan.completes) {
    patch.status = 'delivered';
    patch.deliveredAt = now;
    if (opts.signature) patch.signature = opts.signature;
  }
  const remainingUnits = deliveryProgress(order).remainingUnits - plan.units;
  return { ok: true, patch, completes: plan.completes, units: plan.units, remainingUnits };
}

/**
 * تسليم كل المتبقي (التسليم الكامل). بلا تسليمات سابقة: الصيغة القديمة (لا deliveries)؛
 * وإلا تُضاف تسليمة أخيرة بالمتبقي حتى يكتمل السجل.
 * @param {Object} order
 * @param {Object} [opts] { now, signature, id }
 * @returns {Object} patch
 */
export function completeRemaining(order, opts = {}) {
  const now = Number(opts.now) || Date.now();
  const patch = { status: 'delivered', deliveredAt: now };
  if (opts.signature) patch.signature = opts.signature;
  const hadHistory = cleanDeliveries(order).length > 0;
  if (!hadHistory) return patch;

  const prog = deliveryProgress({ ...order, status: order.status === 'delivered' ? 'ready' : order.status });
  const entries = prog.lines.filter((l) => l.remaining > 0).map((l) => ({ id: l.id, qty: l.remaining }));
  if (entries.length > 0) {
    const delivery = { id: opts.id || uid(), at: now, items: entries };
    if (opts.signature) delivery.signature = opts.signature;
    patch.deliveries = [...(Array.isArray(order.deliveries) ? order.deliveries : []), delivery];
  }
  return patch;
}

/**
 * تنظيف التسليمات بعد تعديل بنود الطلب: يُسقط بنوداً حُذفت ويخفّض كميات تجاوزت الكمية الجديدة
 * (من الأحدث للأقدم). يربط تسليمات الطلب القديم (بند افتراضي) ببند الطلب الوحيد الجديد.
 * @param {Object} order — الطلب الحالي (بتسليماته)
 * @param {Array} newItems — البنود بعد التعديل
 * @returns {Array} تسليمات منظَّفة (قد تكون فارغة)
 */
export function sanitizeDeliveries(order, newItems) {
  const lines = orderLines({ items: newItems });
  const hasRealItems = Array.isArray(newItems) && newItems.length > 0;
  const ids = new Set(lines.map((l) => l.id));
  const qtyOf = new Map(lines.map((l) => [l.id, l.quantity]));
  const used = new Map(lines.map((l) => [l.id, 0]));
  const out = [];
  for (const d of cleanDeliveries(order)) {
    const entries = [];
    for (const e of d.items) {
      let id = e.id;
      if (id === SINGLE_ID && hasRealItems && lines.length === 1) id = lines[0].id;
      if (!ids.has(id)) continue;
      const take = Math.min(e.qty, qtyOf.get(id) - used.get(id));
      if (take <= 0) continue;
      used.set(id, used.get(id) + take);
      entries.push({ id, qty: take });
    }
    if (entries.length > 0) out.push({ ...d, items: entries });
  }
  return out;
}
