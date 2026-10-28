/* ==========================================================================
   record-merge.js — دمج سجلين (محلي + سحابي) على مستوى الحقول
   ==========================================================================
   بدل أن «آخر حفظ يمسح ما قبله» للسجل كله: لكل حقل نأخذ قيمة الطرف الذي عدّله آخراً
   (زمن الحقل من record-meta.fieldTime). فتعديل الجوال لهاتف العميل وتعديل التابلت لعنوانه
   يجتمعان في سجل واحد. وإن عُدّل الحقل نفسه على الجهازين بعد آخر مزامنة بقيمتين مختلفتين
   يُسجَّل «تعارض» (والأحدث يفوز) لينبَّه المستخدم.

   خصائص مضمونة (مختبَرة):
     - تبادلية: merge(a,b) و merge(b,a) يعطيان نفس البيانات (يتقاربان على الجهازين).
     - idempotent: دمج النتيجة مع أي من الأصلين يُرجع النتيجة نفسها.
     - عند التساوي التام في زمن الحقل: ترجيح ثابت بمقارنة نص القيمتين (لا عشوائية).
     - اختلاف نسخة المخطط (_v) بين الطرفين: لا دمج حقول (أشكال مختلفة) — الأحدث كاملاً كالسابق، والترحيل يتكفل بالباقي.
     - الحقل الغائب عند طرف يؤخذ من الآخر، إلا إن سُجِّل حذفه صراحةً (له _ft أحدث).
     - المصفوفات والكائنات المتداخلة تُعامل كقيمة واحدة للحقل (لا دمج داخلها).
     - «مجموعات ذرّية» لحقول مترابطة (مثل بنود الطلب ومجاميعه): تُؤخذ كلها من الطرف نفسه فلا يتولد مجموع لا يطابق بنوده.
   ========================================================================== */

import { META_FIELDS, deepEqual, fieldTime, recordVersion } from '../data/record-meta.js';

/** حقول مترابطة تُؤخذ معاً من طرف واحد (لكل مخزن). */
export const ATOMIC_GROUPS = {
  orders: [['items', 'subtotal', 'discountType', 'discountValue', 'discountAmount', 'extraFees', 'extraFeesTotal', 'amount']],
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

/** نص ثابت لقيمة (مفاتيح الكائنات مرتّبة) — للترجيح عند التساوي فقط. */
function stable(v) {
  if (v === undefined) return 'u';
  try {
    return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
      ? Object.keys(x).sort().reduce((a, kk) => { a[kk] = x[kk]; return a; }, {}) : x));
  } catch (e) { return String(v); }
}

/** زمن «حذف صريح» لحقل غائب عند طرف: _ft[f] إن وُجد (سُجِّل تعديل) وإلا null. */
function explicitTime(rec, f) {
  const ft = rec && rec._ft && typeof rec._ft === 'object' ? rec._ft : null;
  return ft && Number.isFinite(ft[f]) ? ft[f] : null;
}

/**
 * @param {Object} local
 * @param {Object} cloud
 * @param {{since?:number, store?:string}} [opts] — since: وقت آخر مزامنة (لكشف التعارض الحقيقي)
 * @returns {{record:Object, source:'local'|'cloud'|'merged', conflicts:Array<{field:string, localValue:*, cloudValue:*, localAt:number, cloudAt:number, winner:'local'|'cloud'}>, dataDiffers:boolean}}
 *   source: من يمثّل النتيجة. dataDiffers: هل بيانات الطرفين مختلفة أصلاً.
 */
export function mergeRecords(local, cloud, opts = {}) {
  const since = Number(opts.since) || 0;
  const groups = (opts.store && ATOMIC_GROUPS[opts.store]) || [];
  const lu = Number(local.updatedAt) || 0;
  const cu = Number(cloud.updatedAt) || 0;

  /* مخطّطان مختلفان: لا دمج حقول */
  if (recordVersion(local) !== recordVersion(cloud)) {
    const cloudWins = cu > lu;
    return { record: cloudWins ? cloud : local, source: cloudWins ? 'cloud' : 'local', conflicts: [], dataDiffers: true };
  }

  /* حقول _ft تدخل أيضاً: حقل محذوف عند الطرفين وزمن حذفه مسجَّل عند أحدهما يجب ألا يضيع (v3.5.3) */
  const ftKeys = (r) => (r && r._ft && typeof r._ft === 'object' ? Object.keys(r._ft) : []);
  const keys = new Set([...Object.keys(local), ...Object.keys(cloud), ...ftKeys(local), ...ftKeys(cloud)].filter((k) => !META_FIELDS.has(k)));
  /* تساوي البيانات لا يكفي إن اختلفت أزمنة الحقول الصريحة (_ft): اختيار الأحدث بـ updatedAt وحده كان يُسقط زمناً أحدث لحقل
     فيخسر لاحقاً أمام جهاز ثالث. السجلات القديمة بلا _ft تبقى على المسار السريع. */
  const sameTimes = (k) => (explicitTime(local, k) === null && explicitTime(cloud, k) === null) || fieldTime(local, k) === fieldTime(cloud, k);
  const dataEqual = [...keys].every((k) => deepEqual(local[k], cloud[k]) &&
    (has(local, k) || has(cloud, k) || explicitTime(local, k) === explicitTime(cloud, k)) && sameTimes(k));
  if (dataEqual) return { record: lu >= cu ? local : cloud, source: lu >= cu ? 'local' : 'cloud', conflicts: [], dataDiffers: false };

  const chosen = {};     /* حقل → { has, value, t, side } */
  const conflicts = [];

  /* ---- المجموعات الذرّية أولاً ---- */
  const grouped = new Set();
  for (const group of groups) {
    const present = group.filter((f) => keys.has(f));
    if (present.length === 0) continue;
    if (present.every((f) => deepEqual(local[f], cloud[f]))) {
      /* المجموعة متطابقة عند الطرفين: يجب إدراجها في chosen أيضاً، وإلا فقدها السجل المركّب
         (كان الطلب المدموج يخرج بلا items/subtotal/amount عند تعديل جهازين حقلين مختلفين — فقدان مبلغ الطلب!) */
      for (const f of present) {
        const inL = has(local, f), inC = has(cloud, f);
        chosen[f] = { has: inL || inC, value: inL ? local[f] : cloud[f], t: Math.max(fieldTime(local, f), fieldTime(cloud, f)), side: 'local' };
        grouped.add(f);
      }
      continue;
    }
    const tL = Math.max(...present.map((f) => fieldTime(local, f)));
    const tC = Math.max(...present.map((f) => fieldTime(cloud, f)));
    let side;
    if (tL !== tC) side = tL > tC ? 'local' : 'cloud';
    else side = stable(present.map((f) => local[f])) >= stable(present.map((f) => cloud[f])) ? 'local' : 'cloud';
    const src = side === 'local' ? local : cloud;
    const t = side === 'local' ? tL : tC;
    for (const f of present) { chosen[f] = { has: has(src, f), value: src[f], t, side }; grouped.add(f); }
    if (since > 0 && tL > since && tC > since) {
      conflicts.push({ field: present.join('+'), localValue: present.map((f) => local[f]), cloudValue: present.map((f) => cloud[f]), localAt: tL, cloudAt: tC, winner: side });
    }
  }

  /* ---- بقية الحقول ---- */
  for (const f of keys) {
    if (grouped.has(f)) continue;
    const inL = has(local, f), inC = has(cloud, f);
    if (inL && inC && deepEqual(local[f], cloud[f])) {
      chosen[f] = { has: true, value: local[f], t: Math.max(fieldTime(local, f), fieldTime(cloud, f)), side: 'local' };
      continue;
    }
    if (inL && !inC) {
      const del = explicitTime(cloud, f);
      if (del !== null && del >= fieldTime(local, f)) chosen[f] = { has: false, value: undefined, t: del, side: 'cloud' };
      else chosen[f] = { has: true, value: local[f], t: fieldTime(local, f), side: 'local' };
      continue;
    }
    if (inC && !inL) {
      const del = explicitTime(local, f);
      if (del !== null && del >= fieldTime(cloud, f)) chosen[f] = { has: false, value: undefined, t: del, side: 'local' };
      else chosen[f] = { has: true, value: cloud[f], t: fieldTime(cloud, f), side: 'cloud' };
      continue;
    }
    if (!inL && !inC) {
      /* غائب عند الطرفين: نحفظ أحدث زمن حذف مسجَّل (إن وُجد) كي لا يُبعث الحقل عند دمج جهاز ثالث */
      const dl = explicitTime(local, f), dc = explicitTime(cloud, f);
      if (dl !== null || dc !== null) {
        chosen[f] = { has: false, value: undefined, t: Math.max(dl === null ? -Infinity : dl, dc === null ? -Infinity : dc), side: (dl === null ? -Infinity : dl) >= (dc === null ? -Infinity : dc) ? 'local' : 'cloud' };
      }
      continue;
    }
    /* الحقل عند الطرفين بقيمتين مختلفتين */
    const tL = fieldTime(local, f), tC = fieldTime(cloud, f);
    let side;
    if (tL !== tC) side = tL > tC ? 'local' : 'cloud';
    else side = stable(local[f]) >= stable(cloud[f]) ? 'local' : 'cloud';
    const src = side === 'local' ? local : cloud;
    chosen[f] = { has: true, value: src[f], t: side === 'local' ? tL : tC, side };
    if (since > 0 && tL > since && tC > since) {
      conflicts.push({ field: f, localValue: local[f], cloudValue: cloud[f], localAt: tL, cloudAt: tC, winner: side });
    }
  }

  /* ---- هل النتيجة مطابقة لأحد الطرفين؟ (لا نُنشئ سجلاً جديداً بلا داعٍ) ---- */
  const matches = (rec) => [...keys].every((k) => {
    const c = chosen[k];
    if (!c) return !has(rec, k);
    /* القيمة تطابق لا تكفي: يجب ألا يكون زمن الحقل في السجل المُعاد أقدم من الزمن المختار، وإلا ضاع الأحدث وخسر الحقل لاحقاً أمام جهاز ثالث */
    if (c.has) return deepEqual(rec[k], c.value) && fieldTime(rec, k) >= c.t;
    /* حقل محذوف: لا نُعيد سجلاً لا يحمل زمن الحذف (أو حمل زمناً أقدم) وإلا ضاع الحذف وبُعث الحقل عند دمج جهاز ثالث (v3.5.3) */
    const dt = explicitTime(rec, k);
    return !has(rec, k) && dt !== null && dt >= c.t;
  });
  if (matches(local)) return { record: local, source: 'local', conflicts, dataDiffers: true };
  if (matches(cloud)) return { record: cloud, source: 'cloud', conflicts, dataDiffers: true };

  /* ---- سجل مركّب جديد ---- */
  const record = { id: local.id !== undefined ? local.id : cloud.id };
  const ft = {};
  for (const [f, c] of Object.entries(chosen)) {
    if (c.has) record[f] = c.value;
    ft[f] = c.t;
  }
  const cDef = [local.createdAt, cloud.createdAt].filter((x) => Number.isFinite(x));
  if (cDef.length) record.createdAt = Math.min(...cDef);
  /* +1: يجب أن يكون أحدث من الطرفين ليصل للجهاز الآخر عند المقارنة بـ updatedAt */
  record.updatedAt = Math.max(lu, cu) + 1;
  record._v = recordVersion(local);
  record._ft = ft;
  return { record, source: 'merged', conflicts, dataDiffers: true };
}
