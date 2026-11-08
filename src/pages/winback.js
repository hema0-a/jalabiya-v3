/* ==========================================================================
   winback.js — صفحة العملاء المنقطعون (v3.14.0)
   ==========================================================================
   عملاء لم يعودوا منذ 60/90/180 يوماً ولا طلب مفتوحاً لهم، الأكثر إنفاقاً أولاً.
   زر واتساب برسالة مهذّبة جاهزة (يفتح واتساب ولا يرسل بنفسه) ويُسجَّل في سجل الرسائل
   فيظهر «آخر تواصل» وتتجنب تكرار الإزعاج. الحساب في services/winback.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP } from '../core/utils.js';
import { sendLogged } from '../services/auto-messages.js';
import { loadLog, lastSentIn, sinceText } from '../services/message-log.js';
import { toast } from '../ui/toast.js';
import { winbackList, winbackSummary, buildWinbackText, RANGES, DEFAULT_DAYS } from '../services/winback.js';

let state = { container: null, days: DEFAULT_DAYS, items: [], workshop: {}, pl: null };

async function load() {
  const [cu, ord, st] = await Promise.all([customers.list(), orders.list(), settings.get()]);
  state.workshop = (st && st.workshop) || {};
  state.cu = cu; state.ord = ord;
}
const compute = () => { state.items = winbackList(state.cu, state.ord, Date.now(), state.days); };

function itemCard(i) {
  const lastAt = lastSentIn(loadLog(), { kinds: ['winback'], ref: i.customerId });
  const recent = lastAt && Date.now() - lastAt < 30 * 86400000;
  return el('div', { className: 'card', 'data-customer-id': i.customerId, style: { padding: '12px', marginBottom: '8px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('strong', {}, i.name),
      el('span', { style: { fontSize: '12px', fontWeight: '700', color: '#E65100' } }, 'منذ ' + i.daysSince + ' يوم'),
    ]),
    el('div', { style: { fontSize: '12px', color: '#666', margin: '4px 0 8px' } },
      i.orders + ' طلب · أنفق ' + formatEGP(i.totalSpent) + (lastAt ? ' · 📱 آخر تواصل: ' + sinceText(lastAt) : '')),
    el('button', {
      className: 'btn ' + (recent ? 'btn--ghost' : 'btn--primary'), type: 'button', 'data-action': 'winback-send', disabled: i.phone ? null : 'disabled',
      style: { fontSize: '13px', padding: '6px 12px' },
      onClick: () => {
        if (!sendLogged(i.phone, buildWinbackText(i, state.workshop.name), { kind: 'winback', ref: i.customerId, customerId: i.customerId })) toast.danger('تعذّر فتح واتساب');
        else draw();   /* لتحديث «آخر تواصل» */
      },
    }, i.phone ? (recent ? '💬 إعادة المراسلة' : '💬 رسالة «نفتقدك»') : 'لا يوجد رقم هاتف'),
  ]);
}

function draw() {
  const c = state.container;
  if (!c) return;
  if (state.pl) { state.pl.destroy(); state.pl = null; }
  clear(c);
  compute();
  const sm = winbackSummary(state.items);
  const chips = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } });
  RANGES.forEach((d) => chips.appendChild(el('button', {
    type: 'button', 'data-days': String(d), className: 'btn btn--sm ' + (state.days === d ? 'btn--primary' : 'btn--ghost'),
    onClick: () => { state.days = d; draw(); },
  }, d + '+ يوم')));
  c.appendChild(chips);
  c.appendChild(el('div', { className: 'card', 'data-role': 'winback-summary', style: { marginBottom: '12px', display: 'flex', gap: '8px' } }, [
    ['منقطعون', String(sm.count)], ['لديهم رقم', String(sm.withPhone)], ['متوسط إنفاقهم', formatEGP(sm.avgSpent)],
  ].map(([l, v]) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, l), el('b', { style: { fontSize: '15px' } }, v),
  ]))));
  if (!state.items.length) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center', color: '#2E7D32' } }, '✅ لا عملاء منقطعون عن ' + state.days + ' يوماً'));
    return;
  }
  state.pl = createProgressiveList({ items: state.items, pageSize: 25, render: (i) => itemCard(i), endText: 'تم عرض كل العملاء' });
  c.appendChild(state.pl.node);
}

export const winbackPage = {
  async render(container) {
    clear(container);
    state = { container, days: DEFAULT_DAYS, items: [], workshop: {}, pl: null };
    try { await load(); } catch (e) { container.appendChild(el('div', { className: 'card' }, 'تعذّر تحميل العملاء')); return; }
    draw();
  },
  destroy() { if (state.pl) state.pl.destroy(); state = { container: null, days: DEFAULT_DAYS, items: [], workshop: {}, pl: null }; },
};
