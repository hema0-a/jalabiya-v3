/* ==========================================================================
   v3532-types-order-hide.test.js — ترتيب أنواع الجلابيات وإخفاؤها مؤقتاً (v3.5.32)
   ========================================================================== */
import { register } from '../registry.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';
import { shareCatalog } from '../../ui/quick-preview-catalog.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function src(rel) {
  try { const r = await fetch(new URL('../../' + rel, import.meta.url)); return r.ok ? await r.text() : ''; } catch (e) { return ''; }
}
const mk = () => [
  { id: 't1', name: 'صيفي', price: 300, notes: 'خفيف', portfolioId: null },
  { id: 't2', name: 'شتوي', price: 450, notes: '', portfolioId: null },
  { id: 't3', name: 'سواريه', price: 600, notes: '', portfolioId: null },
];

register('v3.5.32 أنواع الجلابيات: ترتيب وإخفاء', async (t) => {
  const sec = DATA_SECTIONS.find((s) => s.id === 'jalabiya-types');
  const saves = [];
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    await sec.render(body, { jalabiyaTypes: mk() }, (p) => { saves.push(JSON.parse(JSON.stringify(p))); });
    const ups = () => body.querySelectorAll('button[data-action="move-up"]');
    const downs = () => body.querySelectorAll('button[data-action="move-down"]');
    const tog = () => body.querySelectorAll('button[data-action="toggle-hidden"]');
    await t.test('1. لكل نوع ▲ ▼ وإخفاء، وأول ▲ وآخر ▼ معطّلان فقط',
      ups().length === 3 && downs().length === 3 && tog().length === 3 && ups()[0].disabled && !ups()[1].disabled && downs()[2].disabled && !downs()[1].disabled);
    downs()[0].click();
    await t.test('2. ▼ على الأول يحفظ الترتيب t2,t1,t3 دون فقد حقل', saves.length === 1 && saves[0].jalabiyaTypes.map((x) => x.id).join() === 't2,t1,t3' && saves[0].jalabiyaTypes[1].notes === 'خفيف' && saves[0].jalabiyaTypes[1].price === 300);
    ups()[2].click();
    await t.test('3. ▲ على الأخير يحفظ t2,t3,t1', saves[1].jalabiyaTypes.map((x) => x.id).join() === 't2,t3,t1');
    tog()[0].click();
    const afterHide = saves[2].jalabiyaTypes;
    await t.test('4. الإخفاء يضع hidden=true على النوع نفسه فقط ويحفظ بياناته', afterHide[0].id === 't2' && afterHide[0].hidden === true && afterHide[0].price === 450 && afterHide[1].hidden !== true && afterHide.length === 3);
    await t.test('5. النوع المخفي يظهر باهتاً مع «(مخفي)» وزره 🙈', body.textContent.includes('شتوي (مخفي)') && tog()[0].textContent === '🙈' && tog()[1].textContent === '👁️');
    tog()[0].click();
    await t.test('6. إعادة الضغط تُظهره (hidden=false)', saves[3].jalabiyaTypes[0].hidden === false && !body.textContent.includes('(مخفي)'));

    /* التعديل لا يمسح علامة الإخفاء */
    tog()[1].click();
    const editBtns = () => Array.from(body.querySelectorAll('button')).filter((b) => b.textContent === '✏️');
    editBtns()[1].click();
    await sleep(60);
    document.querySelector('.modal [data-action="save"]').click();
    await sleep(60);
    await t.test('7. تعديل نوع مخفي لا يُظهره ولا يمسح بياناته', saves[saves.length - 1].jalabiyaTypes[1].hidden === true && saves[saves.length - 1].jalabiyaTypes[1].price === 600);
    document.querySelectorAll('.modal').forEach((m) => m.remove());

    /* الكتالوج: المخفي لا يظهر */
    await shareCatalog({ types: [{ id: 'a', name: 'ظاهر', price: 100 }, { id: 'b', name: 'مخفي-نوع', price: 200, hidden: true }] });
    await sleep(120);
    const mtxt = (document.querySelector('.modal') || {}).textContent || '';
    await t.test('8. كتالوج الأسعار يتجاهل المخفي ويُبقي الظاهر', mtxt.includes('ظاهر') && !mtxt.includes('مخفي-نوع'));
    document.querySelectorAll('.modal').forEach((m) => m.remove());

    /* الطلبات: المخفي لا يُقترح */
    const ord = await src('pages/orders.js');
    await t.test('9. الطلبات تستبعد hidden من state.jalabiyaTypes (اقتراح الاسم والسعر)', /state\.jalabiyaTypes = [^;]*t\.hidden !== true/.test(ord));
  } finally {
    document.querySelectorAll('.modal').forEach((x) => x.remove());
    body.remove();
  }
});
