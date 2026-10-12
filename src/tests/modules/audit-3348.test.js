/* ==========================================================================
   audit-3348.test.js — تقييد استرجاع الرقم السري بحساب صاحب الجهاز + تغطية المزامنة
   ========================================================================== */

import { register } from '../registry.js';
import { recoverPinWithCloud } from '../../security/pin-recovery.js';
import { setPin, clearPin, isPinSet } from '../../security/pin-crypto.js';
import { getOwnerUid, bindOwner } from '../../sync/auth-sync.js';
import * as autoSync from '../../sync/auto-sync.js';
import { SYNC_STORES } from '../../sync/firestore-sync.js';
import { STORES } from '../../core/config.js';

register('audit v3.3.48 pin recovery owner binding', async (t) => {
  await setPin('2468');
  const ok = (uid) => async () => ({ ok: true, user: uid === undefined ? undefined : { uid } });
  let loggedOut = 0;
  const logout = async () => { loggedOut++; return { ok: true }; };

  let res = await recoverPinWithCloud('a@b.com', 'x', { login: ok('attacker'), getOwnerUid: () => 'owner1', logout });
  await t.test('1. حساب صالح لكنه ليس صاحب الجهاز → يُرفض والرقم باقٍ ويُسجَّل خروجه',
    !res.success && /ليس حساب هذه الورشة/.test(res.error) && isPinSet() && loggedOut === 1);

  res = await recoverPinWithCloud('a@b.com', 'x', { login: ok('anyone'), getOwnerUid: () => null, logout });
  await t.test('2. جهاز غير مربوط بحساب → الاسترجاع بالحساب غير متاح (حتى لو الحساب صالح)',
    !res.success && /غير متاح/.test(res.error) && isPinSet() && loggedOut === 2);

  res = await recoverPinWithCloud('a@b.com', 'x', { login: ok(undefined), getOwnerUid: () => 'owner1', logout });
  await t.test('3. نتيجة تسجيل دخول بلا uid → تُرفض', !res.success && isPinSet() && loggedOut === 3);

  res = await recoverPinWithCloud('a@b.com', 'x', { login: ok('owner1'), getOwnerUid: () => 'owner1', logout });
  await t.test('4. الحساب المطابق لصاحب الجهاز → يُزال الرقم', res.success && !isPinSet() && loggedOut === 3);

  clearPin();

  /* ربط الجهاز يحدث من جلسة مفتوحة فقط (auto-sync.setUser) */
  const prev = getOwnerUid();
  localStorage.removeItem('jalabiya_v3_owner_uid');
  await t.test('5. قبل أي جلسة: لا صاحب', getOwnerUid() === null);
  autoSync.setUser({ uid: 'ownerX' });
  await t.test('6. setUser يربط الجهاز بالحساب', getOwnerUid() === 'ownerX');
  autoSync.setUser(null);
  await t.test('7. تسجيل الخروج لا يمسح صاحب الجهاز', getOwnerUid() === 'ownerX');
  await t.test('8. bindOwner بلا uid لا يفعل شيئاً', bindOwner('') === false && getOwnerUid() === 'ownerX');
  if (prev) bindOwner(prev); else localStorage.removeItem('jalabiya_v3_owner_uid');
});

register('audit v3.3.48 sync store coverage', async (t) => {
  /* مخزن بيانات جديد يُنسى إضافته للمزامنة = بيانات لا تُرفع ولا تُستعاد على جهاز آخر */
  const NOT_SYNCED = new Set([STORES.SETTINGS, STORES.TRASH, STORES.BACKUPS]);
  const missing = Object.values(STORES).filter((s) => !NOT_SYNCED.has(s) && !SYNC_STORES.includes(s));
  const unknown = SYNC_STORES.filter((s) => !Object.values(STORES).includes(s));
  await t.test('9. كل مخزن بيانات (عدا settings/trash/backups) ضمن SYNC_STORES' + (missing.length ? ' — ناقص: ' + missing.join(',') : ''), missing.length === 0);
  await t.test('10. لا اسم في SYNC_STORES غير موجود في STORES' + (unknown.length ? ' — ' + unknown.join(',') : ''), unknown.length === 0);
  await t.test('11. SYNC_STORES بلا تكرار', new Set(SYNC_STORES).size === SYNC_STORES.length);
});
