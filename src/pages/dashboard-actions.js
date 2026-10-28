/* ==========================================================================
   dashboard-actions.js — إجراءات اللوحة (تنفَّذ من اللوحة نفسها ثم تُحدَّث) (v3.5.5)
   ==========================================================================
   مقتطع من dashboard.js دون تغيير في المنطق. الإجراءات تحتاج «إعادة رسم اللوحة» بعد التنفيذ،
   فتُنشأ بمصنع يستلمها كوسيط (لا استيراد دائري للصفحة):
     const actions = createDashActions(refresh);
     actions.advanceOrder(order, remaining) · actions.quickPay({...}) · actions.markApptDone(appt)
   ويصدّر أيضاً: NEXT_STATUS · STATUS_LABEL · go(hash).
   ========================================================================== */

import { depositGuard } from '../ui/deposit-guard.js';
import { statusNotifyAction } from '../services/status-notify.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { el } from '../core/dom.js';
import { saveFailMessage } from '../core/save-error.js';
import { formatEGP } from '../core/utils.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';

export const NEXT_STATUS = {
  pending:     { to: 'in_progress', label: '▶ ابدأ التنفيذ' },
  in_progress: { to: 'ready',       label: '✅ جاهز' },
  ready:       { to: 'delivered',   label: '📦 تسليم' },
};
export const STATUS_LABEL = { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', ready: 'جاهز', delivered: 'تم التسليم', cancelled: 'ملغي' };

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

/**
 * ينشئ إجراءات اللوحة مربوطة بدالة إعادة الرسم.
 * @param {Function} refresh — async () => void: تعيد رسم اللوحة مع الإبقاء على موضع التمرير
 * @returns {{advanceOrder: Function, quickPay: Function, markApptDone: Function}}
 */
export function createDashActions(refresh) {
  /** نقل الطلب للحالة التالية؛ التسليم مع متبقٍّ يطلب تأكيداً. */
  async function advanceOrder(order, remaining) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    if (next.to === 'delivered' && remaining > 0.009) {
      const ok = await modal.confirm({
        title: 'تسليم مع مبلغ متبقٍّ',
        message: 'المتبقي على الطلب ' + formatEGP(remaining) + '. هل تسلّمه الآن؟ (يبقى دَيناً على العميل)',
        confirmText: 'سلّم', cancelText: 'إلغاء',
      });
      if (!ok) return;
    }
    if (!(await depositGuard(order, next.to))) return;   /* تحذير العربون قبل بدء التنفيذ */
    try {
      const patch = { status: next.to };
      if (next.to === 'delivered' && !order.deliveredAt) patch.deliveredAt = Date.now();
      await orders.update(order.id, patch);
      /* التراجع يعيد الحالة وتواريخها كما كانت (بما فيها عمر «جاهز») */
      const prev = { status: order.status, deliveredAt: order.deliveredAt ?? null, readyAt: order.readyAt ?? null };
      const notify = await statusNotifyAction({ ...order, ...patch }, next.to);
      toast.undo('الحالة: ' + STATUS_LABEL[next.to], async () => {
        await orders.update(order.id, prev);
        toast.info('تم التراجع: ' + STATUS_LABEL[prev.status]);
        await refresh();
      }, notify ? { extraAction: notify, duration: 10000 } : {});
      await refresh();
    } catch (e) { toast.danger('تعذّر التحديث: ' + e.message); }
  }

  /** تسجيل دفعة سريعة على طلب (المبلغ الافتراضي = المتبقي). */
  function quickPay({ customerId, orderId, name, remaining }) {
    const amountIn = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: remaining > 0 ? String(remaining) : '', 'aria-label': 'المبلغ' });
    const methodSel = el('select', { className: 'select', 'aria-label': 'طريقة الدفع' });
    [['cash', 'نقدي'], ['instapay', 'InstaPay'], ['vodafone', 'Vodafone Cash'], ['other', 'أخرى']]
      .forEach(([v, l]) => methodSel.appendChild(el('option', { value: v }, l)));
    const body = el('div', {}, [
      el('p', { className: 'dash-note' }, 'دفعة من ' + name + (remaining > 0 ? ' — المتبقي ' + formatEGP(remaining) : '')),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ (ج.م)'), amountIn]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'طريقة الدفع'), methodSel]),
    ]);
    const handle = modal.open({
      title: '💰 تسجيل دفعة', body, closable: true,
      actions: [
        { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
        { text: 'حفظ الدفعة', variant: 'primary', action: 'save', onClick: async () => {
          const amount = Number(amountIn.value);
          if (!amount || !Number.isFinite(amount) || amount <= 0) { toast.warning('أدخل مبلغاً صحيحاً'); return; }
          if (remaining > 0 && amount > remaining + 0.009) { toast.warning('المبلغ أكبر من المتبقي (' + formatEGP(remaining) + ')'); return; }
          try {
            const created = await payments.create({ customerId, orderId: orderId || null, amount, method: methodSel.value, notes: '', isDeposit: false });
            handle.close();
            toast.undo('تم تسجيل دفعة ' + formatEGP(amount), async () => {
              await payments.remove(created.id);
              toast.info('تم التراجع: أُلغيت الدفعة');
              await refresh();
            });
            await refresh();
          } catch (e) { toast.danger(saveFailMessage(e, 'تعذّر الحفظ')); }
        } },
      ],
    });
    setTimeout(() => { try { amountIn.focus(); amountIn.select(); } catch { /* ignore */ } }, 80);
  }

  async function markApptDone(a) {
    try {
      const prevStatus = a.status || 'scheduled';
      await appointments.update(a.id, { status: 'done' });
      toast.undo('تم تسجيل الموعد كمنتهٍ', async () => {
        await appointments.update(a.id, { status: prevStatus });
        toast.info('تم التراجع');
        await refresh();
      });
      await refresh();
    }
    catch (e) { toast.danger('تعذّر التحديث: ' + e.message); }
  }

  return { advanceOrder, quickPay, markApptDone };
}
