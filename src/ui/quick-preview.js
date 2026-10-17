/* ==========================================================================
   quick-preview.js — معاينات سريعة موحّدة (8 كيانات)
   ==========================================================================
   - يفتح نافذة bottom-sheet على الجوال (variant: 'sheet').
   - يقبل id (نصي) أو كائناً جاهزاً — توافق خلفي كامل.
   - كل دالة async تُرجع Promise<void>.
   - WhatsApp: يطبّع الأرقام لصيغة دولية عبر normalizePhone.
   - static imports للـ helpers، dynamic imports للـ repos الثقيلة.
   ========================================================================== */

import { shareCatalogPage } from './catalog-page-share.js';
import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { createCollapsible } from './collapsible.js'; /* v3.3.63 */
import { toast } from './toast.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';
import { orders as ordersRepo } from '../data/repos/orders.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { customers as customersRepo, walletOf, loyaltyConfig, postureLabels } from '../data/repos/customers.js';
import { settings as settingsRepo } from '../data/repos/settings.js';
import { portfolio as portfolioRepo } from '../data/repos/portfolio.js';
import { commitments as commitmentsRepo } from '../data/repos/commitments.js';
import { commitmentPayments as cpRepo } from '../data/repos/commitment-payments.js';
import { savingsGoals as goalsRepo } from '../data/repos/savings-goals.js';
import { inventory as inventoryRepo, isLowStockItem } from '../data/repos/inventory.js';
import { workers as workersRepo } from '../data/repos/workers.js';
import { workerPayments as wpRepo } from '../data/repos/worker-payments.js';
import { printOrderInvoice } from '../services/invoice-print.js';
import { deliveryProgress } from '../services/partial-delivery.js';
import { shareOrderInvoiceImage } from '../services/invoice-image.js';
import { openDeliveryReceipt } from './delivery-receipt-dialog.js';
import { orderPaidBreakdown, withDepositPayments } from '../services/payments-view.js';

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
 * @param {{label:string, onClick:Function}} [action] — زر صغير تحت العنصر (مثل «🧾 إيصال»)
 * @returns {HTMLElement}
 */
function _listItem(text, sub, action) {
  return el('div', {
    style: { padding: '6px 0', borderBottom: '1px solid #F0EAE0', fontSize: '12px' },
  }, [
    el('div', { style: { color: '#123C2F', fontWeight: '500' } }, text),
    sub ? el('div', { style: { color: '#666', fontSize: '11px', marginTop: '2px' } }, sub) : null,
    action ? el('button', {
      type: 'button', className: 'btn btn--sm btn--ghost',
      style: { marginTop: '4px', padding: '2px 8px', fontSize: '11px' },
      onClick: action.onClick,
    }, action.label) : null,
  ].filter(Boolean));
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
 * قسم قابل للطي داخل نافذة المعاينة (حالته تُحفظ وتنطبق على كل المعاينات).
 * @param {{id:string, title:string, children:Array, summary?:string, badge?:number, defaultOpen?:boolean}} o
 * @returns {HTMLElement}
 */
function _acc({ id, title, children, summary, badge, defaultOpen }) {
  const c = createCollapsible({
    id, title, summary, badge, defaultOpen: !!defaultOpen,
    content: el('div', {}, children.filter(Boolean)),
  });
  c.node.classList.add('collapsible--flat');
  return c.node;
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
  const normalized = normalizePhone(phone);
  const clean = String(normalized).replace(/\D/g, '');
  if (!clean) return;
  window.open('https://wa.me/' + clean + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
}

/**
 * زر إغلاق قياسي.
 * @returns {Object}
 */
function _closeAction() {
  return { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() };
}

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

/**
 * تحويل الطلب إلى قائمة بنود (يدعم items أو amount القديم).
 * @param {Object} order
 * @returns {Array<{name:string, price:number, quantity:number}>}
 */
function _orderItems(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it) => ({
      name: it.name || 'بند',
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
    }));
  }
  return [{
    name: order.notes || order.garmentType || 'طلب جلابية',
    price: Number(order.amount) || 0,
    quantity: Number(order.quantity) || 1,
  }];
}

/* ============================================================
   كتالوج الأسعار للمشاركة (v3.3.51)
   ============================================================ */

/**
 * نافذة مشاركة كتالوج الأسعار: اختيار الأنواع، نص قابل للتعديل، ثم واتساب أو نسخ.
 * @param {Object} [opts]
 * @param {string} [opts.phone] — رقم العميل (لو غير مُمرَّر يفتح واتساب لاختيار جهة اتصال)
 * @param {string} [opts.customerName]
 * @param {Array}  [opts.types] — أنواع الجلابيب (لو غير مُمرَّرة تُقرأ من الإعدادات)
 * @returns {Promise<void>}
 */
export async function shareCatalog(opts = {}) {
  let st = {};
  try { st = await settingsRepo.get(); } catch { st = {}; }
  const ws = (st && st.workshop) || {};
  const all = (Array.isArray(opts.types) ? opts.types : (st.jalabiyaTypes || []))
    .filter((t) => t && t.name && Number(t.price) > 0);

  if (all.length === 0) {
    modal.open({
      title: '📋 كتالوج الأسعار',
      body: el('p', { style: { fontSize: '13px', color: '#666', lineHeight: '1.6' } },
        'لا توجد أنواع بأسعار. أضفها من الإعدادات ← أنواع الجلابيات (الاسم والسعر)، ثم ارجع هنا.'),
      actions: [_closeAction()], closable: true,
    });
    return;
  }

  /* صور الأنواع المربوطة بمعرض الأعمال */
  const picById = new Map();
  try {
    const items = await portfolioRepo.list();
    items.forEach((it) => { if (it && it.id) picById.set(it.id, it); });
  } catch { /* بدون صور */ }
  const picOf = (t) => (t.portfolioId && picById.get(t.portfolioId)) || null;

  const checks = [];
  const area = el('textarea', {
    className: 'textarea', rows: '10',
    style: { width: '100%', fontSize: '13px', lineHeight: '1.7', marginTop: '8px' },
  });

  function build() {
    const lines = [];
    lines.push((opts.customerName ? 'أهلاً ' + opts.customerName + '،\n' : '') +
      '*' + (ws.name || 'ورشة الجلابيب') + '*');
    lines.push('أسعار الجلابيب:');
    checks.forEach(({ cb, t }) => {
      if (cb.checked) lines.push('• ' + t.name + ' — ' + formatEGP(t.price));
    });
    if (ws.pickupHours) lines.push('🕐 مواعيد الاستلام: ' + ws.pickupHours);
    if (ws.phone) lines.push('📞 ' + ws.phone);
    if (ws.address) lines.push('📍 ' + ws.address);
    area.value = lines.join('\n');
  }

  const list = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' },
  });
  all.forEach((t) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = true;
    cb.addEventListener('change', build);
    checks.push({ cb, t });
    list.appendChild(el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '4px 0' },
    }, [cb,
      picOf(t) ? el('img', { src: picOf(t).thumbnail || picOf(t).image, alt: '',
        style: { width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: '0' } }) : null,
      el('span', { style: { flex: '1' } }, t.name),
      el('span', { style: { color: '#B8863B', fontWeight: '600' } }, formatEGP(t.price))].filter(Boolean)));
  });

  const body = el('div', {}, [
    el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '6px' } },
      'اختر الأنواع اللي تظهر للعميل (تغيير الاختيار يعيد كتابة النص):'),
    list,
    area,
  ]);
  build();

  const actions = [
    { text: '📱 واتساب', variant: 'primary',
      onClick: () => {
        const text = area.value;
        if (opts.phone) { _whatsapp(opts.phone, text); return; }
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
      } },
    checks.some(({ t }) => picOf(t)) ? { text: '🖼️ مشاركة بالصور', variant: 'secondary',
      onClick: async () => {
        /* مشاركة النظام (Web Share) هي الطريقة الوحيدة لإرفاق صور بواتساب؛ تُرسل الصور مع النص لأي تطبيق/جهة تختارها */
        const chosen = checks.filter(({ cb, t }) => cb.checked && picOf(t)).slice(0, 10);
        try {
          const files = [];
          for (const { t } of chosen) {
            const it = picOf(t);
            const blob = await (await fetch(it.image || it.thumbnail)).blob();
            const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
            files.push(new File([blob], (t.name || 'jalabiya') + '.' + ext, { type: blob.type || 'image/jpeg' }));
          }
          if (files.length && navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({ files, text: area.value });
            return;
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return;   /* المستخدم ألغى المشاركة */
          console.warn('[catalog share]', e);
        }
        /* المتصفح لا يدعم مشاركة الملفات: نرجع لنص واتساب */
        if (opts.phone) _whatsapp(opts.phone, area.value);
        else window.open('https://wa.me/?text=' + encodeURIComponent(area.value), '_blank', 'noopener,noreferrer');
      } } : null,
    { text: '📄 صفحة كتالوج', variant: 'secondary', action: 'catalog-page',
      onClick: () => shareCatalogPage({
        ws,
        entries: checks.filter(({ cb }) => cb.checked).map(({ t }) => {
          const p = picOf(t);
          return { name: t.name, price: t.price, src: p ? (p.thumbnail || p.image) : '' };
        }),
      }) },
    { text: '📋 نسخ', variant: 'secondary',
      onClick: async () => {
        try { await navigator.clipboard.writeText(area.value); }
        catch { area.select(); try { document.execCommand('copy'); } catch { /* ignore */ } }
      } },
    _closeAction(),
  ].filter(Boolean);
  modal.open({ title: '📋 كتالوج الأسعار', body, actions, closable: true, variant: 'sheet' });
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

/**
 * نافذة إدخال رقم (مبلغ/نقاط).. تُرجع الرقم أو null عند الإلغاء.
 * @param {{title:string, message?:string, value?:number, max?:number, unit?:string}} o
 * @returns {Promise<number|null>}
 */
function _askNumber(o) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const input = el('input', {
      className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal',
      style: { fontSize: '26px', textAlign: 'center', padding: '12px 8px', height: 'auto' },
    });
    if (o.value != null) input.value = String(o.value);
    const body = el('div', {}, [
      o.message ? el('p', { style: { fontSize: '13px', color: '#666', lineHeight: '1.6', margin: '0 0 10px' } }, o.message) : null,
      input,
      o.unit ? el('div', { style: { textAlign: 'center', fontSize: '12px', color: '#666', marginTop: '6px' } }, o.unit) : null,
    ].filter(Boolean));
    const ok = () => {
      const n = Number(input.value);
      if (!(n > 0)) { toast.warning('أدخل رقماً أكبر من صفر'); return; }
      if (o.max != null && n > o.max) { toast.warning('الحد الأقصى ' + o.max); return; }
      finish(n); handle.close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    const handle = modal.open({
      title: o.title, body, closable: true,
      onClose: () => finish(null),
      actions: [
        { text: 'تأكيد', variant: 'primary', onClick: ok },
        { text: 'إلغاء', variant: 'ghost', onClick: () => { finish(null); handle.close(); } },
      ],
    });
    setTimeout(() => { try { input.focus(); input.select(); } catch { /* ignore */ } }, 60);
  });
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
