/* ==========================================================================
   diagnostics.js — تقرير مشكلة جاهز للإرسال («أبلغ عن مشكلة»)
   ==========================================================================
   يجمّع في نص واحد: رقم الإصدار، نوع الجهاز والمتصفح، حالة التخزين وأعداد السجلات (أرقام فقط)،
   حالة المزامنة وService Worker، وآخر أخطاء التطبيق — بدل وصف العطل أو تصوير الشاشة.

   الخصوصية (مقصودة ومختبَرة):
     - لا أسماء عملاء ولا أرقام هواتف ولا مبالغ ولا بريد حساب المزامنة: أعداد فقط.
     - رسائل الأخطاء تُنقَّى: بريد/هاتف/رموز طويلة تُحجب، والروابط بلا query/hash، وتُقصّ.
     - المستخدم يرى النص كاملاً ويستطيع تعديله قبل الإرسال.
   كل جزء يُجمع بمعزل: فشل جزء لا يُسقط التقرير (يُكتب «تعذّر»).
   ========================================================================== */

import { APP_CONFIG, DB_CONFIG } from '../core/config.js';
import { RECORD_STORES } from '../data/record-meta.js';
import * as idb from '../data/idb.js';
import { getRecent } from '../core/error-handler.js';
import { getStatus as getSyncStatus } from '../sync/auto-sync.js';
import { getKnownRev } from '../sync/firestore-sync.js';
import { countConflicts } from '../sync/conflict-log.js';

const MAX_ERRORS = 15;
const MAX_MSG = 300;
const MAX_STACK_LINES = 4;

/** يحجب البيانات الشخصية المحتملة من نص حر (رسالة خطأ/مسار). */
export function redactText(input) {
  let s = String(input == null ? '' : input);
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[بريد]');
  /* روابط: نُبقي المسار ونحذف ?query و#hash (قد تحمل معرّفات) */
  s = s.replace(/(https?:\/\/[^\s)'"<>?#]+)[?#][^\s)'"<>]*/g, '$1');
  /* أرقام هاتف/حساب: 7 أرقام فأكثر (لاتينية أو هندية) ولو تخللتها مسافات/شرطات */
  s = s.replace(/(?:\+?[0-9٠-٩][0-9٠-٩\s-]{5,}[0-9٠-٩])/g, (m) => ((m.match(/[0-9٠-٩]/g) || []).length >= 7 ? '[رقم]' : m));   /* \D لا تلتقط الأرقام الهندية فنعدّ الأرقام صراحةً */
  /* رموز طويلة (JWT/مفاتيح/base64) */
  s = s.replace(/[A-Za-z0-9_\-+/=]{32,}/g, '[رمز]');
  return s;
}

/** تنقية سجل خطأ واحد (من error-handler.getRecent). */
export function sanitizeError(e) {
  const msg = redactText(String((e && e.message) || 'Unknown error')).slice(0, MAX_MSG);
  const stack = String((e && e.stack) || '')
    .split('\n').slice(0, MAX_STACK_LINES)
    .map((l) => redactText(l).trim().slice(0, 160)).filter(Boolean).join(' ⏎ ');
  let route = '';
  try { route = new URL(String((e && e.url) || ''), 'http://x/').hash.replace(/^#\/?/, '').split(/[/?]/)[0]; } catch (err) { /* ignore */ }
  return {
    kind: (e && e.kind) || 'unknown',
    at: Number.isFinite(e && e.timestamp) ? e.timestamp : null,
    message: msg,
    stack,
    route: redactText(route).slice(0, 40),
  };
}

async function safe(fn, fallback = 'تعذّر الجمع') {
  try { return await fn(); } catch (e) { return fallback; }
}

const mb = (n) => (Number.isFinite(n) ? (n / 1048576).toFixed(1) + 'MB' : '—');

/**
 * جمع المعلومات.
 * @param {Object} [env] — للاختبار: { nav, win, doc, loc, errors, counts, now }
 * @returns {Promise<Object>}
 */
export async function collectDiagnostics(env = {}) {
  const nav = env.nav || (typeof navigator !== 'undefined' ? navigator : {});
  const win = env.win || (typeof window !== 'undefined' ? window : {});
  const loc = env.loc || (typeof location !== 'undefined' ? location : { hash: '', protocol: '' });
  const now = env.now || Date.now();

  const d = {};
  d.generatedAt = new Date(now).toISOString();
  d.app = {
    name: APP_CONFIG.nameEn, version: APP_CONFIG.version, dbVersion: DB_CONFIG.version,
  };
  d.time = await safe(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { timezone: tz, utcOffsetMin: -new Date(now).getTimezoneOffset() };
  });
  d.device = await safe(() => ({
    userAgent: String(nav.userAgent || ''),
    platform: String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || ''),
    language: String(nav.language || ''),
    screen: win.screen ? `${win.screen.width}x${win.screen.height}@${win.devicePixelRatio || 1}` : '—',
    viewport: `${win.innerWidth || 0}x${win.innerHeight || 0}`,
    touchPoints: nav.maxTouchPoints || 0,
    memoryGB: nav.deviceMemory || null,
    cores: nav.hardwareConcurrency || null,
    network: nav.connection ? (nav.connection.effectiveType || '') : '',
    online: nav.onLine !== false,
    standalone: !!(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true,
  }));
  d.route = (() => { try { return String(loc.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0] || '(الرئيسية)'; } catch (e) { return ''; } })();
  d.secure = loc.protocol === 'https:' || loc.hostname === 'localhost';

  d.storage = await safe(async () => {
    const out = {};
    if (nav.storage && nav.storage.estimate) {
      const est = await nav.storage.estimate();
      out.usage = mb(est.usage); out.quota = mb(est.quota);
    }
    if (nav.storage && nav.storage.persisted) out.persisted = await nav.storage.persisted();
    return out;
  });

  d.counts = await safe(async () => {
    if (env.counts) return env.counts;
    const out = {};
    for (const s of [...RECORD_STORES, 'backups']) {
      try { out[s] = await idb.count(s); } catch (e) { out[s] = 'تعذّر'; }
    }
    return out;
  });

  d.sync = await safe(() => {
    const st = getSyncStatus();
    let last = null;
    try { last = Number(localStorage.getItem('jalabiya_v3_last_sync')) || null; } catch (e) { /* ignore */ }
    return {
      configured: !!st.configured, loggedIn: !!st.loggedIn, auto: !!st.auto,
      dirtySince: st.dirtySince || null, stale: !!st.stale, blocked: st.blocked || null,
      lastSync: last, knownRev: getKnownRev(), conflicts: countConflicts(),
    };
  });

  d.serviceWorker = await safe(async () => {
    if (!nav.serviceWorker) return { supported: false };
    const reg = await nav.serviceWorker.getRegistration();
    const cacheNames = (win.caches && win.caches.keys) ? await win.caches.keys() : [];
    return {
      supported: true, controlled: !!nav.serviceWorker.controller,
      active: reg && reg.active ? reg.active.state : null, waiting: !!(reg && reg.waiting),
      caches: cacheNames.filter((n) => /jalabiya/i.test(n)),
    };
  });

  d.recordSchema = await safe(() => {
    try { return JSON.parse(localStorage.getItem('jalabiya_v3_record_schema_checked') || '{}'); } catch (e) { return {}; }
  });

  d.errors = await safe(() => (env.errors || getRecent(MAX_ERRORS)).slice(0, MAX_ERRORS).map(sanitizeError), []);
  return d;
}

/* عزل اتجاهي (LRI/PDI) للقيم التقنية داخل سطر عربي: يمنع انقلاب التواريخ والإصدارات والأرقام */
const ltr = (v) => '\u2066' + v + '\u2069';
const fmtTs = (t) => (t ? ltr(new Date(t).toISOString().replace('T', ' ').slice(0, 19) + 'Z') : '—');
const j = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/** نص التقرير النهائي. @param {string} description وصف المستخدم */
export function formatReport(d, description = '') {
  const L = [];
  L.push('🛟 تقرير مشكلة — ' + d.app.name + ' ' + ltr('v' + d.app.version));
  L.push('');
  L.push('📝 وصف المشكلة:');
  L.push((description || '').trim() || '(لم يُكتب وصف)');
  L.push('');
  L.push('— التطبيق —');
  L.push('الإصدار: ' + ltr(d.app.version) + ' | قاعدة البيانات: ' + ltr('v' + d.app.dbVersion));
  L.push('الصفحة الحالية: ' + d.route + ' | آمن (https): ' + (d.secure ? 'نعم' : 'لا'));
  L.push('وقت التقرير: ' + ltr(d.generatedAt) + (d.time && d.time.timezone ? ' ' + ltr('(' + d.time.timezone + ' UTC' + (d.time.utcOffsetMin >= 0 ? '+' : '') + d.time.utcOffsetMin / 60 + ')') : ''));
  L.push('');
  L.push('— الجهاز —');
  if (d.device && typeof d.device === 'object') {
    L.push('المتصفح: ' + ltr(d.device.userAgent));
    L.push('النظام: ' + d.device.platform + ' | اللغة: ' + d.device.language);
    L.push('الشاشة: ' + ltr(d.device.screen) + ' | النافذة: ' + ltr(d.device.viewport) + ' | لمس: ' + d.device.touchPoints);
    L.push('الذاكرة: ' + (d.device.memoryGB || '—') + 'GB | الأنوية: ' + (d.device.cores || '—') + ' | الشبكة: ' + (d.device.network || '—') + ' | متصل: ' + (d.device.online ? 'نعم' : 'لا'));
    L.push('وضع التطبيق المثبّت: ' + (d.device.standalone ? 'نعم' : 'لا'));
  } else L.push(j(d.device));
  L.push('');
  L.push('— التخزين وحجم البيانات (أعداد فقط) —');
  L.push('المستخدَم: ' + (d.storage && d.storage.usage || '—') + ' من ' + (d.storage && d.storage.quota || '—') + ' | تخزين دائم: ' + (d.storage && d.storage.persisted === true ? 'نعم' : d.storage && d.storage.persisted === false ? 'لا' : '—'));
  if (d.counts && typeof d.counts === 'object') {
    L.push('السجلات: ' + (Object.entries(d.counts).filter(([, n]) => n !== 0).map(([k, n]) => ltr(k + '=' + n)).join(' ، ') || 'لا سجلات'));
  } else L.push(j(d.counts));
  L.push('نسخ المخطط المفحوصة: ' + j(d.recordSchema));
  L.push('');
  L.push('— المزامنة و Service Worker —');
  if (d.sync && typeof d.sync === 'object') {
    L.push('مُهيَّأة: ' + d.sync.configured + ' | مسجَّل دخول: ' + d.sync.loggedIn + ' | تلقائية: ' + d.sync.auto + ' | متوقفة بسبب: ' + (d.sync.blocked || '—'));
    L.push('تعديلات لم تُرفع منذ: ' + fmtTs(d.sync.dirtySince) + (d.sync.stale ? ' (متأخرة)' : '') + ' | آخر مزامنة: ' + fmtTs(d.sync.lastSync) + ' | تعارضات: ' + d.sync.conflicts);
  } else L.push(j(d.sync));
  L.push('SW: ' + j(d.serviceWorker));
  L.push('');
  L.push('— آخر الأخطاء (' + (Array.isArray(d.errors) ? d.errors.length : 0) + ') —');
  if (Array.isArray(d.errors) && d.errors.length) {
    d.errors.forEach((e, i) => {
      L.push((i + 1) + '. [' + e.kind + '] ' + fmtTs(e.at) + (e.route ? ' @' + e.route : '') + ' — ' + e.message);
      if (e.stack) L.push('   ' + e.stack);
    });
  } else L.push('لا أخطاء مسجّلة في هذه الجلسة.');
  L.push('');
  L.push('🔒 لا يحتوي هذا التقرير أسماء عملاء ولا أرقام هواتف ولا مبالغ.');
  return L.join('\n');
}

/**
 * مشاركة نص التقرير: قائمة المشاركة ← نسخ للحافظة ← تنزيل ملف.
 * @returns {Promise<'shared'|'cancelled'|'copied'|'downloaded'>}
 */
export async function shareReport(text, env = {}) {
  const nav = env.nav || navigator;
  if (nav.share) {
    try {
      await nav.share({ title: 'تقرير مشكلة — جلابية V3', text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  if (await copyReport(text, env)) return 'copied';
  downloadReport(text, env);
  return 'downloaded';
}

/** نسخ للحافظة. @returns {Promise<boolean>} */
export async function copyReport(text, env = {}) {
  const nav = env.nav || navigator;
  try {
    if (nav.clipboard && nav.clipboard.writeText) { await nav.clipboard.writeText(text); return true; }
  } catch (e) { /* يسقط للبديل */ }
  return false;
}

/** تنزيل كملف نصي. */
export function downloadReport(text, env = {}) {
  const doc = env.doc || document;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = 'jalabiya-report-' + new Date().toISOString().slice(0, 10) + '.txt';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
