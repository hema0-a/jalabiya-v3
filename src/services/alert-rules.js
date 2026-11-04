/* ==========================================================================
   alert-rules.js — قراءة إعدادات التنبيهات والتجميع وتطبيقها (v3.3.32)
   ==========================================================================
   كانت هذه الإعدادات تُحفظ في الإعدادات ولا يقرؤها أي كود. دوال نقية هنا،
   تُستدعى من مركز الإشعارات وفحص الإشعارات وصفحة الطلبات.
   ========================================================================== */

import { DEFAULT_SETTINGS } from '../core/config.js';

const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : d; };

/** مفاتيح تنبيهات مركز الإشعارات. الافتراضي مفعَّل ما لم يُوقَف صراحةً. */
export function alertToggles(settings) {
  const n = (settings && settings.notifications) || {};
  const lead = num(n.leadDays, DEFAULT_SETTINGS.notifications.leadDays);
  return {
    seasons: n.seasons !== false,
    appointments: n.appointments !== false,
    inventory: n.inventory !== false,
    debts: n.debts !== false,
    leadDays: lead >= 1 ? Math.floor(lead) : DEFAULT_SETTINGS.notifications.leadDays,
  };
}

/* ---------- v3.5.38: خيارات التنبيهات المتقدمة (الافتراضي = السلوك السابق تماماً) ---------- */
const pickInt = (v, def, min, max) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const pickTime = (v, def) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : def);

export function notificationOptions(settings) {
  const n = (settings && settings.notifications) || {};
  const base = alertToggles(settings);
  const debtMin = Number(n.debtMinAmount);
  return {
    dueSoonDays: pickInt(n.dueSoonDays, Math.max(3, base.leadDays), 1, 60),
    seasonsDays: pickInt(n.seasonsDays, 14, 1, 60),
    commitmentsDays: pickInt(n.commitmentsDays, 5, 1, 28),
    appointmentsDays: pickInt(n.appointmentsDays, 0, 0, 14),
    debtMinAmount: isFinite(debtMin) && debtMin > 0 ? Math.round(debtMin * 100) / 100 : 0,
    overdue: n.overdue !== false,
    overdueGraceDays: pickInt(n.overdueGraceDays, 0, 0, 30),
    quietEnabled: n.quietEnabled === true,
    quietFrom: pickTime(n.quietFrom, '22:00'),
    quietTo: pickTime(n.quietTo, '07:00'),
  };
}

/** هل الوقت الآن ضمن ساعات الهدوء؟ (تدعم المرور بمنتصف الليل؛ من = إلى ⇒ لا هدوء) */
export function isQuietNow(opts, date = new Date()) {
  if (!opts || opts.quietEnabled !== true) return false;
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const f = toMin(pickTime(opts.quietFrom, '22:00'));
  const t = toMin(pickTime(opts.quietTo, '07:00'));
  const m = date.getHours() * 60 + date.getMinutes();
  if (f === t) return false;
  return f < t ? (m >= f && m < t) : (m >= f || m < t);
}

/** وقت الفحص للتأخر: يُرجَع للوراء بعدد أيام السماح (0 = كما كان). */
export function overdueNow(now, graceDays) {
  return now - (Number(graceDays) > 0 ? Number(graceDays) : 0) * 86400000;
}

/* ---------- v3.5.39: المناسبات (مدة كل مناسبة + الفرز) ---------- */
const OCC_DAY_MS = 86400000;

/** أيام التنبيه لمناسبة: قيمتها الخاصة (1–90) وإلا القيمة العامة. */
export function occasionAlertDays(occ, fallback) {
  const n = Number(occ && occ.alertDays);
  return isFinite(n) && n >= 1 ? Math.min(90, Math.floor(n)) : fallback;
}

/** عدد الأيام حتى المناسبة القادمة (0 = اليوم)؛ null إن كان التاريخ غير صالح. */
export function occasionDaysUntil(occ, now = Date.now()) {
  const m = Number(occ && occ.month) - 1;
  const d = Number(occ && occ.day);
  if (!(m >= 0 && m <= 11) || !(d >= 1 && d <= 31)) return null;
  const t0 = new Date(now);
  const y = t0.getFullYear();
  const start = new Date(y, t0.getMonth(), t0.getDate());
  let target = new Date(y, m, d);
  if (target < start) target = new Date(y + 1, m, d);
  return Math.round((target - start) / OCC_DAY_MS);
}

/** المناسبات المفعّلة الداخلة في نافذة تنبيهها، الأقرب أولاً. */
export function upcomingOccasions(occasions, now = Date.now(), fallbackDays = 14) {
  const out = [];
  for (const occ of Array.isArray(occasions) ? occasions : []) {
    if (!occ || occ.enabled === false) continue;
    const days = occasionDaysUntil(occ, now);
    if (days === null) continue;
    if (days <= occasionAlertDays(occ, fallbackDays)) out.push({ occ, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** ترتيب المناسبات بالأقرب تاريخاً (المعطّلة وغير الصالحة أخيراً، والتعادل يحفظ الترتيب). */
export function sortOccasionsByDate(occasions, now = Date.now()) {
  const list = Array.isArray(occasions) ? occasions : [];
  const key = (o) => {
    const d = occasionDaysUntil(o, now);
    return (o && o.enabled === false ? 1000 : 0) + (d === null ? 5000 : d);
  };
  return list.map((o, i) => ({ o, i, k: key(o) })).sort((a, b) => (a.k - b.k) || (a.i - b.i)).map((x) => x.o);
}

/**
 * أصناف نقص المخزون التي يجب التنبيه عليها:
 * مفتاح «تنبيهات المخزون» العام + «نقص القماش» لفئة قماش + «نقص المخزون» لباقي الفئات.
 */
export function filterLowStockForAlerts(items, settings) {
  const list = Array.isArray(items) ? items : [];
  if (!alertToggles(settings).inventory) return [];
  const inv = (settings && settings.inventory) || {};
  const fabricOn = inv.alertOnFabricLow !== false;
  const productOn = inv.alertOnProductLow !== false;
  return list.filter((i) => (i && i.category === 'fabric' ? fabricOn : productOn));
}

/* ---------- v3.5.33: خيارات تنبيه المخزون ---------- */
export const STOCK_ALERT_MODES = [
  { id: 'all',    name: 'مركز التنبيهات + إشعار الجهاز' },
  { id: 'center', name: 'مركز التنبيهات فقط (بلا إشعار)' },
];
export const STOCK_REPEAT_MODES = [
  { id: 'daily',    name: 'كل يوم' },
  { id: 'weekly',   name: 'كل أسبوع' },
  { id: 'onchange', name: 'عند تغيّر القائمة فقط' },
];

/** خيارات تنبيه المخزون بقيم آمنة (الافتراضي = السلوك السابق تماماً). */
export function stockAlertOptions(settings) {
  const inv = (settings && settings.inventory) || {};
  return {
    mode: inv.alertMode === 'center' ? 'center' : 'all',
    repeat: inv.repeat === 'weekly' || inv.repeat === 'onchange' ? inv.repeat : 'daily',
    separateOut: inv.separateOutOfStock === true,
  };
}

/** فصل الأصناف التي نفدت (كمية ≤ 0) عن المنخفضة إن فُعِّل الخيار؛ وإلا الكل «منخفض». */
export function splitOutOfStock(items, settings) {
  const list = Array.isArray(items) ? items : [];
  if (!stockAlertOptions(settings).separateOut) return { low: list, out: [] };
  const isOut = (i) => !(Number(i && i.quantity) > 0);
  return { low: list.filter((i) => !isOut(i)), out: list.filter(isOut) };
}

/** بصمة قائمة أصناف (معرّفاتها مرتبة) — لاكتشاف تغيّر القائمة. */
export function stockSignature(items) {
  return (Array.isArray(items) ? items : []).map((i) => String(i && i.id)).sort().join('|');
}

/**
 * هل يُرسَل إشعار الجهاز الآن؟ (للوضعين الأسبوعي وعند التغيّر؛ اليومي له حارس يومي منفصل)
 * @param {'daily'|'weekly'|'onchange'} repeat
 * @param {{ts:number, sig:string}|undefined} last — آخر إشعار لهذه المجموعة
 */
export function shouldNotifyStock(repeat, last, now, sig) {
  if (!last || !isFinite(last.ts)) return true;
  if (repeat === 'weekly') return now - last.ts >= 7 * 24 * 3600 * 1000;
  if (repeat === 'onchange') return sig !== last.sig;
  return now - last.ts >= 20 * 3600 * 1000;
}

/** أيام تنبيه استلام القماش قبل التسليم (الافتراضي من الإعدادات الافتراضية) */
export function fabricPickupDays(settings) {
  const v = num(settings && settings.dailyLimit && settings.dailyLimit.fabricPickupAlertDays, NaN);
  return v >= 0 ? Math.floor(v) : DEFAULT_SETTINGS.dailyLimit.fabricPickupAlertDays;
}

/** إعدادات تجميع الطلبات */
export function groupingOptions(settings) {
  const g = (settings && settings.grouping) || {};
  return {
    enabled: g.enabled === true,
    sameTypeOnly: g.sameTypeOnly !== false,
    tolerance: Math.max(0, num(g.tolerance, DEFAULT_SETTINGS.grouping.tolerance)),
    /* v3.5.35 */
    sameCustomer: g.sameCustomer !== false,
    sizeMatch: g.sizeMatch !== false,
    minShared: Math.min(5, Math.max(1, Math.floor(num(g.minShared, 2)) || 2)),
    fields: Array.isArray(g.fields) ? g.fields.filter((x) => typeof x === 'string' && x) : [],
  };
}
