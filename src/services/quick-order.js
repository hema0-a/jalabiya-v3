/* ==========================================================================
   quick-order.js — إدخال طلب بجملة واحدة (v3.19.0) — دوال نقية بلا DOM ولا شبكة ولا ذكاء اصطناعي خارجي
   ==========================================================================
   «جلابية محمد 600 الخميس عربون 200» ⟵ مسودة طلب جاهزة للمراجعة (تُفتح في نموذج الطلب نفسه، فلا حفظ بلا مراجعة).
   يفهم: العميل (مطابقة بالاسم من عملائك) · نوع القطعة (من أنواعك وأسماء طلباتك السابقة) · العدد · السعر الكلي أو للقطعة
         · العربون · موعد التسليم (بكرة · بعد 3 أيام · الخميس · يوم 15 · 15/12) — أرقام عربية وهندية وكلمات الأعداد الشائعة.
   مبدأ الأمان: ما لم يُفهم بوضوح يُترك فارغاً مع تحذير بالعربية، ولا يُخمَّن عميل عند التعادل (يُعرض المرشحون).
   ========================================================================== */

import { normalizeItemName } from './item-catalog.js';

const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
export const normalizeDigits = (s) => String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] || d).replace(/[٫]/g, '.').replace(/[،]/g, ' ');

const WORD_NUM = { واحد: 1, واحده: 1, اتنين: 2, اثنين: 2, اثنان: 2, تلاته: 3, ثلاثه: 3, اربعه: 4, خمسه: 5, سته: 6, سبعه: 7, تمانيه: 8, ثمانيه: 8, تسعه: 9, عشره: 10 };
const WEEKDAYS = { الاحد: 0, الاثنين: 1, الاتنين: 1, الثلاثاء: 2, التلات: 2, الاربعاء: 3, الخميس: 4, الجمعه: 5, السبت: 6 };
const STOP = new Set(['عميل', 'العميل', 'السيد', 'الاستاذ', 'استاذ', 'طلب', 'جديد', 'اعمل', 'عايز', 'عاوز', 'سجل', 'اضف', 'ضيف', 'من', 'عند', 'الي', 'على', 'في', 'و', 'ال', 'ب', 'بـ', 'جنيه', 'جم', 'ج', 'قطعه', 'قطع', 'يوم', 'للواحده', 'للواحد', 'للقطعه']);
const DEFAULT_GARMENTS = ['جلابيه', 'جلابيات', 'عباءه', 'عباية', 'قميص', 'بنطلون', 'طقم', 'بدله', 'فستان', 'ثوب', 'عبايه', 'سديري', 'كاب'];

const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
export const ymdOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); return x; };
const wordOrNum = (t) => { const v = String(t || '').trim(); if (/^\d+$/.test(v)) return Number(v); const k = normalizeItemName(v); return WORD_NUM[k] || WORD_NUM[k + 'ه'] || 0; };

/** يوم/شهر صالح ⟵ تاريخ ymd في السنة المناسبة (القادم)، وإلا null. */
function dateFromDM(day, month, now, year) {
  if (!(day >= 1 && day <= 31)) return null;
  let y = year ? (year < 100 ? 2000 + year : year) : now.getFullYear();
  const mk = (yy) => { const d = new Date(yy, month - 1, day, 12); return d.getMonth() === month - 1 && d.getDate() === day ? d : null; };
  let d = mk(y);
  if (d && !year && d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) { y += 1; d = mk(y); }
  return d;
}

/** يستخرج موعد التسليم ويعيد النص بعد حذفه. */
function takeDate(w, now) {
  let m;
  const cut = (re) => { const r = w.replace(re, ' '); return r; };
  if ((m = /بعد\s*(?:بكر[هة]|غد[اً]?)/.exec(w))) return { date: addDays(now, 2), rest: cut(m[0]) };
  if ((m = /بعد\s*(\d+|[\u0621-\u064A]+)\s*(?:ايام|يوم|أيام)/.exec(w)) && wordOrNum(m[1])) return { date: addDays(now, wordOrNum(m[1])), rest: cut(m[0]) };
  if ((m = /بعد\s*(اسبوعين|أسبوعين)/.exec(w))) return { date: addDays(now, 14), rest: cut(m[0]) };
  if ((m = /بعد\s*(?:(\d+)\s*)?(?:اسبوع|أسبوع|اسابيع|أسابيع)/.exec(w))) return { date: addDays(now, 7 * (Number(m[1]) || 1)), rest: cut(m[0]) };
  if ((m = /(?<![\u0600-\u06FF])(?:بكر[هة]|غدا|غداً)(?![\u0600-\u06FF])/.exec(w))) return { date: addDays(now, 1), rest: cut(m[0]) };
  if ((m = /(?<![\u0600-\u06FF])(?:النهارد[هة]|اليوم)(?![\u0600-\u06FF])/.exec(w))) return { date: addDays(now, 0), rest: cut(m[0]) };
  const wd = /(?:يوم\s*)?(الاحد|الاثنين|الاتنين|الثلاثاء|التلات|الاربعاء|الخميس|الجمعه|السبت)(?:\s*(?:الجاي[هة]?|القادم[هة]?))?/.exec(normalizeItemName(w));
  if (wd) {
    const delta = ((WEEKDAYS[wd[1]] - now.getDay()) + 7) % 7 || 7;
    const re = new RegExp('(?:يوم\\s*)?' + wd[1].replace(/ا/g, '[اأإآ]').replace(/ه$/, '[هة]') + '(?:\\s*(?:الجاي[هة]?|القادم[هة]?))?');
    return { date: addDays(now, delta), rest: w.replace(re, ' ') };
  }
  if ((m = /(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/.exec(w))) {
    const d = dateFromDM(Number(m[1]), Number(m[2]), now, m[3] ? Number(m[3]) : 0);
    if (d) return { date: d, rest: cut(m[0]) };
  }
  if ((m = /يوم\s*(\d{1,2})(?!\d)/.exec(w))) {
    const day = Number(m[1]);
    let d = dateFromDM(day, now.getMonth() + 1, now, 0);
    if (d && d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) d = dateFromDM(day, now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2, now, 0);
    if (d) return { date: d, rest: cut(m[0]) };
  }
  return { date: null, rest: w };
}

/**
 * @param {string} text
 * @param {{customers?:Array<{id:*,name:string}>, catalog?:Array<{name:string, price?:number}>, now?:number|Date}} [ctx]
 * @returns {{ok:boolean, customerId:*, customerName:string, candidates:Array, items:Array<{name:string,quantity:number,price:number}>,
 *            total:number, deposit:number, dueDate:string, warnings:string[], found:Object}}
 */
export function parseQuickOrder(text, context = {}) {
  const ctx = context || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const customers = Array.isArray(ctx.customers) ? ctx.customers.filter((c) => c && c.name) : [];
  const catalog = Array.isArray(ctx.catalog) ? ctx.catalog.filter((c) => c && c.name) : [];
  const warnings = [];
  const out = { ok: false, customerId: null, customerName: '', candidates: [], items: [], total: 0, deposit: 0, dueDate: '', warnings, found: { customer: false, item: false, price: false, date: false } };

  let w = normalizeDigits(text).replace(/[\u064B-\u065F\u0670\u0640]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!w) { warnings.push('اكتب الطلب في جملة، مثل: جلابية محمد 600 الخميس عربون 200'); return out; }

  /* 1) العربون */
  let m = /(?:عربون|مقدم|مدفوع|دفع(?:ت|ة)?|دافع)\s*(?:مبلغ\s*)?(\d+(?:\.\d+)?)/.exec(w);
  if (m) { out.deposit = r2(Number(m[1])); w = w.replace(m[0], ' '); }

  /* 2) الموعد */
  const dt = takeDate(w, now);
  if (dt.date) { out.dueDate = ymdOf(dt.date); out.found.date = true; w = dt.rest; }

  /* 3) السعر (كلي أو للقطعة) */
  let unitPrice = false; let price = 0;
  m = /(\d+(?:\.\d+)?)\s*(?:جنيه|جم|ج\.م|ج)?\s*(للواحد[هة]?|للقطع[هة]|الواحد[هة]|للجلابي[هة])/.exec(w)
    || /(?:بسعر|بمبلغ|سعر|ب|بـ|=)\s*(\d+(?:\.\d+)?)\s*(?:جنيه|جم|ج\.م|ج)?\s*(للواحد[هة]?|للقطع[هة]|الواحد[هة]|للجلابي[هة])?/.exec(w)
    || /(\d+(?:\.\d+)?)\s*(?:جنيه|جم|ج\.م|ج)\b\s*(للواحد[هة]?|للقطع[هة]|الواحد[هة])?/.exec(w);
  if (m) { price = Number(m[1]); unitPrice = !!m[2]; w = w.replace(m[0], ' '); }

  /* 4) نوع القطعة: أطول اسم من الكتالوج/الشائع يظهر في النص (بصيغة المفرد أو الجمع ات) */
  const loose = (k) => k.replace(/[اأإآ]/g, '[اأإآ]').replace(/[هة]/g, '[هة]').replace(/[يى]/g, '[يى]');
  const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = [...catalog.map((c) => ({ name: c.name, price: Number(c.price) || 0, key: normalizeItemName(c.name) })), ...DEFAULT_GARMENTS.map((g) => ({ name: g, price: 0, key: normalizeItemName(g) }))]
    .filter((x) => x.key.length >= 2).sort((a, b) => b.key.length - a.key.length);
  let item = null;
  const nwFull = normalizeItemName(w);
  for (const c of names) {
    const stem = c.key.replace(/ه$/, '');
    if (new RegExp('(?:^|\\s)' + esc(stem) + '(?:ه|ات|ين)?(?=\\s|$)').test(nwFull)) { item = { ...c, stem }; break; }
  }
  if (item) {
    out.found.item = true;
    w = w.replace(new RegExp('(?:^|\\s)' + loose(esc(item.stem)) + '(?:[هة]|ات|ين)?(?=\\s|$)', 'i'), ' ');
    item.name = item.name.replace(/(?:ات|ين)$/, 'ة').replace(/عباءه$/, 'عباءة').replace(/ه$/, 'ة');
  }

  /* 5) العدد: رقم/كلمة ملاصقة لنوع القطعة أو «قطع» — بعد حذف السعر والموعد */
  let qty = 1;
  const qm = /(?:^|\s)(\d{1,2}|واحد[هة]?|اتنين|اثنين|اثنان|ت?لاث[هة]?|ثلاث[هة]?|اربع[هة]?|أربع[هة]?|خمس[هة]?|ست[هة]?|سبع[هة]?|ثماني[هة]?|تمانية|تمانيه|تسع[هة]?|عشر[هة]?)\s*(?:قطع[هة]?|قطع)?(?=\s|$)/.exec(' ' + w + ' ');
  if (qm && item && wordOrNum(qm[1]) >= 1 && wordOrNum(qm[1]) <= 50) {
    /* لا نلتقط رقماً كبيراً (سعراً) ولا رقماً بعيداً عن النوع */
    qty = wordOrNum(qm[1]); w = w.replace(qm[1], ' ');
  } else {
    const qm2 = /(\d{1,2})\s*قطع[هة]?/.exec(w);
    if (qm2) { qty = Number(qm2[1]); w = w.replace(qm2[0], ' '); }
  }

  /* السعر بلا بادئة: أكبر رقم متبقٍّ ≥ 20 */
  if (!(price > 0)) {
    const nums = [...w.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)].map((x) => ({ s: x[0], v: Number(x[1]) })).filter((x) => x.v >= 20).sort((a, b) => b.v - a.v);
    if (nums.length) { price = nums[0].v; w = w.replace(nums[0].s, ' '); }
  }
  /* 6) العميل: بقية الكلمات بعد حذف كلمات الوصل */
  const rest = w.replace(/[\d.]+/g, ' ').split(/\s+/).map((t) => t.replace(/^ل(?=.{3,})/, '').trim()).filter((t) => t && !STOP.has(normalizeItemName(t)) && normalizeItemName(t).length >= 2);
  if (rest.length) out.customerName = rest.join(' ');
  if (rest.length && customers.length) {
    const qs = rest.map((t) => normalizeItemName(t));
    const scored = customers.map((c) => {
      const toks = normalizeItemName(c.name).split(' ');
      const score = qs.filter((q) => toks.some((t) => t === q || (q.length >= 3 && t.startsWith(q)))).length;
      return { c, score, exact: normalizeItemName(c.name) === qs.join(' ') };
    }).filter((x) => x.score > 0).sort((a, b) => (b.exact - a.exact) || (b.score - a.score));
    if (scored.length) {
      const top = scored.filter((x) => x.exact === scored[0].exact && x.score === scored[0].score);
      if (top.length === 1) { out.customerId = top[0].c.id; out.customerName = top[0].c.name; out.found.customer = true; }
      else { out.candidates = top.slice(0, 4).map((x) => ({ id: x.c.id, name: x.c.name })); warnings.push('أكثر من عميل بهذا الاسم — اختر العميل من النموذج'); }
    }
  }
  if (!out.found.customer && !out.candidates.length) warnings.push(out.customerName ? 'لم أجد عميلاً باسم «' + out.customerName + '» — اخترته من النموذج أو أضفه عميلاً جديداً' : 'لم أتعرف على اسم العميل');

  /* 7) البند والسعر */
  const name = item ? item.name : 'بند';
  if (!item) warnings.push('لم أتعرف على نوع القطعة — سُمّي «بند»');
  let unit = 0;
  if (price > 0) { out.found.price = true; unit = unitPrice || qty === 1 ? price : r2(price / qty); }
  else if (item && item.price > 0) { unit = item.price; warnings.push('السعر من قائمة أنواعك (' + item.price + ')'); }
  else warnings.push('لم أجد السعر');
  out.items = [{ name, quantity: qty, price: r2(unit) }];
  out.total = r2(unit * qty);
  if (!out.found.date) warnings.push('لم أجد موعد التسليم');
  if (out.deposit > 0 && out.total > 0 && out.deposit > out.total) warnings.push('العربون أكبر من المبلغ — راجعه');
  out.ok = out.found.customer || out.candidates.length > 0 || out.found.item || out.found.price;
  return out;
}

/** يحوّل التحليل إلى مسودة تفهمها استمارة الطلب (مفتاح المسودة order-form). */
export function toOrderDraft(parsed, now = Date.now()) {
  const p = parsed || {};
  const today = ymdOf(new Date(now));
  return {
    customerId: p.customerId != null ? String(p.customerId) : '',
    status: 'pending',
    receivedDate: today,
    dueDate: p.dueDate || '',
    discountType: 'none', discountValue: 0,
    deposit: Number(p.deposit) || 0,
    cost: 0,
    notes: p.customerId == null && p.customerName ? 'العميل: ' + p.customerName : '',
    image: '',
    items: (p.items || []).map((it, i) => ({ id: 'qo_' + i + '_' + String(now).slice(-6), name: it.name, price: it.price, quantity: it.quantity })),
    fees: [],
  };
}
