/* ==========================================================================
   ledger.js — محرك «الدفتر المالي» النقي (المرحلة 0 — v3.3.78)
   ==========================================================================
   لا يلمس IndexedDB ولا DOM ولا الشبكة: دوال نقية على مصفوفات بسيطة، فتُختبر بالكامل
   وتُحاكى عليها عدة أجهزة. لا يُستدعى من أي مكان في التطبيق بعد (لا تغيير سلوك).

   الفكرة: بدل أن يكون «الرصيد» رقماً يُكتب فوقه (فيضيع أحد التعديلين عند المزامنة)،
   كل حركة سطر ثابت لا يُعدَّل ولا يُحذف. الرصيد = مجموع أسطر الحساب. ودمج جهازين = اتحاد
   مجموعتي الأسطر بحسب المعرّف، وهو:
     - تبادلي  (merge(a,b) = merge(b,a))
     - تجميعي  (ترتيب دمج عدة أجهزة لا يغيّر النتيجة)
     - idempotent (إعادة دمج ما دُمج لا تغيّر شيئاً)
   فيتقارب كل الأجهزة إلى الأسطر نفسها مهما كان ترتيب المزامنة، ولا يضيع سطر أبداً.

   الوحدات تُخزَّن أعداداً صحيحة (لا كسور عشرية):
     wallet  بالقروش (×100)   · points النقاط (×1)   · stock المخزون بالألف (×1000)
   الحساب (acct): معرّف العميل للمحفظة/النقاط، ومعرّف الصنف للمخزون.

   معرّف السطر:
     - الافتراضي  `${dev}.${seq}`  فريد لكل جهاز (seq يزداد على الجهاز).
     - مفتاح تكرار (key): `k:${key}` — حركة منطقية واحدة مهما سجّلها جهازان (مثل منح نقاط طلب).
     - العكس: `rev:${معرّف الأصل}` — عكسان من جهازين لنفس السطر يلتحمان في سطر واحد
       فلا يُعكس الشيء مرتين.

   الرصيد السالب بعد الدمج مسموح مؤقتاً ويُبلَّغ عنه (findAnomalies) ولا يُقصّ بصمت.
   الفحص قبل الصرف (checkSpend) محلي: يمنع الصرف فوق الرصيد المعروف على هذا الجهاز فقط.

   ملاحظة: لا يوجد «ضغط» للأسطر القديمة (Checkpoint) في هذه المرحلة؛ الضغط مع أجهزة متأخرة
   يكسر التقارب إن لم يُصمَّم بحذر، فيُؤجَّل لمرحلة لاحقة بقرار صريح.
   ========================================================================== */

/** الوحدات المعتمدة ومقياس تحويلها إلى أعداد صحيحة. */
export const UNITS = Object.freeze({
  wallet: Object.freeze({ scale: 100, label: 'المحفظة' }),
  points: Object.freeze({ scale: 1, label: 'النقاط' }),
  stock: Object.freeze({ scale: 1000, label: 'المخزون' }),
});

/** أنواع الحركات المعتمدة (يمنع خطأ كتابة صامتاً). */
export const ENTRY_TYPES = Object.freeze([
  'opening', 'topup', 'spend', 'refund', 'award', 'redeem', 'adjust', 'reversal', 'stock_in', 'stock_out',
]);

/** أقصى قيمة مطلقة لحركة (حماية من أخطاء الإدخال والفيض). */
export const MAX_DELTA = 1e12;
const MAX_NOTE = 200;
const MAX_ID = 120;
const SCHEMA_V = 1;

const isInt = (n) => typeof n === 'number' && Number.isSafeInteger(n);
const isStr = (s, max = MAX_ID) => typeof s === 'string' && s.length > 0 && s.length <= max;

/**
 * تحويل قيمة بشرية إلى أصغر وحدة صحيحة (مثل 12.5 جنيه ← 1250 قرشاً).
 * @param {'wallet'|'points'|'stock'} unit
 * @param {number} value
 * @returns {number} عدد صحيح
 * @throws {Error} وحدة مجهولة أو قيمة غير منتهية
 */
export function toMinor(unit, value) {
  const u = UNITS[unit];
  if (!u) throw new Error('وحدة غير معروفة: ' + unit);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('قيمة غير صالحة');
  return Math.round(n * u.scale);
}

/**
 * تحويل أصغر وحدة صحيحة إلى قيمة بشرية.
 * @param {'wallet'|'points'|'stock'} unit
 * @param {number} minor
 * @returns {number}
 */
export function fromMinor(unit, minor) {
  const u = UNITS[unit];
  if (!u) throw new Error('وحدة غير معروفة: ' + unit);
  return (Number(minor) || 0) / u.scale;
}

/** مفتاح الحساب المركّب. */
export const accountKey = (unit, acct) => unit + ':' + acct;

/**
 * أخطاء شكل سطر (فارغة = سليم). لا ترمي أبداً.
 * @param {*} e
 * @returns {string[]}
 */
export function validateEntry(e) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['السطر ليس كائناً'];
  if (!isStr(e.id)) errs.push('معرّف غير صالح');
  if (!UNITS[e.unit]) errs.push('وحدة غير معروفة');
  if (!isStr(e.acct)) errs.push('حساب غير صالح');
  if (!isInt(e.delta) || e.delta === 0) errs.push('المقدار يجب أن يكون عدداً صحيحاً غير صفري');
  else if (Math.abs(e.delta) > MAX_DELTA) errs.push('المقدار أكبر من الحد');
  if (!ENTRY_TYPES.includes(e.type)) errs.push('نوع غير معروف');
  if (!Number.isFinite(e.at)) errs.push('وقت غير صالح');
  if (!isStr(e.dev, 40)) errs.push('جهاز غير صالح');
  if (!isInt(e.seq) || e.seq < 0) errs.push('رقم تسلسلي غير صالح');
  if (e.rev != null && !isStr(e.rev)) errs.push('مرجع العكس غير صالح');
  if (e.type === 'reversal' && !e.rev) errs.push('العكس بلا مرجع');
  if (e.note != null && (typeof e.note !== 'string' || e.note.length > MAX_NOTE)) errs.push('ملاحظة غير صالحة');
  return errs;
}

/** فحص أدنى يكفي لاحتساب السطر في الرصيد (للأسطر الواردة من الخارج). */
function isCountable(e) {
  return !!e && typeof e === 'object' && isStr(e.id) && !!UNITS[e.unit] && isStr(e.acct)
    && isInt(e.delta) && Math.abs(e.delta) <= MAX_DELTA;
}

/**
 * رقم تسلسلي تالٍ لجهاز (مشتق من الأسطر نفسها فلا حاجة لعدّاد منفصل قد يضيع).
 * @param {Array} entries
 * @param {string} dev
 * @returns {number}
 */
export function nextSeq(entries, dev) {
  let max = -1;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e && e.dev === dev && isInt(e.seq) && e.seq > max) max = e.seq;
  }
  return max + 1;
}

/**
 * يبني سطراً جديداً ويتحقق منه.
 * @param {{unit:string, acct:string, delta:number, type:string, key?:string, ref?:Object|null, note?:string, at?:number}} f
 *   delta: عدد صحيح بأصغر وحدة (استعمل toMinor).
 * @param {{dev:string, seq:number, now?:number}} ctx — dev معرّف الجهاز، seq من nextSeq
 * @returns {Object} السطر
 * @throws {Error} بيانات غير صالحة (برسالة عربية)
 */
export function makeEntry(f, ctx) {
  const c = ctx || {};
  const at = Number.isFinite(f && f.at) ? f.at : (Number.isFinite(c.now) ? c.now : Date.now());
  const id = f && f.key != null ? 'k:' + String(f.key) : String(c.dev) + '.' + String(c.seq);
  const e = {
    id, v: SCHEMA_V,
    unit: f && f.unit, acct: f && f.acct, delta: f && f.delta, type: f && f.type,
    at, dev: c.dev, seq: c.seq,
    ref: f && f.ref ? { ...f.ref } : null,
    rev: null,
    note: f && f.note ? String(f.note) : '',
  };
  const errs = validateEntry(e);
  if (errs.length) throw new Error('سطر دفتر غير صالح: ' + errs.join('، '));
  return e;
}

/**
 * سطر عكس يلغي أثر سطر سابق (لا حذف في الدفتر: التراجع = سطر معاكس).
 * معرّفه ثابت `rev:<الأصل>` فلا يُعكس السطر مرتين مهما سجّل العكس أكثر من جهاز.
 * @param {Object} target — السطر المراد عكسه
 * @param {{dev:string, seq:number, now?:number}} ctx
 * @param {string} [note]
 * @returns {Object}
 * @throws {Error} إن كان الهدف نفسه عكساً أو غير صالح
 */
export function makeReversal(target, ctx, note) {
  if (!isCountable(target)) throw new Error('لا يمكن عكس سطر غير صالح');
  if (target.type === 'reversal') throw new Error('لا يُعكس سطر عكس');
  const c = ctx || {};
  const e = {
    id: 'rev:' + target.id, v: SCHEMA_V,
    unit: target.unit, acct: target.acct, delta: -target.delta, type: 'reversal',
    at: Number.isFinite(c.now) ? c.now : Date.now(), dev: c.dev, seq: c.seq,
    ref: target.ref ? { ...target.ref } : null,
    rev: target.id,
    note: note ? String(note) : '',
  };
  const errs = validateEntry(e);
  if (errs.length) throw new Error('سطر عكس غير صالح: ' + errs.join('، '));
  return e;
}

/* ==========================================================================
   الدمج
   ========================================================================== */

/** نص ثابت لقيمة (مفاتيح الكائنات مرتّبة) — للترجيح الحتمي فقط. */
function stable(v) {
  if (v === undefined) return 'u';
  try {
    return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
      ? Object.keys(x).sort().reduce((a, kk) => { a[kk] = x[kk]; return a; }, {}) : x));
  } catch (e) { return String(v); }
}

/** هوية السطر المالية: ما يؤثر على الرصيد (الباقي بيانات وصفية). */
export const entryIdentity = (e) => stable({ id: e.id, unit: e.unit, acct: e.acct, delta: e.delta, type: e.type, rev: e.rev == null ? null : e.rev });

/** ترتيب قانوني ثابت: الوقت ثم الجهاز ثم التسلسل ثم المعرّف. */
export function compareEntries(a, b) {
  return (a.at - b.at) || (a.dev < b.dev ? -1 : a.dev > b.dev ? 1 : 0) || (a.seq - b.seq)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** يختار أحد سطرين بنفس المعرّف بدالة صرفة متماثلة وتجميعية (الأصغر نصاً). */
function pick(a, b) {
  return stable(a) <= stable(b) ? a : b;
}

/**
 * يدمج مجموعتي أسطر (اتحاد بحسب المعرّف).
 *  - نفس المعرّف ونفس الهوية المالية (مثل عكس مسجَّل من جهازين): يُحتفظ بواحد.
 *  - نفس المعرّف وهوية مختلفة: «تعارض» يُبلَّغ عنه، ويُحتفظ بواحد حتمياً (النتيجة ثابتة على كل الأجهزة).
 *  - سطر غير صالح للاحتساب: لا يدخل الرصيد ويُعاد في rejected (لا يُخفى بصمت).
 * لا يعدّل المدخلات.
 * @param {Array} a
 * @param {Array} b
 * @returns {{entries:Array, conflicts:Array<{id:string, kept:Object, dropped:Object}>, rejected:Array, fromA:number, fromB:number}}
 *   fromA/fromB: عدد الأسطر التي كانت عند طرف دون الآخر (لعرض «ما الجديد»).
 */
export function mergeLedgers(a, b) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  const map = new Map();
  const conflicts = [];
  const rejected = [];
  const seenRejected = new Set();
  const inA = new Set();
  const inB = new Set();

  const add = (e, side) => {
    if (!isCountable(e)) {
      const key = stable(e);
      if (!seenRejected.has(key)) { seenRejected.add(key); rejected.push(e); }
      return;
    }
    (side === 'a' ? inA : inB).add(e.id);
    const cur = map.get(e.id);
    if (!cur) { map.set(e.id, e); return; }
    if (entryIdentity(cur) !== entryIdentity(e)) {
      const kept = pick(cur, e);
      const dropped = kept === cur ? e : cur;
      if (!conflicts.some((c) => c.id === e.id)) conflicts.push({ id: e.id, kept, dropped });
      else { const c = conflicts.find((x) => x.id === e.id); c.kept = pick(c.kept, kept); }
      map.set(e.id, kept);
      return;
    }
    map.set(e.id, pick(cur, e));
  };
  A.forEach((e) => add(e, 'a'));
  B.forEach((e) => add(e, 'b'));

  let fromA = 0; let fromB = 0;
  for (const id of inA) if (!inB.has(id)) fromA++;
  for (const id of inB) if (!inA.has(id)) fromB++;

  /* في التعارض الثلاثي يجب أن تبقى النتيجة مستقلة عن الترتيب: نعيد اختيار الأصغر نصاً لكل معرّف */
  const entries = [...map.values()].sort(compareEntries);
  conflicts.sort((x, y) => (x.id < y.id ? -1 : 1));
  rejected.sort((x, y) => (stable(x) < stable(y) ? -1 : 1));
  return { entries, conflicts, rejected, fromA, fromB };
}

/**
 * دمج عدة مجموعات (للتجميع والاختبار). مكافئ لدمج متتالٍ بأي ترتيب.
 * @param {Array<Array>} lists
 * @returns {{entries:Array, conflicts:Array, rejected:Array}}
 */
export function mergeMany(lists) {
  let acc = { entries: [], conflicts: [], rejected: [] };
  for (const l of Array.isArray(lists) ? lists : []) {
    const r = mergeLedgers(acc.entries, l);
    acc = { entries: r.entries, conflicts: [...acc.conflicts, ...r.conflicts], rejected: [...acc.rejected, ...r.rejected] };
  }
  return acc;
}

/* ==========================================================================
   الأرصدة
   ========================================================================== */

/**
 * أرصدة كل الحسابات.
 * @param {Array} entries
 * @returns {Map<string,{unit:string, acct:string, balance:number, count:number}>} المفتاح unit:acct
 */
export function balances(entries) {
  const out = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!isCountable(e)) continue;
    const k = accountKey(e.unit, e.acct);
    const r = out.get(k) || { unit: e.unit, acct: e.acct, balance: 0, count: 0 };
    r.balance += e.delta;
    r.count += 1;
    out.set(k, r);
  }
  return out;
}

/**
 * رصيد حساب واحد (بأصغر وحدة).
 * @param {Array} entries
 * @param {string} unit
 * @param {string} acct
 * @returns {number}
 */
export function balanceOf(entries, unit, acct) {
  let sum = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (isCountable(e) && e.unit === unit && e.acct === acct) sum += e.delta;
  }
  return sum;
}

/**
 * هل يكفي الرصيد المعروف محلياً لصرف مقدار؟ (فحص محلي — قد يصير الرصيد سالباً بعد دمج جهاز آخر).
 * @param {Array} entries
 * @param {string} unit
 * @param {string} acct
 * @param {number} amountMinor — موجب
 * @returns {{ok:boolean, balance:number, shortBy:number}}
 */
export function checkSpend(entries, unit, acct, amountMinor) {
  const amt = Number(amountMinor);
  const balance = balanceOf(entries, unit, acct);
  if (!isInt(amt) || amt <= 0) return { ok: false, balance, shortBy: 0 };
  return { ok: balance >= amt, balance, shortBy: Math.max(0, amt - balance) };
}

/**
 * هل عُكس السطر؟ (يوجد سطر عكس بمعرّفه).
 * @param {Array} entries
 * @param {string} id
 * @returns {boolean}
 */
export function isReversed(entries, id) {
  return (Array.isArray(entries) ? entries : []).some((e) => e && e.id === 'rev:' + id);
}

/* ==========================================================================
   الشذوذات (للتنبيه في المزامنة وصيانة البيانات)
   ========================================================================== */

/**
 * يفحص الدفتر ويُرجع ما يستحق انتباه المستخدم. لا يعدّل شيئاً.
 *  - negative_balance (warn): رصيد سالب بعد الدمج (مال صُرف من جهازين) — يُعرض ولا يُقصّ.
 *  - id_conflict (warn): معرّفان متطابقان بهوية مالية مختلفة (من merge.conflicts).
 *  - invalid_entry (warn): سطر لا يصلح للاحتساب (من merge.rejected).
 *  - reversal_mismatch (warn): عكس لا يطابق أصله (مقدار/حساب مختلف).
 *  - orphan_reversal (info): عكس أصله لم يصل بعد (قد يصل بمزامنة لاحقة).
 *  - reversal_of_reversal (warn): عكس يشير إلى عكس.
 * @param {Array} entries
 * @param {{conflicts?:Array, rejected?:Array}} [extra] — نتيجة آخر دمج
 * @returns {Array<{kind:string, severity:'warn'|'info', unit?:string, acct?:string, balance?:number, id?:string, message:string}>}
 */
export function findAnomalies(entries, extra = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  const byId = new Map();
  for (const e of list) if (isCountable(e)) byId.set(e.id, e);

  for (const r of balances(list).values()) {
    if (r.balance < 0) {
      out.push({
        kind: 'negative_balance', severity: 'warn', unit: r.unit, acct: r.acct, balance: r.balance,
        message: 'رصيد ' + UNITS[r.unit].label + ' سالب (' + fromMinor(r.unit, r.balance) + ') — صُرف أكثر من المتاح على أجهزة مختلفة',
      });
    }
  }
  for (const e of list) {
    if (!isCountable(e) || e.type !== 'reversal') continue;
    const t = e.rev ? byId.get(e.rev) : null;
    if (!e.rev || !t) {
      out.push({ kind: 'orphan_reversal', severity: 'info', id: e.id, unit: e.unit, acct: e.acct, message: 'سطر عكس أصله لم يصل بعد' });
    } else if (t.type === 'reversal') {
      out.push({ kind: 'reversal_of_reversal', severity: 'warn', id: e.id, unit: e.unit, acct: e.acct, message: 'سطر عكس يشير إلى سطر عكس' });
    } else if (t.unit !== e.unit || t.acct !== e.acct || t.delta !== -e.delta) {
      out.push({ kind: 'reversal_mismatch', severity: 'warn', id: e.id, unit: e.unit, acct: e.acct, message: 'سطر العكس لا يطابق أصله' });
    }
  }
  for (const c of Array.isArray(extra.conflicts) ? extra.conflicts : []) {
    out.push({ kind: 'id_conflict', severity: 'warn', id: c.id, unit: c.kept && c.kept.unit, acct: c.kept && c.kept.acct, message: 'حركتان بنفس المعرّف ومقدارين مختلفين — اعتُمدت إحداهما' });
  }
  for (const r of Array.isArray(extra.rejected) ? extra.rejected : []) {
    out.push({ kind: 'invalid_entry', severity: 'warn', id: r && r.id ? String(r.id) : undefined, message: 'سطر دفتر غير صالح استُبعد من الأرصدة' });
  }
  return out;
}

/**
 * مقارنة أرصدة الدفتر بالأرقام القديمة المخزّنة على السجلات (للوضع الظلّي في المرحلة 1).
 * @param {Array} entries
 * @param {Array<{unit:string, acct:string, balance:number}>} legacy — أرصدة بأصغر وحدة
 * @returns {Array<{unit:string, acct:string, ledger:number, legacy:number, diff:number}>} الفروق فقط
 */
export function compareToLegacy(entries, legacy) {
  const bal = balances(entries);
  const out = [];
  for (const l of Array.isArray(legacy) ? legacy : []) {
    if (!l || !UNITS[l.unit]) continue;
    const have = (bal.get(accountKey(l.unit, l.acct)) || { balance: 0 }).balance;
    const want = Number(l.balance) || 0;
    if (have !== want) out.push({ unit: l.unit, acct: l.acct, ledger: have, legacy: want, diff: have - want });
  }
  return out;
}
