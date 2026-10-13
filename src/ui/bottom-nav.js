/* ==========================================================================
   bottom-nav.js — شريط تنقّل سفلي لليد الواحدة على الجوال (v3.3.57)
   ==========================================================================
   خمسة أزرار في متناول الإبهام: الرئيسية · الطلبات · ＋ (إجراءات سريعة) · العملاء · المزيد.
   - للجوال فقط (< 768px) عبر CSS؛ يحلّ محل زر ⚡ العائم.
   - يُخفى أثناء الكتابة (لوحة المفاتيح) وفي #/tests و#/wall.
   - مفعّل افتراضياً، ويُوقَف من الإعدادات ← العرض (تفضيل لكل جهاز في localStorage).
   ========================================================================== */

import { el } from '../core/dom.js';
import { events } from '../core/events.js';
import { openQuickActions } from './fab.js';

export const STORAGE_KEY = 'jalabiya_v3_bottom_nav';
export const NAV_ITEMS = [
  { id: 'dashboard', icon: '🏠', label: 'الرئيسية', hash: '#/dashboard' },
  { id: 'orders',    icon: '📋', label: 'الطلبات',  hash: '#/orders' },
  { id: 'add',       icon: '＋',  label: 'جديد',     primary: true },
  { id: 'customers', icon: '👥', label: 'العملاء',  hash: '#/customers' },
  { id: 'more',      icon: '☰',  label: 'المزيد' },
];
const HIDDEN_PAGES = new Set(['tests', 'wall']);

let node = null;
let layoutRef = null;
let cleanup = null;
let getRoute = null;     /* قابلة للحقن في الاختبار (التنقّل الحقيقي يغادر صفحة الاختبارات) */
let navigate = null;

export function isBottomNavEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

function baseRoute() {
  if (getRoute) return getRoute();
  const h = String(location.hash || '').replace(/^#\/?/, '');
  return h.split('/')[0] || 'dashboard';
}

function sync() {
  if (!node) return;
  const base = baseRoute();
  const on = isBottomNavEnabled() && !HIDDEN_PAGES.has(base);
  node.hidden = !on;
  document.body.classList.toggle('has-bottom-nav', on);
  node.querySelectorAll('[data-nav]').forEach((b) => {
    const active = b.getAttribute('data-nav') === base;
    b.classList.toggle('bottom-nav__item--active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

/** تفعيل/إيقاف وحفظ التفضيل. */
export function setBottomNavEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  sync();
}

function onItem(item) {
  if (item.id === 'add') { openQuickActions(); return; }
  if (item.id === 'more') { if (layoutRef && layoutRef.toggleSidebar) layoutRef.toggleSidebar(); return; }
  if (navigate) { navigate(item.hash); return; }
  if (location.hash === item.hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = item.hash;
}

/** تثبيت الشريط (مرة واحدة). */
/**
 * @param {Object} layout
 * @param {{route?:()=>string, navigate?:(hash:string)=>void}} [hooks] للاختبار فقط
 */
export function mountBottomNav(layout, hooks = {}) {
  if (node || typeof document === 'undefined') return false;
  layoutRef = layout || null;
  getRoute = hooks.route || null;
  navigate = hooks.navigate || null;
  node = el('nav', { className: 'bottom-nav', 'aria-label': 'التنقّل السريع', hidden: true },
    NAV_ITEMS.map((it) => el('button', {
      type: 'button', 'data-nav': it.id,
      className: 'bottom-nav__item' + (it.primary ? ' bottom-nav__item--primary' : ''),
      'aria-label': it.label, onClick: () => onItem(it),
    }, [
      el('span', { className: 'bottom-nav__icon', 'aria-hidden': 'true' }, it.icon),
      el('span', { className: 'bottom-nav__label' }, it.label),
    ])));
  document.body.appendChild(node);

  /* أثناء الكتابة نُخفيه حتى لا يضيّق مساحة لوحة المفاتيح */
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
  const onIn = (e) => { if (typing(e) && node) node.classList.add('bottom-nav--typing'); };
  const onOut = () => { if (node) node.classList.remove('bottom-nav--typing'); };
  document.addEventListener('focusin', onIn);
  document.addEventListener('focusout', onOut);
  window.addEventListener('hashchange', sync);
  /* القائمة الجانبية مفتوحة ⟵ نُخفي الشريط حتى لا يغطي أسفلها */
  const offDrawer = events.on('layout:sidebar-toggled', (p) => { if (node) node.classList.toggle('bottom-nav--drawer', !!(p && p.open)); });
  cleanup = () => {
    if (typeof offDrawer === 'function') offDrawer();
    document.removeEventListener('focusin', onIn);
    document.removeEventListener('focusout', onOut);
    window.removeEventListener('hashchange', sync);
  };
  sync();
  return true;
}

export function unmountBottomNav() {
  if (!node) return;
  if (cleanup) cleanup();
  node.remove();
  document.body.classList.remove('has-bottom-nav');
  node = null; layoutRef = null; cleanup = null; getRoute = null; navigate = null;
}

export const _internal = { sync };
