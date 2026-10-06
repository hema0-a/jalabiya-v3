/* ==========================================================================
   referrals.js — صفحة الإحالات
   ==========================================================================
   - 3 بطاقات إحصائية (الكل / معلقة / مدفوعة).
   - بحث + فلترة بالحالة.
   - CRUD كامل.
   - زر واتساب للمُرشَّح.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { referrals } from '../data/repos/referrals.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';

/* --- الحالة --- */
let state = {
  container: null,
  items: [],
  stats: null,
  activeFilter: 'all',
  searchQuery: '',
};

/* ==========================================================================
   1. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [items, stats] = await Promise.all([
    referrals.list(),
    referrals.getStats(),
  ]);
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.items = items;
  state.stats = stats;
}

/* ==========================================================================
   2. نموذج إضافة/تعديل
   ========================================================================== */

function openReferralForm(existing = null) {
  const isEdit = existing !== null;

  const referrerInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم من أرشد',
    value: isEdit ? (existing.referrerName || '') : '',
  });

  const referredInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم العميل الجديد',
    value: isEdit ? (existing.referredName || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.referredPhone || '') : '',
  });

  const rewardInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.reward || '') : '',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = isEdit && existing.date
    ? new Date(existing.date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const paidCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  paidCheckbox.checked = isEdit ? (existing.status === 'paid') : false;

  const paidToggle = el('label', { className: 'toggle' }, [
    paidCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'تم دفع المكافأة'),
  ]);

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) noteInput.value = existing.note || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المُرشِّح *'), referrerInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المُرشَّح *'), referredInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'هاتف المُرشَّح'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المكافأة (ج.م)'), rewardInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ'), dateInput]),
    el('div', { className: 'field' }, [paidToggle]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل إحالة' : 'إضافة إحالة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const referrerName = referrerInput.value.trim();
          const referredName = referredInput.value.trim();
          if (!referrerName) return toast.warning('اسم المُرشِّح مطلوب');
          if (!referredName) return toast.warning('اسم المُرشَّح مطلوب');

          const data = {
            referrerName,
            referredName,
            referredPhone: phoneInput.value.trim(),
            reward: Number(rewardInput.value) || 0,
            date: dateInput.value ? new Date(dateInput.value).getTime() : Date.now(),
            status: paidCheckbox.checked ? 'paid' : 'pending',
            note: noteInput.value.trim(),
          };

          try {
            if (isEdit) { await referrals.update(existing.id, data); toast.success('تم التحديث'); }
            else { await referrals.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   3. حذف + تبديل الحالة
   ========================================================================== */

async function deleteReferral(item) {
  const ok = await modal.confirm({
    title: 'حذف إحالة',
    message: 'حذف إحالة "' + item.referrerName + ' → ' + item.referredName + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await referrals.remove(item.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

async function togglePaid(item) {
  try {
    await referrals.togglePaid(item.id);
    toast.info(item.status === 'paid' ? 'أُعيدت إلى معلقة' : 'تم تعليمها كمدفوعة');
    await refreshAll();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

/* ==========================================================================
   4. بطاقة إحالة
   ========================================================================== */

function buildReferralCard(item) {
  const isPaid = item.status === 'paid';
  const statusColor = isPaid ? '#2E7D32' : '#F57C00';
  const statusBg = isPaid ? '#E8F5E9' : '#FFF3E0';
  const statusLabel = isPaid ? '✅ مدفوعة' : '⏳ معلقة';

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', borderRight: '4px solid ' + statusColor, padding: '10px 12px' },
    'data-id': item.id,
  });

  /* السطر 1: الأسطر (المُرشِّح → المُرشَّح) + الحالة */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        '🤝 ' + item.referrerName + ' → ' + item.referredName),
      item.referredPhone ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📞 ' + item.referredPhone) : null,
      item.date ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📅 ' + formatDate(item.date)) : null,
    ]),
    el('div', { style: { textAlign: 'left' } }, [
      el('div', { style: { fontSize: '14px', fontWeight: '700', color: '#B8863B' } },
        formatEGP(item.reward)),
      el('span', {
        style: {
          display: 'inline-block',
          fontSize: '10px',
          fontWeight: '600',
          color: statusColor,
          background: statusBg,
          padding: '2px 8px',
          borderRadius: '10px',
          marginTop: '4px',
        },
      }, statusLabel),
    ]),
  ]));

  if (item.note) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, item.note));
  }

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  }, [
    el('button', {
      className: 'btn btn--sm ' + (isPaid ? 'btn--ghost' : 'btn--primary'), type: 'button',
      onClick: () => togglePaid(item),
    }, isPaid ? '↩️ معلقة' : '✅ دفع'),
    item.referredPhone ? el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => {
        const phone = normalizePhone(item.referredPhone).replace(/\D/g, '');
        window.open('https://wa.me/' + phone, '_blank');
      },
    }, '📱') : null,
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openReferralForm(item),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteReferral(item),
    }, '🗑️'),
  ].filter(Boolean)));

  return card;
}

/* ==========================================================================
   5. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#ref-stats');
  if (!wrap) return;
  clear(wrap);

  const s = state.stats;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🤝'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, String(s.total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏳'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#F57C00' } },
      formatEGP(s.pending.amount)),
    el('span', { className: 'stat__label' }, 'معلقة — ' + s.pending.count),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#2E7D32' } },
      formatEGP(s.paid.amount)),
    el('span', { className: 'stat__label' }, 'مدفوعة — ' + s.paid.count),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#ref-filters');
  if (!wrap) return;
  clear(wrap);

  const items = [
    { id: 'all',     label: '🎯 الكل',    count: state.stats.total },
    { id: 'pending', label: '⏳ معلقة',   count: state.stats.pending.count },
    { id: 'paid',    label: '✅ مدفوعة', count: state.stats.paid.count },
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
  let list = state.items;
  if (state.activeFilter !== 'all') {
    list = list.filter((r) => (r.status || 'pending') === state.activeFilter);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((r) =>
      String(r.referrerName || '').toLowerCase().includes(q) ||
      String(r.referredName || '').toLowerCase().includes(q) ||
      String(r.referredPhone || '').includes(q)
    );
  }
  return list;
}

function renderList() {
  const wrap = state.container?.querySelector('#ref-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters();

  if (list.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '🤝'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا توجد إحالات'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة إحالة" للبدء'),
    ]));
    return;
  }

  list.forEach((r) => wrap.appendChild(buildReferralCard(r)));
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
   6. API
   ========================================================================== */

export const referralsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '🤝 الإحالات'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'تتبّع إحالات العملاء ومكافآتهم'),
    ]));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'ref-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر إضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openReferralForm(),
    }, '➕ إضافة إحالة'));

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
      id: 'ref-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* قائمة */
    container.appendChild(el('div', { id: 'ref-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      items: [],
      stats: null,
      activeFilter: 'all',
      searchQuery: '',
    };
  },
};
