/* ==========================================================================
   item-catalog.js — قائمة البنود القابلة للاختيار في نموذج الطلب
   ==========================================================================
   تجمع مصدرين في قائمة واحدة تُعرض كقائمة منسدلة:
   1. أنواع الجلابيب المعرّفة في الإعدادات (jalabiyaTypes) بأسعارها.
   2. الأسماء التي استخدمتها فعلاً في طلبات سابقة (مرتّبة بالأكثر استخداماً) مع آخر سعر.
   فتظهر خيارات حتى لو لم تُعرَّف أنواع في الإعدادات.
   دوال نقية بلا DOM.
   ========================================================================== */

/** مفتاح مقارنة الأسماء: يوحّد المسافات والتشكيل والتطويل وصيغ الألف/التاء المربوطة/الياء. */
export function normalizeItemName(name) {
  return String(name == null ? '' : name)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const PLACEHOLDER = 'بند';

/**
 * @param {Array<{name:string, price?:number}>} types — أنواع الإعدادات
 * @param {Array} orders — كل الطلبات (الملغاة تُستبعد)
 * @param {Object} [opts]
 * @param {number} [opts.maxHistory=30] — أقصى عدد أسماء من الطلبات السابقة
 * @returns {Array<{name:string, price:number, source:'type'|'history', count:number}>}
 */
export function buildItemCatalog(types, orders, opts = {}) {
  const maxHistory = Number.isFinite(opts.maxHistory) ? opts.maxHistory : 30;

  /* 1) تجميع الأسماء من الطلبات (من الأقدم للأحدث ليبقى آخر سعر وآخر صيغة كتابة) */
  const hist = new Map();
  const sorted = (Array.isArray(orders) ? orders : [])
    .filter((o) => o && o.status !== 'cancelled' && Array.isArray(o.items))
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  for (const o of sorted) {
    for (const it of o.items) {
      const raw = String((it && it.name) || '').trim();
      const key = normalizeItemName(raw);
      if (!key || raw === PLACEHOLDER) continue;
      const price = Number(it.price) > 0 ? Number(it.price) : 0;
      const e = hist.get(key) || { name: raw, price: 0, count: 0 };
      e.name = raw;
      if (price > 0) e.price = price;
      e.count += 1;
      hist.set(key, e);
    }
  }

  /* 2) أنواع الإعدادات أولاً */
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(types) ? types : []) {
    const raw = String((t && t.name) || '').trim();
    const key = normalizeItemName(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const own = Number(t.price) > 0 ? Number(t.price) : 0;
    const h = hist.get(key);
    out.push({ name: raw, price: own || (h ? h.price : 0), source: 'type', count: h ? h.count : 0 });
  }

  /* 3) ثم الأسماء السابقة (الأكثر استخداماً أولاً) */
  const rest = [...hist.entries()]
    .filter(([key]) => !seen.has(key))
    .map(([, e]) => ({ name: e.name, price: e.price, source: 'history', count: e.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'))
    .slice(0, Math.max(0, maxHistory));
  return out.concat(rest);
}

/** البحث عن عنصر في القائمة باسمه (مطابقة موحّدة). */
export function findInCatalog(catalog, name) {
  const key = normalizeItemName(name);
  if (!key) return null;
  return (catalog || []).find((c) => normalizeItemName(c.name) === key) || null;
}
