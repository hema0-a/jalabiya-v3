/* ==========================================================================
   v3378-ledger-phase0.test.js — المرحلة 0 من الدفتر المالي: المحرك النقي + محاكي الأجهزة (v3.3.78)
   ========================================================================== */

import { register } from '../registry.js';
import {
  UNITS, ENTRY_TYPES, MAX_DELTA, toMinor, fromMinor, accountKey, validateEntry, nextSeq,
  makeEntry, makeReversal, compareEntries, mergeLedgers, mergeMany, balances, balanceOf,
  checkSpend, isReversed, findAnomalies, compareToLegacy,
} from '../../services/ledger.js';
import { simulate, syncAll, verifyInvariants, verifyMergeLaws, createRng } from '../helpers/ledger-sim.js';

const ctx = (dev, seq, now = 1_700_000_000_000) => ({ dev, seq, now });
const entry = (o = {}) => makeEntry({ unit: 'wallet', acct: 'c1', delta: 1000, type: 'topup', ...o }, ctx(o.dev || 'd1', o.seq ?? 0, o.now));
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

register('v3.3.78 ledger — الوحدات والتحقق', async (t) => {
  t.test('1. toMinor: 12.5 ← 1250 قرشاً', toMinor('wallet', 12.5) === 1250);
  t.test('2. toMinor يتفادى خطأ الفاصلة العائمة (0.1+0.2)', toMinor('wallet', 0.1 + 0.2) === 30);
  t.test('3. نقاط ومخزون: المقاييس', toMinor('points', 7) === 7 && toMinor('stock', 2.5) === 2500);
  t.test('4. fromMinor يعاكس toMinor', fromMinor('wallet', 1250) === 12.5 && fromMinor('stock', 2500) === 2.5);
  t.test('5. وحدة مجهولة وقيمة غير صالحة ترميان',
    throws(() => toMinor('gold', 1)) && throws(() => fromMinor('gold', 1)) && throws(() => toMinor('wallet', NaN)) && throws(() => toMinor('wallet', Infinity)));
  t.test('6. accountKey', accountKey('wallet', 'c1') === 'wallet:c1');
  t.test('7. الوحدات والأنواع مجمَّدة/معرّفة', Object.isFrozen(UNITS) && ENTRY_TYPES.includes('reversal') && ENTRY_TYPES.includes('stock_out'));

  const e = entry();
  t.test('8. سطر سليم: بلا أخطاء، معرّف dev.seq، نسخة 1', validateEntry(e).length === 0 && e.id === 'd1.0' && e.v === 1);
  t.test('9. مفتاح التكرار يصنع معرّفاً k:…', entry({ key: 'award:o1' }).id === 'k:award:o1');
  t.test('10. مقدار صفري يُرفض', throws(() => entry({ delta: 0 })));
  t.test('11. مقدار كسري يُرفض (لا أعداد عشرية في الدفتر)', throws(() => entry({ delta: 10.5 })));
  t.test('12. مقدار أكبر من الحد يُرفض', throws(() => entry({ delta: MAX_DELTA + 1 })));
  t.test('13. نوع ووحدة وحساب مجهولة تُرفض',
    throws(() => entry({ type: 'bonus' })) && throws(() => entry({ unit: 'gold' })) && throws(() => entry({ acct: '' })));
  t.test('14. ملاحظة طويلة تُرفض', throws(() => entry({ note: 'x'.repeat(201) })));
  t.test('15. جهاز/تسلسل غير صالحين يُرفضان',
    throws(() => makeEntry({ unit: 'wallet', acct: 'c1', delta: 5, type: 'topup' }, { dev: '', seq: 0 })) &&
    throws(() => makeEntry({ unit: 'wallet', acct: 'c1', delta: 5, type: 'topup' }, { dev: 'd', seq: -1 })));
  t.test('16. validateEntry لا يرمي لمدخلات سيئة', validateEntry(null).length > 0 && validateEntry('x').length > 0 && validateEntry({}).length > 0);
  t.test('17. ref يُنسخ ولا يشارك المرجع', (() => { const ref = { orderId: 'o1' }; const x = entry({ ref }); ref.orderId = 'zzz'; return x.ref.orderId === 'o1'; })());

  t.test('18. nextSeq: فارغ 0، وبعد أسطر الجهاز max+1 ولا يتأثر بجهاز آخر',
    nextSeq([], 'd1') === 0 && nextSeq([entry({ seq: 0 }), entry({ seq: 4 }), entry({ dev: 'd2', seq: 9 })], 'd1') === 5 && nextSeq(null, 'd1') === 0);
  t.test('19. at من now عند غيابه', entry({ now: 123456 }).at === 123456);
});

register('v3.3.78 ledger — العكس', async (t) => {
  const buy = entry({ delta: -500, type: 'spend', seq: 1 });
  const rev = makeReversal(buy, ctx('d2', 0), 'تراجع');
  t.test('1. العكس يعاكس المقدار ويحمل المرجع ومعرّفاً ثابتاً', rev.delta === 500 && rev.rev === buy.id && rev.id === 'rev:' + buy.id && rev.type === 'reversal');
  t.test('2. نفس الوحدة والحساب', rev.unit === buy.unit && rev.acct === buy.acct);
  t.test('3. لا يُعكس سطر عكس', throws(() => makeReversal(rev, ctx('d2', 1))));
  t.test('4. لا يُعكس سطر غير صالح', throws(() => makeReversal(null, ctx('d2', 1))) && throws(() => makeReversal({ id: 'x' }, ctx('d2', 1))));
  t.test('5. isReversed', isReversed([buy, rev], buy.id) && !isReversed([buy], buy.id) && !isReversed(null, 'x'));
  t.test('6. الرصيد بعد العكس يعود كما كان', balanceOf([entry({ delta: 1000 }), buy, rev], 'wallet', 'c1') === 1000);
  const revB = makeReversal(buy, ctx('d3', 0, 1_700_000_999_999), 'تراجع ثانٍ');
  const m = mergeLedgers([buy, rev], [buy, revB]);
  t.test('7. عكسان من جهازين لنفس السطر يلتحمان في سطر واحد (لا عكس مزدوج)', m.entries.filter((x) => x.type === 'reversal').length === 1);
  t.test('8. ولا تعارض لأن هويتهما المالية واحدة', m.conflicts.length === 0);
  t.test('9. الرصيد بعد الالتحام صحيح (عُكس مرة واحدة)', balanceOf(m.entries, 'wallet', 'c1') === 0);
});

register('v3.3.78 ledger — الدمج والأرصدة', async (t) => {
  const a1 = entry({ seq: 0, delta: 1000 }); const a2 = entry({ seq: 1, delta: -300, type: 'spend', now: 1_700_000_001_000 });
  const b1 = entry({ dev: 'd2', seq: 0, delta: 500, now: 1_700_000_002_000 });
  const m = mergeLedgers([a1, a2], [b1]);
  t.test('1. اتحاد أسطر منفصلة', m.entries.length === 3 && m.fromA === 2 && m.fromB === 1);
  t.test('2. مرتّبة بالترتيب القانوني', m.entries.every((e, i, arr) => i === 0 || compareEntries(arr[i - 1], e) <= 0));
  t.test('3. تبادلية', JSON.stringify(mergeLedgers([b1], [a1, a2]).entries) === JSON.stringify(m.entries));
  t.test('4. idempotent', JSON.stringify(mergeLedgers(m.entries, [a1]).entries) === JSON.stringify(m.entries) && mergeLedgers(m.entries, m.entries).entries.length === 3);
  t.test('5. تداخل: السطر المشترك لا يتكرر', mergeLedgers([a1, a2], [a2, b1]).entries.length === 3);
  t.test('6. لا يعدّل المدخلات', (() => { const A = [a2, a1]; const before = JSON.stringify(A); mergeLedgers(A, [b1]); return JSON.stringify(A) === before; })());
  t.test('7. مدخلات غير مصفوفات آمنة', mergeLedgers(null, undefined).entries.length === 0 && mergeLedgers(undefined, [a1]).entries.length === 1);
  t.test('8. الرصيد = المجموع', balanceOf(m.entries, 'wallet', 'c1') === 1200);
  t.test('9. حسابات ووحدات منفصلة', (() => {
    const pts = entry({ unit: 'points', delta: 7, type: 'award', seq: 5 });
    const other = entry({ acct: 'c2', delta: 9, seq: 6 });
    const b = balances([a1, pts, other]);
    return b.get('wallet:c1').balance === 1000 && b.get('points:c1').balance === 7 && b.get('wallet:c2').balance === 9;
  })());
  t.test('10. بدون سطور ⟵ رصيد 0', balanceOf([], 'wallet', 'x') === 0 && balances(null).size === 0);

  /* تعارض: نفس المعرّف (مفتاح) بمقدارين */
  const k1 = entry({ key: 'award:o9', unit: 'points', type: 'award', delta: 10, dev: 'd1', seq: 7 });
  const k2 = entry({ key: 'award:o9', unit: 'points', type: 'award', delta: 12, dev: 'd2', seq: 3 });
  const c12 = mergeLedgers([k1], [k2]); const c21 = mergeLedgers([k2], [k1]);
  t.test('11. تعارض الهوية المالية يُبلَّغ عنه', c12.conflicts.length === 1 && c12.conflicts[0].id === 'k:award:o9');
  t.test('12. وتُحسم حتمياً وبالنتيجة نفسها على الجهازين', c12.entries.length === 1 && JSON.stringify(c12.entries) === JSON.stringify(c21.entries));
  /* تكرار بمفتاح بنفس المقدار من جهازين: لا تعارض ولا نقاط مزدوجة */
  const same1 = entry({ key: 'award:o1', unit: 'points', type: 'award', delta: 10, dev: 'd1', seq: 0 });
  const same2 = entry({ key: 'award:o1', unit: 'points', type: 'award', delta: 10, dev: 'd2', seq: 0, now: 1_700_000_050_000 });
  const sm = mergeLedgers([same1], [same2]);
  t.test('13. منح النقاط من جهازين بنفس المفتاح يُحتسب مرة واحدة', sm.entries.length === 1 && balanceOf(sm.entries, 'points', 'c1') === 10 && sm.conflicts.length === 0);

  /* أسطر غير صالحة: تُستبعد وتُبلَّغ */
  const bad = { id: 'x1', unit: 'wallet', acct: 'c1', delta: 'abc', type: 'topup' };
  const mr = mergeLedgers([a1, bad], [{ id: 'x2', unit: 'gold', acct: 'c1', delta: 5 }, null]);
  t.test('14. أسطر تالفة لا تدخل الرصيد وتُعاد في rejected', mr.entries.length === 1 && mr.rejected.length === 3 && balanceOf(mr.entries, 'wallet', 'c1') === 1000);
  t.test('15. rejected مستقلة عن الترتيب', JSON.stringify(mergeLedgers([a1], [bad, null]).rejected) === JSON.stringify(mergeLedgers([bad, null], [a1]).rejected));

  /* الصرف */
  t.test('16. checkSpend: يكفي', (() => { const r = checkSpend([a1], 'wallet', 'c1', 600); return r.ok && r.balance === 1000 && r.shortBy === 0; })());
  t.test('17. checkSpend: لا يكفي ويُرجع النقص', (() => { const r = checkSpend([a1], 'wallet', 'c1', 1500); return !r.ok && r.shortBy === 500; })());
  t.test('18. checkSpend: مقدار غير صالح مرفوض', !checkSpend([a1], 'wallet', 'c1', 0).ok && !checkSpend([a1], 'wallet', 'c1', -5).ok && !checkSpend([a1], 'wallet', 'c1', 2.5).ok);
  t.test('19. mergeMany يطابق الدمج المتتالي', JSON.stringify(mergeMany([[a1], [a2], [b1]]).entries) === JSON.stringify(m.entries));
});

register('v3.3.78 ledger — الشذوذات والمقارنة بالقديم', async (t) => {
  const top = entry({ delta: 10000, seq: 0 });
  const s1 = entry({ dev: 'd1', seq: 1, delta: -8000, type: 'spend', now: 1_700_000_010_000 });
  const s2 = entry({ dev: 'd2', seq: 0, delta: -8000, type: 'spend', now: 1_700_000_011_000 });
  /* قرار المستخدم 1: السالب بعد المزامنة مسموح ويُبلَّغ — لا قصّ بصمت */
  const merged = mergeLedgers([top, s1], [top, s2]);
  const bal = balanceOf(merged.entries, 'wallet', 'c1');
  t.test('1. صرفان من جهازين: الرصيد -60 جنيهاً (لا قصّ)', bal === -6000 && merged.entries.length === 3);
  const an = findAnomalies(merged.entries);
  t.test('2. يُبلَّغ بالسالب مع الحساب والمقدار', an.length === 1 && an[0].kind === 'negative_balance' && an[0].acct === 'c1' && an[0].balance === -6000 && an[0].severity === 'warn');
  t.test('3. رسالة عربية واضحة', /سالب/.test(an[0].message) && /المحفظة/.test(an[0].message));
  t.test('4. دفتر سليم بلا شذوذ', findAnomalies([top, s1]).length === 0 && findAnomalies(null).length === 0);

  const orphan = makeReversal(s1, ctx('d3', 0));
  t.test('5. عكس بلا أصل ⟵ info (قد يصل لاحقاً)', (() => { const a = findAnomalies([orphan]); return a.some((x) => x.kind === 'orphan_reversal' && x.severity === 'info'); })());
  t.test('6. عكس مطابق لأصله ⟵ لا شذوذ', findAnomalies([top, s1, orphan]).length === 0);
  const mism = { ...orphan, delta: 7777 };
  t.test('7. عكس لا يطابق أصله ⟵ reversal_mismatch', findAnomalies([top, s1, mism]).some((x) => x.kind === 'reversal_mismatch'));
  const rr = { ...orphan, id: 'rev:rev:x', rev: orphan.id, delta: -orphan.delta };
  t.test('8. عكس لعكس ⟵ reversal_of_reversal', findAnomalies([top, s1, orphan, rr]).some((x) => x.kind === 'reversal_of_reversal'));
  const k1 = entry({ key: 'a', unit: 'points', type: 'award', delta: 5 }); const k2 = entry({ key: 'a', unit: 'points', type: 'award', delta: 6, dev: 'd2' });
  const mc = mergeLedgers([k1], [k2]);
  t.test('9. تعارض المعرّف يظهر في الشذوذات', findAnomalies(mc.entries, mc).some((x) => x.kind === 'id_conflict'));
  const mrj = mergeLedgers([top], [{ id: 'bad' }]);
  t.test('10. السطر التالف يظهر في الشذوذات', findAnomalies(mrj.entries, mrj).some((x) => x.kind === 'invalid_entry'));

  t.test('11. compareToLegacy: لا فروق ⟵ فارغة', compareToLegacy([top], [{ unit: 'wallet', acct: 'c1', balance: 10000 }]).length === 0);
  const diff = compareToLegacy([top, s1], [{ unit: 'wallet', acct: 'c1', balance: 5000 }, { unit: 'points', acct: 'c1', balance: 0 }, { unit: 'wallet', acct: 'c9', balance: 100 }]);
  t.test('12. compareToLegacy: يُظهر الفروق فقط (حساب غير موجود ⟵ دفتر 0)', diff.length === 2 && diff[0].diff === -3000 && diff[1].acct === 'c9' && diff[1].ledger === 0);
  t.test('13. compareToLegacy: مدخلات سيئة آمنة', compareToLegacy(null, null).length === 0 && compareToLegacy([], [null, { unit: 'gold' }]).length === 0);
});

register('v3.3.78 ledger — محاكي الأجهزة', async (t) => {
  /* سيناريو صريح */
  const A = { dev: 'A', entries: [] }; const B = { dev: 'B', entries: [] };
  const top = makeEntry({ unit: 'wallet', acct: 'c1', delta: 10000, type: 'topup' }, ctx('A', 0));
  A.entries.push(top);
  syncAll([A, B]);
  t.test('1. التزامن الأول ينقل الشحن', B.entries.length === 1);
  B.entries.push(makeEntry({ unit: 'wallet', acct: 'c1', delta: -9000, type: 'spend' }, ctx('B', 0, 1_700_000_100_000)));
  A.entries.push(makeEntry({ unit: 'wallet', acct: 'c1', delta: -9000, type: 'spend' }, ctx('A', 1, 1_700_000_100_500)));
  t.test('2. كل جهاز يرى أن الصرف مسموح محلياً', checkSpend([top], 'wallet', 'c1', 9000).ok);
  syncAll([A, B]);
  t.test('3. التقارب بعد المزامنة', JSON.stringify(A.entries) === JSON.stringify(B.entries) && A.entries.length === 3);
  t.test('4. الرصيد -80 جنيهاً مُبلَّغ عنه لا مقصوص', balanceOf(A.entries, 'wallet', 'c1') === -8000 && findAnomalies(A.entries).length === 1);

  /* محاكاة عشوائية بعدة بذور وعدد أجهزة */
  const failures = [];
  let totalEntries = 0; let overdrafts = 0; let refusals = 0; let negativeAccounts = 0; let dedupedKeys = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const devices = 2 + (seed % 4);
    const sim = simulate({ seed, devices, steps: 160, accounts: 3 });
    const laws = verifyMergeLaws(sim.replicas.map((r) => r.entries), seed);
    syncAll(sim.replicas);
    const v = [...laws, ...verifyInvariants(sim)];
    totalEntries += sim.replicas[0].entries.length;
    overdrafts += sim.localOverdrafts;
    refusals += sim.refusals;
    negativeAccounts += findAnomalies(sim.replicas[0].entries).filter((a) => a.kind === 'negative_balance').length;
    dedupedKeys += sim.ops.length - sim.logical.size;
    if (v.length) failures.push('بذرة ' + seed + ' (' + devices + ' أجهزة): ' + v[0]);
  }
  t.test('5. 60 محاكاة (2–5 أجهزة): تقارب + لا فقدان + أرصدة صحيحة + سالب مُبلَّغ + قوانين الدمج' + (failures.length ? ' — ' + failures[0] : ''), failures.length === 0);
  t.test('6. المحاكاة حقيقية: تولّدت مئات الأسطر', totalEntries > 1500);
  t.test('6ب. المحاكاة تُنتج حالات سالبة وتكراراً منطقياً فعلاً (فلا تُختبر الحالات السهلة فقط)', negativeAccounts > 5 && dedupedKeys > 20);
  t.test('7. الفحص المحلي لا يُنتج رصيداً سالباً على جهاز واحد (ورُفض صرف فعلاً في المحاكاة)', overdrafts === 0 && refusals > 50);

  /* المحاكي نفسه يكشف الأخطاء (لا نجاح فارغ) */
  const lww = (x, y) => {
    const lx = x.length ? x[x.length - 1].at : 0; const ly = y.length ? y[y.length - 1].at : 0;
    return (lx >= ly ? x : y).slice();
  };
  const concat = (x, y) => [...x, ...y.filter((e) => !x.includes(e))];
  let lwwCaught = 0; let concatCaught = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s1 = simulate({ seed, devices: 3, steps: 120, merge: lww });
    syncAll(s1.replicas, lww);
    if (verifyInvariants(s1).length) lwwCaught++;
    const s2 = simulate({ seed, devices: 3, steps: 120, merge: concat });
    syncAll(s2.replicas, concat);
    if (verifyInvariants(s2).length) concatCaught++;
  }
  t.test('8. المحاكي يكشف دمج «الأحدث يفوز» (يضيّع حركات) في معظم البذور', lwwCaught >= 8);
  t.test('9. ويكشف الدمج بلا إزالة تكرار (يضاعف الأرصدة/يتباعد) في معظم البذور', concatCaught >= 5);

  /* حجم كبير */
  const big = []; const rng = createRng(7);
  for (let i = 0; i < 5000; i++) big.push(makeEntry({ unit: 'wallet', acct: 'c' + (i % 50), delta: 1 + Math.floor(rng() * 100), type: 'topup' }, ctx('big', i, 1_700_000_000_000 + i)));
  const half1 = big.filter((_, i) => i % 2 === 0); const half2 = big.filter((_, i) => i % 3 === 0);
  const bm = mergeLedgers(half1, half2);
  const expectedIds = new Set([...half1, ...half2].map((e) => e.id));
  t.test('10. 5000 سطر: اتحاد صحيح بلا فقدان أو تكرار', bm.entries.length === expectedIds.size && bm.conflicts.length === 0);
});

register('v3.3.78 ledger — المحرك نقي ومعزول', async (t) => {
  const read = async (p) => { try { const r = await fetch(p); return r.ok ? await r.text() : ''; } catch (e) { return ''; } };
  const src = await read('src/services/ledger.js');
  t.test('1. المحرك نقي: لا استيراد لأي شيء (لا IndexedDB/DOM/شبكة)', src.length > 1000 && !/^\s*import\s/m.test(src) && !/\bdocument\.|\bindexedDB\b|\bfetch\(|\blocalStorage\b|innerHTML/.test(src));
  const main = await read('src/main.js');
  const customers = await read('src/data/repos/customers.js');
  const orders = await read('src/data/repos/orders.js');
  /* المرحلة 1: الوضع الظلّي — المحرك لا يُستورد إلا من ملفات الدفتر نفسها، ولا مسار قراءة من الدفتر في الواجهة القديمة */
  t.test('2. مستودع العملاء يستدعي الكتابة الظلّية فقط (لا المحرك)', main.length > 0 && /ledger-shadow\.js/.test(customers) && !/services\/ledger\.js/.test(customers) && !/ledger/i.test(orders));
});
