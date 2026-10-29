/* ==========================================================================
   v3365-record-merge.test.js — دمج المزامنة على مستوى الحقول + سجل التعارضات (v3.3.65)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import * as fsync from '../../sync/firestore-sync.js';
import { mergeRecords, ATOMIC_GROUPS } from '../../sync/record-merge.js';
import { stampForWrite, deepEqual } from '../../data/record-meta.js';
import {
  recordConflicts, getConflicts, countConflicts, removeConflict, clearConflicts, restoreLosingValue, previewValue, fieldLabel,
} from '../../sync/conflict-log.js';
import { cloudSyncPage } from '../../pages/cloud-sync.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ينتظر حتى يُرجع fn قيمة صادقة (حتى ms) — بدل sleep ثابت يتذبذب تحت الضغط. */
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) { /* ignore */ } await sleep(20); }
  return null;
}

/** تعديل جهاز: يطبّق patch على سجل كما يفعل idb.put (ختم الأزمنة). */
function edit(rec, patch, at) {
  return stampForWrite('customers', rec, { ...rec, ...patch, updatedAt: at }, at);
}
const data = (r) => { const { id, createdAt, updatedAt, _v, _ft, _fb, ...rest } = r; return rest; };

register('v3.3.65 field merge (pure)', async (t) => {
  const base = { id: 'c1', name: 'أحمد', phone: '010', address: 'القاهرة', createdAt: 10, updatedAt: 100 };

  /* 1) متطابقان */
  const same = mergeRecords(base, { ...base, updatedAt: 120 });
  await t.test('1. بيانات متطابقة: dataDiffers=false والنتيجة الأحدث، بلا تعارضات',
    same.dataDiffers === false && same.record.updatedAt === 120 && same.conflicts.length === 0);

  /* 2) حقلان مختلفان على جهازين */
  const A = edit(base, { phone: '011' }, 200);
  const B = edit(base, { address: 'الجيزة' }, 300);
  const m = mergeRecords(A, B, { since: 150, store: 'customers' });
  await t.test('2. تعديلان على حقلين مختلفين يجتمعان في سجل واحد بلا تعارض',
    m.source === 'merged' && m.record.phone === '011' && m.record.address === 'الجيزة' && m.record.name === 'أحمد' && m.conflicts.length === 0);
  await t.test('3. السجل المركّب أحدث من الطرفين (+1) بأزمنة حقول كاملة وبنفس id/نسخة المخطط',
    m.record.updatedAt === 301 && m.record.id === 'c1' && m.record._v === 1 && m.record._ft.phone === 200 && m.record._ft.address === 300 && m.record._ft.name === 100);

  /* 3) الحقل نفسه */
  const B2 = edit(base, { phone: '012' }, 300);
  const c1 = mergeRecords(A, B2, { since: 150, store: 'customers' });
  await t.test('4. الحقل نفسه على الجهازين بعد آخر مزامنة: الأحدث يفوز + تعارض مسجَّل بالقيمتين',
    c1.record.phone === '012' && c1.conflicts.length === 1 && c1.conflicts[0].field === 'phone'
    && c1.conflicts[0].localValue === '011' && c1.conflicts[0].cloudValue === '012' && c1.conflicts[0].winner === 'cloud');
  const c2 = mergeRecords(A, B2, { since: 250, store: 'customers' });
  await t.test('5. إن كان تعديل أحد الطرفين قبل آخر مزامنة: لا تعارض (الأحدث يفوز فقط)', c2.conflicts.length === 0 && c2.record.phone === '012');
  const c3 = mergeRecords(A, B2, { store: 'customers' });
  await t.test('6. بلا since (أول مزامنة): لا تعارضات', c3.conflicts.length === 0);
  const c4 = mergeRecords(A, edit(base, { phone: '011' }, 300), { since: 150 });
  await t.test('7. الحقل نفسه بالقيمة نفسها على الجهازين: ليس تعارضاً', c4.conflicts.length === 0);

  /* 4) تبادلية + idempotent */
  const cases = [[A, B], [A, B2], [B, B2], [edit(A, { name: 'x' }, 400), B]];
  const comm = cases.every(([x, y]) => deepEqual(mergeRecords(x, y, { since: 50 }).record, mergeRecords(y, x, { since: 50 }).record));
  await t.test('8. التبادلية: merge(a,b) = merge(b,a) كاملاً (يتقارب الجهازان)', comm);
  const idem = cases.every(([x, y]) => {
    const r = mergeRecords(x, y).record;
    return deepEqual(data(mergeRecords(r, x).record), data(r)) && deepEqual(data(mergeRecords(r, y).record), data(r)) && deepEqual(data(mergeRecords(r, r).record), data(r));
  });
  await t.test('9. Idempotent: دمج النتيجة مع أي من الأصلين لا يغيّر البيانات', idem);

  /* 5) تعادل تام */
  const T1 = { ...base, phone: 'aaa', updatedAt: 200, _ft: { phone: 200 }, _fb: 100 };
  const T2 = { ...base, phone: 'bbb', updatedAt: 200, _ft: { phone: 200 }, _fb: 100 };
  await t.test('10. تعادل زمن الحقل بقيمتين: ترجيح ثابت متماثل على الجهازين',
    mergeRecords(T1, T2).record.phone === mergeRecords(T2, T1).record.phone);

  /* 6) الحذف الصريح للحقل */
  const delLocal = edit({ ...base, nickname: 'ابو' }, { nickname: undefined }, 300);
  const cloudOld = { ...base, nickname: 'ابو', updatedAt: 100 };
  const d1 = mergeRecords(delLocal, cloudOld);
  await t.test('11. حذف حقل صراحةً (له زمن) يفوز على نسخة أقدم تحمله', !('nickname' in d1.record) || d1.record.nickname === undefined);
  const cloudNewer = edit({ ...base, nickname: 'ابو' }, { nickname: 'جديد' }, 400);
  await t.test('12. تعديل أحدث من الحذف يفوز', mergeRecords(delLocal, cloudNewer).record.nickname === 'جديد');
  const onlyL = { ...base, extra: 'x', updatedAt: 100 };
  await t.test('13. حقل عند طرف فقط بلا أثر حذف: يُحفظ (لا يضيع)', mergeRecords(onlyL, { ...base, updatedAt: 200 }).record.extra === 'x');

  /* 7) اختلاف نسخة المخطط */
  const v2 = { ...base, _v: 2, phones: ['010'], updatedAt: 250 };
  const v1 = { ...base, phone: '999', updatedAt: 200 };
  const mv = mergeRecords(v1, v2);
  await t.test('14. نسختا مخطط مختلفتان: لا دمج حقول؛ الأحدث كاملاً', mv.source === 'cloud' && mv.record === v2 && mv.conflicts.length === 0);

  /* 8) مجموعات ذرّية */
  await t.test('15. مجموعة بنود الطلب معرَّفة (items/amount…)', ATOMIC_GROUPS.orders[0].includes('items') && ATOMIC_GROUPS.orders[0].includes('amount'));
  const ob = { id: 'o1', items: [{ n: 'a', p: 100 }], amount: 100, status: 'new', note: '', createdAt: 1, updatedAt: 100 };
  const oA = stampForWrite('orders', ob, { ...ob, items: [{ n: 'a', p: 100 }, { n: 'b', p: 50 }], amount: 150, updatedAt: 200 }, 200);
  const oB = stampForWrite('orders', ob, { ...ob, amount: 130, status: 'ready', updatedAt: 300 }, 300);
  const og = mergeRecords(oA, oB, { since: 150, store: 'orders' });
  await t.test('16. البنود والمجموع تُؤخذ معاً من الطرف نفسه (لا مجموع لا يطابق بنوده) والحقول الأخرى تُدمج',
    og.record.amount === 130 && og.record.items.length === 1 && og.record.status === 'ready'
    && og.conflicts.some((c) => c.field.includes('items') && c.field.includes('amount')));
  const oC = stampForWrite('orders', ob, { ...ob, status: 'ready', updatedAt: 300 }, 300);
  const og2 = mergeRecords(oA, oC, { since: 150, store: 'orders' });
  await t.test('17. تعديل مجموعة على جهاز وحقل آخر على جهاز: يجتمعان بلا تعارض',
    og2.record.items.length === 2 && og2.record.amount === 150 && og2.record.status === 'ready' && og2.conflicts.length === 0);
  await t.test('18. تبادلية المجموعات الذرّية', deepEqual(mergeRecords(oA, oB, { store: 'orders' }).record, mergeRecords(oB, oA, { store: 'orders' }).record));

  /* 9) سجلات قديمة بلا أزمنة حقول */
  const L1 = { id: 'l', name: 'قديم', phone: '1', createdAt: 1, updatedAt: 100 };
  const L2 = { id: 'l', name: 'أحدث', phone: '1', address: 'x', createdAt: 1, updatedAt: 200 };
  const lg = mergeRecords(L1, L2);
  await t.test('19. سجلان قديمان بلا _ft: الأحدث يفوز لكل حقل مختلف (سلوك آخر-تعديل-يفوز كالسابق)', lg.record.name === 'أحدث' && lg.record.address === 'x');

  /* 10) سلامة */
  const fa = Object.freeze({ ...A }); const fb = Object.freeze({ ...B });
  let threw = false; try { mergeRecords(fa, fb, { since: 1 }); } catch (e) { threw = true; }
  await t.test('20. لا يعدّل المُدخلات', !threw);
  await t.test('21. createdAt الأقدم يُحفظ', mergeRecords({ ...A, createdAt: 50 }, { ...B, createdAt: 20 }).record.createdAt === 20);
  await t.test('22. مصفوفات/كائنات متداخلة = قيمة واحدة للحقل',
    mergeRecords({ ...base, tags: [1, 2], updatedAt: 200, _ft: { tags: 200 } }, { ...base, tags: [1, 3], updatedAt: 150, _ft: { tags: 150 } }).record.tags[1] === 2);

  /* 11) محاكاة جهازين حتى التقارب */
  let devA = edit(base, { phone: '011' }, 200);
  let devB = edit(base, { address: 'الجيزة', name: 'أحمد علي' }, 260);
  const mA = mergeRecords(devA, devB, { since: 150 }).record;
  const mB = mergeRecords(devB, devA, { since: 150 }).record;
  await t.test('23. محاكاة جهازين: بعد تبادل السجلات يحمل الجهازان البيانات نفسها بالضبط', deepEqual(mA, mB) && mA.phone === '011' && mA.address === 'الجيزة' && mA.name === 'أحمد علي');
  const again = mergeRecords(mA, mB, { since: 150 });
  await t.test('24. دمج ثانٍ بعد التقارب لا يغيّر شيئاً', again.dataDiffers === false || deepEqual(data(again.record), data(mA)));
});

register('v3.3.65 field merge through apply(merge) + conflict log', async (t) => {
  const savedRev = fsync.getKnownRev();
  const savedLog = localStorage.getItem('jalabiya_v3_sync_conflicts');
  const ids = ['t3365-m1', 't3365-m2', 't3365-m3'];
  const cleanup = async () => {
    for (const id of ids) { try { await idb.remove('customers', id); } catch (e) { /* ignore */ } }
    if (savedLog === null) localStorage.removeItem('jalabiya_v3_sync_conflicts'); else localStorage.setItem('jalabiya_v3_sync_conflicts', savedLog);
    fsync.setKnownRev(savedRev);
  };
  try {
    clearConflicts();
    const base = { id: 't3365-m1', name: 'عميل دمج', phone: '010', address: 'القاهرة', createdAt: 10, updatedAt: 100 };
    const local = edit(base, { phone: '011', name: 'اسم محلي' }, 200);   /* الاسم عُدّل محلياً فقط */
    await idb.writeBatch({ customers: { records: [local, { id: 't3365-m3', name: 'محلي فقط', createdAt: 1, updatedAt: 5 }] } });
    const cloud = edit(base, { address: 'الجيزة', phone: '012' }, 300);   /* الهاتف عُدّل على الجهازين = تعارض */
    const cloudNew = { id: 't3365-m2', name: 'جديد من السحابة', createdAt: 1, updatedAt: 50 };
    fsync.setKnownRev(150);

    const an = await fsync.analyzeLocalVsCloud({ stores: { customers: [cloud, cloudNew] }, updatedAt: 999 });
    await t.test('1. التحليل (قراءة فقط) يعدّ الدمج والتعارض ولا يكتب شيئاً',
      an.ok && an.merged === 1 && an.conflicts === 1 && an.added === 1 && (await idb.get('customers', 't3365-m1')).phone === '011');

    const ap = await fsync.apply({ stores: { customers: [cloud, cloudNew] }, updatedAt: 999 }, { mode: 'merge' });
    const got = await idb.get('customers', 't3365-m1');
    await t.test('2. apply(merge): السجل المحلي صار مركّباً (الأحدث لكل حقل) والمضاف والمحلي الفريد سليمان',
      ap.ok && got.phone === '012' && got.address === 'الجيزة' && got.name === 'اسم محلي' && got.updatedAt === 301
      && !!(await idb.get('customers', 't3365-m2')) && !!(await idb.get('customers', 't3365-m3')));
    await t.test('3. الإحصاءات: merged=1, conflicts=1, localNewer≥1 (يحتاج رفعاً) والقائمة تحمل الحقل',
      ap.merge.merged === 1 && ap.merge.conflicts === 1 && ap.merge.localNewer >= 1
      && ap.merge.conflictList[0].store === 'customers' && ap.merge.conflictList[0].field === 'phone' && ap.merge.conflictList[0].recordId === 't3365-m1');

    /* سجل التعارضات */
    const n = await recordConflicts(ap.merge.conflictList);
    const entry = getConflicts()[0];
    await t.test('4. تسجيل التعارض: يحفظ القيمتين والفائز ويضع اسم العميل (بعد الدمج) كتسمية',
      n === 1 && entry.label === 'اسم محلي' && entry.winner === 'cloud' && entry.localValue === '011' && entry.cloudValue === '012' && entry.restorable === true);

    await recordConflicts(ap.merge.conflictList);
    await t.test('5. تكرار نفس التعارض يستبدل الإدخال ولا يكرّره', countConflicts() === 1);

    /* واجهة الصفحة */
    const box = document.createElement('div'); document.body.appendChild(box);
    try {
      await cloudSyncPage.render(box);
      await waitFor(() => box.querySelector('.sync-conflict'));
      const card = box.querySelector('#sync-conflicts');
      const row = box.querySelector('.sync-conflict');
      await t.test('6. صفحة المزامنة تعرض القسم بالتسمية العربية والقيمتين',
        !!card && !!row && row.textContent.includes('الهاتف') && row.textContent.includes('012') && row.textContent.includes('011'));
      row.querySelector('[data-action="restore"]').click();
      await waitFor(() => countConflicts() === 0);
      await waitFor(() => !box.querySelector('#sync-conflicts'));
      const restored = await idb.get('customers', 't3365-m1');
      await t.test('7. زر «استرجاع القيمة الأخرى» يكتب القيمة الخاسرة (011) ويحدّث الوقت ويزيل التعارض',
        restored.phone === '011' && restored.updatedAt > 301 && countConflicts() === 0 && !box.querySelector('#sync-conflicts'));
    } finally { try { cloudSyncPage.destroy && cloudSyncPage.destroy(); } catch (e) { /* ignore */ } box.remove(); }

    /* حالات سجل التعارضات */
    clearConflicts();
    await recordConflicts([{ store: 'customers', recordId: 't3365-m1', field: 'address', localValue: 'x'.repeat(5000), cloudValue: 'y', winner: 'local', localAt: 1, cloudAt: 2 }]);
    const big = getConflicts()[0];
    const rBig = await restoreLosingValue(big.id);
    await t.test('8. قيمة كبيرة: معاينة فقط وبلا استرجاع (رفض بأدب)', big.restorable === false && rBig.ok === false);

    clearConflicts();
    await recordConflicts([{ store: 'customers', recordId: 'ghost-404', field: 'name', localValue: 'a', cloudValue: 'b', winner: 'local', localAt: 1, cloudAt: 2 }]);
    const rGhost = await restoreLosingValue(getConflicts()[0].id);
    await t.test('9. استرجاع لسجل لم يعد موجوداً: خطأ واضح بلا كتابة', rGhost.ok === false && !(await idb.get('customers', 'ghost-404')));

    clearConflicts();
    const many = Array.from({ length: 80 }, (_, i) => ({ store: 'orders', recordId: 'o' + i, field: 'status', localValue: 'a', cloudValue: 'b', winner: 'local', localAt: 1, cloudAt: 2 }));
    await recordConflicts(many);
    await t.test('10. السجل يحتفظ بأحدث 50 فقط', countConflicts() === 50);
    removeConflict(getConflicts()[0].id);
    await t.test('11. removeConflict يحذف إدخالاً واحداً', countConflicts() === 49);
    await t.test('12. مجموعة ذرّية (a+b) غير قابلة للاسترجاع',
      (await recordConflicts([{ store: 'orders', recordId: 'oX', field: 'items+amount', localValue: [1], cloudValue: [2], winner: 'local', localAt: 1, cloudAt: 2 }])) === 1
      && getConflicts()[0].restorable === false);
    clearConflicts();

    await t.test('13. دوال العرض: previewValue وfieldLabel',
      previewValue(null) === '—' && previewValue(true) === 'نعم' && previewValue([1, 2]) === '2 عنصر' && previewValue('x'.repeat(100)).length <= 60
      && fieldLabel('phone') === 'الهاتف' && fieldLabel('items+amount') === 'items + المبلغ' && fieldLabel('zzz') === 'zzz');

    /* بدون since: لا تعارض لكن الدمج يعمل */
    fsync.setKnownRev(null);
    const an2 = await fsync.analyzeLocalVsCloud({ stores: { customers: [edit(base, { phone: '099' }, 400)] }, updatedAt: 1000 });
    await t.test('14. أول مزامنة (بلا نسخة معروفة): لا تعارضات مُبلَّغ عنها', an2.ok && an2.conflicts === 0);
  } finally {
    await cleanup();
  }
});
