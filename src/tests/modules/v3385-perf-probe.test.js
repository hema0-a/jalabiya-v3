/* ==========================================================================
   v3385-perf-probe.test.js — أداة قياس الأداء (قراءة فقط) + إصلاح أقسام الخطوط/الخلفيات/الأيقونات (v3.3.85)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';
import { WORKSHOP_SECTIONS } from '../../pages/settings/sections-workshop.js';
import {
  RUNS, ORDERS_GETALL_CAP, PAGE_PROFILES, summarizeTimes, recordBytes, runProbe, projectGrowth, verdictLines, formatReport, hasRoomFor, runSynthetic,
} from '../../services/perf-probe.js';

/** تبعيات وهمية: مخازن بسجلات معروفة، وساعة تتقدّم 5ms لكل قراءة. */
function fakeDeps(data, extra = {}) {
  let clock = 0;
  const calls = { getAll: [], readBatch: [] };
  const deps = {
    now: () => clock,
    getAll: async (s) => { calls.getAll.push(s); clock += 5; return data[s] || []; },
    readBatch: async (s, after, n) => {
      calls.readBatch.push(s);
      const all = data[s] || []; const start = after == null ? 0 : after + 1;
      const recs = all.slice(start, start + n);
      return { records: recs, lastKey: start + recs.length - 1, done: start + recs.length >= all.length };
    },
    yieldFn: async () => {},
    openDB: async () => {},
    storageEstimate: async () => ({ usage: 1000, quota: 5000 }),
    storeNames: () => Object.values(STORES),
    env: () => ({ ua: 'TestUA', memory: 4, cores: 8, online: true }),
    ...extra,
  };
  return { deps, calls };
}
const orderRec = (i, img) => ({ id: 'o' + i, customerId: 'c1', total: 100, referenceImage: img ? 'x'.repeat(img) : '', signature: 's'.repeat(10) });

register('v3.3.85 perf-probe — المنطق النقي', async (t) => {
  const st = summarizeTimes([30, 10, 20]);
  await t.test('1. summarizeTimes: الأول والوسيط والحدّان', st.first === 30 && st.median === 20 && st.min === 10 && st.max === 30 && summarizeTimes([]).median === 0);
  const rb = recordBytes({ id: 'a', referenceImage: 'x'.repeat(1000), signature: 'y'.repeat(50), deliveries: [{ signature: 'z'.repeat(25) }] });
  await t.test('2. recordBytes: الوسائط = صورة + توقيع + توقيعات التسليمات، والكل يشملها', rb.media === 1075 && rb.total >= 1075 && recordBytes(null).total === 0);
  await t.test('3. hasRoomFor: هامش 2× من المتاح، وتعذّر المعرفة ⟵ نجرّب', hasRoomFor({ usage: 0, quota: 1000 }, 400) && !hasRoomFor({ usage: 0, quota: 1000 }, 600) && hasRoomFor(null, 1e12));
  await t.test('4. أنماط الصفحات: اللوحة تقرأ الطلبات أكثر من مرة (سبب التكرار)', PAGE_PROFILES.find((p) => p.id === 'dashboard').waves.flat().filter((s) => s === 'orders').length >= 4);
  const sy = await runSynthetic({ deps: { indexedDB: null } });
  await t.test('5. runSynthetic بلا IndexedDB ⟵ يتخطّى بسبب مفهوم ولا يرمي', sy.rows.length === 0 && /غير متاحة/.test(sy.skipped));
});

register('v3.3.85 perf-probe — runProbe (قراءة فقط) والتقدير والتقرير', async (t) => {
  const big = Array.from({ length: 40 }, (_, i) => orderRec(i, 200_000));    /* ~8MB، أغلبها صور */
  const { deps, calls } = fakeDeps({ orders: big, customers: [{ id: 'c1', name: 'أ' }, { id: 'c2', name: 'ب' }] });
  const steps = [];
  const rep = await runProbe({ deps, onProgress: (p) => steps.push(p.step) });
  const ord = rep.stores.find((r) => r.store === 'orders');
  await t.test('1. عدّ الطلبات وحجمها وحصة الوسائط (>95%)', ord.count === 40 && ord.bytes > 8_000_000 && rep.orders.mediaShare > 0.95 && rep.orders.count === 40);
  await t.test('2. زمن getAll يُقاس RUNS مرات لكل مخزن (الأول ثم الوسيط)', ord.timing && ord.timing.median > 0 && calls.getAll.filter((s) => s === 'orders').length >= RUNS);
  const dash = rep.pages.find((p) => p.id === 'dashboard');
  await t.test('3. نمط اللوحة يُنفَّذ كقراءات فعلية ويُبلَّغ بتكرار الطلبات', dash.timing && dash.ordersReads >= 4 && dash.reads === PAGE_PROFILES[0].waves.flat().length);
  await t.test('4. «الأدوات للقراءة فقط»: التبعيات المستعملة getAll/readBatch فقط ولا دالة كتابة', Object.keys(deps).every((k) => !/put|write|remove|clear|delete/i.test(k)));
  await t.test('5. تتبّع التقدم يعمل', steps.length > 5 && steps.some((x) => /orders/.test(x)));

  const g = projectGrowth(rep);
  const r1000 = g.rows.find((r) => r.orders === 1000);
  await t.test('6. projectGrowth: بيانات كبيرة ⟵ تقدير موثوق، و1000 طلب أكبر من الحالي، وبلا وسائط أصغر بكثير',
    g.reliable && r1000.fullBytes > ord.bytes && r1000.slimBytes < r1000.fullBytes / 10 && r1000.fullMs > r1000.slimMs);

  const small = await runProbe({ deps: fakeDeps({ orders: [orderRec(1, 0), orderRec(2, 0)] }).deps });
  const gs = projectGrowth(small);
  await t.test('7. بيانات قليلة (طلبان) ⟵ يُعلَن أن التقدير ضعيف ولا يُدّعى دقة', gs.reliable === false && /ضعيف/.test(formatReport(small)));

  const capped = await runProbe({ deps: fakeDeps({ orders: [orderRec(1, ORDERS_GETALL_CAP + 10)] }).deps });
  const cd = capped.pages.find((p) => p.id === 'dashboard');
  await t.test('8. طلبات أكبر من الحد ⟵ يُتخطّى القياس الزمني حمايةً (للطلبات وما يتضمنها) ويُذكر في الخلاصة',
    capped.skipped.includes('orders') && cd.timing === null && /تخطّ/.test(verdictLines(capped).join(' ')));

  let n = 0;
  const cancelled = await runProbe({ deps: fakeDeps({ orders: big }).deps, shouldCancel: () => (++n > 3) });
  await t.test('9. الإيقاف يُنهي بتقرير جزئي مُعلَّم cancelled', cancelled.cancelled === true && cancelled.stores.length < Object.values(STORES).length);

  const txt = formatReport(rep, { rows: [{ orders: 100, mediaKB: 250, fullBytes: 25e6, full: { first: 90, median: 70 }, slim: { first: 5, median: 3 }, note: '' }], skipped: '' });
  await t.test('10. نص التقرير كامل: خلاصة + مخازن + صفحات + نمو + اختبار تخيّلي', ['الخلاصة', 'المخازن', 'فتح الصفحات', 'تقدير النمو', 'النمو التخيّلي'].every((k) => txt.includes(k)) && txt.includes('v'));
});

register('v3.3.85 perf-probe — القاعدة الفعلية بلا أي كتابة', async (t) => {
  const v0 = idb.getWriteVersion();
  let writes = 0;
  idb.onWrite(() => { writes++; });
  const rep = await runProbe();
  await t.test('1. القياس على القاعدة الحقيقية لا يكتب شيئاً (writeVersion ثابت ولا إشعار كتابة)', idb.getWriteVersion() === v0 && writes === 0);
  await t.test('2. التقرير يغطي المخازن الأساسية وأنماط الصفحات', ['customers', 'orders', 'payments'].every((s) => rep.stores.some((r) => r.store === s)) && rep.pages.length === PAGE_PROFILES.length);
  await t.test('3. نص التقرير قابل للنسخ (غير فارغ)', formatReport(rep).length > 200);
});

register('v3.3.85 settings — أزرار الخطوط/الأحجام/الخلفيات/الأيقونات لا تكرّر القسم', async (t) => {
  const find = (id) => WORKSHOP_SECTIONS.find((s) => s.id === id);
  const render = async (id, cur) => {
    const saves = [];
    const body = document.createElement('div');
    await find(id).render(body, cur, (p) => { saves.push(p); });
    return { body, saves };
  };
  const active = (root, sel) => root.querySelectorAll(sel + '.settings-theme-card--active').length;

  const f = await render('fonts', { display: { fontFamily: 'ibm-plex', fontSize: 'normal' } });
  const fonts = () => f.body.querySelectorAll('button[data-font]');
  const sizes = () => f.body.querySelectorAll('button[data-size]');
  const h0 = f.body.querySelectorAll('.settings-field').length;
  await t.test('1. البداية: 5 خطوط و4 أحجام وواحد نشط من كل نوع', fonts().length === 5 && sizes().length === 4 && active(f.body, 'button[data-font]') === 1 && active(f.body, 'button[data-size]') === 1);
  fonts()[2].click(); sizes()[3].click(); fonts()[1].click(); sizes()[0].click(); fonts()[4].click();
  await t.test('2. بعد 5 ضغطات متتالية: لا تكرار ولا تداخل (نفس عدد الأزرار والحقول)',
    fonts().length === 5 && sizes().length === 4 && f.body.querySelectorAll('.settings-field').length === h0 && f.body.querySelectorAll('.settings-field .settings-field').length === 0);
  await t.test('3. التمييز يتبع آخر اختيار (خط noto-kufi وحجم small) وواحد فقط نشط',
    f.body.querySelector('button[data-font].settings-theme-card--active').dataset.font === 'noto-kufi' &&
    f.body.querySelector('button[data-size].settings-theme-card--active').dataset.size === 'small' &&
    active(f.body, 'button[data-font]') === 1 && active(f.body, 'button[data-size]') === 1);
  await t.test('4. الحفظ بحقل واحد لكل ضغطة (دمج عميق لا يمحو غيره) وبالترتيب',
    f.saves.length === 5 && JSON.stringify(f.saves[0]) === JSON.stringify({ display: { fontFamily: 'tajawal' } }) && JSON.stringify(f.saves[1]) === JSON.stringify({ display: { fontSize: 'xlarge' } }));
  await t.test('5. تطبيق الخط والحجم على الصفحة فوراً (data-font / data-size على html)',
    document.documentElement.getAttribute('data-font') === 'noto-kufi' && document.documentElement.getAttribute('data-size') === 'small');
  document.documentElement.setAttribute('data-font', 'ibm-plex'); document.documentElement.setAttribute('data-size', 'normal');

  const b = await render('backgrounds', { appearance: { backgroundPattern: 'none' } });
  const bn = b.body.querySelectorAll('button[data-bg]').length;
  b.body.querySelectorAll('button[data-bg]')[1].click(); b.body.querySelectorAll('button[data-bg]')[2].click();
  await t.test('6. الخلفيات: بعد ضغطتين لا تكرار والتمييز يتبع الاختيار', b.body.querySelectorAll('button[data-bg]').length === bn && active(b.body, 'button[data-bg]') === 1 && b.saves.length === 2);
  document.body.classList.remove('bg-fabric', 'bg-sewing', 'bg-geometric', 'bg-paper');

  const ic = await render('icons', { appearance: { iconStyle: 'default' } });
  const inn = ic.body.querySelectorAll('button[data-icon]').length;
  ic.body.querySelectorAll('button[data-icon]')[1].click(); ic.body.querySelectorAll('button[data-icon]')[2].click();
  await t.test('7. الأيقونات: لا تكرار والتمييز يتبع الاختيار', ic.body.querySelectorAll('button[data-icon]').length === inn && active(ic.body, 'button[data-icon]') === 1 && ic.saves.length === 2);
  document.body.classList.remove('icons-colored-badges', 'icons-line');

  const ap = await render('appearance', { appearance: { theme: 'classic' } });
  const themes = ap.body.querySelectorAll('button[data-theme]');
  themes[3].click();
  await t.test('8. الثيمات: التمييز ينتقل إلى الثيم المختار', active(ap.body, 'button[data-theme]') === 1 && ap.body.querySelector('button[data-theme].settings-theme-card--active').dataset.theme === themes[3].dataset.theme);
});
