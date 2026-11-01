/* ==========================================================================
   payments-card.js — بطاقة الدفعة + حذفها (v3.5.24: مفصول عن payments.js)
   ==========================================================================
   API: buildPaymentCard(ctx, p) → HTMLElement · deletePayment(ctx, p) → Promise<void>
   ctx = { state, refresh }. لا يستورد payments.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewPayment } from '../ui/quick-preview.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { openPaymentForm } from './payments-form.js';

export async function deletePayment(ctx, p) {
  const { state } = ctx;
  const c = state.customerMap[p.customerId];
  const ok = await modal.confirm({
    title: 'حذف دفعة',
    message: 'حذف دفعة "' + (c ? c.name : '') + '" بمبلغ ' + formatEGP(p.amount) + '؟' +
      (p.fromCredit ? '\n\n💳 هذه الدفعة خُصمت من رصيد العميل، وسيُعاد إليه ' + formatEGP(p.amount) + '.' : ''),
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  let refunded = false;
  try {
    /* دفعة من الرصيد: نُعيد المبلغ للمحفظة أولاً (كان الرصيد يضيع عند حذفها) */
    if (p.fromCredit && p.customerId && Number(p.amount) > 0) {
      await customers.walletAdjust(p.customerId, {
        balance: Number(p.amount), type: 'adjust', orderId: p.orderId || null,
        note: 'استرجاع: حذف دفعة من الرصيد',
      });
      refunded = true;
    }
    await trash.addToTrash('payments', refunded ? { ...p, creditRefunded: true } : p);
    await payments.remove(p.id);
    toast.success(p.fromCredit ? 'تم الحذف وأُعيد المبلغ لرصيد العميل' : 'تم الحذف');
    await ctx.refresh();
  } catch (err) {
    if (refunded) {   // فشل الحذف بعد الإعادة: نتراجع كي لا يتضاعف الرصيد
      try { await customers.walletAdjust(p.customerId, { balance: -Number(p.amount), type: 'adjust', note: 'تراجع: فشل حذف الدفعة' }); } catch (e2) { /* ignore */ }
    }
    toast.danger('فشل: ' + err.message);
  }
}

export function buildPaymentCard(ctx, p) {
  const { state } = ctx;
  const c = state.customerMap[p.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى' };

  /* الطلب المرتبط */
  const linkedOrder = p.orderId ? state.orderMap[p.orderId] : null;
  const orderLabel = linkedOrder
    ? '#' + String(linkedOrder.id).slice(-6) + ' — ' + formatEGP(linkedOrder.amount)
    : null;

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': p.id,
    onClick: () => previewPayment(p, c, () => openPaymentForm(ctx, p)),
  });

  /* السطر 1: العميل + المبلغ */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { 'data-customer-id': p.customerId || null, style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, name),
      orderLabel ? el('div', {
        style: { fontSize: '11px', color: '#1F6D57', marginTop: '2px', fontWeight: '500' },
      }, '🔗 ' + orderLabel) : el('div', {
        style: { fontSize: '11px', color: '#999', marginTop: '2px' },
      }, 'بدون طلب مرتبط'),
    ]),
    el('div', { style: { fontWeight: '700', color: '#2E7D32', fontSize: '16px', textAlign: 'left' } },
      formatEGP(p.amount)),
  ]));

  /* السطر 2: طريقة + تاريخ */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '10px', fontSize: '12px', color: '#666', marginBottom: '8px', flexWrap: 'wrap' },
  }, [
    el('span', {}, '💳 ' + (methods[p.method] || 'نقدي')),
    p.createdAt ? el('span', {}, '📅 ' + formatDate(p.createdAt)) : null,
  ].filter(Boolean)));

  if (p.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px' },
    }, p.notes));
  }

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openPaymentForm(ctx, p),
    }, '✏️ تعديل'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deletePayment(ctx, p),
    }, '🗑️'),
  ]));

  return card;
}
