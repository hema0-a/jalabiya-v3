/* ==========================================================================
   idb.js — غلاف IndexedDB (Promise-based)
   ==========================================================================
   Migration v7 → v8: إضافة مخزن workerPayments (دفعات العمال).
   ⚠️ لا نلمس المخازن الموجودة.
   ========================================================================== */

import { DB_CONFIG, STORES } from '../core/config.js';
import { SCHEMA, validateSchema } from './schema.js';

let dbInstance = null;

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    try { validateSchema(); }
    catch (err) { return reject(err); }

    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;
      const oldVersion = event.oldVersion;

      /* --- Migration v1 → v2: حذف فهارس boolean --- */
      if (oldVersion >= 1 && oldVersion < 2) {
        if (db.objectStoreNames.contains(STORES.CUSTOMERS)) {
          const s = tx.objectStore(STORES.CUSTOMERS);
          if (s.indexNames.contains('by_vip')) s.deleteIndex('by_vip');
        }
        if (db.objectStoreNames.contains(STORES.WORKERS)) {
          const s = tx.objectStore(STORES.WORKERS);
          if (s.indexNames.contains('by_active')) s.deleteIndex('by_active');
        }
      }

      /* --- Migration v2 → v3: إضافة portfolio --- */
      if (oldVersion >= 2 && oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORES.PORTFOLIO)) {
          const store = db.createObjectStore(STORES.PORTFOLIO, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_createdAt', 'createdAt');
          store.createIndex('by_category', 'category');
          store.createIndex('by_customerId', 'customerId');
        }
      }

      /* --- Migration v3 → v4: إضافة مخازن المالية الشخصية --- */
      if (oldVersion >= 3 && oldVersion < 4) {
        if (!db.objectStoreNames.contains(STORES.COMMITMENTS)) {
          const store = db.createObjectStore(STORES.COMMITMENTS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_category', 'category');
          store.createIndex('by_frequency', 'frequency');
          store.createIndex('by_createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORES.COMMITMENT_PAYMENTS)) {
          const store = db.createObjectStore(STORES.COMMITMENT_PAYMENTS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_commitmentId', 'commitmentId');
          store.createIndex('by_date', 'date');
        }
        if (!db.objectStoreNames.contains(STORES.SAVINGS_GOALS)) {
          const store = db.createObjectStore(STORES.SAVINGS_GOALS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_createdAt', 'createdAt');
        }
      }

      /* --- Migration v4 → v5: إضافة houseExpenses --- */
      if (oldVersion >= 4 && oldVersion < 5) {
        if (!db.objectStoreNames.contains(STORES.HOUSE_EXPENSES)) {
          const store = db.createObjectStore(STORES.HOUSE_EXPENSES, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_category', 'category');
          store.createIndex('by_date', 'date');
          store.createIndex('by_createdAt', 'createdAt');
        }
      }

      /* --- Migration v5 → v6: إضافة القروض --- */
      if (oldVersion >= 5 && oldVersion < 6) {
        if (!db.objectStoreNames.contains(STORES.PERSONAL_LOANS)) {
          const store = db.createObjectStore(STORES.PERSONAL_LOANS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_type', 'type');
          store.createIndex('by_personName', 'personName');
          store.createIndex('by_createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORES.LOAN_PAYMENTS)) {
          const store = db.createObjectStore(STORES.LOAN_PAYMENTS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_loanId', 'loanId');
          store.createIndex('by_date', 'date');
        }
      }

      /* --- Migration v6 → v7: إضافة الإحالات --- */
      if (oldVersion >= 6 && oldVersion < 7) {
        if (!db.objectStoreNames.contains(STORES.REFERRALS)) {
          const store = db.createObjectStore(STORES.REFERRALS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_referrer', 'referrerName');
          store.createIndex('by_status', 'status');
          store.createIndex('by_createdAt', 'createdAt');
        }
      }

      /* --- Migration v7 → v8: إضافة دفعات العمال --- */
      if (oldVersion >= 7 && oldVersion < 8) {
        if (!db.objectStoreNames.contains(STORES.WORKER_PAYMENTS)) {
          const store = db.createObjectStore(STORES.WORKER_PAYMENTS, {
            keyPath: 'id', autoIncrement: false,
          });
          store.createIndex('by_workerId', 'workerId');
          store.createIndex('by_date', 'date');
          store.createIndex('by_createdAt', 'createdAt');
        }
      }

      /* --- إنشاء المخازن الناقصة (oldVersion = 0 أو ترقية من V2) --- */
      Object.entries(SCHEMA).forEach(([storeName, config]) => {
        if (db.objectStoreNames.contains(storeName)) return;
        const store = db.createObjectStore(storeName, {
          keyPath: config.keyPath,
          autoIncrement: config.autoIncrement,
        });
        config.indexes.forEach((i) => {
          store.createIndex(i.name, i.keyPath, { unique: i.unique });
        });
      });
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('[idb] upgrade blocked by another tab'));
  });
}

async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

export async function put(storeName, value) {
  const store = await getStore(storeName, 'readwrite');
  return wrap(store.put(value));
}

export async function get(storeName, id) {
  const store = await getStore(storeName);
  return wrap(store.get(id));
}

export async function getAll(storeName) {
  const store = await getStore(storeName);
  return wrap(store.getAll());
}

export async function remove(storeName, id) {
  const store = await getStore(storeName, 'readwrite');
  return wrap(store.delete(id));
}

export async function clear(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return wrap(store.clear());
}

export async function count(storeName) {
  const store = await getStore(storeName);
  return wrap(store.count());
}

export async function getByIndex(storeName, indexName, value) {
  const store = await getStore(storeName);
  return wrap(store.index(indexName).getAll(value));
}

export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
