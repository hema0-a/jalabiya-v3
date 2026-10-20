/* ==========================================================================
   ledger-union.js — دمج الدفتر بالاتحاد (لا استبدال أبداً) + سجل الانحرافات (v3.3.83، الخطوة 2ج)
   ==========================================================================
   أسطر الدفتر ثابتة: المزامنة والاستعادة يجب أن تُضيف ما ينقص فقط، ولا تمسح ولا تكتب فوق سطر موجود.
   (كان الاستبدال clear:true يمحو حركات محلية غير مرفوعة = ضياع مال.)
   - planLedgerUnion: دالة نقية تُرجع ما يُضاف + التعارضات + المرفوض.
   - سجل الانحرافات (localStorage، محلي للجهاز): يُغذّي شذوذ cache_diverged و id_conflict في بطاقة الدفتر.
   وحدة خفيفة: تستورد ledger.js فقط (لا idb) كي تُستعمل من المزامنة والاستعادة والمحاكي بلا دوائر استيراد.
   ========================================================================== */

import { mergeLedgers } from './ledger.js';

const K_ISSUES = 'jalabiya_v3_ledger_issues';
/** أقصى عدد بلاغات محفوظة من كل نوع. */
export const ISSUES_MAX = 50;

/**
 * يخطط إضافة أسطر واردة (سحابة/نسخة احتياطية) إلى الدفتر المحلي بالاتحاد.
 * لا يعدّل المدخلات. السطر الموجود محلياً لا يُستبدل حتى لو اختلفت هويته (يُبلَّغ كتعارض).
 * @param {Array} localEntries
 * @param {Array} incoming
 * @returns {{toPut:Array, added:number, localOnly:number, conflicts:Array, rejected:Array}}
 */
export function planLedgerUnion(localEntries, incoming) {
  const local = Array.isArray(localEntries) ? localEntries : [];
  const have = new Set(local.filter((e) => e && e.id != null).map((e) => e.id));
  const m = mergeLedgers(local, Array.isArray(incoming) ? incoming : []);
  const toPut = m.entries.filter((e) => !have.has(e.id));
  return { toPut, added: toPut.length, localOnly: m.fromA, conflicts: m.conflicts, rejected: m.rejected };
}

function readIssues() {
  try {
    const raw = JSON.parse(localStorage.getItem(K_ISSUES) || 'null');
    return {
      diverged: Array.isArray(raw && raw.diverged) ? raw.diverged : [],
      conflicts: Array.isArray(raw && raw.conflicts) ? raw.conflicts : [],
    };
  } catch (e) { return { diverged: [], conflicts: [] }; }
}
function writeIssues(v) {
  try { localStorage.setItem(K_ISSUES, JSON.stringify(v)); } catch (e) { /* لا يكسر المسار الأصلي */ }
}

/**
 * يسجّل انحرافات عدّادات صُحّحت من الدفتر (cache_diverged).
 * @param {Array<{id:string, from:{balance:number, points:number}, to:{balance:number, points:number}}>} fixes
 * @param {number} [at]
 */
export function logDivergences(fixes, at = Date.now()) {
  if (!Array.isArray(fixes) || fixes.length === 0) return;
  const cur = readIssues();
  const add = [];
  for (const f of fixes) {
    if (f.from.balance !== f.to.balance) add.push({ acct: f.id, unit: 'wallet', from: f.from.balance, to: f.to.balance, at });
    if (f.from.points !== f.to.points) add.push({ acct: f.id, unit: 'points', from: f.from.points, to: f.to.points, at });
  }
  cur.diverged = [...add, ...cur.diverged].slice(0, ISSUES_MAX);
  writeIssues(cur);
}

/**
 * يسجّل تعارضات معرّفات الدفتر الواردة من مزامنة/استعادة (id_conflict).
 * @param {Array<{id:string, kept:Object, dropped:Object}>} conflicts
 */
export function logLedgerConflicts(conflicts) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return;
  const cur = readIssues();
  const seen = new Set(cur.conflicts.map((c) => c.id));
  const add = conflicts.filter((c) => c && c.id && !seen.has(c.id)).map((c) => ({ id: c.id, kept: c.kept, dropped: c.dropped }));
  cur.conflicts = [...add, ...cur.conflicts].slice(0, ISSUES_MAX);
  writeIssues(cur);
}

/** @returns {{diverged:Array, conflicts:Array}} */
export function loadLedgerIssues() { return readIssues(); }

/** يمسح سجل البلاغات (بعد مراجعة المستخدم). */
export function clearLedgerIssues() { writeIssues({ diverged: [], conflicts: [] }); }
