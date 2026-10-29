/* ==========================================================================
   customers-actions.js — إجراءات العميل: حذف · VIP · كشف الحساب · عرض الصورة · تصدير جهات الاتصال (v3.5.8)
   ==========================================================================
   التواصل مع الصفحة عبر ctx صريح { state, refresh, openForm }. لا استيراد من المدخل.
   ========================================================================== */

import { el } from '../core/dom.js';
import { customers, buildContactsVcf } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { quotes } from '../data/repos/quotes.js';
import { appointments } from '../data/repos/appointments.js';
import { trash } from '../data/repos/trash.js';
import { settings } from '../data/repos/settings.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { printCustomerStatement } from '../services/invoice-print.js';
import { shareCustomerStatementImage } from '../services/invoice-image.js';

/**
 * تصدير العملاء كملف جهات اتصال (vCard) يُفتح في الموبايل فتظهر الأسماء في واتساب والمكالمات (v3.3.51).
 */
export async function openContactsExport(ctx) {
  let prefix = 'ورشة';
  try {
    const st = await settings.get();
    const n = st && st.workshop && st.workshop.name ? String(st.workshop.name).trim() : '';
    if (n) prefix = n;
  } catch { /* الافتراضي */ }

  const list = ctx.state.customers;
  const prefixInput = el('input', { className: 'input', type: 'text', value: prefix, placeholder: 'ورشة' });
  const info = el('div', { style: { fontSize: '13px', color: '#123C2F', lineHeight: '1.7', marginTop: '10px' } });
  const refreshInfo = () => {
    const r = buildContactsVcf(list, { prefix: prefixInput.value });
    const sample = list.find((c) => c && c.name && c.phone);
    info.textContent = '📇 ' + r.count + ' جهة اتصال جاهزة'
      + (r.skippedNoPhone ? ' · ' + r.skippedNoPhone + ' عميل بلا رقم (لن يُصدَّروا)' : '')
      + (r.skippedDuplicate ? ' · ' + r.skippedDuplicate + ' رقم مكرر' : '')
      + (sample ? '\nمثال: «' + (prefixInput.value.trim() ? prefixInput.value.trim() + ' - ' : '') + sample.name + '»' : '');
    info.style.whiteSpace = 'pre-line';
  };
  prefixInput.addEventListener('input', refreshInfo);
  refreshInfo();

  const body = el('div', {}, [
    el('p', { style: { fontSize: '13px', color: '#666', lineHeight: '1.6', margin: '0 0 8px' } },
      'ينتج ملف جهات اتصال تفتحه في الموبايل فيحفظ الأسماء، فيظهر اسم العميل في واتساب والمكالمات بدل رقم مجهول. اكتب البادئة اللي تحب تتميّز بيها (أو اتركها فاضية).'),
    el('label', { className: 'field__label' }, 'البادئة قبل الاسم'),
    prefixInput,
    info,
  ]);

  const handle = modal.open({
    title: '📇 تصدير جهات الاتصال', body, closable: true,
    actions: [
      { text: '⬇️ تنزيل الملف', variant: 'primary',
        onClick: () => {
          const r = buildContactsVcf(list, { prefix: prefixInput.value });
          if (r.count === 0) { toast.warning('لا يوجد عملاء لهم أرقام هاتف'); return; }
          const blob = new Blob([r.vcf], { type: 'text/vcard;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'jalabiya-contacts.vcf';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          toast.success('تم تنزيل ' + r.count + ' جهة اتصال — افتح الملف من التنزيلات لاستيرادها');
          handle.close();
        } },
      { text: 'إغلاق', variant: 'ghost', onClick: () => handle.close() },
    ],
  });
}

/* ==========================================================================
   5. حذف + VIP + طباعة
   ========================================================================== */

export async function deleteCustomer(ctx, customer) {
  /* v3.3.82: حين الدفتر مرجع لا يُحذف عميل له رصيد/نقاط (كان هذا يُضيّع المال — يظهر كحساب يتيم في الدفتر) */
  const chk = await customers.canDelete(customer.id);
  if (!chk.ok) { toast.warning(chk.reason); return; }
  /* تنبيه بالسجلات المرتبطة: تبقى في التطبيق بلا اسم عميل حتى يُسترجع من السلة */
  let linkedNote = '';
  try {
    const [co, cp, cq, ca] = await Promise.all([
      orders.findByCustomer(customer.id),
      payments.findByCustomer(customer.id),
      quotes.findByIndex('by_customerId', customer.id),
      appointments.findByCustomer(customer.id),
    ]);
    /* أفراد العائلة المرتبطون به كرب عائلة (كانوا يبقون مشيرين لعميل محذوف بلا تنبيه) */
    const fam = ctx.state.customers.filter((x) => x.familyHeadId === customer.id).length;
    if (co.length > 0 || cp.length > 0 || cq.length > 0 || ca.length > 0 || fam > 0) {
      linkedNote = '\n\n⚠️ له ' + co.length + ' طلب و' + cp.length +
        ' دفعة' + (cq.length ? ' و' + cq.length + ' عرض سعر' : '') + (ca.length ? ' و' + ca.length + ' موعد' : '') +
        ' ستبقى في التطبيق دون اسم عميل.' +
        (fam ? '\n👨‍👩‍👧 ويرتبط به ' + fam + ' من أفراد العائلة (سيبقون بلا رب عائلة).' : '') +
        '\nيمكنك استرجاعه من سلة المحذوفات لإعادة الربط.';
    }
  } catch (e) { /* نكمل بدون التنبيه */ }
  const ok = await modal.confirm({
    title: 'حذف عميل',
    message: 'هل أنت متأكد من حذف "' + customer.name + '"؟' + linkedNote,
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('customers', customer);
    await customers.remove(customer.id);
    toast.success('تم الحذف');
    await ctx.refresh();
  } catch (err) { toast.danger('فشل الحذف: ' + err.message); }
}

export async function toggleVIP(ctx, customer) {
  try {
    const updated = await customers.toggleVIP(customer.id);
    if (updated && updated.vip) toast.info('تم تعيينه كعميل VIP');
    else toast.info('تم إزالة تصنيف VIP');
    await ctx.refresh();
  } catch (err) { toast.danger('فشل التغيير: ' + err.message); }
}

export async function printStatement(customer) {
  try {
    toast.info('جارٍ تجهيز الكشف...');
    const [ordersList, paymentsList] = await Promise.all([
      orders.findByCustomer(customer.id),
      payments.findByCustomer(customer.id),
    ]);
    await printCustomerStatement(customer, ordersList, paymentsList);
  } catch (err) {
    console.error('[printStatement]', err);
    toast.danger('فشل فتح نافذة الطباعة');
  }
}

/** مشاركة كشف الحساب كصورة (واتساب): قائمة المشاركة على الجوال، أو تنزيل الصورة كبديل. */
export async function shareStatementImage(customer) {
  try {
    toast.info('جارٍ تجهيز الصورة...');
    const [ordersList, paymentsList] = await Promise.all([
      orders.findByCustomer(customer.id),
      payments.findByCustomer(customer.id),
    ]);
    const r = await shareCustomerStatementImage(customer, ordersList, paymentsList);
    if (r === 'downloaded') toast.info('تم حفظ صورة الكشف — أرفقها في محادثة واتساب');
  } catch (err) {
    console.error('[shareStatementImage]', err);
    toast.danger('تعذّر إنشاء صورة الكشف');
  }
}

/* ==========================================================================
   6. عرض صورة العميل (lightbox)
   ========================================================================== */

export function showCustomerImage(dataUrl, name) {
  if (!dataUrl) return;
  const body = el('div', {}, [
    el('img', {
      src: dataUrl, alt: name,
      style: { width: '100%', maxHeight: '70vh', objectFit: 'contain',
        borderRadius: '12px', background: '#fff' },
    }),
    el('div', {
      style: { fontSize: '13px', textAlign: 'center', marginTop: '8px', color: '#666' },
    }, '👤 ' + (name || 'عميل')),
  ]);
  modal.open({
    title: 'صورة العميل', body, closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}
