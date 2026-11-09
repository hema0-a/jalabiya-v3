/* ==========================================================================
   documents.js — تجديد المستندات: عقد الإيجار، التأمين، الرخص، الضرائب... (v3.16.0) — دوال نقية
   ==========================================================================
   لكل مستند تاريخ انتهاء وتنبيه قبله بعدد أيام (الافتراضي 30). الحالة: منتهٍ · قريب (داخل مدة التنبيه) · ساري.
   عند التجديد: لو جدّدت قبل الانتهاء يُضاف عام إلى تاريخ الانتهاء القديم (لا تضيع أيام التجديد المبكر)،
   وإن كان منتهياً من قبل فعام من اليوم. لا DOM ولا قاعدة بيانات.
   ========================================================================== */

export const CATEGORIES = [
  { id: 'lease', icon: '🏠', label: 'عقد إيجار' },
  { id: 'insurance', icon: '🛡️', label: 'تأمين' },
  { id: 'license', icon: '🪪', label: 'رخصة / ترخيص' },
  { id: 'tax', icon: '🧾', label: 'ضرائب / سجلات' },
  { id: 'vehicle', icon: '🚗', label: 'مركبة' },
  { id: 'subscription', icon: '🔁', label: 'اشتراك' },
  { id: 'other', icon: '📄', label: 'أخرى' },
];
export const DEFAULT_REMIND_DAYS = 30;
const DAY = 86400000;
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const CAT_IDS = CATEGORIES.map((c) => c.id);

export const normalizeCategory = (v) => (CAT_IDS.includes(v) ? v : 'other');
export const categoryMeta = (v) => CATEGORIES.find((c) => c.id === normalizeCategory(v));
/** مدة التنبيه بالأيام (0..365)؛ الفارغ أو الفاسد أو خارج النطاق ⟵ الافتراضي 30 (الصفر مسموح صراحةً). */
export const normalizeRemindDays = (v) => {
  if (v === '' || v === null || v === undefined) return DEFAULT_REMIND_DAYS;
  const x = Number(v);
  if (!isFinite(x)) return DEFAULT_REMIND_DAYS;
  const d = Math.round(x);
  return d >= 0 && d <= 365 ? d : DEFAULT_REMIND_DAYS;
};

const startOfDay = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** تحقّق من بيانات مستند. @returns {{ok:boolean,error?:string,data?:Object}} */
export function checkDocumentInput(input) {
  const title = typeof (input && input.title) === 'string' ? input.title.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (!title) return { ok: false, error: 'اسم المستند مطلوب' };
  const exp = n(input.expiresAt);
  if (!(exp > 0)) return { ok: false, error: 'تاريخ الانتهاء مطلوب' };
  const cost = Math.round(n(input.cost) * 100) / 100;
  if (cost < 0 || cost > 100000000) return { ok: false, error: 'تكلفة التجديد غير صالحة' };
  const notes = typeof input.notes === 'string' ? input.notes.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return { ok: true, data: { title, category: normalizeCategory(input.category), expiresAt: startOfDay(exp), remindDays: normalizeRemindDays(input.remindDays), cost, notes } };
}

/** @returns {{status:'expired'|'due'|'ok', daysLeft:number}} daysLeft سالب للمنتهي */
export function documentStatus(doc, now = new Date()) {
  const exp = n(doc && doc.expiresAt);
  if (!(exp > 0)) return { status: 'ok', daysLeft: Infinity };
  const daysLeft = Math.round((startOfDay(exp) - startOfDay(now.getTime())) / DAY);
  const remind = normalizeRemindDays(doc.remindDays);
  return { status: daysLeft < 0 ? 'expired' : (daysLeft <= remind ? 'due' : 'ok'), daysLeft };
}

/** ترتيب: المنتهي ثم القريب ثم الساري، وداخل كل فئة الأقرب انتهاءً أولاً. */
export function sortDocuments(docs, now = new Date()) {
  const rank = { expired: 0, due: 1, ok: 2 };
  return (Array.isArray(docs) ? docs : []).filter((d) => d && n(d.expiresAt) > 0).slice().sort((a, b) => {
    const sa = documentStatus(a, now), sb = documentStatus(b, now);
    return rank[sa.status] - rank[sb.status] || sa.daysLeft - sb.daysLeft || String(a.title).localeCompare(String(b.title), 'ar');
  });
}

/** تاريخ الانتهاء الجديد عند التجديد (بداية يوم). */
export function renewedExpiry(doc, now = new Date()) {
  const exp = n(doc && doc.expiresAt);
  const base = exp >= startOfDay(now.getTime()) ? new Date(exp) : new Date(startOfDay(now.getTime()));
  return new Date(base.getFullYear() + 1, base.getMonth(), base.getDate()).getTime();
}

/** ملخص: عدد المنتهي والقريب وإجمالي تكلفة التجديدات المتوقعة خلال 90 يوماً. */
export function documentsSummary(docs, now = new Date()) {
  let expired = 0, due = 0, cost90 = 0;
  for (const d of Array.isArray(docs) ? docs : []) {
    if (!d) continue;
    const s = documentStatus(d, now);
    if (s.status === 'expired') expired++; else if (s.status === 'due') due++;
    if (s.daysLeft <= 90) cost90 += n(d.cost);
  }
  return { expired, due, cost90: Math.round(cost90 * 100) / 100 };
}

/** عناصر التنبيه (المنتهي والقريب) للإشعارات. */
export function documentAlerts(docs, now = new Date()) {
  return sortDocuments(docs, now).map((d) => ({ d, ...documentStatus(d, now) })).filter((x) => x.status !== 'ok');
}
