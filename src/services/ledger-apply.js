/* ==========================================================================
   ledger-apply.js — الكتابة المرجعية للمحفظة والنقاط عبر الدفتر (v3.3.82، الخطوة 2ب)
   ==========================================================================
   حين يكون الدفتر «مرجعاً أساسياً» على هذا الجهاز (settings.ledgerAuthority.enabled):
   1) كل حركة محفظة/نقاط تُكتب في الدفتر أولاً، ويُشتق منها الرصيد والنقاط وسجل العميل
      ويُكتب الجميع في **معاملة IndexedDB واحدة** (writeBatch): إما يُحفظ سطر الدفتر مع
      العدّادات معاً أو لا يُحفظ شيء. فشل الدفتر = فشل العملية كلها بلا أثر جزئي.
   2) الرصيد الكافي يُتحقق منه من **رصيد الدفتر** لا من العدّاد.
   3) العدّادات القديمة (creditBalance / points / walletLog) صارت «مشتقة»: تُحسب من الدفتر
      وتُكتب مع كل حركة، وتُعاد اشتقاقها تلقائياً إن تغيّرت بالاستعادة أو المزامنة أو
      الاسترجاع من السلة (reconcileDerivedCounters).
   التزامن: قفل لكل عميل داخل التبويب + حارس updatedAt في المعاملة بين التبويبات/الأجهزة
   (كل كتابة دفتر لحساب تلمس سجل العميل في المعاملة نفسها فيتغيّر updatedAt، فأي سباق
   يُكتشف ويُعاد الحساب من الدفتر الجديد). سطر الدفتر لا يُكتب فوق سطر موجود (حارس غياب).
   ========================================================================== */

import * as idb from '../data/idb.js';
import { STORES } from '../core/config.js';
import { stampForWrite } from '../data/record-meta.js';
import { ledgerRepo } from '../data/repos/ledger.js';
import { balanceOf, balances, toMinor, fromMinor, makeEntry } from './ledger.js';
import { mapLegacyType, getDeviceId, takeLedgerSeq } from './ledger-shadow.js';
import { isAuthorityActive } from './ledger-flag.js';

/** أقصى عدد حركات محفوظة في سجل العميل (مثل المسار القديم). */
export const WALLET_LOG_MAX = 100;
/** أقصى محاولات إعادة الحساب عند تعارض متزامن. */
export const MAX_RETRIES = 5;
/** رسالة موحّدة لمنع الكتابة المباشرة في الحقول المشتقة. */
export const PROTECTED_MESSAGE = 'الرصيد والنقاط وسجل المحفظة مشتقة من الدفتر المالي ولا تُكتب مباشرة — استعمل شحن/صرف المحفظة';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const wlog = (...a) => console.warn('[ledger-apply]', ...a);

/** تبعيات قابلة للاستبدال في الاختبار. */
export const applyDeps = {
  getCustomer: (id) => idb.get(STORES.CUSTOMERS, id),
  listCustomers: () => idb.getAll(STORES.CUSTOMERS),
  listByAcct: (acct) => ledgerRepo.listByAcct(acct),
  listLedger: () => ledgerRepo.list(),
  takeSeq: (dev) => takeLedgerSeq(dev),
  deviceId: () => getDeviceId(),
  writeBatch: (plan, opts) => idb.writeBatch(plan, opts),
  now: () => Date.now(),
};

/* ----- قفل لكل عميل داخل التبويب (يمنع تداخل حركتين على الحساب نفسه) ----- */
const locks = new Map();
function withLock(key, task) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(task);
  const tail = next.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}

/* ----- عدّاد الكتابات الذاتية: يمنع إعادة الاشتقاق التلقائي من الاستجابة لكتابتنا ----- */
let selfWrites = 0;
async function selfWrite(fn) {
  selfWrites += 1;
  try { return await fn(); } finally { selfWrites -= 1; }
}

/**
 * يحسب أسطر الدفتر لحركة محفظة (نفس مفاتيح المسار الظلّي: w:<id>:<الوحدة>).
 * @returns {Promise<Array>}
 */
async function buildEntries(customerId, log, deps) {
  const dev = deps.deviceId();
  const parts = [
    ['wallet', log.balance ? toMinor('wallet', log.balance) : 0],
    ['points', log.points ? Math.round(Number(log.points)) : 0],
  ];
  const out = [];
  for (const [unit, delta] of parts) {
    if (!delta) continue;
    const seq = await deps.takeSeq(dev);
    out.push(makeEntry({
      unit, acct: String(customerId), delta,
      type: unit === 'points' && log.type === 'earn' ? 'award' : mapLegacyType(log.type),
      key: 'w:' + log.id + ':' + unit,
      ref: log.orderId ? { orderId: String(log.orderId) } : null,
      note: String(log.note || '').slice(0, 200),
      at: log.at,
    }, { dev, seq }));
  }
  return out;
}

/**
 * حركة محفظة/نقاط مرجعية: تُكتب في الدفتر ويُشتق منها العدّادان في معاملة واحدة.
 * نفس عقد customers.walletAdjust القديم (نتيجة ورسائل أخطاء).
 * @param {string} id — العميل
 * @param {{balance?:number, points?:number, type:string, note?:string, orderId?:string|null}} d
 * @param {Object} [overrides] — تبعيات بديلة (اختبار)
 * @returns {Promise<{balance:number, points:number}>}
 * @throws {Error} العميل غير موجود / الرصيد لا يكفي / النقاط لا تكفي / تعذّر الحفظ (لا أثر جزئي)
 */
export function applyWalletMove(id, d, overrides = {}) {
  const deps = { ...applyDeps, ...overrides };
  return withLock('w:' + id, async () => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const existing = await deps.getCustomer(id);
      if (!existing) throw new Error('العميل غير موجود');

      /* الرصيد الحالي من الدفتر (المرجع) */
      const entries = await deps.listByAcct(String(id));
      const curMinor = balanceOf(entries, 'wallet', String(id));
      const curPts = balanceOf(entries, 'points', String(id));
      const dBal = r2(d.balance); const dPts = Math.round(Number(d.points) || 0);
      const nbMinor = curMinor + (dBal ? toMinor('wallet', dBal) : 0);
      const np = curPts + dPts;
      if (nbMinor < 0) throw new Error('الرصيد لا يكفي');
      if (np < 0) throw new Error('النقاط لا تكفي');

      const now = deps.now();
      const log = {
        id: 'w' + now.toString(36) + Math.random().toString(36).slice(2, 6),
        at: now, type: d.type, balance: dBal, points: dPts,
        orderId: d.orderId || null, note: d.note || '',
      };
      const newEntries = await buildEntries(id, log, deps);

      /* العدّادات مشتقة من الدفتر (لا من القديم + الفرق) */
      const prevLog = Array.isArray(existing.walletLog) ? existing.walletLog : [];
      const nb = r2(fromMinor('wallet', nbMinor));
      const nextRec = {
        ...existing, creditBalance: nb, points: np,
        walletLog: [log, ...prevLog].slice(0, WALLET_LOG_MAX),
        updatedAt: Math.max(now, (Number(existing.updatedAt) || 0) + 1),   /* يضمن تغيّر الحارس حتى في الميلي ثانية نفسها */
      };
      const stampedCustomer = stampForWrite(STORES.CUSTOMERS, existing, nextRec, nextRec.updatedAt);
      const plan = {
        [STORES.CUSTOMERS]: { records: [stampedCustomer] },
        ...(newEntries.length ? { [STORES.LEDGER]: { records: newEntries } } : {}),
      };
      const guards = {
        [STORES.CUSTOMERS]: new Map([[String(id), Number(existing.updatedAt) || 0]]),
        ...(newEntries.length ? { [STORES.LEDGER]: new Map(newEntries.map((e) => [e.id, null])) } : {}),
      };
      try {
        await selfWrite(() => deps.writeBatch(plan, { guards }));
        return { balance: nb, points: np };
      } catch (e) {
        if (e && e.code === 'guard-mismatch' && attempt < MAX_RETRIES - 1) continue;   /* تعديل متزامن: أعد الحساب من الدفتر الجديد */
        if (e && e.code === 'guard-mismatch') throw new Error('تعذّر الحفظ بسبب تعديلات متزامنة — أعد المحاولة');
        throw e;                                                                         /* فشل الدفتر = فشل العملية (لا أثر جزئي) */
      }
    }
    throw new Error('تعذّر الحفظ بسبب تعديلات متزامنة — أعد المحاولة');
  });
}

/**
 * رصيد ونقاط عميل من الدفتر (للقراءة).
 * @param {string} id
 * @returns {Promise<{balance:number, points:number}>}
 */
export async function ledgerWalletOf(id, overrides = {}) {
  const deps = { ...applyDeps, ...overrides };
  const entries = await deps.listByAcct(String(id));
  return {
    balance: r2(fromMinor('wallet', balanceOf(entries, 'wallet', String(id)))),
    points: balanceOf(entries, 'points', String(id)),
  };
}

/**
 * هل يمكن حذف العميل؟ (لا حذف لعميل في الدفتر رصيده/نقاطه غير صفرية — هذا ما أضاع المال سابقاً.)
 * @param {string} id
 * @returns {Promise<{ok:boolean, reason:string, balance:number, points:number}>}
 */
export async function checkCustomerDeletable(id, overrides = {}) {
  const w = await ledgerWalletOf(id, overrides);
  if (w.balance !== 0 || w.points !== 0) {
    const parts = [];
    if (w.balance !== 0) parts.push(w.balance + ' ج.م');
    if (w.points !== 0) parts.push(w.points + ' نقطة');
    return { ok: false, reason: 'لا يمكن حذف عميل له ' + parts.join(' و') + ' في الدفتر — انقل المحفظة أو صفّرها أولاً', ...w };
  }
  return { ok: true, reason: '', ...w };
}

/* ==========================================================================
   إعادة اشتقاق العدّادات من الدفتر
   ========================================================================== */

/**
 * يعيد اشتقاق creditBalance/points لكل العملاء من الدفتر ويصحّح ما اختلف (فقط حين يكون الدفتر مرجعاً).
 * يعالج: استعادة نسخة، سحب مزامنة، استرجاع عميل من السلة، أي كتابة التفّت على الحارس.
 * لا يمسّ walletLog. يكتب بمعاملة وحارس لكل عميل (إن تغيّر العميل أثناءها يُترك للجولة التالية).
 * @param {Object} [overrides]
 * @returns {Promise<{status:'inactive'|'ok', checked:number, fixed:number, fixes:Array<{id:string, from:Object, to:Object}>}>}
 */
export async function reconcileDerivedCounters(overrides = {}) {
  const deps = { ...applyDeps, ...overrides };
  const active = overrides.isActive ? await overrides.isActive() : await isAuthorityActive();
  if (!active) return { status: 'inactive', checked: 0, fixed: 0, fixes: [] };

  const [custs, entries] = await Promise.all([deps.listCustomers(), deps.listLedger()]);
  const bal = balances(entries);
  const fixes = [];
  for (const c of custs) {
    const acct = String(c.id);
    const wantBal = Math.max(0, r2(fromMinor('wallet', (bal.get('wallet:' + acct) || { balance: 0 }).balance)));
    const wantPts = Math.max(0, Math.round((bal.get('points:' + acct) || { balance: 0 }).balance));
    const haveBal = Math.max(0, r2(c.creditBalance));
    const havePts = Math.max(0, Math.round(Number(c.points) || 0));
    if (haveBal === wantBal && havePts === wantPts) continue;
    const now = deps.now();
    const nextRec = { ...c, creditBalance: wantBal, points: wantPts, updatedAt: Math.max(now, (Number(c.updatedAt) || 0) + 1) };
    try {
      await selfWrite(() => deps.writeBatch(
        { [STORES.CUSTOMERS]: { records: [stampForWrite(STORES.CUSTOMERS, c, nextRec, nextRec.updatedAt)] } },
        { guards: { [STORES.CUSTOMERS]: new Map([[acct, Number(c.updatedAt) || 0]]) } },
      ));
      fixes.push({ id: acct, from: { balance: haveBal, points: havePts }, to: { balance: wantBal, points: wantPts } });
    } catch (e) {
      if (!(e && e.code === 'guard-mismatch')) wlog('تعذّر تصحيح عدّادات', acct, e);
    }
  }
  return { status: 'ok', checked: custs.length, fixed: fixes.length, fixes };
}

/* ----- اشتقاق تلقائي بعد الكتابات الخارجية (استعادة/مزامنة/سلة) ----- */
let autoEnabled = true;
let timer = null;
let installed = false;

/** تعطيل/تفعيل الاشتقاق التلقائي (للاختبارات). */
export function setDerivedAutoSync(on) { autoEnabled = !!on; if (!on && timer) { clearTimeout(timer); timer = null; } }

function schedule() {
  if (!autoEnabled || selfWrites > 0 || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      const r = await reconcileDerivedCounters();
      if (r.fixed > 0) wlog('أُعيد اشتقاق عدّادات ' + r.fixed + ' عميل من الدفتر');
    } catch (e) { wlog('فشل الاشتقاق التلقائي', e); }
  }, 400);
}

/**
 * يركّب مستمع الكتابة (مرة واحدة): أي كتابة على العملاء أو الدفتر من خارج هذا الملف
 * تجدول إعادة اشتقاق للعدّادات (لا تفعل شيئاً إن لم يكن الدفتر مرجعاً).
 */
export function installDerivedCounterSync() {
  if (installed) return;
  installed = true;
  idb.onWrite((names) => {
    if (selfWrites > 0) return;
    const list = Array.isArray(names) ? names : [names];
    if (list.includes(STORES.CUSTOMERS) || list.includes(STORES.LEDGER)) schedule();
  });
}
installDerivedCounterSync();
