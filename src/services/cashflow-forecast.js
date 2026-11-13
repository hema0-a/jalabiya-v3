/* ==========================================================================
   cashflow-forecast.js — توقّع السيولة 30 يوماً (v3.19.0) — دوال نقية بلا DOM ولا قاعدة بيانات
   ==========================================================================
   يضع على كل يوم قادم ما سيدخل وما سيخرج مما هو معروف التوقيت في بياناتك، ويحذّر من الأسابيع الضيقة.
   الداخل: المتبقي على الطلبات المفتوحة عند موعد تسليمها (المتأخرة بعد 3 أيام، والجاهزة خلال يومين) · قبض الجمعية في دورك.
   الخارج: الالتزامات الشهرية غير المدفوعة · أقساط الجمعيات غير المدفوعة · رواتب العمال الثابتة (يوم الصرف) · تقدير مصروف البيت من الميزانية.
   خارج الجدولة (يُعرض منفصلاً ولا يدخل الحساب): مستحقات العملاء المتأخرة · مستحقات الموردين · القروض (لا جدول لها) · الأجر اليومي/بالقطعة.
   «الرصيد الافتتاحي» اختياري: بدونه يُعرض صافي الحركة فقط، ومعه يُعرض الرصيد وأول يوم ينفد فيه.
   ========================================================================== */

import { orderPaidBreakdown } from './payments-view.js';
import { schedule, potOf } from './circles.js';

const DAY = 86400000;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const sod = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ymKey = (y, m) => y + '-' + String(m + 1).padStart(2, '0');
const ymdOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const LATE_ORDER_DELAY_DAYS = 3;
export const READY_COLLECT_DAYS = 2;

/**
 * @param {Object} s — { now, days, opening, payrollDay, homeMonthly, orders, payments, customers, commitments, commitmentPayments, circles, workers, supplierOwed }
 * @returns {{days:Array, summary:Object, tightWeeks:Array, unscheduled:Object, notes:string[], hasOpening:boolean}}
 */
export function buildCashflow(input = {}) {
  const s = input || {};
  const now = n(s.now) || Date.now();
  const horizon = Math.min(90, Math.max(7, Math.round(n(s.days)) || 30));
  const start = sod(now);
  const end = start + horizon * DAY;
  const hasOpening = s.opening != null && s.opening !== '' && Number.isFinite(Number(s.opening));
  const opening = hasOpening ? Number(s.opening) : 0;
  const names = new Map((Array.isArray(s.customers) ? s.customers : []).filter((c) => c && c.id != null).map((c) => [c.id, String(c.name || 'عميل')]));

  const days = Array.from({ length: horizon }, (_, i) => ({ ts: start + i * DAY, ymd: ymdOf(start + i * DAY), inflow: 0, outflow: 0, net: 0, balance: null, items: [] }));
  const put = (ts, kind, label, amount, flag) => {
    const i = Math.floor((sod(ts) - start) / DAY);
    if (i < 0 || i >= horizon || !(amount > 0)) return;
    const day = days[i];
    if (kind === 'in') day.inflow += amount; else day.outflow += amount;
    day.items.push({ kind, label, amount: r2(amount), flag: flag || '' });
  };

  /* --- الداخل: الطلبات المفتوحة --- */
  const orders = Array.isArray(s.orders) ? s.orders : [];
  const pays = new Map();
  for (const p of Array.isArray(s.payments) ? s.payments : []) { if (!p || !p.orderId) continue; if (!pays.has(p.orderId)) pays.set(p.orderId, []); pays.get(p.orderId).push(p); }
  let noDate = 0; let noDateAmount = 0;
  for (const o of orders) {
    if (!o || o.status === 'delivered' || o.status === 'cancelled') continue;
    const amount = n(o.amount); if (amount <= 0) continue;
    const remaining = r2(amount - orderPaidBreakdown(o, pays.get(o.id) || []).paid);
    if (remaining <= 0.01) continue;
    const who = names.get(o.customerId) || 'عميل';
    let at; let flag = '';
    if (o.status === 'ready') { at = start + READY_COLLECT_DAYS * DAY; flag = 'ready'; }
    else if (n(o.dueDate) > 0) {
      const due = sod(n(o.dueDate));
      if (due < start) { at = start + LATE_ORDER_DELAY_DAYS * DAY; flag = 'late'; } else at = due;
    } else { noDate++; noDateAmount += remaining; continue; }
    put(at, 'in', 'تحصيل ' + who, remaining, flag);
  }

  /* --- الخارج: الالتزامات الشهرية غير المدفوعة --- */
  const cp = Array.isArray(s.commitmentPayments) ? s.commitmentPayments : [];
  const months = [];
  { const a = new Date(start); const b = new Date(end - 1); let y = a.getFullYear(); let m = a.getMonth();
    while ((y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) && months.length < 5) { months.push({ y, m, dim: new Date(y, m + 1, 0).getDate() }); m++; if (m > 11) { m = 0; y++; } } }
  for (const c of Array.isArray(s.commitments) ? s.commitments : []) {
    if (!c || c.active === false || n(c.amount) <= 0) continue;
    if (c.frequency && c.frequency !== 'monthly') continue;
    const day = Number(c.dueDay); if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    for (const mo of months) {
      if (c.endMonth && String(c.endMonth) < ymKey(mo.y, mo.m)) continue;
      const at = new Date(mo.y, mo.m, Math.min(day, mo.dim), 12).getTime();
      const paid = cp.some((p) => p && p.commitmentId === c.id && n(p.amount) > 0 && ymKey(new Date(n(p.date)).getFullYear(), new Date(n(p.date)).getMonth()) === ymKey(mo.y, mo.m));
      if (!paid) put(at, 'out', String(c.name || 'التزام'), n(c.amount));
    }
  }

  /* --- الجمعيات: القسط (خارج) وقبض دورك (داخل) --- */
  for (const c of Array.isArray(s.circles) ? s.circles : []) {
    if (!c || c.active === false) continue;
    const payDay = Number(c.payDay); if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) continue;
    const rows = schedule(c);
    for (const mo of months) {
      const row = rows.find((r) => r.ym === ymKey(mo.y, mo.m)); if (!row) continue;
      const at = new Date(mo.y, mo.m, Math.min(payDay, mo.dim), 12).getTime();
      if (!row.paid) put(at, 'out', 'قسط ' + String(c.name || 'جمعية'), n(c.installment));
      if (row.isMyTurn && c.collected !== true) put(at, 'in', 'قبض ' + String(c.name || 'جمعية'), potOf(c));
    }
  }

  /* --- رواتب العمال الثابتة يوم الصرف (تقدير) --- */
  const workers = (Array.isArray(s.workers) ? s.workers : []).filter((w) => w && w.active !== false && w.salaryType === 'fixed' && n(w.salary) > 0);
  const payroll = r2(workers.reduce((a, w) => a + n(w.salary), 0));
  if (payroll > 0) {
    const pd = Math.round(n(s.payrollDay)) || 0;
    for (const mo of months) put(new Date(mo.y, mo.m, pd >= 1 && pd <= 31 ? Math.min(pd, mo.dim) : mo.dim, 12).getTime(), 'out', 'رواتب العمال (تقدير)', payroll, 'estimate');
  }

  /* --- مصروف البيت: تقدير يومي من الميزانية --- */
  const homeDaily = n(s.homeMonthly) > 0 ? r2(n(s.homeMonthly) / 30) : 0;
  if (homeDaily > 0) days.forEach((d) => { d.outflow += homeDaily; d.items.push({ kind: 'out', label: 'مصروف البيت (تقدير)', amount: homeDaily, flag: 'estimate' }); });

  /* --- التجميع --- */
  let run = opening; let totalIn = 0; let totalOut = 0; let min = null; let firstNeg = null;
  days.forEach((d) => {
    d.inflow = r2(d.inflow); d.outflow = r2(d.outflow); d.net = r2(d.inflow - d.outflow);
    totalIn += d.inflow; totalOut += d.outflow; run = r2(run + d.net);
    if (hasOpening) { d.balance = run; if (run < 0 && !firstNeg) firstNeg = d.ymd; }
    if (min === null || run < min.value) min = { value: run, ymd: d.ymd };
  });
  const tightWeeks = [];
  for (let i = 0; i < horizon; i += 7) {
    const part = days.slice(i, i + 7); const inn = part.reduce((a, d) => a + d.inflow, 0); const out = part.reduce((a, d) => a + d.outflow, 0);
    const bal = hasOpening ? part[part.length - 1].balance : null;
    if (out > inn && (hasOpening ? bal < Math.max(0, out - inn) * 0.5 || bal < 0 : out - inn > 0)) tightWeeks.push({ from: part[0].ymd, to: part[part.length - 1].ymd, inflow: r2(inn), outflow: r2(out), net: r2(inn - out), balance: bal });
  }
  const notes = [
    'الطلبات المفتوحة تُحصَّل عند موعد تسليمها (المتأخرة بعد ' + LATE_ORDER_DELAY_DAYS + ' أيام، والجاهزة خلال يومين).',
    'لا تدخل الحساب: مستحقات العملاء المتأخرة والموردين، والقروض، والأجر اليومي أو بالقطعة.',
  ];
  if (payroll > 0) notes.push('رواتب العمال الثابتة تقديرية في يوم الصرف المحدد.');
  if (homeDaily > 0) notes.push('مصروف البيت تقدير من ميزانية الأسرة.');
  return {
    days, hasOpening, notes, tightWeeks,
    summary: { inflow: r2(totalIn), outflow: r2(totalOut), net: r2(totalIn - totalOut), end: hasOpening ? run : null, min, firstNegative: firstNeg },
    unscheduled: { orders: noDate, ordersAmount: r2(noDateAmount), supplierOwed: r2(Math.max(0, n(s.supplierOwed))) },
  };
}
