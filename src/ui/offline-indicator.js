/* ==========================================================================
   offline-indicator.js — مؤشر "غير متصل"
   ==========================================================================
   - يستمع لـ window 'online' / 'offline'.
   - يُنشئ شريطًا ثابتًا أعلى الصفحة (بعد Topbar).
   - يختفي تلقائيًا بعد 3 ثوانٍ من عودة الاتصال.
   - idempotent: mount() آمن للاستدعاء المتكرر.
   - static imports فقط (القاعدة 14).
   ========================================================================== */

/* ==========================================================================
   1. الثوابت
   ========================================================================== */

const BANNER_ID = 'offline-banner';
const HIDE_DELAY_MS = 3000;

/* ==========================================================================
   2. الحالة الداخلية
   ========================================================================== */

let bannerNode = null;
let hideTimer = null;
let onlineHandler = null;
let offlineHandler = null;

/* ==========================================================================
   3. أدوات مساعدة
   ========================================================================== */

/**
 * هل الجهاز متصل حاليًا؟
 * @returns {boolean}
 */
function checkOnline() {
  try {
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

/**
 * إنشاء عنصر الشريط (يدويًا — لتفادي الاعتماد على dom.js).
 * @returns {HTMLElement}
 */
function buildBanner() {
  const node = document.createElement('div');
  node.id = BANNER_ID;
  node.className = 'offline-banner';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');

  /* الأيقونة + النص */
  const icon = document.createElement('span');
  icon.className = 'offline-banner__icon';
  icon.textContent = '🔴';

  const text = document.createElement('span');
  text.className = 'offline-banner__text';
  text.textContent = 'غير متصل — سيتم الحفظ محليًا';

  node.appendChild(icon);
  node.appendChild(text);
  return node;
}

/**
 * إظهار الشريط (إضافة class + إلغاء أي مؤقت إخفاء).
 */
function showBanner() {
  if (!bannerNode) return;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  bannerNode.classList.add('offline-banner--visible');
  bannerNode.classList.remove('offline-banner--online');
  bannerNode.querySelector('.offline-banner__icon').textContent = '🔴';
  bannerNode.querySelector('.offline-banner__text').textContent = 'غير متصل — سيتم الحفظ محليًا';
}

/**
 * تحويل الشريط إلى حالة "عاد الاتصال" ثم إخفاؤه.
 */
function showReconnected() {
  if (!bannerNode) return;
  bannerNode.classList.add('offline-banner--visible', 'offline-banner--online');
  bannerNode.querySelector('.offline-banner__icon').textContent = '✅';
  bannerNode.querySelector('.offline-banner__text').textContent = 'عاد الاتصال';

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!bannerNode) return;
    bannerNode.classList.remove('offline-banner--visible', 'offline-banner--online');
    hideTimer = null;
  }, HIDE_DELAY_MS);
}

/* ==========================================================================
   4. API العام
   ========================================================================== */

/**
 * تثبيت مؤشر عدم الاتصال (idempotent).
 * @returns {boolean} true إذا ثُبِّت الآن، false إذا كان مثبتًا مسبقًا
 */
export function mount() {
  if (bannerNode) return false;
  if (typeof document === 'undefined') return false;

  /* 1. إنشاء الشريط وإضافته إلى body */
  bannerNode = buildBanner();
  document.body.appendChild(bannerNode);

  /* 2. مستمعا الاتصال */
  offlineHandler = () => showBanner();
  onlineHandler = () => {
    /* إخفاء فوري عند أول اتصال، ثم عرض "عاد الاتصال" لثوانٍ */
    showReconnected();
  };

  window.addEventListener('offline', offlineHandler);
  window.addEventListener('online', onlineHandler);

  /* 3. المزامنة الفورية عند البدء */
  if (!checkOnline()) {
    showBanner();
  }

  console.log('[OfflineIndicator] ✅ مُثبَّت');
  return true;
}

/**
 * إزالة مؤشر عدم الاتصال.
 * @returns {void}
 */
export function unmount() {
  if (!bannerNode) return;

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);
  if (onlineHandler) window.removeEventListener('online', onlineHandler);

  if (bannerNode.parentNode) {
    bannerNode.parentNode.removeChild(bannerNode);
  }
  bannerNode = null;
  offlineHandler = null;
  onlineHandler = null;
}

/**
 * هل المؤشر مثبَّت الآن؟
 * @returns {boolean}
 */
export function isMounted() {
  return !!bannerNode;
}

/**
 * هل الجهاز متصل؟
 * @returns {boolean}
 */
export function isOnline() {
  return checkOnline();
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { BANNER_ID, HIDE_DELAY_MS };
