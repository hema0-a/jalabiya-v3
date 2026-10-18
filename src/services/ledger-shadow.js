/* ==========================================================================
   ledger-shadow.js — الكتابة الظلّية في الدفتر (v3.3.79)
   ==========================================================================
   الوضع الظلّي: العدّادات القديمة (creditBalance/points/walletLog) تبقى المرجع الوحيد؛ وكل حركة
   محفظة/نقاط تُسجَّل أيضاً في الدفتر بعد نجاح العملية القديمة. فشل الكتابة الظلّية:
     - لا يُفشل العملية الأصلية أبداً (يُسجَّل تحذير ويُزاد عدّاد فشل يظهر في التقرير).
     - يظهر لاحقاً في تقرير المقارنة كفرق.
   معرّف السطر مشتق من معرّف حركة walletLog نفسها: `k:w:<id>:<unit>`، فتكرار الاستدعاء لا يكرّر
   الحركة، وكل سطر دفتر يُتتبَّع إلى أصله. خفيف الاعتماد (لا يستورد مستودع العملاء) كي لا ينشأ
   استيراد دائري مع customers.js الذي يستدعيه.
   ========================================================================== */

import { ledgerRepo } from '../data/repos/ledger.js';
import { makeEntry, toMinor, nextSeq, ENTRY_TYPES } from './ledger.js';

const K_DEVICE = 'jalabiya_v3_device_id';
const K_FAIL = 'jalabiya_v3_ledger_shadow_fail';

/** تبعيات قابلة للاستبدال في الاختبار. */
export const shadowDeps = { append: (e) => ledgerRepo.append(e), list: () => ledgerRepo.list() };

/** تحويل أنواع حركات المحفظة القديمة إلى أنواع الدفتر. */
const TYPE_MAP = Object.freeze({ topup: 'topup', spend: 'spend', redeem: 'redeem', adjust: 'adjust', earn: 'award' });
export const mapLegacyType = (t) => TYPE_MAP[t] || 'adjust';

/**
 * معرّف ثابت لهذا الجهاز (يُنشأ مرة). يُفقد بمسح بيانات الجهاز فيُنشأ غيره — آمن لأن المعرّف فريد.
 * @returns {string}
 */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(K_DEVICE);
    if (id && /^[a-z0-9]{4,32}$/.test(id)) return id;
    id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(K_DEVICE, id);
    return id;
  } catch (e) { return 'dlocal'; }
}

/** عدد مرات فشل الكتابة الظلّية على هذا الجهاز. */
export function getShadowFailures() {
  try { return Number(localStorage.getItem(K_FAIL)) || 0; } catch (e) { return 0; }
}
export function resetShadowFailures() {
  try { localStorage.removeItem(K_FAIL); } catch (e) { /* اختياري */ }
}
function bumpFailures() {
  try { localStorage.setItem(K_FAIL, String(getShadowFailures() + 1)); } catch (e) { /* اختياري */ }
}

let seqCursor = null;
let queue = Promise.resolve();
/** يعيد ضبط العدّاد المخزَّن (للاختبار بعد مسح المخزن). */
export function _resetShadowState() { seqCursor = null; queue = Promise.resolve(); }

async function takeSeq(dev) {
  if (seqCursor === null) seqCursor = nextSeq(await shadowDeps.list(), dev);
  return seqCursor++;
}

/**
 * يُسجَّل أثر حركة محفظة/نقاط في الدفتر. لا يرمي أبداً.
 * @param {string} customerId
 * @param {{id:string, at:number, type:string, balance:number, points:number, orderId?:string|null, note?:string}} log — حركة walletLog
 * @returns {Promise<{written:number, skipped:number, failed:number}>}
 */
export function recordWalletMove(customerId, log) {
  const task = async () => {
    const out = { written: 0, skipped: 0, failed: 0 };
    try {
      if (!customerId || !log || !log.id) { out.failed++; bumpFailures(); return out; }
      const dev = getDeviceId();
      const parts = [
        ['wallet', log.balance ? toMinor('wallet', log.balance) : 0],
        ['points', log.points ? Math.round(Number(log.points)) : 0],
      ];
      for (const [unit, delta] of parts) {
        if (!delta) continue;
        const seq = await takeSeq(dev);
        const e = makeEntry({
          unit, acct: String(customerId), delta,
          type: unit === 'points' && log.type === 'earn' ? 'award' : mapLegacyType(log.type),
          key: 'w:' + log.id + ':' + unit,
          ref: log.orderId ? { orderId: String(log.orderId) } : null,
          note: String(log.note || '').slice(0, 200),
          at: Number.isFinite(log.at) ? log.at : Date.now(),
        }, { dev, seq });
        const r = await shadowDeps.append(e);
        if (r.added) out.written++; else out.skipped++;
      }
    } catch (e) {
      out.failed++;
      bumpFailures();
      console.warn('[ledger-shadow] تعذّرت الكتابة الظلّية (العملية الأصلية سليمة):', e);
    }
    return out;
  };
  queue = queue.catch(() => {}).then(task);
  return queue;
}

/**
 * يُسجَّل أثر حركة مخزون في الدفتر (v3.3.80). لا يرمي أبداً.
 * الكمية القديمة في الصنف تبقى المرجع؛ هذا أثر ظلّي للمقارنة فقط.
 * @param {string} itemId — معرّف الصنف
 * @param {number} deltaQty — التغيير بوحدة الصنف (موجب إضافة، سالب صرف)؛ صفر لا يُسجَّل
 * @param {{type?:string, moveId?:string, note?:string, at?:number}} [opts]
 *   moveId يجعل المفتاح ثابتاً (استدعاء مكرر لا يكرّر السطر)؛ وإلا يُولَّد معرّف فريد للحركة.
 * @returns {Promise<{written:number, skipped:number, failed:number}>}
 */
export function recordStockMove(itemId, deltaQty, opts = {}) {
  const task = async () => {
    const out = { written: 0, skipped: 0, failed: 0 };
    try {
      if (!itemId) { out.failed++; bumpFailures(); return out; }
      const delta = toMinor('stock', deltaQty);
      if (!delta) return out;
      const dev = getDeviceId();
      const moveId = opts.moveId ? String(opts.moveId) : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const type = ENTRY_TYPES.includes(opts.type) ? opts.type : 'adjust';
      const seq = await takeSeq(dev);
      const e = makeEntry({
        unit: 'stock', acct: String(itemId), delta, type,
        key: 's:' + moveId,
        note: String(opts.note || '').slice(0, 200),
        at: Number.isFinite(opts.at) ? opts.at : Date.now(),
      }, { dev, seq });
      const r = await shadowDeps.append(e);
      if (r.added) out.written++; else out.skipped++;
    } catch (e) {
      out.failed++;
      bumpFailures();
      console.warn('[ledger-shadow] تعذّرت كتابة حركة المخزون (العملية الأصلية سليمة):', e);
    }
    return out;
  };
  queue = queue.catch(() => {}).then(task);
  return queue;
}
