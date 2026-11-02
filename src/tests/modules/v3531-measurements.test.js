/* ==========================================================================
   v3531-measurements.test.js — ترتيب حقول المقاسات + مقاس مطلوب (v3.5.31)
   ========================================================================== */
import { register } from '../registry.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';
import { buildMeasurementsSection } from '../../pages/customers-measure.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => [
  { id: 'a', name: 'الكتف', enabled: true, unit: 'cm' },
  { id: 'b', name: 'الصدر', enabled: true, unit: 'cm' },
  { id: 'c', name: 'الطول', enabled: true, unit: 'cm', required: true },
];

register('v3.5.31 المقاسات: ترتيب + مطلوب', async (t) => {
  const sec = DATA_SECTIONS.find((s) => s.id === 'measurements');
  const saves = [];
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    const fields = mk();
    await sec.render(body, { measurementFields: fields }, (p) => { saves.push(JSON.parse(JSON.stringify(p))); });
    const rows = () => Array.from(body.querySelectorAll('button[data-action="move-up"]')).length;
    const names = () => Array.from(body.querySelectorAll('div > span:first-child')).map((x) => x.textContent).filter((x) => /الكتف|الصدر|الطول/.test(x));
    await t.test('1. لكل حقل زرا ▲▼ وأول ▲ وآخر ▼ معطّلان', rows() === 3 && body.querySelectorAll('button[data-action="move-up"]')[0].disabled && !body.querySelectorAll('button[data-action="move-up"]')[1].disabled && body.querySelectorAll('button[data-action="move-down"]')[2].disabled && !body.querySelectorAll('button[data-action="move-down"]')[0].disabled);
    await t.test('2. الحقل المطلوب يُعرض بنجمة', names().join('|') === 'الكتف|الصدر|⭐ الطول');
    body.querySelectorAll('button[data-action="move-down"]')[0].click();
    await t.test('3. ▼ على الأول يبدّله مع الثاني ويحفظ الترتيب الجديد كاملاً',
      saves.length === 1 && saves[0].measurementFields.map((f) => f.id).join() === 'b,a,c' && names().join('|') === 'الصدر|الكتف|⭐ الطول');
    body.querySelectorAll('button[data-action="move-up"]')[2].click();
    await t.test('4. ▲ على الأخير يرفعه ويحفظ (b,c,a) ولا يُفقد حقل', saves[1].measurementFields.map((f) => f.id).join() === 'b,c,a' && saves[1].measurementFields.length === 3 && saves[1].measurementFields.find((f) => f.id === 'c').required === true);

    /* نافذة التعديل: خانة «مطلوب» */
    const editBtns = () => Array.from(body.querySelectorAll('button')).filter((b) => b.textContent === '✏️');
    editBtns()[0].click();
    await sleep(60);
    const cb = document.querySelector('.modal input[data-role="field-required"]');
    await t.test('5. نافذة التعديل فيها خانة «مقاس مطلوب» (غير مفعّلة لحقل غير مطلوب)', !!cb && cb.checked === false);
    cb.checked = true;
    document.querySelector('.modal [data-action="save"]').click();
    await sleep(60);
    const last = saves[saves.length - 1].measurementFields;
    await t.test('6. تفعيل المطلوب يُحفظ على الحقل نفسه دون المساس بغيره', last[0].id === 'b' && last[0].required === true && last[1].required === true && last[2].required !== true && last.length === 3);
    editBtns()[0].click();
    await sleep(60);
    const cb2 = document.querySelector('.modal input[data-role="field-required"]');
    await t.test('7. إعادة الفتح تُظهر الخانة مفعّلة', cb2.checked === true);
    cb2.checked = false;
    document.querySelector('.modal [data-action="save"]').click();
    await sleep(60);
    await t.test('8. إلغاء المطلوب يُحفظ', saves[saves.length - 1].measurementFields[0].required === false);

    /* قسم المقاسات في نموذج العميل */
    const ctx = { state: { measurementFields: mk() } };
    const m = buildMeasurementsSection(ctx, { a: 30 });
    document.body.appendChild(m.node);
    const labels = Array.from(m.node.querySelectorAll('label')).map((l) => l.textContent);
    await t.test('9. العنوان يذكر المطلوب والنجمة تظهر على اسم الحقل', /مطلوبة/.test(labels[0]) && labels.some((x) => x.startsWith('⭐ الطول')));
    await t.test('10. getMissing: الطول المطلوب فارغ ← يُرجَع اسمه', m.getMissing().join() === 'الطول');
    const lenInput = m.node.querySelectorAll('input')[2];
    lenInput.value = '0';
    await t.test('11. القيمة صفر لا تكفي', m.getMissing().join() === 'الطول');
    lenInput.value = '145';
    await t.test('12. بعد الإدخال لا نقص (ولا تتأثر القيم)', m.getMissing().length === 0 && m.getValues().c === 145 && m.getValues().a === 30);
    m.node.remove();
    const plain = buildMeasurementsSection({ state: { measurementFields: mk().map((f) => ({ ...f, required: undefined })) } }, {});
    await t.test('13. بلا حقول مطلوبة: العنوان «اختياري» الأصلي ولا نقص', /اختياري/.test(plain.node.querySelector('label').textContent) && plain.getMissing().length === 0);
    const none = buildMeasurementsSection({ state: { measurementFields: [] } }, {});
    await t.test('14. بلا حقول مفعّلة: getMissing موجودة وترجع فارغاً', typeof none.getMissing === 'function' && none.getMissing().length === 0);
    const ctx2 = { state: { measurementFields: [{ id: 'x', name: 'س', enabled: true, required: 'true' }] } };
    await t.test('15. المطلوب يُقبل بقيمة true فقط (نص «true» لا يُفعّله)', buildMeasurementsSection(ctx2, {}).getMissing().length === 0);
  } finally {
    document.querySelectorAll('.modal').forEach((x) => x.remove());
    body.remove();
  }
});
