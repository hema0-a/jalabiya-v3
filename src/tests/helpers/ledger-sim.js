/* ==========================================================================
   ledger-sim.js — محاكي أجهزة للدفتر المالي (أداة اختبار فقط — v3.3.78)
   ==========================================================================
   يُشغّل عدة «أجهزة» وهمية، لكل منها نسخته من الدفتر، تعمل بلا اتصال وتتزامن في أوقات عشوائية
   (بذرة ثابتة ⟵ قابلة لإعادة الإنتاج). ثم يتحقق من المبادئ التي نعتمد عليها قبل أي تغيير في الواجهة:
     1) التقارب: بعد مزامنة كاملة تتطابق نسخ كل الأجهزة سطراً بسطر.
     2) لا فقدان: كل حركة منطقية سُجِّلت على أي جهاز موجودة في النتيجة.
     3) صحة الرصيد: الرصيد = مجموع «الحركات المنطقية» (مفتاح تكرار/عكس يُحسب مرة واحدة)،
        يُحسب من سجل العمليات لا من كود الدمج نفسه (مقياس مستقل).
     4) لا يُقصّ سالب بصمت: كل حساب سالب بالمجموع يظهر في findAnomalies.
     5) الدمج مستقل عن الترتيب ويعيد نفسه (idempotent).
   لا يستورد أي شيء من التطبيق عدا ledger.js.
   ========================================================================== */

import {
  makeEntry, makeReversal, nextSeq, checkSpend, mergeLedgers, mergeMany, balances, balanceOf, findAnomalies, accountKey, planCounterFixes,
} from '../../services/ledger.js';

/** مولّد عشوائي حتمي (mulberry32). */
export function createRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {Object} SimOptions
 * @property {number} [seed=1]
 * @property {number} [devices=3]
 * @property {number} [steps=150]
 * @property {number} [accounts=3]
 * @property {number} [syncProb=0.15]   احتمال أن تكون الخطوة مزامنة بين جهازين
 * @property {Function} [merge]         دالة دمج بديلة (لاختبار أن المحاكي يكشف الدمج الخاطئ)
 */

/**
 * يشغّل محاكاة كاملة.
 * @param {SimOptions} [opt]
 * @returns {{replicas:Array<{dev:string, entries:Array}>, ops:Array, logical:Map<string,Object>, localOverdrafts:number, refusals:number}}
 */
export function simulate(opt = {}) {
  const rng = createRng(opt.seed || 1);
  const nDev = opt.devices || 3;
  const steps = opt.steps || 150;
  const nAcc = opt.accounts || 3;
  const syncProb = opt.syncProb == null ? 0.15 : opt.syncProb;
  const merge = opt.merge || ((x, y) => mergeLedgers(x, y).entries);

  const replicas = Array.from({ length: nDev }, (_, i) => ({ dev: 'dev' + (i + 1), entries: [] }));
  const ops = [];                       /* كل حركة سُجِّلت (قد تتكرر الحركة المنطقية على جهازين) */
  const logical = new Map();            /* معرّف منطقي ← الحركة (مرة واحدة) — المقياس المستقل */
  let localOverdrafts = 0;
  let refusals = 0;
  let clock = 1_700_000_000_000;
  const units = ['wallet', 'points'];
  const accts = Array.from({ length: nAcc }, (_, i) => 'c' + (i + 1));
  const pickOf = (arr) => arr[Math.floor(rng() * arr.length)];

  const record = (r, e) => {
    r.entries = [...r.entries, e];
    ops.push({ dev: r.dev, id: e.id, unit: e.unit, acct: e.acct, delta: e.delta });
    if (!logical.has(e.id)) logical.set(e.id, { unit: e.unit, acct: e.acct, delta: e.delta });
  };

  for (let s = 0; s < steps; s++) {
    clock += 1 + Math.floor(rng() * 5000);
    const r = pickOf(replicas);
    const roll = rng();
    const ctx = () => ({ dev: r.dev, seq: nextSeq(r.entries, r.dev), now: clock });

    if (roll < syncProb) {
      const other = pickOf(replicas.filter((x) => x !== r));
      if (other) {
        const m = merge(r.entries, other.entries);
        r.entries = m; other.entries = m;
      }
      continue;
    }
    const unit = pickOf(units);
    const acct = pickOf(accts);
    const kind = rng();
    if (kind < 0.35) {                                               /* شحن/منح */
      record(r, makeEntry({ unit, acct, delta: 100 + Math.floor(rng() * 5000), type: unit === 'wallet' ? 'topup' : 'award' }, ctx()));
    } else if (kind < 0.7) {                                         /* صرف (فحص محلي) */
      const want = 50 + Math.floor(rng() * 3000);
      const chk = checkSpend(r.entries, unit, acct, want);
      if (chk.ok) {
        record(r, makeEntry({ unit, acct, delta: -want, type: unit === 'wallet' ? 'spend' : 'redeem' }, ctx()));
        /* بعد الصرف يجب ألا يكون الرصيد المحلي سالباً: الفحص المحلي هو خط الدفاع الأول */
        if (balanceOf(r.entries, unit, acct) < 0) localOverdrafts++;
      } else {
        refusals++;                                                  /* رُفض الصرف محلياً لعدم كفاية الرصيد */
      }
    } else if (kind < 0.85) {                                        /* منح بمفتاح تكرار (مثل نقاط طلب) — جهازان قد يسجلانه معاً */
      const orderNo = 1 + Math.floor(rng() * 12);
      record(r, makeEntry({ unit: 'points', acct, delta: 10 + orderNo, type: 'award', key: 'award:' + acct + ':' + orderNo }, ctx()));
    } else {                                                         /* عكس سطر موجود محلياً (ليس عكساً) */
      const cands = r.entries.filter((e) => e.type !== 'reversal' && !r.entries.some((x) => x.id === 'rev:' + e.id));
      if (cands.length) record(r, makeReversal(pickOf(cands), ctx(), 'تراجع'));
    }
  }
  return { replicas, ops, logical, localOverdrafts, refusals };
}

/**
 * مزامنة كاملة: جولتان على كل الأزواج (كافيتان لانتشار أي سطر لكل الأجهزة).
 * @param {Array<{dev:string, entries:Array}>} replicas
 * @param {Function} [merge]
 */
export function syncAll(replicas, merge) {
  const m = merge || ((x, y) => mergeLedgers(x, y).entries);
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < replicas.length; i++) {
      for (let j = 0; j < replicas.length; j++) {
        if (i === j) continue;
        const r = m(replicas[i].entries, replicas[j].entries);
        replicas[i].entries = r; replicas[j].entries = r;
      }
    }
  }
}

/** نص قانوني للمقارنة بين نسختين. */
const canon = (entries) => JSON.stringify(entries);

/**
 * يتحقق من كل المبادئ على نتيجة محاكاة. يُرجع قائمة مخالفات (فارغة = سليم).
 * @param {{replicas:Array, logical:Map}} sim
 * @returns {string[]}
 */
export function verifyInvariants(sim) {
  const bad = [];
  const first = sim.replicas[0].entries;
  /* 1) التقارب */
  sim.replicas.forEach((r) => { if (canon(r.entries) !== canon(first)) bad.push('عدم تقارب: ' + r.dev); });
  /* 2) لا فقدان */
  const have = new Set(first.map((e) => e.id));
  for (const id of sim.logical.keys()) if (!have.has(id)) bad.push('فُقدت حركة: ' + id);
  /* 3) صحة الرصيد من سجل العمليات */
  const expected = new Map();
  for (const l of sim.logical.values()) {
    const k = accountKey(l.unit, l.acct);
    expected.set(k, (expected.get(k) || 0) + l.delta);
  }
  const got = balances(first);
  for (const [k, v] of expected) {
    const g = (got.get(k) || { balance: 0 }).balance;
    if (g !== v) bad.push('رصيد خاطئ ' + k + ': ' + g + ' ≠ ' + v);
  }
  /* 4) السالب يُبلَّغ عنه */
  const flagged = new Set(findAnomalies(first).filter((a) => a.kind === 'negative_balance').map((a) => accountKey(a.unit, a.acct)));
  for (const [k, v] of expected) {
    if (v < 0 && !flagged.has(k)) bad.push('سالب غير مُبلَّغ: ' + k);
    if (v >= 0 && flagged.has(k)) bad.push('بلاغ سالب كاذب: ' + k);
  }
  return bad;
}

/**
 * يتحقق من أن الدمج مستقل عن الترتيب ومن idempotence.
 * @param {Array<Array>} lists — نسخ الأجهزة (قبل المزامنة الكاملة)
 * @param {number} seed
 * @returns {string[]}
 */
export function verifyMergeLaws(lists, seed = 1) {
  const bad = [];
  const rng = createRng(seed);
  const base = canon(mergeMany(lists).entries);
  for (let k = 0; k < 6; k++) {
    const shuffled = [...lists].sort(() => rng() - 0.5);
    if (canon(mergeMany(shuffled).entries) !== base) bad.push('الدمج يعتمد على الترتيب');
  }
  const merged = mergeMany(lists).entries;
  lists.forEach((l, i) => { if (canon(mergeLedgers(merged, l).entries) !== canon(merged)) bad.push('ليس idempotent مع النسخة ' + i); });
  if (canon(mergeLedgers(merged, merged).entries) !== canon(merged)) bad.push('دمج النفس يغيّر النتيجة');
  return bad;
}


/* ==========================================================================
   وضع «الدفتر مرجع» (v3.3.83، الخطوة 2ج)
   ==========================================================================
   أجهزة محدَّثة (الدفتر مرجع: العدّادات مشتقة منه) وأجهزة قديمة (legacy) تكتب العدّادات مباشرة بلا سطر دفتر.
   سجلات العملاء تتزامن بقاعدة «الأحدث يغلب» (مثل المتجر الحقيقي)، والدفتر يتزامن بالاتحاد.
   بعد كل مزامنة تُجري الأجهزة المحدَّثة مصالحة: تُعيد اشتقاق العدّادات من الدفتر (planCounterFixes).
   المبادئ المختبَرة (verifyAuthorityInvariants):
     1) تقارب الدفتر على كل الأجهزة (القديمة أيضاً).
     2) الدفتر = مجموع حركات الأجهزة المحدَّثة فقط: كتابة جهاز قديم للعدّادات لا تُنشئ ولا تُغيّر سطراً.
     3) بعد المصالحة النهائية كل عدّاد على كل جهاز محدَّث = الدفتر (لا انحراف متبقٍّ).
     4) لا فقدان لحركة مرجعية سُجِّلت على أي جهاز.
   ========================================================================== */

/**
 * @typedef {Object} AuthoritySimOptions
 * @property {number} [seed=1]
 * @property {number} [devices=3]       عدد الأجهزة (آخر `legacy` منها قديمة)
 * @property {number} [legacy=1]        عدد الأجهزة القديمة (0 = كلها محدَّثة)
 * @property {number} [steps=150]
 * @property {number} [accounts=3]
 * @property {number} [syncProb=0.2]
 */

/**
 * يشغّل محاكاة «الدفتر مرجع» مع أجهزة قديمة تكتب العدّادات مباشرة.
 * @param {AuthoritySimOptions} [opt]
 * @returns {{replicas:Array, logical:Map, legacyWrites:number, divergedFixes:number, reconciles:number}}
 */
export function simulateAuthority(opt = {}) {
  const rng = createRng(opt.seed || 1);
  const nDev = opt.devices || 3;
  const nLegacy = Math.min(opt.legacy == null ? 1 : opt.legacy, nDev);
  const steps = opt.steps || 150;
  const nAcc = opt.accounts || 3;
  const syncProb = opt.syncProb == null ? 0.2 : opt.syncProb;
  const accts = Array.from({ length: nAcc }, (_, i) => 'c' + (i + 1));
  const pickOf = (arr) => arr[Math.floor(rng() * arr.length)];
  let clock = 1_700_000_000_000;
  let legacyWrites = 0;
  let divergedFixes = 0;
  let reconciles = 0;

  const replicas = Array.from({ length: nDev }, (_, i) => ({
    dev: 'dev' + (i + 1),
    legacy: i >= nDev - nLegacy,
    entries: [],
    customers: new Map(accts.map((a) => [a, { id: a, creditBalance: 0, points: 0, updatedAt: 1 }])),
  }));
  const logical = new Map();

  /* مصالحة جهاز محدَّث: العدّادات من الدفتر (نفس الدالة النقية التي يستعملها التطبيق) */
  const reconcile = (r) => {
    if (r.legacy) return;
    reconciles++;
    const fixes = planCounterFixes([...r.customers.values()], r.entries);
    for (const f of fixes) {
      const c = r.customers.get(f.id);
      r.customers.set(f.id, { ...c, creditBalance: f.to.balance, points: f.to.points, updatedAt: Math.max(clock, c.updatedAt + 1) });
      divergedFixes++;
    }
  };
  /* بعد حركة مرجعية محلية العدّادات مشتقة فوراً (معاملة واحدة) */
  const deriveLocal = (r, acct) => {
    const f = planCounterFixes([r.customers.get(acct)], r.entries)[0];
    if (f) { const c = r.customers.get(acct); r.customers.set(acct, { ...c, creditBalance: f.to.balance, points: f.to.points, updatedAt: Math.max(clock, c.updatedAt + 1) }); }
  };
  /* مزامنة جهازين: الدفتر اتحاد، والعملاء الأحدث يغلب (تعادل ⟵ الأكبر نصاً لثبات النتيجة) */
  const sync = (a, b) => {
    const m = mergeLedgers(a.entries, b.entries).entries;
    a.entries = m; b.entries = m;
    for (const k of accts) {
      const x = a.customers.get(k); const y = b.customers.get(k);
      const win = x.updatedAt !== y.updatedAt ? (x.updatedAt > y.updatedAt ? x : y) : (JSON.stringify(x) <= JSON.stringify(y) ? x : y);
      a.customers.set(k, { ...win }); b.customers.set(k, { ...win });
    }
    reconcile(a); reconcile(b);
  };

  for (let s = 0; s < steps; s++) {
    clock += 1 + Math.floor(rng() * 5000);
    const r = pickOf(replicas);
    if (rng() < syncProb) {
      const other = pickOf(replicas.filter((x) => x !== r));
      if (other) sync(r, other);
      continue;
    }
    const acct = pickOf(accts);
    if (r.legacy) {
      /* جهاز قديم: يكتب الرصيد/النقاط مباشرة في سجل العميل بلا سطر دفتر */
      const c = r.customers.get(acct);
      const dBal = (rng() < 0.5 ? 1 : -1) * (1 + Math.floor(rng() * 40));
      r.customers.set(acct, { ...c, creditBalance: Math.max(0, c.creditBalance + dBal), points: Math.max(0, c.points + Math.floor(rng() * 20)), updatedAt: clock });
      legacyWrites++;
      continue;
    }
    const unit = pickOf(['wallet', 'points']);
    const ctx = () => ({ dev: r.dev, seq: nextSeq(r.entries, r.dev), now: clock });
    let e = null;
    if (rng() < 0.55) {
      e = makeEntry({ unit, acct, delta: 100 + Math.floor(rng() * 5000), type: unit === 'wallet' ? 'topup' : 'award' }, ctx());
    } else {
      const want = 50 + Math.floor(rng() * 3000);
      if (checkSpend(r.entries, unit, acct, want).ok) e = makeEntry({ unit, acct, delta: -want, type: unit === 'wallet' ? 'spend' : 'redeem' }, ctx());
    }
    if (!e) continue;
    r.entries = [...r.entries, e];
    if (!logical.has(e.id)) logical.set(e.id, { unit: e.unit, acct: e.acct, delta: e.delta });
    deriveLocal(r, acct);
  }
  return { replicas, logical, legacyWrites, get divergedFixes() { return divergedFixes; }, get reconciles() { return reconciles; } };
}

/**
 * مزامنة كاملة بين كل الأجهزة (جولتان) ثم مصالحة نهائية على المحدَّثة، مرتين لانتشار التصحيحات.
 * @param {Array} replicas
 */
export function settleAuthority(replicas) {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < replicas.length; i++) {
      for (let j = 0; j < replicas.length; j++) {
        if (i === j) continue;
        const a = replicas[i]; const b = replicas[j];
        const m = mergeLedgers(a.entries, b.entries).entries;
        a.entries = m; b.entries = m;
        for (const [k, x] of a.customers) {
          const y = b.customers.get(k);
          const win = x.updatedAt !== y.updatedAt ? (x.updatedAt > y.updatedAt ? x : y) : (JSON.stringify(x) <= JSON.stringify(y) ? x : y);
          a.customers.set(k, { ...win }); b.customers.set(k, { ...win });
        }
      }
    }
    /* مصالحة الأجهزة المحدَّثة: تُصحّح ما كتبه جهاز قديم، وتصحيحها أحدث فينتشر في الجولة التالية */
    let t = Math.max(...replicas.flatMap((r) => [...r.customers.values()].map((c) => c.updatedAt))) + 1;
    for (const r of replicas) {
      if (r.legacy) continue;
      for (const f of planCounterFixes([...r.customers.values()], r.entries)) {
        const c = r.customers.get(f.id);
        r.customers.set(f.id, { ...c, creditBalance: f.to.balance, points: f.to.points, updatedAt: t++ });
      }
    }
  }
}

/**
 * يتحقق من مبادئ وضع «الدفتر مرجع» بعد settleAuthority. قائمة مخالفات (فارغة = سليم).
 * @param {{replicas:Array, logical:Map}} sim
 * @returns {string[]}
 */
export function verifyAuthorityInvariants(sim) {
  const bad = [];
  const first = sim.replicas[0].entries;
  sim.replicas.forEach((r) => { if (canon(r.entries) !== canon(first)) bad.push('عدم تقارب الدفتر: ' + r.dev); });
  /* 2 + 4) الدفتر = حركات الأجهزة المحدَّثة فقط، بلا فقدان ولا سطر دخيل */
  const have = new Set(first.map((e) => e.id));
  for (const id of sim.logical.keys()) if (!have.has(id)) bad.push('فُقدت حركة مرجعية: ' + id);
  for (const e of first) if (!sim.logical.has(e.id)) bad.push('سطر دخيل في الدفتر: ' + e.id);
  const expected = new Map();
  for (const l of sim.logical.values()) { const k = accountKey(l.unit, l.acct); expected.set(k, (expected.get(k) || 0) + l.delta); }
  const got = balances(first);
  for (const [k, v] of expected) { const g = (got.get(k) || { balance: 0 }).balance; if (g !== v) bad.push('رصيد الدفتر تغيّر: ' + k + ': ' + g + ' ≠ ' + v); }
  /* 3) لا انحراف متبقٍّ في العدّادات على الأجهزة المحدَّثة */
  for (const r of sim.replicas) {
    if (r.legacy) continue;
    const left = planCounterFixes([...r.customers.values()], r.entries);
    if (left.length) bad.push('انحراف متبقٍّ على ' + r.dev + ': ' + left.map((f) => f.id).join(','));
  }
  return bad;
}
