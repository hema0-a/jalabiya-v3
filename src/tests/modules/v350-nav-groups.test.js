/* ==========================================================================
   v350-nav-groups.test.js — تجميع التنقل + منطق المفضلة (v3.5.0) — منطق نقي بلا DOM
   ========================================================================== */
import { register } from '../registry.js';
import {
  NAV_GROUPS, ALL_NAV_ITEMS, NAV_IDS, FAV_KEY, MAX_FAVORITES,
  groupIdOf, sanitizeFavorites, readFavorites, writeFavorites, toggleFavorite,
} from '../../services/nav-groups.js';

/* الصفحات الثلاثون الأصلية قبل التجميع: حذف أي صفحة بالخطأ يُكشف هنا */
const ORIGINAL_IDS = [
  'dashboard', 'wall', 'customers', 'orders', 'appointments', 'calendar', 'payments', 'debts', 'pickups', 'messages', 'quotes',
  'inventory', 'workers', 'expenses', 'pricing-calculator', 'portfolio', 'referrals', 'commitments', 'house-expenses', 'loans',
  'occasions', 'season-compare', 'activity-log', 'trash', 'data-care', 'financial-center', 'kpis', 'reports', 'cloud-sync', 'settings',
];

/** تخزين وهمي في الذاكرة */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}
const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('quota'); },
};

register('v3.5.0 nav-groups — التجميع والمفضلة', async (t) => {
  await t.test('1. ست مجموعات بمعرّفات وعناوين وأيقونات فريدة',
    NAV_GROUPS.length === 6 &&
    new Set(NAV_GROUPS.map((g) => g.id)).size === 6 &&
    NAV_GROUPS.every((g) => g.title && g.icon && g.items.length > 0));

  await t.test('2. الصفحات الثلاثون الأصلية كلها موجودة مرة واحدة بلا زيادة',
    ALL_NAV_ITEMS.length === 30 &&
    NAV_IDS.size === 30 &&
    ORIGINAL_IDS.every((id) => NAV_IDS.has(id)));

  await t.test('3. لكل صفحة أيقونة ونص، وأيقونات الصفحات غير مكررة',
    ALL_NAV_ITEMS.every((i) => i.id && i.icon && i.label) &&
    new Set(ALL_NAV_ITEMS.map((i) => i.icon)).size === ALL_NAV_ITEMS.length);

  await t.test('4. لا مجموعة أكبر من 6 صفحات (القصد: قصر القوائم)',
    NAV_GROUPS.every((g) => g.items.length <= 6));

  await t.test('5. groupIdOf: صفحة معروفة ← مجموعتها، ومجهولة ← null',
    groupIdOf('payments') === 'money' && groupIdOf('settings') === 'system' && groupIdOf('dashboard') === 'daily' &&
    groupIdOf('nope') === null && groupIdOf('tests') === null);

  await t.test('6. sanitizeFavorites: يحذف المجهول والمكرر وغير النصي ويحدّ العدد',
    (() => {
      const out = sanitizeFavorites(['orders', 'orders', 'x', 5, null, 'payments']);
      const many = sanitizeFavorites(ALL_NAV_ITEMS.map((i) => i.id));
      return out.join() === 'orders,payments' && many.length === MAX_FAVORITES && sanitizeFavorites('orders').length === 0 && sanitizeFavorites(null).length === 0;
    })());

  await t.test('7. قراءة المفضلة: فارغة افتراضياً، وJSON تالف أو تخزين محجوب ← فارغة بلا استثناء',
    readFavorites(fakeStorage()).length === 0 &&
    readFavorites(fakeStorage({ [FAV_KEY]: '{bad json' })).length === 0 &&
    readFavorites(fakeStorage({ [FAV_KEY]: '{"a":1}' })).length === 0 &&
    readFavorites(brokenStorage).length === 0 &&
    readFavorites(null).length === 0);

  await t.test('8. toggleFavorite: تثبيت ثم إزالة، والحفظ يبقى بين القراءات',
    (() => {
      const s = fakeStorage();
      const a = toggleFavorite('orders', s);
      const b = toggleFavorite('payments', s);
      const afterAdd = readFavorites(s).join();
      const c = toggleFavorite('orders', s);
      return a.added && b.added && afterAdd === 'orders,payments' && !c.added && readFavorites(s).join() === 'payments';
    })());

  await t.test('9. الحد الأقصى: السابعة لا تُضاف ويُرجَع full=true دون تغيير المحفوظ',
    (() => {
      const s = fakeStorage();
      ALL_NAV_ITEMS.slice(0, MAX_FAVORITES).forEach((i) => toggleFavorite(i.id, s));
      const before = readFavorites(s).join();
      const r = toggleFavorite(ALL_NAV_ITEMS[MAX_FAVORITES].id, s);
      return r.full === true && r.added === false && r.max === MAX_FAVORITES && readFavorites(s).join() === before && readFavorites(s).length === MAX_FAVORITES;
    })());

  await t.test('10. معرّف مجهول لا يُثبَّت ولا يُلقي استثناء',
    (() => { const s = fakeStorage(); const r = toggleFavorite('nope', s); return !r.added && !r.full && readFavorites(s).length === 0; })());

  await t.test('11. فشل الكتابة (حصة ممتلئة/محجوب) لا يُلقي استثناء',
    (() => { try { return writeFavorites(['orders'], brokenStorage) === false && typeof toggleFavorite('orders', brokenStorage).added === 'boolean'; } catch (_) { return false; } })());

  await t.test('12. معرّف في التخزين لصفحة حُذفت لاحقاً يُتجاهل عند القراءة',
    readFavorites(fakeStorage({ [FAV_KEY]: JSON.stringify(['orders', 'old-removed-page']) })).join() === 'orders');
});
