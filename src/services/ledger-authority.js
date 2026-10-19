/* ==========================================================================
   ledger-authority.js — جاهزية تحويل الدفتر إلى «مرجع أساسي» (v3.3.81، الخطوة 2أ)
   ==========================================================================
   الخطوة 2أ = تجهيز فقط: مفتاح يدوي `settings.ledgerAuthority` + فحص جاهزية + تفعيل آمن.
   لا يقرأ أي كود مالي هذا المفتاح بعد (يبدأ استعماله في 2ب/2ج)، فلا يتغيّر أي سلوك مالي:
   العدّادات القديمة تبقى المرجع والدفتر يبقى ظلّياً.

   شروط الجاهزية (كلها لازمة):
     1) sync   — المزامنة نظيفة: لا تعديلات غير مرفوعة، لا توقّف (blocked)، لا تعارضات، لا طابور معلّق.
     2) diffs  — صفر فروق بين العدّادات القديمة والدفتر، لا إخفاقات كتابة، لا تحذيرات.
     3) backup — نسخة احتياطية جديدة (أحدث من 10 دقائق) اجتازت الفحص، وتطابق أعداد البيانات الحالية
                 (فلا تغيّر بعد أخذها).

   المفتاح محلي لهذا الجهاز: ليس ضمن مفاتيح الإعدادات المُزامَنة (settings-sync)، فلا ينتقل إلى جهاز
   آخر ولا يُفعَّل عنه. وإعادة نسخة احتياطية أقدم تعيده تلقائياً إلى «غير مفعّل».
   ========================================================================== */

import { settings } from '../data/repos/settings.js';
import * as idb from '../data/idb.js';
import { STORES } from '../core/config.js';
import { createBackup, verifyBackup } from './auto-backup.js';
import { loadShadowReport, reportDeps } from './ledger-report.js';
import { getDeviceId } from './ledger-shadow.js';
import { getBlocked } from '../sync/auto-sync.js';
import { countConflicts } from '../sync/conflict-log.js';
import { size as queueSize } from '../sync/offline-queue.js';

/** أقصى عمر للنسخة المقبولة قبل التفعيل (10 دقائق). */
export const BACKUP_MAX_AGE_MS = 10 * 60 * 1000;

/** المخازن التي تُقارَن أعدادها بين النسخة والبيانات الحالية (تغيّر = النسخة لم تعد مطابقة). */
export const LIVE_COUNT_STORES = Object.freeze([
  STORES.CUSTOMERS, STORES.ORDERS, STORES.PAYMENTS, STORES.INVENTORY, STORES.LEDGER,
]);

/** أسماء عربية للمخازن في الرسائل. */
const STORE_LABEL = Object.freeze({
  [STORES.CUSTOMERS]: 'العملاء', [STORES.ORDERS]: 'الطلبات', [STORES.PAYMENTS]: 'الدفعات',
  [STORES.INVENTORY]: 'المخزون', [STORES.LEDGER]: 'الدفتر',
});

/* ==========================================================================
   1. حالة المفتاح
   ========================================================================== */

/**
 * يُطبِّع حالة المفتاح المحفوظة (يتحمّل null/ناقص/غير صالح).
 * @param {*} raw
 * @returns {{enabled:boolean, enabledAt:number|null, disabledAt:number|null, deviceId:string|null, backupId:string|null, backupAt:number|null, checkedAt:number|null}}
 */
export function normalizeAuthority(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const str = (v) => (typeof v === 'string' && v ? v : null);
  return {
    enabled: r.enabled === true,
    enabledAt: num(r.enabledAt), disabledAt: num(r.disabledAt),
    deviceId: str(r.deviceId), backupId: str(r.backupId), backupAt: num(r.backupAt), checkedAt: num(r.checkedAt),
  };
}

/**
 * هل الدفتر مفعَّل كمرجع؟ (للخطوتين 2ب/2ج لاحقاً — في 2أ لا يستدعيه أي كود مالي.)
 * @param {Object} [settingsObj] — كائن الإعدادات من settings.get()
 * @returns {boolean}
 */
export function isLedgerAuthorityEnabled(settingsObj) {
  return normalizeAuthority(settingsObj && settingsObj.ledgerAuthority).enabled;
}

/* ==========================================================================
   2. الجاهزية (نقية)
   ========================================================================== */

const minutesSince = (ts, now) => Math.max(0, Math.round((now - ts) / 60000));

function checkSync(sync) {
  const base = { id: 'sync', label: 'المزامنة نظيفة' };
  if (!sync || typeof sync !== 'object') {
    return { ...base, ok: false, detail: 'تعذّر قراءة حالة المزامنة', hint: 'أعد الفحص' };
  }
  const problems = [];
  if (sync.dirtySince) problems.push('توجد تغييرات لم تُرفع إلى السحابة');
  if (sync.blocked) problems.push('الرفع التلقائي متوقف (' + sync.blocked + ')');
  if (Number(sync.conflicts) > 0) problems.push(sync.conflicts + ' تعارض مزامنة لم يُحسم');
  if (Number(sync.queueSize) > 0) problems.push(sync.queueSize + ' عملية معلّقة في طابور عدم الاتصال');
  if (problems.length > 0) {
    return { ...base, ok: false, detail: problems.join(' · '), hint: 'افتح «المزامنة السحابية»، ارفع التغييرات أو احسم التعارضات، ثم أعد الفحص' };
  }
  return { ...base, ok: true, detail: sync.usedCloud ? 'كل التغييرات مرفوعة ولا تعارضات' : 'جهاز واحد غير مربوط بحساب سحابي', hint: '' };
}

function checkDiffs(report) {
  const base = { id: 'diffs', label: 'صفر فروق بين العدّادات والدفتر' };
  if (!report || typeof report !== 'object') {
    return { ...base, ok: false, detail: 'تعذّر قراءة تقرير المطابقة', hint: 'أعد الفحص' };
  }
  const warns = (Array.isArray(report.anomalies) ? report.anomalies : []).filter((a) => a && a.severity === 'warn').length;
  const problems = [];
  if (Number(report.mismatches) > 0) problems.push(report.mismatches + ' فرق بين العدّادات والدفتر');
  if (Number(report.failures) > 0) problems.push('فشلت الكتابة في الدفتر ' + report.failures + ' مرة');
  if (warns > 0) problems.push(warns + ' تحذير في الدفتر');
  if (problems.length > 0) {
    return { ...base, ok: false, detail: problems.join(' · '), hint: 'راجع الفروق أعلاه؛ اكتب الأسطر الافتتاحية أو أعد ضبط الدفتر ثم أعد الفحص' };
  }
  return {
    ...base, ok: true, hint: '',
    detail: 'العدّادات تطابق الدفتر تماماً (' + (report.customers || 0) + ' عميل · ' + (report.items || 0) + ' صنف · ' + (report.entries || 0) + ' سطر)',
  };
}

function checkBackup(backup, live, now) {
  const base = { id: 'backup', label: 'نسخة احتياطية جديدة وسليمة' };
  if (!backup || typeof backup !== 'object') {
    return { ...base, ok: false, detail: 'لم تُؤخذ نسخة احتياطية بعد', hint: 'تُؤخذ وتُفحص تلقائياً عند الضغط على «فعّل»' };
  }
  const errors = Array.isArray(backup.errors) ? backup.errors : [];
  if (backup.ok !== true || errors.length > 0) {
    return { ...base, ok: false, detail: 'النسخة لم تجتز الفحص' + (errors[0] ? ': ' + errors[0] : ''), hint: 'أعد المحاولة؛ لا يُفعَّل الدفتر دون نسخة سليمة' };
  }
  const created = Number(backup.createdAt) || 0;
  if (!created || now - created > BACKUP_MAX_AGE_MS) {
    return { ...base, ok: false, detail: 'النسخة قديمة' + (created ? ' (منذ ' + minutesSince(created, now) + ' دقيقة)' : ''), hint: 'أعد المحاولة ليُؤخذ نسخة جديدة' };
  }
  if (live && typeof live === 'object') {
    const counts = backup.counts && typeof backup.counts === 'object' ? backup.counts : {};
    const changed = LIVE_COUNT_STORES.filter((s) => Number(counts[s]) !== Number(live[s]));
    if (changed.length > 0) {
      const s = changed[0];
      return {
        ...base, ok: false,
        detail: 'تغيّرت البيانات بعد أخذ النسخة (' + STORE_LABEL[s] + ': ' + (counts[s] ?? '؟') + ' في النسخة ↔ ' + live[s] + ' الآن)',
        hint: 'أعد المحاولة ليُؤخذ نسخة جديدة تطابق البيانات',
      };
    }
  }
  return { ...base, ok: true, hint: '', detail: 'نسخة قبل ' + minutesSince(created, now) + ' دقيقة، سليمة، وتطابق البيانات الحالية' };
}

/**
 * تقييم الجاهزية (دالة نقية، بلا قراءة من المخزن).
 * @param {Object} input
 * @param {Object|null} [input.sync] — {usedCloud, dirtySince, blocked, conflicts, queueSize}
 * @param {Object|null} [input.report] — نتيجة buildShadowReport
 * @param {Object|null} [input.backup] — {ok, errors, createdAt, counts} (نتيجة فحص النسخة)
 * @param {Object|null} [input.live] — أعداد المخازن الحالية {customers, orders, payments, inventory, ledger}
 * @param {Object|null} [input.current] — حالة المفتاح الحالية
 * @param {number} [now=Date.now()]
 * @returns {{ready:boolean, canAttempt:boolean, alreadyEnabled:boolean, checks:Array<{id,label,ok,detail,hint}>, blockers:Array, reason:string}}
 *   canAttempt: شرطا المزامنة والفروق متحققان (والنسخة تُؤخذ تلقائياً عند التفعيل).
 */
export function evaluateAuthorityReadiness(input = {}, now = Date.now()) {
  const inp = input && typeof input === 'object' ? input : {};
  const checks = [checkSync(inp.sync), checkDiffs(inp.report), checkBackup(inp.backup, inp.live, now)];
  const alreadyEnabled = normalizeAuthority(inp.current).enabled;
  const blockers = checks.filter((c) => !c.ok);
  const canAttempt = !alreadyEnabled && checks.filter((c) => c.id !== 'backup').every((c) => c.ok);
  const ready = !alreadyEnabled && blockers.length === 0;
  let reason = '';
  if (alreadyEnabled) reason = 'الدفتر مفعَّل بالفعل على هذا الجهاز';
  else if (blockers.length > 0) reason = 'لا يمكن التفعيل: ' + blockers[0].detail;
  return { ready, canAttempt, alreadyEnabled, checks, blockers, reason };
}

/* ==========================================================================
   3. التبعيات (قابلة للاستبدال في الاختبار) والتجميع من المخزن
   ========================================================================== */

/** قراءة حالة المزامنة الحالية. */
function defaultReadSync() {
  const st = reportDeps.syncState();
  return {
    usedCloud: !!st.usedCloud, dirtySince: st.dirtySince || null,
    blocked: getBlocked(), conflicts: countConflicts(), queueSize: queueSize(),
  };
}

/** أعداد المخازن الحالية. */
async function defaultCountLive() {
  const out = {};
  for (const s of LIVE_COUNT_STORES) out[s] = await idb.count(s);
  return out;
}

export const authorityDeps = {
  readSync: defaultReadSync,
  loadReport: () => loadShadowReport(),
  countLive: defaultCountLive,
  createBackup: (o) => createBackup(o),
  verifyBackup: (id) => verifyBackup(id),
  getAuthority: async () => normalizeAuthority((await settings.get()).ledgerAuthority),
  saveAuthority: (patch) => settings.update({ ledgerAuthority: patch }),
  deviceId: () => getDeviceId(),
  now: () => Date.now(),
};

/**
 * يجمع المدخلات الحية ويقيّم الجاهزية (للواجهة). يقبل report جاهزاً لتفادي قراءته مرتين.
 * @param {Object} [opts]
 * @param {Object} [opts.report] — تقرير مطابقة محمَّل سلفاً
 * @param {Object} [opts.deps] — تبعيات بديلة
 * @returns {Promise<Object>} نتيجة evaluateAuthorityReadiness + current
 */
export async function collectReadiness(opts = {}) {
  const d = { ...authorityDeps, ...(opts.deps || {}) };
  const [current, report] = await Promise.all([d.getAuthority(), opts.report ? Promise.resolve(opts.report) : d.loadReport()]);
  const res = evaluateAuthorityReadiness({ sync: d.readSync(), report, backup: null, live: null, current }, d.now());
  return { ...res, current };
}

/* ==========================================================================
   4. التفعيل والإلغاء
   ========================================================================== */

/**
 * تفعيل الدفتر كمرجع (مفتاح فقط — لا أثر مالي في 2أ). الخطوات:
 *   1) فحص مسبق (مزامنة + فروق)؛ أي إخفاق يوقف قبل أي كتابة.
 *   2) أخذ نسخة احتياطية جديدة وفحصها.
 *   3) إعادة قراءة كل الشروط بعد النسخة (قد تتغيّر البيانات أثناءها) والتأكد أن النسخة تطابقها.
 *   4) فقط إن اجتاز كل شيء: حفظ المفتاح.
 * لا يرمي: يُرجع status = activated | already | blocked | failed.
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 * @returns {Promise<{status:string, reason:string, readiness?:Object, backupId?:string}>}
 */
export async function activateLedgerAuthority(opts = {}) {
  const d = { ...authorityDeps, ...(opts.deps || {}) };
  try {
    const current = await d.getAuthority();
    if (current.enabled) return { status: 'already', reason: 'الدفتر مفعَّل بالفعل على هذا الجهاز' };

    /* 1) فحص مسبق قبل أي نسخة أو كتابة */
    const pre = evaluateAuthorityReadiness({ sync: d.readSync(), report: await d.loadReport(), current }, d.now());
    if (!pre.canAttempt) return { status: 'blocked', reason: pre.reason, readiness: pre };

    /* 2) نسخة جديدة + فحصها */
    const made = await d.createBackup({ label: 'قبل تفعيل الدفتر كمرجع' });
    if (!made || !made.ok) {
      return { status: 'failed', reason: 'تعذّر أخذ النسخة الاحتياطية: ' + ((made && made.error) || 'سبب غير معروف') };
    }
    const ver = await d.verifyBackup(made.id);

    /* 3) إعادة التقييم بعد النسخة (البيانات الحيّة + مطابقتها للنسخة) */
    const backup = { id: made.id, ok: !!(ver && ver.ok), errors: (ver && ver.errors) || [], createdAt: (ver && ver.createdAt) || 0, counts: (ver && ver.counts) || {} };
    const post = evaluateAuthorityReadiness({
      sync: d.readSync(), report: await d.loadReport(), backup, live: await d.countLive(), current,
    }, d.now());
    if (!post.ready) return { status: 'blocked', reason: post.reason, readiness: post, backupId: made.id };

    /* 4) حفظ المفتاح */
    const now = d.now();
    await d.saveAuthority({
      enabled: true, enabledAt: now, disabledAt: null, deviceId: d.deviceId(),
      backupId: made.id, backupAt: backup.createdAt, checkedAt: now,
    });
    return { status: 'activated', reason: '', readiness: post, backupId: made.id };
  } catch (e) {
    return { status: 'failed', reason: 'تعذّر التفعيل: ' + ((e && e.message) || e) };
  }
}

/**
 * إلغاء التفعيل (يعيد المفتاح إلى «غير مفعّل»). آمن دائماً: لا يغيّر أي بيانات.
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 * @returns {Promise<{status:'deactivated'|'already'|'failed', reason:string}>}
 */
export async function deactivateLedgerAuthority(opts = {}) {
  const d = { ...authorityDeps, ...(opts.deps || {}) };
  try {
    const current = await d.getAuthority();
    if (!current.enabled) return { status: 'already', reason: 'الدفتر غير مفعَّل أصلاً' };
    await d.saveAuthority({ enabled: false, disabledAt: d.now() });
    return { status: 'deactivated', reason: '' };
  } catch (e) {
    return { status: 'failed', reason: 'تعذّر الإلغاء: ' + ((e && e.message) || e) };
  }
}
