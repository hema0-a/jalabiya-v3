/* ==========================================================================
   v351-dashboard-layout.test.js — منطق تخصيص لوحة التحكم (v3.5.1) — نقي بلا DOM
   ========================================================================== */
import { register } from '../registry.js';
import {
  LAYOUT_KEY, DASH_BLOCKS, DASH_SECTIONS, defaultLayout, sanitizeLayout, readLayout, writeLayout, isDefault,
  orderedSectionIds, visibleSectionIds, isVisible, toggleVisible, moveSection,
} from '../../services/dashboard-layout.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const DEFAULT_IDS = ['dash-appts', 'dash-week', 'dash-due', 'dash-sales', 'dash-finance', 'dash-orders', 'dash-recent'];

register('v3.5.1 dashboard-layout — تخصيص اللوحة (منطق)', async (t) => {
  await t.test('1. الأقسام السبعة بالترتيب الافتراضي القديم نفسه + كتلتان',
    DASH_SECTIONS.map((s) => s.id).join() === DEFAULT_IDS.join() && DASH_BLOCKS.map((b) => b.id).join() === 'quick,kpis');

  await t.test('2. بلا تفضيل: كل شيء ظاهر بالترتيب الافتراضي',
    visibleSectionIds(defaultLayout()).join() === DEFAULT_IDS.join() && isVisible(defaultLayout(), 'quick') && isVisible(defaultLayout(), 'kpis'));

  await t.test('3. تحريك قسم لأعلى ينقله خطوة ويُبقي الباقي بترتيبه',
    orderedSectionIds(moveSection(defaultLayout(), 'dash-recent', -1)).join() === 'dash-appts,dash-week,dash-due,dash-sales,dash-finance,dash-recent,dash-orders');

  await t.test('4. تحريك لأسفل، وعند الحدّين لا يتغيّر شيء',
    orderedSectionIds(moveSection(defaultLayout(), 'dash-appts', 1))[1] === 'dash-appts' &&
    isDefault(moveSection(defaultLayout(), 'dash-appts', -1)) && isDefault(moveSection(defaultLayout(), 'dash-recent', 1)));

  await t.test('5. إخفاء قسم وكتلة ثم إظهارهما',
    (() => {
      let l = toggleVisible(defaultLayout(), 'dash-sales');
      l = toggleVisible(l, 'quick');
      const hidden = !visibleSectionIds(l).includes('dash-sales') && !isVisible(l, 'quick') && visibleSectionIds(l).length === 6;
      l = toggleVisible(toggleVisible(l, 'dash-sales'), 'quick');
      return hidden && isDefault(l);
    })());

  await t.test('6. معرّف مجهول أو اتجاه غير صالح لا يغيّر شيئاً',
    isDefault(toggleVisible(defaultLayout(), 'nope')) && isDefault(moveSection(defaultLayout(), 'quick', 1)) && isDefault(moveSection(defaultLayout(), 'dash-due', 2)));

  await t.test('7. sanitizeLayout يحذف المجهول والمكرر وغير النصي، والكتل لا تدخل الترتيب',
    (() => {
      const l = sanitizeLayout({ hidden: ['x', 'dash-due', 'dash-due', 3], order: ['dash-due', 'zz', 'dash-due', 'quick'] });
      return l.hidden.join() === 'dash-due' && l.order.join() === 'dash-due' && isDefault(sanitizeLayout('bad')) && isDefault(sanitizeLayout(null));
    })());

  await t.test('8. حفظ وقراءة، والعودة للافتراضي تمسح المفتاح',
    (() => {
      const s = fakeStorage();
      const l = moveSection(toggleVisible(defaultLayout(), 'dash-orders'), 'dash-recent', -1);
      const saved = writeLayout(l, s) && s._m.has(LAYOUT_KEY);
      const back = readLayout(s);
      const same = back.hidden.join() === 'dash-orders' && orderedSectionIds(back).join() === orderedSectionIds(l).join();
      writeLayout(defaultLayout(), s);
      return saved && same && s._m.size === 0;
    })());

  await t.test('9. تخزين تالف أو محجوب أو null ← الافتراضي بلا استثناء، وفشل الكتابة يُرجع false',
    isDefault(readLayout({ getItem: () => '{bad json' })) && isDefault(readLayout(null)) &&
    isDefault(readLayout({ getItem() { throw new Error('blocked'); } })) &&
    writeLayout(toggleVisible(defaultLayout(), 'quick'), { setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } }) === false);

  await t.test('10. معرّفات قديمة في التخزين تُتجاهل وما بقي يحتفظ بترتيبه الافتراضي',
    visibleSectionIds({ hidden: [], order: ['old-section', 'dash-recent'] }).join() === 'dash-recent,dash-appts,dash-week,dash-due,dash-sales,dash-finance,dash-orders');

  await t.test('11. isDefault: الترتيب الكامل المطابق للافتراضي يُعدّ افتراضياً',
    isDefault({ hidden: [], order: DEFAULT_IDS }) && !isDefault({ hidden: ['dash-due'], order: [] }));
});
