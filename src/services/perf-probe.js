/* ==========================================================================
   perf-probe.js — أداة قياس الأداء على الجهاز نفسه (v3.3.85)
   ==========================================================================
   الهدف: أرقام حقيقية من الهاتف (لا تخمين) قبل أي قرار كاش/فصل وسائط.
   القياس الأساسي «للقراءة فقط»: يقرأ المخازن بـ getAll/عدّاد/مؤشر readonly ولا يكتب شيئاً في قاعدة التطبيق
   (اختبار يثبت ذلك: writeVersion لا يتغيّر). يقيس:
     1) لكل مخزن: العدد، الحجم التقريبي، زمن getAll (الأول ثم الوسيط).
     2) الطلبات: حصة الصور/التوقيعات من الحجم.
     3) «أنماط فتح الصفحات»: قراءات كل صفحة عند فتحها كما في الكود (تقدير من قراءة الكود، تُنفَّذ كقراءات فعلية).
     4) تقدير النمو (100/500/1000 طلب) بحساب على أرقام جهازك.
   اختبار النمو التخيّلي (اختياري وبزر منفصل): يُنشئ قاعدة مؤقتة باسم مختلف تماماً، يقيس ثم يحذفها؛
   لا يلمس بيانات التطبيق إطلاقاً. وحدة بلا واجهة؛ التبعيات قابلة للحقن للاختبار.
   ========================================================================== */

import * as idb from '../data/idb.js';
import { STORES, APP_CONFIG } from '../core/config.js';

/** عدد مرات تكرار كل قياس زمني (الأول = «بارد»، والوسيط من الكل). */
export const RUNS = 3;
/** حد أمان: لا نقيس getAll للطلبات إن تجاوز حجمها هذا (بايت) كي لا نُثقل الهاتف. */
export const ORDERS_GETALL_CAP = 150 * 1024 * 1024;

/**
 * أنماط قراءة الصفحات عند فتحها (موجات متتابعة، وكل موجة قراءات متوازية).
 * مستخرجة من الكود: dashboard.js يقرأ 8 مخازن ثم الملخص الصباحي ومركز الإشعارات وخدمة الإشعارات تعيد قراءة الطلبات.
 */
export const PAGE_PROFILES = Object.freeze([
  { id: 'dashboard', label: 'لوحة التحكم (مع الملخص الصباحي والإشعارات)', waves: [
    ['customers', 'orders', 'payments', 'expenses', 'settings', 'workerPayments', 'referrals', 'appointments'],
    ['orders', 'customers', 'appointments', 'payments', 'settings'],
    ['orders', 'customers', 'payments'],
    ['orders'],
  ] },
  { id: 'orders', label: 'صفحة الطلبات', waves: [['orders', 'customers', 'settings']] },
  { id: 'customers', label: 'صفحة العملاء', waves: [['customers', 'orders', 'payments']] },
  { id: 'payments', label: 'صفحة المدفوعات', waves: [['payments', 'customers', 'orders']] },
]);

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * ملخص قياسات زمنية.
 * @param {number[]} arr — بالمللي ثانية، الأول «بارد»
 * @returns {{first:number, median:number, min:number, max:number}}
 */
export function summarizeTimes(arr) {
  const a = (arr || []).filter((x) => Number.isFinite(x));
  if (a.length === 0) return { first: 0, median: 0, min: 0, max: 0 };
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { first: round1(a[0]), median: round1(mid), min: round1(s[0]), max: round1(s[s.length - 1]) };
}
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * حجم سجل تقريبي بالبايت. حقول الوسائط (نصوص base64 ضخمة) تُحسب بطولها مباشرة دون stringify لها.
 * @param {Object} rec
 * @returns {{total:number, media:number}} media = referenceImage + signature + deliveries[].signature
 */
export function recordBytes(rec) {
  if (!rec || typeof rec !== 'object') return { total: 0, media: 0 };
  const len = (v) => (typeof v === 'string' ? v.length : 0);
  let media = len(rec.referenceImage) + len(rec.signature);
  if (Array.isArray(rec.deliveries)) for (const d of rec.deliveries) media += len(d && d.signature);
  let rest = 0;
  try {
    rest = JSON.stringify(rec, (k, v) => ((k === 'referenceImage' || k === 'signature') && typeof v === 'string' ? undefined : v)).length;
  } catch (e) { rest = 0; }
  return { total: rest + media, media };
}

/** @returns {string} مللي ثانية بصيغة مقروءة. */
export function fmtMs(ms) { return (Math.round(ms * 10) / 10) + ' ms'; }
/** @returns {string} بايت ⟵ KB/MB. */
export function fmtBytes(b) {
  const n = Number(b) || 0;
  if (n >= 1024 * 1024) return (Math.round(n / 1048576 * 10) / 10) + ' MB';
  return (Math.round(n / 1024 * 10) / 10) + ' KB';
}

/**
 * يقيس زمن getAll لمخزن (RUNS مرات).
 * @param {string} store
 * @param {Object} deps
 * @returns {Promise<{times:number[], count:number}>}
 */
async function timeGetAll(store, deps) {
  const times = []; let count = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = deps.now();
    const list = await deps.getAll(store);
    times.push(deps.now() - t0);
    count = Array.isArray(list) ? list.length : 0;
  }
  return { times, count };
}

/**
 * يمرّ على مخزن بمؤشر على دفعات ويحسب العدد والحجم (قراءة فقط).
 * @param {string} store
 * @param {Object} deps
 * @param {{stopAtBytes?:number}} [o]
 * @returns {Promise<{count:number, bytes:number, mediaBytes:number, capped:boolean}>}
 */
async function scanStore(store, deps, o = {}) {
  const batch = store === STORES.BACKUPS ? 1 : ((store === STORES.ORDERS || store === STORES.ORDER_MEDIA) ? 25 : 100);   /* النسخ والوسائط سجلات ضخمة */
  let after; let count = 0; let bytes = 0; let mediaBytes = 0; let capped = false;
  for (;;) {
    const { records, lastKey, done } = await deps.readBatch(store, after, batch);
    for (const r of records || []) {
      const b = recordBytes(r); count++; bytes += b.total; mediaBytes += b.media;
    }
    after = lastKey;
    if (o.stopAtBytes && bytes > o.stopAtBytes) { capped = true; break; }
    if (done || !records || records.length === 0) break;
    await deps.yieldFn();
  }
  return { count, bytes, mediaBytes, capped };
}

const defaultDeps = () => ({
  now: defaultNow,
  getAll: (s) => idb.getAll(s),
  readBatch: (s, after, n) => idb.readBatchAfter(s, after, n),
  yieldFn: () => new Promise((r) => setTimeout(r, 0)),
  storageEstimate: async () => {
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; } } catch (e) { /* ignore */ }
    return null;
  },
  openDB: () => idb.openDB(),
  storeNames: () => Object.values(STORES),
  env: () => ({
    ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
    memory: (typeof navigator !== 'undefined' && navigator.deviceMemory) || null,
    cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
  }),
});

/**
 * يشغّل القياس الكامل (قراءة فقط).
 * @param {Object} [opts]
 * @param {(p:{step:string})=>void} [opts.onProgress]
 * @param {()=>boolean} [opts.shouldCancel]
 * @param {Object} [opts.deps] — بدائل للاختبار
 * @returns {Promise<Object>} التقرير (cancelled=true إن أُوقف)
 */
export async function runProbe(opts = {}) {
  const deps = { ...defaultDeps(), ...(opts.deps || {}) };
  const progress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const cancelled = () => (typeof opts.shouldCancel === 'function' ? !!opts.shouldCancel() : false);
  const report = {
    version: APP_CONFIG.version, at: Date.now(), env: deps.env(), storage: null, openMs: 0,
    stores: [], orders: null, pages: [], skipped: [], cancelled: false, totalMs: 0,
  };
  const t0 = deps.now();

  const o0 = deps.now(); await deps.openDB(); report.openMs = round1(deps.now() - o0);
  report.storage = await deps.storageEstimate();

  for (const s of deps.storeNames()) {
    if (cancelled()) { report.cancelled = true; break; }
    progress({ step: 'مخزن ' + s });
    try {
      const sc = await scanStore(s, deps, (s === STORES.ORDERS || s === STORES.ORDER_MEDIA) ? { stopAtBytes: ORDERS_GETALL_CAP } : {});
      /* مخزن orderMedia كله وسائط (حقل data) */
      const row = { store: s, count: sc.count, bytes: sc.bytes, mediaBytes: s === STORES.ORDER_MEDIA ? sc.bytes : sc.mediaBytes, timing: null, skipped: '' };
      if (s === STORES.BACKUPS) row.skipped = 'ليس ضمن قراءات الصفحات (حجمه فقط)';
      else if (sc.capped) { row.skipped = 'تخطّي القياس الزمني حمايةً (حجم كبير جداً)'; report.skipped.push(s); }
      else row.timing = summarizeTimes((await timeGetAll(s, deps)).times);
      report.stores.push(row);
    } catch (e) {
      report.stores.push({ store: s, count: 0, bytes: 0, mediaBytes: 0, timing: null, skipped: 'تعذّر: ' + (e && e.message || e) });
    }
  }

  const ord = report.stores.find((r) => r.store === STORES.ORDERS);
  const sep = report.stores.find((r) => r.store === STORES.ORDER_MEDIA);
  if (ord) {
    report.orders = {
      separatedBytes: sep ? sep.bytes : 0,        /* وسائط في مخزن orderMedia (لا تبطئ قراءة الطلبات) */
      count: ord.count, totalBytes: ord.bytes, mediaBytes: ord.mediaBytes,
      mediaShare: ord.bytes > 0 ? ord.mediaBytes / ord.bytes : 0,
      avgBytes: ord.count > 0 ? Math.round(ord.bytes / ord.count) : 0,
      avgSlimBytes: ord.count > 0 ? Math.round((ord.bytes - ord.mediaBytes) / ord.count) : 0,
    };
  }

  for (const p of PAGE_PROFILES) {
    if (cancelled()) { report.cancelled = true; break; }
    if (report.skipped.includes(STORES.ORDERS) && p.waves.some((w) => w.includes(STORES.ORDERS))) {
      report.pages.push({ id: p.id, label: p.label, timing: null, reads: countReads(p), ordersReads: ordersReads(p), skipped: 'يتضمن الطلبات (تخطّيناها حمايةً)' });
      continue;
    }
    progress({ step: 'صفحة ' + p.label });
    const times = [];
    try {
      for (let i = 0; i < RUNS; i++) {
        const a = deps.now();
        for (const wave of p.waves) await Promise.all(wave.map((s) => deps.getAll(s)));
        times.push(deps.now() - a);
      }
      report.pages.push({ id: p.id, label: p.label, timing: summarizeTimes(times), reads: countReads(p), ordersReads: ordersReads(p), skipped: '' });
    } catch (e) {
      report.pages.push({ id: p.id, label: p.label, timing: null, reads: countReads(p), ordersReads: ordersReads(p), skipped: 'تعذّر: ' + (e && e.message || e) });
    }
  }
  report.totalMs = Math.round(deps.now() - t0);
  return report;
}

function countReads(p) { return p.waves.reduce((a, w) => a + w.length, 0); }
function ordersReads(p) { return p.waves.reduce((a, w) => a + w.filter((s) => s === STORES.ORDERS).length, 0); }

/**
 * تقدير النمو: حجم الطلبات عند أعداد أكبر (موثوق: حساب مباشر)، وزمن القراءة (يُقدَّر فقط بمعدل موثوق).
 * مصدر معدل النقل بالترتيب: (1) قياس الطلبات الفعلي إن كان كبيراً (≥ 2MB) · (2) الاختبار التخيّلي إن وُجد ·
 * (3) لا شيء ⟵ الأعمدة الزمنية null (v3.3.86: كان يُستعمل معدل من بيانات صغيرة جداً فيعطي أرقاماً أبطأ بـ 60 ضعفاً).
 * @param {Object} report — ناتج runProbe
 * @param {number[]} [counts]
 * @param {{rows?:Array}|null} [synthetic] — ناتج runSynthetic (اختياري)
 * @returns {{throughputMBs:number|null, reliable:boolean, source:'measured'|'synthetic'|'none', rows:Array}}
 */
export function projectGrowth(report, counts = [100, 500, 1000], synthetic = null) {
  const ord = report && report.stores ? report.stores.find((r) => r.store === STORES.ORDERS) : null;
  const o = report && report.orders;
  if (!ord || !o) return { throughputMBs: null, reliable: false, source: 'none', rows: [] };
  let rate = null; let source = 'none';
  if (ord.timing && ord.bytes >= 2 * 1024 * 1024 && ord.timing.median > 0) {
    rate = (ord.bytes / 1048576) / (ord.timing.median / 1000); source = 'measured';
  } else if (synthetic && Array.isArray(synthetic.rows)) {
    const good = synthetic.rows.filter((r) => r && r.full && r.full.median > 0 && r.fullBytes > 0);
    const big = good[good.length - 1];
    if (big) { rate = (big.fullBytes / 1048576) / (big.full.median / 1000); source = 'synthetic'; }
  }
  const rows = counts.map((n) => {
    const full = o.avgBytes * n; const slim = o.avgSlimBytes * n;
    return {
      orders: n, fullBytes: full, slimBytes: slim,
      fullMs: rate ? Math.round((full / 1048576) / rate * 1000) : null,
      slimMs: rate ? Math.round((slim / 1048576) / rate * 1000) : null,
    };
  });
  return { throughputMBs: rate ? Math.round(rate * 10) / 10 : null, reliable: source !== 'none', source, rows };
}

/**
 * أحكام مبسّطة بالعربية من التقرير (عتبات: <150ms ممتاز · <400 جيد · <1000 ملحوظ · غير ذلك بطيء).
 * @param {Object} report
 * @returns {string[]}
 */
export function verdictLines(report) {
  const out = [];
  const dash = (report.pages || []).find((p) => p.id === 'dashboard');
  if (dash && dash.timing) {
    const m = dash.timing.median;
    const lvl = m < 150 ? 'ممتاز' : m < 400 ? 'جيد' : m < 1000 ? 'ملحوظ — يستحق التحسين' : 'بطيء — يحتاج تحسيناً';
    out.push('فتح لوحة التحكم (قراءات البيانات فقط): ' + fmtMs(m) + ' ⟵ ' + lvl + ' · تقرأ الطلبات ' + dash.ordersReads + ' مرات');
  }
  const o = report.orders;
  if (o && o.count > 0) {
    out.push('وسائط مضمَّنة في سجل الطلب (تُقرأ مع كل قراءة للطلبات) = ' + Math.round(o.mediaShare * 100) + '% من حجم الطلبات (' + fmtBytes(o.mediaBytes) + ' من ' + fmtBytes(o.totalBytes) + ')');
    if (o.separatedBytes > 0) out.push('وسائط مفصولة في orderMedia: ' + fmtBytes(o.separatedBytes) + ' (لا تبطئ قراءة الطلبات)');
    if (o.mediaShare > 0.5 && o.mediaBytes > 1024 * 1024) out.push('أغلب حجم الطلبات وسائط مضمَّنة ⟵ فصلها عن سجل الطلب يعطي أكبر مكسب عند النمو');
  } else if (o) out.push('لا طلبات بعد — القياس الحالي على بيانات قليلة جداً؛ استعمل اختبار النمو التخيّلي');
  if (report.skipped && report.skipped.length) out.push('تخطّينا قياس: ' + report.skipped.join('، ') + ' (حجم كبير جداً — هذا بحد ذاته مؤشر)');
  return out;
}

/**
 * يصيغ التقرير نصاً عربياً كاملاً للنسخ واللصق.
 * @param {Object} report — ناتج runProbe
 * @param {Object|null} [synthetic] — ناتج runSynthetic (اختياري)
 * @returns {string}
 */
export function formatReport(report, synthetic = null) {
  const L = [];
  const d = new Date(report.at);
  L.push('تقرير قياس الأداء — ورشة الجلابيب v' + report.version);
  L.push('التاريخ: ' + d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC · مدة القياس: ' + report.totalMs + ' ms' + (report.cancelled ? ' (أُوقف قبل الانتهاء)' : ''));
  const e = report.env || {};
  L.push('الجهاز: ' + String(e.ua || '').slice(0, 140) + (e.memory ? ' · ذاكرة ~' + e.memory + 'GB' : '') + (e.cores ? ' · ' + e.cores + ' أنوية' : '') + ' · اتصال: ' + (e.online === false ? 'لا' : 'نعم'));
  if (report.storage && report.storage.quota) L.push('التخزين: مستخدم ' + fmtBytes(report.storage.usage) + ' من ' + fmtBytes(report.storage.quota));
  L.push('فتح قاعدة البيانات: ' + fmtMs(report.openMs));
  L.push('');
  L.push('— الخلاصة —');
  verdictLines(report).forEach((x) => L.push('• ' + x));
  L.push('');
  L.push('— المخازن (العدد · الحجم · getAll الأول/الوسيط) —');
  for (const r of report.stores) {
    if (r.count === 0 && !r.skipped) continue;
    L.push(r.store + ': ' + r.count + ' · ' + fmtBytes(r.bytes) + (r.mediaBytes ? ' (وسائط ' + fmtBytes(r.mediaBytes) + ')' : '') +
      (r.timing ? ' · ' + fmtMs(r.timing.first) + ' / ' + fmtMs(r.timing.median) : '') + (r.skipped ? ' · ' + r.skipped : ''));
  }
  L.push('');
  L.push('— فتح الصفحات (قراءات البيانات فقط، وسيط ' + RUNS + ' مرات) —');
  for (const p of report.pages) {
    L.push(p.label + ': ' + (p.timing ? fmtMs(p.timing.median) + ' (الأول ' + fmtMs(p.timing.first) + ')' : '—') + ' · ' + p.reads + ' قراءة (الطلبات ' + p.ordersReads + '×)' + (p.skipped ? ' · ' + p.skipped : ''));
  }
  const g = projectGrowth(report, undefined, synthetic);
  if (g.rows.length) {
    L.push('');
    L.push('— تقدير النمو (قراءة الطلبات الواحدة) —');
    if (g.source === 'none') L.push('الزمن: لا يُقدَّر من بياناتك الحالية (قليلة جداً) — شغّل «اختبار النمو التخيّلي» للحصول عليه. الأحجام أدناه حساب مباشر.');
    else L.push('معدل النقل: ' + g.throughputMBs + ' MB/s (' + (g.source === 'synthetic' ? 'من الاختبار التخيّلي' : 'مقيس على بياناتك') + ')');
    for (const r of g.rows) L.push(r.orders + ' طلب: ' + fmtBytes(r.fullBytes) + (r.fullMs !== null ? ' ≈ ' + r.fullMs + ' ms' : '') + ' · بلا وسائط ' + fmtBytes(r.slimBytes) + (r.slimMs !== null ? ' ≈ ' + r.slimMs + ' ms' : ''));
  }
  if (synthetic) {
    L.push('');
    L.push('— اختبار النمو التخيّلي (قاعدة مؤقتة حُذفت) —');
    if (synthetic.skipped) L.push('لم يُجرَ: ' + synthetic.skipped);
    for (const r of synthetic.rows || []) {
      L.push(r.orders + ' طلب × ' + r.mediaKB + 'KB صورة (' + fmtBytes(r.fullBytes) + '): بالصور ' + fmtMs(r.full.median) + ' (الأول ' + fmtMs(r.full.first) + ') · بلا صور ' +
        fmtMs(r.slim.median) + ' · قراءة اللوحة (4×) ≈ ' + fmtMs(r.full.median * 4) + (r.note ? ' · ' + r.note : ''));
    }
  }
  return L.join('\n');
}

/* ==========================================================================
   اختبار النمو التخيّلي — قاعدة مؤقتة منفصلة (لا يلمس قاعدة التطبيق)
   ========================================================================== */

/**
 * هل يكفي التخزين المتاح لسيناريو؟ (دالة نقية)
 * @param {{usage:number, quota:number}|null} est
 * @param {number} needBytes
 * @returns {boolean} true إن كفى بهامش 2×، أو إن تعذّر معرفة المساحة (نجرّب ونلتقط الخطأ)
 */
export function hasRoomFor(est, needBytes) {
  if (!est || !Number.isFinite(est.quota) || !Number.isFinite(est.usage)) return true;
  return est.quota - est.usage > needBytes * 2;
}

/** سلسلة عشوائية بطول محدد (لا تضغطها طبقة التخزين فتشبه base64 حقيقياً). */
function randomB64(len) {
  const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  const chunk = 4096;
  for (let i = 0; i < len; i += chunk) {
    let part = '';
    for (let j = 0; j < Math.min(chunk, len - i); j++) part += ch[(Math.random() * 64) | 0];
    s += part;
  }
  return s;
}

const idbReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/**
 * يشغّل سيناريوهات تخيّلية: n طلب بصورة مرجعية بحجم mediaKB.
 * @param {Object} [opts]
 * @param {number[]} [opts.counts=[100,300]]
 * @param {number} [opts.mediaKB=250] — حجم الصورة بعد الضغط (الحد الأقصى في التطبيق 500KB)
 * @param {(p:{step:string})=>void} [opts.onProgress]
 * @param {()=>boolean} [opts.shouldCancel]
 * @param {Object} [opts.deps] — {indexedDB, now, storageEstimate}
 * @returns {Promise<{rows:Array, skipped:string}>}
 */
export async function runSynthetic(opts = {}) {
  const counts = opts.counts || [100, 300];
  const mediaKB = opts.mediaKB || 250;
  const dep = opts.deps || {};
  const factory = ('indexedDB' in dep) ? dep.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const now = dep.now || defaultNow;
  const estimate = dep.storageEstimate || defaultDeps().storageEstimate;
  const progress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const out = { rows: [], skipped: '' };
  if (!factory) { out.skipped = 'IndexedDB غير متاحة'; return out; }

  const media = randomB64(mediaKB * 1024);
  for (const n of counts) {
    if (typeof opts.shouldCancel === 'function' && opts.shouldCancel()) { out.skipped = 'أُوقف'; break; }
    const need = n * mediaKB * 1024;
    if (!hasRoomFor(await estimate(), need)) { out.skipped = 'المساحة المتاحة لا تكفي لسيناريو ' + n + ' طلب'; break; }
    progress({ step: n + ' طلب' });
    const name = 'jalabiya_perf_probe_tmp_' + Date.now();
    let db = null;
    try {
      db = await new Promise((res, rej) => {
        const r = factory.open(name, 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('full', { keyPath: 'id' }); r.result.createObjectStore('slim', { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      for (let i = 0; i < n; i += 20) {
        const tx = db.transaction(['full', 'slim'], 'readwrite');
        for (let j = i; j < Math.min(n, i + 20); j++) {
          const base = { id: 'o' + j, customerId: 'c' + (j % 40), status: 'new', total: 500 + j, items: [{ n: 'جلابية', q: 1, p: 500 }], notes: 'x'.repeat(80), createdAt: 1, updatedAt: 1 };
          const off = (j * 7919) % media.length;
          tx.objectStore('full').put({ ...base, referenceImage: media.slice(off) + media.slice(0, off) });
          tx.objectStore('slim').put(base);
        }
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
      }
      const readAll = async (store) => {
        const times = [];
        for (let k = 0; k < RUNS; k++) { const a = now(); await idbReq(db.transaction(store, 'readonly').objectStore(store).getAll()); times.push(now() - a); }
        return summarizeTimes(times);
      };
      out.rows.push({ orders: n, mediaKB, fullBytes: need, full: await readAll('full'), slim: await readAll('slim'), note: '' });
    } catch (e) {
      out.rows.push({ orders: n, mediaKB, fullBytes: need, full: summarizeTimes([0]), slim: summarizeTimes([0]), note: 'تعذّر: ' + (e && e.message || e) });
      out.skipped = out.skipped || 'توقف عند ' + n + ' طلب (' + (e && e.name || 'خطأ') + ')';
      break;
    } finally {
      try { if (db) db.close(); } catch (e) { /* ignore */ }
      try { factory.deleteDatabase(name); } catch (e) { /* ignore */ }
    }
  }
  return out;
}
