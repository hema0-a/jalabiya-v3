/* ==========================================================================
   report-month-close.js — 🔒 بطاقة «إقفال الشهر» في صفحة التقارير (v3.19.0)
   ==========================================================================
   قائمة فحوص تُحسب من بياناتك (services/month-close.js): مستحقات متأخرة · طلبات متأخرة · جاهز عالق · التزامات وجمعيات · موردون · نسخة احتياطية.
   «اعتبر الشهر مُقفلاً» علامة تحفظها في settings.monthClose (لا تقفل البيانات ولا تمنع التعديل).
   ========================================================================== */

import { el } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { circles } from '../data/repos/circles.js';
import { settings } from '../data/repos/settings.js';
import { getLastExternalBackupAt } from '../services/auto-backup.js';
import { buildMonthClose, closeWindow } from '../services/month-close.js';

const safe = (p) => Promise.resolve(p).catch(() => []);
const ICON = { ok: '✅', warn: '⚠️', info: 'ℹ️' };
const money = (v) => Math.round(Number(v) || 0).toLocaleString('en-US') + ' ج';

export async function buildMonthCloseCard() {
  const card = el('div', { className: 'card month-close-card', 'data-testid': 'month-close-card', style: { padding: '14px', marginTop: '16px' } });
  async function draw() {
    const [ords, custs, pays, exps, wps, cms, cmps, circs, st] = await Promise.all([safe(orders.list()), safe(customers.list()), safe(payments.list()), safe(expenses.list()), safe(workerPayments.list()), safe(commitments.list()), safe(commitmentPayments.list()), safe(circles.list()), settings.get().catch(() => ({}))]);
    const win = closeWindow(Date.now());
    const closed = (st && st.monthClose && st.monthClose.closed) || {};
    const m = buildMonthClose({ ym: win.ym, now: Date.now(), orders: ords, payments: pays, expenses: exps, workerPayments: wps, customers: custs, commitments: cms, commitmentPayments: cmps, circles: circs, lastBackupAt: getLastExternalBackupAt(), closedAt: closed[win.ym] });
    card.textContent = '';
    card.appendChild(el('div', { style: { fontWeight: '700', fontSize: '15px' } }, '🔒 إقفال ' + m.label + (win.open ? '' : ' (الشهر الجاري)')));
    card.appendChild(el('div', { style: { fontSize: '12px', opacity: '0.8', margin: '4px 0 8px' } }, 'دخل ' + money(m.summary.income) + ' · مصروف ' + money(m.summary.expenses) + ' · صافي ' + money(m.summary.net) + ' · سُلِّم ' + m.summary.delivered));
    m.items.forEach((it) => card.appendChild(el('div', { className: 'mc-item', 'data-state': it.state, role: 'button', tabindex: '0', style: { display: 'flex', gap: '8px', padding: '5px 0', fontSize: '13px', cursor: 'pointer' }, onClick: () => { location.hash = it.route; } }, [
      el('span', {}, ICON[it.state] || '•'), el('span', { style: { flex: '1' } }, it.label), el('span', { style: { opacity: '0.75', textAlign: 'left' } }, it.detail),
    ])));
    card.appendChild(el('div', { style: { fontSize: '12px', margin: '8px 0' } }, m.closed ? '🔒 أُقفل في ' + new Date(m.closedAt).toLocaleDateString('ar-EG') : (m.warns ? m.warns + ' بند يحتاج عملاً قبل الإقفال' : 'كل البنود سليمة')));
    card.appendChild(el('button', { type: 'button', className: 'btn btn--sm ' + (m.closed ? '' : 'btn--primary'), 'data-action': 'toggle-close', onClick: async () => {
      try {
        const next = { ...closed };
        if (m.closed) delete next[win.ym]; else next[win.ym] = Date.now();
        await settings.update({ monthClose: { closed: next } });
        await draw();
      } catch (e) { toast.danger('تعذّر الحفظ'); }
    } }, m.closed ? '↩ إلغاء الإقفال' : '🔒 اعتبر الشهر مُقفلاً'));
  }
  try { await draw(); } catch (e) { console.warn('[month-close] failed:', e); card.appendChild(el('div', { style: { color: '#C62828' } }, 'تعذّر حساب الإقفال')); }
  return card;
}
