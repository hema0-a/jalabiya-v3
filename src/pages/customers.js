/* ==========================================================================
   customers.js — صفحة العملاء (CRUD كامل + بحث + VIP)
   ==========================================================================
   API:
     customersPage.render(container)  → Promise<void>
     customersPage.destroy()          → void
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { customers } from '../data/repos/customers.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

/* --- حالة الصفحة --- */
let state = {
  customers: [],
  searchQuery: '',
  container: null,
};

/* ==========================================================================
   1. منطق البحث
   ========================================================================== */

/**
 * فلترة القائمة حسب البحث (اسم أو هاتف).
 * @param {Array} list
 * @param {string} query
 * @returns {Array}
 */
export function filterCustomers(list, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => {
    const name = String(c.name || '').toLowerCase();
    const phone = String(c.phone || '');
    return name.includes(q) || phone.includes(q);
  });
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

/**
 * تحميل كل العملاء وترتيبهم بالأحدث أولاً.
 */
async function loadCustomers() {
  const list = await customers.list();
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.customers = list;
}

/* ==========================================================================
   3. نموذج إضافة/تعديل عميل
   ========================================================================== */

/**
 * فتح نافذة إضافة أو تعديل عميل.
 * @param {Object|null} [existing=null] — العميل في حالة التعديل
 */
function openCustomerForm(existing = null) {
  const isEdit = existing !== null;

  /* حقل الاسم */
  const nameInput = el('input', {
    className: 'input',
    type: 'text',
    placeholder: 'اسم العميل',
    value: isEdit ? (existing.name || '') : '',
  });

  /* حقل الهاتف */
  const phoneInput = el('input', {
    className: 'input',
    type: 'tel',
    placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  /* حقل الملاحظات */
  const notesInput = el('textarea', {
    className: 'textarea',
    placeholder: 'ملاحظات إضافية...',
  });
  notesInput.value = isEdit ? (existing.notes || '') : '';

  /* مفتاح VIP */
  const vipCheckbox = el('input', {
    type: 'checkbox',
    className: 'toggle__input',
  });
  vipCheckbox.checked = isEdit ? Boolean(existing.vip) : false;

  const vipToggle = el('label', { className: 'toggle' }, [
    vipCheckbox,
    el('span', { className: 'toggle__track' }, [
      el('span', { className: 'toggle__thumb' }),
    ]),
    el('span', { className: 'toggle__label' }, 'عميل مميز (VIP)'),
  ]);

  /* الحاوية */
  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'الاسم *'),
      nameInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'رقم الهاتف'),
      phoneInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'ملاحظات'),
      notesInput,
    ]),
    el('div', { className: 'field' }, [vipToggle]),
  ]);

  /* فتح النافذة */
  const handle = modal.open({
    title: isEdit ? 'تعديل عميل' : 'إضافة عميل',
    body,
    closable: true,
    actions: [
      {
        text: 'إلغاء',
        variant: 'ghost',
        action: 'cancel',
        onClick: () => handle.close(),
      },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary',
        action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) {
            toast.warning('الاسم مطلوب');
            return;
          }

          const data = {
            name,
            phone: phoneInput.value.trim(),
            notes: notesInput.value.trim(),
            vip: vipCheckbox.checked,
          };

          try {
            if (isEdit) {
              await customers.update(existing.id, data);
              toast.success('تم تحديث العميل');
            } else {
              await customers.create(data);
              toast.success('تم إضافة العميل');
            }
            handle.close();
            await refreshAll();
          } catch (err) {
            toast.danger('فشل الحفظ: ' + err.message);
          }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. حذف + تبديل VIP
   ========================================================================== */

/**
 * تأكيد حذف عميل + نقله لسلة المحذوفات.
 */
async function deleteCustomer(customer) {
  const ok = await modal.confirm({
    title: 'حذف عميل',
    message: 'هل أنت متأكد من حذف "' + customer.name + '"؟',
    confirmText: 'حذف',
    cancelText: 'إلغاء',
    danger: true,
  });
  if (!ok) return;

  try {
    await trash.addToTrash('customers', customer);
    await customers.remove(customer.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) {
    toast.danger('فشل الحذف: ' + err.message);
  }
}

/**
 * تبديل حالة VIP لعميل.
 */
async function toggleVIP(customer) {
  try {
    const updated = await customers.toggleVIP(customer.id);
    if (updated && updated.vip) {
      toast.info('تم تعيينه كعميل VIP');
    } else {
      toast.info('تم إزالة تصنيف VIP');
    }
    await refreshAll();
  } catch (err) {
    toast.danger('فشل التغيير: ' + err.message);
  }
}

/* ==========================================================================
   5. بناء بطاقة عميل
   ========================================================================== */

/**
 * بناء بطاقة عرض عميل واحد.
 * @param {Object} c
 * @returns {HTMLElement}
 */
function buildCustomerCard(c) {
  const initial = String(c.name || '?').trim().charAt(0) || '?';

  /* الصف الأول: الأفاتار + الاسم/الهاتف + شارة VIP */
  const headerChildren = [
    el('div', {
      style: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: '600',
        flexShrink: '0',
      },
    }, initial),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', {
        style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' },
      }, c.name || 'بدون اسم'),
      c.phone
        ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, c.phone)
        : null,
    ]),
  ];
  if (c.vip) {
    headerChildren.push(el('span', { className: 'badge badge--accent' }, '⭐ VIP'));
  }

  const header = el('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: c.notes ? '8px' : '12px',
    },
  }, headerChildren);

  /* البطاقة */
  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px' },
    'data-id': c.id,
  }, [header]);

  /* الملاحظات */
  if (c.notes) {
    card.appendChild(el('div', {
      style: {
        fontSize: '12px',
        color: '#666',
        marginBottom: '12px',
        lineHeight: '1.4',
      },
    }, c.notes));
  }

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  }, [
    el('button', {
      className: 'btn btn--sm btn--secondary',
      'data-action': 'edit',
      onClick: () => openCustomerForm(c),
    }, '✏️ تعديل'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      'data-action': 'vip',
      onClick: () => toggleVIP(c),
    }, c.vip ? '⭐ إزالة' : '⭐ VIP'),
    el('button', {
      className: 'btn btn--sm btn--danger',
      'data-action': 'delete',
      onClick: () => deleteCustomer(c),
    }, '🗑️ حذف'),
  ]));

  return card;
}

/* ==========================================================================
   6. الرسم
   ========================================================================== */

/**
 * رسم قائمة العملاء (بعد الفلترة).
 */
function renderList() {
  const listContainer = state.container?.querySelector('#customers-list');
  if (!listContainer) return;
  clear(listContainer);

  const filtered = filterCustomers(state.customers, state.searchQuery);

  if (filtered.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    listContainer.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '👥'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا يوجد عملاء'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة بحث أخرى' : 'اضغط "إضافة عميل" للبدء'),
    ]));
    return;
  }

  filtered.forEach((c) => listContainer.appendChild(buildCustomerCard(c)));
}

/**
 * رسم الإحصائيات.
 */
function renderStats() {
  const stats = state.container?.querySelector('#customers-stats');
  if (!stats) return;
  clear(stats);

  const total = state.customers.length;
  const vips = state.customers.filter((c) => c.vip).length;

  stats.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '👥'),
    el('span', { className: 'stat__value' }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي العملاء'),
  ]));

  stats.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⭐'),
    el('span', { className: 'stat__value' }, String(vips)),
    el('span', { className: 'stat__label' }, 'عملاء VIP'),
  ]));
}

/**
 * تحديث كامل (إعادة تحميل + إعادة رسم).
 */
async function refreshAll() {
  await loadCustomers();
  renderStats();
  renderList();
}

/* ==========================================================================
   7. API عام
   ========================================================================== */

export const customersPage = {
  /**
   * عرض الصفحة داخل حاوية.
   * @param {HTMLElement} container
   */
  async render(container) {
    clear(container);
    state.container = container;
    state.searchQuery = '';

    /* قسم الإحصائيات */
    container.appendChild(el('div', {
      id: 'customers-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* شريط البحث */
    const searchInput = el('input', {
      className: 'input',
      type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الهاتف...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    /* زر إضافة عميل */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '16px' },
      onClick: () => openCustomerForm(),
    }, '➕ إضافة عميل'));

    /* قائمة العملاء */
    container.appendChild(el('div', { id: 'customers-list' }));

    /* تحميل + رسم */
    await refreshAll();
  },

  /**
   * تنظيف الصفحة عند مغادرتها.
   */
  destroy() {
    state = {
      customers: [],
      searchQuery: '',
      container: null,
    };
  },
};
