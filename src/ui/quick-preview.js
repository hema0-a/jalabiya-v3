/* ==========================================================================
   quick-preview.js — معاينات سريعة موحّدة (6 كيانات)
   ==========================================================================
   - يفتح نافذة bottom-sheet على الجوال (variant: 'sheet').
   - يقبل id (نصي) أو كائناً جاهزاً — توافق خلفي كامل.
   - كل دالة async تُرجع Promise<void>.
   - Static imports فقط. JSDoc عربي.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { orders as ordersRepo } from '../data/repos/orders.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { customers as customersRepo } from '../data/repos/customers.js';
import { commitments as commitmentsRepo } from '../data/repos/commitments.js';
import { commitmentPayments as cpRepo } from '../data/repos/commitment-payments.js';
import { savingsGoals as goalsRepo } from '../data/repos/savings-goals.js';
import { portfolio as portfolioRepo } from '../data/repos/portfolio.js';

/* ============================================================
   1. Helpers
   ============================================================ */

/**
 * صف معلومة (icon + label + value).
 * @param {string} icon
 * @param {string} label
 * @param {*} value
 * @returns {HTMLElement}
 */
function _row(icon, label, value) {
  return el('div', {
    style: { display: 'flex', justifyContent: 'space-between', gap: '8px',
      padding: '6px 0', borderBottom: '1px solid #E5DDD0', fontSize: '13px' },
  }, [
    el('span', { style: { color: '#666', flexShrink: '0' } }, icon + ' ' + label),
    el('span', { style: { fontWeight: '500', color: '#123C2F', textAlign: 'left', wordBreak: 'break-word' } },
      String(value ?? '—')),
  ]);
}

/**
 * صندوق إحصائي صغير.
 * @param {string} label
 * @param {string|number} value
 * @param {string} [color='#123C2F']
 * @returns {HTMLElement}
 */
function _stat(label, value, color = '#123C2F') {
  return el('div', {
    style: { flex: '1', textAlign: 'center', padding: '8px 4px',
      background: '#F6F1E6', borderRadius: '8px' },
  }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, label),
    el('div', { style: { fontSize: '15px', fontWeight: '700', color, marginTop: '2px' } }, String(value)),
  ]);
}

/**
 * عنصر في قائمة فرعية.
 * @param {string} text
 * @param {string} [sub]
 * @returns {HTMLElement}
 */
function _listItem(text, sub) {
  return el('div', {
    style: { padding: '6px 0', borderBottom: '1px solid #F0EAE0', fontSize: '12px' },
  }, [
    el('div', { style: { color: '#123C2F', fontWeight: '500' } }, text),
    sub ? el('div', { style: { color: '#666', fontSize: '11px', marginTop: '2px' } }, sub) : null,
  ]);
}

/**
 * عنوان قسم داخل المعاينة.
 * @param {string} text
 * @returns {HTMLElement}
 */
function _section(text) {
  return el('div', {
    style: { fontSize: '13px', fontWeight: '600', color: '#1F6D57',
      margin: '12px 0 6px 0', paddingBottom: '4px', borderBottom: '2px solid #1F6D57' },
  }, text);
}

/**
 * شريط تقدم مرئي (0-100).
 * @param {number} percent
 * @returns {HTMLElement}
 */
function _progress(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return el('div', {
    style: { background: '#E5DDD0', height: '10px', borderRadius: '5px', overflow: 'hidden' },
  }, [
    el('div', {
      style: { width: p + '%', height: '100%',
        background: p >= 100 ? '#2E7D32' : 'linear-gradient(90deg,#4CAF50,#2E7D32)',
        transition: 'width 0.4s' },
    }),
  ]);
}

/**
 * فتح واتساب في تبويب جديد.
 * @param {string} phone
 * @param {string} message
 */
function _whatsapp(phone, message) {
  if (!phone) return;
  const clean = String(phone).replace(/\D/g, '');
  if (!clean) return;
  window.open('https://wa.me/' + clean + '?text=' + encodeURIComponent(message), '_blank');
}

/**
 * زر إغلاق قياسي.
 * @returns {Object}
 */
function _closeAction() {
  return { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() };
}

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
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalOrders = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
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
      onClick: () => { modal.close(); location.hash = '#/customers'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '👤 ' + c.name, body, actions, closable: true, variant: 'sheet' });
}

/* ============================================================
   3. previewOrder
   ============================================================ */

/**
 * معاينة سريعة لطلب.
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
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const total = Number(order.amount) || 0;
  const remaining = Math.max(0, total - totalPaid);

  const statusLabels = { pending: '⏳ قيد الانتظار', in_progress: '🧵 قيد التنفيذ',
    ready: '✅ جاهز', delivered: '📦 تم التسليم', cancelled: '❌ ملغي' };

  const body = el('div', {}, [
    _row('👤', 'العميل', customer ? customer.name : 'عميل محذوف'),
    customer && customer.phone ? _row('📞', 'الهاتف', customer.phone) : null,
    _row('🔖', 'الحالة', statusLabels[order.status] || order.status),
    order.dueDate ? _row('📅', 'تاريخ التسليم', formatDate(order.dueDate)) : null,
    order.createdAt ? _row('📆', 'تاريخ الطلب', formatDate(order.createdAt)) : null,
    _section('💰 المبالغ'),
    el('div', { style: { display: 'flex', gap: '6px' } }, [
      _stat('الإجمالي', formatEGP(total)),
      _stat('المدفوع', formatEGP(totalPaid), '#2E7D32'),
      _stat('المتبقي', formatEGP(remaining), remaining > 0 ? '#F57C00' : '#666'),
    ]),
    order.notes ? _section('📝 ملاحظات') : null,
    order.notes ? el('p', { style: { fontSize: '13px', color: '#666', margin: '0', lineHeight: '1.5' } }, order.notes) : null,
  ]);

  const actions = [
    customer && customer.phone ? { text: '📱 واتساب', variant: 'primary',
      onClick: () => _whatsapp(customer.phone, 'بخصوص طلبك #' + String(order.id).slice(-6)) } : null,
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/orders'; } },
    editCb ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); editCb(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '📋 ' + (customer ? customer.name : 'طلب'), body, actions, closable: true, variant: 'sheet' });
}

/* ============================================================
   4. previewPayment
   ============================================================ */

/**
 * معاينة سريعة لدفعة.
 * @param {string|Object} idOrObj
 * @param {Object|Function} [customerOrOnEdit]
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewPayment(idOrObj, customerOrOnEdit, onEdit) {
  let payment, customer, editCb;
  if (typeof idOrObj === 'string') {
    payment = await paymentsRepo.find(idOrObj);
    customer = (payment && payment.customerId) ? await customersRepo.find(payment.customerId) : null;
    editCb = customerOrOnEdit;
  } else {
    payment = idOrObj;
    customer = customerOrOnEdit;
    editCb = onEdit;
  }
  if (!payment) return;

  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone Cash', other: 'أخرى' };

  const body = el('div', {}, [
    _row('👤', 'العميل', customer ? customer.name : 'عميل محذوف'),
    customer && customer.phone ? _row('📞', 'الهاتف', customer.phone) : null,
    _row('💳', 'طريقة الدفع', methods[payment.method] || 'نقدي'),
    payment.createdAt ? _row('📅', 'التاريخ', formatDate(payment.createdAt)) : null,
    payment.notes ? _row('📝', 'ملاحظات', payment.notes) : null,
    _section('💰 المبلغ'),
    el('div', { style: { textAlign: 'center', padding: '12px', background: '#E8F5E9', borderRadius: '8px' } }, [
      el('div', { style: { fontSize: '22px', fontWeight: '700', color: '#2E7D32' } }, formatEGP(payment.amount)),
    ]),
  ]);

  const actions = [
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/payments'; } },
    editCb ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); editCb(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '💰 تفاصيل دفعة', body, actions, closable: true, variant: 'sheet' });
}

/* ============================================================
   5. previewCommitment
   ============================================================ */

/**
 * معاينة سريعة لالتزام.
 * @param {string|Object} idOrObj
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewCommitment(idOrObj, onEdit) {
  const c = (typeof idOrObj === 'string') ? await commitmentsRepo.find(idOrObj) : idOrObj;
  if (!c) return;

  const payments = await cpRepo.listByCommitment(c.id);
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const amount = Number(c.amount) || 0;
  const remaining = Math.max(0, amount - totalPaid);
  const percent = amount > 0 ? Math.round((totalPaid / amount) * 100) : 0;
  const recent = [...payments].sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 3);

  const freqLabels = { monthly: 'شهري', quarterly: 'كل 3 شهور', semi_annual: 'كل 6 شهور',
    annual: 'سنوي', weekly: 'أسبوعي', once: 'مرة واحدة' };

  const body = el('div', {}, [
    _row('📂', 'التصنيف', c.category || '—'),
    _row('💰', 'المبلغ', formatEGP(amount)),
    _row('🔄', 'الدورية', freqLabels[c.frequency] || c.frequency || '—'),
    c.dueDay ? _row('📅', 'يوم الاستحقاق', c.dueDay) : null,
    _row('🔖', 'الحالة', c.active === false ? '⏸️ غير نشط' : '✅ نشط'),
    _section('📊 التقدم'),
    _progress(percent),
    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: '4px' } }, [
      el('span', {}, 'مدفوع: ' + formatEGP(totalPaid)),
      el('span', {}, 'متبقي: ' + formatEGP(remaining)),
    ]),
    recent.length > 0 ? _section('📜 آخر الدفعات') : null,
    ...recent.map((p) => _listItem(formatEGP(p.amount), formatDate(p.date) + (p.notes ? ' · ' + p.notes : ''))),
  ]);

  const actions = [
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/commitments'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '💳 ' + (c.name || 'التزام'), body, actions, closable: true, variant: 'sheet' });
}

/* ============================================================
   6. previewGoal
   ============================================================ */

/**
 * معاينة سريعة لهدف ادخار.
 * @param {string|Object} idOrObj
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewGoal(idOrObj, onEdit) {
  const g = (typeof idOrObj === 'string') ? await goalsRepo.find(idOrObj) : idOrObj;
  if (!g) return;

  const target = Number(g.targetAmount) || 0;
  const current = Number(g.currentAmount) || 0;
  const remaining = Math.max(0, target - current);
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  const body = el('div', {}, [
    _row('🎯', 'الهدف', formatEGP(target)),
    _row('💵', 'المُدّخر', formatEGP(current)),
    _row('⏳', 'المتبقي', formatEGP(remaining)),
    g.notes ? _row('📝', 'ملاحظات', g.notes) : null,
    _section('📊 نسبة التقدم — ' + percent + '%'),
    _progress(percent),
  ]);

  const actions = [
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/commitments'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '🏦 ' + (g.name || 'هدف'), body, actions, closable: true, variant: 'sheet' });
}

/* ============================================================
   7. previewPortfolio
   ============================================================ */

/**
 * معاينة سريعة لعمل في المعرض.
 * @param {string|Object} idOrObj
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewPortfolio(idOrObj, onEdit) {
  const p = (typeof idOrObj === 'string') ? await portfolioRepo.find(idOrObj) : idOrObj;
  if (!p) return;

  const cats = { men: 'رجالي', women: 'نسائي', kids: 'أطفال', embroidery: 'تطريز',
    summer: 'صيفي', winter: 'شتوي', wedding: 'زفاف', other: 'أخرى' };
  const image = p.image || p.thumbnail;

  const body = el('div', {}, [
    image ? el('img', {
      src: image, alt: p.title || '',
      style: { width: '100%', borderRadius: '12px', marginBottom: '12px', display: 'block' },
    }) : null,
    _row('📸', 'العنوان', p.title || '—'),
    _row('🏷️', 'التصنيف', cats[p.category] || p.category || '—'),
    p.price ? _row('💰', 'السعر', formatEGP(p.price)) : null,
    p.createdAt ? _row('📅', 'التاريخ', formatDate(p.createdAt)) : null,
    p.note ? _row('📝', 'ملاحظات', p.note) : null,
  ]);

  const actions = [
    { text: '💬 مشاركة واتساب', variant: 'primary',
      onClick: () => {
        const text = '🌟 ' + (p.title || '') + '\n' +
          (cats[p.category] || '') + (p.price ? '\n💰 ' + formatEGP(p.price) : '') + '\n\nللتواصل:';
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      } },
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/portfolio'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '🖼️ ' + (p.title || 'عمل'), body, actions, closable: true, variant: 'sheet' });
}
