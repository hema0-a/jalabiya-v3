/* ==========================================================================
   workers.js — صفحة العمال (CRUD + نوع أجر + سجل الدفعات)
   ==========================================================================
   - نوع أجر: ثابت / بالقطعة / يومي / ساعي.
   - تبويبان: العمال / الدفعات.
   - إحصائيات: عمال نشط + رواتب ثابتة شهرية + مدفوع هذا الشهر.
   - Quick Preview + واتساب.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { workers } from '../data/repos/workers.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewWorker } from '../ui/quick-preview.js';
import { formatEGP, formatDate, normalizePhone, localDateInput } from '../core/utils.js';

/* --- ثوابت --- */
const SPECIALTIES = [
  'خياط', 'كوّاي', 'قصّار', 'مطرّز', 'مساعد', 'تغليف', 'أخرى',
];

const SALARY_TYPES = [
  { id: 'fixed',     label: 'ثابت شهري',   icon: '📅', unit: 'ج.م / شهر' },
  { id: 'per_piece', label: 'بالقطعة',     icon: '👕', unit: 'ج.م / قطعة' },
  { id: 'daily',     label: 'يومي',        icon: '📆', unit: 'ج.م / يوم' },
  { id: 'hourly',    label: 'ساعي',        icon: '⏱️', unit: 'ج.م / ساعة' },
];

const SALARY_TYPE_MAP = {};
SALARY_TYPES.forEach((t) => { SALARY_TYPE_MAP[t.id] = t; });

/* --- الحالة --- */
let state = {
  container: null,
  workers: [],
  payments: [],
  activeTab: 'workers',       // 'workers' | 'payments'
  activeFilter: 'all',
  searchQuery: '',
};

/* ==========================================================================
   1. الفلترة
   ========================================================================== */

export function filterWorkers(list, filterId) {
  if (filterId === 'all') return list;
  if (filterId === 'active') return list.filter((w) => w.active !== false);
  if (filterId === 'inactive') return list.filter((w) => w.active === false);
  return list;
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [wList, pList] = await Promise.all([
    workers.list(),
    workerPayments.list(),
  ]);
  wList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  pList.sort((a, b) => (b.date || 0) - (a.date || 0));
  state.workers = wList;
  state.payments = pList;
}

/**
 * إجمالي مدفوعات عامل في الشهر الحالي.
 * @param {string} workerId
 * @returns {number}
 */
function getPaidThisMonth(workerId) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 1).getTime();
  return state.payments
    .filter((p) =>
      p.workerId === workerId &&
      p.date && p.date >= start && p.date < end
    )
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

/* ==========================================================================
   3. نموذج العامل
   ========================================================================== */

function openWorkerForm(existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم العامل',
    value: isEdit ? (existing.name || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  /* التخصص */
  const specSelect = el('select', { className: 'select' });
  specSelect.appendChild(el('option', { value: '' }, '— اختر تخصصاً —'));
  SPECIALTIES.forEach((s) => {
    const o = el('option', { value: s }, s);
    if (isEdit && existing.specialty === s) o.selected = true;
    specSelect.appendChild(o);
  });

  /* نوع الأجر */
  const salaryTypeSelect = el('select', { className: 'select' });
  SALARY_TYPES.forEach((t) => {
    const o = el('option', { value: t.id }, t.icon + ' ' + t.label);
    if (isEdit ? existing.salaryType === t.id : t.id === 'fixed') o.selected = true;
    salaryTypeSelect.appendChild(o);
  });

  /* قيمة الأجر */
  const salaryInput = el('input', {
    className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01',
    value: isEdit ? (existing.salary || '') : '',
  });

  const salaryUnit = el('div', {
    style: { fontSize: '11px', color: '#666', marginTop: '4px' },
  }, 'ج.م / شهر');

  salaryTypeSelect.addEventListener('change', () => {
    const t = SALARY_TYPE_MAP[salaryTypeSelect.value];
    salaryUnit.textContent = t ? t.unit : '';
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const activeCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  activeCheckbox.checked = isEdit ? (existing.active !== false) : true;

  const activeToggle = el('label', { className: 'toggle' }, [
    activeCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'نشط حالياً'),
  ]);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التخصص'), specSelect]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'نوع الأجر'),
      salaryTypeSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'قيمة الأجر'),
      salaryInput,
      salaryUnit,
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
    el('div', { className: 'field' }, [activeToggle]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل عامل' : 'إضافة عامل',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');

          const data = {
            name,
            phone: phoneInput.value.trim(),
            specialty: specSelect.value || 'أخرى',
            salaryType: salaryTypeSelect.value,
            salary: Number(salaryInput.value) || 0,
            notes: notesInput.value.trim(),
            active: activeCheckbox.checked,
          };

          try {
            if (isEdit) {
              await workers.update(existing.id, data);
              toast.success('تم التحديث');
            } else {
              await workers.create(data);
              toast.success('تم الإضافة');
            }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. نموذج دفعة
   ========================================================================== */

function openPaymentForm(worker) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01',
    placeholder: '0',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = localDateInput();

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const salaryType = SALARY_TYPE_MAP[worker.salaryType] || SALARY_TYPE_MAP.fixed;

  const body = el('div', {}, [
    el('div', {
      style: {
        padding: '10px', background: '#F6F1E6', borderRadius: '8px',
        marginBottom: '12px', fontSize: '13px',
      },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, worker.name),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        salaryType.icon + ' ' + salaryType.label + ' — ' + formatEGP(worker.salary || 0)),
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
            await workerPayments.create({
              workerId: worker.id,
              amount,
              date: new Date(dateInput.value).getTime(),
              notes: notesInput.value.trim(),
            });
            toast.success('تم تسجيل الدفعة');
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   5. تفاصيل العامل + سجل الدفعات
   ========================================================================== */

async function openWorkerDetail(worker) {
  const payments = await workerPayments.listByWorker(worker.id);
  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const salaryType = SALARY_TYPE_MAP[worker.salaryType] || SALARY_TYPE_MAP.fixed;
  const isActive = worker.active !== false;

  const body = el('div', {}, [
    el('div', {
      style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '8px' },
    }, worker.name),
    el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '4px' },
    }, '👷 ' + (worker.specialty || '—')),
    worker.phone ? el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '4px' },
    }, '📞 ' + worker.phone) : null,
    el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '4px' },
    }, salaryType.icon + ' ' + salaryType.label + ': ' + formatEGP(worker.salary || 0)),
    el('div', {
      style: {
        fontSize: '13px',
        color: isActive ? '#2E7D32' : '#C62828',
        marginBottom: '4px',
      },
    }, isActive ? '✅ نشط' : '🚫 معطَّل'),
    worker.notes ? el('div', {
      style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' },
    }, worker.notes) : null,
  ]);

  /* بطاقة المدفوعات */
  body.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' },
  }, [
    el('div', {
      style: { padding: '10px', background: '#E8F5E9', borderRadius: '8px', textAlign: 'center' },
    }, [
      el('div', { style: { fontSize: '11px', color: '#2E7D32' } }, '💰 إجمالي مدفوع'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#2E7D32', marginTop: '2px' } },
        formatEGP(total)),
    ]),
    el('div', {
      style: { padding: '10px', background: '#E3F2FD', borderRadius: '8px', textAlign: 'center' },
    }, [
      el('div', { style: { fontSize: '11px', color: '#1565C0' } }, '📜 عدد الدفعات'),
      el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#1565C0', marginTop: '2px' } },
        String(payments.length)),
    ]),
  ]));

  /* سجل الدفعات */
  if (payments.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '16px 0 8px 0' },
    }, '📜 آخر الدفعات'));
    payments.slice(0, 10).forEach((p) => {
      body.appendChild(el('div', {
        style: {
          padding: '6px 10px', background: '#F6F1E6', borderRadius: '6px',
          marginBottom: '4px', display: 'flex', justifyContent: 'space-between',
          fontSize: '12px',
        },
      }, [
        el('span', {}, p.date ? formatDate(p.date) : ''),
        el('span', { style: { fontWeight: '600', color: '#2E7D32' } }, formatEGP(p.amount)),
      ]));
    });
  }

  /* الأزرار */
  body.appendChild(el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' },
  }, [
    el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      onClick: () => { handle.close(); openPaymentForm(worker); },
    }, '💵 دفعة جديدة'),
    el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      onClick: () => { handle.close(); openWorkerForm(worker); },
    }, '✏️ تعديل'),
  ]));

  const handle = modal.open({
    title: 'تفاصيل العامل',
    body,
    closable: true,
  });
}

/* ==========================================================================
   6. عمليات
   ========================================================================== */

async function deleteWorker(w) {
  const ok = await modal.confirm({
    title: 'حذف عامل',
    message: 'حذف "' + w.name + '"؟ سيتم حذف كل دفعاته.',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    const pays = await workerPayments.listByWorker(w.id);
    await trash.addToTrash('workers', w);          /* أولاً: حتى لا تضيع الدفعات إن فشل الحفظ */
    for (const p of pays) await workerPayments.remove(p.id);
    await workers.remove(w.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

async function toggleActive(w) {
  try {
    await workers.toggleActive(w.id);
    toast.info(w.active === false ? 'تم التفعيل' : 'تم التعطيل');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

async function deletePayment(payment) {
  const ok = await modal.confirm({
    title: 'حذف دفعة',
    message: 'حذف دفعة بقيمة ' + formatEGP(payment.amount) + '؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await workerPayments.remove(payment.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

/* ==========================================================================
   7. بطاقة العامل
   ========================================================================== */

function buildWorkerCard(w) {
  const isActive = w.active !== false;
  const initial = String(w.name || '?').charAt(0) || '?';
  const salaryType = SALARY_TYPE_MAP[w.salaryType] || SALARY_TYPE_MAP.fixed;
  const paidThisMonth = getPaidThisMonth(w.id);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', opacity: isActive ? '1' : '0.6', cursor: 'pointer' },
    'data-id': w.id,
    onClick: () => previewWorker(w, () => openWorkerForm(w)),
  });

  /* الرأس */
  card.appendChild(el('div', {
    style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: '40px', height: '40px', borderRadius: '50%',
        background: isActive ? 'linear-gradient(135deg, #2E8B6F, #1F6D57)' : '#ccc',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', fontWeight: '600', flexShrink: '0',
      },
    }, initial),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, w.name),
      el('div', { style: { fontSize: '12px', color: '#2E8B6F' } },
        salaryType.icon + ' ' + (w.specialty || salaryType.label)),
    ]),
    w.salary ? el('div', {
      style: { fontSize: '13px', fontWeight: '600', color: '#B8863B', textAlign: 'left' },
    }, formatEGP(w.salary)) : null,
  ]));

  /* الشارات */
  const badges = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  });

  badges.appendChild(el('span', {
    style: {
      fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '10px',
      color: isActive ? '#2E7D32' : '#666',
      background: isActive ? '#E8F5E9' : '#F0EAE0',
    },
  }, isActive ? '✅ نشط' : '🚫 معطَّل'));

  badges.appendChild(el('span', {
    style: {
      fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '10px',
      color: '#1565C0', background: '#E3F2FD',
    },
  }, '📅 ' + salaryType.label));

  if (paidThisMonth > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '10px',
        color: '#2E7D32', background: '#E8F5E9',
      },
    }, '💵 مدفوع: ' + formatEGP(paidThisMonth)));
  }

  card.appendChild(badges);

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openPaymentForm(w),
    }, '💵 دفعة'),
    el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--ghost' : 'btn--secondary'),
      type: 'button',
      onClick: () => toggleActive(w),
    }, isActive ? '🚫' : '✅'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openWorkerForm(w),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteWorker(w),
    }, '🗑️'),
  ]));

  return card;
}

/* ==========================================================================
   8. رسم الدفعات
   ========================================================================== */

function buildPaymentRow(payment) {
  const w = state.workers.find((x) => x.id === payment.workerId);
  const name = w ? w.name : 'عامل محذوف';

  const row = el('div', {
    className: 'card',
    style: { marginBottom: '8px', padding: '10px 12px' },
  });

  row.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '14px' } },
        '👷 ' + name),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📅 ' + (payment.date ? formatDate(payment.date) : '—') +
        (payment.notes ? ' · 📝 ' + payment.notes : '')),
    ]),
    el('div', { style: { fontWeight: '700', color: '#2E7D32', fontSize: '15px' } },
      formatEGP(payment.amount)),
  ]));

  row.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
  }, [
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deletePayment(payment),
    }, '🗑️ حذف'),
  ]));

  return row;
}

/* ==========================================================================
   9. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#workers-stats');
  if (!wrap) return;
  clear(wrap);

  const total = state.workers.length;
  const active = state.workers.filter((w) => w.active !== false).length;
  const fixedTotal = state.workers
    .filter((w) => w.active !== false && w.salaryType === 'fixed')
    .reduce((s, w) => s + (Number(w.salary) || 0), 0);

  /* مدفوع هذا الشهر */
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const paidThisMonth = state.payments
    .filter((p) => p.date && p.date >= start && p.date < end)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '👷'),
    el('span', { className: 'stat__value', style: { fontSize: '16px' } }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي (' + active + ' نشط)'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#B8863B' } },
      formatEGP(fixedTotal)),
    el('span', { className: 'stat__label' }, 'رواتب ثابتة / شهر'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💵'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#2E7D32' } },
      formatEGP(paidThisMonth)),
    el('span', { className: 'stat__label' }, 'مدفوع هذا الشهر'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📜'),
    el('span', { className: 'stat__value', style: { fontSize: '16px' } },
      String(state.payments.length)),
    el('span', { className: 'stat__label' }, 'عدد الدفعات'),
  ]));
}

function renderTabs() {
  const wrap = state.container?.querySelector('#workers-tabs');
  if (!wrap) return;
  clear(wrap);

  const tabs = [
    { id: 'workers',  icon: '👷', label: 'العمال' },
    { id: 'payments', icon: '💵', label: 'الدفعات' },
  ];

  tabs.forEach((t) => {
    const active = state.activeTab === t.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => {
        state.activeTab = t.id;
        state.activeFilter = 'all';
        state.searchQuery = '';
        renderPage();
      },
    }, t.icon + ' ' + t.label));
  });
}

function renderFilters() {
  const wrap = state.container?.querySelector('#workers-filters');
  if (!wrap) return;
  clear(wrap);

  if (state.activeTab !== 'workers') return;

  const items = [
    { id: 'all',      label: 'الكل' },
    { id: 'active',   label: 'نشط' },
    { id: 'inactive', label: 'معطَّل' },
  ];
  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters();
        renderList();
      },
    }, it.label));
  });
}

function applySearch(list) {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) return list;
  return list.filter((x) => String(x.name || '').toLowerCase().includes(q));
}

function renderList() {
  const lc = state.container?.querySelector('#workers-list');
  if (!lc) return;
  clear(lc);

  if (state.activeTab === 'payments') {
    const filtered = applySearch(state.payments.map((p) => ({
      ...p,
      name: (state.workers.find((w) => w.id === p.workerId) || {}).name || '',
    })));

    if (filtered.length === 0) {
      lc.appendChild(el('div', { className: 'empty-state' }, [
        el('div', { className: 'empty-state__icon' }, '💵'),
        el('h2', { className: 'empty-state__title' }, 'لا توجد دفعات'),
        el('p', { className: 'empty-state__text' }, 'ستظهر الدفعات هنا'),
      ]));
      return;
    }
    filtered.forEach((p) => lc.appendChild(buildPaymentRow(p)));
    return;
  }

  /* وضع العمال */
  let list = filterWorkers(state.workers, state.activeFilter);
  list = applySearch(list);

  if (list.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '👷'),
      el('h2', { className: 'empty-state__title' }, 'لا يوجد عمال'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة عامل" للبدء'),
    ]));
    return;
  }
  list.forEach((w) => lc.appendChild(buildWorkerCard(w)));
}

function renderPage() {
  const c = state.container;
  if (!c) return;

  /* مسح العناصر الديناميكية فقط */
  const stats = c.querySelector('#workers-stats');
  const tabs = c.querySelector('#workers-tabs');
  const search = c.querySelector('#workers-search');
  const addBtn = c.querySelector('#workers-add-btn');
  const filters = c.querySelector('#workers-filters');

  /* إعادة الرسم الكامل للتبويب النشط */
  if (stats) { clear(stats); renderStats(); }
  if (tabs) { clear(tabs); renderTabs(); }
  if (filters) { clear(filters); renderFilters(); }

  /* إظهار/إخفاء العناصر حسب التبويب */
  if (search) search.style.display = state.activeTab === 'workers' ? '' : 'none';
  if (addBtn) addBtn.style.display = state.activeTab === 'workers' ? '' : 'none';
  if (filters) filters.style.display = state.activeTab === 'workers' ? '' : 'none';

  renderList();
}

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
   10. API
   ========================================================================== */

export const workersPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeTab = 'workers';
    state.activeFilter = 'all';
    state.searchQuery = '';

    container.appendChild(el('div', {
      id: 'workers-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    container.appendChild(el('div', {
      id: 'workers-tabs',
      style: {
        display: 'flex',
        gap: '4px',
        marginBottom: '12px',
        background: '#F6F1E6',
        padding: '4px',
        borderRadius: '10px',
      },
    }));

    const searchInput = el('input', {
      className: 'input',
      type: 'search',
      placeholder: '🔍 ابحث بالاسم...',
      style: { marginBottom: '8px' },
    });
    searchInput.id = 'workers-search';
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    const addBtn = el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openWorkerForm(),
    }, '➕ إضافة عامل');
    addBtn.id = 'workers-add-btn';
    container.appendChild(addBtn);

    container.appendChild(el('div', {
      id: 'workers-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'workers-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      workers: [],
      payments: [],
      activeTab: 'workers',
      activeFilter: 'all',
      searchQuery: '',
    };
  },
};
