/* ==========================================================================
   action-center.js — مركز العمل: ما يجب فعله اليوم من كل الميزات (v3.19.0) — دوال نقية بلا DOM ولا قاعدة بيانات
   ==========================================================================
   الملخص والإشعار «يعرضان»؛ هذا «يُنجِز»: قائمة موحّدة مرتّبة بالأولوية، لكل بند مفتاح ثابت يمكن تأجيله أو إنجازه.
     ✓ تم        ⟵ يُخفى اليوم فقط (إن بقيت المشكلة عاد غداً).
     ⏰ أجّل     ⟵ يُخفى حتى تاريخ (غداً · 3 أيام · الأسبوع القادم).
   المصادر: طلبات متأخرة/اليوم · جاهز لم يُستلم · مستحقات العملاء · مواعيد · مستندات · التزامات · جمعيات · مهام · مخزون · عملاء منقطعون
            + اختيارياً: نقص قماش (purchase-plan) · أسبوع ضيق (cashflow) · إقفال الشهر.
   state = { snoozed:{key:'YYYY-MM-DD'}, done:{key:'YYYY-MM-DD'} } يُحفظ في settings.actionCenter (يتزامن بين الأجهزة).
   ========================================================================== */

import { computePickups } from './pickup-reminders.js';
import { computeReceivables } from './receivables.js';
import { winbackList } from './winback.js';
import { documentStatus } from './documents.js';
import { taskBucket, normalizeKind } from './todos.js';
import { schedule } from './circles.js';
import { normalizePersonalControls, filterForHardMonth } from './daily-need.js';
import { machineAlerts } from './machinery.js';

const DAY = 86400000;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = (v) => (Array.isArray(v) ? v : []);
const sod = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const ymdOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dm = (ymd) => { const p = String(ymd || '').split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : String(ymd || ''); };
const money = (v) => Math.round(n(v)).toLocaleString('en-US') + ' ج';

export const KINDS = Object.freeze({
  'late-order': { icon: '🔴', label: 'طلب متأخر', route: '#/orders' },
  'today-order': { icon: '📅', label: 'يُسلَّم اليوم', route: '#/orders' },
  pickup: { icon: '📦', label: 'جاهز لم يُستلم', route: '#/pickups' },
  receivable: { icon: '🧾', label: 'مستحق متأخر', route: '#/debts', finance: true },
  appointment: { icon: '🗓️', label: 'موعد', route: '#/appointments' },
  document: { icon: '🗂️', label: 'مستند', route: '#/documents' },
  commitment: { icon: '💳', label: 'التزام', route: '#/commitments', finance: true },
  circle: { icon: '🪙', label: 'قسط جمعية', route: '#/circles', finance: true },
  task: { icon: '✅', label: 'مهمة', route: '#/todos' },
  stock: { icon: '🧰', label: 'نفد من المخزون', route: '#/inventory' },
  purchase: { icon: '🛒', label: 'نقص قماش', route: '#/inventory' },
  cashflow: { icon: '💧', label: 'أسبوع ضيق', route: '#/financial-center', finance: true },
  machine: { icon: '🛠️', label: 'صيانة ماكينة', route: '#/actions' },
  winback: { icon: '💤', label: 'عميل منقطع', route: '#/customers' },
  'month-close': { icon: '🔒', label: 'إقفال الشهر', route: '#/reports', finance: true },
});

/** مفاتيح بنود الطلبات التي تُرحَّل إلى digest ليحترم الإشعار تأجيلها. */
export const ORDER_KEY = /^(late-order|today-order|pickup):(.+)$/;

/** يحذف المنتهي من الحالة (تأجيل مضى · «تم» لأمس) ليبقى صغيراً. */
export function pruneState(state, now = Date.now()) {
  const today = ymdOf(now); const s = state || {};
  const snoozed = {}; const done = {};
  for (const [k, v] of Object.entries(s.snoozed || {})) if (typeof v === 'string' && v > today) snoozed[k] = v;
  for (const [k, v] of Object.entries(s.done || {})) if (v === today) done[k] = v;
  return { snoozed, done };
}
/** حالة بعد تأجيل بند `days` أيام (أو حتى الأسبوع القادم). */
export function snoozeKey(state, key, days, now = Date.now()) {
  const p = pruneState(state, now);
  p.snoozed[key] = ymdOf(sod(now) + Math.max(1, Math.round(days)) * DAY + 12 * 3600000);
  return p;
}
export function doneKey(state, key, now = Date.now()) { const p = pruneState(state, now); p.done[key] = ymdOf(now); return p; }
export function clearKey(state, key, now = Date.now()) { const p = pruneState(state, now); delete p.snoozed[key]; delete p.done[key]; return p; }

/** {orderId: untilYmd} للطلبات المؤجَّلة — يرفعها التطبيق في digest. */
export function snoozedOrders(state, now = Date.now()) {
  const out = {}; const p = pruneState(state, now);
  for (const [k, v] of Object.entries(p.snoozed)) { const m = ORDER_KEY.exec(k); if (m) out[m[2]] = v; }
  return out;
}

/**
 * @param {Object} s — { now, orders, customers, payments, appointments, documents, commitments, circles, tasks, outOfStock, settings, machines,
 *                       state, canFinance, purchase, cashflow, monthClose, pickupDays }
 * @returns {{items:Array, snoozed:Array, done:Array, total:number, byKind:Object}}
 */
export function buildActionCenter(input = {}) {
  const s = input || {};
  const now = n(s.now) || Date.now();
  const today = sod(now); const todayYmd = ymdOf(now);
  const state = pruneState(s.state, now);
  const custs = new Map(arr(s.customers).filter((c) => c && c.id != null).map((c) => [c.id, c]));
  const who = (id) => (custs.get(id) && custs.get(id).name) || 'عميل';
  const phoneOf = (id) => (custs.get(id) && custs.get(id).phone) || '';
  const all = [];
  const add = (kind, ref, priority, title, subtitle, extra = {}) => {
    const meta = KINDS[kind];
    all.push({ key: kind + ':' + ref, kind, ref: String(ref), icon: meta.icon, label: meta.label, route: meta.route, finance: !!meta.finance, priority, title, subtitle, phone: '', customerId: null, amount: 0, ...extra });
  };

  for (const o of arr(s.orders)) {
    if (!o || n(o.dueDate) <= 0 || !(o.status === 'pending' || o.status === 'in_progress')) continue;
    const due = sod(n(o.dueDate));
    if (due < today) { const d = Math.round((today - due) / DAY); add('late-order', o.id, 90 + Math.min(d, 9), who(o.customerId), 'متأخر ' + d + ' يوم', { customerId: o.customerId, phone: phoneOf(o.customerId), orderId: o.id }); }
    else if (due === today) add('today-order', o.id, 80, who(o.customerId), 'موعد تسليمه اليوم', { customerId: o.customerId, phone: phoneOf(o.customerId), orderId: o.id });
  }
  const minDays = n(s.pickupDays) > 0 ? n(s.pickupDays) : undefined;
  for (const p of computePickups(arr(s.orders), arr(s.payments), arr(s.customers), now, minDays).items) {
    if (!p.late) continue;
    add('pickup', p.orderId, 70 + Math.min(p.ageDays, 9), p.name, 'جاهز منذ ' + p.ageDays + ' يوم' + (p.remaining > 0 ? ' · متبقٍّ ' + money(p.remaining) : ''), { customerId: p.customerId, phone: p.phone, orderId: p.orderId, amount: p.remaining });
  }
  const rec = computeReceivables(arr(s.orders), arr(s.payments), arr(s.customers), now);
  for (const c of arr(rec.customers)) {
    const overdue = n(c.overdue != null ? c.overdue : c.overdueAmount);
    if (overdue <= 0) continue;
    add('receivable', c.customerId != null ? c.customerId : c.id, 75 + Math.min(Math.floor(overdue / 1000), 9), String(c.name || who(c.customerId)), 'مستحق متأخر ' + money(overdue), { customerId: c.customerId != null ? c.customerId : c.id, phone: c.phone || phoneOf(c.customerId), amount: overdue });
  }
  for (const a of arr(s.appointments)) {
    if (!a || a.status === 'done' || a.status === 'cancelled') continue;
    const at = n(a.date); if (at <= 0) continue;
    const d = sod(at);
    if (d === today) add('appointment', a.id, 85, String(a.title || 'موعد') + (a.customerId ? ' — ' + who(a.customerId) : ''), 'اليوم ' + new Date(at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }), { customerId: a.customerId || null, phone: a.customerId ? phoneOf(a.customerId) : '' });
    else if (d < today) add('appointment', a.id, 60, String(a.title || 'موعد') + (a.customerId ? ' — ' + who(a.customerId) : ''), 'فات ولم يُنجَز', { customerId: a.customerId || null, phone: a.customerId ? phoneOf(a.customerId) : '' });
  }
  for (const d of arr(s.documents)) {
    if (!d || !(n(d.expiresAt) > 0)) continue;
    const st = documentStatus(d, new Date(now));
    if (st.status === 'expired') add('document', d.id, 82, String(d.title || 'مستند'), 'منتهٍ', {});
    else if (st.status === 'due') add('document', d.id, 65, String(d.title || 'مستند'), 'ينتهي بعد ' + st.daysLeft + ' يوم', {});
  }
  const hard = normalizePersonalControls((s.settings || {}).personalControls).hardMonth;
  const dom = new Date(now).getDate(); const dim = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 0).getDate();
  for (const c of filterForHardMonth(arr(s.commitments), hard)) {
    if (!c || c.active === false) continue;
    const day = Number(c.dueDay); if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    const left = Math.min(day, dim) - dom;
    if (left >= 0 && left <= 3) add('commitment', c.id, 70, String(c.name || 'التزام'), left === 0 ? 'يستحق اليوم' : 'يستحق بعد ' + left + ' يوم', { amount: n(c.amount) });
  }
  const ym = new Date(now).getFullYear() + '-' + String(new Date(now).getMonth() + 1).padStart(2, '0');
  for (const c of arr(s.circles)) {
    if (!c || c.active === false) continue;
    const day = Number(c.payDay); if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    const row = schedule(c).find((r) => r.ym === ym); if (!row || row.paid) continue;
    const left = Math.min(day, dim) - dom;
    if (left >= 0 && left <= 3) add('circle', c.id, 68, String(c.name || 'جمعية'), left === 0 ? 'القسط اليوم' : 'القسط بعد ' + left + ' يوم', { amount: n(c.installment) });
  }
  for (const t of arr(s.tasks)) {
    if (!t || normalizeKind(t.kind) !== 'task' || t.done === true || !(n(t.due) > 0)) continue;
    const b = taskBucket(t, new Date(now));
    if (b === 'overdue') add('task', t.id, 74, String(t.title || 'مهمة'), 'متأخرة', {});
    else if (b === 'today') add('task', t.id, 72, String(t.title || 'مهمة'), 'مهمة اليوم', {});
  }
  if (n(s.outOfStock) > 0) add('stock', 'out', 50, n(s.outOfStock) + ' صنف نفد من المخزون', 'اطلبها قبل أن تعطّل الشغل', {});
  const pp = s.purchase;
  if (pp && pp.usable && n(pp.shortM) > 0) add('purchase', 'fabric', 55, 'ينقصك ≈ ' + n(pp.shortM) + ' م قماش للطلبات المفتوحة', (pp.supplier ? 'أرخص مورد: ' + pp.supplier.name + ' · ' : '') + (pp.orderBy ? 'اطلب قبل ' + dm(pp.orderBy) : ''), {});
  const cf = s.cashflow;
  if (cf && Array.isArray(cf.tightWeeks) && cf.tightWeeks.length) { const w = cf.tightWeeks[0]; add('cashflow', w.from, 66, 'أسبوع ضيق قادم (' + dm(w.from) + ')', 'الخارج ' + money(w.outflow) + ' مقابل داخل ' + money(w.inflow), { amount: Math.abs(n(w.net)) }); }
  const mc = s.monthClose;
  if (mc && mc.open && n(mc.warns) > 0) add('month-close', mc.ym, 45, 'إقفال ' + (mc.label || 'الشهر'), mc.warns + ' بند يحتاج عملاً قبل الإقفال', {});
  for (const m of machineAlerts(s.machines)) add('machine', m.id, m.state === 'due' ? 78 : 48, m.name, m.subtitle, { machineId: m.id });
  for (const w of winbackList(arr(s.customers), arr(s.orders), now).slice(0, 3)) add('winback', w.customerId, 20, w.name, 'لم يطلب منذ ' + w.daysSince + ' يوم', { customerId: w.customerId, phone: w.phone, amount: w.totalSpent });

  const visibleFinance = (it) => s.canFinance !== false || !it.finance;
  const items = []; const snoozed = []; const done = [];
  for (const it of all.filter(visibleFinance)) {
    if (state.done[it.key] === todayYmd) done.push(it);
    else if (state.snoozed[it.key] && state.snoozed[it.key] > todayYmd) snoozed.push({ ...it, until: state.snoozed[it.key] });
    else items.push(it);
  }
  const by = (a, b) => b.priority - a.priority || a.title.localeCompare(b.title, 'ar');
  items.sort(by);
  const byKind = {}; items.forEach((i) => { byKind[i.kind] = (byKind[i.kind] || 0) + 1; });
  return { items, snoozed: snoozed.sort(by), done: done.sort(by), total: items.length, byKind };
}
