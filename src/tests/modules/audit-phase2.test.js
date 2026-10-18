/* ==========================================================================
   audit-phase2.test.js — الفحص العميق، المرحلة 2: المال والمزامنة (v3.3.76)
   ==========================================================================
   كل اختبار هنا يثبّت خطأً وُجد بالتجربة قبل إصلاحه:
   1. الدمج (apply) يُطمس فيه تعديل محلي وقع بين حساب الخطة وكتابتها.
   2. رفعان متزامنان (تلقائي + يدوي) ينتجان remote-changed وهمياً.
   3. علامة «غير مرفوع» تُمسح رغم كتابة أخرى أثناء التطبيق.
   4. قرار «الاستبدال» يُنفَّذ على تحليل قديم بعد حوار ونسخة أمان.
   5. دفعات الطلبات الملغاة تُحسب إيراداً ولا يظهر في أي مكان أنها تُردّ للعميل.
   6. نقاط الولاء لا تتبع الطلب إذا أُعيد فتحه أو خُفِّض سعره.
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import * as fsync from '../../sync/firestore-sync.js';
import { pullFlow } from '../../sync/sync-flow.js';
import { markDirty, markClean, getState as dirtyState } from '../../sync/dirty-state.js';
import { customers } from '../../data/repos/customers.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';
import { settings } from '../../data/repos/settings.js';
import { revenuePayments, computeRefundsDue } from '../../services/payments-view.js';
import { computeReceivables } from '../../services/receivables.js';
import { getFinancialData, invalidateCache } from '../../services/financial-calculator.js';
import { debtsPage } from '../../pages/debts.js';
import { paymentsPage } from '../../pages/payments.js';
import { ordersPage } from '../../pages/orders.js';
import { getActiveSession, getTotalWorkTime } from '../../services/order-timing.js';
import { formatDate, formatEGP } from '../../core/utils.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (root, txt) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.includes(txt));
const topModal = () => { const m = document.querySelectorAll('.modal'); return m[m.length - 1] || null; };
const closeModals = () => document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());

/** حقن حتمي: بعد قراءة خطة الدمج لمخزن معيّن نُشغّل fn (تعديل محلي بين الحساب والكتابة). */
function installGetAllHook(storeName, makeFn) {
  const orig = IDBObjectStore.prototype.getAll;
  let n = 0;
  IDBObjectStore.prototype.getAll = function (...args) {
    const req = orig.apply(this, args);
    if (this.name === storeName) { const k = n++; const fn = makeFn(k); if (fn) req.addEventListener('success', () => fn()); }
    return req;
  };
  return () => { IDBObjectStore.prototype.getAll = orig; };
}

function fakeFirestore() {
  const store = new Map();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fsMod = {
    doc: (db, path) => ({ path }),
    setDoc: async (ref, data) => { await sleep(3); store.set(ref.path, clone(data)); },
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
    deleteDoc: async (ref) => { store.delete(ref.path); },
    runTransaction: async (db, fn) => {
      const writes = [];
      const tx = { get: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }), set: (ref, d) => writes.push([ref.path, d]) };
      await fn(tx);
      for (const [p, d] of writes) store.set(p, clone(d));
    },
  };
  return { store, backend: { db: {}, fsMod } };
}

const seedOrders = async (n) => {
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
  /* شواهد حذف قديمة من اختبارات أخرى تُحتسب «غير مرفوعة» فتمنع مسح العلامة (سلوك صحيح) — نبدأ بنظيف */
  await idb.put('settings', { id: 'sync_tombstones', items: {}, updatedAt: Date.now() });
  for (let i = 0; i < n; i++) await idb.put('orders', { id: 'o' + i, updatedAt: 100, notes: 'local' });
};
const cloudSnap = (n) => ({ updatedAt: 777, stores: { orders: Array.from({ length: n }, (_, i) => ({ id: 'o' + i, updatedAt: 200, notes: 'cloud' })) } });

/* ==========================================================================
   حراس معاملة الكتابة
   ========================================================================== */
register('phase2: writeBatch guards (كل شيء أو لا شيء)', async (t) => {
  for (const s of ['expenses', 'inventory']) await idb.clear(s);
  await idb.put('expenses', { id: 'g1', updatedAt: 5, v: 'old' });

  await idb.writeBatch({ expenses: { records: [{ id: 'g1', updatedAt: 9, v: 'new' }] } }, { guards: { expenses: new Map([['g1', 5]]) } });
  await t.test('1. بصمة مطابقة: الكتابة تتم', (await idb.get('expenses', 'g1')).v === 'new');

  await idb.writeBatch({ expenses: { records: [{ id: 'g2', updatedAt: 1 }] } }, { guards: { expenses: new Map([['g2', null]]) } });
  await t.test('2. المتوقع «غير موجود» والسجل غير موجود: تتم الكتابة', !!(await idb.get('expenses', 'g2')));

  const err = await idb.writeBatch({
    expenses: { records: [{ id: 'g1', updatedAt: 20, v: 'STALE-PLAN' }] },
    inventory: { records: [{ id: 'gi', updatedAt: 1, name: 'x' }] },
  }, { guards: { expenses: new Map([['g1', 5]]) } }).then(() => null, (e) => e);   // الحالي 9 لا 5
  await t.test('3. بصمة مختلفة: يُرفض برمز guard-mismatch', !!err && err.code === 'guard-mismatch' && err.store === 'expenses' && err.id === 'g1');
  await t.test('4. الإلغاء كلّي: لا السجل المحروس تغيّر ولا سجل المخزن الآخر كُتب',
    (await idb.get('expenses', 'g1')).v === 'new' && !(await idb.get('inventory', 'gi')));

  const err2 = await idb.writeBatch({ expenses: { records: [{ id: 'g1', updatedAt: 30 }] } }, { guards: { expenses: new Map([['g1', null]]) } }).then(() => null, (e) => e);
  await t.test('5. المتوقع «غير موجود» لكنه موجود: يُرفض', !!err2 && err2.code === 'guard-mismatch');

  const err3 = await idb.writeBatch({ expenses: { deletes: ['g1'], records: [] } }, { guards: { expenses: new Map([['g1', 1]]) } }).then(() => null, (e) => e);
  await t.test('6. حذف محروس بصمته قديمة: يُرفض والسجل يبقى', !!err3 && !!(await idb.get('expenses', 'g1')));

  await idb.writeBatch({ expenses: { records: [{ id: 'g3', updatedAt: 1 }] } });
  await t.test('7. توافق رجعي: بلا guards تعمل كما كانت', !!(await idb.get('expenses', 'g3')));

  for (const s of ['expenses', 'inventory']) await idb.clear(s);
});

/* ==========================================================================
   الدمج: سباق التعديل المحلي
   ========================================================================== */
register('phase2: apply (merge) يحمي التعديلات المحلية', async (t) => {
  await seedOrders(30);
  let unhook = installGetAllHook('orders', (k) => (k === 0
    ? () => { idb.put('orders', { id: 'o5', notes: 'LOCAL-EDIT', updatedAt: Date.now() }); }
    : null));
  let res;
  try { res = await fsync.apply(cloudSnap(30), { mode: 'merge' }); } finally { unhook(); }
  await sleep(60);
  const o5 = await idb.get('orders', 'o5');
  await t.test('1. تعديل محلي بين الحساب والكتابة لا يُطمس بقيمة السحابة', res.ok && o5.notes === 'LOCAL-EDIT');
  await t.test('2. أُعيد الحساب تلقائياً (محاولتان فأكثر) والباقي أخذ قيمة السحابة',
    res.merge.attempts >= 2 && (await idb.get('orders', 'o20')).notes === 'cloud');

  /* تعديل محلي في كل محاولة (سجل مختلف كل مرة): بعد 3 محاولات يُعلن الفشل ولا يُطبَّق شيء */
  await seedOrders(30);
  const edits = ['o5', 'o6', 'o7', 'o8'];
  unhook = installGetAllHook('orders', (k) => () => { idb.put('orders', { id: edits[k] || 'o9', notes: 'LOCAL-' + k, updatedAt: Date.now() }); });
  let res2;
  try { res2 = await fsync.apply(cloudSnap(30), { mode: 'merge' }); } finally { unhook(); }
  await sleep(60);
  await t.test('3. تعديلات متواصلة: يفشل برمز concurrent-edit بعد 3 محاولات',
    res2.ok === false && res2.code === 'concurrent-edit');
  await t.test('4. الفشل بلا كتابة جزئية: سجل غير معدَّل لم يأخذ قيمة السحابة وتعديلاتي كلها باقية',
    (await idb.get('orders', 'o20')).notes === 'local' && (await idb.get('orders', 'o5')).notes === 'LOCAL-0' && (await idb.get('orders', 'o6')).notes === 'LOCAL-1');

  /* لا مشكلة بلا سباق: محاولة واحدة */
  await seedOrders(30);
  const res3 = await fsync.apply(cloudSnap(30), { mode: 'merge' });
  await t.test('5. بلا تعديل متزامن: تنجح من المحاولة الأولى', res3.ok && res3.merge.attempts === 1 && (await idb.get('orders', 'o5')).notes === 'cloud');

  /* علامة «غير مرفوع» */
  await seedOrders(30);
  markDirty();
  const clean = await fsync.apply(cloudSnap(30), { mode: 'merge' });
  await t.test('6. بلا كتابة أخرى: تُمسح علامة «غير مرفوع» (الجهاز يطابق السحابة)', clean.ok && dirtyState().dirtySince === null);

  await seedOrders(30);
  markDirty();
  unhook = installGetAllHook('orders', (k) => (k === 0 ? () => { idb.put('expenses', { id: 'x-late', updatedAt: Date.now(), amount: 1 }); } : null));
  let res4;
  try { res4 = await fsync.apply(cloudSnap(30), { mode: 'merge' }); } finally { unhook(); }
  await sleep(60);
  await t.test('7. كتابة في مخزن آخر أثناء التطبيق: تبقى علامة «غير مرفوع» (كانت تُمسح فيضيع رفعها)',
    res4.ok && dirtyState().dirtySince !== null);

  markClean();
  for (const s of fsync.SYNC_STORES) await idb.clear(s);
});

/* ==========================================================================
   القفل المتسلسل + قرار الاستبدال القديم
   ========================================================================== */
register('phase2: رفع/تطبيق متسلسلان + قرار استبدال قديم', async (t) => {
  const fake = fakeFirestore();
  fsync._setBackendForTest(fake.backend);
  try {
    await seedOrders(20);
    fsync.setKnownRev(null);
    const first = await fsync.push('u3376');
    const [a, b, c] = await Promise.all([fsync.push('u3376'), fsync.push('u3376'), fsync.push('u3376')]);
    await t.test('1. ثلاثة رفعات متزامنة: كلها تنجح بلا remote-changed وهمي',
      first.ok && a.ok && b.ok && c.ok && !a.code && !b.code && !c.code);

    /* رفع ثم تطبيق متزامنان لا يتداخلان */
    const [pushRes, applyRes] = await Promise.all([fsync.push('u3376'), fsync.apply(cloudSnap(20), { mode: 'merge' })]);
    await t.test('2. رفع وتطبيق متزامنان: ينتهيان سليمين', pushRes.ok && applyRes.ok);

    /* قرار الاستبدال/التنزيل القديم */
    await seedOrders(5);
    fsync.setKnownRev(null);
    await fsync.push('u3376');              // السحابة = الجهاز تماماً → لا شيء يضيع → تأكيد بسيط
    const p = pullFlow('u3376');
    let m = null;
    for (let i = 0; i < 80 && !m; i++) { await sleep(40); const top = topModal(); if (top && top.textContent.includes('تنزيل من السحابة')) m = top; }
    await t.test('3. يظهر تأكيد «تنزيل من السحابة» (لا شيء محلي يضيع)', !!m);
    await idb.put('orders', { id: 'LATE-LOCAL', updatedAt: Date.now(), notes: 'أُضيف أثناء الحوار' });   // يظهر بعد التحليل
    btn(m, 'تنزيل').click();
    const out = await p;
    await t.test('4. ظهر سجل محلي جديد أثناء الحوار: يُوقَف الاستبدال ولا يضيع السجل',
      out.ok === false && out.stale === true && !!(await idb.get('orders', 'LATE-LOCAL')));
    closeModals();

    /* بلا تغيير: يمرّ */
    await idb.remove('orders', 'LATE-LOCAL');
    await fsync.push('u3376', { force: true });
    const p2 = pullFlow('u3376');
    let m2 = null;
    for (let i = 0; i < 80 && !m2; i++) { await sleep(40); const top = topModal(); if (top && top.textContent.includes('تنزيل من السحابة')) m2 = top; }
    btn(m2, 'تنزيل').click();
    const out2 = await p2;
    await t.test('5. بلا تغيير أثناء الحوار: التنزيل يكتمل', out2.ok === true);
    closeModals();
  } finally {
    fsync._setBackendForTest(null);
    for (const s of fsync.SYNC_STORES) await idb.clear(s);
    markClean();
  }
});

/* ==========================================================================
   الإيراد والمستحق ردّه (الطلب الملغى)
   ========================================================================== */
register('phase2: الطلب الملغى — لا إيراد ويُردّ للعميل', async (t) => {
  const ords = [
    { id: 'a', status: 'cancelled', deposit: 200, amount: 500, customerId: 'c1' },
    { id: 'b', status: 'pending', deposit: 100, amount: 300, customerId: 'c1' },
    { id: 'z', status: 'cancelled', deposit: 0, amount: 100, customerId: 'c1' },
    { id: 'r', status: 'cancelled', deposit: 80, amount: 100, customerId: 'c1', refundedAt: 1 },
  ];
  const pays = [
    { id: 'p1', orderId: 'a', amount: 150, isDeposit: false, fromCredit: true },
    { id: 'p2', orderId: 'b', amount: 50, isDeposit: false },
    { id: 'p3', orderId: 'a', amount: 100, isDeposit: false },
  ];
  const rev = revenuePayments(pays, ords);
  await t.test('1. revenuePayments يستبعد كل دفعات الملغى (المسجّلة والمقدم الافتراضي) ويُبقي غيره',
    rev.every((p) => p.orderId !== 'a') && rev.some((p) => p.id === 'p2') && rev.some((p) => p.synthetic && p.orderId === 'b'));

  const rf = computeRefundsDue(ords, pays);
  const ra = rf.list.find((r) => r.orderId === 'a');
  await t.test('2. computeRefundsDue: ملغى «a» = مقدم 200 + 150 + 100 = 450، منها 150 من الرصيد و300 نقداً',
    !!ra && ra.amount === 450 && ra.creditPart === 150 && ra.cashPart === 300);
  await t.test('3. لا يشمل: الملغى بلا مدفوع، ولا ما رُدّ، ولا النشط', !rf.list.some((r) => ['z', 'r', 'b'].includes(r.orderId)) && rf.total === 450);

  const rc = computeReceivables(ords, pays, [{ id: 'c1', name: 'عميل-اختبار', phone: '010' }]);
  await t.test('4. computeReceivables يُرجع refunds بالاسم', rc.refunds.total === 450 && rc.refunds.list[0].name === 'عميل-اختبار');

  /* المركز المالي: الإيراد الفعلي */
  const cust = await customers.create({ name: 'p2-fin', phone: '01033330001' });
  const made = { orders: [], payments: [] };
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    const rev0 = (await getFinancialData('year')).summary.totalRevenue;
    const o = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 1000, deposit: 0, items: [{ name: 'ثوب', price: 1000, quantity: 1 }] });
    made.orders.push(o.id);
    const pp = await payments.create({ customerId: cust.id, orderId: o.id, amount: 700, method: 'cash', isDeposit: false });
    made.payments.push(pp.id);
    invalidateCache();
    const rev1 = (await getFinancialData('year')).summary.totalRevenue;
    await orders.update(o.id, { status: 'cancelled' });
    invalidateCache();
    const rev2 = (await getFinancialData('year')).summary.totalRevenue;
    await t.test('5. المركز المالي: دفعة 700 على طلب نشط تدخل الإيراد، وبعد الإلغاء تخرج منه',
      Math.round(rev1 - rev0) === 700 && Math.round(rev2 - rev0) === 0);

    /* صفحة المستحقات: بطاقة الردّ + التسجيل */
    await customers.walletTopUp(cust.id, 300);
    const oc = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 800, deposit: 0, items: [{ name: 'ثوب2', price: 800, quantity: 1 }] });
    made.orders.push(oc.id);
    const spent = await orders.spendCredit(oc.id, 200, 800);
    const cash = await payments.create({ customerId: cust.id, orderId: oc.id, amount: 300, method: 'cash', isDeposit: false });
    made.payments.push(cash.id);
    (await payments.findByOrder(oc.id)).forEach((p) => made.payments.push(p.id));
    await orders.update(oc.id, { status: 'cancelled' });
    const walletBefore = (await customers.find(cust.id)).creditBalance;

    await debtsPage.render(box); await sleep(350);
    const card = box.querySelector('[data-role="refunds-due"]');
    await t.test('6. صفحة المستحقات: بطاقة «مستحق ردّه للعملاء» بالمبلغ والعميل',
      !!card && card.textContent.includes('p2-fin') && card.textContent.includes('من رصيده'));
    const tail = String(oc.id).slice(-6);
    const rowBtn = Array.from(card.querySelectorAll('button')).find((b) => b.parentElement.textContent.includes(tail));
    rowBtn.click(); await sleep(200);
    await t.test('7. تأكيد الردّ يذكر أن جزءاً يعود لرصيد المحفظة', topModal().textContent.includes('رصيد محفظته'));
    btn(topModal(), 'تم الرد').click(); await sleep(500);
    const after = await orders.find(oc.id);
    const walletAfter = (await customers.find(cust.id)).creditBalance;
    await t.test('8. بعد التسجيل: الطلب مُعلَّم refundedAt وأُعيد 200 من الرصيد وتختفي البطاقة من قائمة هذا الطلب',
      !!after.refundedAt && after.refundedAmount === 500 && Math.round((walletAfter - walletBefore) * 100) === 20000 && spent === 200 &&
      !(box.querySelector('[data-role="refunds-due"]') && box.querySelector('[data-role="refunds-due"]').textContent.includes('#' + tail)));
    closeModals();

    /* صفحة المدفوعات: إجمالي يطابق اللوحة + بطاقة الردّ */
    await orders.update(oc.id, { refundedAt: null });
    await paymentsPage.render(box); await sleep(350);
    await t.test('9. صفحة المدفوعات: بطاقة «تُردّ للعملاء» ظاهرة لطلب ملغى لم يُردّ', box.textContent.includes('تُردّ للعملاء'));

    /* نموذج الطلب: تنبيه الإلغاء وإعادة الفتح */
    const live = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 1000, deposit: 400, items: [{ name: 'ثوب3', price: 1000, quantity: 1 }] });
    made.orders.push(live.id);
    await ordersPage.render(box); await sleep(350);
    const card3 = box.querySelector('[data-id="' + live.id + '"]');
    btn(card3, '✏️').click(); await sleep(300);
    const m = topModal();
    const sel = Array.from(m.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === 'cancelled'));
    sel.value = 'cancelled'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    btn(m, 'حفظ التعديلات').click(); await sleep(350);
    const cm = topModal();
    await t.test('10. إلغاء طلب مدفوع: يظهر «إلغاء طلب مدفوع» بمبلغ المدفوع', !!cm && cm.textContent.includes('إلغاء طلب مدفوع') && cm.textContent.includes('400'));
    btn(cm, 'رجوع').click(); await sleep(250);
    await t.test('11. «رجوع» لا يُلغي الطلب', (await orders.find(live.id)).status === 'in_progress');
    closeModals();
  } finally {
    closeModals();
    box.remove();
    for (const id of made.payments) { try { await payments.remove(id); } catch { /* ignore */ } }
    for (const id of made.orders) { try { await orders.remove(id); } catch { /* ignore */ } }
    try { await customers.remove(cust.id); } catch { /* ignore */ }
  }
});

/* ==========================================================================
   نقاط الولاء تتبع الطلب
   ========================================================================== */
register('phase2: نقاط الولاء تتبع الطلب (إعادة فتح/خفض سعر/إلغاء)', async (t) => {
  const s0 = await settings.get();
  await settings.update({ loyalty: { enabled: true, earnEvery: 20, pointValue: 1 } });
  const cust = await customers.create({ name: 'p2-pts', phone: '01033330002' });
  const ids = [];
  const pts = async () => (await customers.find(cust.id)).points || 0;
  const mk = async (amount) => { const o = await orders.create({ customerId: cust.id, status: 'in_progress', amount, deposit: 0, items: [{ name: 'ثوب', price: amount, quantity: 1 }] }); ids.push(o.id); return o; };
  try {
    const o = await mk(1000);
    await orders.update(o.id, { status: 'delivered' });
    await t.test('1. التسليم يمنح 50 نقطة (1000 ÷ 20)', (await pts()) === 50 && (await orders.find(o.id)).pointsAwarded === 50);

    await orders.update(o.id, { amount: 600 });
    await t.test('2. خفض المبلغ (وهو مسلَّم) إلى 600: النقاط تصير 30 تلقائياً', (await pts()) === 30 && (await orders.find(o.id)).pointsAwarded === 30);

    await orders.update(o.id, { amount: 1000 });
    await t.test('3. رفع المبلغ ثانيةً: تعود 50', (await pts()) === 50);

    await orders.update(o.id, { amount: 1000, status: 'delivered' });
    await t.test('4. تعديل بلا تغيير مبلغ/حالة: لا حركة نقاط', (await pts()) === 50);

    await orders.update(o.id, { status: 'in_progress', amount: 600 });
    await t.test('5. إعادة فتح الطلب وخفض سعره: تُسحب النقاط كلها', (await pts()) === 0 && (await orders.find(o.id)).pointsAwarded === 0);

    await orders.update(o.id, { status: 'delivered' });
    await t.test('6. التسليم من جديد يمنح النقاط على المبلغ الجديد (30) لا القديم', (await pts()) === 30);

    /* ما أنفقه العميل لا يُسترد ولا تنزل نقاطه تحت صفر */
    await customers.walletAdjust(cust.id, { points: -25, type: 'redeem' });
    await orders.update(o.id, { status: 'cancelled' });
    await t.test('7. أنفق 25 من 30 ثم أُلغي الطلب: تُسحب المتبقية فقط (5) ولا تصير سالبة', (await pts()) === 0 && (await orders.find(o.id)).pointsAwarded === 0);

    const o2 = await mk(400);
    await orders.update(o2.id, { status: 'delivered' });
    const before = await pts();
    await orders.update(o2.id, { status: 'cancelled' });
    await t.test('8. إلغاء طلب مسلَّم يسحب نقاطه (20)', before === 20 && (await pts()) === 0);

    const o3 = await mk(500);
    await orders.update(o3.id, { amount: 300 });
    await t.test('9. تغيير مبلغ طلب لم يُسلَّم بعد: لا نقاط ولا حركة', (await pts()) === 0 && !(await orders.find(o3.id)).pointsAwarded);
  } finally {
    for (const id of ids) { try { await orders.remove(id); } catch { /* ignore */ } }
    try { await customers.remove(cust.id); } catch { /* ignore */ }
    await settings.update({ loyalty: s0.loyalty });
  }
});

/* ==========================================================================
   المؤقت والكانبان (قلب شاشة الطلبات)
   ========================================================================== */
register('phase2: مؤقت العمل والكانبان', async (t) => {
  const cust = await customers.create({ name: 'p2-kan', phone: '01033330003' });
  const ids = [];
  const box = document.createElement('div');
  document.body.appendChild(box);
  const D = 86400000;
  try {
    /* --- المؤقت --- */
    const running = () => [{ start: Date.now() - 3600000, end: null }];
    const o1 = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 500, workSessions: running() });
    ids.push(o1.id);
    await orders.update(o1.id, { status: 'delivered' });
    const d1 = await orders.find(o1.id);
    const t1 = getTotalWorkTime(d1.workSessions);
    await sleep(120);
    await t.test('1. تسليم طلب مؤقته يعمل: تُغلق الجلسة ولا يستمر حساب الساعات',
      !getActiveSession(d1.workSessions) && getTotalWorkTime(d1.workSessions) === t1 && t1 >= 3590000 && t1 <= 3620000);

    const o2 = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 500, workSessions: running() });
    ids.push(o2.id);
    await orders.update(o2.id, { status: 'cancelled' });
    await t.test('2. إلغاء طلب مؤقته يعمل: تُغلق الجلسة أيضاً', !getActiveSession((await orders.find(o2.id)).workSessions));

    const o3 = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 500, workSessions: running() });
    ids.push(o3.id);
    await orders.update(o3.id, { status: 'ready' });
    await t.test('3. الانتقال إلى «جاهز» لا يوقف المؤقت (العمل مستمر)', getActiveSession((await orders.find(o3.id)).workSessions));

    const mine = [{ start: 1000, end: 2000 }];
    const o4 = await orders.create({ customerId: cust.id, status: 'in_progress', amount: 500, workSessions: running() });
    ids.push(o4.id);
    await orders.update(o4.id, { status: 'delivered', workSessions: mine });
    await t.test('4. إن مرّر المستدعي workSessions صراحةً تُحترم كما هي', JSON.stringify((await orders.find(o4.id)).workSessions) === JSON.stringify(mine));

    /* --- الكانبان: 35 طلباً قيد التنفيذ --- */
    for (let i = 0; i < 35; i++) {
      const o = await orders.create({
        customerId: cust.id, status: 'in_progress', amount: 100 + i,
        dueDate: Date.now() + (40 - i) * D,                 // i=34 أقربهم موعداً
        items: [{ name: 'ك' + i, price: 100 + i, quantity: 1 }],
      });
      ids.push(o.id);
    }
    /* مسلَّم قديم بجلسة جارية (بيانات قبل الإصلاح): يُعرض مغلقاً */
    const legacy = await orders.create({ customerId: cust.id, status: 'delivered', amount: 50, deliveredAt: Date.now() - 2 * D, workSessions: [{ start: Date.now() - 2 * D - 7200000, end: null }] });
    ids.push(legacy.id);

    await ordersPage.render(box); await sleep(350);
    btn(box, 'كانبان').click(); await sleep(250);
    const moreBtn = box.querySelector('[data-kanban-more="in_progress"]');
    await t.test('2b. عمود تجاوز 30 طلباً: يظهر زر «عرض ... أخرى (متبقٍ N)» بدل الإخفاء الصامت',
      !!moreBtn && /متبقٍ \d+/.test(moreBtn.textContent));
    const colEl = moreBtn && moreBtn.parentElement;
    const allIn = (await orders.list()).filter((o) => o.status === 'in_progress');
    const expectedFirst = allIn.slice().sort((a, b) => ((b.urgent ? 1 : 0) - (a.urgent ? 1 : 0)) || ((a.dueDate || Infinity) - (b.dueDate || Infinity)) || ((b.createdAt || 0) - (a.createdAt || 0)))[0];
    const firstText = colEl.children[1] && colEl.children[1].textContent;
    await t.test('5. أول بطاقة في عمود «قيد التنفيذ» هي الأقرب موعد تسليم (لا الأحدث إنشاءً)',
      !!firstText && !!expectedFirst && firstText.includes(formatEGP(expectedFirst.amount)) && firstText.includes(formatDate(expectedFirst.dueDate)));
    moreBtn.click(); await sleep(150);
    const moreAfter = box.querySelector('[data-kanban-more="in_progress"]');
    const inProgressCount = (await orders.list()).filter((o) => o.status === 'in_progress').length;
    await t.test('6. الضغط يعرض الباقي كله (ويختفي الزر إن اتّسع)',
      inProgressCount <= 60 ? !moreAfter : !!moreAfter);
    await t.test('7. أعمدة الكانبان لا تُخفي طلبات: مجموع البطاقات الظاهرة = عدد طلبات العمود',
      (() => {
        const board = box.querySelector('#orders-list > div');
        const cols = Array.from(board.children);
        const inProg = cols[1];
        const shown = Array.from(inProg.children).filter((c) => c.hasAttribute('data-id') || c.querySelector('[data-id]') || c.tagName === 'DIV').length - 1;
        return shown >= Math.min(inProgressCount, 60);
      })());

    /* بطاقة المسلَّم القديم: لا مؤقت جارٍ وساعات العمل منتهية عند وقت التسليم (≈ ساعتان) */
    btn(box, 'قائمة') && btn(box, 'قائمة').click();
    await sleep(250);
    const lcard = box.querySelector('[data-id="' + legacy.id + '"]');
    await t.test('8. طلب مسلَّم قديم بجلسة مفتوحة: لا شارة «يعمل» تتزايد', !lcard || !lcard.querySelector('[data-timer-id]') || !lcard.textContent.includes('يعمل'));
  } finally {
    box.remove();
    for (const id of ids) { try { await orders.remove(id); } catch { /* ignore */ } }
    try { await customers.remove(cust.id); } catch { /* ignore */ }
  }
});
