/* ==========================================================================
   demo-data.js — بيانات تجريبية للتجربة السريعة (v3.3.40)
   ==========================================================================
   - seedDemoData(): يكتب عملاء وطلبات (بكل الحالات) ودفعات ومصروفات ومخزون (بعضه ناقص)
     وعمالاً ومواعيد وعروض أسعار — في معاملة واحدة ذرّية (كلها أو لا شيء).
   - كل سجل يحمل isDemo:true ومعرّفه يبدأ بـ «demo-»، فلا يُخلط ببياناتك الحقيقية أبداً.
   - clearDemoData(): يحذف السجلات التجريبية فقط (حذف فردي → يترك شواهد الحذف للمزامنة).
   - البيانات حتمية (نفس الناتج كل مرة) وتُحسب نسبةً لتاريخ اليوم، فتظهر دائماً «حيّة»:
     طلبات متأخرة، جاهز لم يُستلم، مستحقات، مخزون ناقص، مواعيد اليوم.
   ========================================================================== */

import * as idb from '../data/idb.js';
import { STORES } from '../core/config.js';

const DAY = 86400000;
const PREFIX = 'demo-';

/** المخازن التي قد تحوي بيانات تجريبية. */
export const DEMO_STORES = [
  STORES.CUSTOMERS, STORES.ORDERS, STORES.PAYMENTS, STORES.EXPENSES,
  STORES.INVENTORY, STORES.WORKERS, STORES.APPOINTMENTS, STORES.QUOTES,
];

export const isDemoRecord = (r) => !!r && (r.isDemo === true || String(r.id || '').startsWith(PREFIX));

/* مولّد أرقام حتمي صغير (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  'أحمد علي', 'محمد سيد', 'عبدالله حسن', 'سعيد فتحي', 'يوسف إبراهيم', 'خالد مصطفى',
  'حسن محمود', 'إسلام عادل', 'مصطفى كمال', 'أم محمد', 'هدى عبدالرحمن', 'طارق سامي',
];
const TYPES = [
  { name: 'جلابية سادة', price: 450 },
  { name: 'جلابية مطرزة', price: 750 },
  { name: 'جلابية أطفال', price: 300 },
  { name: 'جلابية صيفي', price: 400 },
  { name: 'جلابية شتوي', price: 550 },
];
const METHODS = ['cash', 'instapay', 'vodafone', 'cash'];

const pad = (n) => String(n).padStart(2, '0');
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * يبني خطة البيانات التجريبية دون كتابتها (للاختبار).
 * @param {number} [now]
 * @returns {Object<string, Array>} store → records
 */
export function buildDemoPlan(now = Date.now()) {
  const rand = rng(20261011);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => Math.round(a + rand() * (b - a));
  const today = startOfDay(now);
  const at = (daysAgo, hour = 11) => today - daysAgo * DAY + hour * 3600000;

  const plan = {};
  for (const s of DEMO_STORES) plan[s] = [];
  const add = (store, rec) => { rec.isDemo = true; plan[store].push(rec); return rec; };

  /* --- العملاء --- */
  const custs = NAMES.map((name, i) => add(STORES.CUSTOMERS, {
    id: PREFIX + 'cus-' + pad(i + 1),
    name: '🧪 ' + name,
    phone: '010000000' + pad(i + 1),
    address: i % 3 === 0 ? 'المنصورة — شارع الجمهورية' : '',
    notes: i === 0 ? 'يفضّل القماش الخفيف' : '',
    vip: i === 0 || i === 9,
    image: '',
    measurements: {
      shoulder: between(42, 50), chest: between(100, 125), waist: between(90, 120),
      hips: between(100, 125), length: between(135, 150), sleeve: between(58, 65), neck: between(38, 45),
    },
    createdAt: at(60 - i * 5, 10),
  }));

  /* --- الطلبات: (حالة، منذ كم يوماً استُلم القماش، موعد التسليم نسبةً لليوم، مدفوع كامل؟، متبقٍّ بعد التسليم) --- */
  const SPEC = [
    ['pending', 1, +6], ['pending', 0, +9], ['pending', 2, +4], ['pending', 1, +12],
    ['in_progress', 5, +2], ['in_progress', 7, +1], ['in_progress', 9, -2], ['in_progress', 12, -4], ['in_progress', 4, +5],
    ['ready', 10, -5, { readyDaysAgo: 6 }], ['ready', 8, -2, { readyDaysAgo: 4 }],
    ['ready', 6, 0, { readyDaysAgo: 1, full: true }], ['ready', 6, +1, { readyDaysAgo: 0 }],
    ['delivered', 20, -14, { deliveredDaysAgo: 14, full: true }], ['delivered', 25, -18, { deliveredDaysAgo: 18, full: true }],
    ['delivered', 18, -10, { deliveredDaysAgo: 10, keepRemaining: 0.35 }], ['delivered', 30, -26, { deliveredDaysAgo: 25, keepRemaining: 0.5 }],
    ['delivered', 14, -6, { deliveredDaysAgo: 5, full: true }], ['delivered', 40, -34, { deliveredDaysAgo: 33, full: true }],
    ['cancelled', 15, -8],
  ];
  SPEC.forEach(([status, recvAgo, dueRel, o = {}], i) => {
    const cust = custs[(i * 5 + 1) % custs.length];
    const lines = 1 + (rand() < 0.35 ? 1 : 0);
    const items = Array.from({ length: lines }, (_, k) => {
      const t = pick(TYPES);
      return { id: `${PREFIX}it-${pad(i + 1)}-${k}`, name: t.name, price: t.price, quantity: rand() < 0.2 ? 2 : 1 };
    });
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const pct = rand() < 0.2 ? 10 : 0;
    const discountAmount = r2(subtotal * pct / 100);
    const amount = r2(subtotal - discountAmount);
    const full = o.full === true;
    /* المستهدف تحصيله: المبلغ كله، أو جزء منه (يبقى الباقي مستحقاً بعد التسليم) */
    const settled = status === 'delivered' || status === 'ready';
    const target = !settled ? amount : (o.keepRemaining ? r2(amount * (1 - o.keepRemaining)) : (status === 'delivered' || full ? amount : 0));
    const share = 0.4 + rand() * 0.3;
    const deposit = settled
      ? (target > 0 ? r2(Math.round(target * share / 10) * 10) : r2(Math.round(amount * (0.3 + rand() * 0.3) / 10) * 10))
      : (status === 'pending' && rand() < 0.4 ? 0 : r2(Math.round(amount * (0.3 + rand() * 0.3) / 10) * 10));
    const orderId = PREFIX + 'ord-' + pad(i + 1);
    const due = today + dueRel * DAY + 12 * 3600000;
    const order = add(STORES.ORDERS, {
      id: orderId, customerId: cust.id, status,
      receivedDate: at(recvAgo, 10), dueDate: due,
      items, discountType: pct ? 'percent' : 'none', discountValue: pct, discountAmount,
      extraFees: [], extraFeesTotal: 0, subtotal, deposit: Math.min(deposit, amount), amount,
      cost: r2(amount * 0.55), notes: '', referenceImage: '', workPlan: null,
      createdAt: at(recvAgo, 10),
    });
    if (status === 'ready') order.readyAt = at(o.readyDaysAgo ?? 1, 15);
    if (status === 'delivered') order.deliveredAt = at(o.deliveredDaysAgo ?? 7, 16);
    if (settled) {
      const rest = r2(target - order.deposit);
      if (rest > 0) {
        add(STORES.PAYMENTS, {
          id: PREFIX + 'pay-' + pad(i + 1), customerId: cust.id, orderId, amount: rest,
          method: METHODS[i % METHODS.length], notes: '', isDeposit: false,
          createdAt: status === 'delivered' ? order.deliveredAt : at(1, 14),
        });
      }
    }
    return order;
  });

  /* --- مصروفات آخر 30 يوماً (أقل من الإيرادات التجريبية فيظهر ربح معقول) --- */
  [
    ['fabric', 1100, 3], ['fabric', 800, 11], ['thread', 180, 6], ['tools', 250, 14],
    ['rent', 900, 20], ['electricity', 320, 9], ['water', 70, 9], ['salary', 700, 2], ['salary', 500, 12], ['other', 120, 5],
  ].forEach(([category, amount, ago], i) => add(STORES.EXPENSES, {
    id: PREFIX + 'exp-' + pad(i + 1), category, amount, date: at(ago, 12), notes: '', createdAt: at(ago, 12),
  }));

  /* --- المخزون (3 أصناف ناقصة) --- */
  [
    ['قماش قطن أبيض', 'fabric', 4, 15, 85, 'متر'], ['قماش كتان بيج', 'fabric', 22, 10, 120, 'متر'],
    ['قماش شتوي رمادي', 'fabric', 3, 12, 140, 'متر'], ['خيط أبيض', 'thread', 30, 10, 12, 'بكرة'],
    ['خيط بيج', 'thread', 2, 8, 12, 'بكرة'], ['أزرار صدف', 'button', 120, 50, 2, 'قطعة'],
    ['سحابات', 'accessory', 45, 20, 8, 'قطعة'], ['مقص قص', 'tool', 2, 1, 350, 'قطعة'],
  ].forEach(([name, category, quantity, minQuantity, price, unit], i) => add(STORES.INVENTORY, {
    id: PREFIX + 'inv-' + pad(i + 1), name: '🧪 ' + name, category, quantity, minQuantity, price, unit, notes: '', createdAt: at(30, 10),
  }));

  /* --- العمال --- */
  [
    ['الأسطى رمضان', 'خياط', 'per_piece', 120], ['عم سيد', 'كوّاي', 'daily', 150], ['منى', 'مطرّزة', 'fixed', 3500],
  ].forEach(([name, specialty, salaryType, salary], i) => add(STORES.WORKERS, {
    id: PREFIX + 'wrk-' + pad(i + 1), name: '🧪 ' + name, phone: '011000000' + pad(i + 1), specialty, salaryType, salary,
    notes: '', active: true, createdAt: at(90, 10),
  }));

  /* --- المواعيد: ثلاثة اليوم (واحد منتهٍ) + غداً + بعد 3 أيام --- */
  [
    ['قياس مقاسات', 0, 10, 'done'], ['استلام طلب', 0, 15, 'scheduled'], ['معاينة قماش', 0, 18, 'scheduled'],
    ['قياس مقاسات', 1, 11, 'scheduled'], ['تسليم طلب', 3, 16, 'scheduled'],
  ].forEach(([title, daysAhead, hour, status], i) => add(STORES.APPOINTMENTS, {
    id: PREFIX + 'apt-' + pad(i + 1), title, customerId: custs[(i * 3) % custs.length].id,
    date: today + daysAhead * DAY + hour * 3600000, status, notes: '', createdAt: at(2, 10),
  }));

  /* --- عرضا سعر --- */
  [[0, [TYPES[0], TYPES[1]], 0], [4, [TYPES[3]], 50]].forEach(([ci, types, discount], i) => add(STORES.QUOTES, {
    id: PREFIX + 'qt-' + pad(i + 1), customerId: custs[ci].id, status: 'open', discount, notes: '',
    items: types.map((t, k) => ({ id: `${PREFIX}qi-${i}-${k}`, name: t.name, price: t.price, quantity: 1 })),
    validUntil: today + (7 + i * 7) * DAY, createdAt: at(1 + i, 12),
  }));

  return plan;
}

/** عدد السجلات التجريبية في كل مخزن (وإجماليها). */
export async function countDemoData() {
  const byStore = {};
  let total = 0;
  for (const s of DEMO_STORES) {
    let list = [];
    try { list = await idb.getAll(s); } catch { /* مخزن غير موجود */ }
    const n = list.filter(isDemoRecord).length;
    if (n) { byStore[s] = n; total += n; }
  }
  return { total, byStore };
}

/** يحمّل البيانات التجريبية (يحذف القديمة منها أولاً فلا تتكرر). */
export async function seedDemoData(now = Date.now()) {
  await clearDemoData();
  const plan = buildDemoPlan(now);
  const batch = {};
  for (const [store, records] of Object.entries(plan)) batch[store] = { records };
  await idb.writeBatch(batch);
  const counts = {};
  for (const [store, records] of Object.entries(plan)) counts[store] = records.length;
  return { total: Object.values(counts).reduce((a, b) => a + b, 0), byStore: counts };
}

/** يحذف السجلات التجريبية فقط، ولا يلمس أي سجل حقيقي. */
export async function clearDemoData() {
  let removed = 0;
  for (const s of DEMO_STORES) {
    let list = [];
    try { list = await idb.getAll(s); } catch { continue; }
    for (const r of list) {
      if (!isDemoRecord(r)) continue;
      await idb.remove(s, r.id);
      removed++;
    }
  }
  return removed;
}
