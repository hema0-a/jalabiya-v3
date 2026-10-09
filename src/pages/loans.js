/* ==========================================================================
   loans.js — صفحة القروض الشخصية
   ==========================================================================
   - قروض ليّ (أنا الدائن) + عليّ (أنا المدين).
   - بطاقتان إحصائيتان + صافي الرصيد.
   - 3 فلاتر (الكل / ليّ / عليّ) + بحث.
   - CRUD كامل + نافذة تفاصيل + سجل دفعات.
   - معاينة سريعة (سيُضاف لاحقاً).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { personalLoans } from '../data/repos/personal-loans.js';
import { loanPayments } from '../data/repos/loan-payments.js';
import { LOAN_TYPES } from '../core/config.js';
import { formatEGP, formatDate, normalizePhone, localDateInput } from '../core/utils.js';
import {
  getLoansWithPayments,
  getLoansStats,
} from '../services/loans-calculator.js';

/* --- الحالة --- */
let state = {
  container: null,
  loans: [],
  stats: null,
  activeFilter: 'all',
  searchQuery: '',
};

const TYPE_MAP = {};
LOAN_TYPES.forEach((t) => { TYPE_MAP[t.id] = t; });

/* ==========================================================================
   1. أدوات
   ========================================================================== */

function typeColor(type) {
  return type === 'given' ? '#2E7D32' : '#C62828';
}

function typeBg(type) {
  return type === 'given' ? '#E8F5E9' : '#FFEBEE';
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [loans, stats] = await Promise.all([
    getLoansWithPayments(),
    getLoansStats(),
  ]);
  state.loans = loans;
  state.stats = stats;
}

/* ==========================================================================
   3. نموذج إضافة/تعديل
   ========================================================================== */

function openLoanForm(existing = null) {
  const isEdit = existing !== null;

  const typeSelect = el('select', { className: 'select' });
  LOAN_TYPES.forEach((t) => {
    const o = el('option', { value: t.id }, t.icon + ' ' + t.label);
    if (isEdit ? existing.type === t.id : t.id === 'given') o.selected = true;
    typeSelect.appendChild(o);
  });

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم الشخص',
    value: isEdit ? (existing.personName || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.amount || '') : '',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = isEdit && existing.date
    ? new Date(existing.date).toISOString().slice(0, 10)
    : localDateInput();

  const dueDateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = new Date(existing.dueDate).toISOString().slice(0, 10);
  }

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) noteInput.value = existing.note || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'النوع *'), typeSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الشخص *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'تاريخ القرض'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'تاريخ الاستحقاق'), dueDateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل قرض' : 'إضافة قرض',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const personName = nameInput.value.trim();
          const amount = Number(amountInput.value);
          if (!personName) return toast.warning('اسم الشخص مطلوب');
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');

          const data = {
            type: typeSelect.value,
            personName,
            phone: phoneInput.value.trim(),
            amount,
            date: dateInput.value ? new Date(dateInput.value).getTime() : Date.now(),
            dueDate: dueDateInput.value ? new Date(dueDateInput.value).getTime() : null,
            note: noteInput.value.trim(),
          };

          try {
            if (isEdit) { await personalLoans.update(existing.id, data); toast.success('تم التحديث'); }
            else { await personalLoans.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. نموذج دفعة
   ========================================================================== */

function openPaymentForm(loan) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: String(Math.round(loan.remaining || loan.amount || 0)),
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = localDateInput();

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const body = el('div', {}, [
    el('div', {
      style: { padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, loan.personName),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        'المتبقي: ' + formatEGP(loan.remaining) + ' من ' + formatEGP(loan.amount)),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ *'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: '💵 دفعة جديدة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ الدفعة', variant: 'primary', action: 'save',
        onClick: async () => {
          const amount = Number(amountInput.value);
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          if (!dateInput.value) return toast.warning('التاريخ مطلوب');
          try {
            await loanPayments.create({
              loanId: loan.id,
              amount,
              date: new Date(dateInput.value).getTime(),
              note: noteInput.value.trim(),
            });
            toast.success('تم تسجيل الدفعة');
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   5. تفاصيل القرض
   ========================================================================== */

async function openLoanDetail(loan) {
  const payments = await loanPayments.listByLoan(loan.id);
  const type = TYPE_MAP[loan.type] || TYPE_MAP.given;

  const body = el('div', {}, [
    el('div', { style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '4px' } },
      type.icon + ' ' + loan.personName),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '12px' } },
      type.label),
    loan.phone ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } },
      '📞 ' + loan.phone) : null,
    loan.date ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } },
      '📅 ' + formatDate(loan.date)) : null,
    loan.dueDate ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } },
      '⏰ الاستحقاق: ' + formatDate(loan.dueDate)) : null,
    loan.note ? el('div', { style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' } },
      loan.note) : null,
  ]);

  /* بطاقات المدفوع/المتبقي */
  body.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' },
  }, [
    el('div', { style: { padding: '10px', background: '#E8F5E9', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#2E7D32' } }, '✅ مدفوع'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#2E7D32', marginTop: '2px' } },
        formatEGP(loan.totalPaid)),
    ]),
    el('div', { style: { padding: '10px', background: '#FFF3E0', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#F57C00' } }, '⏳ متبقي'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#F57C00', marginTop: '2px' } },
        formatEGP(loan.remaining)),
    ]),
  ]));

  /* شريط التقدم */
  body.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  }, [
    el('div', {
      style: {
        width: loan.progressPercent + '%', height: '100%',
        background: loan.progressPercent >= 100 ? '#2E7D32' : typeColor(loan.type),
        transition: 'width 0.4s',
      },
    }),
  ]));

  /* سجل الدفعات */
  if (payments.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '16px 0 8px 0' },
    }, '📜 آخر الدفعات'));
    payments.slice(0, 5).forEach((p) => {
      body.appendChild(el('div', {
        style: {
          padding: '6px 10px', background: '#F6F1E6',
          borderRadius: '6px', marginBottom: '4px',
          display: 'flex', justifyContent: 'space-between', fontSize: '12px',
        },
      }, [
        el('span', {}, p.date ? formatDate(p.date) : ''),
        el('span', { style: { fontWeight: '600', color: '#2E7D32' } }, formatEGP(p.amount)),
      ]));
    });
  }

  /* الأزرار */
  const actions = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' },
  }, [
    el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      onClick: () => { handle.close(); openPaymentForm(loan); },
    }, '💵 دفعة جديدة'),
    el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      onClick: () => { handle.close(); openLoanForm(loan); },
    }, '✏️ تعديل'),
    el('button', {
      className: 'btn btn--danger btn--block', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف قرض',
          message: 'حذف قرض "' + loan.personName + '"؟ سيتم حذف كل دفعاته.',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          const pays = await loanPayments.listByLoan(loan.id);
          for (const p of pays) await loanPayments.remove(p.id);
          await personalLoans.remove(loan.id);
          toast.success('تم الحذف');
          handle.close();
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️ حذف'),
  ]);

  body.appendChild(actions);

  const handle = modal.open({
    title: 'تفاصيل القرض',
    body,
    closable: true,
  });
}

/* ==========================================================================
   6. بطاقة قرض
   ========================================================================== */

function buildLoanCard(loan) {
  const type = TYPE_MAP[loan.type] || TYPE_MAP.given;
  const color = typeColor(loan.type);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer', borderRight: '4px solid ' + color, padding: '10px 12px' },
    'data-id': loan.id,
    onClick: () => openLoanDetail(loan),
  });

  /* السطر 1: اسم + مبلغ */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        type.icon + ' ' + loan.personName),
      loan.date ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📅 ' + formatDate(loan.date)) : null,
    ]),
    el('div', { style: { textAlign: 'left', fontSize: '13px' } }, [
      el('div', { style: { fontWeight: '700', color } }, formatEGP(loan.amount)),
      el('div', { style: { fontSize: '10px', color: '#666', marginTop: '2px' } },
        type.label),
    ]),
  ]));

  /* شريط التقدم */
  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: loan.progressPercent + '%', height: '100%',
        background: loan.progressPercent >= 100 ? '#2E7D32' : color,
        transition: 'width 0.4s',
      },
    }),
  ]));

  /* السطر 2: مدفوع/متبقي */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' },
  }, [
    el('span', {}, 'مدفوع: ' + formatEGP(loan.totalPaid)),
    el('span', {}, 'متبقي: ' + formatEGP(loan.remaining)),
  ]));

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openPaymentForm(loan),
    }, '💵 دفعة'),
    loan.phone ? el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => {
        const phone = normalizePhone(loan.phone).replace(/\D/g, '');
        window.open('https://wa.me/' + phone, '_blank', 'noopener,noreferrer');
      },
    }, '📱') : null,
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openLoanForm(loan),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف قرض',
          message: 'حذف قرض "' + loan.personName + '"؟',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          const pays = await loanPayments.listByLoan(loan.id);
          for (const p of pays) await loanPayments.remove(p.id);
          await personalLoans.remove(loan.id);
          toast.success('تم الحذف');
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️'),
  ].filter(Boolean)));

  return card;
}

/* ==========================================================================
   7. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#loans-stats');
  if (!wrap) return;
  clear(wrap);

  const s = state.stats;

  wrap.appendChild(el('div', {
    className: 'stat',
    style: { borderTop: '3px solid #2E7D32' },
  }, [
    el('span', { className: 'stat__icon' }, '📤'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#2E7D32' } },
      formatEGP(s.given.remaining)),
    el('span', { className: 'stat__label' }, 'ليّ (مستحق) — ' + s.given.count),
  ]));

  wrap.appendChild(el('div', {
    className: 'stat',
    style: { borderTop: '3px solid #C62828' },
  }, [
    el('span', { className: 'stat__icon' }, '📥'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#C62828' } },
      formatEGP(s.received.remaining)),
    el('span', { className: 'stat__label' }, 'عليّ (التزام) — ' + s.received.count),
  ]));

  /* صافي الرصيد */
  const net = s.netBalance;
  const netColor = net > 0 ? '#2E7D32' : net < 0 ? '#C62828' : '#666';
  const netLabel = net > 0 ? 'لصالحك ✅' : net < 0 ? 'عليك ❌' : 'متوازن';

  wrap.appendChild(el('div', {
    className: 'stat',
    style: { borderTop: '3px solid ' + netColor, gridColumn: '1 / -1' },
  }, [
    el('span', { className: 'stat__icon' }, '⚖️'),
    el('span', { className: 'stat__value', style: { fontSize: '20px', color: netColor } },
      formatEGP(Math.abs(net))),
    el('span', { className: 'stat__label' }, 'صافي الرصيد — ' + netLabel),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#loans-filters');
  if (!wrap) return;
  clear(wrap);

  const items = [
    { id: 'all',      label: '🎯 الكل',   count: state.loans.length },
    { id: 'given',    label: '📤 ليّ',    count: state.stats.given.count },
    { id: 'received', label: '📥 عليّ',   count: state.stats.received.count },
  ];

  items.forEach((it) => {
    const active = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      'data-filter': it.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters();
        renderList();
      },
    }, it.label + ' (' + it.count + ')'));
  });
}

function applyFilters() {
  let list = state.loans;
  if (state.activeFilter !== 'all') {
    list = list.filter((l) => l.type === state.activeFilter);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((l) =>
      String(l.personName || '').toLowerCase().includes(q) ||
      String(l.phone || '').includes(q)
    );
  }
  return list;
}

function renderList() {
  const wrap = state.container?.querySelector('#loans-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters();

  if (list.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '💵'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا توجد قروض'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة قرض" للبدء'),
    ]));
    return;
  }

  list.forEach((l) => wrap.appendChild(buildLoanCard(l)));
}

async function refreshAll() {
  try {
    await loadData();
    renderStats();
    renderFilters();
    renderList();
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   8. API
   ========================================================================== */

export const loansPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '💵 القروض'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'قروض ليّ وعليّ'),
    ]));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'loans-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر إضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openLoanForm(),
    }, '➕ إضافة قرض'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الهاتف...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'loans-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* قائمة */
    container.appendChild(el('div', { id: 'loans-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      loans: [],
      stats: null,
      activeFilter: 'all',
      searchQuery: '',
    };
  },
};
