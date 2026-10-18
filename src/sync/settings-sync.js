/* ==========================================================================
   settings-sync.js — مزامنة إعدادات العمل بين الأجهزة (v3.3.25)
   ==========================================================================
   تُزامَن إعدادات «الورشة» فقط (الأسعار، الحد اليومي، المقاسات، الأنواع، المناسبات…).
   لا تُزامَن إعدادات الجهاز: المظهر والعرض والأمان وشاشة القفل والنسخ الاحتياطي.
   ولا يُزامَن الشعار (صورة كبيرة ثقيلة على كل رفع).

   الدمج لكل مفتاح على حدة بوقت آخر تعديل (الأحدث يفوز):
     sidecar { id:'sync_settings_meta', times:{ key: ms } } في مخزن settings
     يُحدَّث من settings.save() عند تغيّر مفتاح مُزامَن فعلاً (مقارنة مستقرة بترتيب المفاتيح).
   تنتقل في المانيفست كمخزن وهمي «settingsSync» بسجل واحد { id, values, times }.
   مفتاح لم يُسجَّل وقته قط وقيمته غير الافتراضية يُنسب لوقت حفظ سجل الإعدادات.
   ========================================================================== */

import * as idb from '../data/idb.js';
import { STORES, DEFAULT_SETTINGS } from '../core/config.js';
import { markDirty } from './dirty-state.js';

export const SETTINGS_SYNC_KEYS = [
  'workshop', 'measurementFields', 'jalabiyaTypes', 'occasions', 'inventory',
  'dailyLimit', 'grouping', 'pricingCalculator', 'autoMessages', 'depositPolicy',
];
const EXCLUDE_FIELDS = { workshop: ['logo'] };
const META_KEY = 'sync_settings_meta';
const MAIN_ID = 'main';
/** معرّفات سجلات الإعدادات التي تكتبها المزامنة (تُحرَس بـ updatedAt عند التطبيق). */
export const SETTINGS_RECORD_IDS = [MAIN_ID, META_KEY];

/** JSON بترتيب مفاتيح ثابت (لمقارنة لا تتأثر بترتيب الحقول). */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

function pick(key, value) {
  const ex = EXCLUDE_FIELDS[key];
  if (ex && value && typeof value === 'object' && !Array.isArray(value)) {
    const o = { ...value };
    for (const f of ex) delete o[f];
    return o;
  }
  return value;
}

async function loadTimes() {
  const r = await idb.get(STORES.SETTINGS, META_KEY);
  return r && r.times && typeof r.times === 'object' ? { ...r.times } : {};
}

/**
 * يُستدعى من settings.save() بعد الحفظ: يختم وقت المفاتيح المُزامَنة التي تغيّرت فعلاً
 * ويضع علامة «غير مرفوع». لا يُلقي أخطاء أبداً (الحفظ أهم من المزامنة).
 */
export async function noteSaved(oldRec, newRec) {
  try {
    const changed = [];
    for (const k of SETTINGS_SYNC_KEYS) {
      const a = pick(k, oldRec && oldRec[k] !== undefined ? oldRec[k] : DEFAULT_SETTINGS[k]);
      const b = pick(k, newRec && newRec[k] !== undefined ? newRec[k] : DEFAULT_SETTINGS[k]);
      if (stable(a) !== stable(b)) changed.push(k);
    }
    if (changed.length === 0) return;
    const times = await loadTimes();
    const now = Date.now();
    for (const k of changed) times[k] = now;
    await idb.put(STORES.SETTINGS, { id: META_KEY, times, updatedAt: now });
    markDirty();
  } catch (e) {
    console.warn('[settings-sync] noteSaved:', e);
  }
}

/** السجل المحلي للرفع: { id:'settings', values, times }. */
export async function buildLocal() {
  const main = await idb.get(STORES.SETTINGS, MAIN_ID);
  const stored = await loadTimes();
  const base = (main && Number(main.updatedAt)) || 0;
  const values = {};
  const times = {};
  for (const k of SETTINGS_SYNC_KEYS) {
    if (!main || main[k] === undefined) continue;
    values[k] = pick(k, main[k]);
    let t = Number(stored[k]) || 0;
    if (!t && stable(values[k]) !== stable(pick(k, DEFAULT_SETTINGS[k]))) t = base;   /* عُدّل قبل بدء التتبّع */
    times[k] = t;
  }
  return { id: 'settings', values, times };
}

/**
 * خطة تطبيق إعدادات السحابة محلياً (لا تكتب شيئاً — تُرجع سجلات تُدرج في writeBatch الذرّي).
 * @param {{values?:Object, times?:Object}|null} cloudRec
 * @param {'merge'|'replace'} mode
 * @returns {Promise<{records:Array, pending:number, applied:number}>}
 *   pending: مفاتيح محلية أحدث (وقيمتها مختلفة) لم تُرفع بعد · applied: مفاتيح أُخذت من السحابة
 */
export async function planApply(cloudRec, mode) {
  if (!cloudRec || !cloudRec.values || typeof cloudRec.values !== 'object') return { records: [], pending: 0, applied: 0 };
  const main = await idb.get(STORES.SETTINGS, MAIN_ID);
  const local = await buildLocal();
  const times = await loadTimes();
  const newMain = { ...(main || {}) };
  let applied = 0, pending = 0;

  for (const k of SETTINGS_SYNC_KEYS) {
    if (!(k in cloudRec.values)) continue;
    const cT = Number(cloudRec.times && cloudRec.times[k]) || 0;
    const lT = Number(local.times[k]) || 0;
    const cVal = cloudRec.values[k];
    const lVal = local.values[k] !== undefined ? local.values[k] : pick(k, DEFAULT_SETTINGS[k]);
    const differs = stable(cVal) !== stable(lVal);
    if (mode === 'replace' || (cT > lT && differs)) {
      if (differs) {
        const ex = EXCLUDE_FIELDS[k];
        let v = cVal;
        if (ex && v && typeof v === 'object' && !Array.isArray(v) && main && main[k] && typeof main[k] === 'object') {
          v = { ...v };
          for (const f of ex) if (main[k][f] !== undefined) v[f] = main[k][f];   /* الشعار المحلي يبقى */
        }
        newMain[k] = v;
        applied++;
      }
      times[k] = cT;
    } else if (lT > cT && differs) {
      pending++;
    } else if (!differs && cT > lT) {
      times[k] = cT;
    }
  }

  const now = Date.now();
  const records = [];
  if (applied > 0) {
    newMain.id = MAIN_ID;
    newMain.createdAt = (main && main.createdAt) || now;
    newMain.updatedAt = now;
    records.push(newMain);
  }
  records.push({ id: META_KEY, times, updatedAt: now });
  return { records, pending, applied };
}
