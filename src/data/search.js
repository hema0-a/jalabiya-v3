/* ==========================================================================
   search.js — محرك البحث الشامل (V3)
   ==========================================================================
   - يبحث في: العملاء، الطلبات، الدفعات، المخزون، العمال، المصروفات،
             الالتزامات، أهداف الادخار، القروض، الإحالات، معرض الأعمال.
   - كل الدوال async (تستخدم repos).
   - V2 كان sync — V3 async بسبب IndexedDB wrapper.
   ========================================================================== */

import { customers as customersRepo } from './repos/customers.js';
import { orders as ordersRepo } from './repos/orders.js';
import { payments as paymentsRepo } from './repos/payments.js';
import { inventory as inventoryRepo } from './repos/inventory.js';
import { workers as workersRepo } from './repos/workers.js';
import { expenses as expensesRepo } from './repos/expenses.js';
import { commitments as commitmentsRepo } from './repos/commitments.js';
import { savingsGoals as goalsRepo } from './repos/savings-goals.js';
import { personalLoans as loansRepo } from './repos/personal-loans.js';
import { referrals as referralsRepo } from './repos/referrals.js';
import { portfolio as portfolioRepo } from './repos/portfolio.js';
import { normalizeSearch, preparePhone, phoneMatchesPrepared } from '../core/utils.js';
import { getWriteVersion } from './idb.js';

/* كاش القوائم: البحث يُستدعى مع كل ضغطة (بعد تأخير قصير) وكان يقرأ ١١ مخزناً كاملاً في كل مرة.
   الآن تُقرأ مرة ثم تُعاد من الذاكرة ما دام عدّاد الكتابة (getWriteVersion) لم يتغيّر في هذا التبويب،
   مع انتهاء صلاحية قصير لالتقاط تعديلات تبويب آخر لا يصل عدّادها إلى هنا.
   لا يُخزَّن شيء إن فشلت قراءة أي مخزن أو إن وقعت كتابة أثناء القراءة. */
export const SEARCH_CACHE_TTL_MS = 15000;
let _cache = null;

/* v3.20.2: النص المطبَّع لكل حقل يُحفظ مع سجله (WeakMap) فلا يُعاد تطبيعه (٩ regex) لكل سجل عند كل ضغطة.
   السجلات نفسها تُعاد من الكاش بين البحثات؛ وعند أي كتابة تُقرأ سجلات جديدة فيزول المحفوظ تلقائياً مع القديمة.
   المفتاح مرفق بالقيمة الخام (raw) فإن تغيّرت في الكائن نفسه أُعيد التطبيع: النتائج مطابقة حرفياً للتطبيع المباشر.
   (لم نبنِ فهرساً عكسياً عمداً: البحث هنا بالجزء الأوسط من الكلمة والهاتف الجزئي، والفهرس يحصره بأوائل الكلمات.) */
const _memo = new WeakMap();
function slot(rec) {
  let m = _memo.get(rec);
  if (!m) { m = Object.create(null); _memo.set(rec, m); }
  return m;
}
/** normalizeSearch(raw) محفوظة لحقل في سجل. */
export function nz(rec, field, raw) {
  if (rec === null || typeof rec !== 'object') return normalizeSearch(raw);
  const m = slot(rec); const e = m[field];
  if (e !== undefined && e.raw === raw) return e.norm;
  const norm = normalizeSearch(raw);
  m[field] = { raw, norm };
  return norm;
}
/** هاتف مجهَّز محفوظ لسجل. */
export function ph(rec, field, raw, q) {
  if (rec === null || typeof rec !== 'object') return phoneMatchesPrepared(preparePhone(raw), q);
  const m = slot(rec); let e = m['p:' + field];
  if (e === undefined || e.raw !== raw) { e = { raw, prep: preparePhone(raw) }; m['p:' + field] = e; }
  return phoneMatchesPrepared(e.prep, q);
}
/** نص بنود الطلب المطبَّع (يُعاد حسابه فقط إن تغيّرت مصفوفة البنود). */
export function nzItems(o) {
  const m = slot(o); const e = m.items;
  if (e !== undefined && e.ref === o.items) return e.norm;
  const text = Array.isArray(o.items) ? o.items.map((it) => (it && it.name) || '').join(' ') : '';
  const norm = normalizeSearch(text);
  m.items = { ref: o.items, norm };
  return norm;
}

/** إبطال الكاش يدوياً (للاختبار أو بعد عمليات خارج idb). */
export function clearSearchCache() { _cache = null; }

async function loadAll() {
  const ver = getWriteVersion();
  const t0 = Date.now();
  if (_cache && _cache.ver === ver && t0 - _cache.at < SEARCH_CACHE_TTL_MS) return _cache.data;
  let failed = false;
  const safe = (repo) => repo.list().catch(() => { failed = true; return []; });
  const data = await Promise.all([
    safe(customersRepo), safe(ordersRepo), safe(paymentsRepo), safe(inventoryRepo),
    safe(workersRepo), safe(expensesRepo), safe(commitmentsRepo), safe(goalsRepo),
    safe(loansRepo), safe(referralsRepo), safe(portfolioRepo),
  ]);
  _cache = (!failed && getWriteVersion() === ver) ? { ver, at: t0, data } : null;
  return data;
}

/**
 * وصف حالة الطلب (نص + لون).
 * @param {string} status
 * @returns {{label:string, color:string}}
 */
function getOrderStatusInfo(status) {
  const map = {
    pending:     { label: 'انتظار', color: '#F57C00' },
    in_progress: { label: 'تنفيذ',  color: '#1565C0' },
    ready:       { label: 'جاهز',   color: '#6A1B9A' },
    delivered:   { label: 'مُسلَّم', color: '#2E7D32' },
    cancelled:   { label: 'ملغي',   color: '#C62828' },
  };
  return map[status || 'pending'] || map.pending;
}

/**
 * البحث الشامل في كل الكيانات.
 * @param {string} query — نص البحث (حرفان على الأقل)
 * @returns {Promise<{
 *   customers:Array, orders:Array, payments:Array, inventory:Array,
 *   workers:Array, expenses:Array, commitments:Array, goals:Array,
 *   loans:Array, referrals:Array, portfolio:Array, totalCount:number
 * }>}
 */
export async function searchAll(query) {
  const q = normalizeSearch(query);

  const empty = {
    customers: [], orders: [], payments: [], inventory: [],
    workers: [], expenses: [], commitments: [], goals: [],
    loans: [], referrals: [], portfolio: [],
    totalCount: 0,
  };

  if (q.length < 2) return empty;

  const results = { ...empty };

  /* جلب كل البيانات بالتوازي (من الكاش إن لم تتغيّر البيانات) */
  const [
    customers, orders, payments, inventory, workers, expenses,
    commitments, goals, loans, referrals, portfolio,
  ] = await loadAll();

  /* خريطة العملاء (لربط الطلبات والدفعات) */
  const custMap = {};
  customers.forEach((c) => { custMap[c.id] = c; });

  /* 1. العملاء */
  customers.forEach((c) => {
    if (nz(c, 'name', c.name).includes(q) || ph(c, 'phone', c.phone, q)) {
      results.customers.push({
        id: c.id, type: 'customer', icon: '👤',
        title: c.name || 'بدون اسم',
        subtitle: c.phone || 'بدون هاتف',
        isVip: !!c.vip,
      });
    }
  });

  /* 2. الطلبات */
  orders.forEach((o) => {
    const c = custMap[o.customerId];
    const custName = c ? c.name : '';
    const notes = o.notes || '';
    /* v3.5.3: يُبحث أيضاً في أسماء بنود الطلب وهاتف العميل (كان لا يجد الطلب إلا باسم العميل أو ملاحظاته) */
    if ((c ? nz(c, 'name', custName) : '').includes(q) || nz(o, 'notes', notes).includes(q) ||
        nzItems(o).includes(q) || (c ? ph(c, 'phone', c.phone, q) : false)) {
      results.orders.push({
        id: o.id, type: 'order', icon: '📋',
        title: custName || 'عميل محذوف',
        subtitle: notes || ((o.amount || 0) + ' ج.م'),
        status: getOrderStatusInfo(o.status),
      });
    }
  });

  /* 3. الدفعات */
  payments.forEach((p) => {
    const c = custMap[p.customerId];
    const custName = c ? c.name : '';
    if (
      (c ? nz(c, 'name', custName) : '').includes(q) ||
      nz(p, 'amount', p.amount).includes(q) ||
      nz(p, 'notes', p.notes).includes(q)
    ) {
      results.payments.push({
        id: p.id, type: 'payment', icon: '💰',
        title: (custName || 'دفعة') + ' — ' + (p.amount || 0) + ' ج.م',
        subtitle: p.notes || 'دفعة',
      });
    }
  });

  /* 4. المخزون */
  inventory.forEach((i) => {
    if (nz(i, 'name', i.name).includes(q)) {
      results.inventory.push({
        id: i.id, type: 'inventory', icon: '📦',
        title: i.name,
        subtitle: 'الكمية: ' + (i.quantity || 0),
      });
    }
  });

  /* 5. العمال */
  workers.forEach((w) => {
    if (nz(w, 'name', w.name).includes(q) || ph(w, 'phone', w.phone, q)) {
      results.workers.push({
        id: w.id, type: 'worker', icon: '👷',
        title: w.name || 'عامل',
        subtitle: w.phone || w.role || 'عامل',
      });
    }
  });

  /* 6. المصروفات */
  expenses.forEach((e) => {
    const note = e.notes || e.note || '';
    if (nz(e, 'note', note).includes(q)) {
      results.expenses.push({
        id: e.id, type: 'expense', icon: '💸',
        title: (e.amount || 0) + ' ج.م',
        subtitle: note || 'مصروف',
      });
    }
  });

  /* 7. الالتزامات */
  commitments.forEach((c) => {
    if (nz(c, 'name', c.name).includes(q)) {
      results.commitments.push({
        id: c.id, type: 'commitment', icon: '💳',
        title: c.name,
        subtitle: (c.amount || 0) + ' ج.م',
      });
    }
  });

  /* 8. أهداف الادخار */
  goals.forEach((g) => {
    if (nz(g, 'name', g.name).includes(q)) {
      results.goals.push({
        id: g.id, type: 'goal', icon: '🏦',
        title: g.name,
        subtitle: (g.currentAmount || 0) + ' / ' + (g.targetAmount || 0) + ' ج.م',
      });
    }
  });

  /* 9. القروض */
  loans.forEach((l) => {
    if (nz(l, 'personName', l.personName).includes(q) || ph(l, 'phone', l.phone, q)) {
      results.loans.push({
        id: l.id, type: 'loan', icon: '💵',
        title: l.personName || 'قرض',
        subtitle: (l.amount || 0) + ' ج.م',
      });
    }
  });

  /* 10. الإحالات */
  referrals.forEach((r) => {
    if (
      nz(r, 'referrerName', r.referrerName).includes(q) ||
      nz(r, 'referredName', r.referredName).includes(q) ||
      ph(r, 'referredPhone', r.referredPhone, q)
    ) {
      results.referrals.push({
        id: r.id, type: 'referral', icon: '🤝',
        title: (r.referrerName || '') + ' → ' + (r.referredName || ''),
        subtitle: (r.reward || 0) + ' ج.م',
      });
    }
  });

  /* 11. معرض الأعمال */
  portfolio.forEach((p) => {
    if (nz(p, 'title', p.title).includes(q)) {
      results.portfolio.push({
        id: p.id, type: 'portfolio', icon: '📸',
        title: p.title,
        subtitle: (p.price || 0) + ' ج.م',
      });
    }
  });

  /* الإجمالي */
  results.totalCount =
    results.customers.length + results.orders.length + results.payments.length +
    results.expenses.length + results.inventory.length + results.workers.length +
    results.commitments.length + results.goals.length + results.loans.length +
    results.referrals.length + results.portfolio.length;

  return results;
}
