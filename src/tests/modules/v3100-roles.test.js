/* ==========================================================================
   v3100-roles.test.js — الأدوار وأرقام الموظفين والقفل المالي (v3.10.0)
   ========================================================================== */
import { register } from '../registry.js';
import { STORAGE_KEYS as K } from '../../core/config.js';
import {
  ROLE_IDS, OWNER_ONLY, RECEPTIONIST_ALLOWED, FINANCE_LOCK_PAGES, isRole, homeFor, canAccess, hiddenPagesFor,
  needsFinanceGate, isValidPin, effectiveRole,
} from '../../services/roles.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const ALL = ['dashboard', 'orders', 'customers', 'settings', 'reports', 'expenses', 'financial-center', 'pickups', 'workers', 'inventory', 'loans'];

register('v3.10.0 الأدوار والقفل المالي', async (t) => {
  await t.test('1. الأدوار الثلاثة وisRole', ROLE_IDS.length === 3 && isRole('owner') && !isRole('admin') && !isRole(null));
  await t.test('2. المالك يدخل كل شيء', ALL.every((p) => canAccess('owner', p)));
  await t.test('3. المدير: يمنع صفحات المالك فقط', !canAccess('manager', 'settings') && !canAccess('manager', 'loans') && canAccess('manager', 'reports') && canAccess('manager', 'workers'));
  await t.test('4. الاستقبال: القائمة البيضاء فقط', canAccess('receptionist', 'orders') && !canAccess('receptionist', 'reports') && !canAccess('receptionist', 'workers') && !canAccess('receptionist', 'settings'));
  await t.test('5. دور مجهول = الاستقبال (أقل صلاحية)', !canAccess('hacker', 'reports') && canAccess('hacker', 'orders'));
  await t.test('6. الصفحة الرئيسية لكل دور', homeFor('receptionist') === 'orders' && homeFor('owner') === 'dashboard' && homeFor('manager') === 'dashboard');
  await t.test('7. hiddenPagesFor يتسق مع canAccess', ['owner', 'manager', 'receptionist'].every((r) => hiddenPagesFor(r, ALL).every((p) => !canAccess(r, p)) && ALL.filter((p) => !canAccess(r, p)).every((p) => hiddenPagesFor(r, ALL).includes(p))));
  await t.test('8. صفحات الاستقبال ليست ضمن صفحات المالك', RECEPTIONIST_ALLOWED.every((p) => !OWNER_ONLY.includes(p)));
  await t.test('9. القفل المالي: يُطلب فقط للمالية، بوجود رقم، وقبل الانتهاء', (() => {
    const now = 1000000;
    return needsFinanceGate('reports', true, 0, now) && !needsFinanceGate('reports', false, 0, now) && !needsFinanceGate('orders', true, 0, now)
      && !needsFinanceGate('reports', true, now + 5000, now) && needsFinanceGate('reports', true, now - 1, now) && FINANCE_LOCK_PAGES.includes('financial-center');
  })());
  await t.test('10. isValidPin', isValidPin('1234') && !isValidPin('123') && !isValidPin('12345') && !isValidPin('12a4') && !isValidPin(null));
  await t.test('11. effectiveRole', effectiveRole({ hasOwnerPin: false, storedRole: 'receptionist', hasStaffPins: true }) === 'owner'
    && effectiveRole({ hasOwnerPin: true, storedRole: null, hasStaffPins: false }) === 'owner'
    && effectiveRole({ hasOwnerPin: true, storedRole: null, hasStaffPins: true }) === 'receptionist'
    && effectiveRole({ hasOwnerPin: true, storedRole: 'manager', hasStaffPins: true }) === 'manager');
  await t.test('12. مفاتيح التخزين الجديدة معرّفة', ['V3_ROLE', 'V3_MGR_HASH', 'V3_MGR_SALT', 'V3_RECV_HASH', 'V3_RECV_SALT', 'V3_FIN_HASH', 'V3_FIN_SALT', 'V3_FIN_UNTIL', 'V3_FIN_FAILS', 'V3_FIN_LOCK_UNTIL'].every((k) => typeof K[k] === 'string'));

  /* --- وظيفي على التخزين (مع حفظ/استعادة القيم الحالية) --- */
  const keys = Object.values({ a: K.V3_PIN_HASH, b: K.V3_PIN_SALT, ...Object.fromEntries(['V3_ROLE', 'V3_MGR_HASH', 'V3_MGR_SALT', 'V3_RECV_HASH', 'V3_RECV_SALT', 'V3_FIN_HASH', 'V3_FIN_SALT', 'V3_FIN_UNTIL', 'V3_FIN_FAILS', 'V3_FIN_LOCK_UNTIL'].map((k) => [k, K[k]])) });
  const saved = keys.map((k) => [k, localStorage.getItem(k)]);
  let ok = false; let detail = {};
  try {
    keys.forEach((k) => localStorage.removeItem(k));
    const pc = await import('../../security/pin-crypto.js');
    const rp = await import('../../security/role-pins.js');
    detail.noOwner = (await rp.setSlotPin('manager', '1111')).ok === false;
    const salt = pc.generateSalt();
    localStorage.setItem(K.V3_PIN_SALT, salt); localStorage.setItem(K.V3_PIN_HASH, await pc.hashPinV2('9999', salt));
    detail.setMgr = (await rp.setSlotPin('manager', '1111')).ok;
    detail.sameOwner = (await rp.setSlotPin('receptionist', '9999')).ok === false;
    detail.dup = (await rp.setSlotPin('receptionist', '1111')).ok === false;
    detail.setRecv = (await rp.setSlotPin('receptionist', '2222')).ok;
    detail.match = (await rp.matchStaffPin('2222')) === 'receptionist' && (await rp.matchStaffPin('1111')) === 'manager' && (await rp.matchStaffPin('0000')) === null;
    rp.setRole('manager'); detail.role = rp.getRole() === 'manager';
    localStorage.removeItem(K.V3_ROLE); detail.fallback = rp.getRole() === 'receptionist';
    detail.fin = (await rp.setSlotPin('finance', '3333')).ok && rp.hasFinancePin();
    detail.finBad = (await rp.unlockFinance('0000')).ok === false && (await rp.unlockFinance('3333')).ok === true && rp.financeUnlockedUntil() > Date.now();
    pc.clearPin(); detail.cleared = !rp.hasSlot('manager') && !rp.hasSlot('receptionist') && !rp.hasSlot('finance') && localStorage.getItem(K.V3_ROLE) === null;
    ok = Object.values(detail).every(Boolean);
  } catch (e) { detail.error = String(e); }
  finally { keys.forEach((k) => localStorage.removeItem(k)); saved.forEach(([k, v]) => { if (v !== null) localStorage.setItem(k, v); }); }
  await t.test('13. التخزين: رفض بلا رقم مالك/مكرر/رقم المالك + المطابقة + الدور الافتراضي + القفل المالي + مسح عند clearPin', ok);
  if (!ok) console.warn('[v3.10.0]', JSON.stringify(detail));

  /* --- عقود المصدر --- */
  const main = await src('main.js'); const lock = await src('ui/lock-screen.js'); const sec = await src('pages/settings/sections-security.js');
  const guard = await src('ui/role-guard.js'); const rs = await src('ui/roles-settings.js'); const rpS = await src('security/role-pins.js');
  await t.test('14. main.js: الحارس والقائمة وحدث تغيّر الدور', /roleGuard\.guardRoute\(id\)/.test(main) && /role:changed/.test(main) && /applySidebarHidden/.test(main) && !/innerHTML/.test(main));
  await t.test('15. شاشة القفل تطابق أرقام الموظفين وتحدد الدور', /matchStaffPin/.test(lock) && /setRole\(/.test(lock));
  await t.test('16. الإعدادات تستدعي اللوحة بشرط وجود رقم المالك', /buildRolesPanel/.test(sec) && /auth\.hasPin\(\)\) body\.appendChild\(buildRolesPanel/.test(sec));
  await t.test('17. لا innerHTML في الملفات الجديدة', ![guard, rs, rpS].some((s) => /innerHTML\s*=/.test(s)));
  await t.test('18. الأرقام لا تُزامَن', !/SETTINGS_SYNC_KEYS/.test(rpS) && !/firestore|firebase/i.test(rpS));
});
