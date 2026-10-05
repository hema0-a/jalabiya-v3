/* ==========================================================================
   kpis.js — صفحة مؤشرات الأداء (KPIs)
   ==========================================================================
   - تعتمد على services/kpis-calculator.js.
   - فلتر فترة + Delta + لوحة الأداء + Bar + Line (SVG).
   - تصدير: CSV + طباعة.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { getKpisData, invalidateCache } from '../services/kpis-calculator.js';
import { formatEGP, formatDate } from '../core/utils.js';

let state = {
  container: null,
  period: 'month',
  data: null,
};

/* ==========================================================================
   1. أدوات الرسم
   ========================================================================== */

function deltaBadge(percent) {
  if (!isFinite(percent) || percent === 0) {
    return el('span', { style: { fontSize: '11px', color: '#666' } }, '—');
  }
  const positive = percent > 0;
  return el('span', {
    style: {
      fontSize: '11px',
      fontWeight: '600',
      color: positive ? '#2E7D32' : '#C62828',
    },
  }, (positive ? '▲ +' : '▼ ') + percent.toFixed(1) + '%');
}

function kpiCard(icon, value, label, delta, color = '#123C2F') {
  const card = el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, icon),
    el('span', { className: 'stat__value', style: { color } }, value),
    el('span', { className: 'stat__label' }, label),
  ]);
  if (delta !== undefined && delta !== null) {
    card.appendChild(deltaBadge(delta));
  }
  return card;
}

/* ==========================================================================
   2. الفلتر
   ========================================================================== */

function renderFilter() {
  const wrap = el('div', {
    role: 'tablist',
    'aria-label': 'فترة التقرير',
    style: { display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' },
  });
  const items = [
    { id: 'month',   label: 'هذا الشهر' },
    { id: '3months', label: 'آخر 3 شهور' },
    { id: '6months', label: 'آخر 6 شهور' },
    { id: 'year',    label: 'هذه السنة' },
    { id: 'all',     label: 'الكل' },
  ];
  items.forEach((it) => {
    const active = state.period === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(active),
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      'data-period': it.id,
      onClick: () => { state.period = it.id; refreshAll(); },
    }, it.label));
  });
  return wrap;
}

/* ==========================================================================
   3. لوحة الأداء
   ========================================================================== */

function renderPerformance() {
  const p = state.data.performance;
  const color = p.score >= 80 ? '#2E7D32' : p.score >= 60 ? '#2E8B6F' : p.score >= 40 ? '#F57C00' : '#C62828';
  const stars = '⭐'.repeat(p.stars) + '☆'.repeat(5 - p.stars);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '16px', background: 'linear-gradient(135deg, #FFFFFF, #F9F5EC)' },
  });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🎯 أداء الورشة'),
    el('span', { style: { fontSize: '14px', color, fontWeight: '600' } }, stars),
  ]));

  card.appendChild(el('div', {
    style: { fontSize: '26px', fontWeight: '700', color, textAlign: 'center', marginBottom: '4px' },
  }, p.score + ' / 100'));

  card.appendChild(el('div', {
    style: { fontSize: '13px', color: '#666', textAlign: 'center', marginBottom: '10px' },
  }, p.level));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '12px' },
  }, [
    el('div', { style: { width: p.score + '%', height: '100%', background: color, transition: 'width 0.5s ease' } }),
  ]));

  /* الأفضل / الأضعف */
  card.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' },
  }, [
    el('div', {
      style: { padding: '8px', background: '#E8F5E9', borderRadius: '6px' },
    }, [
      el('div', { style: { color: '#2E7D32', fontWeight: '600' } }, '🏆 الأفضل'),
      el('div', { color: '#123C2F' }, p.best.label + ' — ' + Math.round(p.best.value) + '%'),
    ]),
    el('div', {
      style: { padding: '8px', background: '#FFF3E0', borderRadius: '6px' },
    }, [
      el('div', { style: { color: '#F57C00', fontWeight: '600' } }, '⚠️ الأضعف'),
      el('div', { color: '#123C2F' }, p.worst.label + ' — ' + Math.round(p.worst.value) + '%'),
    ]),
  ]));

  return card;
}

/* ==========================================================================
   4. الملخص + KPIs
   ========================================================================== */

function renderSummary() {
  const s = state.data.summary;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  grid.appendChild(kpiCard('💰', formatEGP(s.totalRevenue), 'الإيرادات', null, '#2E7D32'));
  grid.appendChild(kpiCard('💸', formatEGP(s.totalExpenses), 'المصروفات', null, '#C62828'));
  grid.appendChild(kpiCard('✨', formatEGP(s.netProfit), 'صافي الربح', null, s.netProfit >= 0 ? '#2E7D32' : '#C62828'));
  return grid;
}

function renderBasicKpis() {
  const k = state.data.kpis;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  grid.appendChild(kpiCard('💰', formatEGP(k.avgOrderValue), 'متوسط الطلب'));
  grid.appendChild(kpiCard('⏱️', k.avgCompletionDays > 0 ? k.avgCompletionDays.toFixed(1) + ' يوم' : '—', 'متوسط التنفيذ'));
  grid.appendChild(kpiCard('✅', Math.round(k.onTimeRate) + '%', 'التسليم في الموعد', null, k.onTimeRate >= 80 ? '#2E7D32' : '#F57C00'));
  grid.appendChild(kpiCard('📅', k.bestWeekday || '—', 'أفضل يوم'));
  return grid;
}

function renderAdvancedKpis() {
  const a = state.data.advanced;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  grid.appendChild(kpiCard('💳', Math.round(a.collectionRate) + '%', 'معدل التحصيل'));
  grid.appendChild(kpiCard('⏳', a.daysBetweenOrders > 0 ? a.daysBetweenOrders.toFixed(1) + ' يوم' : '—', 'بين الطلبات'));
  grid.appendChild(kpiCard('👑', a.topCustomerByOrders ? a.topCustomerByOrders.name : '—', 'الأكثر نشاطاً'));
  grid.appendChild(kpiCard('🧵', a.topTypeByRevenue ? a.topTypeByRevenue.name : '—', 'الأكثر ربحاً'));
  return grid;
}

function renderGeneral() {
  const g = state.data.general;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '16px' },
  });
  const items = [
    { icon: '👥', value: String(g.totalCustomers), label: 'عميل' },
    { icon: '📦', value: String(g.totalOrders), label: 'طلب' },
    { icon: '⚡', value: String(g.activeOrders), label: 'نشط' },
    { icon: '✅', value: String(g.deliveredOrders), label: 'مسلَّم' },
    { icon: '📊', value: Math.round(g.deliveryRate) + '%', label: 'التسليم' },
    { icon: '💵', value: formatEGP(g.totalRemaining), label: 'متبقي' },
  ];
  items.forEach((it) => {
    grid.appendChild(kpiCard(it.icon, it.value, it.label));
  });
  return grid;
}

/* ==========================================================================
   5. الرسوم (Bar + Line SVG)
   ========================================================================== */

function renderBarChart() {
  const months = state.data.last6Months;
  const maxRev = Math.max(1, ...months.map((m) => m.revenue));

  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📊 مبيعات آخر 6 شهور'),
  ]));

  const chart = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '4px', height: '160px', padding: '8px 0' },
  });

  months.forEach((m) => {
    const h = maxRev > 0 ? Math.max(2, (m.revenue / maxRev) * 130) : 2;
    const col = el('div', {
      style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
    });
    col.appendChild(el('div', {
      style: {
        width: '70%', height: h + 'px',
        background: 'linear-gradient(180deg, #4CAF50, #2E7D32)',
        borderRadius: '3px 3px 0 0',
      },
      title: formatEGP(m.revenue),
    }));
    col.appendChild(el('div', { style: { fontSize: '10px', color: '#666' } }, m.month));
    chart.appendChild(col);
  });

  card.appendChild(chart);
  return card;
}

function renderLineChart() {
  const months = state.data.last6Months;
  if (months.length < 2) return el('div');

  const W = 320;
  const H = 100;
  const PAD = 12;
  const maxRev = Math.max(1, ...months.map((m) => m.revenue));
  const stepX = (W - PAD * 2) / (months.length - 1);

  const points = months.map((m, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (m.revenue / maxRev) * (H - PAD * 2);
    return { x, y, m };
  });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('style', 'width:100%;height:100px;display:block');

  /* خط متعدد */
  const polyline = document.createElementNS(svgNS, 'polyline');
  polyline.setAttribute('points', points.map((p) => p.x + ',' + p.y).join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#1F6D57');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  /* نقاط */
  points.forEach((p) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', '#B8863B');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);
  });

  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📈 اتجاه المبيعات'),
  ]));
  card.appendChild(svg);
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '4px' },
  }, months.map((m) => el('span', {}, m.month))));
  return card;
}

/* ==========================================================================
   6. أفضل العملاء والأنواع
   ========================================================================== */

function renderTopCustomers() {
  const list = state.data.topCustomers;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '👑 أفضل 5 عملاء'),
  ]));
  if (list.length === 0) {
    card.appendChild(el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'لا يوجد عملاء بعد.'));
    return card;
  }
  const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];
  list.forEach((c, i) => {
    card.appendChild(el('div', {
      style: { padding: '8px 0', borderBottom: '1px solid #E5DDD0', display: 'flex', justifyContent: 'space-between', gap: '8px' },
    }, [
      el('div', { style: { flex: '1', fontSize: '13px' } }, medals[i] + ' ' + c.name),
      el('div', { style: { fontSize: '12px', color: '#666', textAlign: 'left' } }, c.count + ' طلب'),
      el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#2E7D32' } }, formatEGP(c.total)),
    ]));
  });
  return card;
}

function renderTopTypes() {
  const list = state.data.topTypes;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🧵 أكثر الأنواع مبيعاً'),
  ]));
  if (list.length === 0) {
    card.appendChild(el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'لا توجد أنواع بعد.'));
    return card;
  }
  const max = Math.max(1, ...list.map((t) => t.count));
  list.forEach((t) => {
    const percent = Math.round((t.count / max) * 100);
    card.appendChild(el('div', { style: { marginBottom: '8px' } }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' } }, [
        el('span', { style: { fontWeight: '500' } }, t.name),
        el('span', { style: { color: '#666' } }, t.count + ' قطعة'),
      ]),
      el('div', { style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden' } }, [
        el('div', { style: { width: percent + '%', height: '100%', background: 'linear-gradient(90deg, #2E8B6F, #1F6D57)' } }),
      ]),
    ]));
  });
  return card;
}

/* ==========================================================================
   7. أيام الأسبوع
   ========================================================================== */

function renderWeekdays() {
  const list = state.data.weekdays;
  const max = Math.max(1, ...list.map((d) => d.total));
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📅 أداء أيام الأسبوع'),
  ]));

  const chart = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '4px', height: '120px' },
  });
  list.forEach((d) => {
    const h = max > 0 ? Math.max(2, (d.total / max) * 100) : 2;
    const col = el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } });
    col.appendChild(el('div', {
      style: { width: '70%', height: h + 'px', background: 'linear-gradient(180deg, #D4A55C, #B8863B)', borderRadius: '3px 3px 0 0' },
      title: formatEGP(d.total),
    }));
    col.appendChild(el('div', { style: { fontSize: '9px', color: '#666' } }, d.name.slice(0, 4)));
    chart.appendChild(col);
  });
  card.appendChild(chart);
  return card;
}

/* ==========================================================================
   8. التصدير
   ========================================================================== */

function csvRow(arr) {
  return arr.map((x) => {
    const s = String(x ?? '');
    return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

function exportCSV() {
  try {
    const d = state.data;
    const rows = [['الفترة', 'المقياس', 'القيمة']];
    const p = state.period;
    rows.push([p, 'الإيرادات', d.summary.totalRevenue.toFixed(2)]);
    rows.push([p, 'المصروفات', d.summary.totalExpenses.toFixed(2)]);
    rows.push([p, 'صافي الربح', d.summary.netProfit.toFixed(2)]);
    rows.push([p, 'متوسط الطلب', d.kpis.avgOrderValue.toFixed(2)]);
    rows.push([p, 'متوسط التنفيذ (أيام)', d.kpis.avgCompletionDays.toFixed(2)]);
    rows.push([p, 'التسليم في الموعد %', d.kpis.onTimeRate.toFixed(2)]);
    rows.push([p, 'معدل التحصيل %', d.advanced.collectionRate.toFixed(2)]);
    rows.push([p, 'نسبة التسليم %', d.general.deliveryRate.toFixed(2)]);
    rows.push([p, 'إجمالي العملاء', d.general.totalCustomers]);
    rows.push([p, 'إجمالي الطلبات', d.general.totalOrders]);
    rows.push([p, 'متبقي على العملاء', d.general.totalRemaining.toFixed(2)]);
    rows.push([p, 'درجة الأداء', d.performance.score + '/100 (' + d.performance.level + ')']);

    const csv = '\uFEFF' + rows.map(csvRow).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kpis-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast.success('تم التصدير');
  } catch (e) {
    toast.danger('فشل: ' + e.message);
  }
}

function printReport() {
  if (!state.container) return;

  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #kpis-print, #kpis-print * { visibility: visible !important; }
      #kpis-print { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; background: #fff; }
      .no-print { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  const oldId = state.container.id;
  state.container.id = 'kpis-print';
  setTimeout(() => {
    window.print();
    if (oldId) state.container.id = oldId;
    else state.container.removeAttribute('id');
  }, 100);
}

function renderExportActions() {
  const wrap = el('div', {
    className: 'no-print',
    style: { display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' },
  });
  wrap.appendChild(el('button', {
    className: 'btn btn--primary btn--sm', type: 'button',
    onClick: () => exportCSV(),
  }, '📊 تصدير CSV'));
  wrap.appendChild(el('button', {
    className: 'btn btn--secondary btn--sm', type: 'button',
    onClick: () => printReport(),
  }, '📄 طباعة / PDF'));
  return wrap;
}

/* ==========================================================================
   9. Empty state
   ========================================================================== */

function renderEmpty() {
  const wrap = el('div', { className: 'empty-state' });
  wrap.appendChild(el('div', { className: 'empty-state__icon' }, '📊'));
  wrap.appendChild(el('h2', { className: 'empty-state__title' }, 'لا توجد بيانات كافية'));
  wrap.appendChild(el('p', { className: 'empty-state__text' }, 'أضف طلبات ودفعات لعرض المؤشرات.'));
  wrap.appendChild(el('button', {
    className: 'btn btn--primary',
    style: { marginTop: '12px' },
    onClick: () => { location.hash = '#/orders'; },
  }, '➕ إضافة طلب'));
  return wrap;
}

/* ==========================================================================
   10. الصفحة الرئيسية
   ========================================================================== */

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  c.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '📊 مؤشرات الأداء'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'نظرة تحليلية شاملة على أداء الورشة'),
  ]));

  c.appendChild(renderFilter());

  if (!state.data.hasData) {
    c.appendChild(renderEmpty());
    return;
  }

  if (state.data.lowData) {
    c.appendChild(el('div', {
      style: { background: '#FFF3E0', color: '#E65100', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px' },
    }, 'ℹ️ البيانات قليلة — النتائج تقريبية.'));
  }

  c.appendChild(renderExportActions());
  c.appendChild(renderPerformance());
  c.appendChild(renderSummary());
  c.appendChild(renderBasicKpis());
  c.appendChild(renderAdvancedKpis());
  c.appendChild(renderGeneral());
  c.appendChild(renderBarChart());
  c.appendChild(renderLineChart());
  c.appendChild(renderTopCustomers());
  c.appendChild(renderTopTypes());
  c.appendChild(renderWeekdays());
}

/* ==========================================================================
   11. تحميل البيانات
   ========================================================================== */

async function refreshAll() {
  try {
    state.data = await getKpisData(state.period);
    renderPage();
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   12. API
   ========================================================================== */

export const kpisPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.period = 'month';
    await refreshAll();
  },

  destroy() {
    state = { container: null, period: 'month', data: null };
  },
};
