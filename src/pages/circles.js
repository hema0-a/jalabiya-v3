/* ==========================================================================
   circles.js — صفحة الجمعيات (v3.16.0)
   ==========================================================================
   ملخص هذا الشهر (أقساط مستحقة · قبض منتظر) ثم بطاقة لكل جمعية بشريط تقدّم؛ والضغط يفتح جدول الأشهر
   لتعليم «مدفوع» لكل شهر وتعليم «قبضت» في شهر دورك. الحساب كله في services/circles.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { circles } from '../data/repos/circles.js';
import { trash } from '../data/repos/trash.js';
import { STORES } from '../core/config.js';
import { formatEGP } from '../core/utils.js';
import { MONTH_NAMES_AR } from '../services/insights.js';
import { checkCircleInput, circleProgress, schedule, monthOverview, potOf, ymOf } from '../services/circles.js';

let state = { container: null, list: [], openId: null };
const ymLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return MONTH_NAMES_AR[m - 1] + ' ' + y; };
const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);

async function refresh() { state.list = await circles.list(); draw(); }

function openCircleForm(existing = null) {
  const isEdit = existing !== null;
  const v = (k, d = '') => (isEdit && existing[k] != null ? String(existing[k]) : d);
  const nameIn = el('input', { className: 'input', type: 'text', maxlength: '60', placeholder: 'مثال: جمعية الشغل', value: v('name') });
  const instIn = el('input', { className: 'input', type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: '1000', value: v('installment') });
  const membersIn = el('input', { className: 'input', type: 'number', min: '2', max: '60', step: '1', inputmode: 'numeric', placeholder: '10', value: v('members') });
  const turnIn = el('input', { className: 'input', type: 'number', min: '1', max: '60', step: '1', inputmode: 'numeric', placeholder: 'ترتيبك في القبض', value: v('myTurn') });
  const startIn = el('input', { className: 'input', type: 'month', value: v('startYm', ymOf(new Date())) });
  const dayIn = el('input', { className: 'input', type: 'number', min: '1', max: '31', step: '1', inputmode: 'numeric', placeholder: 'اختياري', value: v('payDay') });
  const notesIn = el('textarea', { className: 'textarea', placeholder: 'ملاحظات (اسم المنظِّم...)' });
  if (isEdit) notesIn.value = existing.notes || '';
  const handle = modal.open({
    title: isEdit ? 'تعديل جمعية' : 'جمعية جديدة',
    body: el('div', {}, [field('الاسم *', nameIn), field('القسط الشهري *', instIn), field('عدد الأعضاء (= عدد الأشهر) *', membersIn), field('دورك في القبض *', turnIn), field('شهر البداية *', startIn), field('يوم الدفع في الشهر', dayIn), field('ملاحظات', notesIn)]),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const r = checkCircleInput({ name: nameIn.value, installment: instIn.value, members: membersIn.value, myTurn: turnIn.value, startYm: startIn.value, payDay: dayIn.value, notes: notesIn.value });
          if (!r.ok) return toast.warning(r.error);
          try {
            if (isEdit) { await circles.update(existing.id, r.data); toast.success('تم التحديث'); }
            else { await circles.create({ ...r.data, paid: {}, collected: false, active: true }); toast.success('تمت الإضافة'); }
            handle.close(); await refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

async function togglePaid(c, ym) {
  const paid = { ...(c.paid || {}) };
  if (paid[ym]) delete paid[ym]; else paid[ym] = true;
  try { await circles.update(c.id, { paid }); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}
async function toggleCollected(c) {
  try { await circles.update(c.id, { collected: !c.collected }); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}
async function toggleActive(c) {
  try { await circles.update(c.id, { active: c.active === false }); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}
async function removeCircle(c) {
  const ok = await modal.confirm({ title: 'حذف جمعية', message: 'حذف "' + c.name + '" وسجل مدفوعاتها؟ تنتقل إلى سلة المحذوفات 7 أيام.', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
  if (!ok) return;
  try { await trash.addToTrash(STORES.CIRCLES, c); await circles.remove(c.id); toast.success('تم الحذف'); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}

function overviewCard() {
  const ov = monthOverview(state.list);
  const cell = (label, value, color, role) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, label), el('b', { 'data-role': role, style: { fontSize: '15px', color: color || '#123C2F' } }, value),
  ]);
  return el('div', { className: 'card', 'data-role': 'circles-overview', style: { marginBottom: '12px' } }, [
    el('div', { style: { display: 'flex', gap: '8px' } }, [
      cell('أقساط مستحقة هذا الشهر', formatEGP(ov.dueAmount), ov.dueAmount ? '#C62828' : '#2E7D32', 'c-due'),
      cell('قبض منتظر هذا الشهر', formatEGP(ov.collectAmount), ov.collectAmount ? '#2E7D32' : null, 'c-collect'),
    ]),
  ]);
}

function circleCard(c) {
  const p = circleProgress(c);
  const open = state.openId === c.id;
  const inactive = c.active === false;
  const pct = p.totalMonths ? Math.round((p.paidMonths / p.totalMonths) * 100) : 0;
  const card = el('div', { className: 'card', 'data-circle-id': c.id, style: { marginBottom: '8px', opacity: inactive ? '0.6' : '1' } });
  card.appendChild(el('div', { 'data-action': 'toggle-circle', style: { cursor: 'pointer' }, onClick: () => { state.openId = open ? null : c.id; draw(); } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, [
      el('b', {}, '🪙 ' + c.name + (inactive ? ' (موقوفة)' : '')),
      el('b', { style: { color: p.overdueMonths ? '#C62828' : '#123C2F' } }, p.overdueMonths ? p.overdueMonths + ' متأخر' : (p.status === 'finished' ? 'انتهت ✅' : (p.status === 'upcoming' ? 'لم تبدأ' : 'جارية'))),
    ]),
    el('div', { style: { height: '8px', borderRadius: '99px', background: '#E5DDD0', overflow: 'hidden', margin: '6px 0' } }, [el('div', { style: { width: pct + '%', height: '100%', background: '#1F6D57' } })]),
    el('div', { style: { fontSize: '12px', color: '#666', lineHeight: '1.8' } },
      'قسط ' + formatEGP(c.installment) + ' × ' + c.members + ' · دُفع ' + p.paidMonths + ' من ' + p.totalMonths + ' (' + formatEGP(p.paidAmount) + ')' +
      (p.turnYm ? ' · تقبض ' + formatEGP(p.pot) + ' في ' + ymLabel(p.turnYm) + (p.collected ? ' ✅ قُبضت' : '') : '') +
      (p.nextDueYm && p.status !== 'finished' ? ' · القادم: ' + ymLabel(p.nextDueYm) : '')),
  ]));
  if (!open) return card;
  const box = el('div', { 'data-role': 'schedule', style: { marginTop: '8px' } });
  schedule(c).forEach((r) => box.appendChild(el('div', { 'data-ym': r.ym, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderTop: '1px dashed #EEE6D8', fontSize: '13px' } }, [
    el('span', { style: { flex: '1' } }, r.index + '. ' + ymLabel(r.ym) + (r.isMyTurn ? ' — 💰 دورك (تقبض ' + formatEGP(potOf(c)) + ')' : '')),
    el('button', { type: 'button', className: 'btn btn--sm ' + (r.paid ? 'btn--primary' : 'btn--ghost'), 'data-action': 'toggle-paid', onClick: () => togglePaid(c, r.ym) }, r.paid ? '✔ مدفوع' : 'ادفع'),
  ])));
  card.appendChild(box);
  card.appendChild(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } }, [
    el('button', { type: 'button', className: 'btn btn--sm ' + (c.collected ? 'btn--ghost' : 'btn--primary'), 'data-action': 'toggle-collected', onClick: () => toggleCollected(c) }, c.collected ? '↩️ لم أقبض' : '💰 قبضت'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-circle', onClick: () => openCircleForm(c) }, '✏️ تعديل'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'toggle-active', onClick: () => toggleActive(c) }, inactive ? '▶️ تفعيل' : '⏸️ إيقاف'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-circle', onClick: () => removeCircle(c) }, '🗑️ حذف'),
  ]));
  if (c.notes) card.appendChild(el('div', { style: { fontSize: '12.5px', color: '#666', marginTop: '6px' } }, c.notes));
  return card;
}

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  c.appendChild(el('div', { style: { display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' } }, [
    el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-circle', onClick: () => openCircleForm() }, '➕ جمعية'),
  ]));
  if (!state.list.length) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🪙'),
      el('h2', { className: 'empty-state__title' }, 'لا جمعيات'),
      el('p', { className: 'empty-state__text' }, 'سجّل جمعيتك لتتابع أقساطك وموعد قبضك وتتذكر كل دفعة'),
    ]));
    return;
  }
  c.appendChild(overviewCard());
  [...state.list].sort((a, b) => (a.active === false) - (b.active === false) || (b.createdAt || 0) - (a.createdAt || 0)).forEach((x) => c.appendChild(circleCard(x)));
}

export const circlesPage = {
  async render(container) {
    clear(container);
    state = { container, list: [], openId: null };
    try { state.list = await circles.list(); } catch (e) { container.appendChild(el('div', { className: 'card' }, 'تعذّر تحميل الجمعيات')); return; }
    draw();
  },
  destroy() { state = { container: null, list: [], openId: null }; },
};
