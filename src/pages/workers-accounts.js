/* ==========================================================================
   workers-accounts.js — تبويب «الحساب» في صفحة العمال: الحضور اليومي وكشف الشهر والسلف (v3.15.0)
   ==========================================================================
   mountAccounts(ctx, container): يرسم ورقة حضور اليوم (الحضور افتراضي؛ تسجّل غائب/نصف يوم فقط) ثم كشف شهر لكل
   عامل نشط (المستحق من الحضور والمدفوع والمتبقي والسلفة القائمة) مع أزرار صرف راتب وسلفة.
   يستعمل ctx.state وctx.refresh فقط. الحساب كله في services/worker-accounts.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { attendance } from '../data/repos/attendance.js';
import { formatEGP } from '../core/utils.js';
import { isDayOff } from '../core/day-off.js';
import { MONTH_NAMES_AR } from '../services/insights.js';
import { dayKey, statusOnDay, daySummary, workerStatement } from '../services/worker-accounts.js';
import { SALARY_TYPE_MAP } from './workers-logic.js';
import { openPaymentForm } from './workers-forms.js';

const noon = (day) => new Date(day + 'T12:00:00').getTime();
const shiftDay = (day, delta) => { const d = new Date(noon(day)); d.setDate(d.getDate() + delta); return dayKey(d.getTime()); };

function acc(state) {
  if (!state.acc) { const n = new Date(); state.acc = { day: dayKey(n.getTime()), year: n.getFullYear(), month: n.getMonth() }; }
  return state.acc;
}
const sm = (label, value, color) => el('div', { style: { flex: '1', textAlign: 'center', padding: '6px 2px', background: '#F6F1E6', borderRadius: '8px', fontSize: '11.5px', color: '#666' } }, [
  el('div', {}, label), el('b', { style: { fontSize: '14px', color: color || '#123C2F' } }, value),
]);

export function mountAccounts(ctx, container) {
  const { state } = ctx;
  const a = acc(state);
  clear(container);
  const active = (state.workers || []).filter((w) => w.active !== false);
  if (!active.length) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '📒'),
      el('h2', { className: 'empty-state__title' }, 'لا عمال نشطون'),
      el('p', { className: 'empty-state__text' }, 'أضف عاملاً من تبويب «العمال» ليظهر هنا حضوره وحسابه'),
    ]));
    return;
  }
  const redraw = () => mountAccounts(ctx, container);
  const today = dayKey(Date.now());

  /* ===== ورقة الحضور ===== */
  const sheet = el('div', { className: 'card', 'data-role': 'attendance-sheet', style: { marginBottom: '12px' } });
  const dayInput = el('input', { className: 'input', type: 'date', value: a.day, max: today, 'data-role': 'att-day', style: { flex: '1' } });
  dayInput.addEventListener('change', () => { if (dayInput.value) { a.day = dayInput.value > today ? today : dayInput.value; redraw(); } });
  sheet.appendChild(el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '🗓️ حضور اليوم')]));
  sheet.appendChild(el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' } }, [
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'day-prev', onClick: () => { a.day = shiftDay(a.day, -1); redraw(); } }, '▶'),
    dayInput,
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'day-next', disabled: a.day >= today ? 'disabled' : null, onClick: () => { a.day = shiftDay(a.day, 1); redraw(); } }, '◀'),
  ]));
  const off = isDayOff(noon(a.day), state.dayOff);
  const ds = daySummary(state.attendance, active, a.day);
  sheet.appendChild(el('div', { 'data-role': 'day-summary', style: { fontSize: '12.5px', color: '#555', marginBottom: '6px' } },
    (off ? '📴 يوم إجازة — لا يُحتسب فيه غياب. ' : '') + 'حاضر ' + ds.present + ' · غائب ' + ds.absent + ' · نصف يوم ' + ds.half));
  const setSt = async (w, status) => {
    try { await attendance.setStatus(w.id, a.day, status); await ctx.refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
  };
  active.forEach((w) => {
    const cur = statusOnDay(state.attendance, w.id, a.day);
    const btn = (status, label, on) => el('button', {
      type: 'button', 'data-status': status || 'present', disabled: a.day > today ? 'disabled' : null,
      className: 'btn btn--sm ' + (on ? (status === 'absent' ? 'btn--danger' : 'btn--primary') : 'btn--ghost'),
      onClick: () => setSt(w, status),
    }, label);
    sheet.appendChild(el('div', { 'data-worker-id': w.id, style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 0', borderTop: '1px dashed #E5DDD0' } }, [
      el('span', { style: { flex: '1', fontSize: '14px' } }, '👷 ' + w.name),
      btn(null, '✔ حاضر', cur === null), btn('half', '½', cur === 'half'), btn('absent', '✖ غائب', cur === 'absent'),
    ]));
  });
  container.appendChild(sheet);

  /* ===== كشف الشهر ===== */
  const isCur = a.year === new Date().getFullYear() && a.month === new Date().getMonth();
  const mv = (d) => { const x = new Date(a.year, a.month + d, 1); a.year = x.getFullYear(); a.month = x.getMonth(); redraw(); };
  container.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' } }, [
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'month-prev', onClick: () => mv(-1) }, '▶'),
    el('b', { 'data-role': 'month-title' }, '📒 كشف ' + MONTH_NAMES_AR[a.month] + ' ' + a.year),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'month-next', disabled: isCur ? 'disabled' : null, onClick: () => mv(1) }, '◀'),
  ]));
  active.forEach((w) => {
    const st = workerStatement({ worker: w, attendance: state.attendance, payments: state.payments, year: a.year, month: a.month, dayOff: state.dayOff });
    const type = SALARY_TYPE_MAP[w.salaryType] || SALARY_TYPE_MAP.fixed;
    const card = el('div', { className: 'card', 'data-worker-id': w.id, style: { marginBottom: '8px' } });
    card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
      el('b', {}, '👷 ' + w.name), el('span', { style: { fontSize: '12px', color: '#666' } }, type.icon + ' ' + type.label + ' ' + formatEGP(w.salary || 0)),
    ]));
    if (st.computable) {
      const rem = st.remaining;
      card.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } }, [
        sm('المستحق', formatEGP(st.earned)), sm('مصروف', formatEGP(st.salaryCash + st.deducted)),
        sm(rem < 0 ? 'دفعت زيادة' : 'المتبقي', formatEGP(Math.abs(rem)), rem > 0 ? '#C62828' : (rem < 0 ? '#E65100' : '#2E7D32')),
      ]));
      card.appendChild(el('div', { 'data-role': 'absence-line', style: { fontSize: '12px', color: '#666', marginTop: '5px' } },
        'غياب ' + st.absentDays + ' يوم' + (st.halfDays ? ' + ' + st.halfDays + ' نصف يوم' : '') + ' من ' + (w.salaryType === 'daily' ? st.elapsedWorkDays : st.workDays) + ' يوم عمل'));
    } else {
      card.appendChild(el('div', { style: { fontSize: '12.5px', color: '#666', marginTop: '6px' } },
        'المدفوع هذا الشهر ' + formatEGP(st.salaryCash) + ' — المستحق لا يُحسب من الحضور لهذا النوع من الأجر.'));
    }
    if (st.advancesGiven > 0) card.appendChild(el('div', { style: { fontSize: '12.5px', color: '#555', marginTop: '3px' } }, 'سلف هذا الشهر: ' + formatEGP(st.advancesGiven)));
    if (st.outstandingAdvance > 0) {
      card.appendChild(el('div', { 'data-role': 'outstanding-advance', style: { marginTop: '5px', padding: '6px 8px', background: '#FFF8E1', borderRadius: '8px', fontSize: '12.5px' } },
        '🤝 سلفة قائمة ' + formatEGP(st.outstandingAdvance) + (st.suggestedDeduction > 0 ? ' — يُقترح خصم ' + formatEGP(st.suggestedDeduction) + ' من راتب هذا الشهر' : '')));
    }
    card.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } }, [
      el('button', { type: 'button', className: 'btn btn--sm btn--primary', 'data-action': 'pay-salary', onClick: () => openPaymentForm(ctx, w, { kind: 'salary' }) }, '💵 صرف راتب'),
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'pay-advance', onClick: () => openPaymentForm(ctx, w, { kind: 'advance' }) }, '🤝 سلفة'),
    ]));
    container.appendChild(card);
  });
  container.appendChild(el('div', { style: { fontSize: '11.5px', color: '#888', lineHeight: '1.8', marginTop: '4px' } },
    'الحضور افتراضي: سجّل الغياب ونصف اليوم فقط. أيام الإجازة الأسبوعية لا تُحتسب. السلفة تُخصم من الراتب عند صرفه بحقل «منها خصم سلفة».'));
}
