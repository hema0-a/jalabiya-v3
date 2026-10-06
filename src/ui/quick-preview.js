/* ==========================================================================
   quick-preview.js — معاينات سريعة موحّدة
   ==========================================================================
   عند النقر على بطاقة (عميل، طلب، دفعة، صنف، عامل) → معاينة فورية.
   جميع الدوال async لتحميل البيانات المرتبطة.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { orders as ordersRepo } from '../data/repos/orders.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';

function row(icon, label, value) {
  return el('div', {
    style: {
      display: 'flex', justifyContent: 'space-between', gap: '8px',
      padding: '6px 0', borderBottom: '1px solid #E5DDD0', fontSize: '13px',
    },
  }, [
    el('span', { style: { color: '#666', flexShrink: '0' } }, icon + ' ' + label),
    el('span', {
      style: { fontWeight: '500', color: '#123C2F', textAlign: 'left', wordBreak: 'break-word' },
    }, String(value ?? '—')),
  ]);
}

function stat(label, value, color = '#123C2F') {
  return el('div', {
    style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' },
  }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, label),
    el('div', { style: { fontSize: '15px', fontWeight: '700', color, marginTop: '2px' } }, String(value)),
  ]);
}

function listItem(text, sub) {
  return el('div', {
    style: { padding: '6px 0', borderBottom: '1px solid #F0EAE0', fontSize: '12px' },
  }, [
    el('div', { style: { color: '#123C2F', fontWeight: '500' } }, text),
    sub ? el('div', { style: { color: '#666', fontSize: '11px', marginTop: '2px' } }, sub) : null,
  ]);
}

function title(text) {
  return el('div', {
    style: {
      fontSize: '13px', fontWeight: '600', color: '#1F6D57',
      margin: '12px 0 6px 0', paddingBottom: '4px', borderBottom: '2px solid #1F6D57',
    },
  }, text);
}

function whatsapp(phone, message) {
  if (!phone) return;
  const url = 'https://wa.me/' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}

export async function previewCustomer(customer, onEdit) {
  if (!customer) return;

  const [orders, payments] = await Promise.all([
    ordersRepo.findByCustomer(customer.id),
    paymentsRepo.findByCustomer(customer.id),
  ]);

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalOrders = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const remaining = Math.max(0, totalOrders - totalPaid);

  const recent = [...orders]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 3);

  const body = el('div', {}, [
    customer.vip ? el('div', {
      style: { fontSize: '12px', color: '#B8863B', fontWeight: '600', marginBottom: '6px' },
    }, '⭐ عميل VIP') : null,
    row('📞', 'الهاتف', customer.phone || '—'),
    customer.notes ? row('📝', 'ملاحظات', customer.notes) : null,
    title('📊 الإحصائيات'),
    el('div', { style: { display: 'flex', gap: '6px' } }, [
      stat('الطلبات', orders.length),
      stat('المدفوع', formatEGP(totalPaid), '#2E7D32'),
      stat('المتبقي', formatEGP(remaining), remaining > 0 ? '#F57C00' : '#666'),
    ]),
    recent.length > 0 ? title('📦 آخر الطلبات') : null,
    ...recent.map((o) => listItem(
      'طلب بقيمة ' + formatEGP(o.amount),
      (o.createdAt ? formatDate(o.createdAt) : '') + (o.notes ? ' · ' + o.notes : '')
    )),
  ]);

  const actions = [
    customer.phone ? {
      text: '📱 واتساب', variant: 'primary',
      onClick: () => whatsapp(customer.phone, 'مرحباً ' + customer.name + '،'),
    } : null,
    onEdit ? {
      text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); },
    } : null,
    { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
  ].filter(Boolean);

  modal.open({ title: '👤 ' + customer.name, body, actions, closable: true });
}

export async function previewOrder(order, customer, onEdit) {
  if (!order) return;

  const payments = await paymentsRepo.findByOrder(order.id);
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const total = Number(order.amount) || 0;
  const remaining = Math.max(0, total - totalPaid);

  const statusLabels = {
    pending: '⏳ قيد الانتظار',
    in_progress: '🧵 قيد التنفيذ',
    ready: '✅ جاهز',
    delivered: '📦 تم التسليم',
    cancelled: '❌ ملغي',
  };

  const body = el('div', {}, [
    row('👤', 'العميل', customer ? customer.name : 'عميل محذوف'),
    customer && customer.phone ? row('📞', 'الهاتف', customer.phone) : null,
    row('🔖', 'الحالة', statusLabels[order.status] || order.status),
    order.dueDate ? row('📅', 'تاريخ التسليم', formatDate(order.dueDate)) : null,
    order.createdAt ? row('📆', 'تاريخ الطلب', formatDate(order.createdAt)) : null,
    title('💰 المبالغ'),
    el('div', { style: { display: 'flex', gap: '6px' } }, [
      stat('الإجمالي', formatEGP(total)),
      stat('المدفوع', formatEGP(totalPaid), '#2E7D32'),
      stat('المتبقي', formatEGP(remaining), remaining > 0 ? '#F57C00' : '#666'),
    ]),
    order.notes ? title('📝 ملاحظات') : null,
    order.notes ? el('p', {
      style: { fontSize: '13px', color: '#666', margin: '0', lineHeight: '1.5' },
    }, order.notes) : null,
  ]);

  const actions = [
    customer && customer.phone ? {
      text: '📱 واتساب', variant: 'primary',
      onClick: () => whatsapp(customer.phone, 'بخصوص طلبك...'),
    } : null,
    onEdit ? {
      text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); },
    } : null,
    { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
  ].filter(Boolean);

  modal.open({
    title: '📋 ' + (customer ? customer.name : 'طلب'),
    body, actions, closable: true,
  });
}

export function previewPayment(payment, customer, onEdit) {
  if (!payment) return;

  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone Cash', other: 'أخرى' };

  const body = el('div', {}, [
    row('👤', 'العميل', customer ? customer.name : 'عميل محذوف'),
    customer && customer.phone ? row('📞', 'الهاتف', customer.phone) : null,
    row('💳', 'طريقة الدفع', methods[payment.method] || 'نقدي'),
    payment.createdAt ? row('📅', 'التاريخ', formatDate(payment.createdAt)) : null,
    payment.notes ? row('📝', 'ملاحظات', payment.notes) : null,
    title('💰 المبلغ'),
    el('div', { style: { textAlign: 'center', padding: '12px', background: '#E8F5E9', borderRadius: '8px' } }, [
      el('div', { style: { fontSize: '22px', fontWeight: '700', color: '#2E7D32' } },
        formatEGP(payment.amount)),
    ]),
  ]);

  const actions = [
    onEdit ? {
      text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); },
    } : null,
    { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
  ].filter(Boolean);

  modal.open({ title: '💰 تفاصيل دفعة', body, actions, closable: true });
}

export function previewInventory(item, onEdit) {
  if (!item) return;

  const cats = { fabric: 'قماش', thread: 'خيوط', accessory: 'إكسسوارات', tool: 'أدوات', other: 'أخرى' };
  const low = Number(item.quantity) < 5;

  const body = el('div', {}, [
    row('📦', 'الفئة', cats[item.category] || 'أخرى'),
    row('🔢', 'الكمية', item.quantity),
    item.unit ? row('📏', 'الوحدة', item.unit) : null,
    title('📊 الحالة'),
    el('div', {
      style: {
        textAlign: 'center', padding: '12px',
        background: low ? '#FFEBEE' : '#E8F5E9', borderRadius: '8px',
      },
    }, [
      el('div', { style: { fontSize: '18px', fontWeight: '700', color: low ? '#C62828' : '#2E7D32' } },
        low ? '⚠️ كمية منخفضة' : '✅ كمية جيدة'),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '4px' } },
        'الحد الأدنى الموصى به: 5'),
    ]),
    item.notes ? row('📝', 'ملاحظات', item.notes) : null,
  ]);

  const actions = [
    onEdit ? {
      text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); },
    } : null,
    { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
  ].filter(Boolean);

  modal.open({ title: '🧵 ' + item.name, body, actions, closable: true });
}

export function previewWorker(worker, onEdit) {
  if (!worker) return;

  const isActive = worker.active !== false;

  const body = el('div', {}, [
    row('👤', 'الدور', worker.role || '—'),
    worker.phone ? row('📞', 'الهاتف', worker.phone) : null,
    worker.salary ? row('💰', 'الراتب', formatEGP(worker.salary)) : null,
    title('📊 الحالة'),
    el('div', {
      style: {
        textAlign: 'center', padding: '12px',
        background: isActive ? '#E8F5E9' : '#F5F5F5', borderRadius: '8px',
      },
    }, [
      el('div', { style: { fontSize: '16px', fontWeight: '600', color: isActive ? '#2E7D32' : '#666' } },
        isActive ? '✅ نشط' : '🚫 معطَّل'),
    ]),
    worker.notes ? row('📝', 'ملاحظات', worker.notes) : null,
  ]);

  const actions = [
    worker.phone ? {
      text: '📱 واتساب', variant: 'primary',
      onClick: () => whatsapp(worker.phone, 'مرحباً ' + worker.name + '،'),
    } : null,
    onEdit ? {
      text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); },
    } : null,
    { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() },
  ].filter(Boolean);

  modal.open({ title: '👷 ' + worker.name, body, actions, closable: true });
}
