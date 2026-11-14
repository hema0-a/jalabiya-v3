/* ==========================================================================
   db-failure.js — شاشة «مشكلة في بيانات التطبيق» عند الإقلاع
   ==========================================================================
   تُعرض (بعد شاشة القفل، فلا يُتجاوز الرقم السري) في حالتين — انظر services/boot-check.js:
     open-failed   : تعذّر فتح قاعدة البيانات ⟵ «إعادة المحاولة».
     possible-wipe : القاعدة فارغة رغم نسخ سابقة ⟵ «استيراد نسخة من ملف» أو «ابدأ ببيانات جديدة».
   لا استعادة صامتة: كل خطوة بيد المستخدم. لا innerHTML (el() و clear() فقط).
   ========================================================================== */

import { el, clear } from '../core/dom.js';

const BTN = {
  padding: '12px 20px', borderRadius: '10px', border: '0', font: 'inherit', cursor: 'pointer',
  background: '#1F6D57', color: '#fff', width: '100%', maxWidth: '320px',
};
const BTN_PLAIN = { ...BTN, background: 'transparent', color: 'inherit', border: '1px solid currentColor' };

export const DB_FAILURE_TEXT = {
  'open-failed': {
    title: '⚠️ تعذّر فتح قاعدة بيانات التطبيق',
    body: 'لم يُفتح التطبيق حمايةً لبياناتك. أغلق أي نافذة أخرى للتطبيق ثم أعد المحاولة. إن تكرر الأمر فلا تمسح بيانات المتصفح قبل أن تحفظ نسخة.',
  },
  'possible-wipe': {
    title: '⚠️ البيانات تبدو فارغة',
    body: 'هذا الجهاز أخذ نسخاً احتياطية سابقاً، لكن التطبيق يفتح الآن بلا أي بيانات. قد يكون المتصفح حذف التخزين لامتلاء الهاتف، وفي هذه الحالة تضيع النسخ الداخلية أيضاً. إن كان عندك ملف نسخة احتياطية محفوظ خارج الهاتف (واتساب أو درايف) فاستورده الآن.',
  },
};

/**
 * @param {HTMLElement} appEl
 * @param {{status:'open-failed'|'possible-wipe', error?:*,
 *          onRetry?:()=>void, onImport?:(file:File)=>(Promise<*>|void), onStartFresh?:()=>void}} opts
 * @returns {HTMLElement|null}
 */
export function renderDbFailure(appEl, opts = {}) {
  if (!appEl) return null;
  const kind = opts.status === 'possible-wipe' ? 'possible-wipe' : 'open-failed';
  const text = DB_FAILURE_TEXT[kind];
  const retry = typeof opts.onRetry === 'function' ? opts.onRetry : () => window.location.reload();

  appEl.removeAttribute('inert');
  appEl.removeAttribute('aria-hidden');
  appEl.style.visibility = 'visible';

  try {
    const kids = [
      el('div', { style: { fontSize: '1.2em', fontWeight: '700' } }, text.title),
      el('div', { style: { maxWidth: '360px', lineHeight: '1.8', textAlign: 'center' } }, text.body),
    ];
    if (kind === 'possible-wipe' && typeof opts.onImport === 'function') {
      const input = el('input', { type: 'file', accept: '.json,.jalabiya,application/json,text/plain', style: { display: 'none' } });
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0];
        if (f) { try { await opts.onImport(f); } catch (e) { console.error('[db-failure] import', e); } }
        input.value = '';
      });
      kids.push(input);
      kids.push(el('button', { type: 'button', style: BTN, onClick: () => input.click() }, '📂 استيراد نسخة من ملف'));
      kids.push(el('button', { type: 'button', style: BTN_PLAIN, onClick: () => retry() }, '🔄 أعد تحميل التطبيق بعد الاستيراد'));
      if (typeof opts.onStartFresh === 'function') {
        kids.push(el('button', { type: 'button', style: BTN_PLAIN, onClick: () => opts.onStartFresh() }, 'ابدأ ببيانات جديدة'));
      }
    } else {
      kids.push(el('button', { type: 'button', style: BTN, onClick: () => retry() }, 'إعادة المحاولة'));
    }
    const box = el('div', { className: 'boot', style: { flexDirection: 'column', gap: '14px', alignItems: 'center', padding: '24px' } }, kids);
    clear(appEl);
    appEl.appendChild(box);
    return box;
  } catch (err) {
    console.error('[db-failure] تعذّر بناء الشاشة، عرض نص بسيط:', err);
    appEl.textContent = text.title + ' — ' + text.body;
    return null;
  }
}
