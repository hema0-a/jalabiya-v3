/* ==========================================================================
   financial-center.js — صفحة المركز المالي
   ==========================================================================
   - تعتمد على services/financial-calculator.js (الحسابات + Cache).
   - تصدير: CSV + WhatsApp + طباعة.
   - Empty state + Mobile-first + ARIA.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { getFinancialData } from '../services/financial-calculator.js';
import {
  exportSummaryCSV, exportPaymentsCSV, exportExpensesCSV,
  shareViaWhatsApp, printFinancialReport,
} from '../services/financial-export.js';
import { payments as paymentsRepo } from '../data/repos/payments.js';
import { expenses as expensesRepo } from '../data/repos/expenses.js';
import { customers as customersRepo } from '../data/repos/customers.js';
import { formatEGP } from '../core/utils.js';

/* --- الحالة --- */
let state = {
  container: null,
  period: 'month',
  data: null,
  payments: [],
  expenses: [],
  customerMap: {},
};

/* ==========================================================================
   1. أدوات الرسم
   ========================================================================== */

function statusColor(value, good, warn) {
  if (value >= good) return '#2E7D32';
  if (value >= warn) return '#F57C00';
  return '#C62828';
}

function kpiCard(icon, value, label, color = '#123C2F') {
  return el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, icon),
    el('span', { className: 'stat__value', style: { color } }, value),
    el('span', { className: 'stat__label' }, label),
  ]);
}

/* ==========================================================================
   2. الفلتر
   ========================================================================== */

function renderFilter() {
  const wrap = el('div', {
    role: 'tablist',
    'aria-label': 'فلتر الفترة',
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
    const isActive = state.period === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(isActive),
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-period': it.id,
      onClick: () => {
        state.period = it.id;
        refreshAll();
      },
    }, it.label));
  });
  return wrap;
}

/* ==========================================================================
   3. الصحة المالية
   ========================================================================== */

function renderHealth() {
  const h = state.data.health;
  const stars = '⭐'.repeat(h.stars) + '☆'.repeat(5 - h.stars);
  const barColor = h.score >= 80 ? '#2E7D32' : h.score >= 60 ? '#2E8B6F' : h.score >= 40 ? '#F57C00' : '#C62828';

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '16px', background: 'linear-gradient(135deg, #FFFFFF, #F9F5EC)' },
  });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🎯 الصحة المالية'),
    el('span', { style: { fontSize: '14px', color: barColor, fontWeight: '600' } }, stars),
  ]));

  card.appendChild(el('div', {
    style: { fontSize: '22px', fontWeight: '700', color: barColor, marginBottom: '4px', textAlign: 'center' },
  }, h.score + ' / 100'));
  card.appendChild(el('div', {
    style: { fontSize: '13px', color: '#666', marginBottom: '10px', textAlign: 'center' },
  }, h.level));

  /* شريط التقدم */
  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '10px', borderRadius: '5px', overflow: 'hidden' },
  }, [
    el('div', {
      style: {
        width: h.score + '%',
        height: '100%',
        background: barColor,
        transition: 'width 0.5s ease',
      },
    }),
  ]));

  return card;
}

/* ==========================================================================
   4. الملخص الرئيسي
   ========================================================================== */

function renderSummary() {
  const s = state.data.summary;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  grid.appendChild(kpiCard('💰', formatEGP(s.totalRevenue), 'الإيرادات', '#2E7D32'));
  grid.appendChild(kpiCard('💸', formatEGP(s.totalExpenses), 'المصروفات', '#C62828'));
  grid.appendChild(kpiCard('✨', formatEGP(s.netProfit), 'صافي الربح', s.netProfit >= 0 ? '#2E7D32' : '#C62828'));
  grid.appendChild(kpiCard('📈', Math.round(s.profitMargin) + '%', 'هامش الربح', statusColor(s.profitMargin, 30, 15)));
  return grid;
}

function renderPending() {
  const p = state.data.pending;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  grid.appendChild(kpiCard('💳', formatEGP(p.pendingPayments), 'متبقي على العملاء', '#F57C00'));
  grid.appendChild(kpiCard('📊', Math.round(p.collectionRate) + '%', 'معدل التحصيل', statusColor(p.collectionRate, 75, 40)));
  return grid;
}

/* ==========================================================================
   5. المقارنة الشهرية
   ========================================================================== */

function renderComparison() {
  const c = state.data.comparison;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📊 مقارنة الشهر الحالي vs الماضي'),
  ]));

  const change = (v) => {
    if (v === 0) return el('span', { style: { color: '#666', fontSize: '12px' } }, 'بدون تغيير');
    const sign = v > 0 ? '▲ +' : '▼ ';
    const color = v > 0 ? '#2E7D32' : '#C62828';
    return el('span', { style: { color, fontSize: '12px', fontWeight: '600' } }, sign + v.toFixed(1) + '%');
  };

  const rows = [
    { label: 'الإيرادات',   curr: c.current.revenue,   prev: c.previous.revenue,   change: c.changes.revenueChange },
    { label: 'المصروفات',   curr: c.current.expenses,  prev: c.previous.expenses,  change: c.changes.expensesChange },
    { label: 'الربح',       curr: c.current.profit,    prev: c.previous.profit,    change: c.changes.profitChange },
    { label: 'الطلبات',     curr: c.current.ordersCount, prev: c.previous.ordersCount, change: 0, isCount: true },
  ];

  rows.forEach((r) => {
    const row = el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      },
    });
    row.appendChild(el('div', { style: { flex: '1', fontSize: '13px', fontWeight: '500' } }, r.label));
    row.appendChild(el('div', { style: { fontSize: '12px', color: '#666' } },
      (r.isCount ? String(r.curr) : formatEGP(r.curr))));
    if (r.change !== 0 || !r.isCount) {
      row.appendChild(change(r.change));
    }
    card.appendChild(row);
  });

  return card;
}

/* ==========================================================================
   6. رسم بياني (Bar Chart — 6 شهور)
   ========================================================================== */

function renderBarChart() {
  const months = state.data.last6Months;
  const maxRev = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.expenses)));

  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📈 آخر 6 شهور'),
  ]));

  const chart = el('div', {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: '4px',
      height: '160px',
      padding: '8px 0',
    },
  });

  months.forEach((m) => {
    const revH = maxRev > 0 ? Math.max(2, (m.revenue / maxRev) * 130) : 2;
    const expH = maxRev > 0 ? Math.max(2, (m.expenses / maxRev) * 130) : 2;

    const col = el('div', {
      style: {
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
      },
    });

    col.appendChild(el('div', {
      style: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '130px' },
    }, [
      el('div', {
        style: { width: '10px', height: revH + 'px', background: 'linear-gradient(180deg, #4CAF50, #2E7D32)', borderRadius: '2px 2px 0 0' },
        title: 'إيرادات: ' + formatEGP(m.revenue),
      }),
      el('div', {
        style: { width: '10px', height: expH + 'px', background: 'linear-gradient(180deg, #EF5350, #C62828)', borderRadius: '2px 2px 0 0' },
        title: 'مصروفات: ' + formatEGP(m.expenses),
      }),
    ]));

    col.appendChild(el('div', { style: { fontSize: '10px', color: '#666', textAlign: 'center' } }, m.month));
    chart.appendChild(col);
  });

  card.appendChild(chart);

  /* Legend */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '12px', justifyContent: 'center', fontSize: '11px', color: '#666', marginTop: '8px' },
  }, [
    el('span', {}, '🟢 إيرادات'),
    el('span', {}, '🔴 مصروفات'),
  ]));

  return card;
}

/* ==========================================================================
   7. توزيع المصروفات (Pie مبسط)
   ========================================================================== */

function renderPieChart() {
  const cats = state.data.expenseCategories;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📉 توزيع المصروفات'),
  ]));

  if (cats.length === 0) {
    card.appendChild(el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'لا توجد مصروفات في هذه الفترة.'));
    return card;
  }

  const colors = ['#C62828', '#F57C00', '#B8863B', '#1565C0', '#6A1B9A', '#2E7D32', '#AD1457', '#757575'];

  /* شرائط أفقية بدل الدائرة — أسهل للقراءة على الجوال */
  cats.forEach((c, i) => {
    const color = colors[i % colors.length];
    card.appendChild(el('div', { style: { marginBottom: '8px' } }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' } }, [
        el('span', { style: { fontWeight: '500' } }, c.name),
        el('span', { style: { color: '#666' } }, formatEGP(c.amount) + ' (' + Math.round(c.percent) + '%)'),
      ]),
      el('div', { style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden' } }, [
        el('div', {
          style: { width: c.percent + '%', height: '100%', background: color, transition: 'width 0.4s' },
        }),
      ]),
    ]));
  });

  return card;
}

/* ==========================================================================
   8. نقطة التعادل + التوقعات
   ========================================================================== */

function renderBreakEven() {
  const be = state.data.breakEven;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '⚖️ نقطة التعادل'),
  ]));
  card.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
  }, [
    el('div', { style: { textAlign: 'center', padding: '8px' } }, [
      el('div', { style: { fontSize: '11px', color: '#666' } }, 'متوسط الطلب'),
      el('div', { style: { fontSize: '16px', fontWeight: '600', color: '#123C2F' } }, formatEGP(be.avgOrderValue)),
    ]),
    el('div', { style: { textAlign: 'center', padding: '8px' } }, [
      el('div', { style: { fontSize: '11px', color: '#666' } }, 'مصروفات شهرية'),
      el('div', { style: { fontSize: '16px', fontWeight: '600', color: '#123C2F' } }, formatEGP(be.avgMonthlyExpenses)),
    ]),
  ]));
  card.appendChild(el('div', {
    style: {
      textAlign: 'center', padding: '12px', marginTop: '8px',
      background: '#F1F8E9', borderRadius: '8px',
    },
  }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, 'عدد الطلبات المطلوبة شهرياً'),
    el('div', { style: { fontSize: '20px', fontWeight: '700', color: '#2E7D32' } }, String(be.ordersNeededMonthly) + ' طلب'),
  ]));
  return card;
}

function renderForecast() {
  const f = state.data.forecast;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🔮 التوقعات (3 شهور)'),
  ]));
  card.appendChild(el('div', {
    style: {
      fontSize: '13px', color: f.trend > 0 ? '#2E7D32' : f.trend < 0 ? '#C62828' : '#666',
      marginBottom: '8px', fontWeight: '500',
    },
  }, 'الاتجاه العام: ' + (f.trend > 0 ? '📈 +' : f.trend < 0 ? '📉 ' : '⚪ ') + Math.round(f.trend) + '%'));

  card.appendChild(el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' },
  }, f.nextMonths.map((m) => el('div', {
    style: {
      textAlign: 'center', padding: '8px', background: '#F6F1E6', borderRadius: '8px',
    },
  }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, m.month),
    el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } }, formatEGP(Math.round(m.predicted))),
  ]))));

  return card;
}

/* ==========================================================================
   9. النصائح الذكية
   ========================================================================== */

function renderTips() {
  const tips = state.data.tips;
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '💡 نصائح مالية ذكية'),
  ]));

  if (tips.length === 0) {
    card.appendChild(el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'لا توجد نصائح حالياً.'));
    return card;
  }

  const colors = {
    critical: { bg: '#FFEBEE', border: '#C62828' },
    warning:  { bg: '#FFF3E0', border: '#F57C00' },
    success:  { bg: '#E8F5E9', border: '#2E7D32' },
    info:     { bg: '#E3F2FD', border: '#1565C0' },
  };

  tips.forEach((tip) => {
    const c = colors[tip.type] || colors.info;
    card.appendChild(el('div', {
      style: {
        padding: '8px 10px',
        background: c.bg,
        borderRight: '3px solid ' + c.border,
        borderRadius: '6px',
        marginBottom: '6px',
        fontSize: '13px',
        lineHeight: '1.5',
      },
    }, tip.icon + ' ' + tip.text));
  });

  return card;
}

/* ==========================================================================
   10. التصدير
   ========================================================================== */

function renderExportActions() {
  const wrap = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' },
  });
  wrap.appendChild(el('button', {
    className: 'btn btn--primary btn--sm', type: 'button',
    onClick: () => doExportCSV(),
  }, '📊 تصدير CSV'));
  wrap.appendChild(el('button', {
    className: 'btn btn--accent btn--sm', type: 'button',
    onClick: () => {
      try {
        shareViaWhatsApp(state.data);
      } catch (e) { toast.danger('فشل: ' + e.message); }
    },
  }, '💬 WhatsApp'));
  wrap.appendChild(el('button', {
    className: 'btn btn--secondary btn--sm', type: 'button',
    onClick: () => {
      try {
        printFinancialReport(state.container, 'التقرير المالي');
      } catch (e) { toast.danger('فشل: ' + e.message); }
    },
  }, '📄 طباعة / PDF'));
  return wrap;
}

async function doExportCSV() {
  try {
    exportSummaryCSV(state.data, state.payments, state.expenses, state.customerMap);
    toast.success('تم تصدير التقرير');
  } catch (e) {
    toast.danger('فشل: ' + e.message);
  }
}

/* ==========================================================================
   11. Empty state
   ========================================================================== */

function renderEmptyState() {
  const wrap = el('div', { className: 'empty-state' });
  wrap.appendChild(el('div', { className: 'empty-state__icon' }, '📊'));
  wrap.appendChild(el('h2', { className: 'empty-state__title' }, 'لا توجد بيانات بعد'));
  wrap.appendChild(el('p', { className: 'empty-state__text' }, 'ابدأ بإضافة أول طلب أو دفعة لعرض التحليلات.'));
  wrap.appendChild(el('button', {
    className: 'btn btn--primary',
    style: { marginTop: '12px' },
    onClick: () => { location.hash = '#/orders'; },
  }, '➕ إضافة طلب'));
  return wrap;
}

/* ==========================================================================
   12. الصفحة الرئيسية
   ========================================================================== */

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  /* Header */
  c.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '💰 المركز المالي'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'تحليلات مالية شاملة لورشتك'),
  ]));

  c.appendChild(renderFilter());
  c.appendChild(renderExportActions());

  /* Empty state */
  const total = state.data.summary.totalRevenue + state.data.summary.totalExpenses;
  if (total === 0 && state.data.ordersStats.count === 0) {
    c.appendChild(renderEmptyState());
    return;
  }

  /* Cards */
  c.appendChild(renderHealth());
  c.appendChild(renderSummary());
  c.appendChild(renderPending());
  c.appendChild(renderComparison());
  c.appendChild(renderBarChart());
  c.appendChild(renderPieChart());
  c.appendChild(renderBreakEven());
  c.appendChild(renderForecast());
  c.appendChild(renderTips());
}

/* ==========================================================================
   13. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [data, payments, expenses, customers] = await Promise.all([
    getFinancialData(state.period),
    paymentsRepo.list(),
    expensesRepo.list(),
    customersRepo.list(),
  ]);
  state.data = data;
  state.payments = payments;
  state.expenses = expenses;
  state.customerMap = {};
  customers.forEach((c) => { state.customerMap[c.id] = c; });
}

async function refreshAll() {
  try {
    await loadData();
    renderPage();
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   14. API
   ========================================================================== */

export const financialCenterPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.period = 'month';
    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      period: 'month',
      data: null,
      payments: [],
      expenses: [],
      customerMap: {},
    };
  },
};
