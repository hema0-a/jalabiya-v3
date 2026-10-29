/* ==========================================================================
   workers-logic.js — منطق نقي وثوابت صفحة العمال (v3.5.9)
   ==========================================================================
   SPECIALTIES · SALARY_TYPES · SALARY_TYPE_MAP · filterWorkers · getPaidThisMonth(state, workerId).
   لا DOM ولا استيراد من وحدات الصفحة.
   ========================================================================== */

/* --- ثوابت --- */
export const SPECIALTIES = [
  'خياط', 'كوّاي', 'قصّار', 'مطرّز', 'مساعد', 'تغليف', 'أخرى',
];

export const SALARY_TYPES = [
  { id: 'fixed',     label: 'ثابت شهري',   icon: '📅', unit: 'ج.م / شهر' },
  { id: 'per_piece', label: 'بالقطعة',     icon: '👕', unit: 'ج.م / قطعة' },
  { id: 'daily',     label: 'يومي',        icon: '📆', unit: 'ج.م / يوم' },
  { id: 'hourly',    label: 'ساعي',        icon: '⏱️', unit: 'ج.م / ساعة' },
];

export const SALARY_TYPE_MAP = {};
SALARY_TYPES.forEach((t) => { SALARY_TYPE_MAP[t.id] = t; });


/* ==========================================================================
   1. الفلترة
   ========================================================================== */

export function filterWorkers(list, filterId) {
  if (filterId === 'all') return list;
  if (filterId === 'active') return list.filter((w) => w.active !== false);
  if (filterId === 'inactive') return list.filter((w) => w.active === false);
  return list;
}

/**
 * إجمالي مدفوعات عامل في الشهر الحالي.
 * @param {string} workerId
 * @returns {number}
 */
export function getPaidThisMonth(state, workerId) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 1).getTime();
  return state.payments
    .filter((p) =>
      p.workerId === workerId &&
      p.date && p.date >= start && p.date < end
    )
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
