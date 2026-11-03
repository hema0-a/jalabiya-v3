/* ==========================================================================
   v3536-pricing-options.test.js — حاسبة التسعير: قيم افتراضية + تقريب + عدد السجل (v3.5.36)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { settings } from '../../data/repos/settings.js';
import { computePricing, ROUND_STEPS, historyLimit, HISTORY_MIN, HISTORY_MAX, pricingCalculatorPage } from '../../pages/pricing-calculator.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const ALL_ON = { enableFabric: true, enableLabor: true, enableExtras: true, enableOverhead: true };

register('v3.5.36 حاسبة التسعير: افتراضيات وتقريب وسجل', async (t) => {
  const inp = { meters: 3, meterPrice: 100, extras: 0, hours: 0, hourlyRate: 0, overhead: 0, margin: 24.33 };   /* التكلفة 300، البيع 372.99 */
  const base = computePricing(inp, ALL_ON);
  await t.test('1. بلا roundTo: الحساب كما كان تماماً (لا تقريب)', Math.abs(base.sellingPrice - 372.99) < 1e-9 && Math.abs(base.profit - 72.99) < 1e-9);
  await t.test('2. roundTo=0 أو غير معروف (7، نص) = بلا تقريب', computePricing(inp, { ...ALL_ON, roundTo: 0 }).sellingPrice === base.sellingPrice
    && computePricing(inp, { ...ALL_ON, roundTo: 7 }).sellingPrice === base.sellingPrice && computePricing(inp, { ...ALL_ON, roundTo: 'x' }).sellingPrice === base.sellingPrice);
  const r5 = computePricing(inp, { ...ALL_ON, roundTo: 5 });
  await t.test('3. تقريب لأقرب 5: 372.99 ← 375 والربح = السعر − التكلفة', r5.sellingPrice === 375 && r5.profit === 75 && r5.totalCost === 300);
  const r10 = computePricing({ ...inp, margin: 21 }, { ...ALL_ON, roundTo: 10 });   /* 363 ← 360 */
  await t.test('4. تقريب لأقرب 10 يصعد وينزل: 363 ← 360', r10.sellingPrice === 360 && r10.profit === 60);
  const r50 = computePricing({ ...inp, meters: 10, margin: 30 }, { ...ALL_ON, roundTo: 50 });   /* 1300 ← 1300 */
  await t.test('5. تقريب لأقرب 50: 1300 يبقى 1300', r50.sellingPrice === 1300);
  const z = computePricing({ meters: 0, meterPrice: 0, margin: 30 }, { ...ALL_ON, roundTo: 50 });
  await t.test('6. سعر صفر لا يُقرَّب (يبقى 0 والربح 0)', z.sellingPrice === 0 && z.profit === 0);
  await t.test('7. خطوات التقريب المسموحة 0/5/10/50', J(ROUND_STEPS) === '[0,5,10,50]');
  await t.test('8. historyLimit: الافتراضي 50 ويُقصّ بين 10 و200',
    historyLimit({}) === 50 && historyLimit(null) === 50 && historyLimit({ maxHistoryItems: 3 }) === HISTORY_MIN && historyLimit({ maxHistoryItems: 999 }) === HISTORY_MAX && historyLimit({ maxHistoryItems: 75 }) === 75 && historyLimit({ maxHistoryItems: 'x' }) === 50 && historyLimit({ maxHistoryItems: -4 }) === 50);
  const d = DEFAULT_SETTINGS.pricingCalculator;
  await t.test('9. الإعدادات الافتراضية: أمتار 3 وبقية الافتراضيات 0 وبلا تقريب والسجل 50',
    d.defaultMeters === 3 && d.defaultMeterPrice === 0 && d.defaultHourlyRate === 0 && d.defaultOverhead === 0 && d.roundTo === 0 && d.maxHistoryItems === 50);
  await t.test('10. الاسترجاع الافتراضي يعيد الحقول الجديدة', J(buildResetPatch('pricing-calculator', DEFAULT_SETTINGS).pricingCalculator) === J(d));

  /* --- الصفحة تملأ القيم الافتراضية --- */
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  try {
    await settings.update({ pricingCalculator: { defaultMeters: 4.5, defaultMeterPrice: 120, defaultHourlyRate: 35, defaultOverhead: 40, roundTo: 10 } });
    await pricingCalculatorPage.render(holder);
    const v = (id) => { const e = holder.querySelector('#' + id); return e ? e.value : null; };
    await t.test('11. الحاسبة تملأ الأمتار والأسعار والمصاريف من الإعدادات', v('pc-meters') === '4.5' && v('pc-meter-price') === '120' && v('pc-hourly-rate') === '35' && v('pc-overhead') === '40');
    pricingCalculatorPage.destroy();
    await settings.clear();
    holder.replaceChildren();
    await pricingCalculatorPage.render(holder);
    await t.test('12. بلا إعدادات: السلوك السابق (3 أمتار وباقي الحقول 0)', v('pc-meters') === '3' && (v('pc-meter-price') === '0' || v('pc-meter-price') === '') && (v('pc-hourly-rate') === '0' || v('pc-hourly-rate') === ''));
  } finally { pricingCalculatorPage.destroy(); holder.remove(); await settings.clear(); }

  /* --- واجهة الإعدادات --- */
  const sec = DATA_SECTIONS.find((s) => s.id === 'pricing-calculator');
  const saves = [];
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    await sec.render(body, { pricingCalculator: { roundTo: 5, maxHistoryItems: 80, defaultMeterPrice: 90 } }, (p) => { saves.push(JSON.parse(JSON.stringify(p))); });
    const rounds = () => Array.from(body.querySelectorAll('button[data-round]'));
    await t.test('13. أربع بطاقات تقريب والنشطة 5 ج', rounds().length === 4 && J(rounds().filter((b) => b.classList.contains('settings-theme-card--active')).map((b) => b.dataset.round)) === '["5"]');
    rounds()[3].click();
    await t.test('14. اختيار 50 يحفظ حقلاً واحداً ويُحدّث التمييز', J(saves[0]) === J({ pricingCalculator: { roundTo: 50 } }) && rounds().filter((b) => b.classList.contains('settings-theme-card--active')).length === 1 && rounds()[3].classList.contains('settings-theme-card--active'));
    rounds()[0].click();
    await t.test('15. «بدون» يحفظ 0', J(saves[1]) === J({ pricingCalculator: { roundTo: 0 } }));
    const inputs = Array.from(body.querySelectorAll('input[type="number"]'));
    const byVal = (val) => inputs.find((i) => i.value === String(val));
    const hist = byVal(80); const mp = byVal(90);
    await t.test('16. حقل السجل بقيمته المحفوظة (80) وحقل سعر المتر الافتراضي (90) موجودان', !!hist && !!mp && hist.max === '200' && hist.min === '10');
    const n = saves.length;
    mp.value = '110'; mp.dispatchEvent(new Event('blur'));
    await sleep(30);
    await t.test('17. تعديل سعر المتر الافتراضي يحفظ حقله وحده', saves.length === n + 1 && J(saves[n]) === J({ pricingCalculator: { defaultMeterPrice: 110 } }));
    await t.test('18. أربعة حقول افتراضية جديدة + حقل السجل + الهامش (6 حقول رقمية على الأقل)', inputs.length >= 6 && body.textContent.includes('قيم تُملأ تلقائياً') && body.textContent.includes('تقريب سعر البيع'));
  } finally { body.remove(); }
});
