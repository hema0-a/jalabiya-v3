/* ==========================================================================
   nav-groups.js — تجميع صفحات التنقل + المفضلة (v3.5.0)
   ==========================================================================
   - NAV_GROUPS: 6 مجموعات بدل 9 أقسام مسطّحة (كانت 28 صفحة ظاهرة معاً).
   - المفضلة: صفحات يثبّتها المستخدم في أعلى القائمة (تفضيل واجهة محلي لهذا الجهاز فقط —
     ليس بيانات ولا يُزامَن ولا يدخل النسخ الاحتياطي).
   وحدة نقية بلا DOM: تُختبر في Node، والتخزين يُمرَّر كوسيط للاختبار.
   ========================================================================== */

/** @typedef {{id:string, icon:string, label:string}} NavItem */
/** @typedef {{id:string, title:string, icon:string, items:NavItem[]}} NavGroup */

/** @type {NavGroup[]} */
export const NAV_GROUPS = [
  { id: 'daily', title: 'اليومي', icon: '☀️', items: [
    { id: 'dashboard', icon: '🏠', label: 'لوحة التحكم' },
    { id: 'wall',      icon: '📺', label: 'شاشة الورشة' },
    { id: 'orders',    icon: '📋', label: 'الطلبات' },
    { id: 'customers', icon: '👥', label: 'العملاء' },
    { id: 'pickups',   icon: '📦', label: 'جاهز للاستلام' },
    { id: 'messages',  icon: '📣', label: 'رسائل اليوم' },
  ]},
  { id: 'money', title: 'المال', icon: '💰', items: [
    { id: 'payments',         icon: '💰', label: 'الدفعات' },
    { id: 'debts',            icon: '🧾', label: 'مستحقات العملاء' },
    { id: 'expenses',         icon: '💸', label: 'مصروفات الورشة' },
    { id: 'financial-center', icon: '🏦', label: 'المركز المالي' },
    { id: 'kpis',             icon: '🎯', label: 'مؤشرات الأداء' },
    { id: 'reports',          icon: '📈', label: 'التقارير' },
  ]},
  { id: 'workshop', title: 'الورشة', icon: '🧵', items: [
    { id: 'appointments',       icon: '🗓️', label: 'المواعيد' },
    { id: 'calendar',           icon: '📅', label: 'تقويم المواعيد' },
    { id: 'inventory',          icon: '🧵', label: 'المخزون' },
    { id: 'workers',            icon: '👷', label: 'العمال' },
    { id: 'pricing-calculator', icon: '🧮', label: 'حاسبة التسعير' },
    { id: 'quotes',             icon: '📝', label: 'عروض الأسعار' },
  ]},
  { id: 'growth', title: 'التسويق والمواسم', icon: '📢', items: [
    { id: 'portfolio',      icon: '📸', label: 'معرض الأعمال' },
    { id: 'referrals',      icon: '🤝', label: 'الإحالات' },
    { id: 'occasions',      icon: '🎉', label: 'المواسم والأعياد' },
    { id: 'season-compare', icon: '⚖️', label: 'مقارنة المواسم' },
  ]},
  { id: 'personal', title: 'الشخصي', icon: '🏡', items: [
    { id: 'commitments',    icon: '💳', label: 'الالتزامات' },
    { id: 'house-expenses', icon: '🏡', label: 'مصاريف البيت' },
    { id: 'loans',          icon: '💵', label: 'القروض' },
  ]},
  { id: 'system', title: 'النظام', icon: '⚙️', items: [
    { id: 'activity-log', icon: '📜', label: 'سجل النشاط' },
    { id: 'trash',        icon: '🗑️', label: 'سلة المحذوفات' },
    { id: 'data-care',    icon: '🧰', label: 'صيانة البيانات' },
    { id: 'cloud-sync',   icon: '☁️', label: 'المزامنة السحابية' },
    { id: 'settings',     icon: '⚙️', label: 'الإعدادات' },
  ]},
];

/** كل الصفحات مسطّحة (للعنوان والبحث). */
export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** مجموعة معرّفات الصفحات الصالحة. */
export const NAV_IDS = new Set(ALL_NAV_ITEMS.map((i) => i.id));

export const FAV_KEY = 'jalabiya_v3_nav_favorites';
export const MAX_FAVORITES = 6;

/**
 * معرّف المجموعة التي تحوي صفحة.
 * @param {string} pageId
 * @param {NavGroup[]} [groups]
 * @returns {string|null}
 */
export function groupIdOf(pageId, groups = NAV_GROUPS) {
  const g = groups.find((grp) => grp.items.some((i) => i.id === pageId));
  return g ? g.id : null;
}

/**
 * تنظيف قائمة مفضلة: نصوص فقط، صفحات معروفة فقط، بلا تكرار، بحد أقصى.
 * @param {*} list
 * @param {Set<string>} [validIds]
 * @param {number} [max]
 * @returns {string[]}
 */
export function sanitizeFavorites(list, validIds = NAV_IDS, max = MAX_FAVORITES) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const v of list) {
    if (typeof v !== 'string' || !validIds.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** @returns {Storage|null} */
function defaultStorage() {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

/**
 * قراءة المفضلة (لا تُلقي استثناء: JSON تالف أو تخزين محجوب ← قائمة فارغة).
 * @param {Storage|null} [storage]
 * @returns {string[]}
 */
export function readFavorites(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FAV_KEY);
    return raw ? sanitizeFavorites(JSON.parse(raw)) : [];
  } catch (_) {
    return [];
  }
}

/**
 * حفظ المفضلة.
 * @param {string[]} list
 * @param {Storage|null} [storage]
 * @returns {boolean} نجح الحفظ؟
 */
export function writeFavorites(list, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(FAV_KEY, JSON.stringify(sanitizeFavorites(list)));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * تبديل تثبيت صفحة. عند امتلاء الحد لا يُضاف شيء ويُرجَع full=true.
 * @param {string} pageId
 * @param {Storage|null} [storage]
 * @returns {{favorites:string[], added:boolean, full:boolean, max:number}}
 */
export function toggleFavorite(pageId, storage = defaultStorage()) {
  const current = readFavorites(storage);
  if (!NAV_IDS.has(pageId)) return { favorites: current, added: false, full: false, max: MAX_FAVORITES };
  if (current.includes(pageId)) {
    const next = current.filter((id) => id !== pageId);
    writeFavorites(next, storage);
    return { favorites: next, added: false, full: false, max: MAX_FAVORITES };
  }
  if (current.length >= MAX_FAVORITES) {
    return { favorites: current, added: false, full: true, max: MAX_FAVORITES };
  }
  const next = [...current, pageId];
  writeFavorites(next, storage);
  return { favorites: next, added: true, full: false, max: MAX_FAVORITES };
}
