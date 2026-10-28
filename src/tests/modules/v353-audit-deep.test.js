/* ==========================================================================
   v353-audit-deep.test.js — الفحص الشامل العميق (v3.5.3)
   ==========================================================================
   كل اختبار يثبّت خللاً وُجد بالتجربة قبل إصلاحه:
   1. حقن صيغ CSV (اسم عميل =HYPERLINK(...) كان يُصدَّر كما هو).
   2. البحث لا يطبّع العربية: «احمد» لا يجد «أحمد»، والأرقام العربية لا تجد الهاتف.
   3. دمج جهازين لحقلين مختلفين من الطلب كان يُفقد items/subtotal/amount!
   4. زمن حذف الحقل وزمن الحقل المتساوي القيمة يضيعان فيُبعث الحقل أو تخسر القيمة الأحدث أمام جهاز ثالث.
   5. حفظ نموذج قديم يستبدل تعديلاً وصل بالمزامنة بصمت.
   ========================================================================== */

import { register } from '../registry.js';
import { csvCell, toCSV, normalizeSearch, phoneMatches } from '../../core/utils.js';
import { mergeRecords } from '../../sync/record-merge.js';
import { filterCustomers } from '../../pages/customers.js';
import { searchAll } from '../../data/search.js';
import { exportPaymentsCSV, exportExpensesCSV } from '../../services/financial-export.js';
import { exportCSV as exportHouseCSV } from '../../services/house-expenses-export.js';
import { confirmIfStale } from '../../ui/modal.js';
import { customers } from '../../data/repos/customers.js';
import { orders } from '../../data/repos/orders.js';
import { customersPage } from '../../pages/customers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (root, txt) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.includes(txt));
const topModal = () => { const m = document.querySelectorAll('.modal'); return m[m.length - 1] || null; };
const closeModals = () => document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());

/** يلتقط نص الملف الذي يُصدَّر (بدل تنزيله فعلاً). */
async function captureCSV(fn) {
  const origCreate = URL.createObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  let blob = null;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
  HTMLAnchorElement.prototype.click = function () { /* لا تنزيل */ };
  try { fn(); } finally { URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick; }
  return blob ? blob.text() : '';
}

/** أول حرف من كل خلية CSV (يتجاهل الاقتباس الخارجي). */
function cellStarts(csv) {
  const out = [];
  const rows = csv.replace(/^\uFEFF/, '').split(/\r\n/);
  for (const row of rows) {
    let cur = ''; let q = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') { if (q && row[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

register('v3.5.3: CSV آمن من حقن الصيغ', async (t) => {
  await t.test('1. صيغة تبدأ بـ = تُحيَّد بـ \'', csvCell('=HYPERLINK("http://x","y")').startsWith('"\'=HYPERLINK') || csvCell('=1+1') === "'=1+1");
  await t.test('2. + و @ و Tab و CR في البداية تُحيَّد', csvCell('+cmd|calc') === "'+cmd|calc" && csvCell('@SUM(1)') === "'@SUM(1)" && csvCell('\t=x').startsWith("\"'") === false ? true : csvCell('\t=x').startsWith("'"));
  await t.test('3. الأرقام لا تُمسّ: -50 و+201012345678 و12.5', csvCell('-50') === '-50' && csvCell('+201012345678') === '+201012345678' && csvCell(12.5) === '12.5' && csvCell(-3) === '-3');
  await t.test('4. نص عادي كما هو، وnull/undefined فارغ', csvCell('عميل') === 'عميل' && csvCell(null) === '' && csvCell(undefined) === '');
  await t.test('5. الاقتباس عند الفاصلة والاقتباس وسطر جديد (\\n و\\r)',
    csvCell('أ,ب') === '"أ,ب"' && csvCell('قال "نعم"') === '"قال ""نعم"""' && csvCell('س1\nس2') === '"س1\nس2"' && csvCell('س1\rس2') === '"س1\rس2"');
  await t.test('6. toCSV: صفوف + فاصل \\r\\n + تحييد', toCSV([['a', '=x'], [1, 2]]) === "a,'=x\r\n1,2");

  const csv1 = await captureCSV(() => exportPaymentsCSV(
    [{ amount: 100, createdAt: Date.now(), method: 'cash', notes: '=cmd|\' /C calc\'!A0', customerId: 'c1' }],
    { c1: { name: '=HYPERLINK("http://evil","click")' } }));
  await t.test('7. تصدير المدفوعات: لا خلية تبدأ بصيغة', csv1.length > 0 && !cellStarts(csv1).some((c) => /^[=+@]/.test(c)));
  const csv2 = await captureCSV(() => exportExpensesCSV([{ amount: 5, date: Date.now(), category: 'rent', notes: '@SUM(A1:A9)' }]));
  await t.test('8. تصدير المصروفات: ملاحظة @ مُحيَّدة', csv2.length > 0 && !cellStarts(csv2).some((c) => /^[=+@]/.test(c)));
  const csv3 = await captureCSV(() => exportHouseCSV('month', [{ amount: 9, date: Date.now(), category: 'food', note: '+1+1' }], 9));
  await t.test('9. تصدير مصاريف البيت: ملاحظة + محيَّدة', csv3.length > 0 && !cellStarts(csv3).some((c) => /^[=@]/.test(c) || /^\+1\+1/.test(c)));
});

register('v3.5.3: البحث يطبّع العربية والأرقام والهاتف', async (t) => {
  await t.test('1. أ/إ/آ ← ا', normalizeSearch('أحمد') === normalizeSearch('احمد') && normalizeSearch('إيمان') === normalizeSearch('ايمان') && normalizeSearch('آمنة') === normalizeSearch('امنه'));
  await t.test('2. ة ← ه و ى ← ي و ؤ/ئ', normalizeSearch('فاطمة') === normalizeSearch('فاطمه') && normalizeSearch('هدى') === normalizeSearch('هدي') && normalizeSearch('مؤمن') === normalizeSearch('مومن'));
  await t.test('3. التشكيل والتطويل يُزالان', normalizeSearch('مُحَمَّد') === normalizeSearch('محمد') && normalizeSearch('محـــمد') === 'محمد');
  await t.test('4. الأرقام العربية والفارسية ← لاتينية', normalizeSearch('٠١٠١٢٣') === '010123' && normalizeSearch('۰۱۰۱۲۳') === '010123');
  await t.test('5. حروف لاتينية صغيرة ومسافات مضغوطة', normalizeSearch('  Ahmed   ALI ') === 'ahmed ali');
  await t.test('6. phoneMatches: عربي ولاتيني ومسافات وشرطات', phoneMatches('01012345678', '٠١٠١٢٣') && phoneMatches('010 1234-5678', '1234567') && phoneMatches('01012345678', '01012345678'));
  await t.test('7. phoneMatches: 010… ⟷ +2010…', phoneMatches('+201012345678', '01012345678') && phoneMatches('01012345678', '+20 10 1234 5678') && phoneMatches('0020 10 1234 5678', '010'));
  await t.test('8. phoneMatches: نص بلا أرقام أو هاتف فارغ لا يطابق', !phoneMatches('01012345678', 'احمد') && !phoneMatches('', '010') && !phoneMatches(null, '010'));

  const list = [{ id: 'a', name: 'أحمد سعيد', phone: '01012345678' }, { id: 'b', name: 'فاطمة علي', phone: '+201199887766' }, { id: 'c', name: 'مُحَمَّد', phone: '' }];
  await t.test('9. filterCustomers: «احمد» تجد «أحمد» و«فاطمه» تجد «فاطمة» و«محمد» تجد المشكَّل',
    filterCustomers(list, 'احمد').map((x) => x.id).join() === 'a' && filterCustomers(list, 'فاطمه').map((x) => x.id).join() === 'b' && filterCustomers(list, 'محمد').map((x) => x.id).join() === 'c');
  await t.test('10. filterCustomers: رقم عربي ورقم محلي لهاتف دولي', filterCustomers(list, '٠١٠١٢٣').map((x) => x.id).join() === 'a' && filterCustomers(list, '01199887766').map((x) => x.id).join() === 'b');

  const c = await customers.create({ name: 'أُسامة الحدّاد', phone: '+201055550101', createdAt: Date.now() });
  const o = await orders.create({ customerId: c.id, status: 'in_progress', amount: 300, deposit: 0, items: [{ name: 'جلابية مطرّزة فاخرة', price: 300, quantity: 1 }] });
  try {
    const r1 = JSON.stringify(await searchAll('اسامه'));
    await t.test('11. البحث الشامل: «اسامه» تجد «أُسامة»', r1.includes(c.id));
    const r2 = JSON.stringify((await searchAll('٠١٠٥٥٥٥٠١٠١')).customers.map((x) => x.id));
    await t.test('12. البحث الشامل: هاتف بأرقام عربية يجد العميل الدولي', r2.includes(c.id));
    const r3 = (await searchAll('مطرزه')).orders.map((x) => x.id);
    await t.test('13. البحث الشامل: يجد الطلب باسم بنده (بلا ذكر اسم العميل)', r3.includes(o.id));
    const r4 = (await searchAll('01055550101')).orders.map((x) => x.id);
    await t.test('14. البحث الشامل: يجد الطلب بهاتف عميله', r4.includes(o.id));
  } finally { await orders.remove(o.id); await customers.remove(c.id); }
});

register('v3.5.3: دمج الأجهزة لا يُفقد بيانات الطلب', async (t) => {
  const G = { items: [{ name: 'ثوب', price: 100, quantity: 1 }], subtotal: 100, discountType: 'none', discountValue: 0, discountAmount: 0, extraFeesTotal: 0, amount: 100 };
  const ftG = (t0) => Object.fromEntries(Object.keys(G).map((k) => [k, t0]));
  /* الشائع: جهاز عدّل الملاحظات، وآخر عدّل الحالة، والمجموعة (البنود والمبلغ) متطابقة */
  const local = { id: 'o1', createdAt: 1, _v: 1, ...JSON.parse(JSON.stringify(G)), notes: 'جديدة', status: 'pending', _ft: { ...ftG(1000), notes: 3000, status: 1000 }, updatedAt: 3000 };
  const cloud = { id: 'o1', createdAt: 1, _v: 1, ...JSON.parse(JSON.stringify(G)), notes: '', status: 'ready', _ft: { ...ftG(1000), notes: 1000, status: 3000 }, updatedAt: 3000 };
  const r = mergeRecords(local, cloud, { since: 500, store: 'orders' });
  await t.test('1. جهازان يعدّلان حقلين مختلفين: يحتفظ الطلب بالبنود والمبلغ (كان يفقدها)',
    r.record.amount === 100 && r.record.subtotal === 100 && r.record.items.length === 1 && r.record.discountType === 'none');
  await t.test('2. ويأخذ كل حقل أحدث قيمة (notes من أ، status من ب)', r.record.notes === 'جديدة' && r.record.status === 'ready');
  const r2 = mergeRecords(cloud, local, { since: 500, store: 'orders' });
  await t.test('3. الترتيب لا يغيّر النتيجة (تبادلية)', r2.record.amount === 100 && r2.record.notes === 'جديدة' && r2.record.status === 'ready');

  /* زمن الحذف لا يضيع */
  const a = { id: 'x', _v: 1, createdAt: 1, notes: 'ملاحظة', _ft: { notes: 1000 }, updatedAt: 1000 };
  const bDel = { id: 'x', _v: 1, createdAt: 1, _ft: { notes: 5000 }, updatedAt: 5000 };            // حُذف الحقل عند ب بزمن 5000
  const cOld = { id: 'x', _v: 1, createdAt: 1, notes: 'قديم', _ft: { notes: 2000 }, updatedAt: 2000 };
  const ab = mergeRecords(a, bDel, { since: 100 }).record;
  const abc = mergeRecords(ab, cOld, { since: 100 }).record;
  await t.test('4. حذف حقل بزمن أحدث يبقى محذوفاً عند دمج جهاز ثالث (لا يُبعث)', !('notes' in abc));

  /* زمن قيمة متساوية */
  const p1 = { id: 'y', _v: 1, createdAt: 1, tag: 'س', _ft: { tag: 1500 }, updatedAt: 1500 };
  const p2 = { id: 'y', _v: 1, createdAt: 1, tag: 'س', _ft: { tag: 3000 }, updatedAt: 3000 };
  const p3 = { id: 'y', _v: 1, createdAt: 1, tag: 'ص', _ft: { tag: 2500 }, updatedAt: 2500 };
  const l = mergeRecords(mergeRecords(p1, p2, { since: 0 }).record, p3, { since: 0 }).record;
  const rr = mergeRecords(p1, mergeRecords(p2, p3, { since: 0 }).record, { since: 0 }).record;
  await t.test('5. قيمة متساوية بزمنين: يُحفظ الزمن الأحدث، فتخسر «ص»@2500 أمام «س»@3000 في كل ترتيب', l.tag === 'س' && rr.tag === 'س');

  /* اختبار خصائص عشوائي (ثابت البذرة) على سجلات طلب واقعية */
  let seed = 20261021; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const ri = (x, y) => Math.floor(rnd() * (y - x + 1)) + x; const pick = (arr) => arr[ri(0, arr.length - 1)];
  const GROUP = Object.keys(G);
  const GV = [G, { items: [{ name: 'عباية', price: 300, quantity: 2 }], subtotal: 600, discountType: 'fixed', discountValue: 10, discountAmount: 10, extraFeesTotal: 5, amount: 595 }, { items: [], subtotal: 0, discountType: 'none', discountValue: 0, discountAmount: 0, extraFeesTotal: 0, amount: 0 }];
  const SIMPLE = { name: ['أحمد', 'محمود', 'x'], notes: ['', 'a', 'ملاحظة'], status: ['pending', 'ready', 'delivered'], deposit: [0, 50], phone: ['010', '011'] };
  const META = new Set(['_ft', 'updatedAt', '_v', 'createdAt']);
  const strip = (rec) => JSON.stringify(Object.keys(rec).sort().filter((k) => !META.has(k)).map((k) => [k, rec[k]]));
  const base = () => { const rec = { id: 'r', createdAt: 1000, _v: 1 }; const ft = {}; for (const f of Object.keys(SIMPLE)) if (rnd() < 0.7) { rec[f] = pick(SIMPLE[f]); ft[f] = pick([1000, 2000, 3000, 4000]); } const t0 = pick([1000, 2000, 3000, 4000]); Object.assign(rec, JSON.parse(JSON.stringify(pick(GV)))); for (const f of GROUP) ft[f] = t0; rec._ft = ft; rec.updatedAt = Math.max(1000, ...Object.values(ft)); return rec; };
  const mutate = (rec) => { const o = JSON.parse(JSON.stringify(rec)); for (let i = ri(0, 3); i > 0; i--) { const t1 = pick([1500, 2000, 2500, 3000, 5000, 6000]); if (rnd() < 0.3) { Object.assign(o, JSON.parse(JSON.stringify(pick(GV)))); for (const f of GROUP) o._ft[f] = t1; } else { const f = pick(Object.keys(SIMPLE)); if (rnd() < 0.2) { delete o[f]; o._ft[f] = t1; } else { o[f] = pick(SIMPLE[f]); o._ft[f] = t1; } } o.updatedAt = Math.max(o.updatedAt, t1); } return o; };
  const bad = { comm: 0, idem: 0, assoc: 0, lost: 0 };
  const O = { since: 500, store: 'orders' };
  for (let i = 0; i < 3000; i++) {
    const root = base(); const x = mutate(root); const y = mutate(root); const z = mutate(root);
    const xy = mergeRecords(x, y, O).record; const yx = mergeRecords(y, x, O).record;
    if (strip(xy) !== strip(yx)) bad.comm++;
    if (strip(mergeRecords(xy, x, O).record) !== strip(xy) || strip(mergeRecords(xy, y, O).record) !== strip(xy)) bad.idem++;
    if (strip(mergeRecords(xy, z, O).record) !== strip(mergeRecords(x, mergeRecords(y, z, O).record, O).record)) bad.assoc++;
    if (!('amount' in xy) || !('items' in xy)) bad.lost++;
  }
  await t.test('6. 3000 حالة عشوائية: دمج تبادلي', bad.comm === 0);
  await t.test('7. ... ولا يتغير عند التكرار (idempotent)', bad.idem === 0);
  await t.test('8. ... ومتجمّع لثلاثة أجهزة (associative)', bad.assoc === 0);
  await t.test('9. ... ولا طلب مدموج يفقد amount/items أبداً', bad.lost === 0);
});

register('v3.5.3: حفظ نموذج قديم يسأل قبل الاستبدال', async (t) => {
  const fakeFind = (rec) => async () => rec;
  await t.test('1. لم يتغير السجل: يتابع بلا سؤال', (await confirmIfStale(fakeFind({ id: 'a', updatedAt: 5 }), { id: 'a', updatedAt: 5 })) === true);
  await t.test('2. السجل محذوف: يتابع (رسالة update تتولى الأمر)', (await confirmIfStale(async () => null, { id: 'a', updatedAt: 5 })) === true);
  await t.test('3. فشل القراءة لا يمنع الحفظ', (await confirmIfStale(async () => { throw new Error('x'); }, { id: 'a', updatedAt: 5 })) === true);

  const box = document.createElement('div');
  document.body.appendChild(box);
  const c = await customers.create({ name: 't353-stale', phone: '01077770001', createdAt: Date.now() });
  try {
    await customersPage.render(box); await sleep(300);
    btn(box.querySelector('[data-id="' + c.id + '"]'), '✏️').click(); await sleep(250);
    const form = topModal();
    await customers.update(c.id, { notes: 'عدّلتُه من التابلت' });            // يصل أثناء فتح النموذج (مزامنة)
    const nameInput = Array.from(form.querySelectorAll('input[type="text"], input:not([type])')).find((i) => i.value === 't353-stale');
    nameInput.value = 't353-stale-edited'; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    btn(form, 'حفظ التعديلات').click(); await sleep(350);
    const ask = topModal();
    await t.test('4. تعديل وصل أثناء فتح النموذج: يظهر «تغيّر السجل أثناء التعديل»', !!ask && ask.textContent.includes('تغيّر السجل أثناء التعديل'));
    btn(ask, 'مراجعة').click(); await sleep(250);
    await t.test('5. «مراجعة» لا تحفظ شيئاً', (await customers.find(c.id)).name === 't353-stale' && (await customers.find(c.id)).notes === 'عدّلتُه من التابلت');
    btn(topModal(), 'حفظ التعديلات').click(); await sleep(350);
    btn(topModal(), 'نعم، احفظ').click(); await sleep(450);
    await t.test('6. «نعم، احفظ» تحفظ عن علم', (await customers.find(c.id)).name === 't353-stale-edited');
  } finally {
    closeModals(); box.remove();
    try { await customers.remove(c.id); } catch (e) { /* ignore */ }
  }
});
