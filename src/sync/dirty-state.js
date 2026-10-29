/* ==========================================================================
   dirty-state.js — تتبّع «تعديلات لم تُرفع إلى السحابة»
   ==========================================================================
   - أي كتابة في مخزن مُزامَن تضع علامة dirty (منذ متى + آخر تعديل).
   - الرفع الناجح يمسح العلامة فقط إن لم يحدث تعديل بعد بدء الرفع
     (تعديل أثناء الرفع يبقى «غير مرفوع»).
   - مخزّنة في localStorage فتبقى بعد إغلاق التطبيق.
   لا يستورد سوى idb (لا اعتماد دائري مع firestore-sync).
   ========================================================================== */

import { onWrite } from '../data/idb.js';

const K_SINCE = 'jalabiya_v3_dirty_since';
const K_LAST = 'jalabiya_v3_dirty_last';
const K_PUSH = 'jalabiya_v3_last_push';

let tracked = new Set();
let installed = false;
const listeners = new Set();

function read(k) {
  try { const v = localStorage.getItem(k); return v === null ? null : (Number(v) || null); } catch (e) { return null; }
}
function write(k, v) {
  try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ }
}
function emit() {
  for (const cb of listeners) { try { cb(getState()); } catch (e) { /* ignore */ } }
}

/** بدء التتبّع للمخازن المُزامَنة (آمن للاستدعاء المتكرر). */
export function installTracking(storeNames) {
  tracked = new Set(storeNames || []);
  if (installed) return;
  installed = true;
  onWrite((names) => {
    if (Array.isArray(names) && names.some((n) => tracked.has(n))) markDirty();
  });
}

export function markDirty() {
  const now = Date.now();
  if (!read(K_SINCE)) write(K_SINCE, now);
  write(K_LAST, now);
  emit();
}

/** مسح العلامة بلا شرط (بعد تنزيل/استبدال يطابق السحابة تماماً). */
export function markClean() {
  write(K_SINCE, null); write(K_LAST, null);
  emit();
}

/**
 * مسح العلامة بعد رفع ناجح بدأ عند startedAt — إلا إن حدث تعديل بعده.
 * @returns {boolean} true إن مُسحت
 */
export function markCleanIfUnchanged(startedAt) {
  const last = read(K_LAST);
  write(K_PUSH, Date.now());
  if (last && last > startedAt) { emit(); return false; }
  write(K_SINCE, null); write(K_LAST, null);
  emit();
  return true;
}

export function getState() {
  return { dirtySince: read(K_SINCE), lastWrite: read(K_LAST), lastPush: read(K_PUSH) };
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
