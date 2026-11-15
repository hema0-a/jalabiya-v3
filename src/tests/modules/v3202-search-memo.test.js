/* ==========================================================================
   v3202-search-memo.test.js — تسريع البحث بحفظ النص المطبَّع مع كل سجل (v3.20.2)
   ==========================================================================
   الشرط الحاكم: النتائج مطابقة حرفياً للتطبيع المباشر. فالاختبارات تقارن النسخة المسرَّعة بمرجع «ساذج» يطبّق
   normalizeSearch/phoneMatches القديمة مباشرة على كل سجل، على قيم عشوائية ومئات توليفات الهواتف والاستعلامات.
   ========================================================================== */
import { register } from '../registry.js';
import { normalizeSearch, phoneMatches, preparePhone, phoneMatchesPrepared, toLatinDigits } from '../../core/utils.js';
import { nz, ph, nzItems, searchAll, clearSearchCache } from '../../data/search.js';
import { customers } from '../../data/repos/customers.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();

/* phoneMatches كما كانت قبل v3.20.2 (مرجع التكافؤ) */
function legacyPhoneMatches(phone, query) {
  const q = toLatinDigits(query).replace(/\D/g, '');
  if (!q) return false;
  let p = toLatinDigits(phone).replace(/\D/g, '');
  if (!p) return false;
  if (p.startsWith('00')) p = p.slice(2);
  if (p.includes(q)) return true;
  if (q.length < 8) return false;
  const national = (x) => { let y = x.replace(/^00/, ''); if (y.startsWith('20') && y.length >= 11) y = y.slice(2); return y.replace(/^0/, ''); };
  return national(p).includes(national(q));
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

register('v3.20.2 تسريع البحث: نص مطبَّع محفوظ مع السجل، والنتائج مطابقة', async (t) => {
  /* ---- التطبيع المحفوظ ---- */
  const chars = ['أ', 'إ', 'آ', 'ا', 'ى', 'ي', 'ة', 'ه', 'ؤ', 'ئ', 'ٌ', 'ـ', ' ', '  ', '٣', '٠', '۵', 'a', 'B', 'ح', 'م', 'د', 'س', '1', '-', '+'];
  const r = rng(2026);
  const rnd = () => Array.from({ length: Math.floor(r() * 14) }, () => chars[Math.floor(r() * chars.length)]).join('');
  await t.test('1. nz ≡ normalizeSearch على 2000 نص عشوائي (عربي/هندي/تشكيل/مسافات)', (() => { for (let i = 0; i < 2000; i++) { const s = rnd(); const rec = {}; if (nz(rec, 'f', s) !== normalizeSearch(s) || nz(rec, 'f', s) !== normalizeSearch(s)) return false; } return true; })());
  await t.test('2. تغيّر قيمة الحقل في الكائن نفسه يُعاد تطبيعه (لا نتيجة قديمة)', (() => { const rec = { name: 'أَحمد' }; const a = nz(rec, 'name', rec.name); rec.name = 'فاطمة'; const b = nz(rec, 'name', rec.name); return a === 'احمد' && b === 'فاطمه'; })());
  await t.test('3. حقول مختلفة في السجل نفسه لا تتداخل، وغير الكائن يعمل (null/نص/رقم)', (() => { const rec = {}; return nz(rec, 'a', 'ة') === 'ه' && nz(rec, 'b', 'ى') === 'ي' && nz(rec, 'a', 'ة') === 'ه' && nz(null, 'x', 'أ') === 'ا' && nz('نص', 'x', 'ى') === 'ي' && nz(rec, 'n', 150) === '150' && nz(rec, 'u', undefined) === ''; })());
  await t.test('4. nzItems: نص البنود المطبَّع ويُحدَّث فقط إن تغيّرت المصفوفة', (() => { const o = { items: [{ name: 'جلابيّة' }, { name: 'عباءة' }] }; const a = nzItems(o); o.items = [{ name: 'قميص' }]; const b = nzItems(o); const c = nzItems({}); return a === normalizeSearch('جلابيّة عباءة') && b === 'قميص' && c === '' && nzItems({ items: [null, { name: 'ة' }] }) === normalizeSearch(' ة'); })());

  /* ---- الهاتف المجهَّز ---- */
  const phones = ['01012345678', '+201012345678', '00201012345678', '0020 10 1234 5678', '010-1234-5678', '٠١٠١٢٣٤٥٦٧٨', '1012345678', '01122223333', '+20 112 222 3333', '0000123456789', '', null, undefined, 'abc', '+', '0020', '00', '2011222333'];
  const queries = ['0', '01', '010', '10', '012', '0101', '1234', '5678', '01012345678', '+201012345678', '201012345678', '1012345678', '٠١٠١', '0020', '00201012345678', '01122223333', '1122223333', '', ' ', 'abc', '+20', '20', '2223333', '011222', '12345678', '0001', '0000123456789'];
  await t.test('5. التكافؤ: phoneMatchesPrepared ≡ phoneMatches القديمة على ' + phones.length * queries.length + ' توليفة هاتف×استعلام', (() => { for (const p of phones) { const prep = preparePhone(p); for (const q of queries) { const a = legacyPhoneMatches(p, q); if (phoneMatchesPrepared(prep, q) !== a || phoneMatches(p, q) !== a) return false; } } return true; })());
  await t.test('6. ph (المحفوظ) ≡ المرجع، ويتتبّع تغيّر الهاتف في السجل نفسه', (() => { const rec = { phone: '01012345678' }; const a = ph(rec, 'phone', rec.phone, '5678'); rec.phone = '01199990000'; const b = ph(rec, 'phone', rec.phone, '5678'); const c = ph(rec, 'phone', rec.phone, '9999'); return a === true && b === false && c === true && ph(null, 'p', '0101', '0101') === true; })());
  await t.test('7. هواتف عشوائية 3000 توليفة تتطابق مع المرجع', (() => { const r2 = rng(77); const d = () => String(Math.floor(r2() * 1e11)).padStart(11, '0'); for (let i = 0; i < 3000; i++) { const p = ['', '+20', '0020', '+', '٠'][Math.floor(r2() * 5)] + d(); const q = String(Math.floor(r2() * 1e10)).slice(0, 2 + Math.floor(r2() * 9)); if (phoneMatchesPrepared(preparePhone(p), q) !== legacyPhoneMatches(p, q)) return false; } return true; })());

  /* ---- searchAll مقابل مرجع ساذج على بيانات حقيقية ---- */
  const tag = 'مرجع' + Math.floor(Math.random() * 1e6);
  const names = [tag + ' محمد علي', tag + ' أحمد حسن', tag + ' فاطمة', tag + ' إبراهيم السيد', tag + ' سعيد'];
  const cs = [];
  for (let i = 0; i < names.length; i++) cs.push(await customers.create({ name: names[i], phone: ['01012345678', '+201122223333', '0020 10 5555 6666', '', '٠١٢٧٧٧٧٨٨٨٨'][i] }));
  const os = [];
  for (let i = 0; i < 6; i++) os.push(await orders.create({ customerId: cs[i % cs.length].id, status: 'pending', amount: 400 + i, notes: i % 2 ? 'قصة صعيدي كبيرة ' + tag : '', items: [{ name: i % 3 ? 'جلابية' : 'عباءة', price: 400, quantity: 1 }], dueDate: Date.now() + i * 86400000 }));
  for (let i = 0; i < 5; i++) await payments.create({ orderId: os[i].id, customerId: cs[i % cs.length].id, amount: 100 + i * 25, notes: i % 2 ? 'دفعة ' + tag : '' });
  clearSearchCache();
  const [allC, allO, allP] = await Promise.all([customers.list(), orders.list(), payments.list()]);
  const custMap = {}; allC.forEach((c) => { custMap[c.id] = c; });
  const refIds = (q0) => {
    const q = normalizeSearch(q0);
    const c = allC.filter((x) => normalizeSearch(x.name).includes(q) || legacyPhoneMatches(x.phone, q)).map((x) => x.id);
    const o = allO.filter((x) => { const cu = custMap[x.customerId]; const items = Array.isArray(x.items) ? x.items.map((it) => (it && it.name) || '').join(' ') : ''; return normalizeSearch(cu ? cu.name : '').includes(q) || normalizeSearch(x.notes || '').includes(q) || normalizeSearch(items).includes(q) || legacyPhoneMatches(cu && cu.phone, q); }).map((x) => x.id);
    const p = allP.filter((x) => { const cu = custMap[x.customerId]; return normalizeSearch(cu ? cu.name : '').includes(q) || normalizeSearch(x.amount).includes(q) || normalizeSearch(x.notes).includes(q); }).map((x) => x.id);
    return { c: c.sort(), o: o.sort(), p: p.sort() };
  };
  const qs = [tag, tag + ' محمد', 'احمد', 'فاطمه', 'ابراهيم السيد', 'محمد', 'مرجع', '0101234', '+201122223333', '1122223333', '٠١٠٥٥٥٥', '5555 6666', 'قصه صعيدي', 'عباءه', 'جلابيه', 'دفعه ' + tag, '125', '٢٥', 'zz', '01', 'سعيد'];
  const same = async (q) => { const a = await searchAll(q); const b = refIds(q); const ids = (arr) => arr.map((x) => x.id).sort(); return JSON.stringify([ids(a.customers), ids(a.orders), ids(a.payments)]) === JSON.stringify([b.c, b.o, b.p]); };
  let allSame = true; const bad = [];
  for (const q of qs) { if (!(await same(q))) { allSame = false; bad.push(q); } }
  await t.test('8. searchAll (مسرَّع) ≡ مرجع ساذج على ' + qs.length + ' استعلاماً (عملاء + طلبات + دفعات)' + (bad.length ? ' — مخالف: ' + bad.join(' | ') : ''), allSame);
  await t.test('9. البحث المكرَّر (من الكاش والنص المحفوظ) يعطي النتيجة نفسها', (async () => { const a = JSON.stringify(await searchAll(tag)); const b = JSON.stringify(await searchAll(tag)); return a === b; })());
  await t.test('10. تعديل سجل يظهر فوراً (الكاش يُبطَل والنص المحفوظ لا يبقى للقديم)', (async () => { const c = cs[2]; await customers.update(c.id, { name: tag + ' اسم جديد تماما' }); const a = await searchAll('اسم جديد تماما'); const old = await searchAll(tag + ' فاطمة'); return a.customers.some((x) => x.id === c.id) && !old.customers.some((x) => x.id === c.id); })());

  /* ---- عقد المصدر ---- */
  const ss = await src('data/search.js'); const uu = await src('core/utils.js');
  await t.test('11. search.js: لا تطبيع مباشر لكل سجل (nz/ph/nzItems) ولا فهرس عكسي يغيّر معنى البحث', !/normalizeSearch\((?:c|o|p|i|w|e|g|l|r)\./.test(ss) && ss.includes('nzItems(o).includes(q)') && ss.includes("ph(c, 'phone', c.phone, q)") && ss.includes('لم نبنِ فهرساً عكسياً عمداً'));
  await t.test('12. phoneMatches غلاف رقيق فوق النسخة المجهَّزة (معنى واحد في مكان واحد)', uu.includes('return phoneMatchesPrepared(preparePhone(phone), query);'));
});
