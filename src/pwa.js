/* ==========================================================================
   pwa.js — تسجيل Service Worker + معالجة التحديثات
   ==========================================================================
   - تسجيل SW عند التحميل الأول.
   - "مفتاح إيقاف" للتطوير: أضف ?nosw=1 للـ URL → يُلغي التسجيل.
   - معالجة التحديثات (يظهر تنبيه عند توفر نسخة جديدة).
   - يدعم SKIP_WAITING للتفعيل الفوري.
   ========================================================================== */

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

  /* ⚠️ main.js يستخدم top-level await، فقد يكون حدث 'load' قد انطلق قبل وصولنا هنا.
     لذلك نُسجّل فوراً إن كانت الصفحة جاهزة، وإلا ننتظر 'load'. */
  const doRegister = () => {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then((reg) => {
        if (!reg) return;
        console.log('[PWA] ✅ تم تسجيل SW — النطاق:', reg.scope);

        /* --- فحص تحديثات دوري (كل ساعة) --- */
        setInterval(() => {
          reg.update().catch(() => { /* ignore */ });
        }, 60 * 60 * 1000);

        /* --- معالجة أول تسجيل --- */
        if (reg.waiting && navigator.serviceWorker.controller) {
          notifyUpdate();
        }

        /* --- معالجة تحديثات مستقبلية --- */
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate();
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

/**
 * إظهار تنبيه للمستخدم عند توفر تحديث جديد.
 * - يستخدم `confirm` بسيط (لا واجهة مخصصة لتقليل التعقيد).
 */
function notifyUpdate() {
  try {
    const ok = window.confirm(
      '🎉 يوجد تحديث جديد للتطبيق!\n\n' +
      'اضغط "موافق" لإعادة التحميل الآن.'
    );
    if (ok) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          window.location.reload();
        }
      });
    }
  } catch (e) {
    console.warn('[PWA] فشل إظهار التنبيه:', e);
  }
}
