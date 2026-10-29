/* ==========================================================================
   customers-logic.js — منطق نقي وثوابت صفحة العملاء (v3.5.8)
   ==========================================================================
   FILTERS · SORTS · filterCustomers · applyFiltersAndSort · hasMeasurements.
   لا DOM ولا استيراد من وحدات الصفحة. applyFiltersAndSort تستلم الحالة صراحةً (list, state).
   ========================================================================== */

import { normalizeSearch, phoneMatches } from '../core/utils.js';

/* --- الفلاتر والترتيب --- */
export const FILTERS = [
  { id: 'all',    label: 'الكل',      icon: '👥' },
  { id: 'vip',    label: 'VIP',       icon: '⭐' },
  { id: 'normal', label: 'عادي',      icon: '👤' },
];

export const SORTS = [
  { id: 'recent', label: 'الأحدث',      icon: '🕐' },
  { id: 'spent',  label: 'الأعلى شراءً', icon: '💰' },
  { id: 'name',   label: 'أبجدي',       icon: '🔤' },
];

/* ==========================================================================
   1. الفلترة (مُصدَّرة للاختبار)
   ========================================================================== */

export function filterCustomers(list, query) {
  const q = normalizeSearch(query);
  if (!q) return list;
  return list.filter((c) => {
    return normalizeSearch(c.name).includes(q) || phoneMatches(c.phone, q);
  });
}

/* ==========================================================================
   3. الفلترة والترتيب
   ========================================================================== */

export function applyFiltersAndSort(list, state) {
  let result = list;

  if (state.activeFilter === 'vip') {
    result = result.filter((c) => c.vip === true);
  } else if (state.activeFilter === 'normal') {
    result = result.filter((c) => !c.vip);
  }

  result = filterCustomers(result, state.searchQuery);

  if (state.activeSort === 'spent') {
    result = [...result].sort((a, b) => (b._totalPaid || 0) - (a._totalPaid || 0));
  } else if (state.activeSort === 'name') {
    result = [...result].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ar')
    );
  } else {
    result = [...result].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  return result;
}

export function hasMeasurements(c) {
  if (!c.measurements) return false;
  return Object.keys(c.measurements).length > 0;
}
