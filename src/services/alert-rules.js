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
  };
}
