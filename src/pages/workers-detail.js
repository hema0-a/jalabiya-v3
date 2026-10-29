/* ==========================================================================
   workers-detail.js — تفاصيل العامل + سجل الدفعات (v3.5.9)
   ==========================================================================
   openWorkerDetail(ctx, worker) — منقولة حرفياً. (ملاحظة: غير مستدعاة من أي مكان في الأصل أيضاً، أُبقيت كما هي.)
   ========================================================================== */

import { el } from '../core/dom.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { modal } from '../ui/modal.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { SALARY_TYPE_MAP } from './workers-logic.js';
import { openWorkerForm, openPaymentForm } from './workers-forms.js';

/* ==========================================================================
   5. تفاصيل العامل + سجل الدفعات
   ========================================================================== */

export async function openWorkerDetail(ctx, worker) {
  const payments = await workerPayments.listByWorker(worker.id);
  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const salaryType = SALARY_TYPE_MAP[worker.salaryType] || SALARY_TYPE_MAP.fixed;
  const isActive = worker.active !== false;

  const body = el('div', {}, [
    el('div', {
      style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '8px' },
    }, worker.name),
    el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '4px' },
    }, '👷 ' + (worker.specialty || '—')),
    worker.phone ? el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '4px' },
    }, '📞 ' + worker.phone) : null,
    el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '4px' },
    }, salaryType.icon + ' ' + salaryType.label + ': ' + formatEGP(worker.salary || 0)),
    el('div', {
      style: {
        fontSize: '13px',
        color: isActive ? '#2E7D32' : '#C62828',
        marginBottom: '4px',
      },
    }, isActive ? '✅ نشط' : '🚫 معطَّل'),
    worker.notes ? el('div', {
      style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' },
    }, worker.notes) : null,
  ]);

  /* بطاقة المدفوعات */
  body.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' },
  }, [
    el('div', {
      style: { padding: '10px', background: '#E8F5E9', borderRadius: '8px', textAlign: 'center' },
    }, [
      el('div', { style: { fontSize: '11px', color: '#2E7D32' } }, '💰 إجمالي مدفوع'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#2E7D32', marginTop: '2px' } },
        formatEGP(total)),
    ]),
    el('div', {
      style: { padding: '10px', background: '#E3F2FD', borderRadius: '8px', textAlign: 'center' },
    }, [
      el('div', { style: { fontSize: '11px', color: '#1565C0' } }, '📜 عدد الدفعات'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#1565C0', marginTop: '2px' } },
        String(payments.length)),
    ]),
  ]));

  /* سجل الدفعات */
  if (payments.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '16px 0 8px 0' },
    }, '📜 آخر الدفعات'));
    payments.slice(0, 10).forEach((p) => {
      body.appendChild(el('div', {
        style: {
          padding: '6px 10px', background: '#F6F1E6', borderRadius: '6px',
          marginBottom: '4px', display: 'flex', justifyContent: 'space-between',
          fontSize: '12px',
        },
      }, [
        el('span', {}, p.date ? formatDate(p.date) : ''),
        el('span', { style: { fontWeight: '600', color: '#2E7D32' } }, formatEGP(p.amount)),
      ]));
    });
  }

  /* الأزرار */
  body.appendChild(el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' },
  }, [
    el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      onClick: () => { handle.close(); openPaymentForm(ctx, worker); },
    }, '💵 دفعة جديدة'),
    el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      onClick: () => { handle.close(); openWorkerForm(ctx, worker); },
    }, '✏️ تعديل'),
  ]));

  const handle = modal.open({
    title: 'تفاصيل العامل',
    body,
    closable: true,
  });
}
