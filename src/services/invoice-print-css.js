/* ==========================================================================
   invoice-print-css.js — أنماط صفحة الطباعة (v3.5.13)
   ==========================================================================
   PRINT_CSS — منقولة حرفياً. تُحقن في نافذة الطباعة من invoice-print.js.
   ========================================================================== */

/* ==========================================================
   2. CSS مشترك
   ========================================================== */
export const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4; margin: 12mm; }
body {
  font-family: 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;
  color: #1A1A1A; background: #fff;
  line-height: 1.5; font-size: 13px; padding: 24px;
}
.invoice { max-width: 820px; margin: 0 auto; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 20px; padding-bottom: 16px;
  border-bottom: 3px solid #1F6D57; margin-bottom: 24px;
}
.ws-info { display: flex; align-items: center; gap: 14px; }
.ws-logo {
  width: 64px; height: 64px; border-radius: 12px;
  background: linear-gradient(135deg, #2E8B6F, #1F6D57);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 32px; flex-shrink: 0; overflow: hidden;
}
.ws-logo img { width: 100%; height: 100%; object-fit: cover; }
.ws-name { font-size: 20px; font-weight: 700; color: #123C2F; margin-bottom: 4px; }
.ws-meta { font-size: 11px; color: #666; line-height: 1.6; }
.doc-info { text-align: left; flex-shrink: 0; }
.doc-title { font-size: 22px; font-weight: 700; color: #1F6D57; }
.doc-num { font-size: 13px; color: #123C2F; font-weight: 600; margin-top: 4px; }
.doc-date { font-size: 11px; color: #999; margin-top: 2px; }
.section { margin-bottom: 20px; }
.section-title {
  font-size: 12px; font-weight: 700; color: #1F6D57;
  margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid #E5DDD0;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
.info-item { display: flex; gap: 8px; font-size: 13px; padding: 3px 0; }
.info-item .lbl { color: #666; min-width: 70px; }
.info-item .val { color: #123C2F; font-weight: 500; }
table { width: 100%; border-collapse: collapse; }
th {
  background: #F6F1E6; color: #123C2F;
  padding: 10px 8px; text-align: right;
  font-weight: 600; font-size: 12px;
  border-bottom: 2px solid #1F6D57;
}
td { padding: 10px 8px; border-bottom: 1px solid #E5DDD0; font-size: 13px; }
tr:last-child td { border-bottom: none; }
.totals { margin-top: 16px; display: flex; justify-content: flex-end; }
.totals-table { width: 380px; border: 1px solid #E5DDD0; border-radius: 8px; overflow: hidden; }
.totals-table td { padding: 8px 12px; }
.totals-table tr.grand td { background: #1F6D57; color: #fff; font-weight: 700; font-size: 15px; }
.totals-table tr.highlight td { background: #FFF3E0; color: #E65100; font-weight: 700; }
.totals-table tr.discount td { color: #C62828; }
.totals-table tr.fees td { color: #F57C00; }
.totals-table tr.deposit td { color: #2E7D32; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge.pending { background: #FFF3E0; color: #F57C00; }
.badge.in_progress { background: #E3F2FD; color: #1565C0; }
.badge.ready { background: #F3E5F5; color: #6A1B9A; }
.badge.delivered { background: #E8F5E9; color: #2E7D32; }
.badge.cancelled { background: #FFEBEE; color: #C62828; }
.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.stat-box { padding: 12px; border-radius: 10px; text-align: center; border: 1px solid #E5DDD0; }
.stat-box .lbl { font-size: 11px; color: #666; margin-bottom: 4px; }
.stat-box .val { font-size: 17px; font-weight: 700; color: #123C2F; }
.stat-box.success { background: #E8F5E9; border-color: #A5D6A7; }
.stat-box.success .val { color: #2E7D32; }
.stat-box.warn { background: #FFF3E0; border-color: #FFCC80; }
.stat-box.warn .val { color: #E65100; }
.footer {
  margin-top: 30px; padding-top: 16px;
  border-top: 2px solid #E5DDD0;
  text-align: center; font-size: 11px; color: #666; line-height: 1.8;
}
.footer .thanks { font-size: 14px; font-weight: 600; color: #1F6D57; margin-bottom: 6px; }
.action-bar { position: fixed; top: 16px; left: 16px; display: flex; gap: 8px; z-index: 999; }
.action-bar button {
  padding: 10px 18px; font-family: inherit; font-size: 14px; font-weight: 600;
  border: none; border-radius: 8px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.btn-print { background: #1F6D57; color: #fff; }
.btn-close { background: #fff; color: #333; border: 1px solid #ddd !important; }
@media print {
  body { padding: 0; background: #fff; }
  .action-bar { display: none !important; }
}
`;
