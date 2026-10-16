/* ==========================================================================
   record-schema.js — ترحيل السجلات القديمة إلى آخر شكل بيانات (لكل سجل)
   ==========================================================================
   السجل يحمل رقم نسخته (_v) — انظر record-meta.js. عند فتح التطبيق (وبعد كل كتابة دفعية:
   مزامنة/استعادة/استيراد) تُرحَّل السجلات الأقدم بالترتيب (2 ثم 3 ثم …) بدوال RECORD_MIGRATIONS.

   ضمانات الأمان:
     - نسخة احتياطية تلقائية قبل أول تعديل (فإن فشلت النسخة لا يُرحَّل شيء).
     - إن فشلت دالة ترحيل لسجل: يبقى السجل كما هو (لا يُكتب نصف مرحَّل) وتُسجَّل المشكلة ويُعاد المحاولة لاحقاً.
     - كتابة ذرّية لكل مخزن (writeBatch)، وسجل التسجيل مرحلة واحدة لا تُلمس.
     - id/createdAt/updatedAt لا تتغير (فلا يطغى السجل المرحَّل على تعديلات أجهزة أخرى).
     - سجل بنسخة أحدث من المعروفة (من تطبيق أحدث على جهاز آخر) لا يُلمس.
     - سجل ترحيلات غير صالح (فجوات/تكرار/دوال ناقصة) يوقف التشغيل كله دون أي كتابة.
   لا استيراد من services (لا دوران): النسخة الاحتياطية تُمرَّر كاعتمادية (backup).
   ========================================================================== */

import * as idbDefault from './idb.js';
import { RECORD_MIGRATIONS, recordVersion, latestVersion } from './record-meta.js';

const CHECKED_KEY = 'jalabiya_v3_record_schema_checked';

/**
 * فحص سجل الترحيلات.
 * @param {Object} migrations
 * @returns {string[]} قائمة المشاكل (فارغة = سليم)
 */
export function validateMigrations(migrations) {
  const problems = [];
  if (!migrations || typeof migrations !== 'object') return ['سجل الترحيلات ليس كائناً'];
  for (const [store, list] of Object.entries(migrations)) {
    if (!Array.isArray(list)) { problems.push(`«${store}»: القائمة ليست مصفوفة`); continue; }
    let prev = 1;
    for (const m of list) {
      if (!m || typeof m.up !== 'function') { problems.push(`«${store}»: ترحيل بلا دالة up`); continue; }
      if (!Number.isInteger(m.to) || m.to < 2) { problems.push(`«${store}»: رقم to غير صالح (${m && m.to})`); continue; }
      if (m.to !== prev + 1) problems.push(`«${store}»: الأرقام يجب أن تتتابع (توقعت ${prev + 1} فوجدت ${m.to})`);
      prev = m.to;
    }
  }
  return problems;
}

/**
 * ترحيل سجل واحد (نقي: لا يكتب شيئاً).
 * @returns {{record:Object, changed:boolean, from:number, to:number, error?:Error}}
 */
export function migrateRecord(store, rec, migrations = RECORD_MIGRATIONS) {
  const from = recordVersion(rec);
  const steps = (migrations[store] || []).filter((m) => m.to > from).sort((a, b) => a.to - b.to);
  if (steps.length === 0) return { record: rec, changed: false, from, to: from };
  const keep = { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt };
  let cur = rec;
  let to = from;
  try {
    for (const step of steps) {
      const draft = { ...cur };
      const res = step.up(draft);
      const next = res === undefined ? draft : res;
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('دالة الترحيل لم تُرجع كائناً');
      cur = { ...next, _v: step.to };
      to = step.to;
    }
  } catch (error) {
    return { record: rec, changed: false, from, to: from, error };
  }
  cur.id = keep.id;
  if (keep.createdAt !== undefined) cur.createdAt = keep.createdAt;
  if (keep.updatedAt !== undefined) cur.updatedAt = keep.updatedAt;
  return { record: cur, changed: true, from, to };
}

function readChecked() {
  try { return JSON.parse(localStorage.getItem(CHECKED_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeChecked(obj) {
  try { localStorage.setItem(CHECKED_KEY, JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

/** هل لأي من هذه المخازن ترحيلات؟ (تحقق رخيص قبل جدولة الفحص بعد الكتابة الدفعية). */
export function hasMigrationsFor(names, migrations = RECORD_MIGRATIONS) {
  return (names || []).some((n) => Array.isArray(migrations[n]) && migrations[n].length > 0);
}

/**
 * تشغيل الترحيل.
 * @param {Object} [opts]
 * @param {Object} [opts.migrations] — الافتراضي RECORD_MIGRATIONS (يُحقن في الاختبار)
 * @param {Object} [opts.db] — واجهة idb (getAll, writeBatch)
 * @param {Function} [opts.backup] — async ({label}) => ({ok, id?, error?}) نسخة أمان قبل أول تعديل
 * @param {boolean} [opts.force=false] — تجاهل «تم فحصه من قبل» (بعد مزامنة/استعادة/استيراد)
 * @param {Object} [opts.cache] — { get(), set(obj) } لتخزين «آخر نسخة فُحصت»
 * @param {string[]} [opts.only] — حصر الفحص بهذه المخازن
 * @returns {Promise<{ok:boolean, migrated:number, failed:number, scanned:number, backupId:(string|null), aborted:boolean, error?:string, perStore:Object}>}
 */
export async function runRecordMigrations(opts = {}) {
  const {
    migrations = RECORD_MIGRATIONS,
    db = idbDefault,
    backup = null,
    force = false,
    cache = { get: readChecked, set: writeChecked },
    only = null,
  } = opts;

  const result = { ok: true, migrated: 0, failed: 0, scanned: 0, backupId: null, aborted: false, perStore: {} };

  const problems = validateMigrations(migrations);
  if (problems.length) {
    console.error('[record-schema] سجل الترحيلات غير صالح — لم يُنفَّذ شيء:', problems);
    return { ...result, ok: false, aborted: true, error: problems.join(' | ') };
  }

  const checked = { ...cache.get() };
  let backedUp = false;
  let dirtyCache = false;

  for (const store of Object.keys(migrations)) {
    if (only && !only.includes(store)) continue;
    const latest = latestVersion(store, migrations);
    if (latest <= 1) continue;
    if (!force && checked[store] === latest) { result.perStore[store] = { skipped: true }; continue; }

    let all;
    try { all = await db.getAll(store); }
    catch (e) { console.warn('[record-schema] تعذّرت قراءة', store, e); result.failed++; result.perStore[store] = { error: String(e && e.message || e) }; continue; }
    all = Array.isArray(all) ? all : [];
    result.scanned += all.length;

    const stale = all.filter((r) => r && typeof r === 'object' && r.id != null && recordVersion(r) < latest);
    if (stale.length === 0) {
      if (checked[store] !== latest) { checked[store] = latest; dirtyCache = true; }
      result.perStore[store] = { migrated: 0, failed: 0 };
      continue;
    }

    /* نسخة أمان قبل أول تعديل لأي مخزن — إن فشلت لا نعدّل شيئاً */
    if (!backedUp) {
      if (typeof backup === 'function') {
        let b;
        try { b = await backup({ label: `قبل ترحيل البيانات (مخزن «${store}» → v${latest})` }); }
        catch (e) { b = { ok: false, error: String(e && e.message || e) }; }
        if (!b || !b.ok) {
          console.error('[record-schema] فشلت نسخة الأمان — أوقفت الترحيل:', b && b.error);
          result.ok = false; result.aborted = true; result.error = 'تعذّر إنشاء نسخة أمان قبل الترحيل' + (b && b.error ? ': ' + b.error : '');
          if (dirtyCache) cache.set(checked);
          return result;
        }
        result.backupId = b.id || null;
      }
      backedUp = true;
    }

    const out = [];
    let failed = 0;
    for (const rec of stale) {
      const r = migrateRecord(store, rec, migrations);
      if (r.error) {
        failed++;
        console.warn('[record-schema] فشل ترحيل سجل', store, rec.id, r.error);
      } else if (r.changed) {
        out.push(r.record);
      }
    }
    if (out.length) {
      try { await db.writeBatch({ [store]: { records: out } }); }
      catch (e) {
        console.error('[record-schema] فشلت كتابة', store, e);
        result.ok = false; result.failed += out.length; result.perStore[store] = { migrated: 0, failed: out.length + failed, error: String(e && e.message || e) };
        continue;
      }
    }
    result.migrated += out.length;
    result.failed += failed;
    result.perStore[store] = { migrated: out.length, failed };
    if (failed === 0) { checked[store] = latest; dirtyCache = true; }
    else result.ok = false;
  }

  if (dirtyCache) cache.set(checked);
  return result;
}

/**
 * جدولة فحص بعد الكتابة الدفعية (مزامنة/استعادة/استيراد): تأجيل قصير + دمج الطلبات المتتالية.
 * @param {Object} deps — { onBatchWrite, run } (للاختبار)
 */
export function installBatchMigrationHook(deps = {}) {
  const { onBatchWrite = idbDefault.onBatchWrite, run = (names) => runRecordMigrations({ force: true, only: names }), delayMs = 400, migrations = RECORD_MIGRATIONS } = deps;
  let timer = null;
  let running = false;
  let pending = new Set();

  const flush = async () => {
    timer = null;
    if (running) { timer = setTimeout(flush, delayMs); return; }
    const names = [...pending].filter((n) => Array.isArray(migrations[n]) && migrations[n].length > 0);
    pending = new Set();
    if (!names.length) return;
    running = true;
    try { await run(names); }
    catch (e) { console.warn('[record-schema] ترحيل ما بعد الكتابة الدفعية فشل:', e); }
    finally { running = false; }
  };

  onBatchWrite((names) => {
    let any = false;
    for (const n of names || []) { if (Array.isArray(migrations[n]) && migrations[n].length > 0) { pending.add(n); any = true; } }
    if (!any) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });
  return { flushNow: flush };
}
