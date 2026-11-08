/* ==========================================================================
   worker-accounts.js — حساب العمال: الحضور والسلف وكشف الشهر (v3.15.0) — دوال نقية
   ==========================================================================
   الفكرة: الحضور افتراضي؛ تسجّل الغياب (1) ونصف اليوم (0.5) فقط، فلا يُعاقَب أحد على نسيان تسجيل.
   • ثابت شهري:  المستحق = الراتب − (وحدات الغياب × الراتب ÷ أيام عمل الشهر كاملاً).
   • يومي:       المستحق = الراتب اليومي × (أيام العمل حتى اليوم − وحدات الغياب).
   • بالقطعة والساعي: لا يُحسب مستحق من الحضور (يُعرض المدفوع والسلف فقط).
   أيام العمل تستثني الإجازات الأسبوعية والمحدّدة بتاريخ (day-off.js).
   السلفة دفعة نقدية بنوع advance. وعند صرف الراتب يُسجَّل في الدفعة الحقل advanceDeducted (الجزء المخصوم من
   الراتب، معلومة لا نقد): تبقى كل المبالغ `amount` نقداً فلا يتغيّر أي حساب مالي قائم (مصروفات، تقارير، لوحات).
   الدفعات القديمة بلا نوع تُعدّ راتباً. لا DOM ولا قاعدة بيانات.
   ========================================================================== */

import { isDayOff } from '../core/day-off.js';

export const PAY_KINDS = [
  { id: 'salary', icon: '💵', label: 'راتب / دفعة' },
  { id: 'advance', icon: '🤝', label: 'سلفة' },
];
export const ATT_STATUSES = [
  { id: 'absent', icon: '✖', label: 'غائب', units: 1 },
  { id: 'half', icon: '½', label: 'نصف يوم', units: 0.5 },
];

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;
const list = (x) => (Array.isArray(x) ? x : []);

export const normalizePayKind = (v) => (v === 'advance' ? 'advance' : 'salary');
export const normalizeAttStatus = (v) => (v === 'absent' || v === 'half' ? v : null);   /* null = حاضر (لا سجل) */

const pad = (x) => String(x).padStart(2, '0');
/** مفتاح اليوم المحلي YYYY-MM-DD. */
export const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const validDayKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(new Date(k + 'T12:00:00').getTime());
/** معرّف ثابت لسجل الحضور (يُستبدل بدل التكرار). */
export const attendanceId = (workerId, day) => 'att_' + workerId + '_' + day;

/** تحقّق من إدخال حضور. @returns {{ok:boolean,error?:string,data?:Object}} */
export function checkAttendanceInput(input) {
  const workerId = typeof (input && input.workerId) === 'string' ? input.workerId : '';
  if (!workerId) return { ok: false, error: 'اختر العامل' };
  if (!validDayKey(input.day)) return { ok: false, error: 'تاريخ غير صالح' };
  const status = normalizeAttStatus(input.status);
  if (!status) return { ok: false, error: 'حالة غير صالحة' };
  return { ok: true, data: { workerId, day: input.day, status, id: attendanceId(workerId, input.day) } };
}

/** تحقّق من إدخال دفعة (نوعها وخصم السلفة). */
export function checkWorkerPaymentInput(input) {
  const kind = normalizePayKind(input && input.kind);
  const amount = r2(input && input.amount);
  if (!(amount > 0)) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
  if (amount > 100000000) return { ok: false, error: 'المبلغ كبير جداً' };
  const data = { kind, amount };
  if (kind === 'salary') {
    const ded = r2(input && input.advanceDeducted);
    if (ded < 0) return { ok: false, error: 'خصم السلفة لا يكون سالباً' };
    if (ded > 0) data.advanceDeducted = ded;
  }
  return { ok: true, data };
}

const startOfDay = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** عدد أيام العمل (غير الإجازة) بين يومين شاملين. */
export function workDaysBetween(fromMs, toMs, dayOff) {
  let c = 0;
  const end = startOfDay(toMs);
  for (let d = new Date(startOfDay(fromMs)); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    if (!isDayOff(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), dayOff)) c++;
  }
  return c;
}

/** السلفة القائمة = كل السلف − كل المخصوم من الرواتب (لا تقل عن صفر). */
export function outstandingAdvance(payments) {
  let adv = 0, ded = 0;
  for (const p of list(payments)) {
    if (!p) continue;
    if (normalizePayKind(p.kind) === 'advance') adv += n(p.amount); else ded += n(p.advanceDeducted);
  }
  return r2(Math.max(0, adv - ded));
}

/**
 * كشف شهر لعامل.
 * @param {{worker:Object, attendance:Array, payments:Array, year:number, month:number, now?:Date, dayOff?:*}} a  (month 0..11)
 */
export function workerStatement(a) {
  const now = a.now || new Date();
  const w = a.worker || {};
  const first = new Date(a.year, a.month, 1);
  const last = new Date(a.year, a.month + 1, 0);
  const nowDay = startOfDay(now.getTime());
  const fullWork = workDaysBetween(first.getTime(), last.getTime(), a.dayOff);
  const upTo = Math.min(last.getTime(), nowDay);
  const elapsed = upTo >= first.getTime() ? workDaysBetween(first.getTime(), upTo, a.dayOff) : 0;

  /* وحدات الغياب: أيام عمل ضمن الشهر (حتى اليوم) فقط */
  const prefix = a.year + '-' + pad(a.month + 1) + '-';
  let absentUnits = 0, absentDays = 0, halfDays = 0;
  for (const r of list(a.attendance)) {
    if (!r || r.workerId !== w.id || typeof r.day !== 'string' || !r.day.startsWith(prefix)) continue;
    const st = normalizeAttStatus(r.status);
    if (!st) continue;
    const ts = new Date(r.day + 'T12:00:00').getTime();
    if (isNaN(ts) || ts > nowDay + 86400000 - 1 || isDayOff(ts, a.dayOff)) continue;
    if (st === 'absent') { absentUnits += 1; absentDays++; } else { absentUnits += 0.5; halfDays++; }
  }

  const monthStart = first.getTime(), monthEnd = new Date(a.year, a.month + 1, 1).getTime();
  let salaryCash = 0, advancesGiven = 0, deducted = 0;
  const mine = list(a.payments).filter((p) => p && p.workerId === w.id);
  for (const p of mine) {
    if (!(n(p.date) >= monthStart && n(p.date) < monthEnd)) continue;
    if (normalizePayKind(p.kind) === 'advance') advancesGiven += n(p.amount);
    else { salaryCash += n(p.amount); deducted += n(p.advanceDeducted); }
  }

  const salary = n(w.salary);
  let earned = null;
  if (w.salaryType === 'fixed' && fullWork > 0) earned = Math.max(0, salary - (absentUnits * salary) / fullWork);
  else if (w.salaryType === 'daily') earned = salary * Math.max(0, elapsed - absentUnits);
  earned = earned === null ? null : r2(earned);

  const paidAgainstSalary = r2(salaryCash + deducted);
  const outstanding = outstandingAdvance(mine);
  const remaining = earned === null ? null : r2(earned - paidAgainstSalary);
  return {
    computable: earned !== null, earned, workDays: fullWork, elapsedWorkDays: elapsed,
    absentDays, halfDays, absentUnits, salaryCash: r2(salaryCash), deducted: r2(deducted),
    advancesGiven: r2(advancesGiven), outstandingAdvance: outstanding, remaining,
    suggestedDeduction: remaining !== null && remaining > 0 ? r2(Math.min(outstanding, remaining)) : 0,
  };
}

/** حالة يوم لعامل (null = حاضر). */
export function statusOnDay(attendance, workerId, day) {
  const r = list(attendance).find((x) => x && x.workerId === workerId && x.day === day);
  return r ? normalizeAttStatus(r.status) : null;
}

/** ملخص يوم: كم غائب وكم نصف يوم من العمال النشطين. */
export function daySummary(attendance, activeWorkers, day) {
  let absent = 0, half = 0;
  for (const w of list(activeWorkers)) {
    const s = statusOnDay(attendance, w.id, day);
    if (s === 'absent') absent++; else if (s === 'half') half++;
  }
  return { absent, half, present: Math.max(0, list(activeWorkers).length - absent - half) };
}
