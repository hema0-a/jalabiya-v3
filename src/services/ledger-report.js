/* ==========================================================================
   ledger-report.js — الأسطر الافتتاحية + تقرير مطابقة العدّادات للدفتر (v3.3.79)
   ==========================================================================
   في الوضع الظلّي العدّادات القديمة هي المرجع، والدفتر يُقارَن بها. هذا الملف:
     1) ensureOpening: يكتب «سطراً افتتاحياً» لكل (عميل، وحدة) ليبدأ الدفتر من الرصيد الحالي.
        - المقدار = العدّاد القديم − ما سُجِّل ظلّياً فعلاً (فلا تُحتسب حركة مرتين إن سبقت الافتتاح).
        - المعرّف ثابت `k:opening:<وحدة>:<عميل>`: جهازان يكتبانه يلتحمان؛ إن اختلفت قيمتاهما يظهر
          «تعارض معرّف» مُبلَّغ عنه ولا يُقصّ شيء بصمت.
        - لا يُكتب إلا والمزامنة نظيفة (إن كان الجهاز استُخدم مع السحابة): كي لا يُجمَّد رصيد قديم.
     2) buildShadowReport: دالة نقية تقارن كل عدّاد بمجموع الدفتر وتُرجع الفروق وأنواعها.
   ========================================================================== */

import { customers as customersRepo, walletOf } from '../data/repos/customers.js';
import { ledgerRepo } from '../data/repos/ledger.js';
import * as dirty from '../sync/dirty-state.js';
import {
  makeEntry, toMinor, balances, accountKey, findAnomalies, fromMinor,
} from './ledger.js';
import { getDeviceId, getShadowFailures, shadowDeps, _resetShadowState } from './ledger-shadow.js';

/** وحدات هذه المرحلة (المخزون في 3.3.80). */
export const SHADOW_UNITS = Object.freeze(['wallet', 'points']);

const OWNER_KEY = 'jalabiya_v3_owner_uid';

/** هل استُخدم هذا الجهاز مع حساب سحابي؟ (ثم تُشترط مزامنة نظيفة) */
function defaultSyncState() {
  let usedCloud = false;
  try { usedCloud = !!localStorage.getItem(OWNER_KEY); } catch (e) { usedCloud = false; }
  return { usedCloud, dirtySince: dirty.getState().dirtySince };
}

/** تبعيات قابلة للاستبدال في الاختبار. */
export const reportDeps = { syncState: defaultSyncState };

/** الأرقام القديمة لعميل بأصغر وحدة. */
function legacyOf(c) {
  const w = walletOf(c);
  return { wallet: toMinor('wallet', w.balance), points: w.points };
}

/**
 * يكتب الأسطر الافتتاحية الناقصة.
 * @param {{customers?:Array, entries?:Array}} [input] — يُقرآن من المخزن إن لم يُمرَّرا
 * @returns {Promise<{status:'written'|'nothing'|'gated', written:number, reason?:string, gatedBy?:string}>}
 */
export async function ensureOpening(input = {}) {
  const st = reportDeps.syncState();
  if (st.usedCloud && st.dirtySince) {
    return { status: 'gated', written: 0, gatedBy: 'sync-dirty', reason: 'توجد تغييرات لم تُرفع إلى السحابة — ارفعها أولاً ثم أعد المحاولة' };
  }
  const custs = Array.isArray(input.customers) ? input.customers : await customersRepo.list();
  const entries = Array.isArray(input.entries) ? input.entries : await ledgerRepo.list();
  const bal = balances(entries);
  const have = new Set(entries.map((e) => e.id));
  const dev = getDeviceId();
  let written = 0;
  let seq = (entries.filter((e) => e.dev === dev).reduce((m, e) => Math.max(m, e.seq), -1)) + 1;

  for (const c of custs) {
    if (!c || c.id == null) continue;
    const legacy = legacyOf(c);
    for (const unit of SHADOW_UNITS) {
      const key = 'opening:' + unit + ':' + c.id;
      if (have.has('k:' + key)) continue;
      const delta = legacy[unit] - ((bal.get(accountKey(unit, String(c.id))) || { balance: 0 }).balance);
      if (!delta) continue;
      const e = makeEntry({
        unit, acct: String(c.id), delta, type: 'opening', key,
        note: 'رصيد افتتاحي من العدّاد القديم', at: Date.now(),
      }, { dev, seq: seq++ });
      const r = await shadowDeps.append(e);
      if (r.added) written++;
    }
  }
  if (written > 0) _resetShadowState();
  return { status: written ? 'written' : 'nothing', written };
}

/**
 * تقرير: هل تتطابق العدّادات القديمة مع مجموع الدفتر؟ (نقية)
 * أنواع الفروق:
 *   no_opening     دفتر بلا سطر افتتاحي لعميل له رصيد (لم يُكتب بعد)
 *   ledger_less    الدفتر أقل من العدّاد القديم
 *   ledger_more    الدفتر أكثر من العدّاد القديم
 *   orphan_account أسطر لحساب عميل غير موجود (حُذف أو دُمج) ولها رصيد غير صفري
 * @param {Array} customerList
 * @param {Array} entries
 * @param {{conflicts?:Array, rejected?:Array}} [extra]
 * @returns {{ok:boolean, customers:number, entries:number, rows:Array, mismatches:number, anomalies:Array, failures:number, counts:Object}}
 */
export function buildShadowReport(customerList, entries, extra = {}) {
  const custs = Array.isArray(customerList) ? customerList : [];
  const list = Array.isArray(entries) ? entries : [];
  const bal = balances(list);
  const hasOpening = new Set(list.filter((e) => e.type === 'opening').map((e) => e.unit + ':' + e.acct));
  const known = new Set();
  const rows = [];

  for (const c of custs) {
    if (!c || c.id == null) continue;
    const acct = String(c.id);
    known.add(acct);
    const legacy = legacyOf(c);
    for (const unit of SHADOW_UNITS) {
      const ledger = (bal.get(accountKey(unit, acct)) || { balance: 0 }).balance;
      const lg = legacy[unit];
      if (ledger === lg) continue;
      let kind;
      if (!hasOpening.has(unit + ':' + acct) && ledger === 0) kind = 'no_opening';
      else kind = ledger < lg ? 'ledger_less' : 'ledger_more';
      rows.push({ acct, name: c.name || '', unit, legacy: lg, ledger, diff: ledger - lg, kind });
    }
  }
  for (const r of bal.values()) {
    if (!SHADOW_UNITS.includes(r.unit) || known.has(r.acct) || r.balance === 0) continue;
    rows.push({ acct: r.acct, name: '', unit: r.unit, legacy: 0, ledger: r.balance, diff: r.balance, kind: 'orphan_account' });
  }
  const counts = {};
  rows.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const anomalies = findAnomalies(list, extra);
  const failures = getShadowFailures();
  return {
    ok: rows.length === 0 && failures === 0 && anomalies.filter((a) => a.severity === 'warn').length === 0,
    customers: custs.length, entries: list.length, rows, mismatches: rows.length, anomalies, failures, counts,
  };
}

/** نص عربي لنوع الفرق. */
export const KIND_LABELS = Object.freeze({
  no_opening: 'لم يُكتب السطر الافتتاحي بعد',
  ledger_less: 'الدفتر أقل من العدّاد',
  ledger_more: 'الدفتر أكثر من العدّاد',
  orphan_account: 'حساب عميل غير موجود (محذوف أو مدموج)',
});

/** عرض مقدار بالوحدة البشرية مع اسم الوحدة. */
export function formatAmount(unit, minor) {
  const v = fromMinor(unit, minor);
  const label = unit === 'wallet' ? 'ج.م' : 'نقطة';
  return String(Number(v.toFixed(2))) + ' ' + label;
}

/**
 * يقرأ المخزن ويبني التقرير.
 * @returns {Promise<Object>}
 */
export async function loadShadowReport() {
  const [custs, entries] = await Promise.all([customersRepo.list(), ledgerRepo.list()]);
  return buildShadowReport(custs, entries);
}

/**
 * إعادة ضبط الدفتر الظلّي: يمسح الدفتر ويعيد كتابة الأسطر الافتتاحية من العدّادات الحالية.
 * آمن في الوضع الظلّي لأن العدّادات القديمة هي المرجع ولم يتغيّر شيء منها.
 * @returns {Promise<{status:string, written:number, reason?:string}>}
 */
export async function resetShadowLedger() {
  const st = reportDeps.syncState();
  if (st.usedCloud && st.dirtySince) {
    return { status: 'gated', written: 0, reason: 'توجد تغييرات لم تُرفع إلى السحابة — ارفعها أولاً' };
  }
  await ledgerRepo.clearAll();
  _resetShadowState();
  return ensureOpening({});
}

