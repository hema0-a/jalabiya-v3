/* ==========================================================================
   orders.js — مستودع الطلبات
   ==========================================================================
   يضيف دوال بحث: عميل، حالة، نشط، مستحق قريب، إحصائيات.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';
import { customers as customersRepo, walletOf, loyaltyConfig, pointsForAmount, postureLabels } from './customers.js';
import { payments as paymentsRepo } from './payments.js';
import { settings as settingsRepo } from './settings.js';

const base = createRepository(STORES.ORDERS);

/** منح نقاط الولاء لطلب سُلِّم (مرة واحدة؛ pointsAwarded يمنع التكرار). */
async function _awardPoints(id, o) {
  try {
    if (!o.customerId) return;
    const cfg = loyaltyConfig(await settingsRepo.get());
    const pts = pointsForAmount(o.amount, cfg);
    if (pts <= 0) return;
    await customersRepo.walletAdjust(o.customerId, {
      points: pts, type: 'earn', orderId: id, note: 'طلب #' + String(id).slice(-6),
    });
    await base.update(id, { pointsAwarded: pts });
  } catch (e) { console.warn('[orders] award points:', e); }
}

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
  const posture = postureLabels(customer);   /* ملاحظات القوام تُحفظ مع المقاسات */
  return (out.length > 0 || posture.length > 0)
    ? { at: Date.now(), fields: out, posture }
    : null;
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
    let prev = null;
    if (p && (p.status === 'ready' || p.status === 'delivered')) prev = await base.find(id);
    if (p && p.status === 'ready') {
      /* readyAt صريح (مثل التراجع عن «تسليم») يُحفظ كما هو بدل إعادة ضبط عمر الجاهزية */
      if (prev && prev.status !== 'ready' && !('readyAt' in p)) p = { ...p, readyAt: Date.now() };
    }
    const res = await base.update(id, p);
    /* نقاط الولاء: تُمنح مرة واحدة عند أول تسليم */
    if (p && p.status === 'delivered' && prev && prev.status !== 'delivered' && !prev.pointsAwarded) {
      await _awardPoints(id, { ...prev, ...p });
    }
    return res;
  },

  /**
   * خصم من رصيد العميل المدفوع مقدّماً على طلب: يُنشئ دفعة «من الرصيد» ويُنقص الرصيد.
   * @param {string} orderId
   * @param {number} amount — المطلوب (يُقصّ على الرصيد والمتبقي)
   * @param {number} remaining — المتبقي على الطلب وقت الطلب
   * @returns {Promise<number>} المبلغ المخصوم فعلاً
   */
  async spendCredit(orderId, amount, remaining) {
    const o = await base.find(orderId);
    if (!o || !o.customerId) throw new Error('الطلب أو العميل غير موجود');
    const c = await customersRepo.find(o.customerId);
    const amt = Math.round(Math.min(Number(amount) || 0, walletOf(c).balance, Number(remaining) || 0) * 100) / 100;
    if (!(amt > 0)) throw new Error('لا يوجد مبلغ للخصم');
    await customersRepo.walletAdjust(o.customerId, {
      balance: -amt, type: 'spend', orderId, note: 'طلب #' + String(orderId).slice(-6),
    });
    try {
      await paymentsRepo.create({
        customerId: o.customerId, orderId, amount: amt, method: 'other',
        notes: 'خصم من رصيد العميل', isDeposit: false, fromCredit: true,
      });
    } catch (e) {
      /* فشل تسجيل الدفعة: رجّع الرصيد حتى لا يضيع */
      await customersRepo.walletAdjust(o.customerId, { balance: amt, type: 'adjust', note: 'تراجع: فشل تسجيل الدفعة' });
      throw e;
    }
    return amt;
  },

  /**
   * استبدال نقاط بخصم ثابت على الطلب (يُخفَّض الإجمالي).
   * @param {string} orderId
   * @param {number} points — المطلوب (يُقصّ على نقاط العميل والمتبقي)
   * @param {number} remaining — المتبقي على الطلب
   * @returns {Promise<{value:number, points:number}>}
   */
  async redeemPoints(orderId, points, remaining) {
    const st = await settingsRepo.get();
    const cfg = loyaltyConfig(st);
    if (!cfg.enabled) throw new Error('نظام النقاط متوقف من الإعدادات');
    const o = await base.find(orderId);
    if (!o || !o.customerId) throw new Error('الطلب أو العميل غير موجود');
    const c = await customersRepo.find(o.customerId);
    const have = walletOf(c).points;
    const want = Math.min(Math.floor(Number(points) || 0), have);
    const curDisc = Number(o.discountAmount) || 0;
    const subtotal = Number(o.subtotal) || 0;
    const headroom = subtotal > 0 ? Math.max(0, subtotal - curDisc) : Number(remaining) || 0;
    let value = Math.min(want * cfg.pointValue, Number(remaining) || 0, headroom);
    value = Math.round(value * 100) / 100;
    const used = Math.min(want, Math.ceil(value / cfg.pointValue - 1e-9));
    if (!(value > 0) || used <= 0) throw new Error('لا يوجد ما يُخصم');
    await customersRepo.walletAdjust(o.customerId, {
      points: -used, type: 'redeem', orderId, note: 'خصم ' + value + ' ج.م على طلب #' + String(orderId).slice(-6),
    });
    try {
      const newDisc = Math.round((curDisc + value) * 100) / 100;
      await base.update(orderId, {
        discountType: 'fixed', discountValue: newDisc, discountAmount: newDisc,
        amount: Math.round(((Number(o.amount) || 0) - value) * 100) / 100,
        loyaltyRedeemed: Math.round(((Number(o.loyaltyRedeemed) || 0) + value) * 100) / 100,
      });
    } catch (e) {
      await customersRepo.walletAdjust(o.customerId, { points: used, type: 'adjust', note: 'تراجع: فشل تطبيق الخصم' });
      throw e;
    }
    return { value, points: used };
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
