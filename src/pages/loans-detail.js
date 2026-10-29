/* ==========================================================================
   loans-detail.js — نافذة تفاصيل القرض + سجل الدفعات (v3.5.11)
   ==========================================================================
   openLoanDetail(ctx, loan) — منقولة حرفياً.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { personalLoans } from '../data/repos/personal-loans.js';
import { loanPayments } from '../data/repos/loan-payments.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { TYPE_MAP, typeColor } from './loans-logic.js';
import { openLoanForm, openPaymentForm } from './loans-forms.js';

/* ==========================================================================
   5. تفاصيل القرض
   ========================================================================== */

export async function openLoanDetail(ctx, loan) {
  const payments = await loanPayments.listByLoan(loan.id);
  const type = TYPE_MAP[loan.type] || TYPE_MAP.given;

  const body = el('div', {}, [
    el('div', { style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '4px' } },
      type.icon + ' ' + loan.personName),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '12px' } },
      type.label),
    loan.phone ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } },
      '📞 ' + loan.phone) : null,
    loan.date ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } },
      '📅 ' + formatDate(loan.date)) : null,
    loan.dueDate ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } },
      '⏰ الاستحقاق: ' + formatDate(loan.dueDate)) : null,
    loan.note ? el('div', { style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' } },
      loan.note) : null,
  ]);

  /* بطاقات المدفوع/المتبقي */
  body.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' },
  }, [
    el('div', { style: { padding: '10px', background: '#E8F5E9', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#2E7D32' } }, '✅ مدفوع'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#2E7D32', marginTop: '2px' } },
        formatEGP(loan.totalPaid)),
    ]),
    el('div', { style: { padding: '10px', background: '#FFF3E0', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#F57C00' } }, '⏳ متبقي'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#F57C00', marginTop: '2px' } },
        formatEGP(loan.remaining)),
    ]),
  ]));

  /* شريط التقدم */
  body.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  }, [
    el('div', {
      style: {
        width: loan.progressPercent + '%', height: '100%',
        background: loan.progressPercent >= 100 ? '#2E7D32' : typeColor(loan.type),
        transition: 'width 0.4s',
      },
    }),
  ]));

  /* سجل الدفعات */
  if (payments.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '16px 0 8px 0' },
    }, '📜 آخر الدفعات'));
    payments.slice(0, 5).forEach((p) => {
      body.appendChild(el('div', {
        style: {
          padding: '6px 10px', background: '#F6F1E6',
          borderRadius: '6px', marginBottom: '4px',
          display: 'flex', justifyContent: 'space-between', fontSize: '12px',
        },
      }, [
        el('span', {}, p.date ? formatDate(p.date) : ''),
        el('span', { style: { fontWeight: '600', color: '#2E7D32' } }, formatEGP(p.amount)),
      ]));
    });
  }

  /* الأزرار */
  const actions = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' },
  }, [
    el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      disabled: loan.remaining > 0.009 ? null : 'disabled',
      title: loan.remaining > 0.009 ? '' : 'القرض مسدَّد بالكامل',
      onClick: () => { handle.close(); openPaymentForm(ctx, loan); },
    }, '💵 دفعة جديدة'),
    el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      onClick: () => { handle.close(); openLoanForm(ctx, loan); },
    }, '✏️ تعديل'),
    el('button', {
      className: 'btn btn--danger btn--block', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف قرض',
          message: 'حذف قرض "' + loan.personName + '"؟ سيتم حذف كل دفعاته.',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          const pays = await loanPayments.listByLoan(loan.id);
          for (const p of pays) await loanPayments.remove(p.id);
          await personalLoans.remove(loan.id);
          toast.success('تم الحذف');
          handle.close();
          await ctx.refresh();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️ حذف'),
  ]);

  body.appendChild(actions);

  const handle = modal.open({
    title: 'تفاصيل القرض',
    body,
    closable: true,
  });
}
