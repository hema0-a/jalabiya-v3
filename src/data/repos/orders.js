/* ==========================================================================
   orders.js — مستودع الطلبات
   ==========================================================================
   يضيف دوال بحث: عميل، حالة، نشط، مستحق قريب، إحصائيات.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';
import { customers as customersRepo } from './customers.js';
import { settings as settingsRepo } from './settings.js';

const base = createRepository(STORES.ORDERS);

/**
 * نسخة ثابتة من مقاسات العميل وقت الطلب (v3.3.51).
 * تحفظ الاسم والوحدة مع القيمة، فلا تتأثر بتعديل مقاسات العميل أو إعادة تسمية الحقول لاحقاً.
 * @param {Object} customer
 * @param {Array} fields — measurementFields من الإعدادات
 * @returns {{at:number, fields:Array<{id:string,name:string,unit:string,value:*}>}|null}
 */
export function buildMeasurementsSnapshot(customer, fields) {
  const m = (customer && customer.measurements && typeof customer.measurements === 'object')
    ? customer.measurements : {};
  const list = Array.isArray(fields) ? fields : [];
  const known = new Set(list.map((f) => f.id));
  const has = (v) => v != null && v !== '';
  const out = [];
  list.forEach((f) => {
    if (has(m[f.id])) out.push({ id: f.id, name: f.name || f.id, unit: f.unit || '', value: m[f.id] });
  });
  Object.keys(m).forEach((k) => {
    if (!known.has(k) && has(m[k])) out.push({ id: k, name: k, unit: '', value: m[k] });
  });
  return out.length > 0 ? { at: Date.now(), fields: out } : null;
}

async function _snapshotFor(customerId) {
  if (!customerId) return null;
  try {
    const [c, st] = await Promise.all([customersRepo.find(customerId), settingsRepo.get()]);
    return c ? buildMeasurementsSnapshot(c, st && st.measurementFields) : null;
  } catch (e) {
    console.warn('[orders] measurements snapshot:', e);
    return null;
  }
}

export const orders = {
  ...base,

  /* يُسجَّل readyAt لحظة دخول الطلب حالة «جاهز» (لتذكير الاستلام v3.3.30) */
  async create(data) {
    const d = { ...(data || {}) };
    if (d.status === 'ready' && !d.readyAt) d.readyAt = Date.now();
    /* نسخة مقاسات وقت الطلب — إلا لو مُمرَّرة صراحةً (مثل الاستيراد/الاستعادة) */
    if (!('measurementsSnapshot' in d)) {
      const snap = await _snapshotFor(d.customerId);
      if (snap) d.measurementsSnapshot = snap;
    }
    return base.create(d);
  },

  /**
   * تحديث نسخة مقاسات الطلب من مقاسات العميل الحالية (يدوياً، بعد تأكيد المستخدم).
   * @param {string} orderId
   * @returns {Promise<Object|null>} النسخة الجديدة أو null لو لا مقاسات للعميل
   */
  async refreshMeasurementsSnapshot(orderId) {
    const o = await base.find(orderId);
    if (!o) return null;
    const snap = await _snapshotFor(o.customerId);
    if (!snap) return null;
    await base.update(orderId, { measurementsSnapshot: snap });
    return snap;
  },

  async update(id, patch) {
    let p = patch;
    if (p && p.status === 'ready') {
      const existing = await base.find(id);
      /* readyAt صريح (مثل التراجع عن «تسليم») يُحفظ كما هو بدل إعادة ضبط عمر الجاهزية */
      if (existing && existing.status !== 'ready' && !('readyAt' in p)) p = { ...p, readyAt: Date.now() };
    }
    return base.update(id, p);
  },

  /**
   * طلبات عميل معيّن.
   * @param {string} customerId
   * @returns {Promise<Array>}
   */
  async findByCustomer(customerId) {
    return base.findByIndex('by_customerId', customerId);
  },

  /**
   * طلبات بحالة معيّنة.
   * @param {string} status — pending | in_progress | ready | delivered | cancelled
   * @returns {Promise<Array>}
   */
  async listByStatus(status) {
    return base.findByIndex('by_status', status);
  },

  /**
   * الطلبات النشطة (غير مسلَّمة وغير ملغاة).
   * @returns {Promise<Array>}
   */
  async getActive() {
    const all = await base.list();
    return all.filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    );
  },

  /**
   * الطلبات المستحقة خلال N يوماً.
   * @param {number} [days=3]
   * @returns {Promise<Array>} مرتّبة تصاعدياً حسب dueDate
   */
  async getDueSoon(days = 3) {
    const now = Date.now();
    const limit = now + days * 24 * 60 * 60 * 1000;
    const all = await base.list();
    return all
      .filter(
        (o) =>
          o.dueDate &&
          o.dueDate <= limit &&
          o.status !== 'delivered' &&
          o.status !== 'cancelled'
      )
      .sort((a, b) => a.dueDate - b.dueDate);
  },

  /**
   * إحصائيات الطلبات (عدد لكل حالة).
   * @returns {Promise<Object>}
   */
  async getStats() {
    const all = await base.list();
    const stats = {
      total: all.length,
      pending: 0,
      inProgress: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    all.forEach((o) => {
      if (o.status === 'pending') stats.pending++;
      else if (o.status === 'in_progress') stats.inProgress++;
      else if (o.status === 'ready') stats.ready++;
      else if (o.status === 'delivered') stats.delivered++;
      else if (o.status === 'cancelled') stats.cancelled++;
    });
    return stats;
  },
};
