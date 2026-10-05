/* ==========================================================================
   appointments.js — صفحة المواعيد (CRUD كامل)
   ==========================================================================
   API:
     appointmentsPage.render(container)  → Promise<void>
     appointmentsPage.destroy()          → void
     filterAppointments(list, filterId)  → Array (مُصدَّرة للاختبار)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { appointments } from '../data/repos/appointments.js';
import { customers } from '../data/repos/customers.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatDate, formatTime } from '../core/utils.js';

/* --- حالة الصفحة --- */
let state = {
  appointments: [],
  customers: [],
  customerMap: {},
  activeFilter: 'upcoming',
  container: null,
};

/* --- خريطة الحالات --- */
const STATUS_MAP = {
  scheduled: { label: 'مجدول',  badge: 'badge--info'    },
  done:      { label: 'تم',     badge: 'badge--success' },
  cancelled: { label: 'ملغي',   badge: 'badge--danger'  },
};

/* ==========================================================================
   1. الفلترة (مُصدَّرة للاختبار)
   ========================================================================== */

/**
 * بداية ونهاية اليوم.
 * @returns {{start:number, end:number}}
 */
export function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return { start: startMs, end: startMs + 24 * 60 * 60 * 1000 };
}

/**
 * فلترة المواعيد حسب المعيار.
 * @param {Array} list
 * @param {string} filterId — 'today' | 'week' | 'upcoming' | 'all'
 * @returns {Array}
 */
export function filterAppointments(list, filterId) {
  const now = Date.now();
  const { start: todayStart, end: todayEnd } = getTodayRange();
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;

  if (filterId === 'today') {
    return list
      .filter((a) => a.date && a.date >= todayStart && a.date < todayEnd)
      .sort((a, b) => a.date - b.date);
  }
  if (filterId === 'week') {
    return list
      .filter((a) => a.date && a.date >= todayStart && a.date <= weekEnd)
      .sort((a, b) => a.date - b.date);
  }
  if (filterId === 'upcoming') {
    return list
      .filter((a) => a.date && a.date >= now && a.status === 'scheduled')
      .sort((a, b) => a.date - b.date);
  }
  /* all */
  return [...list].sort((a, b) => (b.date || 0) - (a.date || 0));
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [aList, cList] = await Promise.all([
    appointments.list(),
    customers.list(),
  ]);
  state.appointments = aList;
  state.customers = cList;
  state.customerMap = {};
  cList.forEach((c) => { state.customerMap[c.id] = c; });
}

/* ==========================================================================
   3. نموذج إضافة/تعديل
   ========================================================================== */

/**
 * دمج التاريخ والوقت في timestamp.
 * @param {string} dateStr — YYYY-MM-DD
 * @param {string} timeStr — HH:mm
 * @returns {number}
 */
function combineDateTime(dateStr, timeStr) {
  if (!dateStr) return 0;
  const time = timeStr || '09:00';
  return new Date(dateStr + 'T' + time).getTime();
}

/**
 * تحويل timestamp إلى { dateStr, timeStr }.
 */
function splitDateTime(ts) {
  if (!ts) {
    const d = new Date();
    return {
      dateStr: d.toISOString().slice(0, 10),
      timeStr: '09:00',
    };
  }
  const d = new Date(ts);
  return {
    dateStr: d.toISOString().slice(0, 10),
    timeStr: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
  };
}

function openAppointmentForm(existing = null) {
  const isEdit = existing !== null;

  /* العنوان */
  const titleInput = el('input', {
    className: 'input', type: 'text',
    placeholder: 'مثال: قياس، تسليم، تعديل',
    value: isEdit ? (existing.title || '') : '',
  });

  /* العميل */
  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— اختر عميلاً —'));
  state.customers.forEach((c) => {
    customerSelect.appendChild(el('option', { value: c.id }, c.name));
  });
  if (isEdit && existing.customerId) customerSelect.value = existing.customerId;

  /* التاريخ + الوقت */
  const dt = splitDateTime(isEdit ? existing.date : Date.now() + 86400000);
  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = dt.dateStr;
  const timeInput = el('input', { className: 'input', type: 'time' });
  timeInput.value = dt.timeStr;

  /* الحالة */
  const statusSelect = el('select', { className: 'select' });
  Object.entries(STATUS_MAP).forEach(([v, info]) => {
    statusSelect.appendChild(el('option', { value: v }, info.label));
  });
  statusSelect.value = isEdit ? (existing.status || 'scheduled') : 'scheduled';

  /* الملاحظات */
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'العنوان'),
      titleInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'العميل *'),
      customerSelect,
    ]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label' }, 'التاريخ *'),
        dateInput,
      ]),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label' }, 'الوقت'),
        timeInput,
      ]),
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'الحالة'),
      statusSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'ملاحظات'),
      notesInput,
    ]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل موعد' : 'إضافة موعد',
    body,
    closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          if (!customerId) return toast.warning('اختر عميلاً');
          if (!dateInput.value) return toast.warning('التاريخ مطلوب');

          const data = {
            title: titleInput.value.trim() || 'موعد',
            customerId,
            date: combineDateTime(dateInput.value, timeInput.value),
            status: statusSelect.value,
            notes: notesInput.value.trim(),
          };

          try {
            if (isEdit) { await appointments.update(existing.id, data); toast.success('تم التحديث'); }
            else { await appointments.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. عمليات (حذف، تغيير حالة)
   ========================================================================== */

async function deleteAppointment(a) {
  const c = state.customerMap[a.customerId];
  const ok = await modal.confirm({
    title: 'حذف موعد',
    message: 'حذف موعد "' + (a.title || 'موعد') + '"' + (c ? ' للعميل ' + c.name : '') + '؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('appointments', a);
    await appointments.remove(a.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

async function changeStatus(a, newStatus) {
  try {
    await appointments.update(a.id, { status: newStatus });
    toast.info('الحالة: ' + STATUS_MAP[newStatus].label);
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

/* ==========================================================================
   5. بناء بطاقة موعد
   ========================================================================== */

function buildAppointmentCard(a) {
  const c = state.customerMap[a.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const info = STATUS_MAP[a.status] || STATUS_MAP.scheduled;

  /* الصف الأول: العنوان + الحالة */
  const header = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' },
  }, [
    el('div', { style: { flex: '1', fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
      a.title || 'موعد'),
    el('span', { className: 'badge ' + info.badge }, info.label),
  ]);

  /* الصف الثاني: العميل + التاريخ/الوقت */
  const meta = el('div', {
    style: { display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#666', marginBottom: '8px' },
  }, [
    el('span', {}, '👤 ' + name),
    a.date ? el('span', {}, '📅 ' + formatDate(a.date)) : null,
    a.date ? el('span', {}, '🕐 ' + formatTime(a.date)) : null,
  ]);

  const card = el('div', {
    className: 'card', style: { marginBottom: '8px' },
    'data-id': a.id,
  }, [header, meta]);

  if (a.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, a.notes));
  }

  /* الأزرار */
  const actions = [];
  if (a.status === 'scheduled') {
    actions.push(el('button', {
      className: 'btn btn--sm btn--primary',
      'data-action': 'done',
      onClick: () => changeStatus(a, 'done'),
    }, '✅ تم'));
    actions.push(el('button', {
      className: 'btn btn--sm btn--ghost',
      'data-action': 'cancel',
      onClick: () => changeStatus(a, 'cancelled'),
    }, '❌ إلغاء'));
  } else {
    actions.push(el('button', {
      className: 'btn btn--sm btn--secondary',
      'data-action': 'reopen',
      onClick: () => changeStatus(a, 'scheduled'),
    }, '↩️ إعادة'));
  }
  actions.push(el('button', {
    className: 'btn btn--sm btn--secondary',
    'data-action': 'edit',
    onClick: () => openAppointmentForm(a),
  }, '✏️'));
  actions.push(el('button', {
    className: 'btn btn--sm btn--danger',
    'data-action': 'delete',
    onClick: () => deleteAppointment(a),
  }, '🗑️'));

  card.appendChild(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, actions));

  return card;
}

/* ==========================================================================
   6. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#appointments-stats');
  if (!wrap) return;
  clear(wrap);

  const { start, end } = getTodayRange();
  const now = Date.now();
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;

  const todayCount = state.appointments.filter(
    (a) => a.date && a.date >= start && a.date < end
  ).length;

  const weekCount = state.appointments.filter(
    (a) => a.date && a.date >= start && a.date <= weekEnd
  ).length;

  const upcomingCount = state.appointments.filter(
    (a) => a.date && a.date >= now && a.status === 'scheduled'
  ).length;

  const items = [
    { icon: '📅', value: String(todayCount), label: 'اليوم' },
    { icon: '📆', value: String(weekCount), label: 'هذا الأسبوع' },
    { icon: '⏰', value: String(upcomingCount), label: 'قادمة' },
  ];

  items.forEach((it) => {
    wrap.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, it.icon),
      el('span', { className: 'stat__value' }, it.value),
      el('span', { className: 'stat__label' }, it.label),
    ]));
  });
}

function renderFilters() {
  const wrap = state.container?.querySelector('#appointments-filters');
  if (!wrap) return;
  clear(wrap);

  const filters = [
    { id: 'today',    label: 'اليوم' },
    { id: 'week',     label: 'هذا الأسبوع' },
    { id: 'upcoming', label: 'القادمة' },
    { id: 'all',      label: 'الكل' },
  ];

  filters.forEach((f) => {
    const isActive = state.activeFilter === f.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': f.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = f.id;
        renderFilters();
        renderList();
      },
    }, f.label));
  });
}

function renderList() {
  const lc = state.container?.querySelector('#appointments-list');
  if (!lc) return;
  clear(lc);

  const filtered = filterAppointments(state.appointments, state.activeFilter);

  if (filtered.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '📅'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مواعيد'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة موعد" للبدء'),
    ]));
    return;
  }

  filtered.forEach((a) => lc.appendChild(buildAppointmentCard(a)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderFilters();
  renderList();
}

/* ==========================================================================
   7. API عام
   ========================================================================== */

export const appointmentsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'upcoming';

    container.appendChild(el('div', {
      id: 'appointments-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openAppointmentForm(),
    }, '➕ إضافة موعد'));

    container.appendChild(el('div', {
      id: 'appointments-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'appointments-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      appointments: [],
      customers: [],
      customerMap: {},
      activeFilter: 'upcoming',
      container: null,
    };
  },
};
