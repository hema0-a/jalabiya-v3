/* ==========================================================================
   lock-failure.js — شاشة «تعذّر عرض شاشة القفل» (fail-closed)
   ==========================================================================
   تُعرض حين يوجد رقم سري لكن شاشة القفل نفسها فشلت (خطأ برمجي/تلف): لا نفتح البيانات ولا نترك
   شاشة بيضاء، بل رسالة مع زر «إعادة المحاولة».
   القواعد: لا innerHTML (el() و clear() فقط). وهذا مسار حرج فلا نعتمد على سلامة بقية الواجهة:
   إن فشل بناء العناصر لأي سبب نكتب النص بـ textContent (آمن، لا يحقن HTML) بدل ترك الشاشة فارغة.
   ========================================================================== */

import { el, clear } from '../core/dom.js';

/** نص الرسالة. */
export const LOCK_FAILURE_MESSAGE = '🔒 تعذّر عرض شاشة القفل. لحماية بياناتك لم يُفتح التطبيق.';

/**
 * يعرض شاشة فشل القفل داخل عنصر التطبيق.
 * @param {HTMLElement} appEl — عنصر #app
 * @param {{reload?: ()=>void}} [opts] — reload: بديل لإعادة التحميل (الاختبار)
 * @returns {HTMLElement|null} صندوق الرسالة، أو null إن اضطررنا للتراجع إلى textContent
 */
export function renderLockFailure(appEl, opts = {}) {
  if (!appEl) return null;
  const reload = typeof opts.reload === 'function' ? opts.reload : () => window.location.reload();

  /* أُخفي التطبيق أثناء القفل (inert/aria-hidden/visibility) — يجب إظهاره ليقرأ المستخدم الرسالة */
  appEl.removeAttribute('inert');
  appEl.removeAttribute('aria-hidden');
  appEl.style.visibility = 'visible';

  try {
    const box = el('div', { className: 'boot', style: { flexDirection: 'column', gap: '12px' } }, [
      el('div', { text: LOCK_FAILURE_MESSAGE }),
      el('button', {
        type: 'button',
        style: {
          padding: '10px 20px', borderRadius: '10px', border: '0',
          background: '#1F6D57', color: '#fff', font: 'inherit', cursor: 'pointer',
        },
        onClick: () => reload(),
      }, 'إعادة المحاولة'),
    ]);
    clear(appEl);
    appEl.appendChild(box);
    return box;
  } catch (err) {
    /* ملاذ أخير بلا أي اعتماد على el/clear: textContent يمسح الأبناء ولا يفسّر HTML */
    console.error('[lock-failure] تعذّر بناء الشاشة، عرض نص بسيط:', err);
    appEl.textContent = LOCK_FAILURE_MESSAGE + ' أعد تحميل الصفحة.';
    return null;
  }
}
