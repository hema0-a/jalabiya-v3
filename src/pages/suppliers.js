/* ==========================================================================
   suppliers.js — صفحة الموردون والمشتريات (v3.12.0)
   ==========================================================================
   - ملخص: مستحق للموردين · مشتريات الشهر · مدفوع الشهر.
   - مقارنة أسعار المتر لكل صنف (الأرخص ✅).
   - قائمة الموردين برصيد كل مورد، والضغط يفتح حركاته: مشتريات 🛒 ودفعات 💵 مع اتصال وواتساب.
   - الدفتر منفصل عن المصروفات: تسجيل المشتريات كمصروف خيار صريح عند الحفظ (بلا ازدواج).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { suppliers, supplierEntries } from '../data/repos/suppliers.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';
import { balancesBySupplier, totalOwed, monthSummary, priceBoard, entryPricePerMeter, KINDS } from '../services/suppliers.js';
import { openSupplierForm, openEntryForm, deleteEntry, deleteSupplier } from './suppliers-forms.js';

let state = { container: null, suppliers: [], entries: [], openId: null };
const MAX_SHOWN_ENTRIES = 40;
const kindMeta = (k) => KINDS.find((x) => x.id === k) || KINDS[0];

async function load() {
  const [s, e] = await Promise.all([suppliers.list(), supplierEntries.list()]);
  state.suppliers = s;
  state.entries = e;
}

async function refresh() {
  await load();
  draw();
}

const ctx = { refresh };

function owedLabel(owed) {
  if (owed > 0) return { text: 'عليك ' + formatEGP(owed), color: '#C62828' };
  if (owed < 0) return { text: 'لك عنده ' + formatEGP(-owed), color: '#2E7D32' };
  return { text: 'مسدَّد ✅', color: '#666' };
}

function summaryCard(rows) {
  const ms = monthSummary(state.entries);
  const owed = totalOwed(rows);
  const cell = (label, value, color, role) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, label),
    el('b', { 'data-role': role, style: { fontSize: '15px', color: color || '#123C2F' } }, value),
  ]);
  return el('div', { className: 'card', 'data-role': 'suppliers-summary', style: { marginBottom: '12px' } }, [
    el('div', { style: { display: 'flex', gap: '8px' } }, [
      cell('مستحق للموردين', formatEGP(owed), owed > 0 ? '#C62828' : null, 's-owed'),
      cell('مشتريات الشهر', formatEGP(ms.purchased), null, 's-purchased'),
      cell('مدفوع الشهر', formatEGP(ms.paid), null, 's-paid'),
    ]),
  ]);
}

function boardCard() {
  const board = priceBoard(state.suppliers, state.entries, { max: 6 });
  if (!board.length) return null;
  const card = el('div', { className: 'card', 'data-role': 'price-board', style: { marginBottom: '12px' } }, [
    el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '📊 مقارنة أسعار المتر')]),
  ]);
  board.forEach((b) => {
    const box = el('div', { 'data-item': b.key, style: { padding: '6px 0', borderTop: '1px dashed #E5DDD0' } });
    box.appendChild(el('div', { style: { fontWeight: '700', fontSize: '13.5px' } }, b.item + (b.spread > 0 ? '  ·  فرق ' + formatEGP(b.spread) + ' للمتر' : '')));
    b.rows.forEach((r) => box.appendChild(el('div', { style: { fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: r.supplierId === b.cheapestId ? '#2E7D32' : '#333' } }, [
      el('span', {}, (r.supplierId === b.cheapestId ? '✅ ' : '') + r.name),
      el('span', {}, formatEGP(r.lastPrice) + ' / متر' + (r.count > 1 ? ' (متوسط ' + formatEGP(r.avgPrice) + ')' : '')),
    ])));
    card.appendChild(box);
  });
  return card;
}

function entryRow(e) {
  const m = kindMeta(e.kind);
  const p = entryPricePerMeter(e);
  const detail = e.kind === 'purchase'
    ? [e.item, Number(e.meters) > 0 ? e.meters + ' م' : '', p ? formatEGP(p) + '/متر' : ''].filter(Boolean).join(' · ')
    : '';
  return el('div', { 'data-entry-id': e.id, style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 0', borderTop: '1px dashed #EEE6D8', fontSize: '13px' } }, [
    el('span', {}, m.icon),
    el('span', { style: { flex: '1' } }, [formatDate(e.date) + (detail ? ' — ' + detail : '') + (e.notes ? ' — ' + e.notes : '')]),
    el('b', { style: { color: e.kind === 'purchase' ? '#C62828' : '#2E7D32' } }, (e.kind === 'purchase' ? '+' : '−') + formatEGP(e.amount)),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-entry', onClick: () => deleteEntry(ctx, e) }, '🗑️'),
  ]);
}

function supplierCard(row) {
  const s = row.supplier;
  const open = state.openId === s.id;
  const lab = owedLabel(row.owed);
  const card = el('div', { className: 'card', 'data-supplier-id': s.id, style: { marginBottom: '8px' } });
  card.appendChild(el('div', { 'data-action': 'toggle-supplier', style: { cursor: 'pointer' }, onClick: () => { state.openId = open ? null : s.id; draw(); } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, [
      el('b', {}, '🚚 ' + s.name),
      el('b', { 'data-role': 'supplier-owed', style: { color: lab.color } }, lab.text),
    ]),
    el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } },
      'مشتريات ' + formatEGP(row.purchased) + ' · مدفوع ' + formatEGP(row.paid) + (row.lastPricePerMeter ? ' · آخر سعر ' + formatEGP(row.lastPricePerMeter) + '/متر' : '')),
  ]));
  if (!open) return card;

  const phoneDigits = normalizePhone(s.phone || '').replace(/\D/g, '');
  const actions = [
    el('button', { type: 'button', className: 'btn btn--sm btn--primary', 'data-action': 'add-purchase', onClick: () => openEntryForm(ctx, s, 'purchase') }, '🛒 مشتريات'),
    el('button', { type: 'button', className: 'btn btn--sm btn--primary', 'data-action': 'add-payment', onClick: () => openEntryForm(ctx, s, 'payment') }, '💵 دفعة'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-supplier', onClick: () => openSupplierForm(ctx, s) }, '✏️ تعديل'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-supplier', onClick: () => deleteSupplier(ctx, s, row.count) }, '🗑️ حذف'),
  ];
  if (s.phone) {
    actions.push(el('a', { className: 'btn btn--sm btn--ghost', href: 'tel:' + s.phone.replace(/[^\d+]/g, '') }, '📞 اتصال'));
    if (phoneDigits.length >= 11) actions.push(el('a', { className: 'btn btn--sm btn--ghost', href: 'https://wa.me/' + phoneDigits, target: '_blank', rel: 'noopener noreferrer' }, '💬 واتساب'));
  }
  card.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' } }, actions));
  if (s.notes) card.appendChild(el('div', { style: { fontSize: '12.5px', color: '#666', marginTop: '6px' } }, s.notes));
  const list = state.entries.filter((e) => e.supplierId === s.id).sort((a, b) => (b.date || 0) - (a.date || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  const box = el('div', { 'data-role': 'entries', style: { marginTop: '8px' } });
  if (!list.length) box.appendChild(el('div', { style: { fontSize: '13px', color: '#888' } }, 'لا حركات بعد — سجّل أول مشتريات أو دفعة.'));
  list.slice(0, MAX_SHOWN_ENTRIES).forEach((e) => box.appendChild(entryRow(e)));
  if (list.length > MAX_SHOWN_ENTRIES) box.appendChild(el('div', { style: { fontSize: '12px', color: '#888', marginTop: '4px' } }, 'يظهر أحدث ' + MAX_SHOWN_ENTRIES + ' من ' + list.length + ' حركة'));
  card.appendChild(box);
  return card;
}

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  const rows = balancesBySupplier(state.suppliers, state.entries);
  /* عنوان الصفحة يظهر في الشريط العلوي (من القائمة)، فلا نكرره هنا */
  c.appendChild(el('div', { style: { display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' } }, [
    el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-supplier', onClick: () => openSupplierForm(ctx) }, '➕ مورد'),
  ]));
  if (!rows.length) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🚚'),
      el('h2', { className: 'empty-state__title' }, 'لا موردين بعد'),
      el('p', { className: 'empty-state__text' }, 'أضف مورد القماش لتتابع مشترياتك وما عليك له وتقارن الأسعار'),
    ]));
    return;
  }
  c.appendChild(summaryCard(rows));
  const board = boardCard();
  if (board) c.appendChild(board);
  rows.forEach((r) => c.appendChild(supplierCard(r)));
}

export const suppliersPage = {
  async render(container) {
    clear(container);
    state = { container, suppliers: [], entries: [], openId: null };
    try { await load(); } catch (e) { container.appendChild(el('div', { className: 'card' }, 'تعذّر تحميل الموردين')); return; }
    draw();
  },
  destroy() { state = { container: null, suppliers: [], entries: [], openId: null }; },
};
