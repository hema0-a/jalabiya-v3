/* ==========================================================================
   client-mode.js — وضع العميل (إخفاء الأسعار والإحصائيات)
   ==========================================================================
   - يُخفي القيم الحساسة (أسعار، إحصائيات مالية، تقارير).
   - يضيف class `client-mode` إلى body — كل الإخفاء في CSS.
   - يضيف شارة عائمة في الأعلى لإظهار أن الوضع مفعَّل.
   - يحفظ الحالة في localStorage.
   - زر تفعيل/تعطيل من Topbar.
   ========================================================================== */

import { el } from '../core/dom.js';

/* --- مفتاح localStorage --- */
const STORAGE_KEY = 'jalabiya_v3_client_mode';

/* --- معرّف الشارة العائمة --- */
const BADGE_ID = 'client-mode-badge';

/* ==========================================================================
   1. الحالة
   ========================================================================== */

/**
 * هل وضع العميل مُفعَّل؟
 * @returns {boolean}
 */
export function isClientMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/* ==========================================================================
   2. تطبيق الوضع
   ========================================================================== */

/**
 * تطبيق الحالة على DOM.
 * - يضيف/يزيل `client-mode` من body.
 * - يظهر/يخفي الشارة العائمة.
 * @returns {void}
 */
export function applyClientMode() {
  const active = isClientMode();

  /* body class */
  if (active) {
    document.body.classList.add('client-mode');
  } else {
    document.body.classList.remove('client-mode');
  }

  /* الشارة العائمة */
  let badge = document.getElementById(BADGE_ID);

  if (active && !badge) {
    badge = el('div', {
      id: BADGE_ID,
      style: {
        position: 'fixed',
        top: '60px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1F6D57',
        color: '#fff',
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '600',
        zIndex: '9997',
        boxShadow: '0 4px 12px rgba(31, 109, 87, 0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        pointerEvents: 'none',
        animation: 'fadeIn 0.3s ease both',
      },
    }, [
      el('span', {}, '👁️'),
      el('span', {}, 'وضع العرض للعميل'),
    ]);
    document.body.appendChild(badge);
  } else if (!active && badge && badge.parentNode) {
    badge.parentNode.removeChild(badge);
  }
}

/* ==========================================================================
   3. التبديل
   ========================================================================== */

/**
 * تعيين وضع العميل.
 * @param {boolean} enabled
 * @returns {void}
 */
export function setClientMode(enabled) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
  applyClientMode();
}

/**
 * تبديل وضع العميل (تفعيل ⇄ تعطيل).
 * @returns {boolean} — الحالة الجديدة
 */
export function toggleClientMode() {
  const next = !isClientMode();
  setClientMode(next);
  return next;
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { STORAGE_KEY, BADGE_ID };
