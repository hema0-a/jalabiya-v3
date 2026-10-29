/* ==========================================================================
   tombstones.js — «شواهد الحذف» لنقل الحذف بين الأجهزة (v3.3.24)
   ==========================================================================
   المشكلة: الدمج لا يعرف الحذف، فسجل حُذف على جهاز يعود من جهاز آخر.
   الحل: كل حذف لسجل في مخزن مُزامَن يترك شاهداً { 'المخزن:المعرّف': وقت الحذف }.
   - تُرفع الشواهد مع البيانات (مخزن وهمي «tombstones» في المانيفست) وتُدمج مع المحلية.
   - الأحدث يفوز: سجل عُدّل بعد وقت حذفه يبقى (والشاهد يسقط)؛ وإلا يُحذف حيث وُجد.
   - أي put لسجل يمسح شاهده (استرجاع من السلة، إعادة إنشاء).
   - الحذف الجماعي (clear) لا يُنشئ شواهد: مسح محلي لا ينتشر أبداً إلى السحابة.
   - تُحذف الشواهد الأقدم من 90 يوماً عند الرفع.
   التخزين: سجل واحد { id:'sync_tombstones', items } في مخزن settings
   (فيُنسَخ احتياطياً ويُستعاد مع الإعدادات ولا يحتاج ترقية قاعدة البيانات).
   ========================================================================== */

import * as idb from '../data/idb.js';

const STORE = 'settings';
export const TOMB_KEY = 'sync_tombstones';
const MAX_AGE_MS = 90 * 24 * 3600 * 1000;

let tracked = new Set();
let installed = false;
let queue = Promise.resolve();

const keyOf = (s, id) => s + ':' + id;

/* تسلسل العمليات (قراءة-تعديل-كتابة) فلا يطمس حذفٌ حذفاً آخر */
function enqueue(fn) {
  queue = queue.then(fn).catch((e) => { console.warn('[tombstones]', e); });
  return queue;
}

async function loadItems() {
  const r = await idb.get(STORE, TOMB_KEY);
  const it = r && r.items && typeof r.items === 'object' ? r.items : {};
  return { ...it };
}
async function saveItems(items) {
  await idb.put(STORE, { id: TOMB_KEY, items, updatedAt: Date.now() });
}

/** تفعيل التتبّع للمخازن المُزامَنة (آمن للاستدعاء المتكرر). */
export function install(storeNames) {
  tracked = new Set(storeNames || []);
  if (installed) return;
  installed = true;
  idb.onRemove((s, id) => {
    if (!tracked.has(s) || id === undefined || id === null) return;
    enqueue(async () => { const it = await loadItems(); it[keyOf(s, id)] = Date.now(); await saveItems(it); });
  });
  idb.onPut((s, id) => {
    if (!tracked.has(s) || id === undefined || id === null) return;
    enqueue(async () => {
      const it = await loadItems(); const k = keyOf(s, id);
      if (k in it) { delete it[k]; await saveItems(it); }
    });
  });
}

/** انتظار اكتمال كتابات الشواهد المعلّقة. */
export async function flush() { await queue; }

/** @returns {Promise<Array<{id:string, store:string, rid:string, deletedAt:number}>>} */
export async function getAll() {
  await queue;
  const it = await loadItems();
  return Object.entries(it).map(([k, d]) => {
    const i = k.indexOf(':');
    return { id: k, store: k.slice(0, i), rid: k.slice(i + 1), deletedAt: Number(d) || 0 };
  }).filter((t) => t.deletedAt > 0);
}

/** الشواهد الأحدث من 90 يوماً (ويحذف الأقدم من التخزين). */
export async function getAllPurged() {
  const all = await getAll();
  const fresh = all.filter((t) => Date.now() - t.deletedAt < MAX_AGE_MS);
  if (fresh.length !== all.length) await enqueue(() => saveItems(Object.fromEntries(fresh.map((t) => [t.id, t.deletedAt]))));
  return fresh;
}

/** سجل الإعدادات الذي يحمل الشواهد (لإدراجه في writeBatch ذرّي مع باقي البيانات). */
export function buildRecord(list) {
  const items = {};
  for (const t of (list || [])) { if (t && t.id && Number(t.deletedAt) > 0) items[t.id] = Number(t.deletedAt); }
  return { id: TOMB_KEY, items, updatedAt: Date.now() };
}

/** Map<'store:id', deletedAt> من قائمة شواهد. */
export function toMap(list) {
  const m = new Map();
  for (const t of (list || [])) { if (t && t.id) m.set(t.id, Number(t.deletedAt) || 0); }
  return m;
}
