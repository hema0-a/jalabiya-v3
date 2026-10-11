/* ==========================================================================
   customer-merge.js — كشف العملاء المكررين ودمجهم (v3.3.30)
   ========================================================================== */

import { toLatinDigits } from '../core/utils.js';

export function phoneKey(phone) {
  const d = toLatinDigits(phone).replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
export function nameKey(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * مجموعات التكرار.
 * strong = نفس الهاتف (آخر 10 أرقام) — شبه مؤكد.
 * name   = نفس الاسم تماماً مع غياب/اختلاف الهاتف — محتمل فقط، يقرّره المستخدم.
 * @returns {Array<{kind:'phone'|'name', key:string, customers:Array}>}
 */
export function findDuplicateGroups(customers) {
  const list = (Array.isArray(customers) ? customers : []).filter((c) => c && c.id);
  const groups = [];
  const used = new Set();
  const byPhone = new Map();
  for (const c of list) {
    const k = phoneKey(c.phone);
    if (!k) continue;
    if (!byPhone.has(k)) byPhone.set(k, []);
    byPhone.get(k).push(c);
  }
  for (const [key, arr] of byPhone) {
    if (arr.length > 1) { groups.push({ kind: 'phone', key, customers: arr }); arr.forEach((c) => used.add(c.id)); }
  }
  const byName = new Map();
  for (const c of list) {
    if (used.has(c.id)) continue;
    const k = nameKey(c.name);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c);
  }
  for (const [key, arr] of byName) {
    if (arr.length > 1) groups.push({ kind: 'name', key, customers: arr });
  }
  return groups;
}

/** يقترح أي سجل يبقى: الأكثر بياناتاً ثم الأقدم */
export function pickPrimary(customers) {
  const score = (c) => ['phone', 'address', 'notes', 'email'].filter((f) => c[f]).length + (c.vip ? 1 : 0);
  return [...customers].sort((a, b) => score(b) - score(a) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))[0];
}

/** حقول تُكمَّل في السجل الباقي من المكررات (لا تُكتب فوق قيم موجودة) */
export function mergeFields(primary, dups) {
  const patch = {};
  for (const f of ['phone', 'address', 'notes', 'email']) {
    if (!primary[f]) {
      const src = dups.find((d) => d && d[f]);
      if (src) patch[f] = src[f];
    }
  }
  if (!primary.vip && dups.some((d) => d && d.vip)) patch.vip = true;
  if (primary.measurements == null) {
    const m = dups.find((d) => d && d.measurements);
    if (m) patch.measurements = m.measurements;
  }
  return patch;
}

/** المخازن التي تحمل customerId وتُعاد نسبتها للسجل الباقي */
export const CUSTOMER_LINKED_STORES = ['orders', 'payments', 'appointments', 'portfolio'];
