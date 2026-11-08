/* ==========================================================================
   insight-cards.js — بطاقات التحليل للإصدار 3.13.0 (عرض فقط، بيانات جاهزة من services/insights.js)
   ==========================================================================
   مقارنة فئات مصروف البيت · توزيع المصروفات · أداء الاستلام · مقياس كلمة المرور ·
   أفضل المُرشِّحين · خريطة الالتزامات السنوية. لا تقرأ ولا تكتب أي بيانات بنفسها.
   ========================================================================== */

import { el } from '../core/dom.js';
import { formatEGP } from '../core/utils.js';
import { passwordStrength, MONTH_NAMES_AR } from '../services/insights.js';

const head = (t, extra) => el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, t)].concat(extra ? [extra] : []));
const muted = (t, s) => el('div', { style: Object.assign({ fontSize: '12.5px', color: '#666', lineHeight: '1.8' }, s || {}) }, t);
const bar = (pct, color) => el('div', { style: { height: '8px', borderRadius: '99px', background: '#E5DDD0', overflow: 'hidden' } }, [
  el('div', { style: { width: Math.max(0, Math.min(100, pct)) + '%', height: '100%', background: color, borderRadius: '99px' } }),
]);

/** مقارنة الفئات: هذا الشهر مقابل الماضي (أعلى 6 تغيّراً). */
export function buildCompareCard(cmp) {
  if (!cmp || !cmp.rows.length) return null;
  const t = cmp.totals;
  const card = el('div', { className: 'card', 'data-role': 'house-compare', style: { marginBottom: '12px' } }, [
    head('🔀 مقارنة الفئات بالشهر الماضي'),
    muted('الإجمالي: ' + formatEGP(t.thisMonth) + ' مقابل ' + formatEGP(t.lastMonth) + (t.delta ? (t.delta > 0 ? ' (▲ ' : ' (▼ ') + formatEGP(Math.abs(t.delta)) + ')' : '')),
  ]);
  cmp.rows.slice(0, 6).forEach((r) => {
    const up = r.delta > 0;
    card.appendChild(el('div', { 'data-cat': r.id, style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 0', borderTop: '1px dashed #E5DDD0', fontSize: '13px' } }, [
      el('span', {}, r.icon + ' ' + r.label),
      el('span', { style: { color: r.delta === 0 ? '#666' : (up ? '#C62828' : '#2E7D32'), fontWeight: '700', whiteSpace: 'nowrap' } },
        formatEGP(r.thisMonth) + (r.delta === 0 ? '' : (up ? '  ▲ +' : '  ▼ −') + formatEGP(Math.abs(r.delta)) + (r.pct !== null ? ' (' + Math.abs(r.pct) + '%)' : ' (جديد)'))),
    ]));
  });
  return card;
}

/** توزيع المصروفات على الفئات (أشرطة). */
export function buildBreakdownCard(bd, title) {
  if (!bd || !bd.rows.length) return null;
  const card = el('div', { className: 'card', 'data-role': 'expense-breakdown', style: { marginBottom: '12px' } }, [head(title || '📊 توزيع المصروفات')]);
  bd.rows.forEach((r, i) => card.appendChild(el('div', { 'data-cat': r.id, style: { marginTop: '6px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '2px' } }, [el('span', {}, r.label), el('b', {}, formatEGP(r.total) + ' · ' + r.pct + '%')]),
    bar(r.pct, i === 0 ? '#C62828' : '#1F6D57'),
  ])));
  return card;
}

/** أداء الاستلام. */
export function buildPickupStatsCard(s) {
  if (!s) return null;
  const cell = (label, value, color) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, label), el('b', { style: { fontSize: '15px', color: color || '#123C2F' } }, value),
  ]);
  return el('div', { className: 'card', 'data-role': 'pickup-stats', style: { marginBottom: '12px' } }, [
    head('⏱️ أداء الاستلام (آخر 90 يوماً)'),
    el('div', { style: { display: 'flex', gap: '8px' } }, [
      cell('متوسط الانتظار', s.avgWaitDays + ' يوم', s.avgWaitDays > 4 ? '#C62828' : '#2E7D32'),
      cell('استلام خلال 3 أيام', s.within3Pct + '%', s.within3Pct < 60 ? '#E65100' : '#2E7D32'),
      cell('أطول انتظار', s.longestDays + ' يوم'),
    ]),
    muted('على ' + s.sample + ' طلب مُسلَّم' + (s.over7Count ? ' — ' + s.over7Count + ' منها انتظرت أكثر من أسبوع' : ''), { marginTop: '6px' }),
  ]);
}

/** مقياس قوة كلمة المرور: يُلحَق تحت حقل الإدخال ويتحدّث أثناء الكتابة. */
export function attachPasswordMeter(input) {
  const fill = el('div', { style: { height: '100%', width: '0%', borderRadius: '99px', transition: 'width .2s' } });
  const label = el('div', { 'data-role': 'pw-label', style: { fontSize: '12px', marginTop: '3px', minHeight: '16px' } });
  const wrap = el('div', { 'data-role': 'pw-meter', style: { marginTop: '4px' } }, [
    el('div', { style: { height: '6px', borderRadius: '99px', background: '#E5DDD0', overflow: 'hidden' } }, [fill]), label,
  ]);
  const update = () => {
    const r = passwordStrength(input.value);
    fill.style.width = (r.score * 25) + '%';
    fill.style.background = r.color;
    label.style.color = r.color;
    label.textContent = input.value ? 'قوة كلمة المرور: ' + r.label + (r.tips.length ? ' — ' + r.tips[0] : '') : '';
  };
  input.addEventListener('input', update);
  update();
  return wrap;
}

/** أفضل المُرشِّحين + تنبيه من يستحق مكافأة. */
export function buildReferrersCard(ins) {
  if (!ins || !ins.rows.length) return null;
  const card = el('div', { className: 'card', 'data-role': 'top-referrers', style: { marginBottom: '12px' } }, [head('🏆 أفضل المُرشِّحين')]);
  if (ins.needReward.length) {
    card.appendChild(el('div', { 'data-role': 'reward-alert', style: { padding: '8px', background: '#FFF8E1', borderRadius: '8px', fontSize: '13px', lineHeight: '1.8', marginBottom: '6px' } },
      '🎁 ' + ins.needReward.map((g) => g.name + ' (' + g.count + ')').join('، ') + ' رشّحوا 3 عملاء أو أكثر ولم يُصرف لهم شيء بعد.'));
  }
  ins.rows.slice(0, 5).forEach((g, i) => card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderTop: '1px dashed #E5DDD0' } }, [
    el('span', {}, (['🥇', '🥈', '🥉'][i] || '▫️') + ' ' + g.name),
    el('span', { style: { color: '#555' } }, g.count + ' إحالة' + (g.pending ? ' · ' + g.pending + ' معلّقة' : ' · مكتملة')),
  ])));
  return card;
}

/** خريطة الالتزامات للأشهر الـ12 القادمة. */
export function buildAnnualMapCard(map) {
  if (!map || map.total <= 0) return null;
  const max = Math.max(...map.months.map((m) => m.total), 1);
  const card = el('div', { className: 'card', 'data-role': 'annual-map', style: { marginBottom: '12px' } }, [
    head('🗓️ خريطة الالتزامات — 12 شهراً قادمة'),
    muted('المتوسط الشهري ' + formatEGP(map.average) + (map.peak ? ' — أثقل شهر: ' + MONTH_NAMES_AR[map.peak.month] + ' (' + formatEGP(map.peak.total) + ')' : '')),
  ]);
  const chart = el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '3px', height: '90px', marginTop: '8px' } });
  map.months.forEach((m) => {
    const heavy = map.peak && m.total === map.peak.total && m.total > map.average * 1.3;
    chart.appendChild(el('div', { 'data-month': String(m.month), title: MONTH_NAMES_AR[m.month] + ': ' + formatEGP(m.total) + (m.items.length ? ' — ' + m.items.join('، ') : ''), style: { flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' } }, [
      el('div', { style: { width: '100%', height: Math.round((m.total / max) * 100) + '%', minHeight: m.total > 0 ? '3px' : '0', background: heavy ? '#C62828' : '#1F6D57', borderRadius: '3px 3px 0 0' } }),
    ]));
  });
  card.appendChild(chart);
  card.appendChild(el('div', { style: { display: 'flex', gap: '3px', fontSize: '9.5px', color: '#777', marginTop: '2px' } },
    map.months.map((m) => el('div', { style: { flex: '1', textAlign: 'center' } }, MONTH_NAMES_AR[m.month].slice(0, 3)))));
  if (map.peak && map.peak.total > map.average * 1.3) {
    const it = map.months.find((m) => m.total === map.peak.total).items;
    card.appendChild(muted('⚠️ شهر ' + MONTH_NAMES_AR[map.peak.month] + ' أثقل من المعتاد' + (it.length ? ' (' + it.slice(0, 3).join('، ') + ')' : '') + ' — جهّز له من الآن.', { marginTop: '6px' }));
  }
  return card;
}
