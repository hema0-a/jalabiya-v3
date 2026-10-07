/* ==========================================================================
   fab.js — زر عائم للإجراءات السريعة (FAB)
   ==========================================================================
   - زر ثابت أسفل يسار الشاشة (.fab من components.css).
   - عند الضغط → bottom-sheet بـ 4 إجراءات سريعة.
   - كل إجراء → تنقّل + Toast إرشادي.
   - لا يظهر في #/tests (أداة تطوير).
   - static imports فقط (القاعدة 14).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

/* ==========================================================================
   1. الإجراءات السريعة
   ========================================================================== */

const ACTIONS = [
  { id: 'order',    icon: '📋', label: 'طلب جديد',    hash: '#/orders',    hint: 'اضغط ➕ إضافة طلب' },
  { id: 'customer', icon: '👤', label: 'عميل جديد',   hash: '#/customers', hint: 'اضغط ➕ إضافة عميل' },
  { id: 'payment',  icon: '💰', label: 'دفعة جديدة',  hash: '#/payments',  hint: 'اضغط ➕ إضافة دفعة' },
  { id: 'expense',  icon: '💸', label: 'مصروف جديد',  hash: '#/expenses',  hint: 'اضغط ➕ إضافة مصروف' },
];

/* ==========================================================================
   2. الحالة الداخلية
   ========================================================================== */

let fabNode = null;

/* ==========================================================================
   3. أدوات مساعدة
   ========================================================================== */

/**
 * هل الصفحة الحالية تسمح بإظهار FAB؟
 * @returns {boolean}
 */
function isAllowedPage() {
  try {
    const hash = String(location.hash || '').replace(/^#\/?/, '');
    const base = hash.split('/')[0] || 'dashboard';
    if (base === 'tests') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * بناء صف إجراء واحد.
 * @param {Object} action
 * @returns {HTMLElement}
 */
function buildActionRow(action) {
  const btn = el('button', {
    type: 'button',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px',
      background: '#FFFFFF',
      border: '1px solid #E5DDD0',
      borderRadius: '12px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: '15px',
      fontWeight: '500',
      color: '#123C2F',
      textAlign: 'right',
      width: '100%',
      minHeight: '56px',
      transition: 'background 150ms ease',
    },
    onClick: () => handleAction(action),
  }, [
    el('span', {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: 'rgba(31, 109, 87, 0.10)',
        fontSize: '20px',
        flexShrink: '0',
      },
    }, action.icon),
    el('span', { style: { flex: '1' } }, action.label),
    el('span', {
      style: { color: '#2E8B6F', fontSize: '18px', transform: 'scaleX(-1)' },
    }, '‹'),
  ]);

  /* hover بسيط */
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(31, 109, 87, 0.05)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#FFFFFF';
  });

  return btn;
}

/**
 * بناء محتوى bottom-sheet.
 * @returns {HTMLElement}
 */
function buildActionsSheet() {
  const wrap = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '8px' },
  });
  ACTIONS.forEach((action) => wrap.appendChild(buildActionRow(action)));
  return wrap;
}

/**
 * معالجة اختيار إجراء (تنقّل + Toast).
 * @param {Object} action
 */
function handleAction(action) {
  try { modal.close(); } catch { /* ignore */ }

  try {
    if (location.hash !== action.hash) {
      location.hash = action.hash;
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch (e) {
    console.warn('[FAB] navigation failed:', e);
  }

  try {
    setTimeout(() => toast.info('💡 ' + action.hint), 250);
  } catch { /* ignore */ }
}

/**
 * فتح قائمة الإجراءات السريعة.
 */
function openQuickActions() {
  try {
    modal.open({
      title: '⚡ إجراءات سريعة',
      body: buildActionsSheet(),
      closable: true,
      variant: 'sheet',
    });
  } catch (e) {
    console.warn('[FAB] open failed:', e);
  }
}

/**
 * بناء عنصر FAB.
 * @returns {HTMLElement}
 */
function buildFab() {
  return el('button', {
    type: 'button',
    id: 'quick-actions-fab',
    className: 'fab',
    'aria-label': 'إجراءات سريعة',
    title: 'إجراءات سريعة',
    onClick: () => openQuickActions(),
  }, '⚡');
}

/**
 * مزامنة ظهور FAB حسب الصفحة.
 */
function syncVisibility() {
  if (!fabNode) return;
  fabNode.style.display = isAllowedPage() ? '' : 'none';
}

/* ==========================================================================
   4. API العام
   ========================================================================== */

/**
 * تثبيت FAB (idempotent).
 * @returns {boolean} true إذا ثُبِّت الآن، false إذا كان مثبتًا مسبقًا
 */
export function mount() {
  if (fabNode) return false;
  if (typeof document === 'undefined') return false;

  fabNode = buildFab();
  document.body.appendChild(fabNode);

  window.addEventListener('hashchange', syncVisibility);
  syncVisibility();

  console.log('[FAB] ✅ مُثبَّت — إجراءات سريعة أسفل يسار');
  return true;
}

/**
 * إزالة FAB.
 * @returns {void}
 */
export function unmount() {
  if (!fabNode) return;
  if (fabNode.parentNode) fabNode.parentNode.removeChild(fabNode);
  window.removeEventListener('hashchange', syncVisibility);
  fabNode = null;
}

/**
 * هل FAB مثبَّت؟
 * @returns {boolean}
 */
export function isMounted() {
  return !!fabNode;
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { ACTIONS, isAllowedPage };
