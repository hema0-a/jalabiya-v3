/* ==========================================================================
   idb.js — غلاف IndexedDB (Promise-based)
   ==========================================================================
   Migration v8 → v9: إضافة مخزن backups.
   ⚠️ لا نلمس المخازن الموجودة.
   ========================================================================== */

import { DB_CONFIG, STORES } from '../core/config.js';
import { SCHEMA, validateSchema } from './schema.js';

let dbInstance = null;

/* عدّاد تغيّر البيانات: يزيد مع أي كتابة/حذف/مسح — تعتمد عليه الحاسبات لإبطال الكاش تلقائياً */
let writeVersion = 0;
export function getWriteVersion() { return writeVersion; }

/* مستمعو الكتابة: يُستدعون بعد اكتمال كل معاملة كتابة بأسماء المخازن (تتبّع «تعديلات لم تُرفع») */
const writeListeners = [];
export function onWrite(cb) { if (typeof cb === 'function') writeListeners.push(cb); }
function notifyWrite(names) {
  for (const cb of writeListeners) { try { cb(names); } catch (e) { console.warn('[idb] onWrite listener:', e); } }
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* طلب فتح واحد مشترك: عند الإقلاع تُستدعى عشرات القراءات معاً، وكان كل استدعاء
   يفتح اتصالاً جديداً ويُسقط الأقدم دون إغلاقه — اتصالات يتيمة تُعطّل ترقية القاعدة لاحقاً. */
let openPromise = null;

export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!openPromise) {
    openPromise = _openDB().finally(() => { openPromise = null; });
  }
  return openPromise;
}

function _openDB() {
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

      /* --- Migration v8 → v9: إضافة النسخ الاحتياطية --- */
      if (oldVersion >= 8 && oldVersion < 9) {
        if (!db.objectStoreNames.contains(STORES.BACKUPS)) {
          const store = db.createObjectStore(STORES.BACKUPS, {
            keyPath: 'id', autoIncrement: false,
          });
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
      /* إن حدّثت نافذة أخرى قاعدة البيانات نُغلق اتصالنا حتى لا نعطّل الترقية */
      dbInstance.onversionchange = () => {
        try { dbInstance.close(); } catch (e) { /* ignore */ }
        dbInstance = null;
      };
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

/**
 * تنفيذ عملية كتابة واحدة وانتظار اكتمال المعاملة نفسها (oncomplete) لا نجاح الطلب فقط.
 * نجاح الطلب لا يعني أن البيانات حُفظت: تجاوز الحصة أو إغلاق التبويب يُلغيان المعاملة عند
 * الإنهاء، فكان التطبيق يُظهر «تم الحفظ» ثم تضيع البيانات بصمت.
 */
async function writeOp(storeName, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(storeName, 'readwrite'); }
    catch (e) { reject(e); return; }
    let result;
    tx.oncomplete = () => { writeVersion++; notifyWrite([storeName]); resolve(result); };
    tx.onerror = () => reject(tx.error || new Error('[idb] write failed'));
    tx.onabort = () => reject(tx.error || new Error('[idb] write aborted'));
    try {
      const req = run(tx.objectStore(storeName));
      req.onsuccess = () => { result = req.result; };
    } catch (e) {
      try { tx.abort(); } catch (_) { /* ignore */ }
      reject(e);
    }
  });
}

export async function put(storeName, value) {
  return writeOp(storeName, (store) => store.put(value));
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
  return writeOp(storeName, (store) => store.delete(id));
}

export async function clear(storeName) {
  return writeOp(storeName, (store) => store.clear());
}

export async function count(storeName) {
  const store = await getStore(storeName);
  return wrap(store.count());
}

export async function getByIndex(storeName, indexName, value) {
  const store = await getStore(storeName);
  return wrap(store.index(indexName).getAll(value));
}

/**
 * كتابة ذرّية (Atomic) لعدة مخازن في معاملة واحدة: كلها تنجح أو كلها تُلغى.
 * تُستخدم في الاستعادة والاستيراد والمزامنة حتى لا تبقى البيانات نصف مكتوبة.
 * @param {Object<string,{clear?:boolean, records:Array}>} plan
 * @returns {Promise<Object<string,number>>} عدد السجلات المكتوبة لكل مخزن
 */
export async function writeBatch(plan) {
  const db = await openDB();
  const names = Object.keys(plan).filter((n) => db.objectStoreNames.contains(n));
  if (names.length === 0) return {};
  return new Promise((resolve, reject) => {
    const counts = {};
    let tx;
    try {
      tx = db.transaction(names, 'readwrite');
    } catch (e) { reject(e); return; }
    tx.oncomplete = () => { writeVersion++; notifyWrite(names); resolve(counts); };
    tx.onerror = () => reject(tx.error || new Error('[idb] batch failed'));
    tx.onabort = () => reject(tx.error || new Error('[idb] batch aborted'));
    try {
      for (const n of names) {
        const store = tx.objectStore(n);
        const { clear: doClear, records } = plan[n];
        if (doClear) store.clear();
        let c = 0;
        for (const rec of (records || [])) { store.put(rec); c++; }
        counts[n] = c;
      }
    } catch (e) {
      try { tx.abort(); } catch (_) { /* ignore */ }
      reject(e);
    }
  });
}

export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
