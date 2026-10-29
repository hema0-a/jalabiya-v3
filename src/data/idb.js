/* ==========================================================================
   idb.js — غلاف IndexedDB (Promise-based)
   ==========================================================================
   Migration v8 → v9: إضافة مخزن backups.
   ⚠️ لا نلمس المخازن الموجودة.
   ========================================================================== */

import { DB_CONFIG, STORES } from '../core/config.js';
import { SCHEMA, validateSchema } from './schema.js';
import { stampForWrite, isRecordStore } from './record-meta.js';

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

/* مستمعو الكتابة الدفعية فقط (المزامنة/الاستعادة/الاستيراد/الترحيل): يُستعمل لإعادة ترحيل السجلات القديمة */
const batchListeners = [];
export function onBatchWrite(cb) { if (typeof cb === 'function') batchListeners.push(cb); }
function notifyBatch(names) {
  for (const cb of batchListeners) { try { cb(names); } catch (e) { console.warn('[idb] onBatchWrite listener:', e); } }
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

/* مستمعو تعديل السجلات الفردية (لشواهد الحذف): (storeName, id) بعد نجاح العملية */
const putListeners = [];
const removeListeners = [];
export function onPut(cb) { if (typeof cb === 'function') putListeners.push(cb); }
export function onRemove(cb) { if (typeof cb === 'function') removeListeners.push(cb); }
function notifyRec(list, storeName, id) {
  for (const cb of list) { try { cb(storeName, id); } catch (e) { console.warn('[idb] record listener:', e); } }
}

/**
 * كتابة سجل واحد. لمخازن السجلات المتزامنة: قراءة السجل الحالي ثم الكتابة في معاملة واحدة،
 * وختم نسخة المخطط (_v) وأزمنة الحقول المتغيرة (_ft/_fb) — انظر record-meta.js.
 * (الدمج المجمّع writeBatch لا يختم: يحمل سجلات جاهزة من السحابة/النسخة الاحتياطية.)
 */
async function putStamped(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(storeName, 'readwrite'); }
    catch (e) { reject(e); return; }
    let result;
    tx.oncomplete = () => { writeVersion++; notifyWrite([storeName]); resolve(result); };
    tx.onerror = () => reject(tx.error || new Error('[idb] write failed'));
    tx.onabort = () => reject(tx.error || new Error('[idb] write aborted'));
    const fail = (e) => { try { tx.abort(); } catch (_) { /* ignore */ } reject(e); };
    try {
      const store = tx.objectStore(storeName);
      const writeIt = (existing) => {
        try {
          let toWrite = value;
          try { toWrite = stampForWrite(storeName, existing, value, Date.now()); }
          catch (e) { console.warn('[idb] ختم السجل فشل — يُكتب كما هو:', e); toWrite = value; }
          const req = store.put(toWrite);
          req.onsuccess = () => { result = req.result; };
        } catch (e) { fail(e); }
      };
      const key = value && store.keyPath ? value[store.keyPath] : undefined;
      if (isRecordStore(storeName) && key !== undefined && key !== null) {
        const g = store.get(key);
        g.onsuccess = () => writeIt(g.result);
      } else {
        writeIt(undefined);
      }
    } catch (e) { fail(e); }
  });
}

export async function put(storeName, value) {
  const res = isRecordStore(storeName)
    ? await putStamped(storeName, value)
    : await writeOp(storeName, (store) => store.put(value));
  notifyRec(putListeners, storeName, value ? value.id : undefined);
  return res;
}

export async function get(storeName, id) {
  const store = await getStore(storeName);
  return wrap(store.get(id));
}

export async function getAll(storeName) {
  const store = await getStore(storeName);
  return wrap(store.getAll());
}

/**
 * مفاتيح مخزن فقط (بلا قراءة السجلات) — للفحوص الخفيفة على مخازن ضخمة مثل orderMedia (v3.3.86). قراءة فقط.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export async function getAllKeys(storeName) {
  const store = await getStore(storeName);
  return wrap(store.getAllKeys());
}

export async function remove(storeName, id) {
  const res = await writeOp(storeName, (store) => store.delete(id));
  notifyRec(removeListeners, storeName, id);
  return res;
}

export async function clear(storeName) {
  return writeOp(storeName, (store) => store.clear());
}

export async function count(storeName) {
  const store = await getStore(storeName);
  return wrap(store.count());
}

/**
 * قراءة دفعة سجلات من مخزن بترتيب المفتاح — قراءة فقط (معاملة readonly، لا تكتب شيئاً).
 * تُستخدم لفحص مخازن كبيرة (مثل الطلبات ذات الصور) دون تحميلها كلها في الذاكرة دفعة واحدة
 * ودون تجميد الواجهة: كل دفعة معاملة مستقلة، فيمكن إرخاء التحكم للمتصفح بين الدفعات.
 * @param {string} storeName
 * @param {*} [afterKey] — يُقرأ ما بعد هذا المفتاح (غير شامل)؛ undefined/null = من البداية
 * @param {number} [limit=25] — أقصى عدد سجلات في الدفعة
 * @returns {Promise<{records:Array, lastKey:*, done:boolean}>} done=true حين انتهى المخزن
 */
export async function readBatchAfter(storeName, afterKey, limit = 25) {
  const db = await openDB();
  const max = Math.max(1, Math.floor(Number(limit)) || 25);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const range = (afterKey === undefined || afterKey === null) ? null : IDBKeyRange.lowerBound(afterKey, true);
      const records = [];
      let lastKey = afterKey;
      const req = tx.objectStore(storeName).openCursor(range);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve({ records, lastKey, done: true }); return; }
        records.push(cur.value);
        lastKey = cur.key;
        if (records.length >= max) { resolve({ records, lastKey, done: false }); return; }
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

export async function getByIndex(storeName, indexName, value) {
  const store = await getStore(storeName);
  return wrap(store.index(indexName).getAll(value));
}

/**
 * كتابة ذرّية (Atomic) لعدة مخازن في معاملة واحدة: كلها تنجح أو كلها تُلغى.
 * تُستخدم في الاستعادة والاستيراد والمزامنة حتى لا تبقى البيانات نصف مكتوبة.
 *
 * guards (اختياري — v3.3.76): حماية من «تعديل محلي وقع بعد حساب الخطة وقبل كتابتها».
 * قبل أي كتابة تُقرأ السجلات المحروسة داخل المعاملة نفسها وتُقارَن updatedAt الحالية بالمتوقعة؛
 * عند أي اختلاف تُلغى المعاملة كلها (لا كتابة جزئية) ويُرفض الوعد برمز `guard-mismatch`.
 * (قراءة-قرار-كتابة خارج معاملة واحدة كانت تُضيّع تعديلاً محلياً بصمت.)
 *
 * @param {Object<string,{clear?:boolean, deletes?:Array, records:Array}>} plan
 *   الترتيب داخل المخزن: clear ← deletes ← records (فالسجل المكتوب يغلب حذفاً لنفس المعرّف).
 * @param {{guards?:Object<string,Map<*,(number|null)>>}} [opts]
 *   guards[store] = Map(id → updatedAt المتوقعة، أو null = يجب ألا يكون السجل موجوداً)
 * @returns {Promise<Object<string,number>>} عدد السجلات المكتوبة لكل مخزن
 */
export async function writeBatch(plan, opts = {}) {
  const db = await openDB();
  const names = Object.keys(plan).filter((n) => db.objectStoreNames.contains(n));
  if (names.length === 0) return {};
  const guards = (opts && opts.guards) || null;
  return new Promise((resolve, reject) => {
    const counts = {};
    let tx;
    let mismatch = null;
    try {
      tx = db.transaction(names, 'readwrite');
    } catch (e) { reject(e); return; }
    tx.oncomplete = () => { writeVersion++; notifyWrite(names); notifyBatch(names); resolve(counts); };
    /* عند إلغاء الحارس تُطلق الطلبات المعلّقة أخطاء AbortError قبل حدث abort: لا نرفض بها كي يصل رمز guard-mismatch */
    tx.onerror = () => { if (mismatch) return; reject(tx.error || new Error('[idb] batch failed')); };
    tx.onabort = () => {
      if (mismatch) {
        const e = new Error('[idb] guard mismatch: ' + mismatch.store + ':' + mismatch.id);
        e.code = 'guard-mismatch'; e.store = mismatch.store; e.id = mismatch.id;
        reject(e);
      } else reject(tx.error || new Error('[idb] batch aborted'));
    };
    try {
      /* الحراس أولاً: تُنفَّذ طلبات القراءة بالترتيب قبل أي كتابة، فالإلغاء يسبق كل تغيير */
      if (guards) {
        for (const n of names) {
          const g = guards[n];
          if (!g) continue;
          const st = tx.objectStore(n);
          for (const [id, expected] of g) {
            const rq = st.get(id);
            rq.onsuccess = () => {
              if (mismatch) return;
              const cur = rq.result;
              const sig = cur ? (Number(cur.updatedAt) || 0) : null;
              if (sig !== expected) {
                mismatch = { store: n, id };
                try { tx.abort(); } catch (_) { /* ignore */ }
              }
            };
          }
        }
      }
      for (const n of names) {
        const store = tx.objectStore(n);
        const { clear: doClear, records, deletes } = plan[n];
        if (doClear) store.clear();
        for (const id of (deletes || [])) store.delete(id);
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
