/* ==========================================================================
   customer-picker.js — اختيار العميل بالبحث (v3.3.61)
   ==========================================================================
   كانت نماذج الطلب والدفعة والموعد وعرض السعر تعرض كل العملاء في <select> عادي؛
   مع مئات العملاء يصبح التمرير فيه بطيئاً ومرهقاً على الجوال.
   الآن حقل بنفس الشكل يفتح نافذة بحث: اكتب جزءاً من الاسم أو الهاتف فتتضيّق القائمة.
   - البحث يتجاهل التشكيل والتطويل واختلاف الهمزات (أ/إ/آ/ا) و(ى/ي) و(ة/ه)
     ويقبل الأرقام العربية والهندية، ويطابق الاسم بكلمات متفرقة («محمد علي» يجد «علي محمد»).
   - إدخال أرقام فقط = بحث بالهاتف (أي جزء من الرقم).
   - العنصر المُرجَع يحمل value (قراءة/كتابة) ويُطلق حدث change عند اختيار المستخدم،
     فيعمل في مكان الـ<select> القديم بلا تغيير في بقية الكود.
   ========================================================================== */

import { el } from '../core/dom.js';
import { normalizeSearch } from '../core/utils.js';
import { modal } from './modal.js';

const RESULT_LIMIT = 60;

/** تطبيع نص للبحث (مصدر واحد في core/utils.js؛ يُعاد تصديره للتوافق). */
export { normalizeSearch };

const digitsOf = (s) => normalizeSearch(s).replace(/\D/g, '');

/**
 * تصفية العملاء. بلا استعلام: كل العملاء مرتّبين بالاسم.
 * @param {Array<{id:string,name:string,phone?:string}>} customers
 * @param {string} query
 * @param {number} [limit]
 * @returns {{items:Array, total:number}} total = عدد المطابقات الكلي (قبل القصّ)
 */
export function filterCustomers(customers, query, limit = RESULT_LIMIT) {
  const list = Array.isArray(customers) ? customers.filter((c) => c && c.id != null) : [];
  const q = normalizeSearch(query);
  if (!q) {
    const sorted = [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    return { items: sorted.slice(0, limit), total: sorted.length };
  }
  const phoneMode = /^[\d\s+\-]+$/.test(q);
  const qDigits = q.replace(/\D/g, '');
  const terms = q.split(' ').filter(Boolean);
  const scored = [];
  list.forEach((c, idx) => {
    const name = normalizeSearch(c.name);
    const phone = digitsOf(c.phone);
    let score = null;
    if (phoneMode) {
      if (qDigits.length >= 2 && phone.includes(qDigits)) score = phone.endsWith(qDigits) ? 0 : 1;
    } else if (terms.every((t) => name.includes(t))) {
      score = name.startsWith(terms[0]) ? 0 : name.split(' ').some((w) => w.startsWith(terms[0])) ? 1 : 2;
    }
    if (score === null && !phoneMode && qDigits.length >= 4 && qDigits.length === q.replace(/\s/g, '').length && phone.includes(qDigits)) score = 3;
    if (score !== null) scored.push({ c, score, idx, name });
  });
  scored.sort((a, b) => (a.score - b.score) || a.name.localeCompare(b.name, 'ar') || (a.idx - b.idx));
  return { items: scored.slice(0, limit).map((x) => x.c), total: scored.length };
}

const labelOf = (c) => String(c.name || 'بلا اسم') + (c.phone ? ' (' + c.phone + ')' : '');

/**
 * @param {Object} opts
 * @param {Array} opts.customers
 * @param {string} [opts.value] — معرّف العميل المختار مبدئياً
 * @param {string} [opts.placeholder]
 * @param {string} [opts.title]
 * @param {Function} [opts.onChange] — (id) عند اختيار المستخدم
 * @returns {HTMLElement} عنصر بخاصية value (قراءة/كتابة) وحدث change
 */
export function createCustomerPicker(opts = {}) {
  const customers = Array.isArray(opts.customers) ? opts.customers : [];
  const placeholder = opts.placeholder || '— اختر عميلاً —';
  const byId = new Map(customers.filter((c) => c && c.id != null).map((c) => [String(c.id), c]));
  let current = '';

  const label = el('span', { style: { flex: '1', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
  const btn = el('button', {
    type: 'button', className: 'select', 'aria-haspopup': 'dialog',
    style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'right', cursor: 'pointer' },
  }, [label, el('span', { 'aria-hidden': 'true' }, '🔍')]);
  const wrap = el('div', { 'data-role': 'customer-picker' }, [btn]);

  const paint = () => {
    const c = current ? byId.get(current) : null;
    label.textContent = c ? labelOf(c) : placeholder;
    label.style.color = c ? '' : '#888';
  };
  const setValue = (v) => {
    const id = v === undefined || v === null ? '' : String(v);
    current = byId.has(id) ? id : '';
    paint();
  };
  Object.defineProperty(wrap, 'value', { get: () => current, set: setValue, configurable: true });
  setValue(opts.value);

  const open = () => {
    const input = el('input', {
      type: 'search', className: 'input', autocomplete: 'off', enterkeyhint: 'search',
      placeholder: 'ابحث بالاسم أو رقم الهاتف...', 'aria-label': 'بحث عن عميل',
    });
    const status = el('div', { role: 'status', style: { fontSize: '12px', color: '#666', margin: '8px 2px' } });
    const list = el('div', { style: { maxHeight: '50vh', overflowY: 'auto' } });
    const body = el('div', {}, [input, status, list]);
    let handle = null;
    let shown = [];

    const choose = (id) => {
      setValue(id);
      if (handle) handle.close();
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof opts.onChange === 'function') opts.onChange(current);
    };
    const render = () => {
      const { items, total } = filterCustomers(customers, input.value);
      shown = items;
      list.textContent = '';
      if (customers.length === 0) status.textContent = 'لا يوجد عملاء بعد — أضف عميلاً من صفحة العملاء';
      else if (total === 0) status.textContent = 'لا يوجد عميل بهذا الاسم أو الرقم — أضفه من صفحة العملاء';
      else status.textContent = total > items.length
        ? 'يُعرض أول ' + items.length + ' من ' + total + ' — اكتب أكثر للتضييق'
        : total + ' عميل';
      items.forEach((c) => {
        const selected = String(c.id) === current;
        list.appendChild(el('button', {
          type: 'button', 'data-customer-id': String(c.id),
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%',
            padding: '11px 8px', background: selected ? '#E8F5E9' : 'transparent', border: '0',
            borderBottom: '1px solid #EFE7D8', textAlign: 'right', cursor: 'pointer', font: 'inherit', color: 'inherit',
          },
          onClick: () => choose(c.id),
        }, [
          el('span', { style: { fontWeight: '600', color: '#123C2F' } }, (selected ? '✓ ' : '') + String(c.name || 'بلا اسم')),
          el('span', { style: { fontSize: '12px', color: '#666', direction: 'ltr' } }, c.phone || ''),
        ]));
      });
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (shown.length > 0) choose(shown[0].id); }
    });
    render();

    handle = modal.open({
      title: opts.title || '👥 اختر العميل', body, closable: true,
      actions: [{ text: 'إلغاء', variant: 'ghost', onClick: () => handle.close() }],
    });
    setTimeout(() => { try { input.focus(); } catch (e) { /* ignore */ } }, 120);
  };
  btn.addEventListener('click', open);
  return wrap;
}
