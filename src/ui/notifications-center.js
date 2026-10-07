/* ==========================================================================
   notifications-center.js — مركز التنبيهات الموحّد
   ==========================================================================
   - يحسب التنبيهات من البيانات مباشرة (لا Backend).
   - 6 أنواع: طلبات متأخرة/قريبة، مواعيد اليوم، نقص مخزون،
             التزامات قريبة، مناسبات قريبة.
   - API: mount(), unmount(), getNotifications(), getBadgeCount().
   - static imports فقط (القاعدة 14).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { appointments } from '../data/repos/appointments.js';
import { inventory } from '../data/repos/inventory.js';
import { commitments } from '../data/repos/commitments.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP, formatDate, formatTime } from '../core/utils.js';

/* ==========================================================================
   1. الثوابت
   ========================================================================== */

const REFRESH_INTERVAL_MS = 60 * 1000; /* كل دقيقة */
const DAY_MS = 86400000;
const DUE_SOON_DAYS = 3;
const COMMITMENT_SOON_DAYS = 5;
const OCCASION_SOON_DAYS = 14;

/* ==========================================================================
   2. الحالة الداخلية
   ========================================================================== */

let refreshTimer = null;
let isMounted = false;
let badgeCallback = null;

/* ==========================================================================
   3. حساب التنبيهات
   ========================================================================== */

/**
 * حساب قائمة التنبيهات من البيانات الحالية.
 * @returns {Promise<Array<Object>>}
 */
export async function getNotifications() {
  const out = [];

  try {
    /* --- 1. الطلبات --- */
    const allOrders = await orders.list().catch(() => []);
    const now = Date.now();
    const soonMs = now + DUE_SOON_DAYS * DAY_MS;

    const overdue = allOrders.filter((o) =>
      o.dueDate && o.dueDate < now &&
      o.status !== 'delivered' && o.status !== 'cancelled'
    );
    const dueSoon = allOrders.filter((o) =>
      o.dueDate && o.dueDate >= now && o.dueDate <= soonMs &&
      o.status !== 'delivered' && o.status !== 'cancelled'
    );
    const ready = allOrders.filter((o) => o.status === 'ready');

    /* عملاء للربط */
    const custList = await customers.list().catch(() => []);
    const custMap = {};
    custList.forEach((c) => { custMap[c.id] = c; });

    if (overdue.length > 0) {
      out.push({
        type: 'danger',
        icon: '🚨',
        title: overdue.length + ' طلب متأخر',
        subtitle: overdue.slice(0, 2).map((o) => {
          const c = custMap[o.customerId];
          return (c ? c.name : 'عميل') + ' · ' + formatDate(o.dueDate);
        }).join(' — '),
        route: '#/orders',
        count: overdue.length,
      });
    }

    if (dueSoon.length > 0) {
      out.push({
        type: 'warning',
        icon: '⏰',
        title: dueSoon.length + ' طلب مستحق قريباً',
        subtitle: 'التسليم خلال ' + DUE_SOON_DAYS + ' أيام',
        route: '#/orders',
        count: dueSoon.length,
      });
    }

    if (ready.length > 0) {
      out.push({
        type: 'success',
        icon: '✅',
        title: ready.length + ' طلب جاهز للتسليم',
        subtitle: 'في انتظار العميل',
        route: '#/orders',
        count: ready.length,
      });
    }

    /* --- 2. مواعيد اليوم --- */
    const todayAppts = await appointments.getToday().catch(() => []);
    if (todayAppts.length > 0) {
      out.push({
        type: 'info',
        icon: '📅',
        title: todayAppts.length + ' موعد اليوم',
        subtitle: todayAppts.slice(0, 2).map((a) =>
          (a.title || 'موعد') + ' · ' + formatTime(a.date)
        ).join(' — '),
        route: '#/calendar',
        count: todayAppts.length,
      });
    }

    /* --- 3. نقص المخزون --- */
    const lowStock = await inventory.getLowStock().catch(() => []);
    if (lowStock.length > 0) {
      out.push({
        type: 'warning',
        icon: '📦',
        title: lowStock.length + ' صنف منخفض المخزون',
        subtitle: lowStock.slice(0, 2).map((i) =>
          (i.name || 'صنف') + ' (' + (i.quantity || 0) + ')'
        ).join(' — '),
        route: '#/inventory',
        count: lowStock.length,
      });
    }

    /* --- 4. الالتزامات القريبة --- */
    const activeCommitments = await commitments.listActive().catch(() => []);
    const today = new Date();
    const todayDay = today.getDate();
    const soonCommitments = activeCommitments.filter((c) => {
      if (!c.dueDay) return false;
      const diff = c.dueDay - todayDay;
      return diff >= 0 && diff <= COMMITMENT_SOON_DAYS;
    });

    if (soonCommitments.length > 0) {
      out.push({
        type: 'info',
        icon: '💳',
        title: soonCommitments.length + ' التزام قريب',
        subtitle: soonCommitments.slice(0, 2).map((c) =>
          (c.name || 'التزام') + ' · يوم ' + c.dueDay
        ).join(' — '),
        route: '#/commitments',
        count: soonCommitments.length,
      });
    }

    /* --- 5. المناسبات القريبة --- */
    const s = await settings.get().catch(() => ({}));
    const occasions = Array.isArray(s.occasions) ? s.occasions : [];
    const upcomingOccasions = occasions.filter((o) => {
      if (o.enabled === false) return false;
      const y = today.getFullYear();
      const m = Number(o.month) - 1;
      const d = Number(o.day);
      let target = new Date(y, m, d);
      const startOfToday = new Date(y, today.getMonth(), today.getDate());
      if (target < startOfToday) target = new Date(y + 1, m, d);
      const days = Math.round((target - startOfToday) / DAY_MS);
      return days >= 0 && days <= OCCASION_SOON_DAYS;
    });

    if (upcomingOccasions.length > 0) {
      out.push({
        type: 'info',
        icon: '🎉',
        title: upcomingOccasions.length + ' مناسبة قريبة',
        subtitle: upcomingOccasions.slice(0, 2).map((o) =>
          (o.icon || '🎉') + ' ' + (o.name || 'مناسبة')
        ).join(' — '),
        route: '#/occasions',
        count: upcomingOccasions.length,
      });
    }
  } catch (e) {
    console.warn('[NotificationsCenter] getNotifications failed:', e);
  }

  return out;
}

/**
 * حساب عدد التنبيهات الإجمالي (للـ badge).
 * @returns {Promise<number>}
 */
export async function getBadgeCount() {
  const list = await getNotifications();
  return list.reduce((sum, n) => sum + (Number(n.count) || 1), 0);
}

/* ==========================================================================
   4. عرض القائمة
   ========================================================================== */

const TYPE_COLORS = {
  danger:  { bg: '#FFEBEE', border: '#C62828', text: '#C62828' },
  warning: { bg: '#FFF3E0', border: '#F57C00', text: '#F57C00' },
  success: { bg: '#E8F5E9', border: '#2E7D32', text: '#2E7D32' },
  info:    { bg: '#E3F2FD', border: '#1565C0', text: '#1565C0' },
};

/**
 * عرض modal بقائمة التنبيهات.
 */
async function openCenter() {
  const list = await getNotifications();

  const body = el('div', {});

  if (list.length === 0) {
    body.appendChild(el('div', {
      style: {
        textAlign: 'center', padding: '32px 16px',
        color: 'var(--color-primary-light)',
      },
    }, [
      el('div', { style: { fontSize: '48px', marginBottom: '8px' } }, '✨'),
      el('div', { style: { fontSize: '15px', fontWeight: '500' } }, 'لا توجد تنبيهات حالياً'),
      el('div', { style: { fontSize: '12px', marginTop: '4px' } }, 'كل شيء تحت السيطرة!'),
    ]));
  } else {
    list.forEach((n) => {
      const c = TYPE_COLORS[n.type] || TYPE_COLORS.info;
      body.appendChild(el('button', {
        type: 'button',
        style: {
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          width: '100%', textAlign: 'right',
          padding: '12px', marginBottom: '8px',
          background: c.bg,
          borderRight: '4px solid ' + c.border,
          borderRadius: '10px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          border: 'none',
        },
        onClick: () => {
          try { modal.close(); } catch {}
          if (n.route) location.hash = n.route;
          setTimeout(() => toast.info('💡 ' + n.title), 200);
        },
      }, [
        el('span', { style: { fontSize: '22px', lineHeight: '1', flexShrink: '0' } }, n.icon),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', {
            style: { fontSize: '14px', fontWeight: '600', color: c.text, marginBottom: '2px' },
          }, n.title),
          n.subtitle ? el('div', {
            style: { fontSize: '12px', color: 'var(--color-text)', opacity: '0.75', lineHeight: '1.5' },
          }, n.subtitle) : null,
        ]),
        el('span', {
          style: {
            fontSize: '16px', color: c.text, transform: 'scaleX(-1)',
            flexShrink: '0', alignSelf: 'center',
          },
        }, '‹'),
      ]));
    });
  }

  modal.open({
    title: '🔔 التنبيهات',
    body,
    closable: true,
    variant: 'sheet',
  });
}

/* ==========================================================================
   5. API العام
   ========================================================================== */

/**
 * تثبيت مركز التنبيهات.
 * @param {Object} [options]
 * @param {Function} [options.onBadgeChange] — (count) => void
 * @returns {boolean} true إذا ثُبِّت الآن
 */
export function mount(options = {}) {
  if (isMounted) return false;
  if (typeof window === 'undefined') return false;

  isMounted = true;
  badgeCallback = typeof options.onBadgeChange === 'function' ? options.onBadgeChange : null;

  /* تحديث فوري */
  refreshBadge();

  /* تحديث دوري كل 60 ثانية */
  refreshTimer = setInterval(refreshBadge, REFRESH_INTERVAL_MS);

  /* تحديث عند تغيير الصفحة (بيانات جديدة) */
  window.addEventListener('hashchange', refreshBadge);

  console.log('[NotificationsCenter] ✅ مُثبَّت');
  return true;
}

/**
 * إزالة مركز التنبيهات.
 * @returns {void}
 */
export function unmount() {
  if (!isMounted) return;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  window.removeEventListener('hashchange', refreshBadge);
  isMounted = false;
  badgeCallback = null;
}

/**
 * هل المُثبَّت نشط؟
 * @returns {boolean}
 */
export function isMountedNow() {
  return isMounted;
}

/**
 * فتح مركز التنبيهات (من زر Topbar).
 */
export function open() {
  openCenter();
}

/**
 * تحديث العدّاد (داخلي — يُستدعى دوريًا).
 */
async function refreshBadge() {
  if (!badgeCallback) return;
  try {
    const count = await getBadgeCount();
    badgeCallback(count);
  } catch (e) {
    console.warn('[NotificationsCenter] refreshBadge failed:', e);
  }
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { REFRESH_INTERVAL_MS, TYPE_COLORS };
