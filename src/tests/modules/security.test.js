/* ==========================================================================
   security.test.js — اختبارات طبقة الأمان
   ==========================================================================
   16 اختباراً: pin-crypto(8) + auth(8)
   ========================================================================== */

import { register } from '../registry.js';
import { generateSalt, hashPin, verifyPin } from '../../security/pin-crypto.js';
import { auth } from '../../security/auth.js';
import { LIMITS } from '../../core/config.js';

/* ===== pin-crypto.js (8) ===== */
register('pin-crypto.js', async (t) => {
  const salt1 = generateSalt();
  await t.test('1. generateSalt → 32 hex chars',
    typeof salt1 === 'string' && salt1.length === 32 && /^[0-9a-f]+$/.test(salt1));

  const salt2 = generateSalt();
  await t.test('2. generateSalt unique', salt1 !== salt2);

  const h1 = await hashPin('1234', salt1);
  await t.test('3. hashPin → 64 hex chars',
    typeof h1 === 'string' && h1.length === 64 && /^[0-9a-f]+$/.test(h1));

  const h1b = await hashPin('1234', salt1);
  await t.test('4. hashPin deterministic', h1 === h1b);

  const h2 = await hashPin('1234', salt2);
  await t.test('5. hashPin different salt → different hash', h1 !== h2);

  const v1 = await verifyPin('1234', h1, salt1);
  await t.test('6. verifyPin correct → true', v1 === true);

  const v2 = await verifyPin('9999', h1, salt1);
  await t.test('7. verifyPin wrong pin → false', v2 === false);

  const v3 = await verifyPin(null, null, null);
  const v4 = await verifyPin('1234', null, salt1);
  await t.test('8. verifyPin null args → false', v3 === false && v4 === false);
});

/* ===== auth.js (8) ===== */
register('auth.js', async (t) => {
  auth.reset();
  await t.test('1. hasPin false initially', auth.hasPin() === false);

  await auth.setPinAndSave('1234');
  await t.test('2. setPinAndSave → hasPin true', auth.hasPin() === true);

  auth.clearSession();
  const ok = await auth.unlock('1234');
  await t.test('3. unlock correct → success + session',
    ok.success === true && auth.getSession() !== null);

  auth.clearSession();
  auth._resetAttempts();
  const bad = await auth.unlock('9999');
  await t.test('4. wrong pin → wrong-pin + attempts=1',
    bad.success === false && bad.reason === 'wrong-pin' && auth.getAttempts() === 1);

  auth._resetAttempts();
  for (let i = 0; i < LIMITS.maxPinAttempts; i++) {
    await auth.unlock('9999');
  }
  await t.test('5. locked after max attempts', auth.isLocked() === true);

  const blocked = await auth.unlock('1234');
  await t.test('6. unlock blocked when locked',
    blocked.success === false && blocked.reason === 'locked');

  auth._resetAttempts();
  const wrongOld = await auth.changePin('0000', '5555');
  const rightOld = await auth.changePin('1234', '5555');
  await t.test('7. changePin requires correct old pin',
    wrongOld === false && rightOld === true);

  auth.reset();
  await t.test('8. reset clears pin + session + attempts',
    auth.hasPin() === false &&
    auth.getSession() === null &&
    auth.getAttempts() === 0);
});
