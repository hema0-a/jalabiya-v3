/* ==========================================================================
   actions-data.js — تحميل مصادر «مركز العمل» وحفظ حالته (v3.19.0)
   ==========================================================================
   يجمع بيانات كل الميزات مرة واحدة، ويحسب النموذج بـ services/action-center.js (نقي ومختبَر).
   البنود المالية (نقص قماش · أسبوع ضيق · إقفال الشهر · مستحقات…) تُحسب وتظهر فقط لدور له حق «المركز المالي».
   الحالة (تأجيل/تم) في settings.actionCenter فتتزامن بين الأجهزة، وتُرحَّل مؤجَّلات الطلبات إلى الإشعار عبر push-sync.
   ========================================================================== */

import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { documents } from '../data/repos/documents.js';
import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { circles } from '../data/repos/circles.js';
import { todos } from '../data/repos/todos.js';
import { inventory } from '../data/repos/inventory.js';
import { workers } from '../data/repos/workers.js';
import { suppliers, supplierEntries } from '../data/repos/suppliers.js';
import { settings } from '../data/repos/settings.js';
import { expenses } from '../data/repos/expenses.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { canAccess } from '../services/roles.js';
import { getRole } from '../security/role-pins.js';
import { getLastExternalBackupAt } from '../services/auto-backup.js';
import { buildActionCenter, pruneState } from '../services/action-center.js';
import { buildPurchasePlan } from '../services/purchase-plan.js';
import { buildCashflow } from '../services/cashflow-forecast.js';
import { buildMonthClose, closeWindow } from '../services/month-close.js';
import { sanitizeMachines } from '../services/machinery.js';

const safe = (p, d = []) => Promise.resolve(p).catch(() => d);

/** يحمّل كل ما يلزم لمركز العمل (والمعاينة في اللوحة). */
export async function loadActionCenter(now = Date.now()) {
  const role = getRole();
  const canFinance = canAccess(role, 'financial-center');
  const [ords, custs, pays, appts, docs, cms, cmps, circs, tds, inv, st] = await Promise.all([
    safe(orders.list()), safe(customers.list()), safe(payments.list()), safe(appointments.list()), safe(documents.list()),
    safe(commitments.list()), safe(commitmentPayments.list()), safe(circles.list()), safe(todos.list()), safe(inventory.list()), safe(settings.get(), {}),
  ]);
  const outOfStock = inv.filter((i) => i && Number(i.quantity) <= 0 && Number(i.minQuantity) >= 0).length;
  let purchase = null; let cashflow = null; let monthClose = null;
  if (canFinance) {
    try {
      const [sups, entries, wks, exps, wps] = await Promise.all([safe(suppliers.list()), safe(supplierEntries.list()), safe(workers.list()), safe(expenses.list()), safe(workerPayments.list())]);
      const fab = (st && st.fabricCalc) || {};
      purchase = buildPurchasePlan({ now, orders: ords, templates: fab.templates, fabricCfg: fab, avgHeightCm: st && st.purchasePlan && st.purchasePlan.avgHeightCm, inventory: inv, suppliers: sups, entries });
      cashflow = buildCashflow({
        now, opening: st && st.cashflow ? st.cashflow.opening : null, payrollDay: st && st.cashflow ? st.cashflow.payrollDay : 0,
        homeMonthly: st && st.familyBudget ? st.familyBudget.total : 0, orders: ords, payments: pays, customers: custs,
        commitments: cms, commitmentPayments: cmps, circles: circs, workers: wks,
      });
      const win = closeWindow(now);
      if (win.open) {
        const closed = (st && st.monthClose && st.monthClose.closed) || {};
        const mc = buildMonthClose({ ym: win.ym, now, orders: ords, payments: pays, expenses: exps, workerPayments: wps, customers: custs, commitments: cms, commitmentPayments: cmps, circles: circs, lastBackupAt: getLastExternalBackupAt(), closedAt: closed[win.ym] });
        monthClose = { open: !mc.closed, ym: mc.ym, label: mc.label, warns: mc.warns };
      }
    } catch (e) { console.warn('[actions] finance sources failed:', e); }
  }
  const state = pruneState(st && st.actionCenter, now);
  const model = buildActionCenter({ now, orders: ords, customers: custs, payments: pays, appointments: appts, documents: docs, commitments: cms, circles: circs, tasks: tds, outOfStock, settings: st, state, canFinance, purchase, cashflow, monthClose, machines: sanitizeMachines(st && st.machines && st.machines.list) });
  return { model, state, role, canFinance, machines: sanitizeMachines(st && st.machines && st.machines.list) };
}

/** يحفظ الحالة كاملة (snoozed + done معاً: update يدمج سطحياً على مستوى المفتاح فيمسح ما حُذف). */
export async function saveActionState(state, now = Date.now()) {
  const p = pruneState(state, now);
  await settings.update({ actionCenter: { snoozed: p.snoozed, done: p.done } });
  return p;
}

/** يحفظ قائمة الماكينات كاملة (update يدمج سطحياً: المفتاح list يُستبدل بالكامل). */
export async function saveMachines(list) {
  const clean = sanitizeMachines(list);
  await settings.update({ machines: { list: clean } });
  return clean;
}
