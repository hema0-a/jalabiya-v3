/* ==========================================================================
   offline-queue.js — طابور العمليات أثناء عدم الاتصال
   ==========================================================================
   يخزّن العمليات (create/update/delete) في localStorage حتى يعود الاتصال.
   عند العودة، يعالجها بالتسلسل عبر handler.
   ========================================================================== */

import { STORAGE_KEYS } from '../core/config.js';
import { uid } from '../core/utils.js';

const STORAGE_KEY = STORAGE_KEYS.V3_OFFLINE_QUEUE;
const MAX_QUEUE = 500;

/**
 * قراءة الطابور بأمان.
 * @returns {Array}
 */
function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * كتابة الطابور بأمان.
 * @param {Array} items
 */
function writeQueue(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('[offline-queue] write failed:', e);
  }
}

/**
 * إضافة عملية إلى الطابور.
 * @param {Object} op — {type, store, id?, data?}
 * @returns {Object} العملية مع id + createdAt
 */
export function add(op) {
  if (!op || !op.type || !op.store) {
    throw new TypeError('[offline-queue] op must have type + store');
  }
  const queue = readQueue();
  const item = {
    id: uid(),
    type: op.type,
    store: op.store,
    recordId: op.recordId || null,
    data: op.data ?? null,
    createdAt: Date.now(),
  };
  queue.push(item);
  /* تقليم عند تجاوز الحد (حذف الأقدم) */
  if (queue.length > MAX_QUEUE) {
    queue.splice(0, queue.length - MAX_QUEUE);
  }
  writeQueue(queue);
  return item;
}

/**
 * إرجاع نسخة من كل العمليات.
 * @returns {Array}
 */
export function list() {
  return readQueue();
}

/**
 * عدد العمليات في الطابور.
 * @returns {number}
 */
export function size() {
  return readQueue().length;
}

/**
 * حذف عملية بمعرّفها.
 * @param {string} id
 * @returns {boolean}
 */
export function remove(id) {
  const queue = readQueue();
  const idx = queue.findIndex((it) => it.id === id);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  writeQueue(queue);
  return true;
}

/**
 * مسح الطابور بالكامل.
 */
export function clear() {
  writeQueue([]);
}

/**
 * معالجة الطابور — يحاول كل عملية عبر handler.
 * إذا فشل handler → تُبقى العملية في الطابور.
 * إذا نجح → تُحذف.
 * @param {Function} handler — async (op) => void
 * @returns {Promise<{processed:number, failed:number}>}
 */
export async function process(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('[offline-queue] process requires a function');
  }
  const queue = readQueue();
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await handler(item);
      remove(item.id);
      processed++;
    } catch (e) {
      console.warn('[offline-queue] op failed, keeping in queue:', e);
      failed++;
    }
  }

  return { processed, failed };
}
