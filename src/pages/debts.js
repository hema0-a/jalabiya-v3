/* ==========================================================================
   debts.js — مستحقات العملاء (الديون حسب العمر + تذكير واتساب)  [v3.3.26]
   ==========================================================================
   - «متأخر» = طلب سُلِّم وعليه متبقٍّ، يُقاس عمره من وقت التسليم (٠–٧ / ٨–٣٠ / ٣١–٦٠ / +٦٠ يوماً).
   - «عند التسليم» = رصيد طلبات لم تُسلَّم بعد (طبيعي، لا يُعدّ دَيناً).
   - الحساب في services/receivables.js ويعتمد قاعدة المقدم/الدفعات الموحّدة نفسها.
   - زر تذكير واتساب برسالة مهذّبة جاهزة (يفتح واتساب ولا يرسل شيئاً بنفسه).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP } from '../core/utils.js';
import { sendWhatsApp } from '../services/auto-messages.js';
import { toast } from '../ui/toast.js';
import { computeReceivables, buildReminderText } from '../services/receivables.js';

let state = { container: null, showAll: false, data: null, workshop: '' };

function statCard(label, value, color) {
  return el('div', { className: 'card', style: { padding: '10px', textAlign: 'center' } }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, label),
    el('div', { style: { fontSize: '16px', fontWeight: '700', color: color || 'inherit', marginTop: '4px' } }, value),
  ]);
}

function ageText(days) {
  if (days === null || days === undefined) return 'عند التسليم';
  if (days === 0) return 'سُلِّم اليوم';
  return 'منذ ' + days + ' يوم';
}

function orderRow(o) {
  return el('div', {
    style: {
      display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px',
      padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.06)',
    },
  }, [
    el('span', {}, '#' + String(o.id).slice(-6) + ' — ' + ageText(o.ageDays)),
    el('span', { style: { fontWeight: '600', color: o.delivered ? '#C62828' : '#555' } },
      formatEGP(o.remaining) + ' من ' + formatEGP(o.amount)),
  ]);
}

function customerCard(c) {
  const hasOverdue = c.overdue > 0.009;
  const details = el('div', { style: { display: 'none', marginTop: '8px' } }, c.orders.map(orderRow));
  const toggle = el('button', {
    className: 'btn btn--ghost', type: 'button', style: { fontSize: '12px', padding: '4px 8px' },
    onClick: () => {
      const open = details.style.display === 'none';
      details.style.display = open ? 'block' : 'none';
      toggle.textContent = open ? '▲ إخفاء الطلبات' : '▼ الطلبات (' + c.orders.length + ')';
    },
  }, '▼ الطلبات (' + c.orders.length + ')');

  const actions = [toggle];
  if (hasOverdue) {
    actions.unshift(el('button', {
      className: 'btn btn--primary', type: 'button', style: { fontSize: '12px', padding: '4px 10px' },
      onClick: () => {
        if (!c.phone) return toast.warning('لا يوجد رقم هاتف لهذا العميل');
        const ok = sendWhatsApp(c.phone, buildReminderText(c.name, formatEGP(c.overdue), state.workshop));
        if (!ok) toast.warning('رقم الهاتف غير صالح');
      },
    }, '💬 تذكير واتساب'));
  }
  if (c.phone) {
    actions.push(el('a', {
      className: 'btn btn--ghost', href: 'tel:' + String(c.phone).replace(/[^\d+]/g, ''),
      style: { fontSize: '12px', padding: '4px 10px', textDecoration: 'none' },
    }, '📞 اتصال'));
  }

  const meta = [];
  if (hasOverdue) meta.push('أقدم دين: ' + c.oldestDays + ' يوم');
  if (c.pending > 0.009) meta.push('عند التسليم: ' + formatEGP(c.pending));
  if (c.unlinkedCredit > 0.009) meta.push('دفعات غير مربوطة بطلب: ' + formatEGP(c.unlinkedCredit) + ' (لم تُخصم)');

  return el('div', { className: 'card', style: { padding: '12px', marginBottom: '10px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, [
      el('strong', {}, c.name),
      el('strong', { style: { color: hasOverdue ? '#C62828' : '#555' } },
        hasOverdue ? formatEGP(c.overdue) : formatEGP(c.pending)),
    ]),
    meta.length ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: '1.7' } }, meta.join(' · ')) : null,
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } }, actions),
    details,
  ].filter(Boolean));
}

function draw() {
  const c = state.container;
  if (!c || !state.data) return;
  clear(c);
  const { customers: list, totals, buckets } = state.data;

  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '🧾 مستحقات العملاء'));
  c.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' } }, [
    statCard('متأخر (سُلِّم ولم يُسدَّد)', formatEGP(totals.overdue), totals.overdue > 0 ? '#C62828' : '#2E7D32'),
    statCard('عند التسليم', formatEGP(totals.pending), '#555'),
    statCard('عملاء متأخرون', String(totals.customersOverdue), totals.customersOverdue ? '#E65100' : '#2E7D32'),
  ]));

  if (totals.overdue > 0.009) {
    c.appendChild(el('div', { style: { fontSize: '12px', fontWeight: '600', margin: '4px 0' } }, 'أعمار الديون المتأخرة'));
    c.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' } },
      buckets.map((b) => el('div', { className: 'card', style: { padding: '8px 4px', textAlign: 'center' } }, [
        el('div', { style: { fontSize: '10px', color: '#666' } }, b.label),
        el('div', { style: { fontSize: '12px', fontWeight: '700', marginTop: '2px' } }, formatEGP(b.amount)),
        el('div', { style: { fontSize: '10px', color: '#888' } }, b.count + ' طلب'),
      ]))));
  }

  c.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } }, [
    el('button', {
      className: 'btn ' + (!state.showAll ? 'btn--primary' : 'btn--secondary'), type: 'button',
      onClick: () => { state.showAll = false; draw(); },
    }, 'المتأخرة فقط'),
    el('button', {
      className: 'btn ' + (state.showAll ? 'btn--primary' : 'btn--secondary'), type: 'button',
      onClick: () => { state.showAll = true; draw(); },
    }, 'الكل (مع عند التسليم)'),
  ]));

  const shown = state.showAll ? list : list.filter((x) => x.overdue > 0.009);
  if (shown.length === 0) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center', color: '#2E7D32' } },
      state.showAll ? 'لا توجد مستحقات 🎉' : '✅ لا ديون متأخرة — كل الطلبات المسلَّمة مسدَّدة'));
    return;
  }
  shown.forEach((x) => c.appendChild(customerCard(x)));
}

export const debtsPage = {
  async render(container) {
    state = { container, showAll: false, data: null, workshop: '' };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ الحساب...'));
    try {
      const [ord, pay, cus, st] = await Promise.all([orders.list(), payments.list(), customers.list(), settings.get()]);
      state.workshop = (st.workshop && st.workshop.name) || '';
      state.data = computeReceivables(ord, pay, cus);
      draw();
    } catch (err) {
      console.error('[debts] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } },
        'تعذّر حساب المستحقات: ' + (err && err.message || err)));
    }
  },
  destroy() { state = { container: null, showAll: false, data: null, workshop: '' }; },
};
