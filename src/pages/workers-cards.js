/* ==========================================================================
   workers-cards.js — بطاقة العامل وصف الدفعة (v3.5.9)
   ==========================================================================
   buildWorkerCard(ctx, w) · buildPaymentRow(ctx, payment) — منقولتان حرفياً.
   ========================================================================== */

import { el } from '../core/dom.js';
import { workers } from '../data/repos/workers.js';
import { previewWorker } from '../ui/quick-preview.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { SALARY_TYPE_MAP, getPaidThisMonth } from './workers-logic.js';
import { openWorkerForm, openPaymentForm } from './workers-forms.js';
import { deleteWorker, toggleActive, deletePayment } from './workers-actions.js';

/* ==========================================================================
   7. بطاقة العامل
   ========================================================================== */

export function buildWorkerCard(ctx, w) {
  const isActive = w.active !== false;
  const initial = String(w.name || '?').charAt(0) || '?';
  const salaryType = SALARY_TYPE_MAP[w.salaryType] || SALARY_TYPE_MAP.fixed;
  const paidThisMonth = getPaidThisMonth(ctx.state, w.id);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', opacity: isActive ? '1' : '0.6', cursor: 'pointer' },
    'data-id': w.id,
    onClick: () => previewWorker(w, () => openWorkerForm(ctx, w)),
  });

  /* الرأس */
  card.appendChild(el('div', {
    style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: '40px', height: '40px', borderRadius: '50%',
        background: isActive ? 'linear-gradient(135deg, #2E8B6F, #1F6D57)' : '#ccc',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', fontWeight: '600', flexShrink: '0',
      },
    }, initial),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, w.name),
      el('div', { style: { fontSize: '12px', color: '#2E8B6F' } },
        salaryType.icon + ' ' + (w.specialty || salaryType.label)),
    ]),
    w.salary ? el('div', {
      style: { fontSize: '13px', fontWeight: '600', color: '#B8863B', textAlign: 'left' },
    }, formatEGP(w.salary)) : null,
  ]));

  /* الشارات */
  const badges = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  });

  badges.appendChild(el('span', {
    style: {
      fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '10px',
      color: isActive ? '#2E7D32' : '#666',
      background: isActive ? '#E8F5E9' : '#F0EAE0',
    },
  }, isActive ? '✅ نشط' : '🚫 معطَّل'));

  badges.appendChild(el('span', {
    style: {
      fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '10px',
      color: '#1565C0', background: '#E3F2FD',
    },
  }, '📅 ' + salaryType.label));

  if (paidThisMonth > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '10px',
        color: '#2E7D32', background: '#E8F5E9',
      },
    }, '💵 مدفوع: ' + formatEGP(paidThisMonth)));
  }

  card.appendChild(badges);

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openPaymentForm(ctx, w),
    }, '💵 دفعة'),
    el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--ghost' : 'btn--secondary'),
      type: 'button',
      onClick: () => toggleActive(ctx, w),
    }, isActive ? '🚫' : '✅'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openWorkerForm(ctx, w),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteWorker(ctx, w),
    }, '🗑️'),
  ]));

  return card;
}

/* ==========================================================================
   8. رسم الدفعات
   ========================================================================== */

export function buildPaymentRow(ctx, payment) {
  const { state } = ctx;
  const w = state.workers.find((x) => x.id === payment.workerId);
  const name = w ? w.name : 'عامل محذوف';

  const row = el('div', {
    className: 'card',
    style: { marginBottom: '8px', padding: '10px 12px' },
  });

  row.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '14px' } },
        '👷 ' + name),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📅 ' + (payment.date ? formatDate(payment.date) : '—') +
        (payment.notes ? ' · 📝 ' + payment.notes : '')),
    ]),
    el('div', { style: { fontWeight: '700', color: '#2E7D32', fontSize: '15px' } },
      formatEGP(payment.amount)),
  ]));

  row.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
  }, [
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deletePayment(ctx, payment),
    }, '🗑️ حذف'),
  ]));

  return row;
}
