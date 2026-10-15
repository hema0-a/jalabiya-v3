/* ==========================================================================
   customers.js — مستودع العملاء (طبقة متخصصة فوق Repository)
   ==========================================================================
   يضيف دوال بحث خاصة بالعملاء: هاتف، اسم، VIP.
   كل الدوال ترجع Promise.
   ⚠️ vip يُفلتر في JS (لا فهرس) — لأن boolean غير صالح كمفتاح IDB.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.CUSTOMERS);

export const customers = {
  ...base,

  /**
   * البحث عن عميل بواسطة رقم الهاتف (مطابقة دقيقة).
   * @param {string} phone
   * @returns {Promise<Object|null>}
   */
  async findByPhone(phone) {
    const results = await base.findByIndex('by_phone', phone);
    return results[0] ?? null;
  },

  /**
   * بحث بالاسم (substring، غير حساس لحالة الأحرف).
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByName(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((c) =>
      String(c.name ?? '').toLowerCase().includes(q)
    );
  },

  /**
   * قائمة العملاء المميّزين (VIP).
   * يُفلتر في JavaScript — لأن boolean غير صالح كمفتاح فهرس IDB.
   * @returns {Promise<Array>}
   */
  async listVIP() {
    const all = await base.list();
    return all.filter((c) => c.vip === true);
  },

  /**
   * تبديل حالة VIP لعميل.
   * @param {string} id
   * @returns {Promise<Object|null>} العميل المُحدَّث أو null
   */
  async toggleVIP(id) {
    const customer = await base.find(id);
    if (!customer) return null;
    return base.update(id, { vip: !customer.vip });
  },
};

/* ==========================================================================
   المحفظة: رصيد مدفوع مقدّماً + نقاط ولاء (v3.3.51)
   ==========================================================================
   تُحفظ على سجل العميل نفسه (creditBalance, points, walletLog) فتدخل النسخ الاحتياطية
   والمزامنة تلقائياً. كل حركة تُسجَّل في walletLog (آخر 100). */

const WALLET_LOG_MAX = 100;
const MAX_TOPUP = 10000000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * قراءة محفظة عميل.
 * @param {Object} c
 * @returns {{balance:number, points:number, log:Array}}
 */
export function walletOf(c) {
  return {
    balance: Math.max(0, r2(c && c.creditBalance)),
    points: Math.max(0, Math.floor(Number(c && c.points) || 0)),
    log: Array.isArray(c && c.walletLog) ? c.walletLog : [],
  };
}

/**
 * إعدادات الولاء مع قيم افتراضية آمنة.
 * @param {Object} st — الإعدادات
 * @returns {{enabled:boolean, earnEvery:number, pointValue:number}}
 */
export function loyaltyConfig(st) {
  const l = (st && st.loyalty) || {};
  const ee = Number(l.earnEvery); const pv = Number(l.pointValue);
  return { enabled: l.enabled !== false, earnEvery: ee > 0 ? ee : 20, pointValue: pv > 0 ? pv : 1 };
}

/**
 * عدد النقاط المستحقة لمبلغ طلب.
 * @param {number} amount
 * @param {{enabled:boolean, earnEvery:number}} cfg
 * @returns {number}
 */
export function pointsForAmount(amount, cfg) {
  if (!cfg || !cfg.enabled) return 0;
  const a = Number(amount) || 0;
  return a > 0 ? Math.floor(a / cfg.earnEvery) : 0;
}

/**
 * تعديل المحفظة بحركة مسجَّلة. يرفض أي حركة تجعل الرصيد أو النقاط سالبة.
 * @param {string} id — العميل
 * @param {{balance?:number, points?:number, type:string, note?:string, orderId?:string|null}} d
 * @returns {Promise<{balance:number, points:number}>}
 */
customers.walletAdjust = async function walletAdjust(id, d) {
  const c = await base.find(id);
  if (!c) throw new Error('العميل غير موجود');
  const w = walletOf(c);
  const dBal = r2(d.balance); const dPts = Math.round(Number(d.points) || 0);
  const nb = r2(w.balance + dBal); const np = w.points + dPts;
  if (nb < 0) throw new Error('الرصيد لا يكفي');
  if (np < 0) throw new Error('النقاط لا تكفي');
  const entry = {
    id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: Date.now(), type: d.type, balance: dBal, points: dPts,
    orderId: d.orderId || null, note: d.note || '',
  };
  await base.update(id, { creditBalance: nb, points: np, walletLog: [entry, ...w.log].slice(0, WALLET_LOG_MAX) });
  return { balance: nb, points: np };
};

/**
 * شحن رصيد عميل (دفع مقدّم).
 * @param {string} id
 * @param {number} amount
 * @param {string} [note]
 */
customers.walletTopUp = async function walletTopUp(id, amount, note) {
  const a = r2(amount);
  if (!(a > 0) || a > MAX_TOPUP) throw new Error('مبلغ غير صالح');
  return customers.walletAdjust(id, { balance: a, type: 'topup', note: note || 'شحن رصيد' });
};
