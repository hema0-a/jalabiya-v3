/* ==========================================================================
   v3381-ledger-authority.test.js — جاهزية تحويل الدفتر إلى مرجع (الخطوة 2أ، v3.3.81)
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { settings } from '../../data/repos/settings.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import { ledgerRepo } from '../../data/repos/ledger.js';
import { listBackups, deleteBackup } from '../../services/auto-backup.js';
import { reportDeps } from '../../services/ledger-report.js';
import { _resetShadowState, resetShadowFailures } from '../../services/ledger-shadow.js';
import {
  BACKUP_MAX_AGE_MS, LIVE_COUNT_STORES, normalizeAuthority, isLedgerAuthorityEnabled,
  evaluateAuthorityReadiness, collectReadiness, activateLedgerAuthority, deactivateLedgerAuthority,
} from '../../services/ledger-authority.js';

const NOW = 1_800_000_000_000;
const cleanSync = { usedCloud: true, dirtySince: null, blocked: null, conflicts: 0, queueSize: 0 };
const cleanReport = { mismatches: 0, failures: 0, anomalies: [], customers: 3, items: 2, entries: 9 };
const liveCounts = { customers: 3, orders: 5, payments: 4, inventory: 2, ledger: 9 };
const goodBackup = (over = {}) => ({
  id: 'b1', ok: true, errors: [], createdAt: NOW - 2 * 60000, counts: { ...liveCounts }, ...over,
});
const ready = (over = {}) => evaluateAuthorityReadiness({
  sync: cleanSync, report: cleanReport, backup: goodBackup(), live: liveCounts, current: null, ...over,
}, NOW);
const byId = (res, id) => res.checks.find((c) => c.id === id);

/** تبعيات اصطناعية تسجّل ترتيب الاستدعاء. */
function fakeDeps(over = {}) {
  const calls = [];
  const log = (n, v) => (...a) => { calls.push(n); return typeof v === 'function' ? v(...a) : v; };
  const deps = {
    getAuthority: log('getAuthority', async () => normalizeAuthority(null)),
    readSync: log('readSync', () => cleanSync),
    loadReport: log('loadReport', async () => cleanReport),
    createBackup: log('createBackup', async () => ({ ok: true, id: 'bk-1' })),
    verifyBackup: log('verifyBackup', async () => ({ ok: true, errors: [], createdAt: NOW - 1000, counts: { ...liveCounts } })),
    countLive: log('countLive', async () => liveCounts),
    saveAuthority: log('saveAuthority', async () => ({})),
    deviceId: () => 'dev1',
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}

register('v3.3.81 ledger authority — الجاهزية النقية', async (t) => {
  await t.test('1. كل الشروط متحققة ونسخة سليمة ⟵ جاهز', ready().ready === true && ready().canAttempt === true && ready().reason === '');

  let r = ready({ sync: { ...cleanSync, dirtySince: NOW - 5000 } });
  await t.test('2. تغييرات غير مرفوعة ⟵ المزامنة غير نظيفة والتفعيل ممنوع بسبب واضح',
    !byId(r, 'sync').ok && /لم تُرفع/.test(byId(r, 'sync').detail) && !r.ready && !r.canAttempt && r.reason.startsWith('لا يمكن التفعيل:'));

  r = ready({ sync: { usedCloud: true, dirtySince: null, blocked: 'conflict', conflicts: 2, queueSize: 3 } });
  const d = byId(r, 'sync').detail;
  await t.test('3. توقف المزامنة والتعارضات والطابور تُذكر كلها', !byId(r, 'sync').ok && /متوقف \(conflict\)/.test(d) && /2 تعارض/.test(d) && /3 عملية معلّقة/.test(d));
  await t.test('4. جهاز غير مربوط بحساب سحابي ونظيف ⟵ يمر', byId(ready({ sync: { ...cleanSync, usedCloud: false } }), 'sync').ok);
  await t.test('5. حالة مزامنة مجهولة (null) ⟵ فشل لا استثناء', byId(ready({ sync: null }), 'sync').ok === false);

  r = ready({ report: { ...cleanReport, mismatches: 3 } });
  await t.test('6. فروق ⟵ مرفوض مع العدد', !byId(r, 'diffs').ok && /3 فرق/.test(byId(r, 'diffs').detail) && !r.canAttempt);
  r = ready({ report: { ...cleanReport, failures: 2, anomalies: [{ severity: 'warn' }, { severity: 'info' }] } });
  await t.test('7. فشل كتابة وتحذيرات الدفتر ⟵ مرفوض (المعلوماتية لا تُحتسب)', /فشلت الكتابة في الدفتر 2 مرة/.test(byId(r, 'diffs').detail) && /1 تحذير/.test(byId(r, 'diffs').detail));
  await t.test('8. تقرير مفقود ⟵ مرفوض', byId(ready({ report: null }), 'diffs').ok === false);
  await t.test('9. نظام فارغ (لا عملاء ولا أسطر) ⟵ صفر فروق مقبول',
    byId(ready({ report: { mismatches: 0, failures: 0, anomalies: [], customers: 0, items: 0, entries: 0 } }), 'diffs').ok);

  r = ready({ backup: null, live: null });
  await t.test('10. بلا نسخة ⟵ شرط النسخة غير متحقق لكن المحاولة مسموحة (تُؤخذ تلقائياً)',
    !byId(r, 'backup').ok && r.canAttempt === true && r.ready === false && /لم تُؤخذ/.test(byId(r, 'backup').detail));
  r = ready({ backup: goodBackup({ ok: false, errors: ['المخزن الأساسي «orders» مفقود من النسخة'] }) });
  await t.test('11. نسخة لم تجتز الفحص ⟵ مرفوضة مع أول خطأ', !byId(r, 'backup').ok && /orders/.test(byId(r, 'backup').detail));
  r = ready({ backup: goodBackup({ createdAt: NOW - BACKUP_MAX_AGE_MS - 60000 }) });
  await t.test('12. نسخة أقدم من 10 دقائق ⟵ مرفوضة', !byId(r, 'backup').ok && /قديمة/.test(byId(r, 'backup').detail));
  await t.test('13. نسخة بعمر 10 دقائق تماماً مقبولة', byId(ready({ backup: goodBackup({ createdAt: NOW - BACKUP_MAX_AGE_MS }) }), 'backup').ok);
  r = ready({ backup: goodBackup({ counts: { ...liveCounts, orders: 4 } }) });
  await t.test('14. تغيّرت الطلبات بعد النسخة ⟵ مرفوضة وتذكر المخزن والرقمين', !byId(r, 'backup').ok && /الطلبات/.test(byId(r, 'backup').detail) && /4/.test(byId(r, 'backup').detail) && /5/.test(byId(r, 'backup').detail));
  const noLedgerCount = { ...liveCounts }; delete noLedgerCount.ledger;
  await t.test('15. عدد مخزن ناقص في النسخة يُعدّ تغيّراً', !byId(ready({ backup: goodBackup({ counts: noLedgerCount }) }), 'backup').ok);
  await t.test('16. المخازن المقارَنة تشمل الدفتر والمخزون والعملاء والطلبات والدفعات',
    ['customers', 'orders', 'payments', 'inventory', 'ledger'].every((s) => LIVE_COUNT_STORES.includes(s)));

  r = ready({ current: { enabled: true } });
  await t.test('17. مفعَّل بالفعل ⟵ لا جاهز ولا محاولة', r.alreadyEnabled && !r.ready && !r.canAttempt && /مفعَّل بالفعل/.test(r.reason));
  await t.test('18. مدخلات غريبة لا تُسقط الدالة',
    evaluateAuthorityReadiness(null).ready === false && evaluateAuthorityReadiness('x').checks.length === 3 && evaluateAuthorityReadiness({}).canAttempt === false);

  await t.test('19. normalizeAuthority يتحمّل null/نصوص/أرقام سالبة',
    normalizeAuthority(null).enabled === false && normalizeAuthority({ enabled: 'true' }).enabled === false
    && normalizeAuthority({ enabled: true, enabledAt: -5, backupId: 7 }).enabledAt === null && normalizeAuthority({ enabled: true, backupId: 'abc' }).backupId === 'abc');
  await t.test('20. isLedgerAuthorityEnabled', isLedgerAuthorityEnabled({ ledgerAuthority: { enabled: true } }) === true && isLedgerAuthorityEnabled({}) === false && isLedgerAuthorityEnabled(null) === false);
  await t.test('21. المفتاح افتراضياً مغلق ومحلي (ليس ضمن مفاتيح المزامنة)',
    DEFAULT_SETTINGS.ledgerAuthority.enabled === false && !SETTINGS_SYNC_KEYS.includes('ledgerAuthority'));
});

register('v3.3.81 ledger authority — مسار التفعيل (تبعيات اصطناعية)', async (t) => {
  let { deps, calls } = fakeDeps();
  let saved = null;
  deps.saveAuthority = async (p) => { calls.push('saveAuthority'); saved = p; };
  let res = await activateLedgerAuthority({ deps });
  await t.test('1. نجاح كامل: activated والمفتاح يُحفظ مرة واحدة بمعرّف النسخة', res.status === 'activated' && calls.filter((c) => c === 'saveAuthority').length === 1
    && saved.enabled === true && saved.backupId === 'bk-1' && saved.enabledAt === NOW && saved.deviceId === 'dev1' && saved.disabledAt === null);
  await t.test('2. الترتيب: فحص مسبق ← نسخة ← فحص النسخة ← إعادة قراءة ← حفظ',
    calls.indexOf('createBackup') < calls.indexOf('verifyBackup') && calls.indexOf('verifyBackup') < calls.indexOf('countLive')
    && calls.indexOf('countLive') < calls.indexOf('saveAuthority') && calls.indexOf('loadReport') < calls.indexOf('createBackup')
    && calls.filter((c) => c === 'loadReport').length === 2);

  ({ deps, calls } = fakeDeps({ readSync: () => ({ ...cleanSync, dirtySince: NOW - 1 }) }));
  res = await activateLedgerAuthority({ deps });
  await t.test('3. مزامنة غير نظيفة ⟵ blocked قبل أي نسخة أو كتابة', res.status === 'blocked' && /لم تُرفع/.test(res.reason)
    && !calls.includes('createBackup') && !calls.includes('saveAuthority'));

  ({ deps, calls } = fakeDeps({ loadReport: async () => ({ ...cleanReport, mismatches: 2 }) }));
  res = await activateLedgerAuthority({ deps });
  await t.test('4. فروق ⟵ blocked قبل أي نسخة أو كتابة', res.status === 'blocked' && /2 فرق/.test(res.reason) && !calls.includes('createBackup') && !calls.includes('saveAuthority'));

  ({ deps, calls } = fakeDeps({ createBackup: async () => ({ ok: false, error: 'مساحة ممتلئة' }) }));
  res = await activateLedgerAuthority({ deps });
  await t.test('5. فشل أخذ النسخة ⟵ failed ولا حفظ', res.status === 'failed' && /مساحة ممتلئة/.test(res.reason) && !calls.includes('saveAuthority') && !calls.includes('verifyBackup'));

  ({ deps, calls } = fakeDeps({ verifyBackup: async () => ({ ok: false, errors: ['النسخة لا تحتوي مخازن بيانات'], createdAt: NOW, counts: {} }) }));
  res = await activateLedgerAuthority({ deps });
  await t.test('6. نسخة لم تجتز الفحص ⟵ blocked ولا حفظ', res.status === 'blocked' && /لم تجتز الفحص/.test(res.reason) && !calls.includes('saveAuthority'));

  ({ deps, calls } = fakeDeps({ countLive: async () => ({ ...liveCounts, payments: 5 }) }));
  res = await activateLedgerAuthority({ deps });
  await t.test('7. تغيّرت البيانات أثناء النسخة ⟵ blocked ولا حفظ', res.status === 'blocked' && /الدفعات/.test(res.reason) && !calls.includes('saveAuthority'));

  let n = 0;
  ({ deps, calls } = fakeDeps({ readSync: () => { n += 1; return n === 1 ? cleanSync : { ...cleanSync, dirtySince: NOW }; } }));
  res = await activateLedgerAuthority({ deps });
  await t.test('8. صارت المزامنة غير نظيفة بعد النسخة ⟵ blocked ولا حفظ', res.status === 'blocked' && !calls.includes('saveAuthority'));

  ({ deps, calls } = fakeDeps({ getAuthority: async () => normalizeAuthority({ enabled: true }) }));
  res = await activateLedgerAuthority({ deps });
  await t.test('9. مفعَّل بالفعل ⟵ already بلا نسخة ولا حفظ', res.status === 'already' && !calls.includes('createBackup') && !calls.includes('saveAuthority'));

  ({ deps } = fakeDeps({ loadReport: async () => { throw new Error('boom'); } }));
  res = await activateLedgerAuthority({ deps });
  await t.test('10. استثناء داخلي ⟵ failed بدل الرمي', res.status === 'failed' && /boom/.test(res.reason));

  ({ deps, calls } = fakeDeps({ getAuthority: async () => normalizeAuthority({ enabled: true, enabledAt: 5 }) }));
  saved = null; deps.saveAuthority = async (p) => { saved = p; };
  res = await deactivateLedgerAuthority({ deps });
  await t.test('11. الإلغاء يحفظ enabled=false مع disabledAt', res.status === 'deactivated' && saved.enabled === false && saved.disabledAt === NOW);
  ({ deps } = fakeDeps());
  res = await deactivateLedgerAuthority({ deps });
  await t.test('12. إلغاء غير المفعَّل ⟵ already', res.status === 'already');

  ({ deps } = fakeDeps());
  const cr = await collectReadiness({ deps, report: cleanReport });
  await t.test('13. collectReadiness يعيد التقييم مع الحالة ويقبل تقريراً جاهزاً بلا إعادة قراءته',
    cr.canAttempt === true && cr.current.enabled === false && cr.checks.length === 3);
});

register('v3.3.81 ledger authority — على القاعدة الفعلية', async (t) => {
  const prev = normalizeAuthority((await settings.get()).ledgerAuthority);
  const prevSync = reportDeps.syncState;
  const prevTypes = JSON.stringify((await settings.get()).jalabiyaTypes);
  const madeBackups = [];
  const cleanupBackups = async () => { for (const id of madeBackups.splice(0)) await deleteBackup(id); };
  const reset = async () => {
    await ledgerRepo.clearAll(); await idb.clear('inventory'); await idb.clear('customers');
    _resetShadowState(); resetShadowFailures();
    await settings.update({ ledgerAuthority: { enabled: false, enabledAt: null, disabledAt: null, deviceId: null, backupId: null, backupAt: null, checkedAt: null } });
  };
  try {
    await reset();
    reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });

    const before = (await listBackups()).length;
    await t.test('1. المفتاح الافتراضي في الإعدادات الفعلية مغلق', (await settings.get()).ledgerAuthority.enabled === false);

    /* فرق: صنف بكمية بلا سطر في الدفتر (كتابة مباشرة تتجاوز الدفتر الظلّي) */
    await idb.put('inventory', { id: 'inv-x', name: 'قماش', quantity: 5, createdAt: Date.now(), updatedAt: Date.now() });
    let res = await activateLedgerAuthority();
    await t.test('2. فرق حقيقي ⟵ blocked بلا نسخة جديدة وبلا تفعيل',
      res.status === 'blocked' && /فرق/.test(res.reason) && (await listBackups()).length === before && !isLedgerAuthorityEnabled(await settings.get()));
    await idb.clear('inventory');

    /* مزامنة غير نظيفة */
    reportDeps.syncState = () => ({ usedCloud: true, dirtySince: Date.now() });
    res = await activateLedgerAuthority();
    await t.test('3. مزامنة غير نظيفة ⟵ blocked بلا نسخة وبلا تفعيل',
      res.status === 'blocked' && /لم تُرفع/.test(res.reason) && (await listBackups()).length === before && !isLedgerAuthorityEnabled(await settings.get()));
    reportDeps.syncState = () => ({ usedCloud: false, dirtySince: null });

    /* نجاح فعلي */
    const settingsBefore = await settings.get();
    res = await activateLedgerAuthority();
    if (res.backupId) madeBackups.push(res.backupId);
    const after = await settings.get();
    await t.test('4. نظام نظيف ⟵ activated والمفتاح محفوظ بمعرّف نسخة موجودة فعلاً',
      res.status === 'activated' && after.ledgerAuthority.enabled === true && after.ledgerAuthority.backupId === res.backupId
      && (await listBackups()).some((b) => b.id === res.backupId) && !!after.ledgerAuthority.enabledAt);
    await t.test('5. التفعيل لا يغيّر أي إعداد آخر (لا أثر مالي)',
      JSON.stringify(after.jalabiyaTypes) === prevTypes && JSON.stringify(after.dailyLimit) === JSON.stringify(settingsBefore.dailyLimit)
      && JSON.stringify(after.depositPolicy) === JSON.stringify(settingsBefore.depositPolicy) && (await ledgerRepo.count()) === 0);

    res = await activateLedgerAuthority();
    await t.test('6. تفعيل ثانٍ ⟵ already (لا نسخة جديدة)', res.status === 'already');

    const off = await deactivateLedgerAuthority();
    const offState = (await settings.get()).ledgerAuthority;
    await t.test('7. الإلغاء يعيد المفتاح مغلقاً ويُبقي سجل النسخة ووقت الإلغاء',
      off.status === 'deactivated' && offState.enabled === false && !!offState.disabledAt && !!offState.backupId);
  } finally {
    reportDeps.syncState = prevSync;
    await cleanupBackups();
    await reset();
    await settings.update({ ledgerAuthority: prev });
  }
});
