/* ==========================================================================
   family-budget-card.js — بطاقة «ميزانية الأسرة» ونافذة تحديد السقوف (v3.15.0)
   ==========================================================================
   buildBudgetCard(status, onEdit): عرض فقط (أشرطة التقدّم، المتبقي، التوقّع، التنبيه).
   openBudgetEditor(budget, cats, onSaved): سقف لكل فئة + إجمالي اختياري، ويُحفظ في settings.familyBudget
   (يتزامن بين الأجهزة). ترك الحقل فارغاً = بلا سقف لتلك الفئة.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP } from '../core/utils.js';
import { normalizeBudget } from '../services/family-budget.js';

const COLORS = { ok: '#1F6D57', warn: '#F57C00', over: '#C62828' };
const LABELS = { ok: '', warn: ' ⚠️ اقتربت من السقف', over: ' 🔴 تجاوزت السقف' };

function barRow(r, title) {
  const row = el('div', { 'data-cat': r.id || '_total', style: { marginTop: '8px' } });
  row.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '2px' } }, [
    el('span', { style: { fontWeight: '700' } }, title + LABELS[r.level]),
    el('span', { style: { color: COLORS[r.level], fontWeight: '700' } }, formatEGP(r.spent) + ' / ' + formatEGP(r.cap)),
  ]));
  row.appendChild(el('div', { style: { height: '8px', borderRadius: '99px', background: '#E5DDD0', overflow: 'hidden' } }, [
    el('div', { style: { width: Math.min(100, r.pct) + '%', height: '100%', background: COLORS[r.level], borderRadius: '99px' } }),
  ]));
  row.appendChild(el('div', { style: { fontSize: '11.5px', color: '#777', marginTop: '2px' } },
    (r.remaining >= 0 ? 'متبقٍ ' + formatEGP(r.remaining) : 'زيادة ' + formatEGP(-r.remaining)) +
    (r.projected !== null && r.projected > r.cap ? ' — بمعدلك الحالي ستصل ' + formatEGP(r.projected) : '')));
  return row;
}

export function buildBudgetCard(status, onEdit) {
  const card = el('div', { className: 'card', 'data-role': 'family-budget', style: { marginBottom: '12px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🧮 ميزانية الشهر'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-budget', onClick: onEdit }, '⚙️ السقوف'),
  ]));
  if (!status || !status.has) {
    card.appendChild(el('div', { style: { fontSize: '13px', color: '#777', lineHeight: '1.8' } }, 'حدّد سقفاً شهرياً لكل فئة لتتابع إنفاقك وتنبّهك قبل التجاوز.'));
    return card;
  }
  if (status.total) card.appendChild(barRow(status.total, status.total.explicit ? 'الإجمالي' : 'مجموع السقوف'));
  status.rows.forEach((r) => card.appendChild(barRow(r, r.icon + ' ' + r.label)));
  if (status.unbudgeted > 0) card.appendChild(el('div', { style: { fontSize: '12px', color: '#777', marginTop: '8px' } }, 'مصروف خارج السقوف: ' + formatEGP(status.unbudgeted)));
  return card;
}

export function openBudgetEditor(budget, cats, onSaved) {
  const b = normalizeBudget(budget);
  const totalIn = el('input', { className: 'input', type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'اختياري', 'data-role': 'budget-total', value: b.total > 0 ? String(b.total) : '' });
  const inputs = (Array.isArray(cats) ? cats : []).map((c) => ({
    id: c.id,
    input: el('input', { className: 'input', type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'بلا سقف', 'data-cat-input': c.id, value: b.caps[c.id] ? String(b.caps[c.id]) : '' }),
    cat: c,
  }));
  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'سقف إجمالي الشهر'), totalIn]),
    ...inputs.map((x) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, x.cat.icon + ' ' + x.cat.label), x.input])),
    el('div', { style: { fontSize: '12px', color: '#777' } }, 'اترك الحقل فارغاً لفئة بلا سقف. التنبيه يبدأ عند 80% من السقف.'),
  ]);
  const handle = modal.open({
    title: '⚙️ سقوف الميزانية',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: async () => {
          const caps = {};
          inputs.forEach((x) => { if (x.input.value !== '') caps[x.id] = x.input.value; });
          const next = normalizeBudget({ total: totalIn.value, caps });
          try {
            await settings.update({ familyBudget: { total: next.total, caps: next.caps } });
            toast.success('تم حفظ الميزانية');
            handle.close();
            if (onSaved) await onSaved();
          } catch (e) { toast.danger('فشل الحفظ: ' + e.message); }
        },
      },
    ],
  });
}
