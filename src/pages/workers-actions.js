/* ==========================================================================
   workers-actions.js — عمليات العامل: حذف · تفعيل/إيقاف · حذف دفعة (v3.5.9)
   ==========================================================================
   deleteWorker · toggleActive · deletePayment — كلها (ctx, …) وتنادي ctx.refresh() بعد التنفيذ.
   ========================================================================== */

import { workers } from '../data/repos/workers.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { attendance } from '../data/repos/attendance.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatEGP } from '../core/utils.js';

/* ==========================================================================
   6. عمليات
   ========================================================================== */

export async function deleteWorker(ctx, w) {
  const ok = await modal.confirm({
    title: 'حذف عامل',
    message: 'حذف "' + w.name + '"؟ سيتم حذف كل دفعاته وسجل حضوره.',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    const pays = await workerPayments.listByWorker(w.id);
    await trash.addToTrash('workers', w);          /* أولاً: حتى لا تضيع الدفعات إن فشل الحفظ */
    for (const p of pays) await workerPayments.remove(p.id);
    /* v3.15.0: سجلات حضور العامل تُحذف معه (لا يتيم في المزامنة) */
    for (const r of (await attendance.list()).filter((x) => x.workerId === w.id)) await attendance.remove(r.id);
    await workers.remove(w.id);
    toast.success('تم الحذف');
    await ctx.refresh();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

export async function toggleActive(ctx, w) {
  try {
    await workers.toggleActive(w.id);
    toast.info(w.active === false ? 'تم التفعيل' : 'تم التعطيل');
    await ctx.refresh();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

export async function deletePayment(ctx, payment) {
  const ok = await modal.confirm({
    title: 'حذف دفعة',
    message: 'حذف دفعة بقيمة ' + formatEGP(payment.amount) + '؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await workerPayments.remove(payment.id);
    toast.success('تم الحذف');
    await ctx.refresh();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}
