/* ==========================================================================
   kiosk.js — منطق وضع الكشك (v3.10.1) — دوال نقية بلا DOM
   ==========================================================================
   شاشة عرض للزبائن على جهاز لوحي في المحل: لا تُظهر أي مبلغ أو اسم عميل.
   الخروج برقم المالك فقط. ⚠️ قفل واجهة، وليس تشفير بيانات.
   ========================================================================== */

export const MAX_MESSAGE = 140;
export const MAX_SLIDES = 12;
export const SLIDE_SECONDS = 6;
export const EXIT_TAPS = 3;
export const EXIT_TAP_WINDOW_MS = 1200;
export const EXIT_MAX_FAILS = 5;
export const EXIT_LOCK_SECONDS = 30;

const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/** تنظيف إعدادات الكشك. */
export function normalizeKiosk(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    message: String(r.message == null ? '' : r.message).replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE),
    showStats: bool(r.showStats, true),
    showPortfolio: bool(r.showPortfolio, true),
    showContact: bool(r.showContact, true),
  };
}

/** لا يُشغَّل الكشك بلا رقم مالك (وإلا لا مخرج مؤمَّن منه). */
export const canEnterKiosk = (hasOwnerPin) => hasOwnerPin === true;

const isOpen = (o) => o && o.status !== 'delivered' && o.status !== 'cancelled';
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** أرقام عامة فقط: عدد الطلبات قيد التنفيذ وعدد المسلَّم اليوم. */
export function kioskStats(orders, now = new Date()) {
  const list = Array.isArray(orders) ? orders : [];
  const from = startOfDay(now);
  const to = from + 86400000;
  let active = 0; let deliveredToday = 0;
  for (const o of list) {
    if (!o) continue;
    if (isOpen(o)) active += 1;
    else if (o.status === 'delivered') {
      const ts = Number(o.deliveredAt) || 0;
      if (ts >= from && ts < to) deliveredToday += 1;
    }
  }
  return { active, deliveredToday };
}

/** شرائح المعرض: صور فقط (حتى MAX_SLIDES)، الأحدث أولاً. */
export function pickSlides(items, max = MAX_SLIDES) {
  const list = (Array.isArray(items) ? items : []).filter((p) => p && typeof p.image === 'string' && p.image.startsWith('data:image/'));
  list.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  return list.slice(0, max).map((p) => ({ id: p.id, src: p.image, title: String(p.title || '').slice(0, 60) }));
}

/** رقم الشريحة التالية (دوري). */
export const nextSlide = (i, n) => (n > 0 ? (i + 1) % n : 0);

/** حالة محاولات الخروج: بعد EXIT_MAX_FAILS أخطاء تنتظر EXIT_LOCK_SECONDS ثانية. */
export function exitAttemptState(fails, lockedUntil, now = Date.now()) {
  if (lockedUntil && now < lockedUntil) return { locked: true, remainingSec: Math.ceil((lockedUntil - now) / 1000), fails };
  return { locked: false, remainingSec: 0, fails: lockedUntil && now >= lockedUntil ? 0 : fails };
}
export const failureLockUntil = (fails, now = Date.now()) => (fails >= EXIT_MAX_FAILS ? now + EXIT_LOCK_SECONDS * 1000 : 0);

/** نقرات متتالية على الشعار ضمن نافذة زمنية ⟵ يفتح نافذة الخروج. */
export function registerTap(taps, now = Date.now()) {
  const recent = (Array.isArray(taps) ? taps : []).filter((t) => now - t <= EXIT_TAP_WINDOW_MS);
  recent.push(now);
  return { taps: recent, triggered: recent.length >= EXIT_TAPS };
}
