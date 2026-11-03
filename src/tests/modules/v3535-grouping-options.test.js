/* ==========================================================================
   v3535-grouping-options.test.js — خيارات أدق لتجميع الطلبات (v3.5.35)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { sizesSimilar, clusterBySize, MAX_MIN_SHARED } from '../../services/size-clusters.js';
import { groupingOptions } from '../../services/alert-rules.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';

async function src(rel) {
  try { const r = await fetch(new URL('../../' + rel, import.meta.url)); return r.ok ? await r.text() : ''; } catch (e) { return ''; }
}
const J = JSON.stringify;

register('v3.5.35 تجميع الطلبات: خيارات أدق', async (t) => {
  const A = { chest: 100, waist: 90, length: 140 };
  const B = { chest: 101, waist: 91, length: 150 };       /* الطول يختلف 10 */
  const C = { chest: 101 };                                 /* مقاس مشترك واحد فقط */
  await t.test('1. الافتراضي (بلا خيارات) = السلوك السابق: مقاسان مشتركان على الأقل وكل الحقول تُقارن', !sizesSimilar(A, B, 2) && sizesSimilar({ chest: 100, waist: 90 }, B, 2) && !sizesSimilar(A, C, 2));
  await t.test('2. minShared=1 يكفي مقاس واحد مشترك', sizesSimilar(A, C, 2, { minShared: 1 }) && !sizesSimilar(A, C, 2, { minShared: 2 }));
  await t.test('3. minShared=3 يشدّد: يلزم ثلاثة مشتركة', !sizesSimilar({ chest: 100, waist: 90 }, { chest: 100, waist: 90 }, 2, { minShared: 3 }) && sizesSimilar(A, { chest: 100, waist: 90, length: 141 }, 2, { minShared: 3 }));
  await t.test('4. قيم غير صالحة لـ minShared ترجع 2، وفوق 5 تُقصّ على 5', !sizesSimilar(A, C, 2, { minShared: 0 }) && !sizesSimilar(A, C, 2, { minShared: 'x' }) && MAX_MIN_SHARED === 5 && !sizesSimilar({ a: 1, b: 1, c: 1, d: 1, e: 1 }, { a: 1, b: 1, c: 1, d: 1, e: 9 }, 0, { minShared: 99 }));
  await t.test('5. fields: الطول مستبعد فيُتجاهل اختلافه (الصدر والوسط يكفيان)', sizesSimilar(A, B, 2, { fields: ['chest', 'waist'] }) && !sizesSimilar(A, B, 2, { fields: ['chest', 'waist', 'length'] }));
  await t.test('6. fields فارغة = كل الحقول', !sizesSimilar(A, B, 2, { fields: [] }));
  await t.test('7. حقل واحد مختار: الحد الفعلي = 1 (لا يستحيل التجميع)', sizesSimilar(A, B, 2, { fields: ['chest'], minShared: 2 }) && !sizesSimilar(A, { chest: 120 }, 2, { fields: ['chest'] }));
  await t.test('8. حقل مختار غير مسجَّل عند أحدهما لا يُعدّ مشتركاً', !sizesSimilar({ chest: 100 }, { waist: 100 }, 2, { fields: ['chest'] }));

  const orders = [
    { id: 'o1', customerId: 'c1', amount: 100, type: 'x' }, { id: 'o2', customerId: 'c2', amount: 200, type: 'x' }, { id: 'o3', customerId: 'c3', amount: 50, type: 'x' },
  ];
  const cmap = { c1: { measurements: A }, c2: { measurements: B }, c3: { measurements: { chest: 200, waist: 200, length: 200 } } };
  const typeOf = (o) => o.type;
  await t.test('9. clusterBySize بلا خيارات: لا تجميع (الطول يفرّق)', clusterBySize(orders, cmap, 2, typeOf, true).length === 0);
  const cl = clusterBySize(orders, cmap, 2, typeOf, true, { fields: ['chest', 'waist'] });
  await t.test('10. clusterBySize مع fields: يجمع c1 وc2 فقط ويترك c3', cl.length === 1 && J(cl[0].customers.sort()) === '["c1","c2"]' && cl[0].totalAmount === 300);

  /* --- الإعدادات --- */
  const go = groupingOptions({});
  await t.test('11. groupingOptions الافتراضي: النوعان مفعّلان، minShared=2، بلا حقول', go.sameCustomer === true && go.sizeMatch === true && go.minShared === 2 && go.fields.length === 0);
  const g2 = groupingOptions({ grouping: { sameCustomer: false, sizeMatch: false, minShared: 9, fields: ['a', '', 5, 'b'] } });
  await t.test('12. القيم تُنقّى: إيقاف النوعين، minShared≤5، حقول نصية صالحة فقط', g2.sameCustomer === false && g2.sizeMatch === false && g2.minShared === 5 && J(g2.fields) === '["a","b"]'
    && groupingOptions({ grouping: { minShared: 0 } }).minShared === 2 && groupingOptions({ grouping: { minShared: -3 } }).minShared === 1 && groupingOptions({ grouping: { fields: 'x' } }).fields.length === 0);
  const dg = DEFAULT_SETTINGS.grouping;
  await t.test('13. الافتراضي في الإعدادات والاسترجاع يعيدها', dg.sameCustomer === true && dg.sizeMatch === true && dg.minShared === 2 && Array.isArray(dg.fields) && J(buildResetPatch('grouping', DEFAULT_SETTINGS).grouping) === J(dg));

  /* --- واجهة القسم --- */
  const sec = DATA_SECTIONS.find((s) => s.id === 'grouping');
  const saves = [];
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    const mf = [{ id: 'chest', name: 'الصدر', enabled: true }, { id: 'waist', name: 'الوسط', enabled: true }, { id: 'neck', name: 'الرقبة', enabled: false }];
    await sec.render(body, { grouping: { enabled: true, tolerance: 2, fields: ['waist'] }, measurementFields: mf }, (p) => { saves.push(JSON.parse(JSON.stringify(p))); });
    const chips = () => Array.from(body.querySelectorAll('button[data-gf]'));
    await t.test('14. أزرار المقاسات للمفعَّلة فقط (2 لا 3) والمختار نشط', chips().length === 2 && J(chips().filter((c) => c.classList.contains('settings-theme-card--active')).map((c) => c.dataset.gf)) === '["waist"]' && /1/.test(body.querySelector('[data-role="grouping-fields-note"]').textContent));
    chips()[0].click();
    await t.test('15. اختيار الصدر يحفظ fields كاملة [waist, chest] حقلاً واحداً في الإعدادات', J(saves[0]) === J({ grouping: { fields: ['waist', 'chest'] } }) && chips().every((c) => c.classList.contains('settings-theme-card--active')));
    chips()[1].click(); chips()[0].click();
    await t.test('16. إلغاء الكل مسموح ويعني «كل المقاسات»', J(saves[2]) === J({ grouping: { fields: [] } }) && /كل المقاسات/.test(body.querySelector('[data-role="grouping-fields-note"]').textContent));
    const txt = body.textContent;
    await t.test('17. مفتاحا نوعي التجميع وحقل أقل عدد مشترك ظاهرة', txt.includes('طلبات نفس العميل') && txt.includes('عملاء بمقاسات متقاربة') && txt.includes('أقل عدد من المقاسات المشتركة'));
    const toggles = Array.from(body.querySelectorAll('.settings-row'));
    const rowOf = (label) => toggles.find((r) => r.textContent.includes(label));
    const inp = (r) => r.querySelector('input');
    const n0 = saves.length;
    const r1 = rowOf('«طلبات نفس العميل»'); const c1 = inp(r1);
    c1.checked = !c1.checked; c1.dispatchEvent(new Event('change', { bubbles: true }));
    const r2 = rowOf('«عملاء بمقاسات متقاربة»'); const c2 = inp(r2);
    c2.checked = !c2.checked; c2.dispatchEvent(new Event('change', { bubbles: true }));
    await t.test('18. إيقاف كل نوع يحفظ مفتاحه وحده', saves.length === n0 + 2 && J(saves[n0]) === J({ grouping: { sameCustomer: false } }) && J(saves[n0 + 1]) === J({ grouping: { sizeMatch: false } }));
    const none = document.createElement('div');
    await sec.render(none, { grouping: {} }, () => {});
    await t.test('19. بلا حقول مقاسات في الإعدادات: لا قسم اختيار حقول ولا أعطال', none.querySelectorAll('button[data-gf]').length === 0 && none.textContent.includes('تفعيل التجميع'));
  } finally { body.remove(); }

  const ov = await src('pages/orders-views.js');
  await t.test('20. عرض التجميع يحترم إيقاف النوعين ويمرّر minShared وfields',
    /opts\.sameCustomer === false \? \[\]/.test(ov) && /opts\.sizeMatch !== false/.test(ov) && /minShared: opts\.minShared, fields: opts\.fields/.test(ov));
});
