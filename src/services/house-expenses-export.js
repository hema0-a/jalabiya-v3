/* ==========================================================================
   house-expenses-export.js — تصدير + طباعة + رسم فئات مصاريف البيت
   ==========================================================================
   - exportCSV: تصدير إلى CSV (UTF-8 BOM).
   - printReport: طباعة / PDF.
   - buildCategoryBars: شرائط أفقية لتوزيع الفئات.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { HOUSE_EXPENSE_CATEGORIES } from '../core/config.js';

const CAT_MAP = {};
HOUSE_EXPENSE_CATEGORIES.forEach((c) => { CAT_MAP[c.id] = c; });

/* ==========================================================================
   1. CSV
   ========================================================================== */

/**
 * تحويل صفوف إلى نص CSV.
 * @param {Array<Array>} rows
 * @returns {string}
 */
function toCSV(rows) {
  return rows.map((row) =>
    row.map((cell) => {
      const s = String(cell ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\r\n');
}

/**
 * تصدير مصاريف البيت كـ CSV.
 * @param {string} period — 'month' | 'year' | 'all'
 * @param {Array} list
 * @param {number} total
 */
export function exportCSV(period, list, total) {
  const labels = { month: 'هذا الشهر', year: 'هذا العام', all: 'الكل' };
  const rows = [];

  rows.push(['الفترة', labels[period] || period]);
  rows.push(['الإجمالي', Number(total).toFixed(2)]);
  rows.push(['العدد', list.length]);
  rows.push([]);
  rows.push(['التاريخ', 'التصنيف', 'المبلغ (ج.م)', 'ملاحظات']);

  list.forEach((e) => {
    const cat = CAT_MAP[e.category] || CAT_MAP.other;
    rows.push([
      e.date ? formatDate(e.date) : '',
      cat ? cat.label : 'أخرى',
      Number(e.amount) || 0,
      e.note || '',
    ]);
  });

  const BOM = '\uFEFF';
  const csv = BOM + toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'house-expenses-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/* ==========================================================================
   2. طباعة
   ========================================================================== */

let _printStyleInjected = false;
function injectPrintStyle() {
  if (_printStyleInjected) return;
  _printStyleInjected = true;
  const style = document.createElement('style');
  style.id = 'house-expenses-print-style';
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #he-print-area, #he-print-area * { visibility: visible !important; }
      #he-print-area {
        position: absolute !important;
        left: 0 !important; top: 0 !important;
        width: 100% !important;
        padding: 20px !important;
        background: #fff !important;
      }
      .no-print { display: none !important; }
      .card { box-shadow: none !important; border: 1px solid #ddd !important; page-break-inside: avoid; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * طباعة التقرير.
 * @param {HTMLElement} areaEl
 */
export function printReport(areaEl) {
  if (!areaEl) return;
  injectPrintStyle();

  const oldId = areaEl.id;
  areaEl.id = 'he-print-area';

  const originalTitle = document.title;
  document.title = 'مصاريف البيت — ' + new Date().toLocaleDateString('ar-EG');

  setTimeout(() => {
    window.print();
    document.title = originalTitle;
    if (oldId) areaEl.id = oldId;
    else areaEl.removeAttribute('id');
  }, 100);
}

/* ==========================================================================
   3. شرائط الفئات
   ========================================================================== */

/**
 * بناء شرائط أفقية لتوزيع الفئات (Top 5).
 * @param {Array} categoryStats — نتيجة getCategoryStats
 * @returns {HTMLElement}
 */
export function buildCategoryBars(categoryStats) {
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📊 توزيع الفئات'),
  ]));

  if (!categoryStats || categoryStats.length === 0) {
    card.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا توجد بيانات.'));
    return card;
  }

  const top = categoryStats.slice(0, 5);
  top.forEach((cat) => {
    const row = el('div', { style: { marginBottom: '8px' } });
    row.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' },
    }, [
      el('span', { style: { fontWeight: '500' } }, cat.icon + ' ' + cat.label),
      el('span', { style: { color: '#666' } }, formatEGP(cat.amount) + ' (' + cat.percent + '%)'),
    ]));
    row.appendChild(el('div', {
      style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden' },
    }, [
      el('div', {
        style: {
          width: cat.percent + '%',
          height: '100%',
          background: cat.color,
          transition: 'width 0.4s',
        },
      }),
    ]));
    card.appendChild(row);
  });

  return card;
}
