/* ==========================================================================
   notifications.js — إشعارات المتصفح
   ==========================================================================
   - يفحص: طلبات متأخرة، تسليم اليوم، تسليم غداً، جاهزة، نواقص مخزون.
   - يمنع التكرار: 1 إشعار لكل نوع في اليوم.
   - يعمل فقط إذا منح المستخدم الإذن.
   - Static imports فقط.
   ========================================================================== */

import { orders as ordersRepo } from '../data/repos/orders.js';
import { inventory as inventoryRepo } from '../data/repos/inventory.js';
import { DEFAULT_SETTINGS } from '../core/config.js';
import { isPastDue } from './order-timing.js';

/* --- مفتاح تتبّع الإشعارات المُرسلة (localStorage) --- */
const SENT_KEY = 'jalabiya_v3_notif_sent';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // كل 30 دقيقة

/* --- حالة داخلية --- */
let _checkTimer = null;

/* ==========================================================================
   1. الأذونات
   ========================================================================== */

/**
 * هل المتصفح يدعم الإشعارات؟
 * @returns {boolean}
 */
export function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * حالة الإذن الحالية.
 * @returns {'default'|'granted'|'denied'|'unsupported'}
 */
export function getPermission() {
  if (!isSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * طلب إذن الإشعارات (يجب أن يُستدعى من داخل تفاعل المستخدم).
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (e) {
    console.warn('[Notifications] requestPermission failed:', e);
    return 'default';
  }
}

/* ==========================================================================
   2. تتبّع الإشعارات المُرسلة
   ========================================================================== */

/**
 * قراءة سجل الإشعارات المُرسلة (اليوم فقط).
 * @returns {Object}
 */
function readSent() {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const today = _todayKey();
    /* إن كان السجل من يوم سابق → ابدأ جديداً */
    if (!parsed || parsed.day !== today) return { day: today };
    return parsed;
  } catch {
    return { day: _todayKey() };
  }
}

/**
 * كتابة سجل الإشعارات.
 * @param {Object} data
 */
function writeSent(data) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

/**
 * مفتاح اليوم (YYYY-MM-DD).
 * @returns {string}
 */
function _todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * هل أُرسل إشعار من هذا النوع اليوم؟
 * @param {string} type
 * @returns {boolean}
 */
function wasSentToday(type) {
  const data = readSent();
  return !!data[type];
}

/**
 * تسجيل أن إشعاراً أُرسل.
 * @param {string} type
 */
function markSent(type) {
  const data = readSent();
  data[type] = Date.now();
  writeSent(data);
}

/* ==========================================================================
   3. عرض الإشعار
   ========================================================================== */

/**
 * عرض إشعار نظام.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.tag]
 * @param {string} [options.icon]
 * @param {string} [options.pageHash] — عند النقر ينتقل للصفحة
 * @returns {boolean} — true إن أُرسل بنجاح
 */
function notify(options) {
  if (!isSupported() || Notification.permission !== 'granted') return false;

  try {
    const n = new Notification(options.title, {
      body: options.body || '',
      tag: options.tag || ('notif_' + Date.now()),
      icon: options.icon || 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
    });

    /* عند النقر → الانتقال للصفحة */
    n.onclick = () => {
      try {
        window.focus();
        if (options.pageHash) location.hash = options.pageHash;
      } catch (e) { /* ignore */ }
      n.close();
    };

    /* إغلاق تلقائي بعد 20 ثانية */
    setTimeout(() => { try { n.close(); } catch (e) {} }, 20000);

    return true;
  } catch (e) {
    console.warn('[Notifications] notify failed:', e);
    return false;
  }
}

/* ==========================================================================
   4. الفحص الرئيسي
   ========================================================================== */

/**
 * فحص الطلبات والمخزون وإظهار الإشعارات المُناسبة.
 * @returns {Promise<{sent:number, skipped:number}>}
 */
export async function checkAndNotify() {
  if (!isSupported() || Notification.permission !== 'granted') {
    return { sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;

  /* --- 1. الطلبات المتأخرة --- */
  try {
    const all = await ordersRepo.list();
    const now = Date.now();
    const overdue = all.filter((o) =>
      isPastDue(o.dueDate, now) &&
      o.status !== 'delivered' && o.status !== 'cancelled'
    );

    if (overdue.length > 0 && !wasSentToday('overdue')) {
      const ok = notify({
        title: '🚨 طلبات متأخرة',
        body: overdue.length + ' طلب متأخر يحتاج متابعة',
        tag: 'overdue',
        pageHash: '#/orders',
      });
      if (ok) { markSent('overdue'); sent++; } else skipped++;
    } else if (overdue.length > 0) skipped++;

    /* --- 2. تسليم اليوم --- */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const todayEnd = todayMs + 86400000;

    const dueToday = all.filter((o) =>
      o.dueDate && o.dueDate >= todayMs && o.dueDate < todayEnd &&
      o.status !== 'delivered' && o.status !== 'cancelled'
    );

    if (dueToday.length > 0 && !wasSentToday('due-today')) {
      const ok = notify({
        title: '⏰ تسليم اليوم',
        body: dueToday.length + ' طلب يجب تسليمه اليوم',
        tag: 'due-today',
        pageHash: '#/orders',
      });
      if (ok) { markSent('due-today'); sent++; } else skipped++;
    } else if (dueToday.length > 0) skipped++;

    /* --- 3. جاهزة للتسليم (منتظرة) --- */
    const ready = all.filter((o) => o.status === 'ready');
    if (ready.length > 0 && !wasSentToday('ready')) {
      const ok = notify({
        title: '✅ طلبات جاهزة',
        body: ready.length + ' طلب جاهز في انتظار العميل',
        tag: 'ready',
        pageHash: '#/orders',
      });
      if (ok) { markSent('ready'); sent++; } else skipped++;
    } else if (ready.length > 0) skipped++;
  } catch (err) {
    console.warn('[Notifications] orders check failed:', err);
  }

  /* --- 4. نواقص المخزون --- */
  try {
    const low = await inventoryRepo.getLowStock();
    if (low.length > 0 && !wasSentToday('low-stock')) {
      const ok = notify({
        title: '📦 نقص مخزون',
        body: low.length + ' صنف وصل للحد الأدنى',
        tag: 'low-stock',
        pageHash: '#/inventory',
      });
      if (ok) { markSent('low-stock'); sent++; } else skipped++;
    } else if (low.length > 0) skipped++;
  } catch (err) {
    console.warn('[Notifications] inventory check failed:', err);
  }

  return { sent, skipped };
}

/* ==========================================================================
   5. التشغيل التلقائي (فحص دوري)
   ========================================================================== */

/**
 * بدء فحص دوري كل 30 دقيقة.
 * - يفحص فوراً بعد 30 ثانية من التشغيل.
 * - ثم كل 30 دقيقة.
 */
export function startAutoCheck() {
  if (!isSupported() || Notification.permission !== 'granted') return;
  if (_checkTimer) return;

  /* فحص أولي بعد 30 ثانية */
  setTimeout(() => {
    checkAndNotify().catch(() => {});
  }, 30000);

  /* ثم كل 30 دقيقة */
  _checkTimer = setInterval(() => {
    checkAndNotify().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

/**
 * إيقاف الفحص الدوري.
 */
export function stopAutoCheck() {
  if (_checkTimer) {
    clearInterval(_checkTimer);
    _checkTimer = null;
  }
}

/* ==========================================================================
   6. اختبار سريع
   ========================================================================== */

/**
 * إرسال إشعار تجريبي.
 * @returns {Promise<boolean>}
 */
export async function sendTestNotification() {
  if (!isSupported()) return false;

  if (Notification.permission !== 'granted') {
    const perm = await requestPermission();
    if (perm !== 'granted') return false;
  }

  return notify({
    title: '🔔 اختبار الإشعارات',
    body: 'الإشعارات تعمل بنجاح!',
    tag: 'test',
    pageHash: '#/dashboard',
  });
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { SENT_KEY, _todayKey, readSent, wasSentToday, markSent };
