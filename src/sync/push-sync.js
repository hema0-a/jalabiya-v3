/* ==========================================================================
   push-sync.js — إشعارات Push حقيقية (FCM) تصل والتطبيق مقفول
   ==========================================================================
   المسار في Firestore:  users_v3/{uid}/push/main
     tokens: { <hash>: { t: <fcm token>, ua, at } }   ← أجهزة هذا الحساب
     prefs:  خيارات الخادمة (الوقت، الأيام، ساعات الهدوء…)
     digest: ملخص صغير (انظر push-digest.js)
   الخادمة (functions/index.js) تقرأ المستند وترسل إشعاراً واحداً يومياً.
   - تتطلب: تسجيل دخول المزامنة + مفتاح VAPID + إذن الإشعارات.
   - كل الاستيرادات الثقيلة (firebase-messaging) كسولة: لا تُحمَّل إلا عند التفعيل.
   - لا يُرمى أي خطأ للخارج من التحديث التلقائي (best-effort).
   ========================================================================== */

import { loadFirebase, isConfigured } from './firebase-config.js';
import { onAuthChange, getUserInfo } from './auth-sync.js';
import { onWrite } from '../data/idb.js';
import { settings as settingsRepo } from '../data/repos/settings.js';
import { orders as ordersRepo } from '../data/repos/orders.js';
import { customers as customersRepo } from '../data/repos/customers.js';
import { inventory as inventoryRepo } from '../data/repos/inventory.js';
import { commitments as commitmentsRepo } from '../data/repos/commitments.js';
import { filterLowStockForAlerts, splitOutOfStock } from '../services/alert-rules.js';
import { buildDigest, serverPrefs, pushOptions, sameDigest } from '../services/push-digest.js';

const VERSION = '10.12.0';
const BASE = 'https://www.gstatic.com/firebasejs/' + VERSION + '/';
const K_HASH = 'jalabiya_v3_push_hash';        /* بصمة رمز هذا الجهاز (يعني: مفعّل هنا) */
const K_LAST = 'jalabiya_v3_push_last';        /* آخر ملخص + خيارات رُفعت */
const WATCHED = new Set(['orders', 'customers', 'inventory', 'commitments', 'settings']);
const DEBOUNCE_MS = 15000;

let _uid = null;
let _timer = null;
let _started = false;
let _inflight = null;

/* ---------- أدوات ---------- */

export function isPushSupported() {
  try {
    return typeof window !== 'undefined' && 'Notification' in window
      && 'serviceWorker' in navigator && 'PushManager' in window && isConfigured();
  } catch (e) { return false; }
}

/** بصمة قصيرة ثابتة للرمز (مفتاح الحقل في Firestore). */
export async function tokenHash(token) {
  const data = new TextEncoder().encode(String(token));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getLocalStatus() {
  let hash = null;
  try { hash = localStorage.getItem(K_HASH); } catch (e) { /* ignore */ }
  return {
    supported: isPushSupported(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    registered: !!hash,
    signedIn: !!(_uid || (getUserInfo() && getUserInfo().uid)),
  };
}

function currentUid() {
  return _uid || (getUserInfo() && getUserInfo().uid) || null;
}

async function fsCtx() {
  const { db } = await loadFirebase();
  const fs = await import(BASE + 'firebase-firestore.js');
  const uid = currentUid();
  if (!uid) throw new Error('push: لا يوجد حساب مزامنة مسجّل الدخول');
  const ref = fs.doc(db, 'users_v3', uid, 'push', 'main');
  return { fs, db, ref, uid };
}

/* ---------- التفعيل / الإيقاف ---------- */

/**
 * تفعيل الإشعارات الحقيقية على هذا الجهاز.
 * @param {string} vapidKey — المفتاح العام من Firebase Console → Cloud Messaging → Web Push certificates
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function enablePush(vapidKey) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const key = String(vapidKey || '').trim();
  if (!key) return { ok: false, reason: 'no-vapid' };
  if (!currentUid()) return { ok: false, reason: 'signed-out' };

  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'permission-' + perm };

  try {
    const { app } = await loadFirebase();
    const msgMod = await import(BASE + 'firebase-messaging.js');
    if (typeof msgMod.isSupported === 'function' && !(await msgMod.isSupported())) {
      return { ok: false, reason: 'unsupported' };
    }
    const reg = await navigator.serviceWorker.ready;
    const messaging = msgMod.getMessaging(app);
    const token = await msgMod.getToken(messaging, { vapidKey: key, serviceWorkerRegistration: reg });
    if (!token) return { ok: false, reason: 'no-token' };

    const { fs, ref } = await fsCtx();
    const hash = await tokenHash(token);
    await fs.setDoc(ref, {
      tokens: { [hash]: { t: token, ua: String(navigator.userAgent || '').slice(0, 120), at: Date.now() } },
    }, { merge: true });
    try { localStorage.setItem(K_HASH, hash); } catch (e) { /* ignore */ }
    await syncDigest({ force: true });
    return { ok: true };
  } catch (e) {
    console.warn('[push] enable failed:', e);
    return { ok: false, reason: 'error', message: e && e.message ? String(e.message) : '' };
  }
}

/** إيقاف الإشعارات على هذا الجهاز (يحذف رمزه من السحابة ويُبطله). */
export async function disablePush() {
  let hash = null;
  try { hash = localStorage.getItem(K_HASH); } catch (e) { /* ignore */ }
  try {
    if (hash && currentUid()) {
      const { fs, ref } = await fsCtx();
      await fs.updateDoc(ref, { ['tokens.' + hash]: fs.deleteField() }).catch(() => {});
    }
    const { app } = await loadFirebase();
    const msgMod = await import(BASE + 'firebase-messaging.js');
    await msgMod.deleteToken(msgMod.getMessaging(app)).catch(() => {});
  } catch (e) { console.warn('[push] disable:', e); }
  try { localStorage.removeItem(K_HASH); localStorage.removeItem(K_LAST); } catch (e) { /* ignore */ }
  return { ok: true };
}

/** طلب إشعار تجريبي من الخادمة (يصل لكل أجهزة الحساب). */
export async function requestServerTest() {
  try {
    const { fs, db, uid } = await fsCtx();
    await fs.setDoc(fs.doc(db, 'users_v3', uid, 'push', 'testRequest'), { at: Date.now(), nonce: Math.random().toString(36).slice(2) });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e && e.message ? String(e.message) : '' };
  }
}

/* ---------- الملخص ---------- */

async function collect() {
  const [st, ords, custs, low, cms] = await Promise.all([
    settingsRepo.get().catch(() => ({})),
    ordersRepo.list().catch(() => []),
    customersRepo.list().catch(() => []),
    inventoryRepo.getLowStock().catch(() => []),
    commitmentsRepo.listActive().catch(() => []),
  ]);
  let lowN = 0; let outN = 0;
  try {
    const split = splitOutOfStock(filterLowStockForAlerts(low, st), st);
    lowN = split.low.length; outN = split.out.length;
  } catch (e) { lowN = Array.isArray(low) ? low.length : 0; }
  return { settings: st, orders: ords, customers: custs, lowStock: lowN, outOfStock: outN, commitments: cms };
}

/**
 * رفع الملخص والخيارات إلى السحابة (فقط إن تغيّر أو force).
 * يعمل فقط إن كان هذا الجهاز مفعّلاً (له رمز) والإشعارات مفعّلة في الإعدادات.
 */
export function syncDigest({ force = false } = {}) {
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      if (!isPushSupported() || !currentUid()) return { ok: false, reason: 'unavailable' };
      let hash = null;
      try { hash = localStorage.getItem(K_HASH); } catch (e) { /* ignore */ }
      if (!hash) return { ok: false, reason: 'not-registered' };

      const src = await collect();
      const opts = pushOptions(src.settings);
      let tz = 'Africa/Cairo';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* ignore */ }
      const digest = buildDigest(src);
      const prefs = serverPrefs(src.settings, tz);

      let last = null;
      try { last = JSON.parse(localStorage.getItem(K_LAST) || 'null'); } catch (e) { last = null; }
      if (!force && last && sameDigest(last.digest, digest) && JSON.stringify(last.prefs) === JSON.stringify(prefs)) {
        return { ok: true, skipped: true };
      }
      if (!opts.enabled && !force) return { ok: true, skipped: true };

      const { fs, ref } = await fsCtx();
      await fs.setDoc(ref, { digest, prefs }, { merge: true });
      try { localStorage.setItem(K_LAST, JSON.stringify({ digest, prefs })); } catch (e) { /* ignore */ }
      return { ok: true };
    } catch (e) {
      console.warn('[push] digest sync failed:', e);
      return { ok: false, reason: 'error' };
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

function schedule() {
  clearTimeout(_timer);
  _timer = setTimeout(() => { syncDigest().catch(() => {}); }, DEBOUNCE_MS);
}

/**
 * تشغيل التحديث التلقائي للملخص: بعد أي تعديل (تأخير 15ث)، وعند العودة للتطبيق.
 * آمن للاستدعاء أكثر من مرة.
 */
export function start() {
  if (_started) return;
  _started = true;
  onAuthChange((user) => {
    _uid = user ? user.uid : null;
    if (_uid) schedule();
  });
  onWrite((names) => {
    try {
      if (!currentUid()) return;
      if ((names || []).some((n) => WATCHED.has(n))) schedule();
    } catch (e) { /* ignore */ }
  });
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentUid()) schedule();
    });
  } catch (e) { /* ignore */ }
}

export const _internal = { K_HASH, K_LAST, WATCHED, DEBOUNCE_MS };
