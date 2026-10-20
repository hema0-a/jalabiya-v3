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
import { inventory as inventoryRepo } from '../data/repos/inventory.js';
import { ledgerRepo } from '../data/repos/ledger.js';
import * as dirty from '../sync/dirty-state.js';
import {
  makeEntry, toMinor, balances, accountKey, findAnomalies, fromMinor,
} from './ledger.js';
import { getDeviceId, getShadowFailures, shadowDeps, _resetShadowState } from './ledger-shadow.js';
import { isAuthorityActive } from './ledger-flag.js';

/** وحدات الوضع الظلّي: المحفظة والنقاط (حسابها العميل) والمخزون (حسابه الصنف، v3.3.80). */
export const SHADOW_UNITS = Object.freeze(['wallet', 'points', 'stock']);
const CUSTOMER_UNITS = Object.freeze(['wallet', 'points']);

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

/** كمية صنف بأصغر وحدة (الألف). */
function stockLegacy(item) {
  return toMinor('stock', Number(item && item.quantity) || 0);
}

/**
 * كل «الحسابات» المقارَنة: عملاء (محفظة/نقاط) وأصناف (مخزون إن مُرّرت).
 * @returns {Array<{acct:string, name:string, unit:string, legacy:number}>}
 */
function legacyAccounts(custs, items) {
  const out = [];
  for (const c of custs) {
    if (!c || c.id == null) continue;
    const legacy = legacyOf(c);
    for (const unit of CUSTOMER_UNITS) out.push({ acct: String(c.id), name: c.name || '', unit, legacy: legacy[unit] });
  }
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || it.id == null) continue;
      out.push({ acct: String(it.id), name: it.name || '', unit: 'stock', legacy: stockLegacy(it) });
    }
  }
  return out;
}

/**
 * يكتب الأسطر الافتتاحية الناقصة.
 * @param {{customers?:Array, entries?:Array, items?:Array}} [input] — يُقرآن من المخزن إن لم يُمرَّرا؛
 *   إن مُرِّر customers بلا items لا يُفتتح المخزون (تحكّم دقيق للاختبار)، وإن لم يُمرَّر شيء يُقرأ الكل.
 * @returns {Promise<{status:'written'|'nothing'|'gated', written:number, reason?:string, gatedBy?:string}>}
 */
export async function ensureOpening(input = {}) {
  const authority = await isAuthorityActive();   /* v3.3.82: الدفتر مرجع ⟵ لا يُصحَّح باتجاه العدّادات المشتقة */
  const st = reportDeps.syncState();
  if (st.usedCloud && st.dirtySince) {
    return { status: 'gated', written: 0, gatedBy: 'sync-dirty', reason: 'توجد تغييرات لم تُرفع إلى السحابة — ارفعها أولاً ثم أعد المحاولة' };
  }
  const custs = Array.isArray(input.customers) ? input.customers : await customersRepo.list();
  const items = Array.isArray(input.items) ? input.items
    : (Array.isArray(input.customers) ? [] : await inventoryRepo.list());
  const entries = Array.isArray(input.entries) ? input.entries : await ledgerRepo.list();
  const bal = balances(entries);
  const have = new Set(entries.map((e) => e.id));
  const dev = getDeviceId();
  let written = 0;
  let seq = (entries.filter((e) => e.dev === dev).reduce((m, e) => Math.max(m, e.seq), -1)) + 1;

  for (const a of legacyAccounts(custs, items)) {
    if (authority && (a.unit === 'wallet' || a.unit === 'points')) continue;   /* المحفظة والنقاط مرجعها الدفتر نفسه */
    const key = 'opening:' + a.unit + ':' + a.acct;
    if (have.has('k:' + key)) continue;
    const delta = a.legacy - ((bal.get(accountKey(a.unit, a.acct)) || { balance: 0 }).balance);
    if (!delta) continue;
    const e = makeEntry({
      unit: a.unit, acct: a.acct, delta, type: 'opening', key,
      note: 'رصيد افتتاحي من العدّاد القديم', at: Date.now(),
    }, { dev, seq: seq++ });
    const r = await shadowDeps.append(e);
    if (r.added) written++;
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
  const items = Array.isArray(extra.items) ? extra.items : null;   /* null = المخزون خارج هذا التقرير */
  const units = items ? SHADOW_UNITS : CUSTOMER_UNITS;
  const bal = balances(list);
  const hasOpening = new Set(list.filter((e) => e.type === 'opening').map((e) => e.unit + ':' + e.acct));
  const known = new Set();
  const rows = [];

  for (const a of legacyAccounts(custs, items)) {
    known.add(a.unit === 'stock' ? 'stock:' + a.acct : 'cust:' + a.acct);
    const ledger = (bal.get(accountKey(a.unit, a.acct)) || { balance: 0 }).balance;
    if (ledger === a.legacy) continue;
    let kind;
    if (!hasOpening.has(a.unit + ':' + a.acct) && ledger === 0) kind = 'no_opening';
    else kind = ledger < a.legacy ? 'ledger_less' : 'ledger_more';
    rows.push({ acct: a.acct, name: a.name, unit: a.unit, legacy: a.legacy, ledger, diff: ledger - a.legacy, kind });
  }
  for (const r of bal.values()) {
    if (!units.includes(r.unit) || r.balance === 0) continue;
    if (known.has((r.unit === 'stock' ? 'stock:' : 'cust:') + r.acct)) continue;
    rows.push({ acct: r.acct, name: '', unit: r.unit, legacy: 0, ledger: r.balance, diff: r.balance, kind: 'orphan_account' });
  }
  const counts = {};
  rows.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const anomalies = findAnomalies(list, extra);
  const failures = getShadowFailures();
  return {
    ok: rows.length === 0 && failures === 0 && anomalies.filter((a) => a.severity === 'warn').length === 0,
    customers: custs.length, items: items ? items.length : 0, entries: list.length, rows, mismatches: rows.length, anomalies, failures, counts,
  };
}

/** نص عربي لنوع الفرق. */
export const KIND_LABELS = Object.freeze({
  no_opening: 'لم يُكتب السطر الافتتاحي بعد',
  ledger_less: 'الدفتر أقل من العدّاد',
  ledger_more: 'الدفتر أكثر من العدّاد',
  orphan_account: 'حساب غير موجود (عميل أو صنف محذوف/مدموج)',
});

/** عرض مقدار بالوحدة البشرية مع اسم الوحدة. */
export function formatAmount(unit, minor) {
  const v = fromMinor(unit, minor);
  const label = unit === 'wallet' ? 'ج.م' : (unit === 'stock' ? 'وحدة' : 'نقطة');
  return String(Number(v.toFixed(2))) + ' ' + label;
}

/**
 * يقرأ المخزن ويبني التقرير.
 * @returns {Promise<Object>}
 */
export async function loadShadowReport() {
  const [custs, entries, items] = await Promise.all([customersRepo.list(), ledgerRepo.list(), inventoryRepo.list()]);
  return buildShadowReport(custs, entries, { items });
}

/**
 * إعادة ضبط الدفتر الظلّي: يمسح الدفتر ويعيد كتابة الأسطر الافتتاحية من العدّادات الحالية.
 * آمن في الوضع الظلّي لأن العدّادات القديمة هي المرجع ولم يتغيّر شيء منها.
 * @returns {Promise<{status:string, written:number, reason?:string}>}
 */
export async function resetShadowLedger() {
  /* مسح الدفتر يمحو تاريخ المحفظة المرجعي — ممنوع ما دام الدفتر مرجعاً (ألغِ التفعيل أولاً) */
  if (await isAuthorityActive()) {
    return { status: 'gated', written: 0, gatedBy: 'authority', reason: 'الدفتر مرجع أساسي الآن — لا يمكن إعادة ضبطه (ألغِ التفعيل أولاً إن كنت متأكداً)' };
  }
  const st = reportDeps.syncState();
  if (st.usedCloud && st.dirtySince) {
    return { status: 'gated', written: 0, reason: 'توجد تغييرات لم تُرفع إلى السحابة — ارفعها أولاً' };
  }
  await ledgerRepo.clearAll();
  _resetShadowState();
  return ensureOpening({});
}

