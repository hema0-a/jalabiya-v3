/* ==========================================================================
   loans-logic.js — ثوابت وأدوات نقية لصفحة القروض (v3.5.11)
   ==========================================================================
   TYPE_MAP · typeColor · typeBg · applyFilters(state). لا DOM ولا استيراد من وحدات الصفحة.
   (ملاحظة: typeBg غير مستدعاة من أي مكان في الأصل، أُبقيت كما هي.)
   ========================================================================== */

import { LOAN_TYPES } from '../core/config.js';
import { normalizeSearch } from '../core/utils.js';

export const TYPE_MAP = {};
LOAN_TYPES.forEach((t) => { TYPE_MAP[t.id] = t; });

/* ==========================================================================
   1. أدوات
   ========================================================================== */

export function typeColor(type) {
  return type === 'given' ? '#2E7D32' : '#C62828';
}

export function typeBg(type) {
  return type === 'given' ? '#E8F5E9' : '#FFEBEE';
}

export function applyFilters(state) {
  let list = state.loans;
  if (state.activeFilter !== 'all') {
    list = list.filter((l) => l.type === state.activeFilter);
  }
  const q = normalizeSearch(state.searchQuery);
  if (q) {
    list = list.filter((l) =>
      normalizeSearch(l.personName).includes(q) ||
      StringphoneMatches(l.phone, q)
    );
  }
  return list;
}
