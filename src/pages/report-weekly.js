/* ==========================================================================
   report-weekly.js — 📈 بطاقة «تقرير الأسبوع» في صفحة التقارير (v3.19.0)
   ==========================================================================
   آخر 7 أيام: المحصّل · المصروف · الصافي · المسلَّم · الجديد · المتأخر · مستحقات العملاء · أفضل العملاء.
   مشاركة نص (واتساب) أو صورة. والإشعار يضيف سطر «أسبوعك» كل جمعة من الملخص نفسه (weeklyDigest).
   ========================================================================== */

import { el } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { settings } from '../data/repos/settings.js';
import { buildWeeklyReport, weeklyText } from '../services/weekly-report.js';
import { renderReportCanvas, shareReportImage } from '../ui/report-image.js';

const safe = (p) => Promise.resolve(p).catch(() => []);
const money = (v) => Math.round(Number(v) || 0).toLocaleString('en-US') + ' ج';

export async function buildWeeklyCard() {
  const card = el('div', { className: 'card weekly-card', 'data-testid': 'weekly-card', style: { padding: '14px', marginTop: '16px' } });
  try {
    const [ords, custs, pays, exps, wps, st] = await Promise.all([safe(orders.list()), safe(customers.list()), safe(payments.list()), safe(expenses.list()), safe(workerPayments.list()), settings.get().catch(() => ({}))]);
    const r = buildWeeklyReport({ orders: ords, payments: pays, expenses: exps, workerPayments: wps, customers: custs, now: Date.now() });
    const name = (st && st.workshop && st.workshop.name) || '';
    const text = weeklyText(r, name);
    const row = (l, v, c) => el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' } }, [el('span', {}, l), el('span', { style: { fontWeight: '600', color: c } }, v)]);
    card.appendChild(el('div', { style: { fontWeight: '700', fontSize: '15px', marginBottom: '6px' } }, '📈 تقرير الأسبوع'));
    card.appendChild(row('💰 المحصّل', money(r.income), '#2E7D32'));
    card.appendChild(row('💸 المصروف', money(r.expenses), '#C62828'));
    card.appendChild(row(r.net >= 0 ? '✅ الصافي' : '⚠️ الصافي', money(r.net), r.net >= 0 ? '#2E7D32' : '#C62828'));
    card.appendChild(row('📦 سُلِّم', r.delivered.count + ' طلب (' + money(r.delivered.amount) + ')'));
    card.appendChild(row('🆕 جديد', String(r.created)));
    if (r.overdue) card.appendChild(row('🚨 متأخر', r.overdue + ' طلب', '#C62828'));
    if (r.receivables.overdue > 0) card.appendChild(row('🧾 مستحقات متأخرة', money(r.receivables.overdue) + ' (' + r.receivables.customers + ' عميل)'));
    if (r.top.length) card.appendChild(el('div', { style: { fontSize: '12px', opacity: '0.8', marginTop: '4px' } }, '⭐ ' + r.top.map((t) => t.name + ' ' + money(t.amount)).join(' · ')));
    const acts = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } });
    acts.appendChild(el('button', { type: 'button', className: 'btn btn--sm', 'data-action': 'share-text', onClick: async () => {
      try { if (navigator.share) await navigator.share({ text }); else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer'); } catch (e) { if (!e || e.name !== 'AbortError') toast.danger('تعذّرت المشاركة'); }
    } }, '📤 مشاركة نص'));
    acts.appendChild(el('button', { type: 'button', className: 'btn btn--sm', 'data-action': 'share-image', onClick: async () => {
      try { const cv = renderReportCanvas(text.split('\n').filter((l) => l.trim()).slice(1), '📈 تقرير الأسبوع' + (name ? ' — ' + name : '')); const how = await shareReportImage(cv, 'weekly-report.png', ''); if (how === 'downloaded') toast.success('تم حفظ الصورة'); } catch (e) { toast.danger('تعذّر إنشاء الصورة'); }
    } }, '🖼️ صورة'));
    card.appendChild(acts);
    card.appendChild(el('div', { style: { fontSize: '11px', opacity: '0.65', marginTop: '8px' } }, 'يصلك سطر «أسبوعك» في إشعار الجمعة (يمكن إيقافه من إشعارات حقيقية).'));
  } catch (e) { console.warn('[weekly] failed:', e); card.appendChild(el('div', { style: { color: '#C62828' } }, 'تعذّر حساب التقرير')); }
  return card;
}
