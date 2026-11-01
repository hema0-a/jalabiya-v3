/* ==========================================================================
   daily-insights.js — إنتاجية الأسبوع + نصائح ذكية + الإجراء التالي + رسالة تحفيزية (v3.5.22)
   ==========================================================================
   منطق نقي بلا DOM ولا قراءة مستودعات: يستلم مدخلات جاهزة ويُرجع نموذجاً للعرض فيُختبر في Node.
   مُستعاد من v2 (daily-briefing.js) ومُكيَّف لبنية v3: الطلب {createdAt, dueDate (ms), status, amount}.
   API:
     moodOfHour(hour)                 → 'morning' | 'afternoon' | 'evening' | 'night'
     motivationFor(mood)              → string
     productivityOf(weekOrders)       → {level, color, icon, percent, message}
     buildInsights(input)             → {mood, motivation, summary, weekOrders, productivity, tips, nextAction}
   ========================================================================== */

import { startOfDay, startOfNextDay } from '../core/day-math.js';
import { formatEGP } from '../core/utils.js';

const DAY_MS = 86400000;
export const MAX_TIPS = 5;

const MOTIVATION = {
  morning: 'ابدأ يومك بطلب جديد 🌟',
  afternoon: 'واصل الإنجاز، أنت في منتصف اليوم 💪',
  evening: 'وقت مراجعة ما تم إنجازه اليوم 📋',
  night: 'ارتاح، وغداً يوم جديد ✨',
};

const PRODUCTIVITY_MESSAGE = {
  'عالي': '🔥 أداء استثنائي! استمر في هذا المستوى.',
  'متوسط': '⚡ أداء جيد، يمكنك تحقيق أفضل.',
  'عادي': '📊 ابدأ بتسريع وتيرة العمل.',
  'منخفض': '💡 حاول إضافة المزيد من الطلبات هذا الأسبوع.',
};

/** @param {number} hour 0-23 */
export function moodOfHour(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/** @param {string} mood */
export function motivationFor(mood) {
  return MOTIVATION[mood] || 'أهلاً بك في لوحة التحكم';
}

/**
 * مستوى الإنتاجية من عدد طلبات آخر 7 أيام (عتبات v2: 15 / 8 / 3).
 * @param {number} weekOrders
 */
export function productivityOf(weekOrders) {
  const n = Number(weekOrders) || 0;
  let p;
  if (n >= 15) p = { level: 'عالي', color: '#2E7D32', icon: '🔥', percent: 100 };
  else if (n >= 8) p = { level: 'متوسط', color: '#F57C00', icon: '⚡', percent: 65 };
  else if (n >= 3) p = { level: 'عادي', color: '#1565C0', icon: '📊', percent: 40 };
  else p = { level: 'منخفض', color: '#C62828', icon: '💤', percent: 20 };
  return { ...p, message: PRODUCTIVITY_MESSAGE[p.level] };
}

const isOpen = (o) => o && o.status !== 'delivered' && o.status !== 'cancelled';

/**
 * ملخص اليوم من الطلبات والإيرادات والمصروفات.
 * @param {Object[]} orders
 * @param {number} now
 */
function summarize(orders, now) {
  const from = startOfDay(now);
  const to = startOfNextDay(from);
  let addedToday = 0; let dueToday = 0; let overdue = 0; let ready = 0; let inProgress = 0;
  for (const o of orders) {
    if (!o) continue;
    const created = Number(o.createdAt) || 0;
    if (created >= from && created < to && o.status !== 'cancelled') addedToday += 1;
    if (isOpen(o) && o.dueDate) {
      const due = Number(o.dueDate);
      if (due >= from && due < to) dueToday += 1;
      else if (due < from) overdue += 1;
    }
    if (o.status === 'ready') ready += 1;
    if (o.status === 'in_progress') inProgress += 1;
  }
  return { addedToday, dueToday, overdue, ready, inProgress };
}

/**
 * @param {Object} input
 * @param {Object[]} [input.orders]
 * @param {number} [input.todayRevenue=0]   إيرادات اليوم (يحسبها الاستدعاء بنفس منطق الصفحة المالية)
 * @param {number} [input.todayExpenses=0]
 * @param {number} [input.lowStock=0]       عدد أصناف المخزون المنخفضة
 * @param {string} [input.topVipName]       أكثر عميل VIP شراءً إن وُجد
 * @param {number} [input.now=Date.now()]
 */
export function buildInsights(input = {}) {
  const now = Number(input.now) || Date.now();
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const revenue = Number(input.todayRevenue) || 0;
  const expenses = Number(input.todayExpenses) || 0;
  const lowStock = Math.max(0, Number(input.lowStock) || 0);
  const s = { ...summarize(orders, now), todayRevenue: revenue, todayExpenses: expenses, todayNet: revenue - expenses, lowStock };

  const weekAgo = now - 7 * DAY_MS;
  const weekOrders = orders.filter((o) => o && o.status !== 'cancelled' && (Number(o.createdAt) || 0) >= weekAgo).length;
  const productivity = productivityOf(weekOrders);
  const mood = moodOfHour(new Date(now).getHours());

  const tips = [];
  const tip = (type, icon, text) => tips.push({ type, icon, text });
  if (s.addedToday > 0) tip('success', '🎯', 'أضفت ' + s.addedToday + ' طلب اليوم. استمر في هذا الأداء!');
  else tip('info', '💡', 'لم تسجّل طلبات اليوم بعد. هل تريد بدء يومك بطلب جديد؟');
  if (s.overdue > 0) tip('danger', '⏰', 'لديك ' + s.overdue + ' طلب متأخر يحتاج انتباهك فوراً!');
  if (s.dueToday > 0) tip('warning', '📌', s.dueToday + ' طلب يستحق التسليم اليوم. تأكد من جاهزيتها.');
  if (s.lowStock > 0) tip('warning', '📦', s.lowStock + ' عنصر في المخزون على وشك النفاد.');
  if (revenue > 0) tip('success', '💰', 'إيرادات اليوم: ' + formatEGP(revenue) + '. أحسنت!');
  if (s.todayNet < 0) tip('warning', '📉', 'مصروفات اليوم تتجاوز الإيرادات بـ ' + formatEGP(Math.abs(s.todayNet)) + '.');
  if (s.ready > 0) tip('info', '✅', s.ready + ' طلب جاهز للتسليم. اتصل بالعملاء!');
  if (weekOrders >= 10) tip('success', '🏆', 'أسبوع مميز! ' + weekOrders + ' طلب خلال 7 أيام.');
  else if (weekOrders >= 5) tip('info', '📈', weekOrders + ' طلب هذا الأسبوع. أنت في المسار الصحيح.');
  if (input.topVipName) tip('success', '👑', 'عميلك المميز ' + input.topVipName + ' هو الأكثر شراءً. حافظ عليه!');

  let nextAction;
  if (s.overdue > 0) nextAction = { title: 'ابدأ بالطلبات المتأخرة', subtitle: s.overdue + ' طلب متأخر يحتاج اهتمامك', icon: '⏰', hash: '#/orders', color: '#C62828' };
  else if (s.dueToday > 0) nextAction = { title: 'تسليمات اليوم', subtitle: s.dueToday + ' طلب يستحق التسليم اليوم', icon: '📅', hash: '#/orders', color: '#F57C00' };
  else if (s.lowStock > 0) nextAction = { title: 'مراجعة المخزون', subtitle: s.lowStock + ' عنصر على وشك النفاد', icon: '📦', hash: '#/inventory', color: '#AD1457' };
  else if (s.ready > 0) nextAction = { title: 'تسليم الطلبات الجاهزة', subtitle: s.ready + ' طلب جاهز للتسليم', icon: '✅', hash: '#/orders', color: '#2E7D32' };
  else nextAction = { title: 'كل شيء تحت السيطرة ✨', subtitle: 'لا توجد مهام عاجلة. عمل رائع!', icon: '🎉', hash: '#/dashboard', color: '#1F6D57' };

  return { mood, motivation: motivationFor(mood), summary: s, weekOrders, productivity, tips: tips.slice(0, MAX_TIPS), nextAction };
}
