/* ==========================================================================
   auto-sync.js — رفع تلقائي هادئ للتعديلات غير المرفوعة
   ==========================================================================
   متى يرفع (إن كان مفعّلاً + المستخدم مسجّل الدخول + متصل + فيه تعديلات غير مرفوعة):
     - بعد 3 دقائق من آخر تعديل (idle).
     - عند إخفاء التطبيق/تبديل التبويب (visibilitychange).
     - عند عودة الاتصال، وبعد 10 ثوانٍ من فتح التطبيق.
   الأمان: يستعمل push() العادي بلا force — فلا يكتب فوق سحابة تغيّرت من جهاز آخر.
   عند التعارض يتوقف تماماً ويضع علامة «يحتاج قرارك» (يظهر مؤشر علوي) حتى يقرر المستخدم يدوياً.
   ========================================================================== */

import * as authSync from './auth-sync.js';
import * as fsync from './firestore-sync.js';
import * as dirty from './dirty-state.js';
import { STORAGE_KEYS } from '../core/config.js';

const K_AUTO = 'jalabiya_v3_auto_sync';
const K_BLOCK = 'jalabiya_v3_sync_blocked';
const IDLE_MS = 3 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
export const STALE_MS = 2 * 24 * 3600 * 1000;

let user = null;
let timer = null;
let running = false;
let lastAttempt = 0;
let started = false;
const listeners = new Set();

function emit() {
  const st = getStatus();
  for (const cb of listeners) { try { cb(st); } catch (e) { /* ignore */ } }
}

export function isAutoEnabled() {
  try { return localStorage.getItem(K_AUTO) !== '0'; } catch (e) { return true; }
}
export function setAutoEnabled(on) {
  try { localStorage.setItem(K_AUTO, on ? '1' : '0'); } catch (e) { /* ignore */ }
  if (on) schedule(5000);
  emit();
}

export function getBlocked() {
  try { return localStorage.getItem(K_BLOCK) || null; } catch (e) { return null; }
}
function setBlocked(code) {
  try { localStorage.setItem(K_BLOCK, code); } catch (e) { /* ignore */ }
}
/** تُستدعى بعد أي رفع/تنزيل يدوي ناجح: يعود الرفع التلقائي للعمل. */
export function onManualSyncDone() {
  try { localStorage.removeItem(K_BLOCK); } catch (e) { /* ignore */ }
  emit();
}

/** المستخدم الحالي لهذا الجهاز (تُحدّثه صفحة المزامنة عند تسجيل الدخول). */
export function setUser(u) {
  user = u || null;
  emit();
  if (user) schedule(10000);
}

export function getStatus() {
  const d = dirty.getState();
  let lastPush = d.lastPush;
  if (!lastPush) {
    try { lastPush = Number(localStorage.getItem(STORAGE_KEYS.V3_LAST_SYNC)) || null; } catch (e) { lastPush = null; }
  }
  return {
    configured: authSync.isConfigured(),
    auto: isAutoEnabled(),
    loggedIn: !!user,
    dirtySince: d.dirtySince,
    lastPush,
    blocked: getBlocked(),
    stale: !!d.dirtySince && (Date.now() - d.dirtySince) > STALE_MS,
  };
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function schedule(ms) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { tryAutoPush(); }, ms);
}

/** محاولة رفع تلقائي (آمنة: لا تُلقي أخطاء ولا تتجاوز حماية السحابة). */
export async function tryAutoPush() {
  if (!isAutoEnabled() || !user || running || getBlocked()) return { skipped: true };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { skipped: true };
  if (!dirty.getState().dirtySince) return { skipped: true };
  const gap = Date.now() - lastAttempt;
  if (gap < MIN_GAP_MS) { schedule(MIN_GAP_MS - gap + 500); return { skipped: true }; }

  running = true; lastAttempt = Date.now();
  let res = null;
  try {
    res = await fsync.push(user.uid);
    if (!res.ok && res.code) setBlocked(res.code);   /* تعارض: لا نكرّر المحاولة */
  } catch (e) {
    res = { ok: false, error: String(e && e.message || e) };
  } finally {
    running = false;
    emit();
  }
  /* فشل مؤقت (شبكة…) يُعاد لاحقاً */
  if (res && !res.ok && !res.code && dirty.getState().dirtySince) schedule(5 * 60 * 1000);
  return res;
}

/** تشغيل المراقبة. يُستدعى مرة بعد فتح التطبيق (بعد شاشة القفل). */
export function start() {
  if (started) return;
  started = true;
  dirty.installTracking(fsync.SYNC_STORES);

  dirty.subscribe((st) => {
    emit();
    if (st.dirtySince) schedule(IDLE_MS);
  });
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') tryAutoPush();
    });
    window.addEventListener('online', () => { tryAutoPush(); });
  } catch (e) { /* ignore */ }

  /* نحمّل Firebase عند الإقلاع فقط لمن زامن من قبل (لا نُثقل غيرهم) */
  let usedBefore = false;
  try { usedBefore = fsync.getKnownRev() !== null || !!localStorage.getItem(STORAGE_KEYS.V3_LAST_SYNC); } catch (e) { /* ignore */ }
  if (authSync.isConfigured() && usedBefore) {
    authSync.onAuthChange((u) => { setUser(u); });
  }
  if (dirty.getState().dirtySince) schedule(10000);
  emit();
}
