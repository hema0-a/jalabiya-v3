/* ==========================================================================
   quick-preview-order.js — معاينة الطلب (v3.5.7)
   ==========================================================================
   مقتطع من quick-preview.js دون تغيير منطق: previewOrder (بنود، تسليم جزئي، حساب، مقاسات وقت الطلب، رصيد/نقاط، طباعة).
   يستورد quick-preview-helpers فقط. الواجهة العامة: previewOrder.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { orders as ordersRepo } from '../data/repos/orders.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { customers as customersRepo, walletOf, loyaltyConfig } from '../data/repos/customers.js';
import { settings as settingsRepo } from '../data/repos/settings.js';
import { printOrderInvoice } from '../services/invoice-print.js';
import { deliveryProgress } from '../services/partial-delivery.js';
import { shareOrderInvoiceImage } from '../services/invoice-image.js';
import { openDeliveryReceipt } from './delivery-receipt-dialog.js';
import { orderPaidBreakdown } from '../services/payments-view.js';
import { _row, _stat, _listItem, _section, _acc, _whatsapp, _closeAction, _orderItems, _askNumber } from './quick-preview-helpers.js';

/**
 * قسم «مقاسات وقت الطلب» (نسخة محفوظة مع الطلب).
 * @param {Object} order
 * @returns {Array<HTMLElement>}
 */
function _orderMeasurementRows(order) {
  const snap = order && order.measurementsSnapshot;
  const fields = snap && Array.isArray(snap.fields) ? snap.fields : [];
  const posture = snap && Array.isArray(snap.posture) ? snap.posture : [];
  if (fields.length === 0 && posture.length === 0) {
    return [el('div', { style: { fontSize: '12px', color: '#999', padding: '6px 0' } },
      'لا توجد نسخة مقاسات محفوظة لهذا الطلب (طلب قديم)')];
  }
  return [
    ...fields.map((f) => _row('📏', f.name,
      f.value + (f.unit ? ' ' + (f.unit === 'cm' ? 'سم' : f.unit) : ''))),
    posture.length > 0 ? _row('🧍', 'القوام', posture.join('، ')) : null,
    snap.at ? el('div', { style: { fontSize: '11px', color: '#999', padding: '4px 0' } },
      'مأخوذة بتاريخ ' + formatDate(snap.at)) : null,
  ].filter(Boolean);
}

/* ============================================================
   3. previewOrder
   ============================================================ */

/**
 * معاينة سريعة لطلب (بنود + خصم + رسوم + مقدم + طباعة).
 * @param {string|Object} idOrObj
 * @param {Object|Function} [customerOrOnEdit]
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewOrder(idOrObj, customerOrOnEdit, onEdit) {
  let order, customer, editCb;
  if (typeof idOrObj === 'string') {
    order = await ordersRepo.find(idOrObj);
    customer = order ? await customersRepo.find(order.customerId) : null;
    editCb = customerOrOnEdit;
  } else {
    order = idOrObj;
    customer = customerOrOnEdit;
    editCb = onEdit;
  }
  if (!order) return;

  const payments = await paymentsRepo.findByOrder(order.id);
  const paidTotal = orderPaidBreakdown(order, payments).paid;
  const total = Number(order.amount) || 0;
  const remaining = Math.max(0, total - paidTotal);

  const statusLabels = { pending: '⏳ قيد الانتظار', in_progress: '🧵 قيد التنفيذ',
    ready: '✅ جاهز', delivered: '📦 تم التسليم', cancelled: '❌ ملغي' };

  const items = _orderItems(order);
  const itemsRows = items.map((it) => _listItem(
    it.name,
    it.quantity + ' × ' + formatEGP(it.price) + ' = ' + formatEGP(it.price * it.quantity)
  ));

  /* التسليم الجزئي: التقدم وسجل التسليمات (يظهر فقط إن وُجدت تسليمات) */
  const dprog = deliveryProgress(order);
  const deliveryRows = dprog.history.length > 0 ? [
    ...dprog.history.map((h) => _listItem(
      formatDate(h.at) + ' — ' + h.units + ' قطعة' + (h.hasSignature ? ' ✍️' : ''),
      h.items.map((x) => x.qty + ' × ' + x.name).join('، ') + (h.note ? ' · ' + h.note : ''),
      { label: '🧾 إيصال', onClick: () => openDeliveryReceipt(order, h.id, customer || null, {}) }
    )),
    dprog.remainingUnits > 0
      ? _row('⏳', 'المتبقي للتسليم', dprog.remainingUnits + ' قطعة · ' + formatEGP(dprog.remainingValue))
      : null,
  ] : [];

  const subtotal = Number(order.subtotal) || 0;
  const discountAmount = Number(order.discountAmount) || 0;
  const extraFeesTotal = Number(order.extraFeesTotal) || 0;
  const hasBreakdown = subtotal > 0 && (discountAmount > 0 || extraFeesTotal > 0);

  const breakdownRows = hasBreakdown ? [
    _row('📊', 'المجموع الفرعي', formatEGP(subtotal)),
    discountAmount > 0 ? _row('🎁', 'الخصم', '− ' + formatEGP(discountAmount)) : null,
    extraFeesTotal > 0 ? _row('➕', 'رسوم إضافية', '+ ' + formatEGP(extraFeesTotal)) : null,
  ].filter(Boolean) : [];

  const feeTypeMap = {
    urgency: '⚡ استعجال', modify: '✏️ تعديلات',
    delivery: '🚚 توصيل', packaging: '📦 تغليف', other: '📌 أخرى',
  };
  const feeRows = (Array.isArray(order.extraFees) && order.extraFees.length > 0)
    ? [
        _section('➕ الرسوم الإضافية'),
        ...order.extraFees.map((f) => {
          const val = (f.type === 'percent') ? (Number(f.value) || 0) + '%' : formatEGP(f.value);
          return _listItem(feeTypeMap[f.feeType] || 'رسم', val);
        }),
      ]
    : [];
  const calcRows = [...breakdownRows, ...feeRows];
  const calcSummary = [
    discountAmount > 0 ? 'خصم ' + formatEGP(discountAmount) : null,
    extraFeesTotal > 0 ? 'رسوم ' + formatEGP(extraFeesTotal) : null,
  ].filter(Boolean).join(' · ');

  /* الرصيد والنقاط (v3.3.51) */
  let wal = { balance: 0, points: 0 };
  let loy = { enabled: false, earnEvery: 20, pointValue: 1 };
  try {
    if (customer && customer.id) wal = walletOf(await customersRepo.find(customer.id));
    loy = loyaltyConfig(await settingsRepo.get());
  } catch { /* بدون محفظة */ }
  const canPay = remaining > 0 && order.status !== 'cancelled' && !!customer;

  const measureCount = (order.measurementsSnapshot && Array.isArray(order.measurementsSnapshot.fields))
    ? order.measurementsSnapshot.fields.length : 0;
  const postureCount = (order.measurementsSnapshot && Array.isArray(order.measurementsSnapshot.posture))
    ? order.measurementsSnapshot.posture.length : 0;

  /* الأساسي ظاهر دائماً (بيانات + المبالغ)، والتفاصيل أقسام قابلة للطي */
  const body = el('div', {}, [
    _row('👤', 'العميل', customer ? customer.name : 'عميل محذوف'),
    customer && customer.phone ? _row('📞', 'الهاتف', customer.phone) : null,
    _row('🔖', 'الحالة', statusLabels[order.status] || order.status),
    order.urgent ? el('div', { style: { fontSize: '12px', fontWeight: '700', color: '#C62828', margin: '4px 0' } }, '⚡ طلب عاجل') : null,
    order.receivedDate ? _row('🧵', 'استلام القماش', formatDate(order.receivedDate)) : null,
    order.dueDate ? _row('📅', 'تاريخ التسليم', formatDate(order.dueDate)) : null,
    order.createdAt ? _row('📆', 'تاريخ الطلب', formatDate(order.createdAt)) : null,

    _section('💰 المبالغ'),
    el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, [
      _stat('الإجمالي', formatEGP(total)),
      _stat('المدفوع', formatEGP(paidTotal), '#2E7D32'),
      _stat('المتبقي', formatEGP(remaining), remaining > 0 ? '#F57C00' : '#666'),
    ]),

    items.length > 0
      ? _acc({ id: 'qp-order-items', title: '📦 البنود', badge: items.length > 1 ? items.length : 0, defaultOpen: true, children: itemsRows })
      : null,
    deliveryRows.length > 0
      ? _acc({ id: 'qp-order-delivery', title: '🚚 التسليم', defaultOpen: true,
          summary: dprog.deliveredUnits + ' من ' + dprog.totalUnits + ' قطعة', children: deliveryRows })
      : null,
    calcRows.length > 0
      ? _acc({ id: 'qp-order-calc', title: '🧮 تفاصيل الحساب', summary: calcSummary, children: calcRows })
      : null,
    _acc({ id: 'qp-order-measures', title: '📏 مقاسات وقت الطلب',
      summary: (measureCount > 0 || postureCount > 0)
        ? [measureCount > 0 ? measureCount + ' مقاس' : null, postureCount > 0 ? 'قوام' : null].filter(Boolean).join(' + ')
        : 'لا توجد نسخة محفوظة',
      children: _orderMeasurementRows(order) }),
    order.notes
      ? _acc({ id: 'qp-order-notes', title: '📝 ملاحظات', defaultOpen: true,
          children: [el('p', { style: { fontSize: '13px', color: '#666', margin: '0', lineHeight: '1.5' } }, order.notes)] })
      : null,
  ].filter(Boolean));

  const actions = [
    { text: '🖨️ طباعة', variant: 'primary',
      onClick: () => {
        modal.close();
        try { printOrderInvoice(order, customer); }
        catch (e) { console.error('[previewOrder print]', e); }
      } },
    { text: '🖼️ فاتورة كصورة', variant: 'secondary',
      onClick: async () => {
        modal.close();
        try {
          const r = await shareOrderInvoiceImage(order, customer);
          if (r === 'downloaded') toast.info('تم حفظ صورة الفاتورة — أرفقها في محادثة واتساب');
        } catch (e) {
          console.error('[previewOrder share image]', e);
          toast.danger('تعذّر إنشاء صورة الفاتورة');
        }
      } },
    customer && customer.phone ? { text: '📱 واتساب', variant: 'secondary',
      onClick: () => _whatsapp(customer.phone, 'بخصوص طلبك #' + String(order.id).slice(-6)) } : null,
    canPay && wal.balance > 0 ? { text: '💳 من الرصيد (' + formatEGP(wal.balance) + ')', variant: 'secondary',
      onClick: async () => {
        modal.close();
        const max = Math.min(wal.balance, remaining);
        const amt = await _askNumber({ title: 'خصم من رصيد العميل',
          message: 'الرصيد المتاح ' + formatEGP(wal.balance) + ' · المتبقي على الطلب ' + formatEGP(remaining),
          value: max, max, unit: 'ج.م' });
        if (amt) {
          try { const got = await ordersRepo.spendCredit(order.id, amt, remaining); toast.success('تم خصم ' + formatEGP(got) + ' من الرصيد'); }
          catch (e) { toast.danger('تعذّر الخصم: ' + e.message); }
        }
        previewOrder(order.id, customer, editCb);
      } } : null,
    canPay && loy.enabled && wal.points > 0 ? { text: '🎁 نقاط (' + wal.points + ')', variant: 'secondary',
      onClick: async () => {
        modal.close();
        const needPts = Math.ceil(remaining / loy.pointValue - 1e-9);
        const max = Math.min(wal.points, needPts);
        const pts = await _askNumber({ title: 'استبدال نقاط بخصم',
          message: 'نقاط العميل ' + wal.points + ' · كل نقطة = ' + formatEGP(loy.pointValue) + ' خصم على الطلب',
          value: max, max: wal.points, unit: 'نقطة' });
        if (pts) {
          try { const r = await ordersRepo.redeemPoints(order.id, pts, remaining); toast.success('تم خصم ' + formatEGP(r.value) + ' (' + r.points + ' نقطة)'); }
          catch (e) { toast.danger('تعذّر الاستبدال: ' + e.message); }
        }
        previewOrder(order.id, customer, editCb);
      } } : null,
    customer && order.status !== 'delivered' && order.status !== 'cancelled' ? { text: '🔄 تحديث المقاسات', variant: 'secondary',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'تحديث مقاسات الطلب',
          message: 'سيتم استبدال مقاسات هذا الطلب بمقاسات العميل الحالية. هل تريد المتابعة؟',
          confirmText: 'نعم، حدّث', cancelText: 'إلغاء',
        });
        if (!ok) return;
        const snap = await ordersRepo.refreshMeasurementsSnapshot(order.id);
        modal.close();
        if (snap) previewOrder(order.id, customer, editCb);
      } } : null,
    editCb ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); editCb(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '📋 ' + (customer ? customer.name : 'طلب'), body, actions, closable: true, variant: 'sheet' });
}
