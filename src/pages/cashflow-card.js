/* ==========================================================================
   cashflow-card.js — 💧 توقّع السيولة 30 يوماً (v3.19.0) — قسم في «المركز المالي» (للمالك فقط)
   ==========================================================================
   الحساب في services/cashflow-forecast.js (نقي ومختبَر). هنا: التحميل والعرض وحفظ «السيولة الحالية» و«يوم صرف الرواتب».
   تقدير لا وعد: يعرض الافتراضات صراحةً وما لا يدخل الحساب.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { formatEGP } from '../core/utils.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { circles } from '../data/repos/circles.js';
import { workers } from '../data/repos/workers.js';
import { settings } from '../data/repos/settings.js';
import { buildCashflow } from '../services/cashflow-forecast.js';
import { computeReceivables } from '../services/receivables.js';

const safe = (p) => Promise.resolve(p).catch(() => []);
const signed = (v) => '\u200E' + (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v));
const shortDay = (ymd) => { const [, m, d] = ymd.split('-'); return Number(d) + '/' + Number(m); };
const tile = (label, value, color) => el('div', { className: 'card', style: { padding: '8px', textAlign: 'center' } }, [
  el('div', { style: { fontSize: '11px', opacity: '0.75' } }, label), el('div', { style: { fontWeight: '700', color: color || '#123C2F', fontSize: '14px' } }, value),
]);

export async function buildCashflowCard() {
  const card = el('div', { className: 'card cashflow-card', 'data-testid': 'cashflow-card', style: { padding: '14px', marginTop: '16px' } });
  let showAll = false;

  async function draw() {
    const [ords, custs, pays, cms, cmps, circs, wks, st] = await Promise.all([safe(orders.list()), safe(customers.list()), safe(payments.list()), safe(commitments.list()), safe(commitmentPayments.list()), safe(circles.list()), safe(workers.list()), settings.get().catch(() => ({}))]);
    const cfg = (st && st.cashflow) || {};
    const r = buildCashflow({ now: Date.now(), opening: cfg.opening, payrollDay: cfg.payrollDay, homeMonthly: st && st.familyBudget ? st.familyBudget.total : 0, orders: ords, payments: pays, customers: custs, commitments: cms, commitmentPayments: cmps, circles: circs, workers: wks });
    const rec = computeReceivables(ords, pays, custs, Date.now());
    clear(card);
    card.appendChild(el('div', { style: { fontWeight: '700', fontSize: '15px', marginBottom: '8px' } }, '💧 توقّع السيولة 30 يوماً'));

    const opening = el('input', { className: 'input', type: 'number', inputMode: 'decimal', value: cfg.opening == null ? '' : String(cfg.opening), placeholder: 'السيولة الحالية (اختياري)', 'data-role': 'cf-opening' });
    const payroll = el('input', { className: 'input', type: 'number', min: '0', max: '31', value: String(cfg.payrollDay || 0), 'data-role': 'cf-payroll', title: 'يوم صرف الرواتب (0 = آخر الشهر)' });
    const save = async () => {
      const v = opening.value.trim();
      try { await settings.update({ cashflow: { opening: v === '' ? null : Number(v), payrollDay: Math.min(31, Math.max(0, Math.round(Number(payroll.value) || 0))) } }); await draw(); } catch (e) { toast.danger('تعذّر الحفظ'); }
    };
    opening.addEventListener('change', save); payroll.addEventListener('change', save);
    card.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '10px' } }, [opening, payroll]));
    card.appendChild(el('div', { style: { fontSize: '11px', opacity: '0.7', margin: '-6px 0 8px' } }, 'الحقل الأول: السيولة الحالية · الثاني: يوم صرف الرواتب (0 = آخر الشهر)'));

    const s = r.summary;
    card.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' } }, [
      tile('سيدخل', formatEGP(s.inflow), '#2E7D32'), tile('سيخرج', formatEGP(s.outflow), '#C62828'),
      tile('الصافي', formatEGP(s.net), s.net >= 0 ? '#2E7D32' : '#C62828'),
      tile(r.hasOpening ? 'الرصيد بعد 30 يوماً' : 'أدنى نقطة', r.hasOpening ? formatEGP(s.end) : formatEGP(s.min ? s.min.value : 0), r.hasOpening && s.end < 0 ? '#C62828' : undefined),
    ]));
    if (s.firstNegative) card.appendChild(el('div', { className: 'cf-alert', style: { background: '#FFEBEE', color: '#C62828', borderRadius: '8px', padding: '8px', marginBottom: '8px', fontSize: '13px' } }, '🚨 ينفد الرصيد يوم ' + shortDay(s.firstNegative) + ' — حرّك تحصيلاً أو أجّل التزاماً'));
    r.tightWeeks.slice(0, 2).forEach((w) => card.appendChild(el('div', { className: 'cf-tight', style: { background: '#FFF3E0', borderRadius: '8px', padding: '8px', marginBottom: '6px', fontSize: '13px' } }, '⚠️ أسبوع ضيق ' + shortDay(w.from) + ' ← ' + shortDay(w.to) + ': خارج ' + formatEGP(w.outflow) + ' مقابل داخل ' + formatEGP(w.inflow))));

    if (r.tightWeeks.length > 2) card.appendChild(el('div', { className: 'cf-more', style: { fontSize: '12px', opacity: '0.75', marginBottom: '6px' } }, '… و' + (r.tightWeeks.length - 2) + ' أسابيع أخرى ضيقة'));
    const rows = (showAll ? r.days : r.days.slice(0, 14)).filter((d) => showAll || d.inflow || d.outflow || true);
    const table = el('div', { style: { fontSize: '12px', marginTop: '6px' } });
    rows.forEach((d) => {
      if (!d.inflow && !d.outflow) return;
      table.appendChild(el('div', { style: { display: 'flex', gap: '6px', padding: '3px 0', borderBottom: '1px solid #eee' } }, [
        el('span', { style: { width: '38px', fontWeight: '600' } }, shortDay(d.ymd)),
        el('span', { style: { flex: '1', opacity: '0.85' } }, d.items.filter((i) => i.label !== 'مصروف البيت (تقدير)').slice(0, 3).map((i) => (i.kind === 'in' ? '＋' : '－') + i.label).join(' · ')),
        el('span', { style: { color: d.net >= 0 ? '#2E7D32' : '#C62828', minWidth: '58px', textAlign: 'left' } }, signed(d.net)),
        r.hasOpening ? el('span', { style: { minWidth: '62px', textAlign: 'left', fontWeight: '600', color: d.balance < 0 ? '#C62828' : undefined } }, signed(d.balance)) : null,
      ]));
    });
    card.appendChild(table);
    card.appendChild(el('button', { type: 'button', className: 'btn btn--sm btn--ghost', style: { marginTop: '6px' }, onClick: () => { showAll = !showAll; draw(); } }, showAll ? '▲ أول 14 يوماً' : '▼ كل الأيام الـ30'));

    const out = [];
    if (rec.totals.overdue > 0) out.push('مستحقات العملاء المتأخرة ' + formatEGP(rec.totals.overdue));
    if (r.unscheduled.orders) out.push(r.unscheduled.orders + ' طلب بلا موعد تسليم (' + formatEGP(r.unscheduled.ordersAmount) + ')');
    card.appendChild(el('div', { style: { fontSize: '12px', opacity: '0.75', marginTop: '10px', lineHeight: '1.7' } }, [
      out.length ? el('div', {}, '🔎 خارج الحساب: ' + out.join(' · ')) : null,
      ...r.notes.map((n) => el('div', {}, '• ' + n)),
    ]));
  }
  try { await draw(); } catch (e) { console.warn('[cashflow] draw failed:', e); card.appendChild(el('div', { style: { color: '#C62828' } }, 'تعذّر حساب التوقّع')); }
  return card;
}
