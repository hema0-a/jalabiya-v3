/* ==========================================================================
   message-log.js — سجل رسائل واتساب المُرسَلة  [v3.3.44]
   ==========================================================================
   يسجّل «ماذا فتحنا من رسائل ولمن ومتى» ليظهر: «آخر تذكير قبل 3 أيام»،
   ويمنع تكرار الرسالة نفسها للعميل في الطابور.

   - محلي على الجهاز (localStorage) — لا يلمس سجلات الطلبات/العملاء، فلا يغيّر
     updatedAt ولا يؤثر على المزامنة أو أعمار «جاهز للاستلام».
   - واتساب يُفتح برسالة جاهزة والمستخدم هو من يضغط «إرسال»، فالسجل = «فُتحت»،
     لا «وصلت».
   - مقصوص: 600 سجلاً كحد أقصى و120 يوماً.
   ========================================================================== */

const KEY = 'jalabiya_v3_message_log';
export const MAX_LOG = 600;
export const KEEP_DAYS = 120;
const DAY = 86400000;

/**
 * تنظيف السجل: صالح فقط، أحدث من KEEP_DAYS، وبحد أقصى MAX_LOG.
 * @param {Array} list
 * @param {number} [now]
 * @returns {Array<{k:string,r:string|null,c:string|null,t:number}>}
 */
export function pruneLog(list, now = Date.now()) {
  const arr = Array.isArray(list) ? list : [];
  const out = arr.filter((e) => e && typeof e.k === 'string' && Number.isFinite(e.t) && now - e.t <= KEEP_DAYS * DAY);
  out.sort((a, b) => a.t - b.t);
  return out.length > MAX_LOG ? out.slice(out.length - MAX_LOG) : out;
}

export function loadLog(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return pruneLog(raw, now);
  } catch (e) { return []; }
}

function saveLog(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* التخزين قد يفشل */ }
}

/**
 * تسجيل رسالة فُتحت.
 * @param {{kind:string, ref?:string|null, customerId?:string|null, at?:number}} m
 */
export function logMessage(m) {
  if (!m || !m.kind) return;
  const at = Number.isFinite(m.at) ? m.at : Date.now();
  const list = loadLog(at);
  list.push({ k: String(m.kind), r: m.ref != null ? String(m.ref) : null, c: m.customerId != null ? String(m.customerId) : null, t: at });
  saveLog(pruneLog(list, at));
}

export function clearLog() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/**
 * آخر وقت إرسال يطابق الشروط (كل شرط مُعطى يجب أن يتطابق).
 * @param {Array} list — السجل
 * @param {{kinds:string[], ref?:string|null, customerId?:string|null}} f
 * @returns {number|null}
 */
export function lastSentIn(list, f) {
  const kinds = new Set((f && f.kinds) || []);
  let best = null;
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || !kinds.has(e.k)) continue;
    if (f.ref != null && e.r !== String(f.ref)) continue;
    if (f.customerId != null && e.c !== String(f.customerId)) continue;
    if (best == null || e.t > best) best = e.t;
  }
  return best;
}

/** نفس lastSentIn لكن يقرأ السجل المحفوظ. */
export function lastSent(f) {
  return lastSentIn(loadLog(), f);
}

/**
 * وصف عربي مختصر لمنذ متى.
 * @param {number|null} ts
 * @param {number} [now]
 * @returns {string} '' إن لم يوجد
 */
export function sinceText(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return '';
  const d = Math.max(0, Math.floor((now - ts) / DAY));
  if (d === 0) return 'اليوم';
  if (d === 1) return 'أمس';
  if (d === 2) return 'قبل يومين';
  if (d <= 10) return 'قبل ' + d + ' أيام';
  return 'قبل ' + d + ' يوماً';
}
