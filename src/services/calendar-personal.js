/* ==========================================================================
   calendar-personal.js — الأحداث الشخصية للتقويم الموحّد (v3.18.0) — دوال نقية بلا قاعدة بيانات ولا DOM
   ==========================================================================
   كل ما يُنبّهك به الإشعار يظهر الآن على أيام التقويم: استحقاق الالتزامات · انتهاء المستندات · أقساط الجمعيات وقبضها · المهام.
   القواعد مطابقة لقواعد «ملخص الإشعار» (push-digest.js) حتى لا يرى المستخدم يوماً في التقويم وآخر في الإشعار:
     - التزام: نشط وله يوم استحقاق 1..31 (يوم 31 في شهر أقصر ⟵ آخر يوم)، و«وضع الشهر الصعب» يُبقي الضروري فقط.
     - جمعية: نشطة ولها «يوم دفع»؛ يظهر القسط في شهر كل صف من جدولها (مدفوع ✓ أو غير مدفوع)، والقبض في شهر دورك.
     - مستند: يوم الانتهاء. مهمة: المفتوحة ذات الموعد فقط.
   ========================================================================== */

import { schedule, potOf } from './circles.js';
import { documentStatus } from './documents.js';
import { taskBucket, normalizeKind } from './todos.js';
import { normalizePersonalControls, filterForHardMonth } from './daily-need.js';

export const PERSONAL_TYPES = ['commitment', 'document', 'circle', 'task'];

export const PERSONAL_META = Object.freeze({
  commitment: { icon: '💳', color: '#6D4C41', route: '#/commitments', label: 'الالتزامات' },
  document:   { icon: '🗂️', color: '#00838F', route: '#/documents',   label: 'المستندات' },
  circle:     { icon: '🪙', color: '#AD1457', route: '#/circles',     label: 'الجمعيات' },
  task:       { icon: '✅', color: '#558B2F', route: '#/todos',       label: 'المهام' },
});

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = (v) => (Array.isArray(v) ? v : []);
const noon = (y, m, d) => new Date(y, m, d, 12, 0, 0, 0).getTime();
const ymKey = (y, m) => y + '-' + String(m + 1).padStart(2, '0');

/** الأشهر (y,m) التي يمسّها النطاق [startMs, endMs). */
function monthsIn(startMs, endMs) {
  const out = [];
  if (!(endMs > startMs)) return out;
  const a = new Date(startMs); const b = new Date(endMs - 1);
  let y = a.getFullYear(); let m = a.getMonth();
  const ey = b.getFullYear(); const em = b.getMonth();
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 36) {
    out.push({ y, m, dim: new Date(y, m + 1, 0).getDate() });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

function mk(type, id, date, title, subtitle, extra = {}) {
  const meta = PERSONAL_META[type];
  return {
    id: type + '_' + id, type, date, title, subtitle,
    status: extra.status || '', amount: n(extra.amount), customerPhone: '',
    color: extra.color || meta.color, icon: extra.icon || meta.icon, route: meta.route,
    metadata: { ...(extra.metadata || {}), kind: extra.kind || type },
  };
}

/**
 * @param {{commitments?:Array, documents?:Array, circles?:Array, tasks?:Array, settings?:Object, now?:number}} src
 * @param {number} startMs — بداية النطاق (شامل)
 * @param {number} endMs   — نهايته (غير شامل)
 * @returns {Array} أحداث بنفس شكل أحداث الطلبات والمواعيد (+ route لفتح صفحتها)
 */
export function personalEvents(src, startMs, endMs) {
  const s = src || {};
  const now = Number.isFinite(Number(s.now)) ? Number(s.now) : Date.now();
  const events = [];
  const inRange = (t) => t >= startMs && t < endMs;
  const months = monthsIn(startMs, endMs);

  /* --- الالتزامات --- */
  const hard = normalizePersonalControls((s.settings || {}).personalControls).hardMonth;
  for (const c of filterForHardMonth(arr(s.commitments), hard)) {
    if (!c || c.active === false) continue;
    const day = Number(c.dueDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    for (const mo of months) {
      const t = noon(mo.y, mo.m, Math.min(day, mo.dim));
      if (!inRange(t)) continue;
      events.push(mk('commitment', String(c.id) + '_' + ymKey(mo.y, mo.m), t,
        String(c.name || 'التزام'), 'يستحق شهرياً', { amount: c.amount, metadata: { commitmentId: c.id } }));
    }
  }

  /* --- المستندات --- */
  for (const d of arr(s.documents)) {
    const exp = n(d && d.expiresAt);
    if (!d || !(exp > 0) || !inRange(exp)) continue;
    const st = documentStatus(d, new Date(now));
    events.push(mk('document', String(d.id), exp, String(d.title || 'مستند'),
      st.status === 'expired' ? 'منتهٍ' : 'ينتهي', {
        status: st.status, color: st.status === 'expired' ? '#C62828' : st.status === 'due' ? '#F57C00' : undefined,
        metadata: { documentId: d.id, daysLeft: st.daysLeft },
      }));
  }

  /* --- الجمعيات --- */
  for (const c of arr(s.circles)) {
    if (!c || c.active === false) continue;
    const payDay = Number(c.payDay);
    if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) continue;
    const rows = schedule(c);
    for (const mo of months) {
      const row = rows.find((r) => r.ym === ymKey(mo.y, mo.m));
      if (!row) continue;
      const t = noon(mo.y, mo.m, Math.min(payDay, mo.dim));
      if (!inRange(t)) continue;
      events.push(mk('circle', String(c.id) + '_pay_' + row.ym, t, String(c.name || 'جمعية'),
        row.paid ? 'قسط مدفوع ✓' : 'قسط مستحق', {
          amount: c.installment, status: row.paid ? 'paid' : 'unpaid', color: row.paid ? '#2E7D32' : undefined,
          metadata: { circleId: c.id, ym: row.ym }, kind: 'circle-pay',
        }));
      if (row.isMyTurn && c.collected !== true) {
        events.push(mk('circle', String(c.id) + '_collect_' + row.ym, t, String(c.name || 'جمعية'), 'دورك في القبض', {
          amount: potOf(c), status: 'collect', color: '#2E7D32', icon: '💰',
          metadata: { circleId: c.id, ym: row.ym }, kind: 'circle-collect',
        }));
      }
    }
  }

  /* --- المهام (المفتوحة ذات الموعد) --- */
  for (const t of arr(s.tasks)) {
    if (!t || normalizeKind(t.kind) !== 'task' || t.done === true) continue;
    const due = n(t.due);
    if (!(due > 0) || !inRange(due)) continue;
    const bucket = taskBucket(t, new Date(now));
    events.push(mk('task', String(t.id), due, String(t.title || 'مهمة'),
      bucket === 'overdue' ? 'متأخرة' : bucket === 'today' ? 'اليوم' : 'مهمة', {
        status: bucket, color: bucket === 'overdue' ? '#C62828' : undefined, metadata: { taskId: t.id },
      }));
  }

  return events;
}
