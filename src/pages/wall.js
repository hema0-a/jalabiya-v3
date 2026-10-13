/* ==========================================================================
   wall.js — «شاشة الورشة»: عرض كبير لطلبات اليوم (v3.3.43)
   ==========================================================================
   مناسبة لجهاز لوحي معلّق: خط كبير، ساعة، تحديث تلقائي كل دقيقة، ملء الشاشة،
   ومنع انطفاء الشاشة (Wake Lock) إن دعمه المتصفح. للعرض فقط — لا تعديل هنا.
   المسار: #/wall   (الخروج: زر ✕ أو مفتاح Esc)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { appointments } from '../data/repos/appointments.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { formatDate, formatTime, formatEGP } from '../core/utils.js';
import { buildWallModel } from '../services/wall-board.js';

const REFRESH_MS = 60000;
const MAX_ROWS = 8;

let st = { root: null, body: null, clockEl: null, timers: [], wake: null, onKey: null, workshop: '' };

function column(title, icon, cls, rows, renderRow, emptyText) {
  const list = el('div', { className: 'wall__list' });
  if (!rows.length) list.appendChild(el('div', { className: 'wall__empty' }, emptyText));
  rows.slice(0, MAX_ROWS).forEach((r) => list.appendChild(renderRow(r)));
  if (rows.length > MAX_ROWS) list.appendChild(el('div', { className: 'wall__more' }, '+' + (rows.length - MAX_ROWS) + ' أخرى'));
  return el('section', { className: 'wall__col wall__col--' + cls }, [
    el('h2', { className: 'wall__col-title' }, [
      el('span', {}, icon + ' ' + title),
      el('span', { className: 'wall__badge' }, String(rows.length)),
    ]),
    list,
  ]);
}

const orderRow = (sub) => (r) => el('div', { className: 'wall__row' }, [
  el('div', { className: 'wall__row-main' }, r.name),
  el('div', { className: 'wall__row-sub' }, [r.label, sub(r)].filter(Boolean).join(' · ')),
]);

function drawBody(model) {
  clear(st.body);
  st.body.appendChild(column('متأخرة', '🔴', 'late', model.late,
    orderRow((r) => 'متأخر ' + r.daysLate + ' يوم'), 'لا متأخرات 👏'));
  st.body.appendChild(column('تُسلَّم اليوم', '📅', 'today', model.dueToday,
    orderRow((r) => (r.status === 'in_progress' ? 'قيد التنفيذ' : 'لم يبدأ')), 'لا تسليمات اليوم'));
  st.body.appendChild(column('جاهزة للاستلام', '📦', 'ready', model.ready,
    orderRow((r) => (r.ageDays ? 'منذ ' + r.ageDays + ' يوم' : 'اليوم') + (r.remaining > 0 ? ' · متبقٍّ ' + formatEGP(r.remaining) : '')), 'لا طلبات بانتظار العميل'));
  st.body.appendChild(column('مواعيد اليوم', '🗓️', 'appts', model.appointments, (a) => el('div', { className: 'wall__row' + (a.done ? ' wall__row--done' : '') }, [
    el('div', { className: 'wall__row-main' }, (a.done ? '✔ ' : '🕐 ') + formatTime(a.time) + ' — ' + a.title),
    el('div', { className: 'wall__row-sub' }, a.name),
  ]), 'لا مواعيد اليوم'));
}

async function refresh() {
  if (!st.root) return;
  try {
    const [o, c, a, p] = await Promise.all([orders.list(), customers.list(), appointments.list(), payments.list()]);
    if (!st.root) return;
    drawBody(buildWallModel({ orders: o, customers: c, appointments: a, payments: p }));
  } catch (e) {
    console.error('[wall] refresh failed:', e);
  }
}

function tickClock() {
  if (!st.clockEl) return;
  const now = Date.now();
  st.clockEl.textContent = formatTime(now);
  const d = st.clockEl.parentNode && st.clockEl.parentNode.querySelector('.wall__date');
  if (d) d.textContent = formatDate(now);
}

async function requestWake() {
  try { if (navigator.wakeLock) st.wake = await navigator.wakeLock.request('screen'); } catch { /* غير مدعوم */ }
}

function exit() {
  if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch { /* ignore */ } }
  location.hash = '#/dashboard';
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (st.root && st.root.requestFullscreen) st.root.requestFullscreen();
  } catch { /* ignore */ }
}

export const wallPage = {
  async render(container) {
    this.destroy();
    let name = '';
    try { name = ((await settings.get()).workshop || {}).name || ''; } catch { /* ignore */ }
    st.workshop = name;

    const clockEl = el('div', { className: 'wall__clock' }, '');
    const head = el('header', { className: 'wall__head' }, [
      el('div', { className: 'wall__title' }, '🧵 ' + (name || 'ورشة تفصيل الجلابيب')),
      el('div', { className: 'wall__time' }, [clockEl, el('div', { className: 'wall__date' }, '')]),
      el('div', { className: 'wall__tools' }, [
        el('button', { className: 'wall__btn', type: 'button', 'data-action': 'wall-fullscreen', title: 'ملء الشاشة', onClick: toggleFullscreen }, '⛶'),
        el('button', { className: 'wall__btn', type: 'button', 'data-action': 'wall-exit', title: 'خروج (Esc)', onClick: exit }, '✕'),
      ]),
    ]);
    const body = el('main', { className: 'wall__body' });
    const root = el('div', { className: 'wall', role: 'region', 'aria-label': 'شاشة الورشة' }, [head, body]);
    document.body.appendChild(root);
    document.body.classList.add('wall-open');
    Object.assign(st, { root, body, clockEl });
    container.appendChild(el('div', { className: 'empty-state' }, [el('p', { className: 'empty-state__text' }, 'شاشة الورشة مفتوحة…')]));

    st.onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) exit(); };
    document.addEventListener('keydown', st.onKey);
    tickClock();
    st.timers.push(setInterval(tickClock, 15000));
    st.timers.push(setInterval(refresh, REFRESH_MS));
    requestWake();
    await refresh();
  },

  destroy() {
    st.timers.forEach((t) => clearInterval(t));
    st.timers = [];
    if (st.onKey) document.removeEventListener('keydown', st.onKey);
    st.onKey = null;
    try { if (st.wake) st.wake.release(); } catch { /* ignore */ }
    st.wake = null;
    if (st.root) st.root.remove();
    document.body.classList.remove('wall-open');
    st.root = st.body = st.clockEl = null;
  },
};
