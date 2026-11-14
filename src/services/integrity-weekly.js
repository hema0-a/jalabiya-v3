/* ==========================================================================
   integrity-weekly.js — فحص سلامة البيانات الأسبوعي الصامت (v3.20.0)
   ==========================================================================
   scanIntegrity كان يعمل يدوياً فقط (صيانة البيانات / بطاقة الحالة)، فتبقى المشاكل مخفية حتى تبحث عنها.
   الآن: مرة كل 7 أيام بعد استقرار الإقلاع، قراءة فقط، وإن وُجدت ملاحظات يظهر بند «سلامة البيانات»
   في مركز العمل (لا toast ولا نافذة). لا إصلاح آلي أبداً: الإصلاح قرارك من «صيانة البيانات».
   حارس الانهيار: يُسجَّل startedAt قبل الفحص؛ إن وجدناه بلا اكتمال (الفحص أسقط التبويب) نتخطى أسبوعاً.
   ========================================================================== */

export const INTEGRITY_KEY = 'jalabiya_v3_integrity_weekly';
export const INTEGRITY_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

function readJson(storage) {
  try {
    const v = JSON.parse(storage.getItem(INTEGRITY_KEY) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch (_) { return null; }
}

/** آخر نتيجة محفوظة: {at, total, errors, warns, startedAt?} أو null. */
export function getLastIntegrityRun(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  return storage ? readJson(storage) : null;
}

/**
 * هل حان الفحص؟ (دالة نقية)
 * @param {Object|null} last
 * @param {number} now
 * @returns {{due:boolean, reason:string}}
 */
export function integrityDue(last, now = Date.now()) {
  if (!last) return { due: true, reason: 'never' };
  const at = Number(last.at) || 0;
  const started = Number(last.startedAt) || 0;
  /* بدأ فحص ولم يكتمل (انهيار محتمل): نتخطى أسبوعاً من بدايته */
  if (started > at && now - started < INTEGRITY_EVERY_MS) return { due: false, reason: 'crash-guard' };
  if (now - Math.max(at, started) >= INTEGRITY_EVERY_MS) return { due: true, reason: 'week-passed' };
  return { due: false, reason: 'recent' };
}

/** يلخّص نتيجة scanIntegrity: {total, errors, warns}. */
export function summarizeScan(res) {
  const issues = res && Array.isArray(res.issues) ? res.issues : [];
  return {
    total: issues.length,
    errors: issues.filter((i) => i && i.severity === 'error').length,
    warns: issues.filter((i) => i && i.severity === 'warn').length,
  };
}

/** يجمع المدخلات ويشغّل scanIntegrity (قراءة فقط) — نفس ما تفعله بطاقة حالة النظام. */
export async function defaultScan() {
  const [{ customers }, { orders }, { payments }, { appointments }, { quotes }, { scanIntegrity }, media, rel] = await Promise.all([
    import('../data/repos/customers.js'), import('../data/repos/orders.js'), import('../data/repos/payments.js'),
    import('../data/repos/appointments.js'), import('../data/repos/quotes.js'), import('./data-integrity.js'),
    import('./order-media-scan.js'), import('./relation-inputs.js'),
  ]);
  const [c, o, p, a, q, mi, ri] = await Promise.all([
    customers.list(), orders.list(), payments.list(), appointments.list(), quotes.list(),
    media.loadMediaScanInputs(), rel.loadRelationInputs(),
  ]);
  return scanIntegrity({ customers: c, orders: o, payments: p, appointments: a, quotes: q, ...mi, ...ri });
}

/**
 * يشغّل الفحص إن حان. لا يرمي أبداً.
 * @param {{now?:number, storage?:Storage, scan?:Function, force?:boolean}} [deps]
 * @returns {Promise<{ran:boolean, reason:string, summary?:Object}>}
 */
export async function runIntegrityIfDue(deps = {}) {
  const storage = deps.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = deps.now != null ? deps.now : Date.now();
  if (!storage) return { ran: false, reason: 'no-storage' };
  const last = readJson(storage);
  const d = integrityDue(last, now);
  if (!d.due && !deps.force) return { ran: false, reason: d.reason };
  const keep = last ? { at: Number(last.at) || 0, total: last.total || 0, errors: last.errors || 0, warns: last.warns || 0 } : { at: 0, total: 0, errors: 0, warns: 0 };
  try {
    storage.setItem(INTEGRITY_KEY, JSON.stringify({ ...keep, startedAt: now }));   /* حارس الانهيار */
    const res = await (deps.scan || defaultScan)();
    const summary = summarizeScan(res);
    storage.setItem(INTEGRITY_KEY, JSON.stringify({ at: now, ...summary }));
    return { ran: true, reason: d.reason, summary };
  } catch (e) {
    try { storage.setItem(INTEGRITY_KEY, JSON.stringify({ ...keep, at: now })); } catch (_) { /* ignore */ }
    return { ran: false, reason: 'error:' + ((e && e.message) || e) };
  }
}
