/* ==========================================================================
   financial-export.js — تصدير التقارير المالية (CSV + WhatsApp + طباعة)
   ==========================================================================
   - CSV مع UTF-8 BOM (لدعم العربية في Excel/Sheets).
   - ملخص WhatsApp نصي.
   - فتح نافذة الطباعة (window.print).
   ========================================================================== */

import { formatEGP, formatDate, localDateInput } from '../core/utils.js';

/* ==========================================================================
   1. CSV
   ========================================================================== */

/**
 * تحويل مصفوفة صفوف إلى نص CSV.
 * @param {Array<Array<string|number>>} rows
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
 * تنزيل ملف CSV مع BOM (لدعم العربية).
 * @param {string} filename
 * @param {string} csvContent
 */
export function downloadCSV(filename, csvContent) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * تصدير الدفعات كـ CSV.
 * @param {Array} payments
 * @param {Object} customerMap
 */
export function exportPaymentsCSV(payments, customerMap) {
  const rows = [['التاريخ', 'العميل', 'المبلغ (ج.م)', 'طريقة الدفع', 'ملاحظات']];
  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى' };
  payments.forEach((p) => {
    const c = customerMap[p.customerId];
    rows.push([
      p.createdAt ? formatDate(p.createdAt) : '',
      c ? c.name : 'عميل محذوف',
      Number(p.amount) || 0,
      methods[p.method] || 'نقدي',
      p.notes || '',
    ]);
  });
  const filename = 'payments-' + localDateInput() + '.csv';
  downloadCSV(filename, toCSV(rows));
}

/**
 * تصدير المصروفات كـ CSV.
 * @param {Array} expenses
 */
export function exportExpensesCSV(expenses) {
  const rows = [['التاريخ', 'الفئة', 'المبلغ (ج.م)', 'ملاحظات']];
  const cats = { fabric: 'قماش', thread: 'خيوط', tools: 'أدوات', rent: 'إيجار', electricity: 'كهرباء', water: 'مياه', salary: 'رواتب', other: 'أخرى' };
  expenses.forEach((e) => {
    rows.push([
      e.date ? formatDate(e.date) : '',
      cats[e.category] || 'أخرى',
      Number(e.amount) || 0,
      e.notes || '',
    ]);
  });
  const filename = 'expenses-' + localDateInput() + '.csv';
  downloadCSV(filename, toCSV(rows));
}

/**
 * تصدير ملخص مالي شامل كـ CSV.
 * @param {Object} data - نتيجة getFinancialData
 * @param {Array} payments
 * @param {Array} expenses
 * @param {Object} customerMap
 */
export function exportSummaryCSV(data, payments, expenses, customerMap) {
  const lines = [];

  /* الملخص */
  lines.push(['=== الملخص المالي ===']);
  lines.push(['الإيرادات', Number(data.summary.totalRevenue).toFixed(2)]);
  lines.push(['المصروفات', Number(data.summary.totalExpenses).toFixed(2)]);
  lines.push(['صافي الربح', Number(data.summary.netProfit).toFixed(2)]);
  lines.push(['هامش الربح %', Number(data.summary.profitMargin).toFixed(2)]);
  lines.push(['متبقي العملاء', Number(data.pending.pendingPayments).toFixed(2)]);
  lines.push(['معدل التحصيل %', Number(data.pending.collectionRate).toFixed(2)]);
  lines.push(['الصحة المالية', data.health.score + '/100 (' + data.health.level + ')']);
  lines.push([]);

  /* المقارنة */
  lines.push(['=== مقارنة الشهر الحالي vs السابق ===']);
  lines.push(['البند', 'الحالي', 'السابق', 'التغيير %']);
  lines.push(['الإيرادات', data.comparison.current.revenue, data.comparison.previous.revenue, data.comparison.changes.revenueChange.toFixed(1)]);
  lines.push(['المصروفات', data.comparison.current.expenses, data.comparison.previous.expenses, data.comparison.changes.expensesChange.toFixed(1)]);
  lines.push(['الربح', data.comparison.current.profit, data.comparison.previous.profit, data.comparison.changes.profitChange.toFixed(1)]);
  lines.push([]);

  /* آخر 6 شهور */
  lines.push(['=== آخر 6 شهور ===']);
  lines.push(['الشهر', 'الإيرادات', 'المصروفات', 'الربح']);
  data.last6Months.forEach((mm) => {
    lines.push([mm.month, mm.revenue.toFixed(2), mm.expenses.toFixed(2), mm.profit.toFixed(2)]);
  });
  lines.push([]);

  /* الدفعات */
  lines.push(['=== الدفعات ===']);
  lines.push(['التاريخ', 'العميل', 'المبلغ', 'طريقة الدفع', 'ملاحظات']);
  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى' };
  payments.forEach((p) => {
    const c = customerMap[p.customerId];
    lines.push([p.createdAt ? formatDate(p.createdAt) : '', c ? c.name : '', Number(p.amount) || 0, methods[p.method] || 'نقدي', p.notes || '']);
  });
  lines.push([]);

  /* المصروفات */
  lines.push(['=== المصروفات ===']);
  lines.push(['التاريخ', 'الفئة', 'المبلغ', 'ملاحظات']);
  const cats = { fabric: 'قماش', thread: 'خيوط', tools: 'أدوات', rent: 'إيجار', electricity: 'كهرباء', water: 'مياه', salary: 'رواتب', other: 'أخرى' };
  expenses.forEach((e) => {
    lines.push([e.date ? formatDate(e.date) : '', cats[e.category] || '', Number(e.amount) || 0, e.notes || '']);
  });

  const filename = 'financial-summary-' + localDateInput() + '.csv';
  downloadCSV(filename, toCSV(lines));
}

/* ==========================================================================
   2. WhatsApp
   ========================================================================== */

/**
 * توليد ملخص WhatsApp نصي.
 * @param {Object} data
 * @param {string} [shopName='ورشة الجلابيب']
 * @returns {string}
 */
export function buildWhatsAppSummary(data, shopName = 'ورشة الجلابيب') {
  const lines = [];
  lines.push('📊 *الملخص المالي — ' + shopName + '*');
  lines.push('📅 ' + formatDate(Date.now()));
  lines.push('');
  lines.push('💰 *الإيرادات:* ' + formatEGP(data.summary.totalRevenue));
  lines.push('💸 *المصروفات:* ' + formatEGP(data.summary.totalExpenses));
  lines.push('✨ *صافي الربح:* ' + formatEGP(data.summary.netProfit));
  lines.push('📈 *هامش الربح:* ' + Math.round(data.summary.profitMargin) + '%');
  lines.push('');
  lines.push('💳 *متبقي على العملاء:* ' + formatEGP(data.pending.pendingPayments));
  lines.push('📊 *معدل التحصيل:* ' + Math.round(data.pending.collectionRate) + '%');
  lines.push('');
  lines.push('🎯 *الصحة المالية:* ' + data.health.score + '/100 — ' + data.health.level);
  const stars = '⭐'.repeat(data.health.stars);
  lines.push(stars);
  lines.push('');
  if (data.bestMonth && data.bestMonth.revenue > 0) {
    lines.push('🏆 *أفضل شهر:* ' + data.bestMonth.month + ' (' + formatEGP(data.bestMonth.revenue) + ')');
  }
  return lines.join('\n');
}

/**
 * فتح WhatsApp مع الملخص.
 * @param {Object} data
 * @param {string} [shopName]
 */
export function shareViaWhatsApp(data, shopName = 'ورشة الجلابيب') {
  const text = buildWhatsAppSummary(data, shopName);
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ==========================================================================
   3. طباعة / PDF
   ========================================================================== */

/**
 * إعدادات طباعة CSS — تُضاف مرة واحدة.
 */
let _printStyleInjected = false;
function injectPrintStyle() {
  if (_printStyleInjected) return;
  _printStyleInjected = true;
  const style = document.createElement('style');
  style.id = 'financial-print-style';
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #financial-print-area, #financial-print-area * { visibility: visible !important; }
      #financial-print-area {
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
 * فتح نافذة الطباعة.
 * @param {HTMLElement} areaEl - العنصر الذي يحتوي التقرير (سيُطبع فقط)
 * @param {string} [title='التقرير المالي']
 */
export function printFinancialReport(areaEl, title = 'التقرير المالي') {
  if (!areaEl) return;
  injectPrintStyle();

  /* عنوان مؤقت للطباعة */
  const oldId = areaEl.id;
  areaEl.id = 'financial-print-area';

  const originalTitle = document.title;
  document.title = title + ' — ' + new Date().toLocaleDateString('ar-EG');

  setTimeout(() => {
    window.print();
    document.title = originalTitle;
    if (oldId) areaEl.id = oldId;
    else areaEl.removeAttribute('id');
  }, 100);
}
