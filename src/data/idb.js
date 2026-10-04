/* ==========================================================================
   idb.js — غلاف IndexedDB (Promise-based wrapper)
   ==========================================================================
   المسؤول الوحيد عن التعامل المباشر مع IndexedDB.
   كل الدوال ترجع Promise — لا callbacks.
   ========================================================================== */

import { DB_CONFIG } from '../core/config.js';
import { SCHEMA, validateSchema } from './schema.js';

/* --- النسخة الوحيدة من القاعدة (Singleton) --- */
let dbInstance = null;

/**
 * تغليف IDBRequest في Promise.
 * @param {IDBRequest} request
 * @returns {Promise<*>}
 */
function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * فتح قاعدة البيانات (أو إرجاع النسخة المفتوحة).
 * يُنشئ المخازن والفهارس عند أول فتح أو عند ترقية الإصدار.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    try { validateSchema(); }
    catch (err) { return reject(err); }

    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
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
      // إعادة فتح تلقائي عند إغلاق غير متوقع (مثلاً تبويب آخر يطلب ترقية)
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('[idb] upgrade blocked by another tab'));
  });
}

/**
 * فتح transaction على مخزن واحد (قراءة أو كتابة).
 * @param {string} storeName
 * @param {IDBTransactionMode} [mode='readonly']
 * @returns {Promise<IDBObjectStore>}
 */
async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

/**
 * إضافة أو تحديث سجل.
 * @param {string} storeName
 * @param {Object} value — يجب أن يحتوي على id
 * @returns {Promise<string>} المعرّف
 */
export async function put(storeName, value) {
  const store = await getStore(storeName, 'readwrite');
  return wrap(store.put(value));
}

/**
 * قراءة سجل بواسطة المعرّف.
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export async function get(storeName, id) {
  const store = await getStore(storeName);
  return wrap(store.get(id));
}

/**
 * قراءة كل السجلات من مخزن.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export async function getAll(storeName) {
  const store = await getStore(storeName);
  return wrap(store.getAll());
}

/**
 * حذف سجل بواسطة المعرّف.
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(storeName, id) {
  const store = await getStore(storeName, 'readwrite');
  return wrap(store.delete(id));
}

/**
 * حذف كل السجلات من مخزن.
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function clear(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return wrap(store.clear());
}

/**
 * عدّ السجلات في مخزن.
 * @param {string} storeName
 * @returns {Promise<number>}
 */
export async function count(storeName) {
  const store = await getStore(storeName);
  return wrap(store.count());
}

/**
 * البحث عبر فهرس.
 * @param {string} storeName
 * @param {string} indexName
 * @param {*} value
 * @returns {Promise<Array>}
 */
export async function getByIndex(storeName, indexName, value) {
  const store = await getStore(storeName);
  return wrap(store.index(indexName).getAll(value));
}

/**
 * إغلاق القاعدة (للاستخدام في الاختبار أو الصيانة).
 */
export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
