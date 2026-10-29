/* ==========================================================================
   season-compare.js — مقارنة المواسم بالعام الماضي  [v3.3.30]
   ==========================================================================
   اختر فترة (آخر 30/60/90 يوماً أو موسماً من صفحة المواسم) فتُقارن بنفس الفترة
   قبل عام: عدد الطلبات، الإيراد، متوسط الطلب، وأكثر الأيام ازدحاماً.
   موسم لم تبدأ نافذته بعد: يُعرض ما حدث العام الماضي للتخطيط فقط.
   الطلبات الملغاة مستثناة. الحساب في services/season-compare.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { DEFAULT_OCCASIONS } from '../core/config.js';
import { compareSeasons, windowMetrics, shiftYears, lastDaysRange, occasionRange } from '../services/season-compare.js';

const PRESETS = [
  { id: 'd30', label: 'آخر 30 يوماً', days: 30 },
  { id: 'd60', label: 'آخر 60 يوماً', days: 60 },
  { id: 'd90', label: 'آخر 90 يوماً', days: 90 },
];

let state = { container: null, orders: [], occasions: [], sel: 'd30' };

function change(pct) {
  if (pct === null || pct === undefined) return el('span', { style: { color: '#888', fontSize: '11px' } }, '—');
  const up = pct > 0;
  return el('span', { style: { color: pct === 0 ? '#888' : up ? '#2E7D32' : '#C62828', fontSize: '12px', fontWeight: '700' } },
    (up ? '▲ ' : pct < 0 ? '▼ ' : '') + Math.abs(pct) + '%');
}

function metricRow(label, cur, prev, chg, fmt = String) {
  return el('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr', gap: '4px', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '13px', alignItems: 'center' } }, [
    el('span', { style: { color: '#666' } }, label), el('strong', {}, fmt(cur)), el('span', { style: { color: '#666' } }, fmt(prev)), change(chg),
  ]);
}

function peakText(p) { return p ? p.count + ' طلب' : '—'; }

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '📊 مقارنة المواسم'));

  const occs = state.occasions;
  const select = el('select', { className: 'input', style: { marginBottom: '12px' } }, [
    el('optgroup', { label: 'فترات' }, PRESETS.map((p) => el('option', { value: p.id }, p.label))),
    occs.length ? el('optgroup', { label: 'المواسم (30 يوماً قبل المناسبة)' },
      occs.map((o) => el('option', { value: 'o:' + o.id }, (o.icon || '🎉') + ' ' + o.name))) : null,
  ].filter(Boolean));
  select.value = state.sel;
  select.addEventListener('change', () => { state.sel = select.value; draw(); });
  c.appendChild(select);

  const now = Date.now();
  let range, title, started = true;
  if (state.sel.startsWith('o:')) {
    const occ = occs.find((o) => 'o:' + o.id === state.sel) || occs[0];
    if (!occ) return;
    const r = occasionRange(occ, now, 30);
    range = { from: r.from, to: r.to }; started = r.started; title = occ.name;
  } else {
    const p = PRESETS.find((x) => x.id === state.sel) || PRESETS[0];
    range = lastDaysRange(p.days, now); title = p.label;
  }

  if (!started) {
    const prevR = shiftYears(range, -1);
    const m = windowMetrics(state.orders, prevR);
    c.appendChild(el('div', { className: 'card', style: { padding: '14px' } }, [
      el('div', { style: { fontWeight: '700', marginBottom: '6px' } }, 'موسم ' + title + ' لم تبدأ نافذته بعد'),
      el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
        'للتخطيط — العام الماضي في هذه الفترة (' + formatDate(prevR.from) + ' إلى ' + formatDate(prevR.to) + '):'),
      m.orders === 0
        ? el('div', { style: { color: '#888' } }, 'لا توجد طلبات مسجلة في هذه الفترة العام الماضي')
        : el('div', {}, [
          el('div', {}, '📋 ' + m.orders + ' طلب'), el('div', {}, '💰 ' + formatEGP(m.revenue)),
          el('div', {}, '🧮 متوسط الطلب ' + formatEGP(m.avg)), el('div', {}, '🔥 أكثر يوم ازدحاماً: ' + peakText(m.peak)),
        ]),
    ]));
    return;
  }

  const r = compareSeasons(state.orders, range);
  c.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
    formatDate(r.range.from) + ' — ' + formatDate(r.range.to) + '  مقابل  ' + formatDate(r.prevRange.from) + ' — ' + formatDate(r.prevRange.to)));
  if (!r.hasPrev) {
    c.appendChild(el('div', { className: 'card', style: { padding: '10px', marginBottom: '10px', color: '#E65100', fontSize: '12px' } },
      'لا توجد طلبات مسجلة في نفس الفترة من العام الماضي، فلا تتوفر نسب تغيّر.'));
  }
  c.appendChild(el('div', { className: 'card', style: { padding: '12px' } }, [
    el('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr', gap: '4px', fontSize: '11px', color: '#888', paddingBottom: '4px' } },
      [el('span', {}, ''), el('span', {}, 'هذه الفترة'), el('span', {}, 'العام الماضي'), el('span', {}, 'التغيّر')]),
    metricRow('عدد الطلبات', r.cur.orders, r.prev.orders, r.changes.orders),
    metricRow('الإيراد', r.cur.revenue, r.prev.revenue, r.changes.revenue, formatEGP),
    metricRow('متوسط الطلب', r.cur.avg, r.prev.avg, r.changes.avg, formatEGP),
    metricRow('المسلَّم', r.cur.delivered, r.prev.delivered, null),
    el('div', { style: { padding: '8px 0', fontSize: '13px' } }, '🔥 أكثر يوم ازدحاماً: ' + peakText(r.cur.peak) + ' (العام الماضي: ' + peakText(r.prev.peak) + ')'),
  ]));
}

export const seasonComparePage = {
  async render(container) {
    state = { container, orders: [], occasions: [], sel: 'd30' };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try {
      const [ord, st] = await Promise.all([orders.list(), settings.get()]);
      state.orders = ord;
      const occ = Array.isArray(st.occasions) && st.occasions.length ? st.occasions : DEFAULT_OCCASIONS;
      state.occasions = occ.filter((o) => o && o.enabled !== false && o.month && o.day);
      draw();
    } catch (err) {
      console.error('[season-compare] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() { state = { container: null, orders: [], occasions: [], sel: 'd30' }; },
};
