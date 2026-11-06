/* ==========================================================================
   roles.js — الأدوار والصلاحيات (v3.10.0) — دوال نقية
   ==========================================================================
   ثلاثة أدوار على هذا الجهاز: owner (المالك: كل شيء) · manager (مدير) · receptionist (استقبال).
   ⚠️ هذا قفل واجهة لتقليل الخطأ وحماية الخصوصية بين العاملين على نفس الجهاز، وليس تشفيراً للبيانات:
   من يملك الجهاز ومعرفة تقنية يستطيع قراءة بياناته. لحماية أقوى استخدم رقم المالك والتشفير.
   ========================================================================== */

export const ROLE_IDS = ['owner', 'manager', 'receptionist'];
export const ROLE_LABELS = { owner: 'المالك', manager: 'المدير', receptionist: 'الاستقبال' };
export const STAFF_ROLES = ['manager', 'receptionist'];

/** صفحات للمالك وحده (إعدادات ومال شخصي ونظام). المدير لا يراها. */
export const OWNER_ONLY = ['settings', 'financial-center', 'commitments', 'house-expenses', 'loans', 'cloud-sync', 'activity-log', 'trash', 'tests', 'data-care'];

/** ما يراه الاستقبال فقط (بلا أي صفحة مالية): استقبال الطلبات والعملاء والمواعيد. */
export const RECEPTIONIST_ALLOWED = ['orders', 'customers', 'pickups', 'messages', 'appointments', 'calendar', 'quotes', 'pricing-calculator', 'portfolio', 'occasions', 'referrals', 'wall'];

/** صفحات يحميها «القفل المالي» (رقم مستقل) إن عُيّن. */
export const FINANCE_LOCK_PAGES = ['financial-center', 'kpis', 'reports', 'expenses', 'commitments', 'house-expenses', 'loans'];

export const FINANCE_UNLOCK_MINUTES = 10;

export const isRole = (r) => ROLE_IDS.includes(r);

/** صفحة الدور الرئيسية. */
export const homeFor = (role) => (role === 'receptionist' ? 'orders' : 'dashboard');

/** هل يستطيع الدور فتح الصفحة؟ دور مجهول = أقل صلاحية (استقبال). */
export function canAccess(role, pageId) {
  const r = isRole(role) ? role : 'receptionist';
  if (r === 'owner') return true;
  if (r === 'manager') return !OWNER_ONLY.includes(pageId);
  return RECEPTIONIST_ALLOWED.includes(pageId);
}

/** صفحات القائمة التي تُخفى لهذا الدور. */
export function hiddenPagesFor(role, allIds) {
  return (allIds || []).filter((id) => !canAccess(role, id));
}

/** هل تحتاج الصفحة فتح القفل المالي الآن؟ */
export function needsFinanceGate(pageId, financePinSet, unlockedUntil, now = Date.now()) {
  if (!financePinSet || !FINANCE_LOCK_PAGES.includes(pageId)) return false;
  return !(Number(unlockedUntil) > now);
}

/** صيغة الرقم: 4 أرقام لاتينية. */
export const isValidPin = (pin) => /^\d{4}$/.test(String(pin == null ? '' : pin));

/** الدور الفعلي: بلا رقم مالك ⟵ owner دائماً؛ وإن وُجد رقم موظفين ولا دور محفوظ ⟵ أقل صلاحية. */
export function effectiveRole({ hasOwnerPin, storedRole, hasStaffPins }) {
  if (!hasOwnerPin) return 'owner';
  if (isRole(storedRole)) return storedRole;
  return hasStaffPins ? 'receptionist' : 'owner';
}
