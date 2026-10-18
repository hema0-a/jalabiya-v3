/* ==========================================================================
   v3379-ledger-shadow.test.js — الدفتر المالي، المرحلة 1: المخزن + الوضع الظلّي + التقرير (v3.3.79)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { DB_CONFIG, STORES } from '../../core/config.js';
import { SCHEMA, validateSchema } from '../../data/schema.js';
import { RECORD_STORES } from '../../data/record-meta.js';
import { SYNC_STORES, apply as applySnapshot } from '../../sync/firestore-sync.js';
import { createBackup, getBackup, deleteBackup, restoreBackup } from '../../services/auto-backup.js';
import { customers } from '../../data/repos/customers.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { balanceOf, makeEntry } from '../../services/ledger.js';
import {
  recordWalletMove, shadowDeps, getShadowFailures, resetShadowFailures, getDeviceId, mapLegacyType, _resetShadowState,
} from '../../services/ledger-shadow.js';
import {
  ensureOpening, buildShadowReport, loadShadowReport, resetShadowLedger, reportDeps, formatAmount, KIND_LABELS,
} from '../../services/ledger-report.js';
import { buildLedgerShadowCard } from '../../ui/ledger-shadow-card.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throwsAsync = async (fn) => { try { await fn(); return false; } catch (e) { return true; } };

async function resetAll() {
  await ledgerRepo.clearAll();
  await idb.clear('customers');
  await idb.clear('inventory');   /* الافتتاح يقرأ المخزون أيضاً منذ 3.3.80 */
  _resetShadowState();
  resetShadowFailures();
  reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });
}
const ORIGINAL_SYNC_STATE = reportDeps.syncState; /* الأصل الافتراضي يُحفظ قبل أي استبدال */
const restoreReportDeps = () => { reportDeps.syncState = ORIGINAL_SYNC_STATE; };

register('v3.3.79 ledger — المخزن والمخطط والترحيل', async (t) => {
  t.test('1. إصدار قاعدة البيانات 11 واسم المخزن', DB_CONFIG.version === 11 && STORES.LEDGER === 'ledger');
  t.test('2. المخطط يعرّف المخزن بفهرسَي by_acct وby_at', SCHEMA.ledger && SCHEMA.ledger.keyPath === 'id' && SCHEMA.ledger.indexes.map((i) => i.name).join() === 'by_acct,by_at');
  t.test('3. validateSchema يمر', validateSchema() === true);
  t.test('4. المخزن ضمن المزامنة وسجلات الختم ومتطابقان', SYNC_STORES.includes('ledger') && RECORD_STORES.includes('ledger')
    && [...SYNC_STORES].sort().join() === [...RECORD_STORES].sort().join());
  const db = await idb.openDB();
  t.test('5. قاعدة البيانات المفتوحة بالإصدار 11 وفيها المخزن وفهارسه',
    db.version === 11 && db.objectStoreNames.contains('ledger')
    && [...db.transaction('ledger').objectStore('ledger').indexNames].sort().join() === 'by_acct,by_at');

  await resetAll();
  const cb = await createBackup({ label: 'اختبار الدفتر' });
  const bk = cb.ok ? await getBackup(cb.id) : null;
  t.test('6. النسخة الاحتياطية تشمل مخزن الدفتر', !!bk && Array.isArray(bk.stores.ledger));
  if (cb.ok) await deleteBackup(cb.id);

  /* ترحيل حقيقي 10 → 11 على قاعدة منفصلة تحوي بيانات */
  const testName = 'jalabiya_v3_migtest_' + Date.now();
  const origName = DB_CONFIG.name;
  let migOk = false; let kept = false; let hasStore = false; let hasIdx = false; let ver = 0;
  try {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(testName, 10);
      req.onupgradeneeded = () => {
        const d = req.result;
        Object.entries(SCHEMA).forEach(([name, cfg]) => {
          if (name === 'ledger') return;
          const s = d.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: cfg.autoIncrement });
          cfg.indexes.forEach((i) => s.createIndex(i.name, i.keyPath, { unique: i.unique }));
        });
      };
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction('customers', 'readwrite');
        tx.objectStore('customers').put({ id: 'mig-c1', name: 'عميل قديم', creditBalance: 55, points: 3 });
        tx.oncomplete = () => { d.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    idb.closeDB();
    DB_CONFIG.name = testName;
    const d2 = await idb.openDB();
    ver = d2.version;
    hasStore = d2.objectStoreNames.contains('ledger');
    hasIdx = hasStore && d2.transaction('ledger').objectStore('ledger').indexNames.contains('by_acct');
    const rec = await idb.get('customers', 'mig-c1');
    kept = !!rec && rec.creditBalance === 55 && rec.points === 3;
    migOk = true;
  } catch (e) { console.warn('[test migration]', e); }
  finally {
    idb.closeDB();
    DB_CONFIG.name = origName;
    await new Promise((r) => { const q = indexedDB.deleteDatabase(testName); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    await idb.openDB();
  }
  t.test('7. ترحيل 10→11: ينجح ويُنشئ المخزن والفهارس ويُبقي بيانات العملاء كاملة', migOk && ver === 11 && hasStore && hasIdx && kept);
});

register('v3.3.79 ledger — مستودع الدفتر', async (t) => {
  await resetAll();
  const mk = (o = {}) => makeEntry({ unit: 'wallet', acct: 'c1', delta: 1000, type: 'topup', ...o }, { dev: 'd1', seq: o.seq ?? 0, now: 1_700_000_000_000 + (o.seq ?? 0) });
  const e1 = mk({ key: 'x1' });
  const r1 = await ledgerRepo.append(e1);
  t.test('1. إضافة سطر جديد', r1.added === true && r1.conflict === false && (await ledgerRepo.count()) === 1);
  const r2 = await ledgerRepo.append(e1);
  t.test('2. إضافة السطر نفسه لا تكرره', r2.added === false && r2.conflict === false && (await ledgerRepo.count()) === 1);
  const r3 = await ledgerRepo.append(mk({ key: 'x1', delta: 2000 }));
  t.test('3. المعرّف نفسه بمقدار مختلف ⟵ تعارض ولا يُستبدل الموجود', r3.added === false && r3.conflict === true && r3.existing.delta === 1000
    && (await ledgerRepo.list())[0].delta === 1000);
  t.test('4. سطر غير صالح يُرفض ولا يُكتب',
    await throwsAsync(() => ledgerRepo.append({ id: 'bad', unit: 'wallet', acct: 'c1', delta: 1.5, type: 'topup' })) && (await ledgerRepo.count()) === 1);
  await ledgerRepo.append(mk({ key: 'x2', acct: 'c2', seq: 1 }));
  t.test('5. listByAcct', (await ledgerRepo.listByAcct('c1')).length === 1 && (await ledgerRepo.listByAcct('c2')).length === 1 && (await ledgerRepo.listByAcct('zz')).length === 0);
  t.test('6. إضافات متزامنة لنفس المعرّف تنتج سطراً واحداً', await (async () => {
    const same = mk({ key: 'race' });
    await Promise.all([ledgerRepo.append(same), ledgerRepo.append(same), ledgerRepo.append(same)]);
    return (await ledgerRepo.list()).filter((e) => e.id === 'k:race').length === 1;
  })());
  const listed = await ledgerRepo.list();
  t.test('7. list مرتّبة بالترتيب القانوني', listed.every((e, i, a) => i === 0 || a[i - 1].at <= e.at));
  await ledgerRepo.clearAll();
  t.test('8. clearAll', (await ledgerRepo.count()) === 0);
  t.test('9. الأسطر لا تُختم بحقول مزامنة تغيّر هويتها (بلا updatedAt)', await (async () => {
    await ledgerRepo.append(mk({ key: 'stamp' }));
    const e = (await ledgerRepo.list())[0];
    return e.updatedAt === undefined && e._ft === undefined;
  })());
  await resetAll();
});

register('v3.3.79 ledger — الكتابة الظلّية من المحفظة', async (t) => {
  await resetAll();
  const c = await customers.create({ name: 'عميلة المحفظة', phone: '01011112222' });
  await customers.walletTopUp(c.id, 100);
  let rows = await ledgerRepo.list();
  t.test('1. الشحن يُسجَّل ظلّياً: 10000 قرش ونوع topup ومعرّف k:w:…', rows.length === 1 && rows[0].delta === 10000 && rows[0].type === 'topup' && rows[0].id.startsWith('k:w:') && rows[0].unit === 'wallet');
  const cust1 = await customers.find(c.id);
  t.test('2. معرّف السطر مشتق من حركة walletLog (تتبّع الأصل)', rows[0].id === 'k:w:' + cust1.walletLog[0].id + ':wallet');
  t.test('3. العدّاد القديم لم يتغيّر سلوكه', cust1.creditBalance === 100);

  await customers.walletAdjust(c.id, { balance: -30, points: 5, type: 'earn', orderId: 'ord-123456', note: 'اختبار' });
  rows = await ledgerRepo.list();
  const wl = rows.filter((r) => r.unit === 'wallet'); const pt = rows.filter((r) => r.unit === 'points');
  t.test('4. حركة بوحدتين تُنتج سطرين (محفظة ونقاط)', wl.length === 2 && pt.length === 1);
  t.test('5. نوع earn يُحوَّل إلى award للنقاط', pt[0].type === 'award' && pt[0].delta === 5);
  t.test('6. المرجع والملاحظة تُنقلان', pt[0].ref && pt[0].ref.orderId === 'ord-123456' && pt[0].note === 'اختبار');
  t.test('7. الرصيد في الدفتر = العدّاد القديم', balanceOf(rows, 'wallet', c.id) === 7000 && balanceOf(rows, 'points', c.id) === 5);

  const before = (await ledgerRepo.count());
  await throwsAsync(() => customers.walletAdjust(c.id, { balance: -99999, type: 'spend' }));
  t.test('8. عملية مرفوضة (رصيد لا يكفي) لا تكتب في الدفتر', (await ledgerRepo.count()) === before);

  const log = (await customers.find(c.id)).walletLog[0];
  const again = await recordWalletMove(c.id, log);
  t.test('9. إعادة تسجيل الحركة نفسها لا تكرّرها (idempotent)', again.written === 0 && again.skipped >= 1 && (await ledgerRepo.count()) === before);

  /* فشل الكتابة الظلّية لا يُفشل العملية الأصلية */
  const origAppend = shadowDeps.append;
  shadowDeps.append = () => Promise.reject(new Error('محاكاة فشل'));
  let res = null; let threw = false;
  try { res = await customers.walletTopUp(c.id, 10); } catch (e) { threw = true; }
  shadowDeps.append = origAppend;
  t.test('10. فشل الدفتر لا يُفشل شحن المحفظة', !threw && !!res && res.balance === 80);
  t.test('11. العدّاد القديم سجّل الشحن رغم فشل الدفتر', (await customers.find(c.id)).creditBalance === 80);
  t.test('12. عدّاد الفشل زاد وسيظهر في التقرير', getShadowFailures() === 1);
  const rep = buildShadowReport(await customers.list(), await ledgerRepo.list());
  t.test('13. التقرير يرصد الفرق الناتج عن الفشل (الدفتر أقل بـ10) وعدّاد الفشل',
    rep.ok === false && rep.rows.some((r) => r.unit === 'wallet' && r.diff === -1000 && r.kind === 'ledger_less') && rep.failures === 1);

  t.test('14. تحويل أنواع الحركات القديمة', mapLegacyType('earn') === 'award' && mapLegacyType('spend') === 'spend' && mapLegacyType('x') === 'adjust');
  t.test('15. معرّف جهاز ثابت', getDeviceId() === getDeviceId() && getDeviceId().length >= 5);
  t.test('16. recordWalletMove بمدخلات سيئة لا ترمي', await (async () => { const r = await recordWalletMove(null, null); return r.failed === 1; })());
  resetShadowFailures();
  await resetAll();
  restoreReportDeps();
});

register('v3.3.79 ledger — الأسطر الافتتاحية', async (t) => {
  await resetAll();
  const a = await customers.create({ name: 'أ', creditBalance: 50, points: 7 });
  const b = await customers.create({ name: 'ب', creditBalance: 0, points: 0 });
  const r1 = await ensureOpening({});
  let rows = await ledgerRepo.list();
  t.test('1. سطران افتتاحيان لعميل له رصيد ونقاط، ولا شيء لمن رصيده صفر', r1.status === 'written' && r1.written === 2 && rows.length === 2);
  t.test('2. المعرّف الثابت k:opening:<وحدة>:<عميل> والنوع opening',
    rows.some((e) => e.id === 'k:opening:wallet:' + a.id && e.delta === 5000 && e.type === 'opening')
    && rows.some((e) => e.id === 'k:opening:points:' + a.id && e.delta === 7));
  const r2 = await ensureOpening({});
  t.test('3. التشغيل الثاني لا يكتب شيئاً (idempotent)', r2.status === 'nothing' && r2.written === 0 && (await ledgerRepo.count()) === 2);
  const rep = buildShadowReport(await customers.list(), await ledgerRepo.list());
  t.test('4. التقرير: متطابق بعد الافتتاح', rep.ok === true && rep.mismatches === 0);

  await customers.walletTopUp(a.id, 25);
  const rep2 = await loadShadowReport();
  t.test('5. حركة بعد الافتتاح تبقى متطابقة (75 جنيهاً)', rep2.ok && balanceOf(await ledgerRepo.list(), 'wallet', a.id) === 7500);

  /* حركة سبقت الافتتاح: لا تُحتسب مرتين */
  await resetAll();
  const c = await customers.create({ name: 'ج', creditBalance: 100, points: 0 });
  await customers.walletTopUp(c.id, 20);                              /* العدّاد 120، الدفتر 20 */
  t.test('6. قبل الافتتاح: التقرير يرصد no_opening/ledger_less', (await loadShadowReport()).rows.length === 1);
  await ensureOpening({});
  t.test('7. الافتتاح = العدّاد − المسجَّل ظلّياً (لا حساب مزدوج): الدفتر 120', balanceOf(await ledgerRepo.list(), 'wallet', c.id) === 12000 && (await loadShadowReport()).ok);

  /* افتتاح سالب: الدفتر أكثر من العدّاد */
  await resetAll();
  const d = await customers.create({ name: 'د', creditBalance: 10, points: 0 });
  await ledgerRepo.append(makeEntry({ unit: 'wallet', acct: d.id, delta: 5000, type: 'topup', key: 'pre' }, { dev: 'dx', seq: 0 }));
  await ensureOpening({});
  t.test('8. دفتر أكثر من العدّاد ⟵ افتتاح سالب يطابق العدّاد', balanceOf(await ledgerRepo.list(), 'wallet', d.id) === 1000 && (await loadShadowReport()).ok);

  /* البوّابة: مزامنة غير نظيفة */
  await resetAll();
  await customers.create({ name: 'هـ', creditBalance: 40, points: 0 });
  reportDeps.syncState = () => ({ usedCloud: true, dirtySince: Date.now() - 1000 });
  const g = await ensureOpening({});
  t.test('9. جهاز استُخدم مع السحابة وفيه تغييرات غير مرفوعة ⟵ لا افتتاح (gated)', g.status === 'gated' && g.gatedBy === 'sync-dirty' && (await ledgerRepo.count()) === 0);
  reportDeps.syncState = () => ({ usedCloud: true, dirtySince: null });
  const g2 = await ensureOpening({});
  t.test('10. بعد مزامنة نظيفة ⟵ يُكتب', g2.status === 'written' && (await ledgerRepo.count()) === 1);
  reportDeps.syncState = () => ({ usedCloud: false, dirtySince: Date.now() });
  await resetAll();
  await customers.create({ name: 'و', creditBalance: 9, points: 0 });
  reportDeps.syncState = () => ({ usedCloud: false, dirtySince: Date.now() });
  t.test('11. جهاز لم يُستخدم مع السحابة لا تمنعه علامة dirty (المحلية دائمة)', (await ensureOpening({})).status === 'written');

  /* جهازان يكتبان الافتتاح بقيمتين مختلفتين: تعارض مُبلَّغ لا قصّ صامت */
  await resetAll();
  const z = await customers.create({ name: 'ز', creditBalance: 30, points: 0 });
  await ledgerRepo.append(makeEntry({ unit: 'wallet', acct: z.id, delta: 2000, type: 'opening', key: 'opening:wallet:' + z.id }, { dev: 'other', seq: 0 }));
  const dup = await ledgerRepo.append(makeEntry({ unit: 'wallet', acct: z.id, delta: 3000, type: 'opening', key: 'opening:wallet:' + z.id }, { dev: 'mine', seq: 0 }));
  t.test('12. افتتاحان مختلفان بنفس المعرّف ⟵ تعارض مُبلَّغ ولا يُستبدل', dup.conflict === true && dup.added === false);
  const rz = await loadShadowReport();
  t.test('13. ويظهر الفرق في التقرير (لا إخفاء)', rz.ok === false && rz.rows.some((r) => r.acct === z.id && r.diff === -1000));

  /* إعادة الضبط */
  const rs = await resetShadowLedger();
  t.test('14. إعادة ضبط الدفتر تعيد بناءه فيتطابق', rs.status === 'written' && (await loadShadowReport()).ok);
  reportDeps.syncState = () => ({ usedCloud: true, dirtySince: Date.now() });
  const rg = await resetShadowLedger();
  t.test('15. إعادة الضبط ترفض والمزامنة غير نظيفة (ولا تمسح شيئاً)', rg.status === 'gated' && (await ledgerRepo.count()) > 0);
  await resetAll();
  restoreReportDeps();
});

register('v3.3.79 ledger — التقرير والبطاقة', async (t) => {
  await resetAll();
  const rep0 = buildShadowReport([], []);
  t.test('1. تقرير فارغ سليم', rep0.ok === true && rep0.rows.length === 0 && buildShadowReport(null, null).ok === true);
  const a = await customers.create({ name: 'عميل <b>خطر</b>', creditBalance: 12.5, points: 3 });
  await ensureOpening({});
  await customers.update(a.id, { creditBalance: 99 });               /* العدّاد تغيّر خارج المحفظة */
  const rep = await loadShadowReport();
  const row = rep.rows.find((r) => r.unit === 'wallet');
  t.test('2. تغيير مباشر للعدّاد يظهر: ledger_less بفرق 8650 قرشاً', rep.ok === false && row && row.kind === 'ledger_less' && row.diff === 1250 - 9900);
  /* حساب يتيم */
  await idb.remove('customers', a.id);
  const rep2 = await loadShadowReport();
  t.test('3. عميل محذوف له أسطر ⟵ orphan_account', rep2.rows.some((r) => r.kind === 'orphan_account' && r.acct === a.id));
  t.test('4. تسميات الأنواع عربية وصيغة المقدار', Object.values(KIND_LABELS).every((s) => /[؀-ۿ]/.test(s)) && formatAmount('wallet', 1250) === '12.5 ج.م' && formatAmount('points', 7) === '7 نقطة');

  /* بطاقة الواجهة */
  await resetAll();
  const p = await customers.create({ name: 'عميل <img src=x onerror=alert(1)>', creditBalance: 20, points: 0 });
  const card = buildLedgerShadowCard();
  document.body.appendChild(card);
  await sleep(250);
  t.test('5. البطاقة تعرض فرقاً (لا أسطر افتتاحية بعد)', card.getAttribute('data-ok') === '0' && !!card.querySelector('[data-role="ledger-rows"] [data-kind="no_opening"]'));
  t.test('6. لا حقن HTML: اسم العميل يظهر نصاً لا عنصراً', !card.querySelector('img') && card.textContent.includes('<img'));
  card.querySelector('[data-action="ledger-opening"]').click();
  await sleep(500);
  t.test('7. زر الأسطر الافتتاحية يكتب فيتطابق ويتغيّر الملخص', card.getAttribute('data-ok') === '1' && /تطابق/.test(card.querySelector('[data-role="ledger-summary"]').textContent));
  t.test('8. الأزرار الثلاثة موجودة', !!card.querySelector('[data-action="ledger-refresh"]') && !!card.querySelector('[data-action="ledger-reset"]'));
  card.remove();
  await customers.remove(p.id);
  await resetAll();
});

register('v3.3.79 ledger — الاستعادة والمزامنة لا تفسدان الدفتر', async (t) => {
  await resetAll();
  const c = await customers.create({ name: 'عميل الاستعادة', creditBalance: 10, points: 0 });
  await ensureOpening({});
  await customers.walletTopUp(c.id, 5);
  const n = await ledgerRepo.count();

  /* نسخة قديمة بلا مخزن ledger */
  await idb.put('backups', { id: 'old-nolegder', createdAt: 1, stores: { customers: [{ id: 'old-c', name: 'قديم' }] } });
  const res = await restoreBackup('old-nolegder');
  t.test('1. استعادة نسخة قديمة بلا دفتر تنجح', res.ok === true);
  t.test('2. ولا تمسح الدفتر الحالي', (await ledgerRepo.count()) === n);
  const rep = await loadShadowReport();
  t.test('3. التقرير يرصد أن العدّادات المستعادة لا تطابق الدفتر (يُعرض ولا يُخفى)', rep.ok === false && rep.mismatches >= 1);
  await idb.remove('backups', 'old-nolegder');
  for (const b of await idb.getAll('backups')) { if (String(b.label || '').includes('قبل الاستعادة')) await idb.remove('backups', b.id); }

  /* لقطة سحابية ناقصة */
  const snap = await applySnapshot({ stores: { customers: [{ id: 'cloud-c', name: 'سحابي' }] } });
  t.test('4. لقطة سحابية بلا ledger لا تمسح الدفتر', snap.ok === true && (await ledgerRepo.count()) === n);
  /* لقطة تحمل الدفتر */
  const e = makeEntry({ unit: 'points', acct: 'cloud-c', delta: 4, type: 'award', key: 'cloud1' }, { dev: 'dcloud', seq: 0 });
  await applySnapshot({ stores: { ledger: [e] } });
  t.test('5. لقطة تحمل ledger تُكتب فيه', (await idb.get('ledger', 'k:cloud1')) !== undefined);
  /* مخزن مجهول يُتجاهل */
  const bad = await applySnapshot({ stores: { ledgerz: [{ id: 'x' }] } });
  t.test('6. مخزن غير معروف يُرفض بلا أثر', bad.ok === false);

  /* نسخة حديثة تحمل الدفتر: الاستعادة تستبدله */
  await resetAll();
  const c2 = await customers.create({ name: 'ن', creditBalance: 8, points: 0 });
  await ensureOpening({});
  const bk = await createBackup({ label: 'نسخة بدفتر' });
  await ledgerRepo.clearAll();
  const back = await restoreBackup(bk.id);
  t.test('7. نسخة تحمل الدفتر تعيده عند الاستعادة', back.ok === true && (await ledgerRepo.count()) === 1 && (await loadShadowReport()).ok);
  await deleteBackup(bk.id);
  for (const b of await idb.getAll('backups')) { if (String(b.label || '').includes('قبل الاستعادة')) await idb.remove('backups', b.id); }
  void c2;
  await resetAll();
  restoreReportDeps();
});
