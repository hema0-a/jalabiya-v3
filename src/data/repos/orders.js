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
import { getActiveSession, stopSession } from '../../services/order-timing.js';
import { orderMedia } from './order-media.js';
import { externalizeMedia } from '../../services/order-media.js';
import { uid } from '../../core/utils.js';

const base = createRepository(STORES.ORDERS);

/**
 * مواءمة نقاط الولاء مع حالة الطلب ومبلغه (v3.3.77).
 *
 * `pointsAwarded` = **الصافي المنسوب فعلاً لهذا الطلب** (ما مُنح ناقص ما سُحب فعلاً)، وليس «المستهدف».
 * الفرق مهم عند إنفاق العميل نقاطه: السحب يُقصّ على رصيده (لا يصير سالباً)، فالمتبقي غير المسحوب
 * يبقى منسوباً للطلب ولا يُمنح ثانيةً عند إعادة التسليم أو رفع السعر. (قبل 3.3.77 كان يُسجَّل المستهدف
 * فيُكسب العميل النقاط مرتين: أنفق → أعِد فتح الطلب → سلّمه، أو أنفق → اخفض السعر → أعده.)
 *
 *  - تسليم (أول مرة أو بعد إعادة فتح): الهدف = نقاط المبلغ، والفرق عن المنسوب يُمنح.
 *  - مسلَّم وتغيّر مبلغه: الفرق يُمنح/يُسحب (السحب لا يتجاوز رصيد نقاطه).
 *  - إعادة فتح/إلغاء: الهدف صفر، يُسحب المنسوب بقدر رصيده والباقي يبقى منسوباً.
 *  - طلب مسلَّم قبل نظام النقاط (بلا منسوب): لا أثر رجعي عند تعديل مبلغه.
 * @param {string} id
 * @param {Object} prev — الطلب قبل التعديل
 * @param {Object} next — الطلب بعد التعديل
 */
async function _syncPoints(id, prev, next) {
  try {
    if (!prev || !next || !next.customerId) return;
    const wasDelivered = prev.status === 'delivered';
    const isDelivered = next.status === 'delivered';
    const old = Math.max(0, Math.floor(Number(prev.pointsAwarded) || 0));
    let target;
    if (!isDelivered) {
      if (old <= 0) return;
      target = 0;
    } else {
      if (wasDelivered) {
        if (old <= 0) return;
        if (Number(next.amount) === Number(prev.amount)) return;
      }
      const cfg = loyaltyConfig(await settingsRepo.get());
      if (!cfg.enabled) return;
      target = pointsForAmount(next.amount, cfg);
    }
    let delta = target - old;
    if (delta === 0) return;
    if (delta < 0) {
      const c = await customersRepo.find(next.customerId);
      delta = -Math.min(-delta, walletOf(c).points);
    }
    if (delta === 0) return;                      /* لا رصيد نقاط لسحبه: المنسوب يبقى كما هو */
    const tag = String(id).slice(-6);
    await customersRepo.walletAdjust(next.customerId, {
      points: delta, orderId: id,
      type: (old === 0 && delta > 0) ? 'earn' : 'adjust',
      note: !isDelivered ? 'سحب نقاط: إعادة فتح/إلغاء طلب #' + tag
        : (old === 0 ? 'طلب #' + tag : 'تعديل نقاط: تغيّر مبلغ طلب #' + tag),
    });
    await base.update(id, { pointsAwarded: old + delta });
  } catch (e) { console.warn('[orders] sync points:', e); }
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

/** حقول تستدعي معالجة الوسائط عند الكتابة (v3.3.87). */
const MEDIA_KEYS = ['referenceImage', 'signature', 'deliveries'];
const touchesMedia = (p) => !!p && typeof p === 'object' && MEDIA_KEYS.some((k) => k in p);

/**
 * يكتب وسائط جديدة في orderMedia. الترتيب الآمن: **الوسائط أولاً ثم الطلب** — فشل الطلب بعدها يترك بايتات غير مشار
 * إليها (تُنظَّف)، أما العكس فيترك طلباً يشير لوسيط مفقود (ضياع صورة).
 * @param {string} id
 * @param {Array<{slot:string,data:string}>} puts
 */
async function writeMedia(id, puts) {
  for (const p of puts) await orderMedia.put(id, p.slot, p.data);
}

/**
 * يحذف وسائط (تنظيف أو بعد إفراغ صريح). لا يرمي: فشله يترك بايتات يتيمة يكشفها فحص السلامة.
 * @param {string} id
 * @param {string[]} slots
 */
async function dropMedia(id, slots) {
  for (const slot of slots) {
    try { await orderMedia.remove(id, slot); } catch (e) { console.warn('[orders] تعذّر حذف وسيط', id, slot, e); }
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
    /* الوسائط (v3.3.87): الصورة والتوقيعات الجديدة تذهب إلى orderMedia ولا تدخل سجل الطلب */
    if (touchesMedia(d)) {
      const id = d.id || uid();
      const ex = externalizeMedia({ ...d, id }, null);
      if (ex.puts.length) await writeMedia(id, ex.puts);
      try { return await base.create(ex.record); }
      catch (e) { await dropMedia(id, ex.puts.map((p) => p.slot)); throw e; }
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
    /* نحتاج الطلب السابق لتغيّر الحالة/المبلغ (مواءمة نقاط الولاء + إغلاق مؤقت العمل) */
    if (p && (p.status !== undefined || p.amount !== undefined)) prev = await base.find(id);
    /* تسليم/إلغاء طلب مؤقته يعمل: تُغلق الجلسة الآن. زر المؤقت يُخفى للمسلَّم، فكانت الجلسة تبقى مفتوحة
       و«ساعات العمل» تتزايد كل ثانية للأبد بلا قدرة على إيقافها. */
    if (p && (p.status === 'delivered' || p.status === 'cancelled') && !('workSessions' in p)
        && prev && getActiveSession(prev.workSessions)) {
      p = { ...p, workSessions: stopSession(prev.workSessions) };
    }
    if (p && p.status === 'ready') {
      /* readyAt صريح (مثل التراجع عن «تسليم») يُحفظ كما هو بدل إعادة ضبط عمر الجاهزية */
      if (prev && prev.status !== 'ready' && !('readyAt' in p)) p = { ...p, readyAt: Date.now() };
    }
    /* الوسائط (v3.3.87): نفصل ما تغيّر فقط؛ المضمَّن القديم غير المتغيّر يبقى حيث هو (الترحيل في 3.3.88) */
    let ex = null;
    if (touchesMedia(p)) {
      const cur = prev || await base.find(id);
      if (!cur) return null;
      ex = externalizeMedia(p, cur);
      p = ex.record;
      if (ex.puts.length) await writeMedia(id, ex.puts);
    }
    const res = await base.update(id, p);
    if (ex) {
      if (!res) await dropMedia(id, ex.puts.map((x) => x.slot));       /* الطلب غير موجود: لا بايتات يتيمة */
      else if (ex.deletes.length) await dropMedia(id, ex.deletes);
    }
    /* نقاط الولاء: تُمنح عند التسليم وتتبع حالة الطلب ومبلغه (انظر _syncPoints) */
    if (res && prev) await _syncPoints(id, prev, res);
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
