/* ==========================================================================
   aftercare.js — صفحة التعديلات والمرتجعات بعد التسليم (v3.14.0)
   ==========================================================================
   - ملخص: حالات مفتوحة · تكلفة الشهر · مرتجع الشهر · معدل الرجوع (90 يوماً من المُسلَّم).
   - أكثر أسباب الرجوع تكراراً (لتعالج الجذر لا العَرَض).
   - الحالات: مفتوحة (الأقدم أولاً) أو مغلقة أو الكل، مع إغلاق/إعادة فتح/تعديل/حذف.
   - منفصلة عن التقارير المالية عمداً (انظر services/aftercare.js).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { aftercare } from '../data/repos/aftercare.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { aftercareStats, deliveredCount, sortCases, normalizeStatus, kindMeta, reasonLabel } from '../services/aftercare.js';
import { openCaseForm, setCaseStatus, deleteCase } from './aftercare-forms.js';

let state = { container: null, cases: [], orders: [], customers: [], filter: 'open' };
const DAY = 86400000;

async function load() {
  const [c, o, cu] = await Promise.all([aftercare.list(), orders.list(), customers.list()]);
  state.cases = c; state.orders = o; state.customers = cu;
  ctx.orders = o; ctx.customers = cu;
}
async function refresh() { await load(); draw(); }
const ctx = { refresh, orders: [], customers: [] };   /* تُحدَّث في load() فتقرأها النماذج */

function statsCard(st) {
  const cell = (label, value, color, role) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, label), el('b', { 'data-role': role, style: { fontSize: '15px', color: color || '#123C2F' } }, value),
  ]);
  const card = el('div', { className: 'card', 'data-role': 'aftercare-stats', style: { marginBottom: '12px' } }, [
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
      cell('مفتوحة', String(st.open), st.open ? '#E65100' : '#2E7D32', 'a-open'),
      cell('تكلفة الشهر', formatEGP(st.monthCost), st.monthCost ? '#C62828' : null, 'a-cost'),
      cell('مرتجع الشهر', formatEGP(st.monthRefund), st.monthRefund ? '#C62828' : null, 'a-refund'),
      cell('معدل الرجوع', st.rate90 === null ? '—' : st.rate90 + '%', st.rate90 !== null && st.rate90 > 10 ? '#C62828' : null, 'a-rate'),
    ]),
  ]);
  if (st.topReasons.length) {
    card.appendChild(el('div', { 'data-role': 'top-reasons', style: { marginTop: '8px', fontSize: '12.5px', color: '#555', lineHeight: '1.9' } },
      'أكثر الأسباب (آخر 90 يوماً): ' + st.topReasons.slice(0, 3).map((r) => r.label + ' (' + r.count + ')').join('، ')));
  }
  if (st.avgCloseDays !== null) card.appendChild(el('div', { style: { fontSize: '12px', color: '#777' } }, 'متوسط مدة الحل: ' + st.avgCloseDays + ' يوم'));
  return card;
}

function caseCard(c) {
  const k = kindMeta(c.kind);
  const cust = state.customers.find((x) => x.id === c.customerId);
  const open = normalizeStatus(c.status) === 'open';
  const age = Math.max(0, Math.floor((Date.now() - (Number(c.createdAt) || Date.now())) / DAY));
  const card = el('div', { className: 'card', 'data-case-id': c.id, style: { marginBottom: '8px', borderInlineStart: '4px solid ' + (open ? '#E65100' : '#2E7D32') } });
  card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, [
    el('b', {}, k.icon + ' ' + k.label + ' — ' + (cust ? cust.name : 'عميل غير معروف')),
    el('span', { style: { fontSize: '12px', color: open ? '#E65100' : '#2E7D32', fontWeight: '700' } }, open ? (age === 0 ? 'اليوم' : 'منذ ' + age + ' يوم') : '✅ مغلقة'),
  ]));
  card.appendChild(el('div', { style: { fontSize: '12.5px', color: '#555', marginTop: '3px', lineHeight: '1.8' } },
    reasonLabel(c.reason) + ' · #' + String(c.orderId).slice(-6) + (Number(c.cost) ? ' · تكلفة ' + formatEGP(c.cost) : '') + (Number(c.refund) ? ' · رُدَّ ' + formatEGP(c.refund) : '') + (c.createdAt ? ' · ' + formatDate(c.createdAt) : '')));
  if (c.notes) card.appendChild(el('div', { style: { fontSize: '12.5px', color: '#666', marginTop: '3px' } }, c.notes));
  card.appendChild(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } }, [
    el('button', { type: 'button', className: 'btn btn--sm ' + (open ? 'btn--primary' : 'btn--ghost'), 'data-action': open ? 'close-case' : 'reopen-case', onClick: () => setCaseStatus(ctx, c, open ? 'done' : 'open') }, open ? '✅ تمّ الحل' : '↩️ إعادة فتح'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-case', onClick: () => openCaseForm(ctx, c) }, '✏️ تعديل'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-case', onClick: () => deleteCase(ctx, c) }, '🗑️ حذف'),
  ]));
  return card;
}

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  const st = aftercareStats(state.cases, deliveredCount(state.orders), new Date());
  c.appendChild(el('div', { style: { display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' } }, [
    el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-case', onClick: () => openCaseForm(ctx) }, '➕ حالة جديدة'),
  ]));
  if (!state.cases.length) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🪡'),
      el('h2', { className: 'empty-state__title' }, 'لا حالات رجوع'),
      el('p', { className: 'empty-state__text' }, 'سجّل أي تعديل أو مرتجع بعد التسليم لتعرف أين تخسر ولماذا يتكرر'),
    ]));
    return;
  }
  c.appendChild(statsCard(st));
  const filters = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } });
  [['open', 'مفتوحة'], ['done', 'مغلقة'], ['all', 'الكل']].forEach(([id, label]) => filters.appendChild(el('button', {
    type: 'button', 'data-filter': id, className: 'btn btn--sm ' + (state.filter === id ? 'btn--primary' : 'btn--ghost'),
    onClick: () => { state.filter = id; draw(); },
  }, label)));
  c.appendChild(filters);
  const list = sortCases(state.cases).filter((x) => state.filter === 'all' || normalizeStatus(x.status) === (state.filter === 'done' ? 'done' : 'open'));
  if (!list.length) c.appendChild(el('div', { style: { fontSize: '13px', color: '#888', padding: '12px' } }, state.filter === 'open' ? '✅ لا حالات مفتوحة' : 'لا حالات في هذا العرض'));
  list.forEach((x) => c.appendChild(caseCard(x)));
}

export const aftercarePage = {
  async render(container) {
    clear(container);
    state = { container, cases: [], orders: [], customers: [], filter: 'open' };
    try { await load(); } catch (e) { container.appendChild(el('div', { className: 'card' }, 'تعذّر تحميل الحالات')); return; }
    draw();
  },
  destroy() { state = { container: null, cases: [], orders: [], customers: [], filter: 'open' }; },
};
