/* ==========================================================================
   message-queue.js — طابور «رسائل اليوم»  [v3.3.44]
   ==========================================================================
   حساب نقي (بلا IndexedDB/DOM) لمن يستحق رسالة الآن:
   1) 📦 جاهز للاستلام (المتأخر أولاً)       2) 🧾 مستحقات متأخرة (الأكبر أولاً)
   3) 🎁 مكافأة إحالة: العميل المُحال أتمّ أول طلب مُسلَّم ← شكر للمُرشِّح
   4) 🎉 تهنئة مناسبة قريبة للعملاء المميّزين (VIP)
   + حملة (campaign): قالب «عملاء» لجمهور (VIP / الكل) — مثل «عرض الموسم».

   كل مهمة تحمل نصها الجاهز وآخر مرة أُرسلت فيها (من message-log) و`recentlySent`
   لمنع تكرار الرسالة نفسها: استلام 2 يوم · مستحقات 7 أيام · تهنئة/حملة مرة لكل
   مناسبة/شهر.
   ========================================================================== */

import { computePickups, pickupVars, DEFAULT_PICKUP_DAYS } from './pickup-reminders.js';
import { computeReceivables, debtVars } from './receivables.js';
import { renderTemplate, getTemplateSync, workshopVars, KIND } from './message-templates.js';
import { lastSentIn } from './message-log.js';
import { computeReferralRewards, referralVars } from './referral-rewards.js';
import { formatEGP } from '../core/utils.js';

const DAY = 86400000;

/** أيام الانتظار قبل اعتبار الرسالة «أُرسلت مؤخراً» وإخفائها من الطابور. */
export const COOLDOWN_DAYS = { pickup: 2, debt: 7 };
/** تظهر التهنئة قبل المناسبة بهذه الأيام (وفي يومها). */
export const GREETING_WINDOW_DAYS = 5;

export const TYPE_LABELS = {
  pickup: '📦 استلام',
  debt: '🧾 مستحقات',
  greeting: '🎉 تهاني',
  referral: '🎁 مكافآت',
  campaign: '📢 حملة',
};

/* ==========================================================================
   1. المناسبات
   ========================================================================== */

/**
 * الأيام المتبقية للمناسبة القادمة (نفس منطق صفحة المناسبات لكن بـ now قابل للحقن).
 * @param {{month:number, day:number}} occ
 * @param {number} [now]
 * @returns {{daysLeft:number, year:number, date:Date}}
 */
export function occasionDaysLeft(occ, now = Date.now()) {
  const n = new Date(now);
  const y = n.getFullYear();
  const m = Number(occ.month) - 1;
  const d = Number(occ.day);
  const today = new Date(y, n.getMonth(), n.getDate());
  let target = new Date(y, m, d);
  if (target < today) target = new Date(y + 1, m, d);
  return { daysLeft: Math.round((target - today) / DAY), year: target.getFullYear(), date: target };
}

/**
 * مناسبات مفعّلة تقع خلال نافذة التهنئة، الأقرب أولاً.
 * @param {Array} occasions
 * @param {number} [now]
 * @param {number} [windowDays]
 * @returns {Array<{occ:Object, daysLeft:number, year:number, ref:string}>}
 */
export function upcomingGreetings(occasions, now = Date.now(), windowDays = GREETING_WINDOW_DAYS) {
  const out = [];
  for (const occ of Array.isArray(occasions) ? occasions : []) {
    if (!occ || occ.enabled === false || !occ.id) continue;
    const m = Number(occ.month); const d = Number(occ.day);
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) continue;
    const { daysLeft, year } = occasionDaysLeft(occ, now);
    if (daysLeft <= windowDays) out.push({ occ, daysLeft, year, ref: occ.id + ':' + year });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** اسم أقرب مناسبة مفعّلة (لمتغير {occasion} في الحملات). */
export function nextOccasionName(occasions, now = Date.now()) {
  let best = null;
  for (const occ of Array.isArray(occasions) ? occasions : []) {
    if (!occ || occ.enabled === false) continue;
    const m = Number(occ.month); const d = Number(occ.day);
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) continue;
    const { daysLeft } = occasionDaysLeft(occ, now);
    if (!best || daysLeft < best.daysLeft) best = { name: occ.name || '', daysLeft };
  }
  return best ? best.name : '';
}

/* ==========================================================================
   2. بناء المهام
   ========================================================================== */

function makeTask(o) {
  const recentlySent = o.lastAt != null && (o.cooldown == null || (o.now - o.lastAt) < o.cooldown * DAY);
  return {
    key: o.key, type: o.type, priority: o.priority, weight: o.weight || 0,
    customerId: o.customerId || null, name: o.name || 'عميل', phone: o.phone || '',
    hasPhone: !!(o.phone && String(o.phone).replace(/\D/g, '')),
    kind: o.kind, ref: o.ref != null ? String(o.ref) : null,
    text: o.text, detail: o.detail || '', badge: o.badge || '',
    lastSentAt: o.lastAt != null ? o.lastAt : null, recentlySent,
  };
}

const byOrder = (a, b) => (a.priority - b.priority) || (a.weight - b.weight) || String(a.name).localeCompare(String(b.name), 'ar');

/**
 * طابور اليوم: استلام + مستحقات + تهاني.
 * @param {Object} p
 * @param {Array} p.orders
 * @param {Array} p.payments
 * @param {Array} p.customers
 * @param {Array} [p.occasions]
 * @param {Array} [p.referrals] — سجلات الإحالات
 * @param {Object} [p.cfg] — settings.autoMessages
 * @param {Object} [p.workshop] — settings.workshop
 * @param {Array} [p.log] — سجل الرسائل
 * @param {number} [p.now]
 * @returns {{tasks:Array, counts:Object}}
 */
export function buildQueue(p = {}) {
  const now = Number.isFinite(p.now) ? p.now : Date.now();
  const ws = p.workshop || {};
  const cfg = p.cfg || null;
  const log = Array.isArray(p.log) ? p.log : [];
  const customers = Array.isArray(p.customers) ? p.customers : [];
  const tasks = [];

  /* 1) جاهز للاستلام */
  const pk = computePickups(p.orders, p.payments, customers, now, DEFAULT_PICKUP_DAYS);
  for (const it of pk.items) {
    tasks.push(makeTask({
      key: 'pickup:' + it.orderId, type: 'pickup', priority: it.late ? 1 : 3, weight: -it.ageDays,
      customerId: it.customerId, name: it.name, phone: it.phone, kind: KIND.PICKUP, ref: it.orderId,
      text: renderTemplate(KIND.PICKUP, pickupVars(it, ws), cfg),
      detail: '#' + String(it.orderId).slice(-6) + ' · جاهز منذ ' + it.ageDays + ' يوم' +
        (it.remaining > 0 ? ' · متبقي ' + formatEGP(it.remaining) : ' · مسدَّد'),
      badge: it.late ? 'متأخر' : '',
      lastAt: lastSentIn(log, { kinds: [KIND.PICKUP, 'ready'], ref: it.orderId }),
      cooldown: COOLDOWN_DAYS.pickup, now,
    }));
  }

  /* 2) مستحقات */
  const rc = computeReceivables(p.orders, p.payments, customers, now);
  for (const c of rc.customers) {
    if (!(c.overdue > 0.009)) continue;
    tasks.push(makeTask({
      key: 'debt:' + c.customerId, type: 'debt', priority: 2, weight: -c.overdue,
      customerId: c.customerId, name: c.name, phone: c.phone, kind: KIND.DEBT, ref: null,
      text: renderTemplate(KIND.DEBT, debtVars(c.name, formatEGP(c.overdue), ws, c.phone), cfg),
      detail: 'عليه ' + formatEGP(c.overdue) + (c.oldestDays != null ? ' منذ ' + c.oldestDays + ' يوم' : ''),
      badge: '',
      lastAt: lastSentIn(log, { kinds: [KIND.DEBT, 'payment_due'], customerId: c.customerId }),
      cooldown: COOLDOWN_DAYS.debt, now,
    }));
  }

  /* 3) مكافآت الإحالة: المُرشَّح أتمّ أول طلب مُسلَّم والمكافأة معلقة */
  const refTpl = getTemplateSync(KIND.REFERRAL, cfg);
  if (refTpl && refTpl.enabled) {
    for (const it of computeReferralRewards(p.referrals, customers, p.orders)) {
      if (it.state !== 'due') continue;
      const r = it.referral;
      tasks.push(makeTask({
        key: 'refrw:' + r.id, type: 'referral', priority: 3.5, weight: -(it.reward || 0),
        customerId: it.referrer ? it.referrer.id : null,
        name: (it.referrer && it.referrer.name) || r.referrerName || 'مُرشِّح',
        phone: it.referrer ? it.referrer.phone : '',
        kind: KIND.REFERRAL, ref: r.id,
        text: renderTemplate(KIND.REFERRAL, referralVars(it, ws), cfg),
        detail: '🎁 ' + (r.referredName || 'عميل مُحال') + ' أتمّ أول طلب' +
          (it.reward > 0 ? ' · المكافأة ' + formatEGP(it.reward) : '') +
          (it.referrer ? '' : ' · المُرشِّح غير مربوط بعميل'),
        badge: 'مكافأة',
        lastAt: lastSentIn(log, { kinds: [KIND.REFERRAL], ref: r.id }),
        cooldown: null, now,
      }));
    }
  }

  /* 4) تهاني المناسبات القريبة — للعملاء المميّزين */
  const greetTpl = getTemplateSync(KIND.GREETING, cfg);
  if (greetTpl && greetTpl.enabled) {
    const occs = upcomingGreetings(p.occasions, now);
    for (const g of occs) {
      for (const c of customers) {
        if (!c || c.vip !== true || !c.phone) continue;
        tasks.push(makeTask({
          key: 'greet:' + g.ref + ':' + c.id, type: 'greeting', priority: 4, weight: g.daysLeft,
          customerId: c.id, name: c.name, phone: c.phone, kind: KIND.GREETING, ref: g.ref,
          text: renderTemplate(KIND.GREETING, { customer: c.name || 'عميلنا', occasion: g.occ.name || '', ...workshopVars(ws) }, cfg),
          detail: (g.occ.icon || '🎉') + ' ' + (g.occ.name || 'مناسبة') + (g.daysLeft === 0 ? ' — اليوم' : ' — بعد ' + g.daysLeft + ' يوم'),
          badge: 'VIP',
          lastAt: lastSentIn(log, { kinds: [KIND.GREETING], ref: g.ref, customerId: c.id }),
          cooldown: null, now,
        }));
      }
    }
  }

  tasks.sort(byOrder);
  return { tasks, counts: countTasks(tasks) };
}

/**
 * حملة: قالب «عملاء» (عرض الموسم، أو قالب مخصّص) لجمهور محدّد.
 * @param {Object} p
 * @param {string} p.templateId
 * @param {'vip'|'all'} [p.audience='vip']
 * @returns {{tasks:Array, counts:Object, template:Object|null}}
 */
export function buildCampaign(p = {}) {
  const now = Number.isFinite(p.now) ? p.now : Date.now();
  const cfg = p.cfg || null;
  const tpl = getTemplateSync(p.templateId, cfg);
  if (!tpl || tpl.scope !== 'customer' || !tpl.enabled) return { tasks: [], counts: countTasks([]), template: null };

  const log = Array.isArray(p.log) ? p.log : [];
  const ws = p.workshop || {};
  const n = new Date(now);
  const ref = tpl.id + ':' + n.getFullYear() + '-' + (n.getMonth() + 1);   /* مرة كل شهر */
  const occasion = nextOccasionName(p.occasions, now);

  const tasks = [];
  for (const c of Array.isArray(p.customers) ? p.customers : []) {
    if (!c || !c.phone) continue;
    if ((p.audience || 'vip') === 'vip' && c.vip !== true) continue;
    tasks.push(makeTask({
      key: 'camp:' + ref + ':' + c.id, type: 'campaign', priority: 5, weight: 0,
      customerId: c.id, name: c.name, phone: c.phone, kind: tpl.id, ref,
      text: renderTemplate(tpl.id, { customer: c.name || 'عميلنا', occasion, ...workshopVars(ws) }, cfg),
      detail: tpl.icon + ' ' + tpl.name + (c.vip ? ' · VIP' : ''), badge: '',
      lastAt: lastSentIn(log, { kinds: [tpl.id], ref, customerId: c.id }),
      cooldown: null, now,
    }));
  }
  tasks.sort(byOrder);
  return { tasks, counts: countTasks(tasks), template: tpl };
}

/** عدّادات: الكل / بانتظار الإرسال (لها هاتف ولم تُرسل مؤخراً) لكل نوع. */
export function countTasks(tasks) {
  const out = { total: 0, pending: 0 };
  for (const t of tasks) {
    out[t.type] = out[t.type] || { total: 0, pending: 0 };
    out[t.type].total++; out.total++;
    if (t.hasPhone && !t.recentlySent) { out[t.type].pending++; out.pending++; }
  }
  return out;
}
