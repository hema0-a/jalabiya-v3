/* ==========================================================================
   loans-cards.js — بطاقة القرض (v3.5.11)
   ==========================================================================
   buildLoanCard(ctx, loan) — منقولة حرفياً.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { personalLoans } from '../data/repos/personal-loans.js';
import { loanPayments } from '../data/repos/loan-payments.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';
import { TYPE_MAP, typeColor } from './loans-logic.js';
import { openLoanForm, openPaymentForm } from './loans-forms.js';
import { openLoanDetail } from './loans-detail.js';

/* ==========================================================================
   6. بطاقة قرض
   ========================================================================== */

export function buildLoanCard(ctx, loan) {
  const type = TYPE_MAP[loan.type] || TYPE_MAP.given;
  const color = typeColor(loan.type);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer', borderRight: '4px solid ' + color, padding: '10px 12px' },
    'data-id': loan.id,
    onClick: () => openLoanDetail(ctx, loan),
  });

  /* السطر 1: اسم + مبلغ */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        type.icon + ' ' + loan.personName),
      loan.date ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📅 ' + formatDate(loan.date)) : null,
    ]),
    el('div', { style: { textAlign: 'left', fontSize: '13px' } }, [
      el('div', { style: { fontWeight: '700', color } }, formatEGP(loan.amount)),
      el('div', { style: { fontSize: '10px', color: '#666', marginTop: '2px' } },
        type.label),
    ]),
  ]));

  /* شريط التقدم */
  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: loan.progressPercent + '%', height: '100%',
        background: loan.progressPercent >= 100 ? '#2E7D32' : color,
        transition: 'width 0.4s',
      },
    }),
  ]));

  /* السطر 2: مدفوع/متبقي */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' },
  }, [
    el('span', {}, 'مدفوع: ' + formatEGP(loan.totalPaid)),
    el('span', {}, 'متبقي: ' + formatEGP(loan.remaining)),
  ]));

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      disabled: loan.remaining > 0.009 ? null : 'disabled',
      title: loan.remaining > 0.009 ? '' : 'القرض مسدَّد بالكامل',
      onClick: () => openPaymentForm(ctx, loan),
    }, '💵 دفعة'),
    loan.phone ? el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => {
        const phone = normalizePhone(loan.phone).replace(/\D/g, '');
        window.open('https://wa.me/' + phone, '_blank', 'noopener,noreferrer');
      },
    }, '📱') : null,
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openLoanForm(ctx, loan),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف قرض',
          message: 'حذف قرض "' + loan.personName + '"؟',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          const pays = await loanPayments.listByLoan(loan.id);
          for (const p of pays) await loanPayments.remove(p.id);
          await personalLoans.remove(loan.id);
          toast.success('تم الحذف');
          await ctx.refresh();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️'),
  ].filter(Boolean)));

  return card;
}
