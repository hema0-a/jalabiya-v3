/* ==========================================================================
   deposit-guard.js — تحذير العربون قبل بدء التنفيذ  [v3.3.45]
   ==========================================================================
   يُستدعى قبل تحويل الطلب من «معلّق» إلى «قيد التنفيذ». إن كان المدفوع (مقدم +
   دفعات) أقل من نسبة العربون المحدّدة في الإعدادات تظهر نافذة:
     [إلغاء] [📱 اطلب العربون] [ابدأ على أي حال]
   - لا يمنع شيئاً: «ابدأ على أي حال» تُكمل الانتقال.
   - لا يفشل أبداً: أي خطأ ⇒ يُسمح بالمتابعة (الميزة تحذير لا حاجز).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { settings } from '../data/repos/settings.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { orderPaidBreakdown } from '../services/payments-view.js';
import { normalizePolicy, checkDeposit, isStartTransition } from '../services/deposit-policy.js';
import { getTemplateSync, interpolate, buildVars } from '../services/message-templates.js';
import { sendLogged } from '../services/auto-messages.js';
import { formatEGP } from '../core/utils.js';

/**
 * @param {Object} order — الطلب قبل التغيير
 * @param {string} toStatus — الحالة الجديدة
 * @returns {Promise<boolean>} true = تابع الانتقال، false = ألغِ
 */
export async function depositGuard(order, toStatus) {
  try {
    if (!isStartTransition(order, toStatus)) return true;
    const s = await settings.get();
    const policy = normalizePolicy(s && s.depositPolicy);
    if (!policy.enabled) return true;

    let linked = [];
    try { linked = await payments.findByOrder(order.id); } catch (e) { /* المقدم فقط */ }
    const paid = orderPaidBreakdown(order, linked).paid;
    const chk = checkDeposit(order, paid, policy);
    if (!chk.applies || chk.ok) return true;

    let customer = null;
    try { customer = order.customerId ? await customers.find(order.customerId) : null; } catch (e) { /* بلا عميل */ }

    /* زر «اطلب العربون»: القالب مفعَّل + للعميل هاتف */
    const cfg = (s && s.autoMessages) || {};
    const tpl = cfg.enabled === false ? null : getTemplateSync('deposit_request', cfg);
    const canAsk = !!(tpl && tpl.enabled && customer && customer.phone);
    const askText = canAsk
      ? interpolate(tpl.text, buildVars(order, customer, (s && s.workshop) || {}, { paid, depositPercent: policy.minPercent }))
      : '';

    return await new Promise((resolve) => {
      const body = el('div', { style: { lineHeight: '1.9', fontSize: '14px' } }, [
        el('div', {}, 'المدفوع حتى الآن: ' + formatEGP(chk.paid) + ' (' + chk.percentPaid + '%) من ' + formatEGP(order.amount)),
        el('div', {}, 'الحد الأدنى للعربون: ' + chk.percentRequired + '% = ' + formatEGP(chk.required)),
        el('div', { style: { color: '#C62828', fontWeight: '600' } }, 'الناقص: ' + formatEGP(chk.shortfall)),
      ]);
      const actions = [
        { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => { resolve(false); handle.close(); } },
      ];
      if (canAsk) {
        actions.push({
          text: '📱 اطلب العربون', variant: 'secondary', action: 'ask',
          onClick: () => {
            sendLogged(customer.phone, askText, { kind: 'deposit_request', ref: order.id, customerId: customer.id });
            resolve(false); handle.close();
          },
        });
      }
      actions.push({ text: 'ابدأ على أي حال', variant: 'primary', action: 'start', onClick: () => { resolve(true); handle.close(); } });
      const handle = modal.open({
        title: '⚠️ العربون أقل من المطلوب',
        body, actions,
        onClose: () => resolve(false),   /* الإغلاق بـ × = إلغاء (الوعد يُحَلّ مرة واحدة فقط) */
      });
    });
  } catch (e) {
    return true;
  }
}
