/* ==========================================================================
   theme.js — إدارة الوضع الليلي / النهاري
   ==========================================================================
   - يقرأ/يكتب التفضيل في localStorage (jalabiya_v3_theme).
   - يطبّق الوضع عبر body.dark-mode.
   - يعرض أيقونة ديناميكية (☀️ / 🌙) للزر.
   - يُزامن مع settings.display.darkMode (اختياري).
   - static imports فقط (القاعدة 14).
   ========================================================================== */

import { STORAGE_KEYS } from '../core/config.js';
import { events } from '../core/events.js';

/* ==========================================================================
   1. الحالة الداخلية
   ========================================================================== */

/** هل الوضع الداكن مُفعَّل الآن؟ */
let isDark = false;

/** هل أضفنا الـ listener من قبل؟ */
let systemListenerAttached = false;

/* ==========================================================================
   2. أدوات مساعدة
   ========================================================================== */

/**
 * قراءة التفضيل المحفوظ من localStorage.
 * @returns {'dark'|'light'|null}
 */
function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.V3_THEME);
    return (v === 'dark' || v === 'light') ? v : null;
  } catch {
    return null;
  }
}

/**
 * كتابة التفضيل في localStorage.
 * @param {'dark'|'light'} value
 */
function writeStoredTheme(value) {
  try {
    localStorage.setItem(STORAGE_KEYS.V3_THEME, value);
  } catch (e) {
    console.warn('[Theme] write failed:', e);
  }
}

/**
 * هل تفضيل النظام هو الوضع الداكن؟
 * @returns {boolean}
 */
function systemPrefersDark() {
  try {
    return window.matchMedia &&
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/* ==========================================================================
   3. تطبيق الوضع
   ========================================================================== */

/**
 * تطبيق الوضع على DOM.
 * @param {boolean} dark
 */
function applyToDom(dark) {
  try {
    if (dark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    /* تحديث meta theme-color */
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', dark ? '#121212' : '#1F6D57');
    }
  } catch (e) {
    console.warn('[Theme] applyToDom failed:', e);
  }
}

/**
 * تشغيل انتقال سلس عند التبديل.
 * - يُضيف data-theme-transition="on" لمدة 400ms.
 */
function enableTransition() {
  try {
    document.documentElement.setAttribute('data-theme-transition', 'on');
    setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transition');
    }, 400);
  } catch { /* ignore */ }
}

/* ==========================================================================
   4. API العام
   ========================================================================== */

/**
 * هل الوضع الداكن مُفعَّل الآن؟
 * @returns {boolean}
 */
export function isDarkMode() {
  return isDark;
}

/**
 * تطبيق الوضع الحالي (من localStorage أو من تفضيل النظام).
 * - يُستدعى عند بدء التشغيل.
 * @returns {boolean} هل الوضع الداكن مُفعَّل بعد التطبيق؟
 */
export function applyTheme() {
  const stored = readStoredTheme();
  const dark = (stored === 'dark') || (stored === null && systemPrefersDark());

  isDark = dark;
  applyToDom(dark);

  /* إرفاق listener لتفضيل النظام (مرة واحدة) */
  if (!systemListenerAttached && window.matchMedia) {
    systemListenerAttached = true;
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', (e) => {
        /* نُطبّق فقط إذا لم يكن هناك تفضيل محفوظ */
        if (readStoredTheme() === null) {
          isDark = e.matches;
          applyToDom(isDark);
          events.emit('theme:changed', { dark: isDark, source: 'system' });
        }
      });
    } catch { /* بعض المتصفحات القديمة */ }
  }

  events.emit('theme:applied', { dark });
  return isDark;
}

/**
 * تعيين الوضع الداكن/النهاري صريحًا + حفظه.
 * @param {boolean} dark
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] — إن true، لا يُطلق حدث
 * @returns {boolean} الحالة الجديدة
 */
export function setDarkMode(dark, options = {}) {
  const value = !!dark;
  if (value === isDark) return isDark;

  enableTransition();
  isDark = value;
  applyToDom(value);
  writeStoredTheme(value ? 'dark' : 'light');

  if (!options.silent) {
    events.emit('theme:changed', { dark: isDark, source: 'user' });
  }
  return isDark;
}

/**
 * تبديل الوضع (Dark ⇄ Light).
 * @returns {boolean} الحالة الجديدة (true = dark)
 */
export function toggleTheme() {
  return setDarkMode(!isDark);
}

/**
 * أيقونة الزر بناءً على الوضع الحالي.
 * - الوضع النهاري → 🌙 (للدعوة للتحويل).
 * - الوضع الداكن → ☀️ (للدعوة للعودة).
 * @returns {string}
 */
export function getThemeIcon() {
  return isDark ? '☀️' : '🌙';
}

/**
 * الوصف العربي للوضع الحالي.
 * @returns {string}
 */
export function getThemeLabel() {
  return isDark ? 'الوضع النهاري' : 'الوضع الليلي';
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = {
  readStoredTheme,
  writeStoredTheme,
  systemPrefersDark,
};
