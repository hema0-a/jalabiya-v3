/* ==========================================================================
   report-image.js — صورة قابلة للمشاركة لتقرير الأسبوع (v3.19.0) — Canvas بلا مكتبات
   ==========================================================================
   renderReportCanvas(lines, title) ⟵ HTMLCanvasElement · shareReportImage(...) ⟵ مشاركة ملف إن أمكن وإلا تنزيل.
   النص عربي RTL: textAlign=right و direction=rtl. لا بيانات تغادر الجهاز.
   ========================================================================== */

export function renderReportCanvas(lines, title = '') {
  const W = 1080; const pad = 64; const lh = 76;
  const rows = (Array.isArray(lines) ? lines : []).filter((l) => l !== null && l !== undefined);
  const H = Math.max(520, 220 + rows.length * lh + 80);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#F6F1E6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1F6F54'; g.fillRect(0, 0, W, 150);
  g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillStyle = '#FFFFFF'; g.font = 'bold 54px system-ui, "Segoe UI", Tahoma, sans-serif';
  g.fillText(title || 'تقرير الأسبوع', W - pad, 75);
  g.font = '40px system-ui, "Segoe UI", Tahoma, sans-serif';
  rows.forEach((line, i) => {
    const y = 220 + i * lh;
    if (i % 2 === 0) { g.fillStyle = 'rgba(31,111,84,0.06)'; g.fillRect(pad / 2, y - lh / 2 + 4, W - pad, lh - 8); }
    g.fillStyle = '#123C2F'; g.fillText(String(line), W - pad, y);
  });
  return cv;
}

export async function shareReportImage(cv, filename = 'weekly-report.png', text = '') {
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  if (!blob) throw new Error('تعذّر إنشاء الصورة');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
