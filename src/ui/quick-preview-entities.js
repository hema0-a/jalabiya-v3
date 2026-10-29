/* ==========================================================================
   quick-preview-entities.js — معاينات الكيانات الستة الأخرى (v3.5.7)
   ==========================================================================
   مقتطع من quick-preview.js دون تغيير منطق: previewPayment · previewCommitment · previewGoal
   · previewPortfolio · previewInventory · previewWorker (ملف واحد بقرار الخطة).
   يستورد quick-preview-helpers فقط.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { customers as customersRepo } from '../data/repos/customers.js';
import { portfolio as portfolioRepo } from '../data/repos/portfolio.js';
import { commitments as commitmentsRepo } from '../data/repos/commitments.js';
import { commitmentPayments as cpRepo } from '../data/repos/commitment-payments.js';
import { savingsGoals as goalsRepo } from '../data/repos/savings-goals.js';
import { inventory as inventoryRepo, isLowStockItem } from '../data/repos/inventory.js';
import { workers as workersRepo } from '../data/repos/workers.js';
import { workerPayments as wpRepo } from '../data/repos/worker-payments.js';
import { _row, _stat, _listItem, _section, _progress, _whatsapp, _closeAction } from './quick-preview-helpers.js';

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
 * @param {Function} [onDetails] — لو مُمرَّرة يفتح «التفاصيل الكاملة» بها بدل الانتقال للصفحة (v3.3.33)
 * @returns {Promise<void>}
 */
export async function previewPortfolio(idOrObj, onEdit, onDetails) {
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
  ].filter(Boolean));

  const actions = [
    { text: '💬 مشاركة واتساب', variant: 'primary',
      onClick: () => {
        const text = '🌟 ' + (p.title || '') + '\n' +
          (cats[p.category] || '') + (p.price ? '\n💰 ' + formatEGP(p.price) : '') + '\n\nللتواصل:';
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
      } },
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); if (typeof onDetails === 'function') onDetails(); else location.hash = '#/portfolio'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({ title: '🖼️ ' + (p.title || 'عمل'), body, actions, closable: true, variant: 'sheet' });
}

/* ============================================================
   8. previewInventory
   ============================================================ */

/**
 * معاينة سريعة لصنف مخزون.
 * @param {string|Object} idOrObj — id الصنف أو كائن جاهز
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewInventory(idOrObj, onEdit) {
  const item = (typeof idOrObj === 'string') ? await inventoryRepo.find(idOrObj) : idOrObj;
  if (!item) return;

  const cats = {
    fabric: 'قماش', thread: 'خيوط', accessory: 'إكسسوارات',
    button: 'أزرار', tool: 'أدوات', dye: 'صباغة', other: 'أخرى',
  };
  const low = isLowStockItem(item, await inventoryRepo.getGlobalThreshold());

  const body = el('div', {}, [
    _row('📦', 'الفئة', cats[item.category] || 'أخرى'),
    _row('🔢', 'الكمية', item.quantity),
    item.minQuantity ? _row('📊', 'الحد الأدنى', item.minQuantity) : null,
    item.price ? _row('💰', 'سعر الوحدة', formatEGP(item.price)) : null,
    item.unit ? _row('📏', 'الوحدة', item.unit) : null,
    item.notes ? _row('📝', 'ملاحظات', item.notes) : null,
    _section('📊 الحالة'),
    el('div', {
      style: {
        textAlign: 'center', padding: '12px',
        background: low ? '#FFEBEE' : '#E8F5E9', borderRadius: '8px',
      },
    }, [
      el('div', {
        style: {
          fontSize: '18px', fontWeight: '700',
          color: low ? '#C62828' : '#2E7D32',
        },
      }, low ? '⚠️ كمية منخفضة' : '✅ كمية جيدة'),
    ]),
  ].filter(Boolean));

  const actions = [
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/inventory'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({
    title: '🧵 ' + (item.name || 'صنف'),
    body, actions, closable: true, variant: 'sheet',
  });
}

/* ============================================================
   9. previewWorker
   ============================================================ */

/**
 * معاينة سريعة لعامل (تخصص، راتب، حالة، دفعات).
 * @param {string|Object} idOrObj — id العامل أو كائن جاهز
 * @param {Function} [onEdit]
 * @returns {Promise<void>}
 */
export async function previewWorker(idOrObj, onEdit) {
  const w = (typeof idOrObj === 'string') ? await workersRepo.find(idOrObj) : idOrObj;
  if (!w) return;

  const isActive = w.active !== false;

  const salaryTypes = {
    fixed:     { label: 'ثابت شهري', icon: '📅' },
    per_piece: { label: 'بالقطعة',   icon: '👕' },
    daily:     { label: 'يومي',      icon: '📆' },
    hourly:    { label: 'ساعي',      icon: '⏱️' },
  };
  const st = salaryTypes[w.salaryType] || salaryTypes.fixed;

  let paymentsCount = 0;
  let totalPaid = 0;
  try {
    const payments = await wpRepo.listByWorker(w.id);
    paymentsCount = payments.length;
    totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  } catch { /* ignore */ }

  const body = el('div', {}, [
    w.specialty ? _row('👷', 'التخصص', w.specialty) : null,
    w.phone ? _row('📞', 'الهاتف', w.phone) : null,
    _row('💼', 'نوع الأجر', st.icon + ' ' + st.label),
    w.salary ? _row('💰', 'قيمة الأجر', formatEGP(w.salary)) : null,
    _row('🔖', 'الحالة', isActive ? '✅ نشط' : '🚫 معطَّل'),
    w.notes ? _row('📝', 'ملاحظات', w.notes) : null,

    paymentsCount > 0 ? _section('💵 الدفعات') : null,
    paymentsCount > 0 ? el('div', {
      style: { display: 'flex', gap: '6px' },
    }, [
      _stat('عدد الدفعات', paymentsCount),
      _stat('إجمالي مدفوع', formatEGP(totalPaid), '#2E7D32'),
    ]) : null,
  ].filter(Boolean));

  const actions = [
    w.phone ? { text: '📱 واتساب', variant: 'primary',
      onClick: () => _whatsapp(w.phone, 'مرحباً ' + w.name + '،') } : null,
    { text: 'التفاصيل الكاملة', variant: 'secondary',
      onClick: () => { modal.close(); location.hash = '#/workers'; } },
    onEdit ? { text: '✏️ تعديل', variant: 'secondary',
      onClick: () => { modal.close(); onEdit(); } } : null,
    _closeAction(),
  ].filter(Boolean);

  modal.open({
    title: '👷 ' + (w.name || 'عامل'),
    body, actions, closable: true, variant: 'sheet',
  });
}
