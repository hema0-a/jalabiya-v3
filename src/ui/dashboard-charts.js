/* ==========================================================================
   dashboard-charts.js — رسوم بيانية بلوحة المعلومات (SVG يدوي)
   ==========================================================================
   - 3 دوال: مبيعات، توزيع الطلبات، ملخص مالي.
   - SVG خالص — لا مكتبات خارجية (القاعدة 10).
   - يدعم Dark Mode عبر CSS variables.
   - idempotent — يمكن استدعاؤها متعددة.
   - static imports فقط (القاعدة 14).
   ========================================================================== */

import { el } from '../core/dom.js';
import { formatEGP } from '../core/utils.js';

/* ==========================================================================
   1. أدوات SVG
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * إنشاء عنصر SVG.
 * @param {string} tag
 * @param {Object} [attrs]
 * @param {string|number} [text] نص العنصر (لعناصر <text>) — يُضبط عبر textContent فلا خطر حقن HTML
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  });
  if (text !== null && text !== undefined) node.textContent = String(text);
  return node;
}

/**
 * بناء بطاقة موحّدة.
 * @param {string} title
 * @param {HTMLElement|SVGElement} content
 * @param {Object} [opts]
 * @returns {HTMLElement}
 */
function chartCard(title, content, opts = {}) {
  const card = el('div', {
    className: 'card',
    style: { marginBottom: '16px', padding: '12px' },
  });
  card.appendChild(el('div', {
    style: {
      fontSize: '14px',
      fontWeight: '600',
      color: 'var(--color-primary-dark)',
      marginBottom: '10px',
    },
  }, title));
  card.appendChild(content);
  return card;
}

/* ==========================================================================
   2. Bar Chart — مبيعات آخر 7 أيام
   ========================================================================== */

/**
 * بناء رسم بياني بالأعمدة لمبيعات آخر 7 أيام.
 * @param {Array<{label:string, value:number}>} days
 * @returns {HTMLElement}
 */
export function createSalesBarChart(days) {
  const list = Array.isArray(days) ? days : [];
  const W = 320;
  const H = 140;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 24;
  const PAD_SIDE = 8;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const maxVal = Math.max(1, ...list.map((d) => Number(d.value) || 0));
  const slotW = (W - PAD_SIDE * 2) / Math.max(1, list.length);
  const barW = Math.min(28, slotW * 0.6);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet',
    style: 'width:100%;height:auto;display:block',
    role: 'img',
    'aria-label': 'مبيعات آخر 7 أيام',
  });

  /* خطوط الشبكة الأفقية (3) */
  for (let i = 0; i <= 3; i++) {
    const y = PAD_TOP + (chartH * i) / 3;
    svg.appendChild(svgEl('line', {
      x1: PAD_SIDE, y1: y, x2: W - PAD_SIDE, y2: y,
      stroke: 'var(--color-border)',
      'stroke-width': '1',
      'stroke-dasharray': i === 3 ? '0' : '3 3',
      opacity: i === 3 ? '1' : '0.5',
    }));
  }

  /* القيم القصوى */
  svg.appendChild(svgEl('text', {
    x: PAD_SIDE + 2, y: PAD_TOP - 6,
    'font-size': '9', fill: 'var(--color-primary-light)',
  }, formatEGP(maxVal)));

  /* الأعمدة */
  list.forEach((d, i) => {
    const v = Number(d.value) || 0;
    const barH = maxVal > 0 ? (v / maxVal) * chartH : 0;
    const x = PAD_SIDE + i * slotW + (slotW - barW) / 2;
    const y = PAD_TOP + chartH - barH;

    /* العمود */
    svg.appendChild(svgEl('rect', {
      x, y,
      width: barW,
      height: Math.max(2, barH),
      rx: '3',
      fill: 'url(#barGradient)',
    }));

    /* التسمية (اليوم) */
    svg.appendChild(svgEl('text', {
      x: x + barW / 2, y: H - 8,
      'text-anchor': 'middle',
      'font-size': '9',
      fill: 'var(--color-primary-light)',
    }, d.label || ''));

    /* القيمة (فوق العمود) */
    if (v > 0) {
      svg.appendChild(svgEl('text', {
        x: x + barW / 2, y: y - 3,
        'text-anchor': 'middle',
        'font-size': '8',
        fill: 'var(--color-primary-dark)',
        'font-weight': '600',
      }, String(Math.round(v))));
    }
  });

  /* تعريف التدرج */
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', {
    id: 'barGradient', x1: '0', y1: '0', x2: '0', y2: '1',
  });
  grad.appendChild(svgEl('stop', {
    offset: '0%', 'stop-color': 'var(--color-primary-light)',
  }));
  grad.appendChild(svgEl('stop', {
    offset: '100%', 'stop-color': 'var(--color-primary)',
  }));
  defs.appendChild(grad);
  svg.insertBefore(defs, svg.firstChild);

  /* إذا كانت كل القيم صفر */
  if (list.every((d) => (Number(d.value) || 0) === 0)) {
    svg.appendChild(svgEl('text', {
      x: W / 2, y: H / 2,
      'text-anchor': 'middle',
      'font-size': '12',
      fill: 'var(--color-primary-light)',
    }, 'لا توجد مبيعات في آخر 7 أيام'));
  }

  return chartCard('📊 مبيعات آخر 7 أيام', svg);
}

/* ==========================================================================
   3. Donut Chart — توزيع الطلبات بالحالة
   ========================================================================== */

/**
 * بناء رسم دائري (Donut) لتوزيع الطلبات بالحالة.
 * @param {Object} stats — { pending, in_progress, ready, delivered, cancelled }
 * @returns {HTMLElement}
 */
export function createOrdersDonutChart(stats) {
  const s = stats || {};
  const items = [
    { key: 'pending',     label: 'قيد الانتظار', color: '#F57C00', value: Number(s.pending) || 0 },
    { key: 'in_progress', label: 'قيد التنفيذ',  color: '#1565C0', value: Number(s.in_progress) || 0 },
    { key: 'ready',       label: 'جاهز',         color: '#6A1B9A', value: Number(s.ready) || 0 },
    { key: 'delivered',   label: 'تم التسليم',   color: '#2E7D32', value: Number(s.delivered) || 0 },
    { key: 'cancelled',   label: 'ملغي',         color: '#C62828', value: Number(s.cancelled) || 0 },
  ].filter((it) => it.value > 0);

  const total = items.reduce((sum, it) => sum + it.value, 0);

  /* الرسم */
  const W = 200;
  const H = 200;
  const CX = W / 2;
  const CY = H / 2;
  const R_OUTER = 80;
  const R_INNER = 50;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    style: 'width:180px;height:180px;display:block;margin:0 auto',
    role: 'img',
    'aria-label': 'توزيع الطلبات',
  });

  if (total === 0) {
    svg.appendChild(svgEl('circle', {
      cx: CX, cy: CY, r: (R_OUTER + R_INNER) / 2,
      fill: 'none',
      stroke: 'var(--color-border)',
      'stroke-width': R_OUTER - R_INNER,
    }));
    svg.appendChild(svgEl('text', {
      x: CX, y: CY + 4,
      'text-anchor': 'middle',
      'font-size': '12',
      fill: 'var(--color-primary-light)',
    }, 'لا توجد طلبات'));
  } else {
    let angle = -Math.PI / 2; /* ابدأ من الأعلى */
    const gap = 0.02; /* فجوة صغيرة بين الشرائح */

    items.forEach((it) => {
      const slice = (it.value / total) * Math.PI * 2 - gap;
      const endAngle = angle + slice;

      const x1 = CX + R_OUTER * Math.cos(angle);
      const y1 = CY + R_OUTER * Math.sin(angle);
      const x2 = CX + R_OUTER * Math.cos(endAngle);
      const y2 = CY + R_OUTER * Math.sin(endAngle);
      const x3 = CX + R_INNER * Math.cos(endAngle);
      const y3 = CY + R_INNER * Math.sin(endAngle);
      const x4 = CX + R_INNER * Math.cos(angle);
      const y4 = CY + R_INNER * Math.sin(angle);

      const largeArc = slice > Math.PI ? 1 : 0;

      const path = svgEl('path', {
        d: `M ${x1} ${y1} A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${R_INNER} ${R_INNER} 0 ${largeArc} 0 ${x4} ${y4} Z`,
        fill: it.color,
      });
      svg.appendChild(path);

      angle = endAngle + gap;
    });

    /* النص المركزي (الإجمالي) */
    svg.appendChild(svgEl('text', {
      x: CX, y: CY - 4,
      'text-anchor': 'middle',
      'font-size': '22',
      'font-weight': '700',
      fill: 'var(--color-primary-dark)',
    }, String(total)));

    svg.appendChild(svgEl('text', {
      x: CX, y: CY + 14,
      'text-anchor': 'middle',
      'font-size': '10',
      fill: 'var(--color-primary-light)',
    }, 'طلب'));
  }

  /* Legend */
  const legend = el('div', {
    style: {
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
      gap: '8px', marginTop: '10px', fontSize: '11px',
    },
  });

  items.forEach((it) => {
    legend.appendChild(el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '4px' },
    }, [
      el('span', {
        style: {
          width: '10px', height: '10px', borderRadius: '2px',
          background: it.color, flexShrink: '0',
        },
      }),
      el('span', {
        style: { color: 'var(--color-primary-dark)' },
      }, it.label + ' (' + it.value + ')'),
    ]));
  });

  const wrap = el('div', {}, [svg]);
  if (items.length > 0) wrap.appendChild(legend);

  return chartCard('🥧 توزيع الطلبات', wrap);
}

/* ==========================================================================
   4. Finance Chart — ملخص مالي (3 أعمدة)
   ========================================================================== */

/**
 * بناء رسم مالي بسيط (3 أعمدة: إيرادات، مصروفات، ربح).
 * @param {Object} finance — { revenue, expenses, profit }
 * @returns {HTMLElement}
 */
export function createFinanceChart(finance) {
  const f = finance || { revenue: 0, expenses: 0, profit: 0 };
  const items = [
    { label: 'إيرادات', value: Number(f.revenue) || 0, color: '#2E7D32' },
    { label: 'مصروفات', value: Number(f.expenses) || 0, color: '#C62828' },
    { label: 'ربح', value: Number(f.profit) || 0, color: (Number(f.profit) || 0) >= 0 ? '#1565C0' : '#F57C00' },
  ];
  const maxVal = Math.max(1, ...items.map((it) => Math.abs(it.value)));

  const W = 320;
  const H = 140;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 30;
  const PAD_SIDE = 20;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const slotW = (W - PAD_SIDE * 2) / items.length;
  const barW = Math.min(50, slotW * 0.7);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    style: 'width:100%;height:auto;display:block',
    role: 'img',
    'aria-label': 'الملخص المالي',
  });

  /* خط الأساس */
  const baselineY = PAD_TOP + chartH;
  svg.appendChild(svgEl('line', {
    x1: PAD_SIDE, y1: baselineY, x2: W - PAD_SIDE, y2: baselineY,
    stroke: 'var(--color-border)',
    'stroke-width': '1',
  }));

  items.forEach((it, i) => {
    const absVal = Math.abs(it.value);
    const barH = maxVal > 0 ? (absVal / maxVal) * chartH : 0;
    const x = PAD_SIDE + i * slotW + (slotW - barW) / 2;
    const y = baselineY - barH;

    /* العمود */
    svg.appendChild(svgEl('rect', {
      x, y,
      width: barW,
      height: Math.max(2, barH),
      rx: '4',
      fill: it.color,
      opacity: '0.85',
    }));

    /* القيمة فوق العمود */
    svg.appendChild(svgEl('text', {
      x: x + barW / 2, y: y - 6,
      'text-anchor': 'middle',
      'font-size': '11',
      'font-weight': '600',
      fill: it.color,
    }, formatEGP(it.value).replace(' ج.م', '')));

    /* التسمية أسفل العمود */
    svg.appendChild(svgEl('text', {
      x: x + barW / 2, y: H - 10,
      'text-anchor': 'middle',
      'font-size': '12',
      'font-weight': '500',
      fill: 'var(--color-primary-dark)',
    }, it.label));
  });

  return chartCard('💰 الملخص المالي (آخر 30 يوماً)', svg);
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { SVG_NS };
