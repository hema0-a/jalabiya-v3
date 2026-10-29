/* ==========================================================================
   customers-load.js — تحميل بيانات صفحة العملاء (v3.5.8)
   ==========================================================================
   loadCustomers(state): العملاء + إجمالي المدفوع وعدد الطلبات + ترقية VIP التلقائية.
   loadMeasurementFields(state): حقول المقاسات المفعَّلة من الإعدادات.
   تكتبان في كائن الحالة الممرَّر (customers · customerTotals · measurementFields).
   ========================================================================== */

import { withDepositPayments } from '../services/payments-view.js';
import { loadVipRules, computeVipPromotions } from '../services/vip-rules.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { toast } from '../ui/toast.js';

export async function loadCustomers(state) {
  const [list, ordersList, rawPayments] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
  ]);
  const paymentsList = withDepositPayments(rawPayments, ordersList);

  const totals = {};
  paymentsList.forEach((p) => {
    const cid = p.customerId;
    if (!cid) return;
    totals[cid] = (totals[cid] || 0) + (Number(p.amount) || 0);
  });
  state.customerTotals = totals;

  const ordersCount = {};
  ordersList.forEach((o) => {
    const cid = o.customerId;
    if (!cid) return;
    ordersCount[cid] = (ordersCount[cid] || 0) + 1;
  });

  /* ترقية VIP تلقائية (ترقية فقط — لا يُنزَّل أي VIP يدوي). v3.3.30 */
  try {
    const rules = loadVipRules();
    if (rules.enabled) {
      const promos = computeVipPromotions(list, ordersList, rules);
      for (const p of promos) {
        await customers.update(p.id, { vip: true });
        const c = list.find((x) => x.id === p.id);
        if (c) c.vip = true;
      }
      if (promos.length) toast.success('⭐ تمت ترقية ' + promos.length + ' عميل إلى VIP تلقائياً');
    }
  } catch (e) { console.warn('[customers] auto VIP:', e); }

  list.forEach((c) => {
    c._totalPaid = totals[c.id] || 0;
    c._ordersCount = ordersCount[c.id] || 0;
  });

  state.customers = list;
}

export async function loadMeasurementFields(state) {
  try {
    const s = await settings.get();
    const fields = Array.isArray(s.measurementFields) ? s.measurementFields : [];
    state.measurementFields = fields.filter((f) => f.enabled !== false);
  } catch {
    state.measurementFields = [];
  }
}
