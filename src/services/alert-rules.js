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
