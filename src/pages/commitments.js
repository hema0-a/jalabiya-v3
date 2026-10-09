/* ==========================================================================
   commitments.js — صفحة المالية الشخصية (الالتزامات + أهداف الادخار)
   ==========================================================================
   - تبويبان: الالتزامات / أهداف الادخار.
   - 8 تصنيفات + 6 دوريات.
   - 4 بطاقات إحصائية + صحة الالتزامات + تنبيهات ذكية.
   - معاينة سريعة (previewCommitment + previewGoal).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { savingsGoals } from '../data/repos/savings-goals.js';
import {
  getCommitmentsStats,
  getHealthScore,
  getSmartAlerts,
  getCommitmentsWithPayments,
  getMonthlyEquivalent,
  invalidateCache,
  COMMITMENT_CAT_MAP,
  COMMITMENT_FREQ_MAP,
} from '../services/commitments-calculator.js';
import {
  COMMITMENT_CATEGORIES,
  COMMITMENT_FREQUENCIES,
} from '../core/config.js';
import { formatEGP, formatDate, localDateInput } from '../core/utils.js';
import { previewCommitment, previewGoal } from '../ui/quick-preview.js';

/* --- الحالة --- */
let state = {
  container: null,
  activeTab: 'commitments',
  activeCategory: 'all',
  searchQuery: '',
  stats: null,
  withPayments: [],
  goals: [],
};

/* ==========================================================================
   1. أدوات
   ========================================================================== */

function statusColor(value, good, warn) {
  if (value >= good) return '#2E7D32';
  if (value >= warn) return '#F57C00';
  return '#C62828';
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [stats, withPayments, goals] = await Promise.all([
    getCommitmentsStats(),
    getCommitmentsWithPayments(),
    savingsGoals.listWithProgress(),
  ]);
  state.stats = stats;
  state.withPayments = withPayments;
  state.goals = goals;
}

/* ==========================================================================
   3. التبويبات
   ========================================================================== */

function renderTabs() {
  const wrap = el('div', {
    role: 'tablist',
    'aria-label': 'الأقسام',
    style: { display: 'flex', gap: '4px', marginBottom: '16px', background: '#F6F1E6', padding: '4px', borderRadius: '10px' },
  });

  const tabs = [
    { id: 'commitments', icon: '📋', label: 'الالتزامات' },
    { id: 'goals',       icon: '🏦', label: 'أهداف الادخار' },
  ];

  tabs.forEach((t) => {
    const active = state.activeTab === t.id;
    wrap.appendChild(el('button', {
      type: 'button', role: 'tab',
      'aria-selected': String(active),
      className: 'btn ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => {
        state.activeTab = t.id;
        refreshAll();
      },
    }, t.icon + ' ' + t.label));
  });

  return wrap;
}

/* ==========================================================================
   4. بطاقات الإحصائية
   ========================================================================== */

function renderStats() {
  const s = state.stats;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' },
  });

  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value', style: { fontSize: '16px' } }, formatEGP(s.totalMonthlyExpected)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#2E7D32' } }, formatEGP(s.totalPaidThisMonth)),
    el('span', { className: 'stat__label' }, 'مدفوع'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏳'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#F57C00' } }, formatEGP(s.totalRemaining)),
    el('span', { className: 'stat__label' }, 'متبقي'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⚠️'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: s.overdueCount > 0 ? '#C62828' : '#666' } }, String(s.overdueCount)),
    el('span', { className: 'stat__label' }, 'متأخر'),
  ]));

  return grid;
}

/* ==========================================================================
   5. صحة الالتزامات
   ========================================================================== */

function renderHealth() {
  const h = getHealthScore(state.stats);
  const color = h.score >= 80 ? '#2E7D32' : h.score >= 60 ? '#2E8B6F' : h.score >= 40 ? '#F57C00' : '#C62828';
  const stars = '⭐'.repeat(h.stars) + '☆'.repeat(5 - h.stars);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '12px', background: 'linear-gradient(135deg, #FFFFFF, #F9F5EC)' },
  });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🎯 صحة الالتزامات'),
    el('span', { style: { fontSize: '13px', color, fontWeight: '600' } }, stars),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  }, [
    el('span', { style: { fontSize: '22px', fontWeight: '700', color } }, h.score + ' / 100'),
    el('span', { style: { fontSize: '13px', color: '#666' } }, h.level),
  ]));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden' },
  }, [
    el('div', { style: { width: h.score + '%', height: '100%', background: color, transition: 'width 0.5s' } }),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '12px', justifyContent: 'space-around', marginTop: '10px', fontSize: '12px' },
  }, [
    el('span', {}, '✅ ' + state.stats.paidCount + ' مدفوع'),
    el('span', {}, '⏳ ' + state.stats.pendingCount + ' متبقي'),
    el('span', { style: { color: state.stats.overdueCount > 0 ? '#C62828' : '#666' } }, '⚠️ ' + state.stats.overdueCount + ' متأخر'),
  ]));

  return card;
}

/* ==========================================================================
   6. التنبيهات الذكية
   ========================================================================== */

function renderAlerts() {
  const alerts = getSmartAlerts(state.stats, state.withPayments);
  if (alerts.length === 0) return null;

  const colors = {
    critical: { bg: '#FFEBEE', border: '#C62828' },
    warning:  { bg: '#FFF3E0', border: '#F57C00' },
    success:  { bg: '#E8F5E9', border: '#2E7D32' },
    info:     { bg: '#E3F2FD', border: '#1565C0' },
  };

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '12px', padding: '10px' },
  });
  card.appendChild(el('h3', {
    style: { fontSize: '14px', color: '#123C2F', margin: '0 0 8px 0', fontWeight: '600' },
  }, '⚠️ تنبيهات ذكية'));

  alerts.forEach((a) => {
    const c = colors[a.type] || colors.info;
    card.appendChild(el('div', {
      style: {
        padding: '6px 10px', background: c.bg,
        borderRight: '3px solid ' + c.border,
        borderRadius: '6px', marginBottom: '4px',
        fontSize: '12px', lineHeight: '1.5',
      },
    }, a.icon + ' ' + a.text));
  });

  return card;
}

/* ==========================================================================
   7. البحث + الفلترة
   ========================================================================== */

function renderSearchBox() {
  const inp = el('input', {
    className: 'input', type: 'search',
    placeholder: '🔍 ابحث بالاسم...',
    style: { marginBottom: '8px' },
  });
  inp.addEventListener('input', () => {
    state.searchQuery = inp.value;
    if (state.activeTab === 'commitments') renderCommitmentsList();
    else renderGoalsList();
  });
  return inp;
}

function renderCategoryFilters() {
  const wrap = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px', gap: '2px' },
  });
  const all = [{ id: 'all', label: 'الكل', icon: '📁' }, ...COMMITMENT_CATEGORIES];
  all.forEach((c) => {
    const active = state.activeCategory === c.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { marginBottom: '2px' },
      onClick: () => {
        state.activeCategory = c.id;
        refreshAll();
      },
    }, c.icon + ' ' + c.label));
  });
  return wrap;
}

/* ==========================================================================
   8. نموذج الالتزام
   ========================================================================== */

function openCommitmentForm(existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: إيجار الشقة',
    value: isEdit ? (existing.name || '') : '',
  });

  const catSelect = el('select', { className: 'select' });
  COMMITMENT_CATEGORIES.forEach((c) => {
    const o = el('option', { value: c.id }, c.icon + ' ' + c.label);
    if (isEdit && existing.category === c.id) o.selected = true;
    catSelect.appendChild(o);
  });

  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.amount || '') : '',
  });

  const freqSelect = el('select', { className: 'select' });
  COMMITMENT_FREQUENCIES.forEach((f) => {
    const o = el('option', { value: f.id }, f.icon + ' ' + f.label);
    if (isEdit ? existing.frequency === f.id : f.id === 'monthly') o.selected = true;
    freqSelect.appendChild(o);
  });

  const dueInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '31', placeholder: '1-31 (اختياري)',
    value: isEdit && existing.dueDay ? String(existing.dueDay) : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const activeCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  activeCheckbox.checked = isEdit ? existing.active !== false : true;
  const activeToggle = el('label', { className: 'toggle' }, [
    activeCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'نشط حالياً'),
  ]);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الالتزام *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التصنيف *'), catSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الدورية'), freqSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'يوم الاستحقاق'), dueInput]),
    el('div', { className: 'field' }, [activeToggle]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل التزام' : 'إضافة التزام',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          const amount = Number(amountInput.value);
          if (!name) return toast.warning('الاسم مطلوب');
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          const dueVal = dueInput.value.trim();
          const data = {
            name,
            category: catSelect.value,
            amount,
            frequency: freqSelect.value,
            dueDay: dueVal ? Math.max(1, Math.min(31, Number(dueVal))) : null,
            notes: notesInput.value.trim(),
            active: activeCheckbox.checked,
          };
          try {
            if (isEdit) { await commitments.update(existing.id, data); toast.success('تم التحديث'); }
            else { await commitments.create(data); toast.success('تمت الإضافة'); }
            invalidateCache();
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   9. نموذج الدفعة
   ========================================================================== */

function openPaymentForm(commitment) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01',
    value: String(Math.round(commitment.monthlyEquivalent || commitment.amount || 0)),
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = localDateInput();

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const body = el('div', {}, [
    el('div', {
      style: { padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, commitment.name),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        'المتوقع شهرياً: ' + formatEGP(commitment.monthlyEquivalent)),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ *'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
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
            await commitmentPayments.create({
              commitmentId: commitment.id,
              amount,
              date: new Date(dateInput.value).getTime(),
              notes: notesInput.value.trim(),
            });
            toast.success('تم تسجيل الدفعة');
            invalidateCache();
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   10. تفاصيل الالتزام (Modal داخلي قديم — بقي للاستخدام كزر "👁️")
   ========================================================================== */

async function openCommitmentDetail(item) {
  const payments = await commitmentPayments.listByCommitment(item.id);
  const cat = COMMITMENT_CAT_MAP[item.category] || COMMITMENT_CAT_MAP.other;
  const freq = COMMITMENT_FREQ_MAP[item.frequency] || COMMITMENT_FREQ_MAP.monthly;

  const body = el('div', {}, [
    el('div', { style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '8px' } }, item.name),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, cat.icon + ' ' + cat.label),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, freq.icon + ' ' + freq.label),
    item.dueDay ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, '📅 يوم ' + item.dueDay) : null,
    item.notes ? el('div', { style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' } }, item.notes) : null,
  ]);

  body.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' },
  }, [
    el('div', { style: { padding: '10px', background: '#E8F5E9', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#2E7D32' } }, '✅ مدفوع هذا الشهر'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#2E7D32', marginTop: '2px' } },
        formatEGP(item.paidThisMonth)),
    ]),
    el('div', { style: { padding: '10px', background: '#FFF3E0', borderRadius: '8px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '11px', color: '#F57C00' } }, '⏳ متبقي'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#F57C00', marginTop: '2px' } },
        formatEGP(item.remaining)),
    ]),
  ]));

  body.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  }, [
    el('div', {
      style: {
        width: item.progressPercent + '%', height: '100%',
        background: item.progressPercent >= 100 ? '#2E7D32' : '#1F6D57',
        transition: 'width 0.4s',
      },
    }),
  ]));

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

  const handle = modal.open({
    title: 'تفاصيل الالتزام',
    body,
    closable: true,
  });
}

/* ==========================================================================
   11. رسم قائمة الالتزامات
   ========================================================================== */

function buildCommitmentCard(item) {
  const cat = COMMITMENT_CAT_MAP[item.category] || COMMITMENT_CAT_MAP.other;
  const freq = COMMITMENT_FREQ_MAP[item.frequency] || COMMITMENT_FREQ_MAP.monthly;
  const paid = item.paidThisMonth >= item.monthlyEquivalent && item.monthlyEquivalent > 0;
  const isOverdue = !paid && item.dueDay && item.dueDay < new Date().getDate();

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': item.id,
    onClick: () => previewCommitment(item, () => openCommitmentForm(item)),
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, cat.icon + ' ' + item.name),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        freq.icon + ' ' + freq.label + (item.dueDay ? ' · 📅 يوم ' + item.dueDay : '')),
    ]),
    el('div', { style: { textAlign: 'left', fontSize: '13px' } }, [
      el('div', { style: { fontWeight: '700', color: '#123C2F' } }, formatEGP(item.monthlyEquivalent)),
      isOverdue ? el('div', { style: { fontSize: '10px', color: '#C62828', fontWeight: '600' } }, '⚠️ متأخر') : null,
      paid ? el('div', { style: { fontSize: '10px', color: '#2E7D32', fontWeight: '600' } }, '✅ مدفوع') : null,
    ]),
  ]));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: item.progressPercent + '%', height: '100%',
        background: isOverdue ? '#C62828' : (paid ? '#2E7D32' : '#1F6D57'),
        transition: 'width 0.4s',
      },
    }),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' },
  }, [
    el('span', {}, 'مدفوع: ' + formatEGP(item.paidThisMonth)),
    el('span', {}, 'متبقي: ' + formatEGP(item.remaining)),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openPaymentForm(item),
    }, '💵 دفعة'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openCommitmentForm(item),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => openCommitmentDetail(item),
    }, '👁️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف التزام',
          message: 'حذف "' + item.name + '"؟',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          const pays = await commitmentPayments.listByCommitment(item.id);
          for (const p of pays) await commitmentPayments.remove(p.id);
          await commitments.remove(item.id);
          toast.success('تم الحذف');
          invalidateCache();
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️'),
  ]));

  return card;
}

function renderCommitmentsList() {
  const wrap = state.container?.querySelector('#cm-list');
  if (!wrap) return;
  clear(wrap);

  let list = state.withPayments;
  if (state.activeCategory !== 'all') {
    list = list.filter((c) => (c.category || 'other') === state.activeCategory);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => String(c.name || '').toLowerCase().includes(q));
  }

  if (list.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '💳'),
      el('h2', { className: 'empty-state__title' }, q ? 'لا نتائج' : 'لا توجد التزامات'),
      el('p', { className: 'empty-state__text' }, q ? 'جرّب كلمة أخرى' : 'اضغط "إضافة التزام" للبدء'),
    ]));
    return;
  }

  list.forEach((c) => wrap.appendChild(buildCommitmentCard(c)));
}

/* ==========================================================================
   12. رسم قائمة الأهداف
   ========================================================================== */

function openGoalForm(existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: شراء ماكينة خياطة',
    value: isEdit ? (existing.name || '') : '',
  });

  const targetInput = el('input', {
    className: 'input', type: 'number', min: '1', step: '0.01', placeholder: '5000',
    value: isEdit ? (existing.targetAmount || '') : '',
  });

  const currentInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.currentAmount || '') : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الهدف *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ المستهدف *'), targetInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ الحالي'), currentInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل هدف' : 'إضافة هدف ادخار',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          const target = Number(targetInput.value);
          const current = Number(currentInput.value) || 0;
          if (!name) return toast.warning('الاسم مطلوب');
          if (!target || target <= 0) return toast.warning('أدخل مبلغاً مستهدفاً صحيحاً');
          const data = {
            name,
            targetAmount: target,
            currentAmount: Math.max(0, current),
            notes: notesInput.value.trim(),
          };
          try {
            if (isEdit) { await savingsGoals.update(existing.id, data); toast.success('تم التحديث'); }
            else { await savingsGoals.create(data); toast.success('تمت الإضافة'); }
            invalidateCache();
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

function openGoalDeposit(goal) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01',
    placeholder: '0',
  });

  const body = el('div', {}, [
    el('div', {
      style: { padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, goal.name),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        'متبقي: ' + formatEGP(goal.remaining) + ' من ' + formatEGP(goal.targetAmount)),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
  ]);

  const handle = modal.open({
    title: '💰 إيداع في الهدف',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'إيداع', variant: 'primary', action: 'save',
        onClick: async () => {
          const amount = Number(amountInput.value);
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          try {
            await savingsGoals.deposit(goal.id, amount);
            toast.success('تم الإيداع');
            invalidateCache();
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

function buildGoalCard(goal) {
  const completed = goal.progressPercent >= 100;

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': goal.id,
    onClick: () => previewGoal(goal, () => openGoalForm(goal)),
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  }, [
    el('div', { style: { flex: '1', fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
      (completed ? '✅ ' : '🎯 ') + goal.name),
    el('span', {
      style: {
        fontSize: '12px', fontWeight: '700',
        color: completed ? '#2E7D32' : '#1F6D57',
      },
    }, goal.progressPercent + '%'),
  ]));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: goal.progressPercent + '%', height: '100%',
        background: completed ? '#2E7D32' : 'linear-gradient(90deg, #4CAF50, #2E7D32)',
        transition: 'width 0.4s',
      },
    }),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' },
  }, [
    el('span', {}, formatEGP(goal.currentAmount) + ' / ' + formatEGP(goal.targetAmount)),
    el('span', { style: { fontWeight: '600' } }, 'متبقي: ' + formatEGP(goal.remaining)),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
    onClick: (e) => e.stopPropagation(),
  }, [
    !completed ? el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openGoalDeposit(goal),
    }, '💰 إيداع') : null,
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openGoalForm(goal),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف هدف',
          message: 'حذف "' + goal.name + '"؟',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          await savingsGoals.remove(goal.id);
          toast.success('تم الحذف');
          invalidateCache();
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️'),
  ]));

  return card;
}

function renderGoalsList() {
  const wrap = state.container?.querySelector('#cm-list');
  if (!wrap) return;
  clear(wrap);

  let list = state.goals;
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((g) => String(g.name || '').toLowerCase().includes(q));
  }

  if (list.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🏦'),
      el('h2', { className: 'empty-state__title' }, q ? 'لا نتائج' : 'لا توجد أهداف ادخار'),
      el('p', { className: 'empty-state__text' }, q ? 'جرّب كلمة أخرى' : 'اضغط "إضافة هدف" للبدء'),
    ]));
    return;
  }

  list.forEach((g) => wrap.appendChild(buildGoalCard(g)));
}

/* ==========================================================================
   13. الصفحة الرئيسية
   ========================================================================== */

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  c.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '💳 المالية الشخصية'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'الالتزامات الشهرية وأهداف الادخار'),
  ]));

  if (!state.stats.hasData) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '💳'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد بيانات'),
      el('p', { className: 'empty-state__text' }, 'ابدأ بإضافة أول التزام أو هدف ادخار'),
    ]));
    c.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '12px' },
      onClick: () => openCommitmentForm(),
    }, '➕ إضافة التزام'));
    return;
  }

  c.appendChild(renderTabs());

  if (state.activeTab === 'commitments') {
    c.appendChild(renderStats());
    c.appendChild(renderHealth());
    const alerts = renderAlerts();
    if (alerts) c.appendChild(alerts);

    c.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openCommitmentForm(),
    }, '➕ إضافة التزام'));

    c.appendChild(renderSearchBox());
    c.appendChild(renderCategoryFilters());

    c.appendChild(el('div', { id: 'cm-list' }));
    renderCommitmentsList();
  }
  else {
    c.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openGoalForm(),
    }, '➕ إضافة هدف'));

    if (state.stats.goalsCount > 0) {
      c.appendChild(el('div', {
        className: 'card', style: { marginBottom: '12px' },
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' } }, [
          el('span', { style: { fontWeight: '600', color: '#123C2F' } }, '🏦 إجمالي الأهداف'),
          el('span', { style: { color: '#2E8B6F' } }, state.stats.goalsCount + ' هدف'),
        ]),
        el('div', {
          style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' },
        }, [
          el('span', {}, 'المجموع: ' + formatEGP(state.stats.totalGoalCurrent)),
          el('span', {}, 'الهدف: ' + formatEGP(state.stats.totalGoalTarget)),
        ]),
      ]));
    }

    c.appendChild(renderSearchBox());
    c.appendChild(el('div', { id: 'cm-list' }));
    renderGoalsList();
  }
}

/* ==========================================================================
   14. تحميل + تحديث
   ========================================================================== */

async function refreshAll() {
  try {
    await loadData();
    renderPage();
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   15. API
   ========================================================================== */

export const commitmentsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeTab = 'commitments';
    state.activeCategory = 'all';
    state.searchQuery = '';
    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      activeTab: 'commitments',
      activeCategory: 'all',
      searchQuery: '',
      stats: null,
      withPayments: [],
      goals: [],
    };
  },
};
