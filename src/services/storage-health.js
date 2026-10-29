/* ==========================================================================
   storage-health.js — حماية التخزين المحلي من الحذف التلقائي (v3.3.49)
   ==========================================================================
   بياناتك في IndexedDB على الجهاز. بدون «تخزين دائم» يحقّ للمتصفح حذفها وحدها إذا امتلأ
   تخزين الجوال (خصوصاً Safari/iOS وتطبيقات الويب غير المثبّتة).
   - requestPersistence(): يطلب navigator.storage.persist() إن لم يكن ممنوحاً (لا يُلقي أخطاء).
   - getStorageStatus(): هل هو محمي؟ والمساحة المستخدمة/المتاحة.
   المتصفح هو من يقرّر المنح: Chrome يمنحه غالباً للتطبيق المثبّت أو كثير الاستخدام،
   وSafari للتطبيق المضاف للشاشة الرئيسية، وFirefox يسأل المستخدم.
   كل الدوال تقبل nav للاختبار (الافتراضي navigator).
   ========================================================================== */

function storageApi(nav) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  return n && n.storage ? n.storage : null;
}

/**
 * يطلب التخزين الدائم إن لم يكن ممنوحاً.
 * @returns {Promise<{supported:boolean, persisted:boolean, requested:boolean}>}
 */
export async function requestPersistence(nav) {
  const st = storageApi(nav);
  if (!st || typeof st.persist !== 'function') return { supported: false, persisted: false, requested: false };
  try {
    if (typeof st.persisted === 'function' && await st.persisted()) {
      return { supported: true, persisted: true, requested: false };
    }
    const granted = !!(await st.persist());
    return { supported: true, persisted: granted, requested: true };
  } catch (e) {
    return { supported: true, persisted: false, requested: true };
  }
}

/**
 * حالة التخزين الحالية.
 * @returns {Promise<{supported:boolean, persisted:boolean, usage:number|null, quota:number|null, percent:number|null}>}
 */
export async function getStorageStatus(nav) {
  const st = storageApi(nav);
  if (!st) return { supported: false, persisted: false, usage: null, quota: null, percent: null };
  let persisted = false;
  let usage = null;
  let quota = null;
  try { if (typeof st.persisted === 'function') persisted = !!(await st.persisted()); } catch (e) { /* ignore */ }
  try {
    if (typeof st.estimate === 'function') {
      const est = await st.estimate();
      usage = Number.isFinite(est && est.usage) ? est.usage : null;
      quota = Number.isFinite(est && est.quota) ? est.quota : null;
    }
  } catch (e) { /* ignore */ }
  const percent = usage !== null && quota ? Math.min(100, Math.round((usage / quota) * 1000) / 10) : null;
  return { supported: typeof st.persist === 'function', persisted, usage, quota, percent };
}

/** 1536000 → «1.5 MB». */
export function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return Math.round(v) + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + ' ' + units[i];
}
