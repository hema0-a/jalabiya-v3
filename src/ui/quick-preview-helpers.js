/* ==========================================================================
   quick-preview-helpers.js — أدوات مشتركة للمعاينات السريعة (v3.5.7)
   ==========================================================================
   مقتطع من quick-preview.js دون تغيير منطق. دوال بناء الواجهة المشتركة (صف/صندوق/قائمة/قسم/طيّ/تقدم)،
   وفتح واتساب، وزر الإغلاق، وتحويل الطلب لبنود، ونافذة إدخال الرقم.
   داخلي للحزمة: تستورده وحدات quick-preview-* فقط (الأسماء بشرطة سفلية كما كانت). لا يستورد أي وحدة شقيقة.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { createCollapsible } from './collapsible.js'; /* v3.3.63 */
import { toast } from './toast.js';
import { normalizePhone } from '../core/utils.js';

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
export function _row(icon, label, value) {
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
export function _stat(label, value, color = '#123C2F') {
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
export function _listItem(text, sub, action) {
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
export function _section(text) {
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
export function _acc({ id, title, children, summary, badge, defaultOpen }) {
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
export function _progress(percent) {
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
export function _whatsapp(phone, message) {
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
export function _closeAction() {
  return { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() };
}

/**
 * تحويل الطلب إلى قائمة بنود (يدعم items أو amount القديم).
 * @param {Object} order
 * @returns {Array<{name:string, price:number, quantity:number}>}
 */
export function _orderItems(order) {
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

/**
 * نافذة إدخال رقم (مبلغ/نقاط).. تُرجع الرقم أو null عند الإلغاء.
 * @param {{title:string, message?:string, value?:number, max?:number, unit?:string}} o
 * @returns {Promise<number|null>}
 */
export function _askNumber(o) {
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
