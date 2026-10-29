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
  const q = String(query || '').trim().toLowerCase();

  const empty = {
    customers: [], orders: [], payments: [], inventory: [],
    workers: [], expenses: [], commitments: [], goals: [],
    loans: [], referrals: [], portfolio: [],
    totalCount: 0,
  };

  if (q.length < 2) return empty;

  const results = { ...empty };

  /* جلب كل البيانات بالتوازي */
  const [
    customers, orders, payments, inventory, workers, expenses,
    commitments, goals, loans, referrals, portfolio,
  ] = await Promise.all([
    customersRepo.list().catch(() => []),
    ordersRepo.list().catch(() => []),
    paymentsRepo.list().catch(() => []),
    inventoryRepo.list().catch(() => []),
    workersRepo.list().catch(() => []),
    expensesRepo.list().catch(() => []),
    commitmentsRepo.list().catch(() => []),
    goalsRepo.list().catch(() => []),
    loansRepo.list().catch(() => []),
    referralsRepo.list().catch(() => []),
    portfolioRepo.list().catch(() => []),
  ]);

  /* خريطة العملاء (لربط الطلبات والدفعات) */
  const custMap = {};
  customers.forEach((c) => { custMap[c.id] = c; });

  /* 1. العملاء */
  customers.forEach((c) => {
    if ((c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)) {
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
    if (custName.toLowerCase().includes(q) || notes.toLowerCase().includes(q)) {
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
      custName.toLowerCase().includes(q) ||
      String(p.amount || '').includes(q) ||
      (p.notes || '').toLowerCase().includes(q)
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
    if ((i.name || '').toLowerCase().includes(q)) {
      results.inventory.push({
        id: i.id, type: 'inventory', icon: '📦',
        title: i.name,
        subtitle: 'الكمية: ' + (i.quantity || 0),
      });
    }
  });

  /* 5. العمال */
  workers.forEach((w) => {
    if ((w.name || '').toLowerCase().includes(q) || (w.phone || '').includes(q)) {
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
    if (note.toLowerCase().includes(q)) {
      results.expenses.push({
        id: e.id, type: 'expense', icon: '💸',
        title: (e.amount || 0) + ' ج.م',
        subtitle: note || 'مصروف',
      });
    }
  });

  /* 7. الالتزامات */
  commitments.forEach((c) => {
    if ((c.name || '').toLowerCase().includes(q)) {
      results.commitments.push({
        id: c.id, type: 'commitment', icon: '💳',
        title: c.name,
        subtitle: (c.amount || 0) + ' ج.م',
      });
    }
  });

  /* 8. أهداف الادخار */
  goals.forEach((g) => {
    if ((g.name || '').toLowerCase().includes(q)) {
      results.goals.push({
        id: g.id, type: 'goal', icon: '🏦',
        title: g.name,
        subtitle: (g.currentAmount || 0) + ' / ' + (g.targetAmount || 0) + ' ج.م',
      });
    }
  });

  /* 9. القروض */
  loans.forEach((l) => {
    if ((l.personName || '').toLowerCase().includes(q) || (l.phone || '').includes(q)) {
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
      (r.referrerName || '').toLowerCase().includes(q) ||
      (r.referredName || '').toLowerCase().includes(q) ||
      (r.referredPhone || '').includes(q)
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
    if ((p.title || '').toLowerCase().includes(q)) {
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
