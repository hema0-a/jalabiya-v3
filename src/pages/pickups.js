/* ==========================================================================
   pickups.js — جاهز للاستلام (طلبات جاهزة لم يستلمها العميل)  [v3.3.30]
   ==========================================================================
   - عمر الجاهزية من readyAt. «متأخر» = مرّت عليه أيام الحد (افتراضي 3).
   - زر واتساب برسالة مهذّبة جاهزة (يفتح واتساب ولا يرسل شيئاً بنفسه).
   - الحساب في services/pickup-reminders.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP } from '../core/utils.js';
import { sendLogged } from '../services/auto-messages.js';
import { loadLog, lastSentIn, sinceText } from '../services/message-log.js';
import { toast } from '../ui/toast.js';
import { computePickups, buildPickupText, DEFAULT_PICKUP_DAYS } from '../services/pickup-reminders.js';

let state = { container: null, data: null, workshop: {}, msgCfg: null, onlyLate: false };

async function loadData() {
  const [ord, pay, cus, st] = await Promise.all([orders.list(), payments.list(), customers.list(), settings.get()]);
  state.workshop = st.workshop || {};
  state.msgCfg = st.autoMessages || null;
  state.data = computePickups(ord, pay, cus, Date.now(), DEFAULT_PICKUP_DAYS);
}

function statCard(label, value, color) {
  return el('div', { className: 'card', style: { padding: '10px 6px', textAlign: 'center' } }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, label),
    el('div', { style: { fontSize: '16px', fontWeight: '700', color: color || 'inherit', marginTop: '2px' } }, value),
  ]);
}

function itemCard(i) {
  const canSend = !!i.phone;
  const lastAt = lastSentIn(loadLog(), { kinds: ['pickup_ready', 'ready'], ref: i.orderId });
  return el('div', { className: 'card', style: { padding: '12px', marginBottom: '8px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('strong', {}, i.name),
      el('span', { style: { fontSize: '12px', fontWeight: '700', color: i.late ? '#C62828' : '#2E7D32' } },
        i.ageDays === 0 ? 'جاهز اليوم' : 'جاهز منذ ' + i.ageDays + ' يوم'),
    ]),
    el('div', { style: { fontSize: '12px', color: '#666', margin: '4px 0 8px' } },
      '#' + String(i.orderId).slice(-6) + ' · الإجمالي ' + formatEGP(i.amount)
      + (i.remaining > 0 ? ' · المتبقي ' + formatEGP(i.remaining) : ' · مسدَّد بالكامل')
      + (lastAt ? ' · 📱 آخر تذكير: ' + sinceText(lastAt) : '')),
    el('button', {
      className: 'btn btn--primary', type: 'button', disabled: canSend ? null : 'disabled',
      style: { fontSize: '13px', padding: '6px 12px' },
      onClick: () => {
        if (!sendLogged(i.phone, buildPickupText(i, state.workshop, state.msgCfg),
          { kind: 'pickup_ready', ref: i.orderId, customerId: i.customerId })) toast.error('تعذّر فتح واتساب');
        else draw();   /* لتحديث «آخر تذكير» */
      },
    }, canSend ? '💬 تذكير واتساب' : 'لا يوجد رقم هاتف'),
  ]);
}

function draw() {
  const c = state.container;
  if (!c || !state.data) return;
  if (state.pl) { state.pl.destroy(); state.pl = null; }
  clear(c);
  const d = state.data;
  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '📦 جاهز للاستلام'));
  c.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' } }, [
    statCard('طلبات جاهزة', String(d.count), '#1F6D57'),
    statCard('متأخرة ' + DEFAULT_PICKUP_DAYS + '+ أيام', String(d.lateCount), d.lateCount ? '#C62828' : '#2E7D32'),
    statCard('متبقٍّ للتحصيل', formatEGP(d.remainingTotal), '#E65100'),
  ]));
  c.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } }, [
    el('button', { className: 'btn ' + (state.onlyLate ? 'btn--primary' : 'btn--secondary'), type: 'button',
      onClick: () => { state.onlyLate = true; draw(); } }, 'المتأخرة فقط'),
    el('button', { className: 'btn ' + (!state.onlyLate ? 'btn--primary' : 'btn--secondary'), type: 'button',
      onClick: () => { state.onlyLate = false; draw(); } }, 'الكل'),
  ]));
  const list = state.onlyLate ? d.items.filter((i) => i.late) : d.items;
  if (list.length === 0) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center', color: '#2E7D32' } },
      d.count === 0 ? '✅ لا توجد طلبات جاهزة بانتظار الاستلام' : '✅ لا توجد طلبات متأخرة عن الاستلام'));
    return;
  }
  state.pl = createProgressiveList({ items: list, pageSize: 25, render: (i) => itemCard(i), endText: 'تم عرض كل الطلبات' });
  c.appendChild(state.pl.node);
}

export const pickupsPage = {
  async render(container) {
    state = { container, data: null, workshop: {}, msgCfg: null, onlyLate: false, pl: null };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try { await loadData(); draw(); } catch (err) {
      console.error('[pickups] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() {
    if (state.pl) { try { state.pl.destroy(); } catch (e) { /* اختياري */ } }
    state = { container: null, data: null, workshop: {}, msgCfg: null, onlyLate: false, pl: null };
  },
};
