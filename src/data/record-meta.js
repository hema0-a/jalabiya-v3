/* ==========================================================================
   record-meta.js — بيانات وصفية لكل سجل: نسخة المخطط (_v) وأزمنة الحقول (_ft/_fb)
   ==========================================================================
   وحدة نقية (بلا استيراد) تستعملها idb.put عند كل كتابة محلية، ويستعملها الترحيل والدمج.

   _v   رقم نسخة شكل بيانات السجل. السجل بلا _v = النسخة 1. يُختم عند كل كتابة بآخر نسخة معروفة
        للمخزن (لا يُخفَّض أبداً)، وتُرحَّل القديمة تلقائياً (record-schema.js) بدوال RECORD_MIGRATIONS.
   _ft  خريطة { حقل: وقت آخر تعديل } للحقول التي عُدّلت بعد إنشاء السجل (تُستعمل لدمج المزامنة).
   _fb  وقت أساس للحقول التي لا تظهر في _ft (= updatedAt قبل أول تعديل مُتتبَّع).
   زمن الحقل = _ft[f] ?? _fb ?? updatedAt  (انظر fieldTime).

   ⚠️ كيف تضيف ترحيلاً (مثلاً حقل جديد لكل العملاء)؟
      1) أضف في RECORD_MIGRATIONS تحت اسم المخزن عنصراً { to: 2, up(rec) { ... return rec; } }
         (الأرقام متتابعة 2، 3، 4… بلا فجوات). الدالة يجب أن تكون:
           - idempotent: تشغيلها مرتين على السجل نفسه يعطي النتيجة نفسها.
           - دفاعية: لا تفترض وجود الحقول (قد يكون السجل من نسخة أقدم بكثير).
           - لا تغيّر id/createdAt/updatedAt (يُعاد ضبطها تلقائياً).
      2) سيُرحَّل كل سجل قديم عند أول فتح بعد التحديث (وبعد المزامنة/الاستعادة/الاستيراد)،
         بعد نسخة احتياطية تلقائية، وبدون تغيير updatedAt (فلا يطغى على تعديلات الأجهزة الأخرى).
   ========================================================================== */

/** المخازن ذات السجلات المتزامنة (تطابق SYNC_STORES في sync/firestore-sync.js — يتحقق الاختبار). */
export const RECORD_STORES = [
  'customers', 'orders', 'payments', 'inventory',
  'workers', 'expenses', 'appointments', 'activity',
  'portfolio', 'commitments', 'commitmentPayments', 'savingsGoals',
  'houseExpenses', 'personalLoans', 'loanPayments', 'referrals', 'workerPayments',
  'quotes', 'ledger', 'orderMedia',
];

/** حقول وصفية لا تدخل في مقارنة «هل تغيّر الحقل؟». */
export const META_FIELDS = new Set(['id', 'createdAt', 'updatedAt', '_v', '_ft', '_fb']);

/**
 * سجل الترحيلات: { اسم_المخزن: [ { to: 2, up(rec) {...} }, ... ] }.
 * فارغ الآن — كل السجلات الحالية هي النسخة 1.
 * @type {Object<string, Array<{to:number, up:(rec:Object)=>Object|void}>>}
 */
export const RECORD_MIGRATIONS = {};

const recordStoreSet = new Set(RECORD_STORES);
export function isRecordStore(name) { return recordStoreSet.has(name); }

/** نسخة سجل (بلا _v = 1). */
export function recordVersion(rec) {
  const v = rec && Number(rec._v);
  return Number.isInteger(v) && v >= 1 ? v : 1;
}

/** آخر نسخة معروفة لمخزن (1 إن لا ترحيلات). */
export function latestVersion(store, migrations = RECORD_MIGRATIONS) {
  const list = migrations && migrations[store];
  if (!Array.isArray(list) || list.length === 0) return 1;
  return Math.max(1, ...list.map((m) => Number(m.to) || 1));
}

/** مساواة بنيوية (كائنات/مصفوفات/Date/أوليات). غير ذلك (Blob…) بالمرجع. */
export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a === b || (a === undefined && b === undefined);
  }
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const pa = Object.getPrototypeOf(a), pb = Object.getPrototypeOf(b);
  const plain = (p) => p === Object.prototype || p === null;
  if (!plain(pa) || !plain(pb)) return false;           /* Blob/ArrayBuffer/… : بالمرجع */
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/** زمن آخر تعديل لحقل في سجل. */
export function fieldTime(rec, field) {
  if (!rec) return 0;
  const ft = rec._ft && typeof rec._ft === 'object' ? rec._ft : null;
  if (ft && Number.isFinite(ft[field])) return ft[field];
  if (Number.isFinite(rec._fb)) return rec._fb;
  return Number(rec.updatedAt) || 0;
}

/**
 * ختم سجل قبل كتابته محلياً (يُستدعى من idb.put داخل معاملة القراءة+الكتابة).
 * لا يغيّر المُدخل؛ يُرجع نسخة جديدة. السجلات غير المتزامنة أو بلا updatedAt رقمي تُرجَع كما هي.
 * @param {string} store
 * @param {Object|undefined} existing — السجل الحالي في القاعدة
 * @param {Object} value — السجل المراد كتابته
 * @param {number} now
 * @param {Object} [migrations]
 * @returns {Object}
 */
export function stampForWrite(store, existing, value, now, migrations = RECORD_MIGRATIONS) {
  if (!isRecordStore(store) || !value || typeof value !== 'object' || typeof value.updatedAt !== 'number') return value;

  const out = { ...value };
  out._v = Math.max(Number(existing && existing._v) || 0, latestVersion(store, migrations));

  /* أزمنة الحقول تُشتق من السجل المخزَّن لا من نسخة قديمة قد يحملها المُدخل */
  delete out._ft;
  delete out._fb;
  if (!existing || typeof existing !== 'object') return out;

  const prevFt = existing._ft && typeof existing._ft === 'object' ? existing._ft : null;
  const ft = prevFt ? { ...prevFt } : {};
  const t = Math.max(Number(out.updatedAt) || 0, now);
  let changed = false;
  const keys = new Set([...Object.keys(existing), ...Object.keys(out)]);
  for (const k of keys) {
    if (META_FIELDS.has(k)) continue;
    if (!deepEqual(existing[k], out[k])) { ft[k] = t; changed = true; }
  }
  const fb = Number.isFinite(existing._fb) ? existing._fb : (Number(existing.updatedAt) || Number(existing.createdAt) || 0);

  if (changed) {
    out._ft = ft;
    out._fb = fb;
  } else {
    if (prevFt) out._ft = prevFt;
    if (Number.isFinite(existing._fb)) out._fb = existing._fb;
  }
  return out;
}
