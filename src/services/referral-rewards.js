/* ==========================================================================
   referral-rewards.js — مكافآت الإحالة التلقائية  [v3.3.45]
   ==========================================================================
   الإحالة سجل يدوي بالأسماء (مُرشِّح → مُرشَّح). هنا نربطه بالعملاء الفعليين:
     1) بمعرّف العميل (referrerId/referredId) إن وُجد،
     2) ثم برقم الهاتف (للمُرشَّح)،
     3) ثم باسم مطابق تماماً **إن كان وحيداً** (الاسم المكرر لا يُخمَّن).
   وعندما يُسلَّم أول طلب للمُرشَّح، وما دامت المكافأة معلقة (غير مدفوعة)،
   تصبح الإحالة «جاهزة للمكافأة» ← رسالة شكر للمُرشِّح.
   [v3.5.22] نسبة المكافأة الافتراضية: اقتراح مكافأة = نسبة من أول طلب مُسلَّم للمُرشَّح (يعتمدها المستخدم يدوياً).
   نقي بلا IndexedDB/DOM.
   ========================================================================== */

import { normalizePhone, formatEGP } from '../core/utils.js';
import { workshopVars } from './message-templates.js';

export const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const phoneKey = (p) => String(normalizePhone(p) || '').replace(/\D/g, '');

/**
 * ربط بيانات بعميل فعلي (أو null إن لم يُعثر عليه أو التبس).
 * @param {Array} customers
 * @param {{id?:string, name?:string, phone?:string}} q
 * @returns {Object|null}
 */
export function resolveCustomer(customers, q) {
  const list = Array.isArray(customers) ? customers : [];
  if (q && q.id) {
    const byId = list.find((c) => c && c.id === q.id);
    if (byId) return byId;
  }
  const pk = q && q.phone ? phoneKey(q.phone) : '';
  if (pk) {
    const byPhone = list.filter((c) => c && c.phone && phoneKey(c.phone) === pk);
    if (byPhone.length === 1) return byPhone[0];
  }
  const nk = q && q.name ? normName(q.name) : '';
  if (nk) {
    const byName = list.filter((c) => c && normName(c.name) === nk);
    if (byName.length === 1) return byName[0];
  }
  return null;
}

/** وقت التسليم الفعلي لطلب (لترتيب «أول طلب»). */
const deliveredTime = (o) => Number(o.deliveredAt) || Number(o.updatedAt) || Number(o.createdAt) || 0;

/**
 * حالة كل إحالة معلقة.
 * state: 'unlinked' (المُرشَّح غير مربوط بعميل) | 'waiting' (لا طلب مُسلَّم بعد) | 'due' (جاهزة للمكافأة)
 * @param {Array} referralsList
 * @param {Array} customers
 * @param {Array} ordersList
 * @returns {Array<{referral:Object, state:string, referrer:Object|null, referred:Object|null, order:Object|null, reward:number}>}
 */
export function computeReferralRewards(referralsList, customers, ordersList) {
  const orders = Array.isArray(ordersList) ? ordersList : [];
  const out = [];
  for (const r of Array.isArray(referralsList) ? referralsList : []) {
    if (!r || (r.status || 'pending') === 'paid') continue;
    const referred = resolveCustomer(customers, { id: r.referredId, name: r.referredName, phone: r.referredPhone });
    const referrer = resolveCustomer(customers, { id: r.referrerId, name: r.referrerName });
    const reward = Number(r.reward) || 0;
    if (!referred) { out.push({ referral: r, state: 'unlinked', referrer, referred: null, order: null, reward }); continue; }
    const delivered = orders
      .filter((o) => o && o.customerId === referred.id && o.status === 'delivered')
      .sort((a, b) => deliveredTime(a) - deliveredTime(b));
    out.push({
      referral: r, state: delivered.length ? 'due' : 'waiting',
      referrer, referred, order: delivered[0] || null, reward,
    });
  }
  return out;
}

/** متغيرات رسالة الشكر والمكافأة للمُرشِّح. */
export function referralVars(item, workshop = '') {
  const reward = Number(item && item.reward) || 0;
  const r = (item && item.referral) || {};
  return {
    customer: (item && item.referrer && item.referrer.name) || r.referrerName || 'عميلنا',
    referred: (item && item.referred && item.referred.name) || r.referredName || '',
    reward: formatEGP(reward),
    rewardLine: reward > 0 ? 'مكافأتك: خصم ' + formatEGP(reward) + ' على طلبك القادم' : '',
    ...workshopVars(workshop),
  };
}

/* ==========================================================================
   نسبة المكافأة الافتراضية (v3.5.22) — إعداد settings.referrals.rewardPercent
   ========================================================================== */

export const DEFAULT_REWARD_PERCENT = 5;

/**
 * تحقّق صارم من نسبة يكتبها المستخدم.
 * @param {*} v
 * @returns {number|null} رقم بين 0 و100 (حتى منزلتين) أو null إن كانت غير صالحة
 */
export function parseRewardPercent(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/**
 * النسبة الفعّالة من الإعدادات (تعود للافتراضي 5% إن كانت ناقصة أو تالفة).
 * @param {Object} [settings]
 * @returns {number}
 */
export function rewardPercentOf(settings) {
  const v = settings && settings.referrals ? parseRewardPercent(settings.referrals.rewardPercent) : null;
  return v === null ? DEFAULT_REWARD_PERCENT : v;
}

/**
 * مكافأة مقترحة = نسبة من مبلغ الطلب. 0 إن لم يوجد مبلغ أو كانت النسبة صفراً.
 * @param {{amount?:number}|null} order
 * @param {number} percent
 * @returns {number} مقرّبة لمنزلتين
 */
export function suggestedReward(order, percent) {
  const amount = Number(order && order.amount);
  const p = Number(percent);
  if (!(amount > 0) || !(p > 0)) return 0;
  return Math.round(amount * p) / 100;
}
