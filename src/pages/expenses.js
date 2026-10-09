/* ==========================================================================
   expenses.js — صفحة المصروفات
   ==========================================================================
   - CRUD + فلترة بالفترة (أسبوع/شهر/سنة/الكل)
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { expenses } from '../data/repos/expenses.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatEGP, formatDate, localDateInput, parseDateInput } from '../core/utils.js';
import * as draft from '../services/draft-manager.js';

/* --- مفتاح المسودة --- */
const DRAFT_KEY = 'expense-form';

let state = { expenses: [], activePeriod: 'month', container: null };

export function filterByPeriod(list, period) {
  const now = Date.now();
  const day = 86400000;
  if (period === 'all') return list;
  if (period === 'week') return list.filter((e) => (e.date || 0) >= now - 7 * day);
  if (period === 'month') {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return list.filter((e) => (e.date || 0) >= d.getTime());
  }
  if (period === 'year') {
    const d = new Date(); d.setMonth(0); d.setDate(1); d.setHours(0, 0, 0, 0);
    return list.filter((e) => (e.date || 0) >= d.getTime());
  }
  return list;
}

async function loadData() {
  const list = await expenses.list();
  list.sort((a, b) => (b.date || 0) - (a.date || 0));
  state.expenses = list;
}

function openExpenseForm(existing = null) {
  const isEdit = existing !== null;

  const categorySelect = el('select', { className: 'select' });
  [['fabric', 'قماش'], ['thread', 'خيوط'], ['tools', 'أدوات'], ['rent', 'إيجار'], ['electricity', 'كهرباء'], ['water', 'مياه'], ['salary', 'رواتب'], ['other', 'أخرى']].forEach(([v, l]) => {
    categorySelect.appendChild(el('option', { value: v }, l));
  });
  if (isEdit) categorySelect.value = existing.category || 'other';

  const amountInput = el('input', { className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01' });
  if (isEdit && existing.amount != null) amountInput.value = String(existing.amount);

  const dateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.date) dateInput.value = localDateInput(existing.date);
  else dateInput.value = localDateInput();

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الفئة'), categorySelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ (ج.م) *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل مصروف' : 'إضافة مصروف',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary',
        action: 'save',
        onClick: async () => {
          const amount = Number(amountInput.value);
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          const data = {
            category: categorySelect.value,
            amount,
            date: (dateInput.value ? parseDateInput(dateInput.value) : Date.now()),
            notes: notesInput.value.trim(),
          };
          try {
            if (isEdit) { await expenses.update(existing.id, data); toast.success('تم التحديث'); }
            else { await expenses.create(data); toast.success('تم الإضافة'); }
            draft.clear(DRAFT_KEY);
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });

  /* --- 📝 Autosave: حفظ + استرجاع المسودة (فقط للنماذج الجديدة) --- */
  if (!isEdit) {
    /* 1. استرجاع المسودة إن وُجدت */
    const savedDraft = draft.get(DRAFT_KEY);
    if (savedDraft && typeof savedDraft === 'object') {
      try {
        if (savedDraft.category) categorySelect.value = savedDraft.category;
        if (savedDraft.amount != null) amountInput.value = String(savedDraft.amount);
        if (savedDraft.date) dateInput.value = savedDraft.date;
        if (typeof savedDraft.notes === 'string') notesInput.value = savedDraft.notes;

        toast.info('📝 تم استرجاع مسودة سابقة');
      } catch (e) {
        console.warn('[ExpenseForm] draft restore failed:', e);
      }
    }

    /* 2. حفظ تلقائي أثناء الكتابة (debounce 500ms) */
    let _saveTimer = null;
    const scheduleSave = () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        try {
          const payload = {
            category: categorySelect.value,
            amount: Number(amountInput.value) || 0,
            date: dateInput.value,
            notes: notesInput.value,
          };
          draft.save(DRAFT_KEY, payload);
        } catch (e) {
          console.warn('[ExpenseForm] draft save failed:', e);
        }
      }, 500);
    };

    /* ربط المراقبة بمحتوى النموذج */
    body.addEventListener('input', scheduleSave);
    body.addEventListener('change', scheduleSave);

    /* حفظ أولي بعد فتح النموذج بلحظة */
    setTimeout(scheduleSave, 100);

    /* حفظ عند إغلاق النافذة */
    const origHandleClose = handle.close;
    handle.close = function () {
      try { scheduleSave(); } catch { /* ignore */ }
      return origHandleClose.apply(this, arguments);
    };
  }
}

async function deleteExpense(e) {
  const ok = await modal.confirm({
    title: 'حذف مصروف',
    message: 'حذف مصروف بقيمة ' + formatEGP(e.amount) + '؟',
    confirmText: 'حذف',
    cancelText: 'إلغاء',
    danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('expenses', e);
    await expenses.remove(e.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

function buildExpenseCard(e) {
  const cats = { fabric: 'قماش', thread: 'خيوط', tools: 'أدوات', rent: 'إيجار', electricity: 'كهرباء', water: 'مياه', salary: 'رواتب', other: 'أخرى' };
  const card = el('div', { className: 'card', style: { marginBottom: '8px' }, 'data-id': e.id }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, cats[e.category] || 'أخرى'),
      el('div', { style: { fontWeight: '700', color: '#C62828', fontSize: '15px' } }, formatEGP(e.amount)),
    ]),
    e.date ? el('div', { style: { fontSize: '12px', color: '#2E8B6F', marginBottom: '6px' } }, '📅 ' + formatDate(e.date)) : null,
  ]);
  if (e.notes) card.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '6px' } }, e.notes));
  card.appendChild(el('div', { style: { display: 'flex', gap: '6px' } }, [
    el('button', { className: 'btn btn--sm btn--secondary', onClick: () => openExpenseForm(e) }, '✏️'),
    el('button', { className: 'btn btn--sm btn--danger', onClick: () => deleteExpense(e) }, '🗑️'),
  ]));
  return card;
}

function renderStats() {
  const wrap = state.container?.querySelector('#expenses-stats');
  if (!wrap) return;
  clear(wrap);
  const filtered = filterByPeriod(state.expenses, state.activePeriod);
  const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const count = filtered.length;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💸'),
    el('span', { className: 'stat__value' }, formatEGP(total)),
    el('span', { className: 'stat__label' }, 'الإجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📋'),
    el('span', { className: 'stat__value' }, String(count)),
    el('span', { className: 'stat__label' }, 'عدد البنود'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#expenses-filters');
  if (!wrap) return;
  clear(wrap);
  const periods = [
    { id: 'week', label: 'الأسبوع' },
    { id: 'month', label: 'هذا الشهر' },
    { id: 'year', label: 'هذه السنة' },
    { id: 'all', label: 'الكل' },
  ];
  periods.forEach((p) => {
    const isActive = state.activePeriod === p.id;
    wrap.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': p.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => { state.activePeriod = p.id; renderStats(); renderFilters(); renderList(); },
    }, p.label));
  });
}

function renderList() {
  const lc = state.container?.querySelector('#expenses-list');
  if (!lc) return;
  clear(lc);
  const filtered = filterByPeriod(state.expenses, state.activePeriod);
  if (filtered.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🧾'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مصروفات'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة مصروف" للبدء'),
    ]));
    return;
  }
  filtered.forEach((e) => lc.appendChild(buildExpenseCard(e)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderFilters();
  renderList();
}

export const expensesPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activePeriod = 'month';
    container.appendChild(el('div', {
      id: 'expenses-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openExpenseForm(),
    }, '➕ إضافة مصروف'));
    container.appendChild(el('div', {
      id: 'expenses-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));
    container.appendChild(el('div', { id: 'expenses-list' }));
    await refreshAll();
  },
  destroy() { state = { expenses: [], activePeriod: 'month', container: null }; },
};
