/* ==========================================================================
   quick-preview-customer.js — معاينة العميل والتفاصيل الكاملة (v3.5.7)
   ==========================================================================
   مقتطع من quick-preview.js دون تغيير منطق: previewCustomer + «التفاصيل الكاملة» (مقاسات، عيلة، رصيد ونقاط، طلبات).
   يستورد quick-preview-helpers وquick-preview-catalog فقط. الواجهة العامة: previewCustomer.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { createCollapsible } from './collapsible.js'; /* v3.3.63 */
import { toast } from './toast.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { orders as ordersRepo } from '../data/repos/orders.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { customers as customersRepo, walletOf, postureLabels } from '../data/repos/customers.js';
import { settings as settingsRepo } from '../data/repos/settings.js';
import { orderPaidBreakdown, withDepositPayments } from '../services/payments-view.js';
import { _row, _stat, _listItem, _section, _acc, _whatsapp, _closeAction, _orderItems, _askNumber } from './quick-preview-helpers.js';
import { shareCatalog } from './quick-preview-catalog.js';

/* ============================================================
   2. previewCustomer
   ============================================================ */

/**
 * معاينة سريعة لعميل (اسم، هاتف، إحصائيات، آخر الطلبات).
 * @param {string|Object} idOrObj — معرّف العميل أو كائن جاهز
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewCustomer(idOrObj, onEdit) {
  const c = (typeof idOrObj === 'string') ? await customersRepo.find(idOrObj) : idOrObj;
  if (!c) return;

  const [orders, payments] = await Promise.all([
    ordersRepo.findByCustomer(c.id),
    paymentsRepo.findByCustomer(c.id),
  ]);
  /* نفس قاعدة كشف الحساب: لا تُحسب الملغاة، ويُحسب المقدم غير المسجّل كدفعة */
  const totalPaid = withDepositPayments(payments, orders).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalOrders = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const remaining = Math.max(0, totalOrders - totalPaid);
  const recent = [...orders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);

  const body = el('div', {}, [
    c.vip ? el('div', { style: { fontSize: '12px', color: '#B8863B', fontWeight: '600', marginBottom: '6px' } },
      '⭐ عميل VIP') : null,
    _row('📞', 'الهاتف', c.phone || '—'),
    c.address ? _row('🏠', 'العنوان', c.address) : null,
    c.notes ? _row('📝', 'ملاحظات', c.notes) : null,
    _section('📊 الإحصائيات'),
    el('div', { style: { display: 'flex', gap: '6px' } }, [
      _stat('الطلبات', orders.length),
      _stat('المدفوع', formatEGP(totalPaid), '#2E7D32'),
      _stat('المتبقي', formatEGP(remaining), remaining > 0 ? '#F57C00' : '#666'),
    ]),
    recent.length > 0 ? _section('📦 آخر الطلبات') : null,
    ...recent.map((o) => _listItem(
      'طلب بقيمة ' + formatEGP(o.amount),
      formatDate(o.createdAt) + (o.notes ? ' · ' + o.notes : '')
    )),
  ]);

  const actions = [
    c.phone ? { text: '📱 واتساب', variant: 'primary',
      onClick: () => _whatsapp(c.phone, 'مرحباً ' + c.name + '،') } : null,
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); _openCustomerFullDetails(c, orders, onEdit); } },
    c.phone ? { text: '📋 كتالوج الأسعار', variant: 'secondary',
      onClick: () => { modal.close(); shareCatalog({ phone: c.phone, customerName: c.name }); } } : null,
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '👤 ' + c.name, body, actions, closable: true, variant: 'sheet' });
}

/**
 * صفوف مقاسات عميل (حقول الإعدادات بترتيبها، ثم أي مفاتيح قديمة).
 * @param {Object} c
 * @param {Array} fields
 * @returns {Array<HTMLElement>}
 */
function _customerMeasureRows(c, fields) {
  const m = (c && c.measurements && typeof c.measurements === 'object') ? c.measurements : {};
  const known = new Set(fields.map((f) => f.id));
  const hasVal = (v) => v != null && v !== '';
  const rows = [];
  fields.forEach((f) => {
    if (hasVal(m[f.id])) {
      rows.push(_row('📏', f.name, m[f.id] + (f.unit ? ' ' + (f.unit === 'cm' ? 'سم' : f.unit) : '')));
    }
  });
  Object.keys(m).forEach((k) => {
    if (!known.has(k) && hasVal(m[k])) rows.push(_row('📏', k, m[k]));
  });
  return rows;
}

/** سطر مختصر: مقاسات الطلب + القوام (أو null لو لا نسخة). */
function _orderSnapLine(o) {
  const snap = o && o.measurementsSnapshot;
  const fields = snap && Array.isArray(snap.fields) ? snap.fields : [];
  const posture = snap && Array.isArray(snap.posture) ? snap.posture : [];
  if (fields.length === 0 && posture.length === 0) return null;
  const parts = [];
  if (fields.length > 0) parts.push('📏 مقاسات الطلب: ' + fields.map((f) => f.name + ' ' + f.value).join(' · '));
  if (posture.length > 0) parts.push('🧍 القوام: ' + posture.join('، '));
  return el('div', { style: { fontSize: '12px', color: '#1F6D57', marginTop: '8px', lineHeight: '1.6' } }, parts.join(' — '));
}

const WALLET_TYPE_LABELS = {
  topup: '➕ شحن رصيد', spend: '💳 خصم من الرصيد', earn: '⭐ نقاط من طلب',
  redeem: '🎁 استبدال نقاط', adjust: '🔧 تعديل',
};

/**
 * «التفاصيل الكاملة» للعميل: كل المقاسات + كل الطلبات بتفاصيلها.
 * @param {Object} c — العميل
 * @param {Array} orders — طلبات العميل
 * @param {Function} [onEdit]
 */
async function _openCustomerFullDetails(c, orders, onEdit) {
  let fields = [];
  try {
    const st = await settingsRepo.get();
    fields = Array.isArray(st.measurementFields) ? st.measurementFields : [];
  } catch { fields = []; }

  const measureRows = _customerMeasureRows(c, fields);
  const postureRows = postureLabels(c);
  if (postureRows.length > 0) measureRows.push(_row('🧍', 'القوام', postureRows.join('، ')));

  const statusLabels = { pending: '⏳ قيد الانتظار', in_progress: '🧵 قيد التنفيذ',
    ready: '✅ جاهز', delivered: '📦 تم التسليم', cancelled: '❌ ملغي' };

  const sorted = [...(orders || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const orderBlocks = [];
  for (const [idx, o] of sorted.entries()) {
    let paid = 0;
    try {
      const pays = await paymentsRepo.findByOrder(o.id);
      paid = orderPaidBreakdown(o, pays).paid;
    } catch { paid = Number(o.deposit) || 0; }
    const total = Number(o.amount) || 0;
    const items = _orderItems(o);
    const remainingOrder = Math.max(0, total - paid);
    const orderRows = [
      _row('🔖', 'الحالة', statusLabels[o.status] || o.status || '—'),
      o.createdAt ? _row('📆', 'تاريخ الطلب', formatDate(o.createdAt)) : null,
      o.receivedDate ? _row('🧵', 'استلام القماش', formatDate(o.receivedDate)) : null,
      o.dueDate ? _row('📅', 'تاريخ التسليم', formatDate(o.dueDate)) : null,
      ...items.map((it) => _listItem(it.name,
        it.quantity + ' × ' + formatEGP(it.price) + ' = ' + formatEGP(it.price * it.quantity))),
      el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } }, [
        _stat('الإجمالي', formatEGP(total)),
        _stat('المدفوع', formatEGP(paid), '#2E7D32'),
        _stat('المتبقي', formatEGP(Math.max(0, total - paid)), total - paid > 0 ? '#F57C00' : '#666'),
      ]),
      _orderSnapLine(o),
      o.notes ? el('p', { style: { fontSize: '12px', color: '#666', margin: '8px 0 0', lineHeight: '1.5' } },
        '📝 ' + o.notes) : null,
    ].filter(Boolean);

    /* كل طلب قسم مطويّ بملخصه؛ وضع حصري (واحد مفتوح) وأحدث طلب مفتوح افتراضياً.
       persist:false حتى لا تتراكم معرّفات الطلبات في التخزين. */
    const oc = createCollapsible({
      id: 'qp-corder-' + o.id,
      title: (statusLabels[o.status] || o.status || '—') + (o.createdAt ? ' · ' + formatDate(o.createdAt) : ''),
      summary: 'الإجمالي ' + formatEGP(total) + (remainingOrder > 0 ? ' · المتبقي ' + formatEGP(remainingOrder) : ' · مدفوع'),
      content: el('div', {}, orderRows),
      group: 'qp-corders', persist: false, defaultOpen: idx === 0,
    });
    oc.node.classList.add('collapsible--flat');
    orderBlocks.push(oc.node);
  }

  /* ملف العيلة: رب الأسرة يرى أفراده (مقاساتهم وحسابهم)، والتابع يرى رب أسرته */
  let familyNodes = [];
  try {
    const all = await customersRepo.list();
    const head = c.familyHeadId ? all.find((x) => x.id === c.familyHeadId) : null;
    const members = all.filter((x) => x.familyHeadId === c.id);
    if (head) {
      familyNodes = [_section('👨‍👩‍👧 العيلة'), _row('👤', 'رب الأسرة', head.name)];
    } else if (members.length > 0) {
      const money = async (cust, ords) => {
        const pays = await paymentsRepo.findByCustomer(cust.id);
        const paid = withDepositPayments(pays, ords).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const total = ords.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (Number(o.amount) || 0), 0);
        return { paid, total };
      };
      let sumPaid = 0; let sumTotal = 0;
      const own = await money(c, orders || []);
      sumPaid += own.paid; sumTotal += own.total;
      const memberBlocks = [];
      for (const mem of members) {
        const mo = await ordersRepo.findByCustomer(mem.id);
        const mm = await money(mem, mo);
        sumPaid += mm.paid; sumTotal += mm.total;
        const rows = _customerMeasureRows(mem, fields);
        memberBlocks.push(el('div', {
          style: { border: '1px solid #E5DDD0', borderRadius: '10px', padding: '8px 10px', marginTop: '8px' },
        }, [
          el('div', { style: { fontWeight: '700', color: '#123C2F', fontSize: '13px' } },
            '👤 ' + mem.name + ' · ' + mo.length + ' طلب'),
          ...(rows.length > 0 ? rows : [
            el('div', { style: { fontSize: '12px', color: '#999', padding: '4px 0' } }, 'لا توجد مقاسات مسجلة'),
          ]),
        ]));
      }
      const rem = Math.max(0, sumTotal - sumPaid);
      familyNodes = [
        _section('👨‍👩‍👧 أفراد العيلة (' + members.length + ')'),
        ...memberBlocks,
        _section('💰 حساب العيلة مجمّعاً'),
        el('div', { style: { display: 'flex', gap: '6px' } }, [
          _stat('الإجمالي', formatEGP(sumTotal)),
          _stat('المدفوع', formatEGP(sumPaid), '#2E7D32'),
          _stat('المتبقي', formatEGP(rem), rem > 0 ? '#F57C00' : '#666'),
        ]),
      ];
    }
  } catch (e) { console.warn('[customer family]', e); familyNodes = []; }

  /* الرصيد والنقاط (v3.3.51) */
  let wcust = c;
  try { wcust = (await customersRepo.find(c.id)) || c; } catch { wcust = c; }
  const wal = walletOf(wcust);
  const walletNode = _acc({
    id: 'qp-cust-wallet', title: '💳 الرصيد والنقاط', defaultOpen: wal.balance > 0 || wal.points > 0,
    summary: formatEGP(wal.balance) + ' · ' + wal.points + ' نقطة',
    children: [
      el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } }, [
        _stat('الرصيد', formatEGP(wal.balance), '#1F6D57'),
        _stat('النقاط', String(wal.points), '#B8863B'),
      ]),
      ...(wal.log.length > 0
        ? wal.log.slice(0, 8).map((e) => _listItem(
            (WALLET_TYPE_LABELS[e.type] || e.type) + ' · ' + formatDate(e.at),
            [e.balance ? (e.balance > 0 ? '+' : '−') + formatEGP(Math.abs(e.balance)) : null,
              e.points ? (e.points > 0 ? '+' : '−') + Math.abs(e.points) + ' نقطة' : null,
              e.note || null].filter(Boolean).join(' · ')))
        : [el('div', { style: { fontSize: '12px', color: '#999', padding: '4px 0' } }, 'لا توجد حركات بعد')]),
    ],
  });

  const body = el('div', {}, [
    c.vip ? el('div', { style: { fontSize: '12px', color: '#B8863B', fontWeight: '600', marginBottom: '6px' } },
      '⭐ عميل VIP') : null,
    _row('📞', 'الهاتف', c.phone || '—'),
    c.address ? _row('🏠', 'العنوان', c.address) : null,
    c.notes ? _row('📝', 'ملاحظات', c.notes) : null,
    ...familyNodes,
    walletNode,
    _acc({
      id: 'qp-cust-measures', title: '📏 المقاسات', defaultOpen: true,
      summary: measureRows.length > 0 ? measureRows.length + ' مقاس' : 'لا توجد مقاسات',
      children: measureRows.length > 0 ? measureRows : [
        el('div', { style: { fontSize: '12px', color: '#999', padding: '6px 0' } }, 'لا توجد مقاسات مسجلة لهذا العميل'),
      ],
    }),
    _section('📦 الطلبات (' + sorted.length + ')'),
    ...(orderBlocks.length > 0 ? orderBlocks : [
      el('div', { style: { fontSize: '12px', color: '#999', padding: '6px 0' } }, 'لا توجد طلبات لهذا العميل'),
    ]),
  ].filter(Boolean));

  modal.open({
    title: '👤 ' + c.name + ' — التفاصيل الكاملة',
    body,
    actions: [
      { text: '➕ شحن رصيد', variant: 'primary',
        onClick: async () => {
          modal.close();
          const amt = await _askNumber({ title: 'شحن رصيد — ' + c.name,
            message: 'المبلغ المدفوع مقدّماً. يُخصم من طلبات العميل لاحقاً بزر «💳 خصم من الرصيد» في الطلب.', unit: 'ج.م' });
          if (amt) {
            try { await customersRepo.walletTopUp(c.id, amt); toast.success('تم شحن ' + formatEGP(amt)); }
            catch (e) { toast.danger('تعذّر الشحن: ' + e.message); }
          }
          _openCustomerFullDetails((await customersRepo.find(c.id)) || c, orders, onEdit);
        } },
      onEdit ? { text: '✏️ تعديل', variant: 'secondary', onClick: () => { modal.close(); onEdit(); } } : null,
      _closeAction(),
    ].filter(Boolean),
    closable: true, variant: 'sheet',
  });
}
