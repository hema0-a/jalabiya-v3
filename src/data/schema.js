/* ==========================================================================
   schema.js — تعريف بنية IndexedDB (المخازن + الفهارس)
   ==========================================================================
   يُستورَد من idb.js لإنشاء قاعدة البيانات.
   لا يحتوي على منطق تنفيذي — فقط وصف البنية.
   ========================================================================== */

import { STORES } from '../core/config.js';

/* --- مصنع الفهارس — لتقليل التكرار --- */
const idx = (name, keyPath, unique = false) => ({ name, keyPath, unique });

/* --- معرّف السجل الوحيد في مخزن الإعدادات --- */
export const SETTINGS_ID = 'main';

/* --- قائمة أسماء كل المخازن (من config.js — مصدر الحقيقة الوحيد) --- */
export const STORE_NAMES = Object.values(STORES);

/* ==========================================================================
   SCHEMA — وصف كامل لكل مخزن
   ==========================================================================
   كل مخزن له:
     - keyPath: 'id' (جميع السجلات تُولّد بـ uid())
     - autoIncrement: false (نتحكم في المعرّفات)
     - indexes: قائمة الفهارس للبحث السريع
   ========================================================================== */

export const SCHEMA = {
  /* --- العملاء --- */
  [STORES.CUSTOMERS]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_name',      'name'),
      idx('by_phone',     'phone'),
      idx('by_createdAt', 'createdAt'),
      idx('by_vip',       'vip'),
    ],
  },

  /* --- الطلبات --- */
  [STORES.ORDERS]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_customerId', 'customerId'),
      idx('by_status',     'status'),
      idx('by_createdAt',  'createdAt'),
      idx('by_dueDate',    'dueDate'),
    ],
  },

  /* --- الدفعات --- */
  [STORES.PAYMENTS]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_orderId',    'orderId'),
      idx('by_customerId', 'customerId'),
      idx('by_createdAt',  'createdAt'),
    ],
  },

  /* --- المخزون --- */
  [STORES.INVENTORY]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_name',     'name'),
      idx('by_category', 'category'),
    ],
  },

  /* --- العمال --- */
  [STORES.WORKERS]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_name',   'name'),
      idx('by_active', 'active'),
    ],
  },

  /* --- مصروفات الورشة --- */
  [STORES.EXPENSES]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_category', 'category'),
      idx('by_date',     'date'),
    ],
  },

  /* --- المواعيد --- */
  [STORES.APPOINTMENTS]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_customerId', 'customerId'),
      idx('by_orderId',    'orderId'),
      idx('by_date',       'date'),
      idx('by_status',     'status'),
    ],
  },

  /* --- الإعدادات (سجل واحد فقط: id='main') --- */
  [STORES.SETTINGS]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [],
  },

  /* --- سلة المحذوفات --- */
  [STORES.TRASH]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_originalStore', 'originalStore'),
      idx('by_deletedAt',     'deletedAt'),
    ],
  },

  /* --- سجل النشاط --- */
  [STORES.ACTIVITY]: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      idx('by_type',      'type'),
      idx('by_timestamp', 'timestamp'),
      idx('by_entityId',  'entityId'),
    ],
  },
};

/* ==========================================================================
   VALIDATION — التحقق من تطابق SCHEMA مع STORES
   ========================================================================== */

/**
 * التحقق من تطابق مفاتيح SCHEMA مع قيم STORES.
 * @returns {true} إذا تطابقا تماماً
 * @throws {Error} إذا كان هناك مخزن ناقص أو زائد
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
