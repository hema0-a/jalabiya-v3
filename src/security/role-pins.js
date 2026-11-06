/* ==========================================================================
   role-pins.js — أرقام المدير والاستقبال والقفل المالي + الدور الحالي (v3.10.0)
   ==========================================================================
   نفس تشفير رقم المالك (PBKDF2 + ملح) ونفس مكان التخزين (localStorage لهذا الجهاز فقط).
   🔒 قواعد:
   - لا تُضبط أرقام الموظفين إلا والمالك له رقم، وأي رقم يجب أن يختلف عن الباقي.
   - مطابقة رقم موظف تأتي دائماً بعد التأكد أنه ليس رقم المالك (المالك يغلب).
   - إزالة رقم المالك (clearPin) تمسح كل هذه البيانات.
   - الدور الافتراضي بلا أرقام موظفين = المالك (لا تغيير في سلوك من لا يستعملها).
   ========================================================================== */

import { STORAGE_KEYS as K } from '../core/config.js';
import { generateSalt, hashPinV2, verifyPin, isPinSet } from './pin-crypto.js';
import { effectiveRole, isRole, isValidPin, FINANCE_UNLOCK_MINUTES } from '../services/roles.js';
import { events } from '../core/events.js';

const SLOTS = {
  manager: { hash: K.V3_MGR_HASH, salt: K.V3_MGR_SALT },
  receptionist: { hash: K.V3_RECV_HASH, salt: K.V3_RECV_SALT },
  finance: { hash: K.V3_FIN_HASH, salt: K.V3_FIN_SALT },
};
const FIN_MAX_FAILS = 5;
const FIN_LOCK_SECONDS = 60;

const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => localStorage.setItem(k, v);
const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* اختياري */ } };

export const hasSlot = (name) => !!(SLOTS[name] && get(SLOTS[name].hash) && get(SLOTS[name].salt));
export const hasStaffPins = () => isPinSet() && (hasSlot('manager') || hasSlot('receptionist'));
export const hasFinancePin = () => isPinSet() && hasSlot('finance');

async function matchesSlot(name, pin) {
  return hasSlot(name) && verifyPin(pin, get(SLOTS[name].hash), get(SLOTS[name].salt));
}
async function matchesOwner(pin) {
  return isPinSet() && verifyPin(pin, get(K.V3_PIN_HASH), get(K.V3_PIN_SALT));
}

/**
 * ضبط رقم (manager | receptionist | finance). يرفض: غير 4 أرقام، لا رقم مالك، أو رقم مكرر.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function setSlotPin(name, pin) {
  if (!SLOTS[name]) return { ok: false, error: 'خانة غير معروفة' };
  const p = String(pin == null ? '' : pin);
  if (!isPinSet()) return { ok: false, error: 'عيّن رقم المالك أولاً' };
  if (!isValidPin(p)) return { ok: false, error: 'الرقم يجب أن يكون 4 أرقام' };
  if (await matchesOwner(p)) return { ok: false, error: 'هذا رقم المالك — اختر رقماً مختلفاً' };
  for (const other of Object.keys(SLOTS)) {
    if (other !== name && await matchesSlot(other, p)) return { ok: false, error: 'الرقم مستخدم لدور آخر — اختر رقماً مختلفاً' };
  }
  const salt = generateSalt();
  const hash = await hashPinV2(p, salt);
  put(SLOTS[name].salt, salt);
  put(SLOTS[name].hash, hash);
  if (name === 'finance') { del(K.V3_FIN_UNTIL); del(K.V3_FIN_FAILS); del(K.V3_FIN_LOCK_UNTIL); }
  return { ok: true };
}

export function clearSlotPin(name) {
  if (!SLOTS[name]) return;
  del(SLOTS[name].hash); del(SLOTS[name].salt);
  if (name === 'finance') { del(K.V3_FIN_UNTIL); del(K.V3_FIN_FAILS); del(K.V3_FIN_LOCK_UNTIL); }
}

/** مسح كل شيء (يُستدعى من clearPin عند إزالة رقم المالك). */
export function clearAllRoleData() {
  Object.keys(SLOTS).forEach(clearSlotPin);
  del(K.V3_ROLE);
}

/** يعيد 'manager' | 'receptionist' | null. المالك يغلب لو تطابق رقمه. */
export async function matchStaffPin(pin) {
  if (!hasStaffPins() || !isValidPin(pin)) return null;
  let role = null;
  if (await matchesSlot('manager', pin)) role = 'manager';
  else if (await matchesSlot('receptionist', pin)) role = 'receptionist';
  if (!role) return null;
  if (await matchesOwner(pin)) return null;      /* رقم المالك يغلب (الاستدعاء يتابع لمسار المالك) */
  return role;
}

export function getRole() {
  return effectiveRole({ hasOwnerPin: isPinSet(), storedRole: get(K.V3_ROLE), hasStaffPins: hasStaffPins() });
}

export function setRole(role) {
  if (!isRole(role)) return;
  const prev = getRole();
  try { put(K.V3_ROLE, role); } catch (e) { /* التخزين ممتلئ/ممنوع: يبقى الدور السابق */ }
  if (role !== 'owner') del(K.V3_FIN_UNTIL);      /* لا يرث الموظف فتحاً مالياً سابقاً */
  if (prev !== role) events.emit('role:changed', { role, prev });
}

/* ---------------- القفل المالي ---------------- */

export const financeUnlockedUntil = () => Number(get(K.V3_FIN_UNTIL)) || 0;
export const financeLockRemainingMs = () => Math.max(0, (Number(get(K.V3_FIN_LOCK_UNTIL)) || 0) - Date.now());

/** @returns {Promise<{ok:boolean, reason?:'no-pin'|'locked'|'wrong', remainingMs?:number, attempts?:number}>} */
export async function unlockFinance(pin) {
  if (!hasFinancePin()) return { ok: false, reason: 'no-pin' };
  const rem = financeLockRemainingMs();
  if (rem > 0) return { ok: false, reason: 'locked', remainingMs: rem };
  if (await matchesSlot('finance', pin)) {
    del(K.V3_FIN_FAILS); del(K.V3_FIN_LOCK_UNTIL);
    put(K.V3_FIN_UNTIL, String(Date.now() + FINANCE_UNLOCK_MINUTES * 60000));
    return { ok: true };
  }
  const fails = (Number(get(K.V3_FIN_FAILS)) || 0) + 1;
  put(K.V3_FIN_FAILS, String(fails));
  if (fails >= FIN_MAX_FAILS) {
    const secs = FIN_LOCK_SECONDS * Math.pow(2, Math.min(fails - FIN_MAX_FAILS, 4));
    put(K.V3_FIN_LOCK_UNTIL, String(Date.now() + secs * 1000));
    return { ok: false, reason: 'wrong', attempts: fails, remainingMs: secs * 1000 };
  }
  return { ok: false, reason: 'wrong', attempts: fails };
}

export const relockFinance = () => del(K.V3_FIN_UNTIL);
