/* ==========================================================================
   customers.js — مستودع العملاء (طبقة متخصصة فوق Repository)
   ==========================================================================
   يضيف دوال بحث خاصة بالعملاء: هاتف، اسم، VIP.
   كل الدوال ترجع Promise.
   ⚠️ vip يُفلتر في JS (لا فهرس) — لأن boolean غير صالح كمفتاح IDB.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';
import { normalizePhone } from '../../core/utils.js';
import { recordWalletMove } from '../../services/ledger-shadow.js';

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
  /* ذرّي: كل الحساب داخل قفل السجل (حركتان متزامنتان كانتا تُضيّعان إحداهما) */
  let out = null;
  let logEntry = null;   /* حركة walletLog المكتوبة — تُسجَّل ظلّياً في الدفتر بعد نجاح الكتابة القديمة */
  const res = await base.modify(id, (c) => {
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
    out = { balance: nb, points: np };
    logEntry = entry;
    return { creditBalance: nb, points: np, walletLog: [entry, ...w.log].slice(0, WALLET_LOG_MAX) };
  });
  if (!res) throw new Error('العميل غير موجود');
  /* الوضع الظلّي (v3.3.79): لا يرمي ولا يغيّر نتيجة العملية — العدّادات القديمة هي المرجع */
  if (logEntry) await recordWalletMove(id, logEntry);
  return out;
};

/**
 * ينقل كل محفظة عميل (رصيد + نقاط) إلى عميل آخر — يُستعمل عند دمج عميلين (v3.3.80).
 * الترتيب مقصود: الإضافة للباقي أولاً ثم الخصم من المدموج؛ فأسوأ انقطاع يترك المبلغ مكرراً ظاهراً
 * (يمكن تصحيحه) لا ضائعاً. إن فشل الخصم يُعكس الإيداع قبل رمي الخطأ. تُكرَّر المحاولة إن وصلت حركة
 * متزامنة للمصدر أثناء النقل، وإن بقي شيء بعدها يُرمى خطأ (فلا يُحذف حساب فيه مال).
 * كل خطوة عبر walletAdjust فتُسجَّل في walletLog والدفتر الظلّي كالمعتاد.
 * @param {string} fromId — العميل المدموج (يُفرَّغ)
 * @param {string} toId — العميل الباقي (يستلم)
 * @param {{fromName?:string, toName?:string}} [names] — للملاحظات فقط
 * @returns {Promise<{balance:number, points:number, moved:boolean}>}
 * @throws {Error} إن تعذّر النقل الكامل
 */
customers.walletTransfer = async function walletTransfer(fromId, toId, names = {}) {
  if (!fromId || !toId || fromId === toId) throw new Error('عميلان مختلفان مطلوبان للنقل');
  if (!(await base.find(toId))) throw new Error('العميل الباقي غير موجود');
  let totalB = 0; let totalP = 0;
  for (let round = 0; round < 3; round++) {
    const from = await base.find(fromId);
    if (!from) break;
    const w = walletOf(from);
    const b = r2(w.balance); const p = Math.max(0, Math.round(w.points));
    if (!(b > 0) && !(p > 0)) {
      return { balance: totalB, points: totalP, moved: totalB > 0 || totalP > 0 };
    }
    await customers.walletAdjust(toId, {
      balance: b, points: p, type: 'adjust',
      note: 'محفظة واردة من دمج «' + (names.fromName || '') + '»',
    });
    try {
      await customers.walletAdjust(fromId, {
        balance: -b, points: -p, type: 'adjust',
        note: 'نُقلت المحفظة عند الدمج إلى «' + (names.toName || '') + '»',
      });
    } catch (e) {
      try {
        await customers.walletAdjust(toId, { balance: -b, points: -p, type: 'adjust', note: 'تراجع عن نقل محفظة لم يكتمل' });
      } catch (e2) { console.error('[customers] تعذّر عكس الإيداع بعد فشل نقل المحفظة:', e2); }
      throw e;
    }
    totalB = r2(totalB + b); totalP += p;
  }
  const left = await base.find(fromId);
  const lw = left ? walletOf(left) : { balance: 0, points: 0 };
  if (lw.balance > 0 || lw.points > 0) throw new Error('تعذّر نقل المحفظة كاملة — أعد المحاولة');
  return { balance: totalB, points: totalP, moved: totalB > 0 || totalP > 0 };
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

/* ==========================================================================
   ملاحظات القوام (v3.3.51)
   ==========================================================================
   خيارات سريعة تظهر مع المقاسات في الطلب وفي ملف العميل، لأن المقاس المظبوط على الورق
   قد لا يناسب الجسم (كتف واطي، بطن بارز...). تُحفظ كمعرّفات + ملاحظة حرة. */

export const POSTURE_OPTIONS = [
  { id: 'low_shoulder',   label: 'كتف واطي' },
  { id: 'high_shoulder',  label: 'كتف عالي' },
  { id: 'uneven_shoulders', label: 'كتفين غير متساويين' },
  { id: 'belly',          label: 'بطن بارز' },
  { id: 'stooped',        label: 'ظهر محني' },
  { id: 'arm_longer',     label: 'ذراع أطول من الأخرى' },
  { id: 'short_neck',     label: 'رقبة قصيرة' },
  { id: 'broad_chest',    label: 'صدر عريض' },
];

/**
 * ملاحظات قوام العميل كنصوص (الخيارات المعروفة + الملاحظة الحرة).
 * @param {Object} c
 * @returns {string[]}
 */
export function postureLabels(c) {
  if (!c) return [];
  const ids = Array.isArray(c.posture) ? c.posture : [];
  const out = POSTURE_OPTIONS.filter((o) => ids.includes(o.id)).map((o) => o.label);
  const note = String(c.postureNote || '').trim();
  if (note) out.push(note);
  return out;
}

/* ==========================================================================
   تصدير جهات الاتصال (vCard) (v3.3.51)
   ========================================================================== */

const vEsc = (v) => String(v == null ? '' : v)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * بناء ملف vCard (3.0، UTF-8) لعملاء لهم رقم هاتف، الاسم «بادئة - اسم العميل».
 * يتجاهل من بلا رقم، ويدمج المكرر برقمه.
 * @param {Array} list — العملاء
 * @param {{prefix?:string}} [opts]
 * @returns {{vcf:string, count:number, skippedNoPhone:number, skippedDuplicate:number}}
 */
export function buildContactsVcf(list, opts = {}) {
  const prefix = String(opts.prefix == null ? 'ورشة' : opts.prefix).trim();
  const seen = new Set();
  const cards = [];
  let skippedNoPhone = 0; let skippedDuplicate = 0;
  (Array.isArray(list) ? list : []).forEach((c) => {
    if (!c || !c.name) return;
    const phone = normalizePhone(c.phone);
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 8) { skippedNoPhone++; return; }
    if (seen.has(digits)) { skippedDuplicate++; return; }
    seen.add(digits);
    const full = prefix ? prefix + ' - ' + c.name : String(c.name);
    cards.push([
      'BEGIN:VCARD', 'VERSION:3.0',
      'FN:' + vEsc(full),
      'N:' + vEsc(full) + ';;;;',
      'TEL;TYPE=CELL:' + (String(phone).startsWith('+') ? phone : digits),
      c.address ? 'ADR;TYPE=HOME:;;' + vEsc(c.address) + ';;;;' : null,
      'END:VCARD',
    ].filter(Boolean).join('\r\n'));
  });
  return { vcf: cards.join('\r\n') + (cards.length ? '\r\n' : ''), count: cards.length, skippedNoPhone, skippedDuplicate };
}
