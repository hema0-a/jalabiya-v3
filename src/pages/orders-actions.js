/* ==========================================================================
   orders-actions.js — عمليات الطلب: حذف · تقدّم الحالة · طباعة · مشاركة · رسائل · مؤقت · عارضا الصورة والتوقيع (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون تغيير منطق. كل عملية تستلم ctx أولاً (ctx.state للقراءة، ctx.refresh لإعادة الرسم).
   لا يستورد أي وحدة من وحدات orders-* غير orders-logic (لا دورات).
   ========================================================================== */

import { el } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { payments as paymentsRepoForDelete } from '../data/repos/payments.js';
import { trash } from '../data/repos/trash.js';
import { settings } from '../data/repos/settings.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { getOrderMedia } from '../data/repos/order-media.js';
import { printOrderInvoice } from '../services/invoice-print.js';
import { shareOrderInvoiceImage } from '../services/invoice-image.js';
import { getOrderMessageOptions } from '../services/auto-messages.js';
import { orderPaidBreakdown } from '../services/payments-view.js';
import { statusNotifyAction } from '../services/status-notify.js';
import { depositGuard } from '../ui/deposit-guard.js';
import { sinceText } from '../services/message-log.js';
import { completeRemaining } from '../services/partial-delivery.js';
import { getActiveSession, startSession, stopSession } from '../services/order-timing.js';
import { STATUS_MAP, STATUS_ORDER } from './orders-logic.js';

/* ==========================================================================
   5. عمليات
   ========================================================================== */

export async function deleteOrder(ctx, order) {
  const { state } = ctx;
  const refreshAll = ctx.refresh;
  const c = state.customerMap[order.customerId];
  const label = c ? c.name : 'طلب';
  let linkedNote = '';
  try {
    const linked = await paymentsRepoForDelete.findByOrder(order.id);
    if (linked.length > 0) {
      linkedNote = '\n\n⚠️ مرتبط به ' + linked.length +
        ' دفعة ستبقى محسوبة في الإيرادات (يمكنك حذفها من صفحة المدفوعات).';
    }
  } catch (e) { /* نكمل بدون التنبيه */ }
  const ok = await modal.confirm({
    title: 'حذف طلب',
    message: 'هل أنت متأكد من حذف طلب "' + label + '"؟' + linkedNote,
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('orders', order);
    await orders.remove(order.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل الحذف: ' + err.message); }
}

export async function advanceStatus(ctx, order) {
  const refreshAll = ctx.refresh;
  const idx = STATUS_ORDER.indexOf(order.status);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) { toast.info('لا يمكن تغيير الحالة'); return; }
  const next = STATUS_ORDER[idx + 1];
  if (!(await depositGuard(order, next))) return;   /* تحذير العربون قبل بدء التنفيذ */
  try {
    const patch = { status: next };
    if (next === 'delivered') {
      const cr = completeRemaining(order);                    /* يُسلِّم المتبقي ويكمل سجل التسليم الجزئي إن وُجد */
      patch.deliveredAt = order.deliveredAt || cr.deliveredAt;
      if (cr.deliveries) patch.deliveries = cr.deliveries;
    }
    await orders.update(order.id, patch);
    const prev = { status: order.status, deliveredAt: order.deliveredAt ?? null, readyAt: order.readyAt ?? null,
      deliveries: order.deliveries ?? null };
    /* زر «📱 إشعار العميل» في نفس التنبيه (إن كان للحالة قالب والعميل له هاتف) */
    const notify = await statusNotifyAction({ ...order, ...patch }, next);
    toast.undo('الحالة: ' + STATUS_MAP[next].label, async () => {
      await orders.update(order.id, prev);
      toast.info('تم التراجع: ' + STATUS_MAP[prev.status].label);
      await refreshAll();
    }, notify ? { extraAction: notify, duration: 10000 } : {});
    await refreshAll();
  } catch (err) { toast.danger('فشل التحديث: ' + err.message); }
}

export async function printInvoice(ctx, order) {
  const { state } = ctx;
  const c = state.customerMap[order.customerId] || null;
  try { await printOrderInvoice(order, c); }
  catch (err) { toast.danger('فشل فتح نافذة الطباعة'); }
}

/** مشاركة الفاتورة كصورة (واتساب): قائمة المشاركة على الجوال، أو تنزيل الصورة كبديل. */
export async function shareInvoiceImage(ctx, order) {
  const { state } = ctx;
  const c = state.customerMap[order.customerId] || null;
  try {
    const r = await shareOrderInvoiceImage(order, c);
    if (r === 'downloaded') toast.info('تم حفظ صورة الفاتورة — أرفقها في محادثة واتساب');
  } catch (err) {
    console.error('[orders shareInvoiceImage]', err);
    toast.danger('تعذّر إنشاء صورة الفاتورة');
  }
}

/**
 * يفتح الصورة المرجعية الكاملة: القراءة المزدوجة (المضمَّنة القديمة أو orderMedia). يُعرض المصغّر إن تعذّر الأصل.
 * @param {Object} o — الطلب
 * @param {string} title
 */
export async function openReferenceImage(o, title) {
  try {
    const full = await getOrderMedia(o, 'ref');
    if (full || o.refThumb) showReferenceImage(full || o.refThumb, title);
    else toast.warning('تعذّر العثور على الصورة');
  } catch (e) { toast.danger('تعذّر فتح الصورة: ' + e.message); }
}

/**
 * يفتح توقيع الطلب (مضمَّن قديم أو من orderMedia).
 * @param {Object} o — الطلب
 */
export async function openSignature(o) {
  try {
    const sig = await getOrderMedia(o, 'sig');
    if (sig) showSignature(sig); else toast.warning('تعذّر العثور على التوقيع');
  } catch (e) { toast.danger('تعذّر فتح التوقيع: ' + e.message); }
}

export function showSignature(dataUrl) {
  if (!dataUrl) return;
  const body = el('div', {}, [
    el('img', {
      src: dataUrl, alt: 'التوقيع',
      style: { width: '100%', borderRadius: '12px', border: '1px solid #E5DDD0', background: '#fff' },
    }),
  ]);
  modal.open({
    title: '✍️ التوقيع المحفوظ', body, closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

/**
 * عرض الصورة المرجعية بملء الشاشة (lightbox).
 * @param {string} dataUrl
 * @param {string} [title='الصورة المرجعية']
 */
export function showReferenceImage(dataUrl, title = 'الصورة المرجعية') {
  if (!dataUrl) return;
  const body = el('div', {}, [
    el('img', {
      src: dataUrl, alt: title,
      style: { width: '100%', maxHeight: '75vh', objectFit: 'contain',
        borderRadius: '12px', background: '#fff' },
    }),
  ]);
  modal.open({
    title: '🖼️ ' + title, body, closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

export async function openMessageMenu(ctx, order) {
  const { state } = ctx;
  const customer = state.customerMap[order.customerId];
  if (!customer || !customer.phone) { toast.warning('لا يوجد هاتف مسجَّل للعميل'); return; }
  /* المتبقي الحقيقي (دفعات + مقدم) واسم الورشة من الإعدادات — كانا يُهملان فيظهر «متبقي» = الإجمالي */
  let paid = Number(order.deposit) || 0;
  let workshop = {};
  try {
    const linked = await paymentsRepoForDelete.findByOrder(order.id);
    paid = orderPaidBreakdown(order, linked).paid;
  } catch (e) { /* نكتفي بالمقدم */ }
  try { workshop = (await settings.get()).workshop || {}; } catch (e) { /* افتراضي */ }
  const options = await getOrderMessageOptions(order, customer, workshop, { paid });
  if (options.length === 0) { toast.warning('لا توجد قوالب مفعَّلة'); return; }

  const body = el('div', {});
  options.forEach((opt) => {
    body.appendChild(el('button', {
      type: 'button',
      style: {
        display: 'block', width: '100%', textAlign: 'right',
        padding: '12px', border: '1px solid #E5DDD0',
        borderRadius: '10px', marginBottom: '8px',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
      },
      onClick: () => { modal.close(); opt.send(); },
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } },
        opt.icon + ' ' + opt.name),
      el('div', {
        style: { fontSize: '12px', color: '#666', marginTop: '6px', whiteSpace: 'pre-wrap' },
      }, opt.text),
      opt.lastSentAt
        ? el('div', { style: { fontSize: '11px', color: '#E65100', marginTop: '6px' } },
          '✔ فُتحت لهذا الطلب ' + sinceText(opt.lastSentAt))
        : null,
    ]));
  });

  modal.open({
    title: '📱 إرسال رسالة', body, closable: true, variant: 'sheet',
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

export async function toggleTimer(ctx, order) {
  const refreshAll = ctx.refresh;
  const sessions = Array.isArray(order.workSessions) ? order.workSessions : [];
  const isActive = getActiveSession(sessions);
  try {
    const newSessions = isActive ? stopSession(sessions) : startSession(sessions);
    await orders.update(order.id, { workSessions: newSessions });
    toast.info(isActive ? 'تم إيقاف المؤقت' : 'بدأ المؤقت ⏱️');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}
