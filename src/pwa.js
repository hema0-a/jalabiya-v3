/* ==========================================================================
   pwa.js — تسجيل Service Worker + معالجة التحديثات
   ==========================================================================
   - تسجيل SW عند التحميل الأول.
   - "مفتاح إيقاف" للتطوير: أضف ?nosw=1 للـ URL → يُلغي التسجيل.
   - عند توفر نسخة جديدة: شريط «تحديث جديد متاح» (حدّث الآن / لاحقاً) بدل window.confirm.
       * «لاحقاً» يؤجّل 30 دقيقة ثم يعيد العرض عند العودة للتطبيق.
       * «حدّث الآن» يتحقق أولاً من نافذة مفتوحة (قد تضيع بياناتها) ثم يرسل SKIP_WAITING.
       * إن لم يتبدّل الـ controller خلال 8 ثوانٍ يُعاد التحميل مباشرة (لا يعلق الزر).
   - فحص التحديثات: كل ساعة + عند العودة للتطبيق (≥ 5 دقائق) + عند عودة الاتصال.
   - يدعم SKIP_WAITING للتفعيل بعد موافقة المستخدم فقط (sw.js لا يستدعي skipWaiting تلقائياً).
   ========================================================================== */

import { showUpdateBanner } from './ui/update-banner.js';

const UPDATE_CHECK_EVERY_MS = 60 * 60 * 1000;      /* فحص دوري */
const UPDATE_CHECK_MIN_GAP_MS = 5 * 60 * 1000;     /* حدّ أدنى بين فحصين عند العودة للتطبيق */
const LATER_MS = 30 * 60 * 1000;                   /* مدة «لاحقاً» */
const APPLY_FALLBACK_MS = 8000;                    /* مهلة انتظار تبدّل الـ controller */

/**
 * متحكّم عرض التحديث. معزول عن navigator/window بحقن الاعتماديات (لقابلية الاختبار).
 * @param {Object} [deps]
 * @returns {{offer:Function, apply:Function, later:Function, remindIfDue:Function, state:Function}}
 */
export function createUpdateOffer(deps = {}) {
  const {
    show = showUpdateBanner,
    hasOpenDialog = () => !!document.querySelector('.modal'),
    confirmFn = (m) => window.confirm(m),
    reload = () => window.location.reload(),
    getRegistration = () => navigator.serviceWorker.getRegistration(),
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    laterMs = LATER_MS,
    fallbackMs = APPLY_FALLBACK_MS,
  } = deps;

  let banner = null;
  let laterUntil = 0;
  let pendingLater = false;
  let applying = false;

  function offer() {
    if (applying) return false;
    if (pendingLater && now() < laterUntil) return false;
    pendingLater = false;
    if (banner && document.body.contains(banner.node)) return false;   /* ظاهر بالفعل */
    banner = show({ onUpdate: apply, onLater: later });
    return true;
  }

  function later() {
    pendingLater = true;
    laterUntil = now() + laterMs;
    if (banner) { banner.remove(); banner = null; }
  }

  async function apply() {
    if (applying) return;
    if (hasOpenDialog() &&
        !confirmFn('توجد نافذة مفتوحة وقد تضيع بياناتها غير المحفوظة عند التحديث.\n\nهل تريد التحديث الآن؟')) {
      return;
    }
    applying = true;
    if (banner) banner.setBusy(true);
    try {
      const reg = await getRegistration();
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        /* controllerchange يُعيد التحميل؛ هذه شبكة أمان إن لم يحدث */
        setTimer(() => { if (applying) reload(); }, fallbackMs);
      } else {
        reload();
      }
    } catch (e) {
      console.warn('[PWA] تعذّر تطبيق التحديث:', e);
      reload();
    }
  }

  /** يُستدعى عند العودة للتطبيق: يعيد العرض إن انتهت مهلة «لاحقاً» وما زال هناك تحديث منتظر. */
  async function remindIfDue() {
    if (applying || !pendingLater || now() < laterUntil) return false;
    try {
      const reg = await getRegistration();
      if (reg && reg.waiting) return offer();
    } catch (e) { /* ignore */ }
    return false;
  }

  return { offer, apply, later, remindIfDue, state: () => ({ applying, pendingLater, laterUntil, shown: !!banner }) };
}

/**
 * تسجيل Service Worker.
 * - إن مُرِّر `?nosw=1` في URL → يلغي التسجيل.
 * @returns {void}
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[PWA] Service Workers غير مدعومة في هذا المتصفح');
    return;
  }

  /* --- مفتاح إيقاف للتطوير --- */
  let isDisabled = false;
  try {
    const params = new URLSearchParams(location.search);
    isDisabled = params.get('nosw') === '1';
  } catch (e) { /* ignore */ }

  if (isDisabled) {
    unregisterServiceWorker();
    console.log('[PWA] ⏸️ Service Worker معطَّل عبر ?nosw=1');
    return;
  }

  const updater = createUpdateOffer();

  /* ⚠️ main.js يستخدم top-level await، فقد يكون حدث 'load' قد انطلق قبل وصولنا هنا.
     لذلك نُسجّل فوراً إن كانت الصفحة جاهزة، وإلا ننتظر 'load'. */
  const doRegister = () => {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then((reg) => {
        if (!reg) return;
        console.log('[PWA] ✅ تم تسجيل SW — النطاق:', reg.scope);

        let lastCheck = Date.now();
        const checkForUpdate = () => {
          lastCheck = Date.now();
          reg.update().catch(() => { /* ignore */ });
        };

        /* --- فحص دوري (كل ساعة) --- */
        setInterval(checkForUpdate, UPDATE_CHECK_EVERY_MS);

        /* --- فحص عند العودة للتطبيق وعند عودة الاتصال --- */
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - lastCheck >= UPDATE_CHECK_MIN_GAP_MS) checkForUpdate();
          updater.remindIfDue();
        });
        window.addEventListener('online', checkForUpdate);

        /* --- تحديث ينتظر منذ فتح التطبيق --- */
        if (reg.waiting && navigator.serviceWorker.controller) {
          updater.offer();
        }

        /* --- تحديثات مستقبلية --- */
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              updater.offer();
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA] ❌ فشل تسجيل SW:', err);
      });
  };

  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister, { once: true });
  }

  /* --- إعادة التحميل عند تغيير الـ controller (ليس عند أول تثبيت) --- */
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    console.log('[PWA] 🔄 تحميل نسخة جديدة...');
    window.location.reload();
  });
}

/**
 * إلغاء تسجيل كل Service Workers.
 * @returns {Promise<void>}
 */
export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      await r.unregister();
      console.log('[PWA] 🗑️ تم إلغاء تسجيل SW:', r.scope);
    }
  } catch (err) {
    console.warn('[PWA] فشل الإلغاء:', err);
  }
}
