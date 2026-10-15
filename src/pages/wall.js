/* ==========================================================================
   wall.js — «شاشة الورشة»: عرض كبير لطلبات اليوم (v3.3.43 → v3.3.64)
   ==========================================================================
   مناسبة لجهاز لوحي معلّق: خط كبير، ساعة، تحديث تلقائي كل دقيقة، ملء الشاشة،
   ومنع انطفاء الشاشة (Wake Lock) إن دعمه المتصفح. للعرض فقط — لا تعديل هنا.
   المسار: #/wall   (الخروج: زر ✕ أو مفتاح Esc)

   v3.3.64:
   - شريط ملخص: قيد التنفيذ · لم يبدأ · سُلِّم اليوم · الموعد التالي.
   - تدوير تلقائي للصفحات: كل عمود فيه أكثر من 8 صفوف يتنقل بين صفحاته (بدل «+N أخرى» المخفية).
   - شدّة التأخير: 3 أيام فأكثر = حرج (أحمر نابض)، ووميض للصفوف الجديدة بعد كل تحديث.
   - مؤشر حداثة البيانات: «آخر تحديث» + تنبيه إن توقّف التحديث.
   - وضع الخصوصية (الاسم الأول فقط + إخفاء المبالغ) لأن الزبائن يرون الشاشة.
   - تكبير الخط (3 مستويات) · تعتيم ليلي · إزاحة طفيفة دورية ضد burn-in.
   - إعادة طلب Wake Lock عند عودة الصفحة للظهور (كان يُفقد ولا يُعاد).
   - عدد الصفوف في الصفحة يتكيّف مع ارتفاع الشاشة (بلا تمرير على الشاشات العريضة).
   - التفضيلات تُحفظ في localStorage.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { appointments } from '../data/repos/appointments.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { formatDate, formatTime, formatEGP } from '../core/utils.js';
import { buildWallModel, paginate, firstName } from '../services/wall-board.js';

const REFRESH_MS = 60000;
const ROTATE_MS = 8000;
const SHIFT_MS = 300000;          // إزاحة ضد burn-in كل 5 دقائق
const STALE_AFTER_MS = REFRESH_MS * 3;
const FRESH_MS = 20000;           // مدة وميض الصف الجديد
const MAX_ROWS = 8;
const MIN_ROWS = 3;
const SCALES = [1, 1.2, 1.4];
const SHIFTS = [[0, 0], [3, 2], [-3, -2], [2, -3]];
const PREF_KEY = 'jalabiya_v3_wall_prefs';

const st = {
  root: null, body: null, strip: null, stale: null, clockEl: null,
  timers: [], wake: null, onKey: null, onVis: null, workshop: '',
  model: null, pages: {}, seen: null, fresh: new Map(), lastOk: 0, shift: 0, pageSize: MAX_ROWS, onResize: null, resizeT: 0,
  prefs: { privacy: false, dim: false, scale: 0 },
  btns: {},
};

/* --- التفضيلات --- */
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    st.prefs = {
      privacy: !!raw.privacy,
      dim: !!raw.dim,
      scale: Math.min(SCALES.length - 1, Math.max(0, Math.floor(Number(raw.scale)) || 0)),
    };
  } catch { st.prefs = { privacy: false, dim: false, scale: 0 }; }
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(st.prefs)); } catch { /* ignore */ }
}
function applyPrefs() {
  if (!st.root) return;
  st.root.classList.toggle('wall--private', st.prefs.privacy);
  st.root.classList.toggle('wall--dim', st.prefs.dim);
  st.root.style.setProperty('--ws', String(SCALES[st.prefs.scale]));
  const b = st.btns;
  if (b.privacy) { b.privacy.setAttribute('aria-pressed', String(st.prefs.privacy)); b.privacy.textContent = st.prefs.privacy ? '🙈' : '👁'; }
  if (b.dim) b.dim.setAttribute('aria-pressed', String(st.prefs.dim));
  if (b.scale) b.scale.textContent = 'A' + (st.prefs.scale ? '+'.repeat(st.prefs.scale) : '');
}

const nm = (name) => (st.prefs.privacy ? firstName(name) : name);

/* --- الأعمدة --- */
function rowEl(key, r, mainText, subText, extraCls = '') {
  const fresh = (st.fresh.get(key) || 0) > Date.now();
  const cls = ['wall__row', r.severity ? 'wall__row--' + r.severity : '', fresh ? 'wall__row--new' : '', extraCls].filter(Boolean).join(' ');
  return el('div', { className: cls }, [
    el('div', { className: 'wall__row-main' }, mainText),
    el('div', { className: 'wall__row-sub' }, subText),
  ]);
}

function column(spec) {
  const pg = paginate(spec.rows, st.pages[spec.key] || 0, st.pageSize);
  st.pages[spec.key] = pg.page;
  const list = el('div', { className: 'wall__list' });
  if (!spec.rows.length) list.appendChild(el('div', { className: 'wall__empty' }, spec.empty));
  pg.rows.forEach((r) => list.appendChild(spec.render(r)));
  if (pg.pages > 1) {
    list.appendChild(el('div', { className: 'wall__pager', 'aria-live': 'off' },
      'صفحة ' + (pg.page + 1) + ' / ' + pg.pages + ' · ' + spec.rows.length + ' إجمالاً'));
  }
  return el('section', { className: 'wall__col wall__col--' + spec.cls }, [
    el('h2', { className: 'wall__col-title' }, [
      el('span', {}, spec.icon + ' ' + spec.title),
      el('span', { className: 'wall__badge' }, String(spec.rows.length)),
    ]),
    list,
  ]);
}

/** هل الأعمدة جنباً إلى جنب؟ (شاشة عريضة) — على الجوال العمودي تتراصّ ويكون التمرير طبيعياً. */
function sideBySide() {
  const c = st.body && st.body.children;
  return !!c && c.length > 1 && c[0].offsetTop === c[1].offsetTop;
}

/** يرسم بأكبر عدد صفوف يتّسع لارتفاع الشاشة (بحد أدنى MIN_ROWS). */
function drawBody() {
  if (!st.body || !st.model) return;
  st.pageSize = MAX_ROWS;
  paint();
  if (!sideBySide()) return;
  while (st.pageSize > MIN_ROWS && st.body.scrollHeight > st.body.clientHeight + 1) {
    st.pageSize -= 1;
    paint();
  }
}

function paint() {
  const m = st.model;
  if (!st.body || !m) return;
  clear(st.body);
  const sub = (r, extra) => [r.label, extra].filter(Boolean).join(' · ');
  const specs = [
    { key: 'late', title: 'متأخرة', icon: '🔴', cls: 'late', rows: m.late, empty: 'لا متأخرات 👏',
      render: (r) => rowEl('late:' + r.orderId, r, nm(r.name), sub(r, 'متأخر ' + r.daysLate + ' يوم')) },
    { key: 'today', title: 'تُسلَّم اليوم', icon: '📅', cls: 'today', rows: m.dueToday, empty: 'لا تسليمات اليوم',
      render: (r) => rowEl('today:' + r.orderId, r, nm(r.name), sub(r, r.status === 'in_progress' ? 'قيد التنفيذ' : 'لم يبدأ')) },
    { key: 'ready', title: 'جاهزة للاستلام', icon: '📦', cls: 'ready', rows: m.ready, empty: 'لا طلبات بانتظار العميل',
      render: (r) => rowEl('ready:' + r.orderId, r, nm(r.name),
        sub(r, (r.ageDays ? 'منذ ' + r.ageDays + ' يوم' : 'اليوم') + (!st.prefs.privacy && r.remaining > 0 ? ' · متبقٍّ ' + formatEGP(r.remaining) : ''))) },
    { key: 'appts', title: 'مواعيد اليوم', icon: '🗓️', cls: 'appts', rows: m.appointments, empty: 'لا مواعيد اليوم',
      render: (a) => rowEl('appts:' + a.id, a, (a.done ? '✔ ' : '🕐 ') + formatTime(a.time) + ' — ' + a.title, nm(a.name), a.done ? 'wall__row--done' : '') },
  ];
  specs.forEach((s) => st.body.appendChild(column(s)));
}

function chip(icon, label, value, cls = '') {
  return el('div', { className: 'wall__chip' + (cls ? ' ' + cls : '') }, [
    el('span', { className: 'wall__chip-label' }, icon + ' ' + label),
    el('span', { className: 'wall__chip-value' }, String(value)),
  ]);
}

function drawStrip() {
  const m = st.model;
  if (!st.strip || !m) return;
  clear(st.strip);
  const c = m.counts;
  st.strip.appendChild(chip('🧵', 'قيد التنفيذ', c.inProgress));
  st.strip.appendChild(chip('⏳', 'لم يبدأ', c.pending));
  st.strip.appendChild(chip('✅', 'سُلِّم اليوم', c.deliveredToday, 'wall__chip--ok'));
  const na = m.nextAppointment;
  st.strip.appendChild(chip('🗓️', 'الموعد التالي', na ? formatTime(na.time) + ' — ' + na.title : '—', 'wall__chip--wide'));
}

/* --- التحديث --- */
function trackFresh(model) {
  const keys = [];
  model.late.forEach((r) => keys.push('late:' + r.orderId));
  model.dueToday.forEach((r) => keys.push('today:' + r.orderId));
  model.ready.forEach((r) => keys.push('ready:' + r.orderId));
  model.appointments.forEach((a) => keys.push('appts:' + a.id));
  const now = Date.now();
  const added = new Set();
  if (st.seen) keys.forEach((k) => { if (!st.seen.has(k)) { st.fresh.set(k, now + FRESH_MS); added.add(k); } });
  st.seen = new Set(keys);
  st.fresh.forEach((until, k) => { if (until <= now) st.fresh.delete(k); });

  /* صف جديد في عمود معروض على صفحة أخرى: ننقل العمود لصفحته حتى يُرى فوراً */
  const cols = { late: model.late, today: model.dueToday, ready: model.ready, appts: model.appointments };
  Object.keys(cols).forEach((k) => {
    const i = cols[k].findIndex((r) => added.has(k + ':' + (r.orderId || r.id)));
    if (i >= 0) st.pages[k] = Math.floor(i / st.pageSize);
  });
}

async function refresh() {
  if (!st.root) return;
  try {
    const [o, c, a, p] = await Promise.all([orders.list(), customers.list(), appointments.list(), payments.list()]);
    if (!st.root) return;
    const model = buildWallModel({ orders: o, customers: c, appointments: a, payments: p });
    trackFresh(model);
    st.model = model;
    st.lastOk = Date.now();
    drawStrip();
    drawBody();
    tickClock();
  } catch (e) {
    console.error('[wall] refresh failed:', e);
    tickClock();
  }
}

/* تدوير صفحات الأعمدة الطويلة */
function rotate() {
  if (!st.model) return;
  const lens = { late: st.model.late.length, today: st.model.dueToday.length, ready: st.model.ready.length, appts: st.model.appointments.length };
  let any = false;
  Object.keys(lens).forEach((k) => {
    if (lens[k] > st.pageSize) { st.pages[k] = (st.pages[k] || 0) + 1; any = true; }
  });
  if (any) drawBody();
}

/* --- الساعة + حداثة البيانات --- */
function tickClock() {
  if (!st.clockEl) return;
  const now = Date.now();
  st.clockEl.textContent = formatTime(now);
  const d = st.clockEl.parentNode && st.clockEl.parentNode.querySelector('.wall__date');
  if (d) d.textContent = formatDate(now);
  if (st.stale) {
    const age = now - st.lastOk;
    if (st.lastOk && age > STALE_AFTER_MS) {
      st.stale.hidden = false;
      st.stale.textContent = '⚠️ البيانات قديمة — آخر تحديث ناجح قبل ' + Math.max(1, Math.round(age / 60000)) + ' دقيقة';
    } else {
      st.stale.hidden = true;
    }
  }
  const upd = st.root && st.root.querySelector('.wall__updated');
  if (upd) upd.textContent = st.lastOk ? 'آخر تحديث ' + formatTime(st.lastOk) : '';
}

/* --- إزاحة ضد burn-in --- */
function shiftBody() {
  if (!st.body) return;
  st.shift = (st.shift + 1) % SHIFTS.length;
  const [x, y] = SHIFTS[st.shift];
  st.body.style.transform = x || y ? 'translate(' + x + 'px,' + y + 'px)' : '';
}

/* --- النظام --- */
async function requestWake() {
  try {
    if (navigator.wakeLock && !st.wake) {
      st.wake = await navigator.wakeLock.request('screen');
      if (st.wake && st.wake.addEventListener) st.wake.addEventListener('release', () => { st.wake = null; });
    }
  } catch { /* غير مدعوم */ }
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

function toolBtn(action, title, text, onClick) {
  return el('button', { className: 'wall__btn', type: 'button', 'data-action': action, title, 'aria-label': title, onClick }, text);
}

export const wallPage = {
  async render(container) {
    this.destroy();
    loadPrefs();
    let name = '';
    try { name = ((await settings.get()).workshop || {}).name || ''; } catch { /* ignore */ }
    st.workshop = name;

    const clockEl = el('div', { className: 'wall__clock' }, '');
    st.btns = {
      privacy: toolBtn('wall-privacy', 'وضع الخصوصية (الاسم الأول فقط + إخفاء المبالغ)', '👁', () => { st.prefs.privacy = !st.prefs.privacy; savePrefs(); applyPrefs(); drawBody(); }),
      dim: toolBtn('wall-dim', 'تعتيم الشاشة', '🌙', () => { st.prefs.dim = !st.prefs.dim; savePrefs(); applyPrefs(); }),
      scale: toolBtn('wall-scale', 'حجم الخط', 'A', () => { st.prefs.scale = (st.prefs.scale + 1) % SCALES.length; savePrefs(); applyPrefs(); drawBody(); }),
    };
    const head = el('header', { className: 'wall__head' }, [
      el('div', { className: 'wall__title' }, '🧵 ' + (name || 'ورشة تفصيل الجلابيب')),
      el('div', { className: 'wall__time' }, [clockEl, el('div', { className: 'wall__date' }, ''), el('div', { className: 'wall__updated' }, '')]),
      el('div', { className: 'wall__tools' }, [
        st.btns.privacy, st.btns.dim, st.btns.scale,
        toolBtn('wall-fullscreen', 'ملء الشاشة', '⛶', toggleFullscreen),
        toolBtn('wall-exit', 'خروج (Esc)', '✕', exit),
      ]),
    ]);
    const strip = el('div', { className: 'wall__strip', 'aria-label': 'ملخص اليوم' });
    const stale = el('div', { className: 'wall__stale', role: 'alert', hidden: true });
    const body = el('main', { className: 'wall__body' });
    const root = el('div', { className: 'wall', role: 'region', 'aria-label': 'شاشة الورشة' }, [head, strip, stale, body]);
    document.body.appendChild(root);
    document.body.classList.add('wall-open');
    Object.assign(st, { root, body, strip, stale, clockEl, pages: {}, seen: null, fresh: new Map(), lastOk: 0, shift: 0, model: null });
    applyPrefs();
    container.appendChild(el('div', { className: 'empty-state' }, [el('p', { className: 'empty-state__text' }, 'شاشة الورشة مفتوحة…')]));

    st.onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) exit(); };
    document.addEventListener('keydown', st.onKey);
    /* Wake Lock يُحرَّر تلقائياً عند إخفاء الصفحة: نعيد طلبه ونحدّث البيانات عند العودة */
    st.onVis = () => { if (document.visibilityState === 'visible') { requestWake(); refresh(); } };
    document.addEventListener('visibilitychange', st.onVis);
    st.onResize = () => { clearTimeout(st.resizeT); st.resizeT = setTimeout(drawBody, 200); };
    window.addEventListener('resize', st.onResize);

    tickClock();
    st.timers.push(setInterval(tickClock, 15000));
    st.timers.push(setInterval(refresh, REFRESH_MS));
    st.timers.push(setInterval(rotate, ROTATE_MS));
    st.timers.push(setInterval(shiftBody, SHIFT_MS));
    requestWake();
    await refresh();
  },

  destroy() {
    st.timers.forEach((t) => clearInterval(t));
    st.timers = [];
    if (st.onKey) document.removeEventListener('keydown', st.onKey);
    if (st.onVis) document.removeEventListener('visibilitychange', st.onVis);
    if (st.onResize) window.removeEventListener('resize', st.onResize);
    clearTimeout(st.resizeT);
    st.onKey = st.onVis = st.onResize = null;
    try { if (st.wake) st.wake.release(); } catch { /* ignore */ }
    st.wake = null;
    if (st.root) st.root.remove();
    document.body.classList.remove('wall-open');
    st.root = st.body = st.strip = st.stale = st.clockEl = null;
    st.btns = {};
    st.model = null;
  },
};

/* --- للاختبار --- */
export const _internal = {
  PREF_KEY, MAX_ROWS, MIN_ROWS, STALE_AFTER_MS, rotate, refresh, tickClock, getPageSize: () => st.pageSize,
  setLastOk(ts) { st.lastOk = ts; },
};
