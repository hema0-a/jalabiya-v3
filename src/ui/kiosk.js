/* ==========================================================================
   kiosk.js — وضع الكشك: شاشة عرض للزبائن (v3.10.1)
   ==========================================================================
   - تغطي الشاشة كلها: اسم الورشة، رسالة ترحيب، أرقام عامة، معرض صور متحرك، التواصل.
   - لا مبالغ ولا أسماء عملاء. التطبيق خلفها معطَّل (inert) ولا يُغلق بالرجوع/Esc.
   - الخروج: زر صغير أو 3 نقرات على الشعار ثم رقم المالك (5 أخطاء ⟵ انتظار 30 ث).
   - تبقى مفعّلة بعد إعادة التشغيل (يُعيدها main.js بعد فتح القفل).
   ⚠️ قفل واجهة وليس تشفير بيانات.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { STORAGE_KEYS as K } from '../core/config.js';
import { verifyPin, isPinSet } from '../security/pin-crypto.js';
import { settings } from '../data/repos/settings.js';
import { orders } from '../data/repos/orders.js';
import { portfolio } from '../data/repos/portfolio.js';
import { toLatinDigits } from '../core/utils.js';
import {
  normalizeKiosk, canEnterKiosk, kioskStats, pickSlides, nextSlide, SLIDE_SECONDS,
  exitAttemptState, failureLockUntil, registerTap,
} from '../services/kiosk.js';

const ID = 'kiosk-screen';
let slideTimer = null;
let refreshTimer = null;
let keyHandler = null;
let popHandler = null;
let fails = 0;
let lockedUntil = 0;
let taps = [];

const flag = (v) => { try { if (v) localStorage.setItem(K.V3_KIOSK, '1'); else localStorage.removeItem(K.V3_KIOSK); } catch (e) { /* اختياري */ } };
export const isKioskActive = () => { try { return localStorage.getItem(K.V3_KIOSK) === '1'; } catch (e) { return false; } };

const glass = { background: 'rgba(255,255,255,.14)', borderRadius: '14px', padding: '16px', textAlign: 'center' };

async function loadData() {
  const s = await settings.get();
  const cfg = normalizeKiosk(s.kiosk);
  const ws = s.workshop || {};
  const [ords, items] = await Promise.all([
    cfg.showStats ? orders.list().catch(() => []) : [],
    cfg.showPortfolio ? portfolio.list().catch(() => []) : [],
  ]);
  return { cfg, ws, stats: cfg.showStats ? kioskStats(ords) : null, slides: cfg.showPortfolio ? pickSlides(items) : [] };
}

function stopSlides() { if (slideTimer) clearInterval(slideTimer); slideTimer = null; }
function stopTimers() { stopSlides(); if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }

async function fill(root) {
  const d = await loadData();
  clear(root); stopSlides();
  const logo = d.ws.logo && String(d.ws.logo).startsWith('data:image/')
    ? el('img', { src: d.ws.logo, alt: '', style: { width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,.35)' } })
    : el('div', { style: { fontSize: '64px' } }, '🧵');
  const logoBox = el('div', { 'data-role': 'kiosk-logo', style: { cursor: 'default', display: 'inline-block' }, onClick: () => {
    const r = registerTap(taps); taps = r.taps; if (r.triggered) { taps = []; openExit(); }
  } }, [logo]);
  root.appendChild(el('div', { style: { textAlign: 'center', padding: '28px 16px 8px' } }, [
    logoBox,
    el('h1', { style: { fontSize: '30px', margin: '12px 0 4px', color: '#fff' } }, d.ws.name || 'ورشة تفصيل الجلابيب'),
    d.cfg.message ? el('p', { style: { fontSize: '17px', color: 'rgba(255,255,255,.9)', margin: '6px 0' } }, d.cfg.message) : null,
  ]));
  if (d.stats) {
    root.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxWidth: '620px', margin: '16px auto', padding: '0 16px' } }, [
      el('div', { style: glass }, [el('div', { style: { fontSize: '32px', fontWeight: '800' } }, String(d.stats.active)), el('div', { style: { fontSize: '13px', opacity: '.85' } }, 'طلب قيد التنفيذ')]),
      el('div', { style: glass }, [el('div', { style: { fontSize: '32px', fontWeight: '800' } }, String(d.stats.deliveredToday)), el('div', { style: { fontSize: '13px', opacity: '.85' } }, 'سُلِّم اليوم')]),
    ]));
  }
  if (d.slides.length) {
    const img = el('img', { alt: '', 'data-role': 'kiosk-slide', src: d.slides[0].src, style: { maxWidth: '100%', maxHeight: '46vh', borderRadius: '14px', objectFit: 'contain' } });
    const cap = el('div', { style: { marginTop: '6px', fontSize: '14px', opacity: '.9', minHeight: '20px' } }, d.slides[0].title);
    root.appendChild(el('div', { style: { textAlign: 'center', margin: '16px auto', padding: '0 16px' } }, [img, cap]));
    let i = 0;
    stopSlides();
    if (d.slides.length > 1) slideTimer = (setInterval(() => { i = nextSlide(i, d.slides.length); img.src = d.slides[i].src; cap.textContent = d.slides[i].title; }, SLIDE_SECONDS * 1000));
  }
  if (d.cfg.showContact && (d.ws.phone || d.ws.address || d.ws.pickupHours)) {
    root.appendChild(el('div', { style: { textAlign: 'center', padding: '16px', lineHeight: '1.9' } }, [
      d.ws.phone ? el('div', { style: { fontSize: '22px', fontWeight: '700', direction: 'ltr' } }, '📞 ' + d.ws.phone) : null,
      d.ws.address ? el('div', { style: { fontSize: '15px', opacity: '.9' } }, '📍 ' + d.ws.address) : null,
      d.ws.pickupHours ? el('div', { style: { fontSize: '15px', opacity: '.9' } }, '🕒 ' + d.ws.pickupHours) : null,
    ]));
  }
  root.appendChild(el('div', { style: { textAlign: 'center', padding: '24px 16px 40px' } }, [
    el('button', { type: 'button', 'data-role': 'kiosk-exit', onClick: openExit, style: { background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.25)', borderRadius: '30px', padding: '10px 24px', fontSize: '12px' } }, '🚪 خروج'),
  ]));
}

function openExit() {
  const root = document.getElementById(ID);
  if (!root || root.querySelector('[data-role="kiosk-exit-box"]')) return;
  const input = el('input', { type: 'password', inputMode: 'numeric', maxLength: 4, autocomplete: 'off', placeholder: '••••', 'aria-label': 'رقم المالك', 'data-role': 'kiosk-pin', style: { width: '160px', textAlign: 'center', fontSize: '24px', letterSpacing: '8px', padding: '8px', borderRadius: '10px', border: 'none' } });
  const msg = el('div', { role: 'alert', style: { minHeight: '22px', color: '#FFD0D0', fontSize: '14px', marginTop: '8px' } });
  const box = el('div', { 'data-role': 'kiosk-exit-box', style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '2' } }, [
    el('div', { style: { background: '#222', color: '#fff', padding: '22px', borderRadius: '16px', textAlign: 'center', maxWidth: '300px' } }, [
      el('div', { style: { marginBottom: '10px', fontWeight: '700' } }, '🚪 رقم المالك للخروج'), input, msg,
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' } }, [
        el('button', { type: 'button', 'data-role': 'kiosk-cancel', onClick: () => box.remove(), style: { padding: '8px 16px', borderRadius: '10px' } }, 'إلغاء'),
        el('button', { type: 'button', 'data-role': 'kiosk-confirm', onClick: () => submit(), style: { padding: '8px 16px', borderRadius: '10px', fontWeight: '700' } }, 'خروج'),
      ]),
    ]),
  ]);
  const submit = async () => {
    const st = exitAttemptState(fails, lockedUntil);
    fails = st.fails;
    if (st.locked) { msg.textContent = 'انتظر ' + st.remainingSec + ' ثانية'; return; }
    const pin = toLatinDigits(input.value); input.value = '';
    const ok = isPinSet() && await verifyPin(pin, localStorage.getItem(K.V3_PIN_HASH), localStorage.getItem(K.V3_PIN_SALT));
    if (ok) { fails = 0; lockedUntil = 0; exitKiosk(); return; }
    fails += 1; lockedUntil = failureLockUntil(fails);
    msg.textContent = lockedUntil ? 'محاولات كثيرة — انتظر 30 ثانية' : 'الرقم غير صحيح';
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  root.appendChild(box);
  setTimeout(() => { try { input.focus(); } catch (e) { /* اختياري */ } }, 50);
}

function setAppInert(on) {
  const app = document.getElementById('app');
  if (!app) return;
  if (on) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); } else { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
}

function mount() {
  if (document.getElementById(ID)) return;
  const root = el('div', { id: ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'شاشة العرض', style: { position: 'fixed', inset: '0', zIndex: '100000', overflowY: 'auto', background: 'linear-gradient(135deg, var(--primary-dark, #14503f), var(--primary, #1F6D57))', color: '#fff' } });
  document.body.appendChild(root);
  setAppInert(true);
  keyHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener('keydown', keyHandler, true);
  try { history.pushState(null, '', location.href); } catch (e) { /* اختياري */ }
  popHandler = () => { try { history.pushState(null, '', location.href); } catch (e) { /* اختياري */ } };
  window.addEventListener('popstate', popHandler);
  fill(root).catch((e) => console.error('[Kiosk]', e));
  refreshTimer = setInterval(() => { if (!root.querySelector('[data-role="kiosk-exit-box"]')) fill(root).catch(() => {}); }, 60000);
}

/**
 * تشغيل الكشك (يتطلب رقم مالك).
 * @returns {{ok:boolean, error?:string}}
 */
export function enterKiosk() {
  if (!canEnterKiosk(isPinSet())) return { ok: false, error: 'عيّن رقم المالك أولاً (الإعدادات ← الأمان) حتى تستطيع الخروج من الكشك' };
  flag(true); taps = []; mount();
  return { ok: true };
}

export function exitKiosk() {
  flag(false); stopTimers();
  if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
  if (popHandler) window.removeEventListener('popstate', popHandler);
  keyHandler = null; popHandler = null;
  const root = document.getElementById(ID); if (root) root.remove();
  setAppInert(false);
}

/** يُستدعى عند الإقلاع بعد فتح القفل. */
export function restoreKiosk() {
  if (isKioskActive()) { if (isPinSet()) mount(); else flag(false); }
}
