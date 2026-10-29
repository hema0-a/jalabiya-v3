/* ==========================================================================
   commitments-actions.js — إجراءات المالية الشخصية (v3.5.10)
   ==========================================================================
   حذف التزام/هدف · تفاصيل الالتزام · المعاينات السريعة.
   مستقلة: لا تستورد النماذج ولا البطاقات (فتح النموذج عبر ctx).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { savingsGoals } from '../data/repos/savings-goals.js';
import {
  invalidateCache,
  COMMITMENT_CAT_MAP,
  COMMITMENT_FREQ_MAP,
} from '../services/commitments-calculator.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { previewCommitment, previewGoal } from '../ui/quick-preview.js';

/* ==========================================================================
   1. الحذف
   ========================================================================== */

/**
 * حذف التزام (مع دفعاته) بعد تأكيد — كان معالج onClick داخل البطاقة.
 * @param {object} ctx
 * @param {object} item
 */
export async function deleteCommitment(ctx, item) {
  const ok = await modal.confirm({
    title: 'حذف التزام',
    message: 'حذف "' + item.name + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    const pays = await commitmentPayments.listByCommitment(item.id);
    for (const p of pays) await commitmentPayments.remove(p.id);
    await commitments.remove(item.id);
    toast.success('تم الحذف');
    invalidateCache();
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

/**
 * حذف هدف ادخار بعد تأكيد — كان معالج onClick داخل البطاقة.
 * @param {object} ctx
 * @param {object} goal
 */
export async function deleteGoal(ctx, goal) {
  const ok = await modal.confirm({
    title: 'حذف هدف',
    message: 'حذف "' + goal.name + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await savingsGoals.remove(goal.id);
    toast.success('تم الحذف');
    invalidateCache();
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

/* ==========================================================================
   2. المعاينات السريعة
   ========================================================================== */

/**
 * معاينة سريعة للالتزام (زر التعديل داخلها يفتح نموذج الالتزام عبر ctx).
 * @param {object} ctx
 * @param {object} item
 */
export function openCommitmentPreview(ctx, item) {
  previewCommitment(item, () => ctx.openCommitmentForm(item));
}

/**
 * معاينة سريعة للهدف.
 * @param {object} ctx
 * @param {object} goal
 */
export function openGoalPreview(ctx, goal) {
  previewGoal(goal, () => ctx.openGoalForm(goal));
}

/* ==========================================================================
   3. تفاصيل الالتزام (Modal داخلي قديم — بقي للاستخدام كزر "👁️")
   ========================================================================== */

export async function openCommitmentDetail(item) {
  const payments = await commitmentPayments.listByCommitment(item.id);
  const cat = COMMITMENT_CAT_MAP[item.category] || COMMITMENT_CAT_MAP.other;
  const freq = COMMITMENT_FREQ_MAP[item.frequency] || COMMITMENT_FREQ_MAP.monthly;

  const body = el('div', {}, [
    el('div', { style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '8px' } }, item.name),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, cat.icon + ' ' + cat.label),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, freq.icon + ' ' + freq.label),
    item.dueDay ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, '📅 يوم ' + item.dueDay) : null,
    item.notes ? el('div', { style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' } }, item.notes) : null,
  ]);

  body.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' },
  }, [
    el('div', { style: { padding: '10px', background: '#E8F5E9', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#2E7D32' } }, '✅ مدفوع هذا الشهر'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#2E7D32', marginTop: '2px' } },
        formatEGP(item.paidThisMonth)),
    ]),
    el('div', { style: { padding: '10px', background: '#FFF3E0', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#F57C00' } }, '⏳ متبقي'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#F57C00', marginTop: '2px' } },
        formatEGP(item.remaining)),
    ]),
  ]));

  body.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  }, [
    el('div', {
      style: {
        width: item.progressPercent + '%', height: '100%',
        background: item.progressPercent >= 100 ? '#2E7D32' : '#1F6D57',
        transition: 'width 0.4s',
      },
    }),
  ]));

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

  const handle = modal.open({
    title: 'تفاصيل الالتزام',
    body,
    closable: true,
  });
}
