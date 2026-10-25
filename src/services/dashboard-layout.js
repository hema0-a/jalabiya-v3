/* ==========================================================================
   dashboard-layout.js — تخصيص لوحة التحكم: إخفاء/إظهار وترتيب الأقسام (v3.5.1)
   ==========================================================================
   - كتلتان قابلتان للإخفاء (الإجراءات السريعة، بطاقات الأرقام) بمكانهما الثابت.
   - سبعة أقسام أكورديون: إخفاء/إظهار + إعادة ترتيب.
   - «يحتاج إجراءك» لا تُخفى ولا تُنقل (أهم ما في اللوحة).
   تفضيل واجهة محلي لهذا الجهاز فقط (لا يُزامَن ولا يدخل النسخ الاحتياطي).
   الافتراضي (بلا تفضيل) = اللوحة كما كانت تماماً. وحدة نقية بلا DOM: تُختبر في Node.
   ========================================================================== */

/** @typedef {{hidden:string[], order:string[]}} DashLayout */

export const LAYOUT_KEY = 'jalabiya_v3_dash_layout';

/** كتل ثابتة المكان (إخفاء فقط). */
export const DASH_BLOCKS = [
  { id: 'quick', icon: '⚡', title: 'الإجراءات السريعة' },
  { id: 'kpis',  icon: '🔢', title: 'بطاقات الأرقام' },
];

/** الأقسام بالترتيب الافتراضي (نفس معرّفات dashSection). */
export const DASH_SECTIONS = [
  { id: 'dash-appts',   icon: '📅', title: 'مواعيد اليوم' },
  { id: 'dash-week',    icon: '👣', title: 'عملاء هذا الأسبوع' },
  { id: 'dash-due',     icon: '⏰', title: 'طلبات مستحقة قريباً' },
  { id: 'dash-sales',   icon: '📊', title: 'مبيعات آخر 7 أيام' },
  { id: 'dash-finance', icon: '💰', title: 'الملخص المالي (30 يوماً)' },
  { id: 'dash-orders',  icon: '🥧', title: 'توزيع الطلبات' },
  { id: 'dash-recent',  icon: '👥', title: 'أحدث العملاء' },
];

const BLOCK_IDS = new Set(DASH_BLOCKS.map((b) => b.id));
const SECTION_IDS = DASH_SECTIONS.map((s) => s.id);
const SECTION_SET = new Set(SECTION_IDS);
const ALL_IDS = new Set([...BLOCK_IDS, ...SECTION_SET]);

/** @returns {DashLayout} */
export function defaultLayout() { return { hidden: [], order: [] }; }

function uniq(list, allowed) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const v of list) {
    if (typeof v !== 'string' || !allowed.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * تنظيف أي قيمة إلى تخطيط صالح (معرّفات مجهولة/مكررة/غير نصية تُحذف).
 * @param {*} raw
 * @returns {DashLayout}
 */
export function sanitizeLayout(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  return { hidden: uniq(r.hidden, ALL_IDS), order: uniq(r.order, SECTION_SET) };
}

/** @returns {Storage|null} */
function defaultStorage() {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

/**
 * قراءة التخطيط (لا تُلقي استثناء: تالف/محجوب ← الافتراضي).
 * @param {Storage|null} [storage]
 * @returns {DashLayout}
 */
export function readLayout(storage = defaultStorage()) {
  if (!storage) return defaultLayout();
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    return raw ? sanitizeLayout(JSON.parse(raw)) : defaultLayout();
  } catch (_) {
    return defaultLayout();
  }
}

/**
 * حفظ التخطيط (الافتراضي يمسح المفتاح بدل تخزين قيمة فارغة).
 * @param {DashLayout} layout
 * @param {Storage|null} [storage]
 * @returns {boolean}
 */
export function writeLayout(layout, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    const clean = sanitizeLayout(layout);
    if (isDefault(clean)) storage.removeItem(LAYOUT_KEY);
    else storage.setItem(LAYOUT_KEY, JSON.stringify(clean));
    return true;
  } catch (_) {
    return false;
  }
}

/** @param {DashLayout} layout @returns {boolean} */
export function isDefault(layout) {
  const l = sanitizeLayout(layout);
  return l.hidden.length === 0 && (l.order.length === 0 || l.order.join() === SECTION_IDS.join());
}

/**
 * ترتيب الأقسام كاملاً: المرتَّب أولاً ثم ما بقي بترتيبه الافتراضي.
 * @param {DashLayout} layout
 * @returns {string[]}
 */
export function orderedSectionIds(layout) {
  const l = sanitizeLayout(layout);
  const rest = SECTION_IDS.filter((id) => !l.order.includes(id));
  return [...l.order, ...rest];
}

/**
 * الأقسام الظاهرة فقط بترتيبها.
 * @param {DashLayout} layout
 * @returns {string[]}
 */
export function visibleSectionIds(layout) {
  const l = sanitizeLayout(layout);
  return orderedSectionIds(l).filter((id) => !l.hidden.includes(id));
}

/**
 * هل الكتلة/القسم ظاهر؟
 * @param {DashLayout} layout
 * @param {string} id
 * @returns {boolean}
 */
export function isVisible(layout, id) {
  return !sanitizeLayout(layout).hidden.includes(id);
}

/**
 * تبديل الإخفاء (تخطيط جديد؛ معرّف مجهول لا يغيّر شيئاً).
 * @param {DashLayout} layout
 * @param {string} id
 * @returns {DashLayout}
 */
export function toggleVisible(layout, id) {
  const l = sanitizeLayout(layout);
  if (!ALL_IDS.has(id)) return l;
  const hidden = l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id];
  return { hidden, order: l.order };
}

/**
 * تحريك قسم خطوة لأعلى (-1) أو لأسفل (+1) ضمن الترتيب الكامل؛ عند الحد لا يتغيّر شيء.
 * @param {DashLayout} layout
 * @param {string} id
 * @param {-1|1} dir
 * @returns {DashLayout}
 */
export function moveSection(layout, id, dir) {
  const l = sanitizeLayout(layout);
  if (!SECTION_SET.has(id) || (dir !== -1 && dir !== 1)) return l;
  const order = orderedSectionIds(l);
  const i = order.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= order.length) return l;
  [order[i], order[j]] = [order[j], order[i]];
  return { hidden: l.hidden, order };
}
