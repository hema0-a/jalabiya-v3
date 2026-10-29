/* ==========================================================================
   commitments-logic.js — منطق نقي لصفحة المالية الشخصية (v3.5.10)
   ==========================================================================
   دوال بلا DOM ولا حالة عامة: ألوان الحالة + فلترة الالتزامات + فلترة الأهداف.
   ========================================================================== */

import { normalizeSearch } from '../core/utils.js';

/* ==========================================================================
   1. أدوات
   ========================================================================== */

export function statusColor(value, good, warn) {
  if (value >= good) return '#2E7D32';
  if (value >= warn) return '#F57C00';
  return '#C62828';
}

/**
 * فلترة الالتزامات بالتصنيف ثم بالبحث (نفس منطق الرسم السابق حرفياً).
 * @param {Array} items قائمة الالتزامات (withPayments)
 * @param {string} activeCategory 'all' أو معرّف التصنيف
 * @param {string} q نص البحث بعد normalizeSearch
 * @returns {Array}
 */
export function filterCommitments(items, activeCategory, q) {
  let list = items;
  if (activeCategory !== 'all') {
    list = list.filter((c) => (c.category || 'other') === activeCategory);
  }
  if (q) {
    list = list.filter((c) => normalizeSearch(c.name).includes(q));
  }
  return list;
}

/**
 * فلترة أهداف الادخار بالبحث.
 * @param {Array} items قائمة الأهداف
 * @param {string} q نص البحث بعد normalizeSearch
 * @returns {Array}
 */
export function filterGoals(items, q) {
  let list = items;
  if (q) {
    list = list.filter((g) => normalizeSearch(g.name).includes(q));
  }
  return list;
}
