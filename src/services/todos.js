/* ==========================================================================
   todos.js — المهام والمشتريات والملاحظات (v3.16.0) — دوال نقية
   ==========================================================================
   مخزن واحد بنوع kind: task (مهمة بموعد اختياري وتكرار) · shopping (بند مشتريات) · note (ملاحظة بعنوان ونص).
   المهمة المتكررة (يومي/أسبوعي/شهري) تُنجَز فتنتقل لموعدها التالي تلقائياً (لا تتراكم نسخ).
   لا DOM ولا قاعدة بيانات.
   ========================================================================== */

export const KINDS = ['task', 'shopping', 'note'];
export const REPEATS = [
  { id: 'none', label: 'بلا تكرار' }, { id: 'daily', label: 'يومياً' }, { id: 'weekly', label: 'أسبوعياً' }, { id: 'monthly', label: 'شهرياً' },
];
export const PRIORITIES = [{ id: 'high', icon: '🔴', label: 'مهم' }, { id: 'normal', icon: '⚪', label: 'عادي' }];
export const MAX_TITLE = 120;
export const MAX_BODY = 2000;
const DAY = 86400000;
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[<>]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');

export const normalizeKind = (v) => (KINDS.includes(v) ? v : 'task');
export const normalizeRepeat = (v) => (REPEATS.some((r) => r.id === v) ? v : 'none');
export const normalizePriority = (v) => (v === 'high' ? 'high' : 'normal');
const startOfDay = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** تحقّق من إدخال عنصر حسب نوعه. @returns {{ok:boolean,error?:string,data?:Object}} */
export function checkTodoInput(input) {
  const kind = normalizeKind(input && input.kind);
  const title = clean(input && input.title, MAX_TITLE);
  if (!title) return { ok: false, error: kind === 'note' ? 'عنوان الملاحظة مطلوب' : 'النص مطلوب' };
  if (kind === 'note') return { ok: true, data: { kind, title, body: clean((input && input.body || '').replace(/\r/g, ''), MAX_BODY).slice(0, MAX_BODY) } };
  if (kind === 'shopping') return { ok: true, data: { kind, title, qty: clean(input.qty, 20) } };
  const due = n(input.due);
  const repeat = normalizeRepeat(input.repeat);
  if (repeat !== 'none' && !(due > 0)) return { ok: false, error: 'المهمة المتكررة تحتاج موعداً' };
  return { ok: true, data: { kind, title, due: due > 0 ? startOfDay(due) : null, repeat, priority: normalizePriority(input.priority), notes: clean(input.notes, 300) } };
}

/** تصنيف مهمة: done · overdue · today · soon (خلال 7 أيام) · later · nodate */
export function taskBucket(task, now = new Date()) {
  if (!task) return 'nodate';
  if (task.done === true) return 'done';
  const due = n(task.due);
  if (!(due > 0)) return 'nodate';
  const diff = Math.round((startOfDay(due) - startOfDay(now.getTime())) / DAY);
  return diff < 0 ? 'overdue' : (diff === 0 ? 'today' : (diff <= 7 ? 'soon' : 'later'));
}

const RANK = { overdue: 0, today: 1, soon: 2, later: 3, nodate: 4, done: 5 };
/** ترتيب المهام: المتأخرة فاليوم فالقريبة... والمنجزة آخراً؛ داخل الفئة المهم أولاً ثم الأقرب موعداً. */
export function sortTasks(tasks, now = new Date()) {
  return (Array.isArray(tasks) ? tasks : []).filter((t) => t && normalizeKind(t.kind) === 'task').slice().sort((a, b) => {
    const ba = taskBucket(a, now), bb = taskBucket(b, now);
    return RANK[ba] - RANK[bb]
      || (normalizePriority(b.priority) === 'high') - (normalizePriority(a.priority) === 'high')
      || (n(a.due) || Infinity) - (n(b.due) || Infinity)
      || String(a.title).localeCompare(String(b.title), 'ar');
  });
}

/** الموعد التالي لمهمة متكررة (بعد موعدها الحالي، ولا يقع في الماضي). */
export function nextDue(task, now = new Date()) {
  const rep = normalizeRepeat(task && task.repeat);
  const due = n(task && task.due);
  if (rep === 'none' || !(due > 0)) return null;
  const today = startOfDay(now.getTime());
  let d = new Date(startOfDay(due));
  for (let i = 0; i < 1000; i++) {
    if (rep === 'daily') d.setDate(d.getDate() + 1);
    else if (rep === 'weekly') d.setDate(d.getDate() + 7);
    else { const day = new Date(due).getDate(); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); }
    if (d.getTime() > today) return d.getTime();
  }
  return null;
}

/** ملخص المهام: متأخرة، اليوم، مفتوحة. */
export function taskSummary(tasks, now = new Date()) {
  let overdue = 0, today = 0, open = 0;
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || normalizeKind(t.kind) !== 'task' || t.done === true) continue;
    open++;
    const b = taskBucket(t, now);
    if (b === 'overdue') overdue++; else if (b === 'today') today++;
  }
  return { overdue, today, open };
}

/** نص قائمة المشتريات للمشاركة (غير المشتراة فقط). */
export function shoppingText(items, title = 'قائمة المشتريات') {
  const open = (Array.isArray(items) ? items : []).filter((i) => i && normalizeKind(i.kind) === 'shopping' && i.done !== true);
  if (!open.length) return '';
  return '🛒 ' + title + '\n' + open.map((i) => '• ' + i.title + (i.qty ? ' (' + i.qty + ')' : '')).join('\n');
}

/** بحث الملاحظات بالعنوان والنص (تطبيع بسيط للهمزات والتشكيل). */
const norm = (s) => String(s || '').toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
export function searchNotes(items, query) {
  const q = norm(query).trim();
  const notes = (Array.isArray(items) ? items : []).filter((i) => i && normalizeKind(i.kind) === 'note');
  const list = q ? notes.filter((i) => norm(i.title).includes(q) || norm(i.body).includes(q)) : notes;
  return list.slice().sort((a, b) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt));
}
