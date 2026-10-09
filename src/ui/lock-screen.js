/* ==========================================================================
   lock-screen.js — شاشة القفل (PIN) + القفل التلقائي عند الخمول
   ==========================================================================
   كانت إعدادات PIN والقفل التلقائي ومدة الجلسة وتخصيص شاشة القفل تُحفظ
   لكن لا يوجد أي كود يُطبّقها: التطبيق يفتح دائماً دون طلب الرقم السري.

   القواعد:
   - لا PIN محفوظ → لا قفل إطلاقاً.
   - PIN محفوظ + جلسة صالحة (مدتها من الإعدادات) → يفتح مباشرة.
   - PIN محفوظ + لا جلسة → شاشة القفل قبل رسم أي بيانات.
   - القفل التلقائي (autoLock) → بعد lockAfterMinutes من الخمول يُقفل
     ويُحذف الجلسة، فيطلب الرقم عند الفتح التالي أيضاً.
   - المحاولات الفاشلة: 5 ثم قفل 30 ثانية (من auth.js).
   ========================================================================== */

import { el } from '../core/dom.js';
import { auth } from '../security/auth.js';
import { settings } from '../data/repos/settings.js';
import { DEFAULT_SETTINGS, LIMITS } from '../core/config.js';
import { STORE_NAMES } from '../data/schema.js';
import * as idb from '../data/idb.js';
import { toLatinDigits } from '../core/utils.js';

const PIN_LENGTH = 4;
const IDLE_CHECK_MS = 15 * 1000;
const ACTIVITY_THROTTLE_MS = 1000;

let _overlay = null;
let _lockedPromise = null;
let _idleTimer = null;
let _lastActivity = Date.now();
let _lastMark = 0;
let _installed = false;

/* ==========================================================================
   1. أدوات
   ========================================================================== */

async function readSettings() {
  try { return await settings.get(); }
  catch (e) { return DEFAULT_SETTINGS; }
}

/** تسجيل محاولة الدخول في سجل النشاط (إن فعّلها المستخدم) — لا يُفشل شيئاً أبداً. */
async function logAttempt(ok, cfg) {
  try {
    if (cfg && cfg.security && cfg.security.logLoginAttempts === false) return;
    const { activity } = await import('../data/repos/activity.js');
    await activity.log({
      type: ok ? 'auth:login' : 'auth:failed',
      description: ok ? 'تم فتح القفل بنجاح' : 'محاولة فاشلة لإدخال الرقم السري',
    });
  } catch (e) { /* السجل ثانوي */ }
}

function setAppHidden(hidden) {
  const app = document.getElementById('app');
  if (!app) return;
  if (hidden) {
    app.setAttribute('inert', '');
    app.setAttribute('aria-hidden', 'true');
    app.style.visibility = 'hidden';
  } else {
    app.removeAttribute('inert');
    app.removeAttribute('aria-hidden');
    app.style.visibility = '';
  }
}

/* ==========================================================================
   2. بناء الواجهة
   ========================================================================== */

/**
 * «نسيت الرقم السري»: لا يمكن إزالة الرقم دون مسح البيانات (وإلا صار القفل بلا قيمة).
 * يمسح كل مخازن هذا الجهاز بما فيها النسخ الاحتياطية المحلية، ثم يزيل الرقم والجلسة.
 * يمكن استعادة البيانات بعدها من السحابة أو من ملف JSON مُصدَّر سابقاً.
 * @returns {Promise<void>}
 */
export async function wipeAllLocalData() {
  for (const s of STORE_NAMES) {
    await idb.clear(s);
  }
  auth.reset();
}

function buildOverlay(cfg, onSubmit) {
  const ws = cfg.workshop || {};
  const ls = cfg.lockScreen || DEFAULT_SETTINGS.lockScreen;

  const input = el('input', {
    type: 'password',
    inputMode: 'numeric',
    maxLength: PIN_LENGTH,
    autocomplete: 'off',
    placeholder: '••••',
    'aria-label': 'الرقم السري',
    style: {
      width: '180px', fontSize: '28px', textAlign: 'center', letterSpacing: '10px',
      padding: '10px 12px', borderRadius: '12px', border: '2px solid #ffffff88',
      background: '#ffffffee', color: '#1F6D57', outline: 'none',
    },
  });
  const status = el('div', {
    role: 'alert',
    style: { minHeight: '22px', fontSize: '14px', color: '#FFD6D6', fontWeight: '600' },
  });
  const button = el('button', {
    type: 'button',
    style: {
      padding: '10px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer',
      fontSize: '16px', fontWeight: '700', background: '#B8863B', color: '#fff',
      fontFamily: 'inherit',
    },
  }, 'فتح');

  const children = [];
  if (ls.showLogo !== false) {
    if (ws.logo) {
      children.push(el('img', {
        src: ws.logo, alt: '',
        style: { width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ffffff99' },
      }));
    } else {
      children.push(el('div', { style: { fontSize: '56px' } }, '🧵'));
    }
  }
  if (ws.name) children.push(el('div', { style: { fontSize: '22px', fontWeight: '700' } }, String(ws.name)));
  children.push(el('div', { style: { fontSize: '15px', opacity: '0.9' } }, String(ls.message || DEFAULT_SETTINGS.lockScreen.message)));
  children.push(input, status, button);

  /* --- نسيت الرقم السري --- */
  const forgotLink = el('button', {
    type: 'button',
    style: {
      background: 'none', border: 'none', color: '#ffffffcc', textDecoration: 'underline',
      fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', marginTop: '6px',
    },
  }, 'نسيت الرقم السري؟');
  const confirmInput = el('input', {
    type: 'text', placeholder: 'اكتب: مسح', autocomplete: 'off', 'aria-label': 'تأكيد المسح',
    style: { width: '180px', fontSize: '16px', textAlign: 'center', padding: '8px', borderRadius: '10px', border: '2px solid #ffffff88', background: '#ffffffee', color: '#7A1F1F' },
  });
  const wipeBtn = el('button', {
    type: 'button',
    style: { padding: '9px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700', background: '#B3261E', color: '#fff', fontFamily: 'inherit' },
  }, 'مسح بيانات هذا الجهاز وإزالة الرقم');
  const forgotPanel = el('div', {
    style: { display: 'none', flexDirection: 'column', alignItems: 'center', gap: '10px', maxWidth: '320px', fontSize: '13px', lineHeight: '1.7' },
  }, [
    el('div', {}, '⚠️ لا يمكن استرجاع الرقم. الاستمرار يمسح كل بيانات التطبيق من هذا الجهاز (العملاء، الطلبات، الدفعات، والنسخ المحلية). يمكنك استعادتها بعدها من السحابة أو من ملف JSON إن كنت قد صدّرته.'),
    confirmInput,
    wipeBtn,
  ]);
  children.push(forgotLink, forgotPanel);

  const bg = ls.background
    ? 'linear-gradient(#0008,#0008), center/cover no-repeat url("' + String(ls.background).replace(/["\\\n\r]/g, '') + '")'
    : 'linear-gradient(160deg,#1F6D57,#0F3D31)';

  const box = el('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': 'شاشة القفل', dir: 'rtl',
    style: {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: '2147483000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '14px', padding: '24px', color: '#fff', textAlign: 'center',
      background: bg, fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif",
    },
  }, children);

  let busy = false;
  let countdown = null;

  const stopCountdown = () => { if (countdown) { clearInterval(countdown); countdown = null; } };

  const refreshLockState = () => {
    if (!auth.isLocked()) {
      stopCountdown();
      input.disabled = false;
      button.disabled = false;
      if (status.dataset.locked === '1') { status.textContent = ''; status.dataset.locked = ''; }
      return false;
    }
    const sec = Math.ceil(auth.getLockRemainingMs() / 1000);
    status.textContent = '🔒 محاولات كثيرة — انتظر ' + sec + ' ثانية';
    status.dataset.locked = '1';
    input.disabled = true;
    button.disabled = true;
    if (!countdown) countdown = setInterval(refreshLockState, 500);
    return true;
  };

  const submit = async () => {
    if (busy || refreshLockState()) return;
    const pin = toLatinDigits(input.value).trim();
    if (!new RegExp('^\\d{' + PIN_LENGTH + '}$').test(pin)) {
      status.textContent = 'أدخل ' + PIN_LENGTH + ' أرقام';
      return;
    }
    busy = true;
    try {
      const res = await onSubmit(pin);
      if (!res.success) {
        input.value = '';
        if (res.reason === 'locked' || res.locked) refreshLockState();
        else status.textContent = '❌ الرقم غير صحيح (' + res.attempts + '/' + LIMITS.maxPinAttempts + ')';
        input.focus();
      }
    } finally { busy = false; }
  };

  forgotLink.addEventListener('click', () => {
    forgotPanel.style.display = forgotPanel.style.display === 'none' ? 'flex' : 'none';
  });
  wipeBtn.addEventListener('click', async () => {
    if (confirmInput.value.trim() !== 'مسح') { status.textContent = 'اكتب كلمة «مسح» للتأكيد'; return; }
    wipeBtn.disabled = true;
    try {
      await wipeAllLocalData();
      location.reload();
    } catch (e) {
      wipeBtn.disabled = false;
      status.textContent = '❌ تعذّر المسح: ' + (e && e.message ? e.message : e);
    }
  });

  button.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', () => {
    input.value = toLatinDigits(input.value).replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (input.value.length === PIN_LENGTH) submit();
  });

  refreshLockState();
  return { node: box, focus: () => input.focus(), dispose: stopCountdown };
}

/* ==========================================================================
   3. القفل / الفتح
   ========================================================================== */

/**
 * عرض شاشة القفل وانتظار الفتح.
 * @returns {Promise<void>} يُحَلّ عند نجاح إدخال الرقم.
 */
export function showLock() {
  if (_lockedPromise) return _lockedPromise;

  _lockedPromise = (async () => {
    const cfg = await readSettings();
    setAppHidden(true);

    await new Promise((resolve) => {
      const ui = buildOverlay(cfg, async (pin) => {
        const res = await auth.unlock(pin);
        if (res.success) {
          const hours = Number(cfg.security && cfg.security.sessionDurationHours)
            || DEFAULT_SETTINGS.security.sessionDurationHours;
          auth.setSession(hours);
          logAttempt(true, cfg);
          ui.dispose();
          if (_overlay) { _overlay.remove(); _overlay = null; }
          setAppHidden(false);
          _lastActivity = Date.now();
          resolve();
        } else if (res.reason === 'wrong-pin') {
          logAttempt(false, cfg);
        } else if (res.reason === 'no-pin') {
          /* الرقم أُزيل من مكان آخر — لا داعي للقفل */
          ui.dispose();
          if (_overlay) { _overlay.remove(); _overlay = null; }
          setAppHidden(false);
          resolve();
        }
        return res;
      });
      _overlay = ui.node;
      document.body.appendChild(ui.node);
      ui.focus();
    });
  })().finally(() => { _lockedPromise = null; });

  return _lockedPromise;
}

/**
 * يُستدعى عند الإقلاع: يفتح مباشرة إن لا PIN أو الجلسة صالحة، وإلا يعرض القفل.
 * @returns {Promise<void>}
 */
export async function ensureUnlocked() {
  if (!auth.hasPin()) return;
  if (auth.getSession()) return;
  await showLock();
}

/** قفل فوري (يحذف الجلسة). لا يفعل شيئاً إن لا PIN. */
export function lockNow() {
  if (!auth.hasPin()) return Promise.resolve();
  auth.clearSession();
  return showLock();
}

/* ==========================================================================
   4. القفل التلقائي عند الخمول
   ========================================================================== */

function markActivity() {
  const now = Date.now();
  if (now - _lastMark < ACTIVITY_THROTTLE_MS) return;
  _lastMark = now;
  if (!_lockedPromise) _lastActivity = now;
}

async function checkIdle() {
  if (_lockedPromise || !auth.hasPin()) return;
  const cfg = await readSettings();
  const sc = cfg.security || DEFAULT_SETTINGS.security;
  if (sc.autoLock === false) return;
  const minutes = Number(sc.lockAfterMinutes) || DEFAULT_SETTINGS.security.lockAfterMinutes;
  if (Date.now() - _lastActivity >= minutes * 60 * 1000) {
    lockNow();
  }
}

/**
 * تفعيل مراقبة الخمول (مرة واحدة).
 */
export function installAutoLock() {
  if (_installed) return;
  _installed = true;
  ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach((evt) => {
    document.addEventListener(evt, markActivity, { passive: true, capture: true });
  });
  /* عند العودة للتبويب/التطبيق: المؤقّتات قد تكون متوقفة في الخلفية، فنفحص فوراً */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkIdle();
  });
  _idleTimer = setInterval(checkIdle, IDLE_CHECK_MS);
}

/** للاختبار/الإيقاف */
export function uninstallAutoLock() {
  if (_idleTimer) clearInterval(_idleTimer);
  _idleTimer = null;
  _installed = false;
}
