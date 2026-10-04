/* ==========================================================================
   workers.js — صفحة العمال
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { workers } from '../data/repos/workers.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatEGP } from '../core/utils.js';

let state = { workers: [], activeFilter: 'all', container: null };

export function filterWorkers(list, filterId) {
  if (filterId === 'all') return list;
  if (filterId === 'active') return list.filter((w) => w.active !== false);
  if (filterId === 'inactive') return list.filter((w) => w.active === false);
  return list;
}

async function loadData() {
  const list = await workers.list();
  list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  state.workers = list;
}

function openWorkerForm(existing = null) {
  const isEdit = existing !== null;
  const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'اسم العامل' });
  if (isEdit) nameInput.value = existing.name || '';

  const phoneInput = el('input', { className: 'input', type: 'tel', placeholder: '01xxxxxxxxx' });
  if (isEdit) phoneInput.value = existing.phone || '';

  const roleInput = el('input', { className: 'input', type: 'text', placeholder: 'مثال: خياط، كوّاي' });
  if (isEdit) roleInput.value = existing.role || '';

  const salaryInput = el('input', { className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01' });
  if (isEdit && existing.salary != null) salaryInput.value = String(existing.salary);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الدور'), roleInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الراتب الشهري (ج.م)'), salaryInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل عامل' : 'إضافة عامل',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary',
        action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = {
            name,
            phone: phoneInput.value.trim(),
            role: roleInput.value.trim(),
            salary: Number(salaryInput.value) || 0,
          };
          try {
            if (isEdit) { await workers.update(existing.id, data); toast.success('تم التحديث'); }
            else { await workers.create({ ...data, active: true }); toast.success('تم الإضافة'); }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

async function deleteWorker(w) {
  const ok = await modal.confirm({
    title: 'حذف عامل',
    message: 'حذف "' + w.name + '"؟',
    confirmText: 'حذف',
    cancelText: 'إلغاء',
    danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('workers', w);
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

function buildWorkerCard(w) {
  const isActive = w.active !== false;
  const initial = String(w.name || '?').charAt(0) || '?';

  return el('div', { className: 'card', style: { marginBottom: '8px', opacity: isActive ? '1' : '0.6' }, 'data-id': w.id }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } }, [
      el('div', {
        style: {
          width: '40px', height: '40px', borderRadius: '50%',
          background: isActive ? 'linear-gradient(135deg, #2E8B6F, #1F6D57)' : '#ccc',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: '600', flexShrink: '0',
        },
      }, initial),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F' } }, w.name),
        w.role ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, w.role) : null,
      ]),
      w.salary ? el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#B8863B' } }, formatEGP(w.salary)) : null,
    ]),
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
      el('button', {
        className: 'btn btn--sm ' + (isActive ? 'btn--ghost' : 'btn--secondary'),
        onClick: () => toggleActive(w),
      }, isActive ? '🚫 تعطيل' : '✅ تفعيل'),
      el('button', { className: 'btn btn--sm btn--secondary', onClick: () => openWorkerForm(w) }, '✏️'),
      el('button', { className: 'btn btn--sm btn--danger', onClick: () => deleteWorker(w) }, '🗑️'),
    ]),
  ]);
}

function renderStats() {
  const wrap = state.container?.querySelector('#workers-stats');
  if (!wrap) return;
  clear(wrap);
  const total = state.workers.length;
  const active = state.workers.filter((w) => w.active !== false).length;
  const totalSalary = state.workers.filter((w) => w.active !== false).reduce((s, w) => s + (Number(w.salary) || 0), 0);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '👷'),
    el('span', { className: 'stat__value' }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value' }, String(active)),
    el('span', { className: 'stat__label' }, 'نشط'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value' }, formatEGP(totalSalary)),
    el('span', { className: 'stat__label' }, 'رواتب شهرية'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#workers-filters');
  if (!wrap) return;
  clear(wrap);
  const items = [
    { id: 'all', label: 'الكل' },
    { id: 'active', label: 'نشط' },
    { id: 'inactive', label: 'معطَّل' },
  ];
  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': it.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => { state.activeFilter = it.id; renderFilters(); renderList(); },
    }, it.label));
  });
}

function renderList() {
  const lc = state.container?.querySelector('#workers-list');
  if (!lc) return;
  clear(lc);
  const filtered = filterWorkers(state.workers, state.activeFilter);
  if (filtered.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '👷'),
      el('h2', { className: 'empty-state__title' }, 'لا يوجد عمال'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة عامل" للبدء'),
    ]));
    return;
  }
  filtered.forEach((w) => lc.appendChild(buildWorkerCard(w)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderFilters();
  renderList();
}

export const workersPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    container.appendChild(el('div', {
      id: 'workers-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openWorkerForm(),
    }, '➕ إضافة عامل'));
    container.appendChild(el('div', {
      id: 'workers-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));
    container.appendChild(el('div', { id: 'workers-list' }));
    await refreshAll();
  },
  destroy() { state = { workers: [], activeFilter: 'all', container: null }; },
};
