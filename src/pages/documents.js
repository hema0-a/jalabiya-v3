/* ==========================================================================
   documents.js — صفحة المستندات وتجديدها (v3.16.0)
   ==========================================================================
   عقد الإيجار والتأمين والرخص والضرائب...: تاريخ انتهاء وتنبيه قبله، وزر «تم التجديد» يقترح التاريخ الجديد
   (عام من الانتهاء القديم إن جدّدت مبكراً، وإلا من اليوم) ويحفظ عدد مرات التجديد. الحساب في services/documents.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { documents } from '../data/repos/documents.js';
import { formatEGP, formatDate, localDateInput, parseDateInput } from '../core/utils.js';
import {
  CATEGORIES, DEFAULT_REMIND_DAYS, checkDocumentInput, categoryMeta, documentStatus, sortDocuments, renewedExpiry, documentsSummary,
} from '../services/documents.js';

let state = { container: null, list: [] };
const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);
async function refresh() { state.list = await documents.list(); draw(); }

function openForm(existing = null) {
  const isEdit = existing !== null;
  const titleIn = el('input', { className: 'input', type: 'text', maxlength: '80', placeholder: 'مثال: عقد إيجار الورشة', value: isEdit ? existing.title || '' : '' });
  const catSel = el('select', { className: 'select' });
  CATEGORIES.forEach((c) => { const o = el('option', { value: c.id }, c.icon + ' ' + c.label); if (isEdit && categoryMeta(existing.category).id === c.id) o.selected = true; catSel.appendChild(o); });
  const expIn = el('input', { className: 'input', type: 'date', value: isEdit && existing.expiresAt ? localDateInput(existing.expiresAt) : '' });
  const remindIn = el('input', { className: 'input', type: 'number', min: '0', max: '365', step: '1', inputmode: 'numeric', value: String(isEdit ? existing.remindDays ?? DEFAULT_REMIND_DAYS : DEFAULT_REMIND_DAYS) });
  const costIn = el('input', { className: 'input', type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'اختياري', value: isEdit && existing.cost ? String(existing.cost) : '' });
  const notesIn = el('textarea', { className: 'textarea', placeholder: 'ملاحظات (رقم العقد، جهة الإصدار...)' });
  if (isEdit) notesIn.value = existing.notes || '';
  const handle = modal.open({
    title: isEdit ? 'تعديل مستند' : 'مستند جديد',
    body: el('div', {}, [field('الاسم *', titleIn), field('النوع', catSel), field('تاريخ الانتهاء *', expIn), field('نبّهني قبل (أيام)', remindIn), field('تكلفة التجديد المتوقعة', costIn), field('ملاحظات', notesIn)]),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const r = checkDocumentInput({ title: titleIn.value, category: catSel.value, expiresAt: expIn.value ? parseDateInput(expIn.value) : 0, remindDays: remindIn.value, cost: costIn.value, notes: notesIn.value });
          if (!r.ok) return toast.warning(r.error);
          try {
            if (isEdit) { await documents.update(existing.id, r.data); toast.success('تم التحديث'); }
            else { await documents.create(r.data); toast.success('تمت الإضافة'); }
            handle.close(); await refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

function openRenew(d) {
  const newIn = el('input', { className: 'input', type: 'date', value: localDateInput(renewedExpiry(d)), 'data-role': 'renew-date' });
  const costIn = el('input', { className: 'input', type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'اختياري', value: d.cost ? String(d.cost) : '' });
  const handle = modal.open({
    title: '✅ تجديد — ' + d.title,
    body: el('div', {}, [field('تاريخ الانتهاء الجديد', newIn), field('تكلفة التجديد الفعلية', costIn)]),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'تم التجديد', variant: 'primary', action: 'save',
        onClick: async () => {
          if (!newIn.value) return toast.warning('تاريخ الانتهاء الجديد مطلوب');
          const exp = parseDateInput(newIn.value);
          if (!(exp > Number(d.expiresAt))) return toast.warning('التاريخ الجديد لازم يكون بعد القديم');
          const cost = Number(costIn.value);
          try {
            await documents.update(d.id, { expiresAt: exp, renewedAt: Date.now(), renewals: (Number(d.renewals) || 0) + 1, ...(cost > 0 ? { cost } : {}) });
            toast.success('تم التجديد ✅'); handle.close(); await refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

async function removeDoc(d) {
  const ok = await modal.confirm({ title: 'حذف مستند', message: 'حذف "' + d.title + '" نهائياً؟', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
  if (!ok) return;
  try { await documents.remove(d.id); toast.success('تم الحذف'); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}

const STATUS = {
  expired: { color: '#C62828', text: (n) => '🔴 منتهٍ منذ ' + Math.abs(n) + ' يوم' },
  due: { color: '#E65100', text: (n) => (n === 0 ? '⚠️ ينتهي اليوم' : '⚠️ ينتهي خلال ' + n + ' يوم') },
  ok: { color: '#2E7D32', text: (n) => '✅ ساري — باقي ' + n + ' يوم' },
};

function docCard(d) {
  const meta = categoryMeta(d.category);
  const s = documentStatus(d);
  const st = STATUS[s.status];
  return el('div', { className: 'card', 'data-doc-id': d.id, style: { marginBottom: '8px', borderInlineStart: '4px solid ' + st.color } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, [el('b', {}, meta.icon + ' ' + d.title), el('b', { 'data-role': 'doc-status', style: { color: st.color, fontSize: '12.5px' } }, st.text(s.daysLeft))]),
    el('div', { style: { fontSize: '12.5px', color: '#666', marginTop: '3px', lineHeight: '1.8' } },
      meta.label + ' · ينتهي ' + formatDate(d.expiresAt) + ' · تنبيه قبل ' + (d.remindDays ?? DEFAULT_REMIND_DAYS) + ' يوم' + (d.cost ? ' · تجديد ~' + formatEGP(d.cost) : '') + (d.renewals ? ' · جُدِّد ' + d.renewals + ' مرة' : '')),
    d.notes ? el('div', { style: { fontSize: '12.5px', color: '#777', marginTop: '3px' } }, d.notes) : null,
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } }, [
      el('button', { type: 'button', className: 'btn btn--sm ' + (s.status === 'ok' ? 'btn--ghost' : 'btn--primary'), 'data-action': 'renew-doc', onClick: () => openRenew(d) }, '✅ تم التجديد'),
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-doc', onClick: () => openForm(d) }, '✏️ تعديل'),
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-doc', onClick: () => removeDoc(d) }, '🗑️ حذف'),
    ]),
  ]);
}

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  c.appendChild(el('div', { style: { display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' } }, [
    el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-doc', onClick: () => openForm() }, '➕ مستند'),
  ]));
  const list = sortDocuments(state.list);
  if (!list.length) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🗂️'),
      el('h2', { className: 'empty-state__title' }, 'لا مستندات'),
      el('p', { className: 'empty-state__text' }, 'سجّل عقد الإيجار والتأمين والرخص لتصلك تنبيهات قبل انتهائها'),
    ]));
    return;
  }
  const sm = documentsSummary(list);
  const cell = (label, value, color) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, label), el('b', { style: { fontSize: '15px', color: color || '#123C2F' } }, value),
  ]);
  c.appendChild(el('div', { className: 'card', 'data-role': 'docs-summary', style: { marginBottom: '12px', display: 'flex', gap: '8px' } }, [
    cell('منتهية', String(sm.expired), sm.expired ? '#C62828' : '#2E7D32'), cell('قريبة', String(sm.due), sm.due ? '#E65100' : '#2E7D32'), cell('تجديدات 90 يوماً', formatEGP(sm.cost90)),
  ]));
  list.forEach((d) => c.appendChild(docCard(d)));
}

export const documentsPage = {
  async render(container) {
    clear(container);
    state = { container, list: [] };
    try { state.list = await documents.list(); } catch (e) { container.appendChild(el('div', { className: 'card' }, 'تعذّر تحميل المستندات')); return; }
    draw();
  },
  destroy() { state = { container: null, list: [] }; },
};
