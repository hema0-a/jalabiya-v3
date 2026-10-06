/* ==========================================================================
   schema.js — تعريف بنية IndexedDB
   ==========================================================================
   v6: إضافة مخزني personalLoans + loanPayments.
   ⚠️ لا تُستخدم boolean كمفاتيح فهرس.
   ========================================================================== */

import { STORES } from '../core/config.js';

const idx = (name, keyPath, unique = false) => ({ name, keyPath, unique });

export const SETTINGS_ID = 'main';
export const STORE_NAMES = Object.values(STORES);

export const SCHEMA = {
  [STORES.CUSTOMERS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_name', 'name'),
      idx('by_phone', 'phone'),
      idx('by_createdAt', 'createdAt'),
    ],
  },
  [STORES.ORDERS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_customerId', 'customerId'),
      idx('by_status', 'status'),
      idx('by_createdAt', 'createdAt'),
      idx('by_dueDate', 'dueDate'),
    ],
  },
  [STORES.PAYMENTS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_orderId', 'orderId'),
      idx('by_customerId', 'customerId'),
      idx('by_createdAt', 'createdAt'),
    ],
  },
  [STORES.INVENTORY]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_name', 'name'),
      idx('by_category', 'category'),
    ],
  },
  [STORES.WORKERS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [idx('by_name', 'name')],
  },
  [STORES.EXPENSES]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_category', 'category'),
      idx('by_date', 'date'),
    ],
  },
  [STORES.APPOINTMENTS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_customerId', 'customerId'),
      idx('by_orderId', 'orderId'),
      idx('by_date', 'date'),
      idx('by_status', 'status'),
    ],
  },
  [STORES.SETTINGS]: {
    keyPath: 'id', autoIncrement: false, indexes: [],
  },
  [STORES.TRASH]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_originalStore', 'originalStore'),
      idx('by_deletedAt', 'deletedAt'),
    ],
  },
  [STORES.ACTIVITY]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_type', 'type'),
      idx('by_timestamp', 'timestamp'),
      idx('by_entityId', 'entityId'),
    ],
  },
  [STORES.PORTFOLIO]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_createdAt', 'createdAt'),
      idx('by_category', 'category'),
      idx('by_customerId', 'customerId'),
    ],
  },
  [STORES.COMMITMENTS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_category', 'category'),
      idx('by_frequency', 'frequency'),
      idx('by_createdAt', 'createdAt'),
    ],
  },
  [STORES.COMMITMENT_PAYMENTS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_commitmentId', 'commitmentId'),
      idx('by_date', 'date'),
    ],
  },
  [STORES.SAVINGS_GOALS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_createdAt', 'createdAt'),
    ],
  },
  [STORES.HOUSE_EXPENSES]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_category', 'category'),
      idx('by_date', 'date'),
      idx('by_createdAt', 'createdAt'),
    ],
  },
  /* --- جديد v6 --- */
  [STORES.PERSONAL_LOANS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_type', 'type'),
      idx('by_personName', 'personName'),
      idx('by_createdAt', 'createdAt'),
    ],
  },
  [STORES.LOAN_PAYMENTS]: {
    keyPath: 'id', autoIncrement: false,
    indexes: [
      idx('by_loanId', 'loanId'),
      idx('by_date', 'date'),
    ],
  },
};

/**
 * التحقق من تطابق SCHEMA مع STORES.
 */
export function validateSchema() {
  const schemaKeys = Object.keys(SCHEMA).sort();
  const storeValues = Object.values(STORES).sort();
  const missing = storeValues.filter((s) => !schemaKeys.includes(s));
  const extra = schemaKeys.filter((s) => !storeValues.includes(s));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push('missing: ' + missing.join(', '));
    if (extra.length) parts.push('extra: ' + extra.join(', '));
    throw new Error('[schema] Mismatch with STORES — ' + parts.join(' | '));
  }
  return true;
}
