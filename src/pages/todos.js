/* ==========================================================================
   todos.js — صفحة المهام والمشتريات والملاحظات (v3.16.0)
   ==========================================================================
   ثلاثة تبويبات على مخزن واحد (kind): ✅ مهام (موعد اختياري، أولوية، تكرار) · 🛒 مشتريات (إضافة سريعة، مشاركة واتساب)
   · 📝 ملاحظات (عنوان ونص وبحث). المهمة المتكررة تنتقل لموعدها التالي عند إنجازها. الحساب في services/todos.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { todos } from '../data/repos/todos.js';
import { trash } from '../data/repos/trash.js';
import { STORES } from '../core/config.js';
import { formatDate, localDateInput, parseDateInput } from '../core/utils.js';
import {
  REPEATS, PRIORITIES, checkTodoInput, taskBucket, sortTasks, nextDue, taskSummary, shoppingText, searchNotes, normalizePriority, normalizeRepeat,
} from '../services/todos.js';

let state = { container: null, list: [], tab: 'tasks', query: '', showDone: false };
const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);
const DAY = 86400000;
async function refresh() { state.list = await todos.list(); draw(); }

/* ---------- المهام ---------- */
const BUCKET_TEXT = (t) => {
  const diff = Math.round((new Date(new Date(t.due).getFullYear(), new Date(t.due).getMonth(), new Date(t.due).getDate()).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / DAY);
  if (diff < 0) return { text: 'متأخرة ' + Math.abs(diff) + ' يوم', color: '#C62828' };
  if (diff === 0) return { text: 'اليوم', color: '#E65100' };
  if (diff === 1) return { text: 'غداً', color: '#F57C00' };
  return { text: formatDate(t.due), color: '#666' };
};

function openTaskForm(existing = null) {
  const isEdit = existing !== null;
  const titleIn = el('input', { className: 'input', type: 'text', maxlength: '120', placeholder: 'ما المطلوب؟', value: isEdit ? existing.title || '' : '' });
  const dueIn = el('input', { className: 'input', type: 'date', value: isEdit && existing.due ? localDateInput(existing.due) : '' });
  const repSel = el('select', { className: 'select' });
  REPEATS.forEach((r) => { const o = el('option', { value: r.id }, r.label); if (isEdit && normalizeRepeat(existing.repeat) === r.id) o.selected = true; repSel.appendChild(o); });
  const prSel = el('select', { className: 'select' });
  PRIORITIES.forEach((p) => { const o = el('option', { value: p.id }, p.icon + ' ' + p.label); if (isEdit && normalizePriority(existing.priority) === p.id) o.selected = true; prSel.appendChild(o); });
  const notesIn = el('textarea', { className: 'textarea', placeholder: 'تفاصيل...' });
  if (isEdit) notesIn.value = existing.notes || '';
  const handle = modal.open({
    title: isEdit ? 'تعديل مهمة' : 'مهمة جديدة',
    body: el('div', {}, [field('المهمة *', titleIn), field('الموعد', dueIn), field('التكرار', repSel), field('الأهمية', prSel), field('ملاحظات', notesIn)]),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const r = checkTodoInput({ kind: 'task', title: titleIn.value, due: dueIn.value ? parseDateInput(dueIn.value) : 0, repeat: repSel.value, priority: prSel.value, notes: notesIn.value });
          if (!r.ok) return toast.warning(r.error);
          try {
            if (isEdit) { await todos.update(existing.id, r.data); toast.success('تم التحديث'); } else { await todos.create({ ...r.data, done: false }); toast.success('تمت الإضافة'); }
            handle.close(); await refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

async function completeTask(t) {
  try {
    if (t.done) { await todos.update(t.id, { done: false, doneAt: null }); }
    else {
      const next = nextDue(t);
      if (next) { await todos.update(t.id, { due: next, lastDoneAt: Date.now() }); toast.success('🔁 انتقلت لموعدها التالي'); }
      else await todos.update(t.id, { done: true, doneAt: Date.now() });
    }
    await refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}
async function removeItem(t) {
  const ok = await modal.confirm({ title: 'حذف', message: 'حذف "' + t.title + '"؟ ينتقل إلى سلة المحذوفات 7 أيام.', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
  if (!ok) return;
  try { await trash.addToTrash(STORES.TODOS, t); await todos.remove(t.id); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}

function taskRow(t) {
  const b = taskBucket(t);
  const due = t.due ? BUCKET_TEXT(t) : null;
  return el('div', { className: 'card', 'data-task-id': t.id, style: { padding: '8px 10px', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center', opacity: t.done ? '0.55' : '1' } }, [
    el('button', { type: 'button', className: 'btn btn--sm ' + (t.done ? 'btn--primary' : 'btn--ghost'), 'data-action': 'toggle-task', onClick: () => completeTask(t) }, t.done ? '✔' : '○'),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontSize: '14px', textDecoration: t.done ? 'line-through' : 'none' } }, (normalizePriority(t.priority) === 'high' ? '🔴 ' : '') + t.title + (normalizeRepeat(t.repeat) !== 'none' ? ' 🔁' : '')),
      due && !t.done ? el('div', { style: { fontSize: '12px', color: due.color, fontWeight: b === 'overdue' || b === 'today' ? '700' : '400' } }, due.text) : null,
      t.notes ? el('div', { style: { fontSize: '12px', color: '#777' } }, t.notes) : null,
    ]),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-task', onClick: () => openTaskForm(t) }, '✏️'),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-task', onClick: () => removeItem(t) }, '🗑️'),
  ]);
}

function drawTasks(c) {
  const tasks = sortTasks(state.list);
  const sm = taskSummary(tasks);
  const titleIn = el('input', { className: 'input', type: 'text', maxlength: '120', placeholder: 'أضف مهمة سريعة...', 'data-role': 'quick-task', style: { flex: '1' } });
  const dueIn = el('input', { className: 'input', type: 'date', style: { width: '140px' }, 'data-role': 'quick-due' });
  const add = async () => {
    const r = checkTodoInput({ kind: 'task', title: titleIn.value, due: dueIn.value ? parseDateInput(dueIn.value) : 0 });
    if (!r.ok) return toast.warning(r.error);
    try { await todos.create({ ...r.data, done: false }); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
  };
  titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  c.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, [titleIn, dueIn, el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-task', onClick: add }, '➕')]));
  c.appendChild(el('div', { 'data-role': 'task-summary', style: { fontSize: '12.5px', color: '#555', marginBottom: '8px' } },
    'متأخرة ' + sm.overdue + ' · اليوم ' + sm.today + ' · مفتوحة ' + sm.open + ' ',
  ));
  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  if (!open.length && !done.length) { c.appendChild(el('div', { style: { fontSize: '13px', color: '#888', padding: '16px', textAlign: 'center' } }, 'لا مهام — أضف أول مهمة 👆')); return; }
  open.forEach((t) => c.appendChild(taskRow(t)));
  if (done.length) {
    c.appendChild(el('div', { style: { display: 'flex', gap: '6px', margin: '10px 0 6px' } }, [
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'toggle-done', onClick: () => { state.showDone = !state.showDone; draw(); } }, (state.showDone ? '▾' : '▸') + ' المنجزة (' + done.length + ')'),
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'clear-done', onClick: async () => { for (const t of done) await todos.remove(t.id); await refresh(); } }, 'مسح المنجزة'),
    ]));
    if (state.showDone) done.forEach((t) => c.appendChild(taskRow(t)));
  }
}

/* ---------- المشتريات ---------- */
function drawShopping(c) {
  const items = state.list.filter((i) => i.kind === 'shopping').sort((a, b) => (a.done === true) - (b.done === true) || (b.createdAt || 0) - (a.createdAt || 0));
  const nameIn = el('input', { className: 'input', type: 'text', maxlength: '120', placeholder: 'أضف بنداً...', 'data-role': 'quick-item', style: { flex: '1' } });
  const qtyIn = el('input', { className: 'input', type: 'text', maxlength: '20', placeholder: 'الكمية', style: { width: '90px' } });
  const add = async () => {
    const r = checkTodoInput({ kind: 'shopping', title: nameIn.value, qty: qtyIn.value });
    if (!r.ok) return toast.warning(r.error);
    try { await todos.create({ ...r.data, done: false }); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
  };
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  c.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, [nameIn, qtyIn, el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-item', onClick: add }, '➕')]));
  if (!items.length) { c.appendChild(el('div', { style: { fontSize: '13px', color: '#888', padding: '16px', textAlign: 'center' } }, 'القائمة فارغة')); return; }
  items.forEach((i) => c.appendChild(el('div', { className: 'card', 'data-item-id': i.id, style: { padding: '8px 10px', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center', opacity: i.done ? '0.5' : '1' } }, [
    el('button', { type: 'button', className: 'btn btn--sm ' + (i.done ? 'btn--primary' : 'btn--ghost'), 'data-action': 'toggle-item', onClick: async () => { try { await todos.update(i.id, { done: !i.done }); await refresh(); } catch (e) { toast.danger('فشل'); } } }, i.done ? '✔' : '○'),
    el('span', { style: { flex: '1', fontSize: '14px', textDecoration: i.done ? 'line-through' : 'none' } }, i.title + (i.qty ? ' (' + i.qty + ')' : '')),
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-item', onClick: async () => { try { await todos.remove(i.id); await refresh(); } catch (e) { toast.danger('فشل'); } } }, '🗑️'),
  ])));
  const text = shoppingText(items);
  c.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } }, [
    el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'clear-bought', onClick: async () => { for (const i of items.filter((x) => x.done)) await todos.remove(i.id); await refresh(); } }, 'مسح المشتراة'),
    el('button', { type: 'button', className: 'btn btn--sm btn--primary', 'data-action': 'share-list', disabled: text ? null : 'disabled', onClick: () => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer') }, '📤 مشاركة بواتساب'),
  ]));
}

/* ---------- الملاحظات ---------- */
function openNoteForm(existing = null) {
  const isEdit = existing !== null;
  const titleIn = el('input', { className: 'input', type: 'text', maxlength: '120', placeholder: 'العنوان', value: isEdit ? existing.title || '' : '' });
  const bodyIn = el('textarea', { className: 'textarea', rows: '8', placeholder: 'اكتب ملاحظتك...' });
  if (isEdit) bodyIn.value = existing.body || '';
  const handle = modal.open({
    title: isEdit ? 'تعديل ملاحظة' : 'ملاحظة جديدة',
    body: el('div', {}, [field('العنوان *', titleIn), field('النص', bodyIn)]),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: async () => {
          const r = checkTodoInput({ kind: 'note', title: titleIn.value, body: bodyIn.value });
          if (!r.ok) return toast.warning(r.error);
          try { if (isEdit) await todos.update(existing.id, r.data); else await todos.create(r.data); handle.close(); await refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

function drawNotes(c) {
  const q = el('input', { className: 'input', type: 'search', placeholder: '🔍 ابحث في الملاحظات...', 'data-role': 'note-search', value: state.query, style: { flex: '1' } });
  q.addEventListener('input', () => { state.query = q.value; drawNoteList(list); });
  c.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, [q, el('button', { type: 'button', className: 'btn btn--primary', 'data-action': 'add-note', onClick: () => openNoteForm() }, '➕ ملاحظة')]));
  const list = el('div', { 'data-role': 'notes-list' });
  c.appendChild(list);
  drawNoteList(list);
}
function drawNoteList(box) {
  clear(box);
  const notes = searchNotes(state.list, state.query);
  if (!notes.length) { box.appendChild(el('div', { style: { fontSize: '13px', color: '#888', padding: '16px', textAlign: 'center' } }, state.query ? 'لا نتائج' : 'لا ملاحظات')); return; }
  notes.forEach((n) => box.appendChild(el('div', { className: 'card', 'data-note-id': n.id, style: { marginBottom: '8px' } }, [
    el('b', {}, '📝 ' + n.title),
    n.body ? el('div', { style: { fontSize: '13px', color: '#555', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.8', maxHeight: '140px', overflow: 'auto' } }, n.body) : null,
    el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, [
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'edit-note', onClick: () => openNoteForm(n) }, '✏️ تعديل'),
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'delete-note', onClick: () => removeItem(n) }, '🗑️ حذف'),
    ]),
  ])));
}

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  const tabs = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } });
  [['tasks', '✅ مهام'], ['shopping', '🛒 مشتريات'], ['notes', '📝 ملاحظات']].forEach(([id, label]) => tabs.appendChild(el('button', {
    type: 'button', 'data-tab': id, className: 'btn btn--sm ' + (state.tab === id ? 'btn--primary' : 'btn--ghost'), style: { flex: '1' },
    onClick: () => { state.tab = id; draw(); },
  }, label)));
  c.appendChild(tabs);
  if (state.tab === 'tasks') drawTasks(c); else if (state.tab === 'shopping') drawShopping(c); else drawNotes(c);
}

export const todosPage = {
  async render(container) {
    clear(container);
    state = { container, list: [], tab: 'tasks', query: '', showDone: false };
    try { state.list = await todos.list(); } catch (e) { container.appendChild(el('div', { className: 'card' }, 'تعذّر التحميل')); return; }
    draw();
  },
  destroy() { state = { container: null, list: [], tab: 'tasks', query: '', showDone: false }; },
};
