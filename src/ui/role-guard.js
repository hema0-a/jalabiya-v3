/* ==========================================================================
   role-guard.js — حارس الصفحات حسب الدور + القفل المالي (v3.10.0)
   ==========================================================================
   يُستدعى من main.js قبل رسم أي صفحة: guardRoute(pageId) ⟵ { allow, redirect? }.
   - صفحة ممنوعة على الدور ⟵ تحويل لصفحة الدور الرئيسية مع إشعار.
   - صفحة مالية والقفل المالي مفعّل ولم يُفتح ⟵ نافذة رقم (10 دقائق بعد النجاح).
   ⚠️ قفل واجهة (انظر services/roles.js)، لا تشفير بيانات.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { toLatinDigits } from '../core/utils.js';
import { canAccess, homeFor, hiddenPagesFor, needsFinanceGate, ROLE_LABELS } from '../services/roles.js';
import { getRole, hasFinancePin, financeUnlockedUntil, unlockFinance, financeLockRemainingMs } from '../security/role-pins.js';

/** صفحات القائمة المخفية للدور الحالي. */
export const roleHiddenPages = (allIds) => hiddenPagesFor(getRole(), allIds);

/** نافذة رقم القفل المالي ⟵ true عند النجاح، false عند الإلغاء. */
function askFinancePin() {
  return new Promise((resolve) => {
    const input = el('input', { className: 'input', type: 'password', inputMode: 'numeric', maxLength: 4, autocomplete: 'off', placeholder: '••••', 'aria-label': 'رقم القفل المالي', 'data-role': 'fin-pin', style: { textAlign: 'center', fontSize: '22px', letterSpacing: '8px' } });
    const msg = el('div', { role: 'alert', style: { minHeight: '20px', fontSize: '13px', color: '#C62828', marginTop: '6px' } });
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    let h = null;
    const submit = async () => {
      const pin = toLatinDigits(input.value);
      const r = await unlockFinance(pin);
      if (r.ok) { finish(true); h.close(); return; }
      input.value = '';
      if (r.reason === 'locked' || (r.reason === 'wrong' && r.remainingMs)) msg.textContent = 'محاولات كثيرة — انتظر ' + Math.ceil((r.remainingMs || financeLockRemainingMs()) / 1000) + ' ثانية';
      else msg.textContent = 'الرقم غير صحيح';
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    h = modal.open({
      title: '🔒 القفل المالي', closable: true,
      body: el('div', {}, [el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '8px' } }, 'أدخل رقم القفل المالي لفتح هذه الصفحة (يبقى مفتوحاً 10 دقائق)'), input, msg]),
      actions: [{ text: 'فتح', variant: 'primary', action: 'fin-unlock', onClick: submit }],
      onClose: () => finish(false),
    });
    setTimeout(() => { try { input.focus(); } catch (e) { /* اختياري */ } }, 50);
  });
}

/**
 * @param {string} pageId
 * @returns {Promise<{allow:boolean, redirect?:string}>}
 */
export async function guardRoute(pageId) {
  const role = getRole();
  if (!canAccess(role, pageId)) {
    toast.warning('هذه الصفحة غير متاحة لدور «' + (ROLE_LABELS[role] || role) + '»');
    return { allow: false, redirect: homeFor(role) };
  }
  if (needsFinanceGate(pageId, hasFinancePin(), financeUnlockedUntil())) {
    const ok = await askFinancePin();
    if (!ok) return { allow: false, redirect: homeFor(role) };
  }
  return { allow: true };
}
