/* ==========================================================================
   debts.js — مستحقات العملاء (الديون حسب العمر + تذكير واتساب)  [v3.3.26]
   ==========================================================================
   - «متأخر» = طلب سُلِّم وعليه متبقٍّ، يُقاس عمره من وقت التسليم (٠–٧ / ٨–٣٠ / ٣١–٦٠ / +٦٠ يوماً).
   - «عند التسليم» = رصيد طلبات لم تُسلَّم بعد (طبيعي، لا يُعدّ دَيناً).
   - الحساب في services/receivables.js ويعتمد قاعدة المقدم/الدفعات الموحّدة نفسها.
   - زر تذكير واتساب برسالة مهذّبة جاهزة (يفتح واتساب ولا يرسل شيئاً بنفسه).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { modal } from '../ui/modal.js';
import { sendLogged } from '../services/auto-messages.js';
import { loadLog, lastSentIn, sinceText } from '../services/message-log.js';
import { toast } from '../ui/toast.js';
import { computeReceivables, buildReminderText, filterOverdueByAge } from '../services/receivables.js';
import { openMessageComposer } from '../ui/message-composer-dialog.js';

let state = { container: null, showAll: false, data: null, workshop: {}, msgCfg: null };

async function loadData() {
  const [ord, pay, cus, st] = await Promise.all([orders.list(), payments.list(), customers.list(), settings.get()]);
  state.workshop = st.workshop || {};
  state.msgCfg = st.autoMessages || null;
  state.data = computeReceivables(ord, pay, cus);
}

/* لوحة ربط الدفعات غير المربوطة بطلب — الربط يدوي بقرار المستخدم (لا تخمين تلقائي) */
function linkPanel(c) {
  const panel = el('div', { style: { display: 'none', marginTop: '8px', padding: '8px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' } });
  c.unlinkedPayments.forEach((p) => {
    const select = el('select', { style: { flex: '1', minWidth: '0', fontSize: '12px', padding: '4px' } },
      c.orders.map((o) => el('option', { value: String(o.id) },
        '#' + String(o.id).slice(-6) + ' — متبقٍّ ' + formatEGP(o.remaining))));
    const btn = el('button', {
      className: 'btn btn--primary', type: 'button', style: { fontSize: '12px', padding: '4px 10px' },
      onClick: async () => {
        const order = c.orders.find((o) => String(o.id) === select.value);
        if (!order) return;
        if (p.amount > order.remaining + 0.009) {
          const ok = await modal.confirm({
            title: 'الدفعة أكبر من المتبقي',
            message: 'الدفعة ' + formatEGP(p.amount) + ' أكبر من المتبقي على الطلب ' + formatEGP(order.remaining) + '. هل تريد الربط رغم ذلك؟',
            confirmText: 'اربط', cancelText: 'إلغاء',
          });
          if (!ok) return;
        }
        btn.disabled = true;
        try {
          await payments.update(p.id, { orderId: order.id });
          toast.success('تم ربط الدفعة بالطلب');
          await loadData();
          draw();
        } catch (err) {
          console.error('[debts] link payment:', err);
          btn.disabled = false;
          toast.error('تعذّر ربط الدفعة');
        }
      },
    }, 'ربط');
    panel.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0', fontSize: '12px' } }, [
      el('span', { style: { whiteSpace: 'nowrap', fontWeight: '600' } },
        formatEGP(p.amount) + (p.date ? ' · ' + formatDate(p.date) : '')),
      select, btn,
    ]));
  });
  return panel;
}

/**
 * تسجيل ردّ مبلغ طلب ملغى للعميل. ما دُفع من رصيد المحفظة يُعاد للمحفظة تلقائياً،
 * والباقي يُرَدّ نقداً بيد صاحب الورشة (نسجّل فقط أنه رُدّ). يُستبعد الطلب بعدها من القائمة.
 * @param {Object} r — صف من computeReceivables().refunds.list
 */
async function markRefunded(r) {
  const ok = await modal.confirm({
    title: 'تأكيد ردّ المبلغ',
    message: 'هل ردَدتَ ' + formatEGP(r.cashPart) + ' نقداً إلى "' + r.name + '"؟' +
      (r.creditPart > 0 ? '\n\n💳 وسيُعاد ' + formatEGP(r.creditPart) + ' إلى رصيد محفظته (دُفع من رصيده).' : ''),
    confirmText: 'تم الرد', cancelText: 'لاحقاً',
  });
  if (!ok) return;
  let credited = false;
  try {
    if (r.creditPart > 0 && r.customerId) {
      await customers.walletAdjust(r.customerId, {
        balance: r.creditPart, type: 'adjust', orderId: r.orderId,
        note: 'ردّ: إلغاء طلب #' + String(r.orderId).slice(-6),
      });
      credited = true;
    }
    const res = await orders.update(r.orderId, { refundedAt: Date.now(), refundedAmount: r.amount });
    if (!res) throw new Error('الطلب لم يعد موجوداً');
    toast.success('سُجّل ردّ المبلغ' + (credited ? ' وأُعيد جزء منه لرصيد العميل' : ''));
    await loadData();
    draw();
  } catch (err) {
    if (credited) {   // فشل تسجيل الردّ بعد إعادة الرصيد: نتراجع كي لا يتضاعف
      try { await customers.walletAdjust(r.customerId, { balance: -r.creditPart, type: 'adjust', note: 'تراجع: فشل تسجيل الردّ' }); } catch (e2) { /* ignore */ }
    }
    console.error('[debts] mark refunded:', err);
    toast.error('تعذّر تسجيل الردّ: ' + (err && err.message || err));
  }
}

/** بطاقة «مستحق ردّه للعملاء» — تظهر فقط إن وُجدت طلبات ملغاة مدفوعة لم يُرَدّ مبلغها. */
function refundsCard(refunds) {
  if (!refunds || refunds.list.length === 0) return null;
  return el('div', { className: 'card', 'data-role': 'refunds-due', style: { padding: '12px', marginBottom: '12px', borderInlineStart: '4px solid #C62828' } }, [
    el('div', { style: { fontWeight: '700', marginBottom: '2px' } }, '💸 مستحق ردّه للعملاء — ' + formatEGP(refunds.total)),
    el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
      'طلبات ملغاة دُفع عليها. لا تدخل في الإيرادات، ويجب ردّ مبالغها للعملاء.'),
    ...refunds.list.map((r) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.06)' } }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { style: { fontWeight: '600' } }, r.name),
        el('div', { style: { fontSize: '12px', color: '#666' } },
          '#' + String(r.orderId).slice(-6) + ' · ' + formatEGP(r.amount) +
          (r.creditPart > 0 ? ' (منها ' + formatEGP(r.creditPart) + ' من رصيده)' : '')),
      ]),
      el('button', { className: 'btn btn--secondary', type: 'button', 'data-action': 'refund-done', style: { fontSize: '12px', padding: '4px 10px' }, onClick: () => markRefunded(r) }, '✔ تم الرد'),
    ])),
  ]);
}

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
  let linker = null;
  if (c.unlinkedPayments && c.unlinkedPayments.length && c.orders.length) {
    linker = linkPanel(c);
    actions.push(el('button', {
      className: 'btn btn--secondary', type: 'button', style: { fontSize: '12px', padding: '4px 10px' },
      onClick: () => { linker.style.display = linker.style.display === 'none' ? 'block' : 'none'; },
    }, '🔗 ربط الدفعات (' + c.unlinkedPayments.length + ')'));
  }
  if (hasOverdue) {
    actions.unshift(el('button', {
      className: 'btn btn--primary', type: 'button', style: { fontSize: '12px', padding: '4px 10px' },
      onClick: () => {
        if (!c.phone) return toast.warning('لا يوجد رقم هاتف لهذا العميل');
        const ok = sendLogged(c.phone, buildReminderText(c.name, formatEGP(c.overdue), state.workshop, state.msgCfg),
          { kind: 'debt_reminder', customerId: c.customerId });
        if (!ok) toast.warning('رقم الهاتف غير صالح');
        else draw();   /* لتحديث «آخر تذكير» */
      },
    }, '💬 تذكير واتساب'));
    actions.splice(1, 0, el('button', {
      className: 'btn btn--secondary', type: 'button', 'data-action': 'debt-compose',
      style: { fontSize: '12px', padding: '4px 10px' },
      onClick: () => openMessageComposer({
        customer: { id: c.customerId, name: c.name, phone: c.phone },
        amount: Math.round(c.overdue * 100) / 100, text: 'تذكير بالمتبقي',
      }),
    }, '✍️ صياغة'));
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
  const lastRem = hasOverdue ? lastSentIn(loadLog(), { kinds: ['debt_reminder', 'payment_due'], customerId: c.customerId }) : null;
  if (lastRem) meta.push('📱 آخر تذكير: ' + sinceText(lastRem));

  return el('div', { className: 'card', style: { padding: '12px', marginBottom: '10px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, [
      el('strong', { 'data-customer-id': c.customerId || null }, c.name),
      el('strong', { style: { color: hasOverdue ? '#C62828' : '#555' } },
        hasOverdue ? formatEGP(c.overdue) : formatEGP(c.pending)),
    ]),
    meta.length ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: '1.7' } }, meta.join(' · ')) : null,
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } }, actions),
    linker,
    details,
  ].filter(Boolean));
}

function draw() {
  const c = state.container;
  if (!c || !state.data) return;
  if (state.pl) { state.pl.destroy(); state.pl = null; }
  clear(c);
  const { customers: list, totals, buckets } = state.data;

  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '🧾 مستحقات العملاء'));
  c.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' } }, [
    statCard('متأخر (سُلِّم ولم يُسدَّد)', formatEGP(totals.overdue), totals.overdue > 0 ? '#C62828' : '#2E7D32'),
    statCard('عند التسليم', formatEGP(totals.pending), '#555'),
    statCard('عملاء متأخرون', String(totals.customersOverdue), totals.customersOverdue ? '#E65100' : '#2E7D32'),
  ]));

  const rc = refundsCard(state.data.refunds);
  if (rc) c.appendChild(rc);

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

  /* تصفية بالعمر: الأقدم أولاً لتحديد من يستحق اتصالاً لا مجرد رسالة */
  if (!state.showAll && totals.overdue > 0.009) {
    c.appendChild(el('div', { 'data-role': 'age-filter', style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' } }, [
      el('span', { style: { fontSize: '12px', color: '#666' } }, 'متأخر منذ:'),
      ...[[0, 'الكل'], [7, '+٧ أيام'], [30, '+٣٠ يوماً'], [60, '+٦٠ يوماً']].map(([d, lbl]) => el('button', {
        className: 'btn ' + (state.minAge === d ? 'btn--primary' : 'btn--secondary'), type: 'button',
        'data-age': String(d), style: { fontSize: '12px', padding: '4px 10px' },
        onClick: () => { state.minAge = d; draw(); },
      }, lbl)),
    ]));
  }

  const shown = state.showAll ? list : filterOverdueByAge(list, state.minAge);
  if (shown.length === 0) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center', color: '#2E7D32' } },
      state.showAll ? 'لا توجد مستحقات 🎉' : (state.minAge > 0 ? 'لا ديون متأخرة بهذا العمر — جرّب «الكل»' : '✅ لا ديون متأخرة — كل الطلبات المسلَّمة مسدَّدة')));
    return;
  }
  /* عرض تدريجي: بآلاف العملاء كان يُرسم كل شيء دفعة واحدة (~27 ألف عنصر وتجمّد ثوانٍ على الجوال) */
  state.pl = createProgressiveList({ items: shown, pageSize: 20, render: (x) => customerCard(x), endText: 'تم عرض كل العملاء' });
  c.appendChild(state.pl.node);
}

export const debtsPage = {
  async render(container) {
    state = { container, showAll: false, minAge: 0, data: null, workshop: {}, msgCfg: null, pl: null };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ الحساب...'));
    try {
      await loadData();
      draw();
    } catch (err) {
      console.error('[debts] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } },
        'تعذّر حساب المستحقات: ' + (err && err.message || err)));
    }
  },
  destroy() {
    if (state.pl) { try { state.pl.destroy(); } catch (e) { /* اختياري */ } }
    state = { container: null, showAll: false, data: null, workshop: {}, msgCfg: null, pl: null };
  },
};
