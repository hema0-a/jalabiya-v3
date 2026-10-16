/* ==========================================================================
   report-issue.js — نافذة «أبلغ عن مشكلة»
   ==========================================================================
   تجمع التقرير (diagnostics.js) وتعرضه كاملاً للمراجعة مع خانة وصف، ثم:
   مشاركة (واتساب…) · نسخ · حفظ كملف. لا يُرسَل شيء تلقائياً.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { collectDiagnostics, formatReport, shareReport, copyReport, downloadReport } from '../services/diagnostics.js';

/** يفتح النافذة. @returns {Promise<{close:Function}|null>} */
export async function openReportIssue() {
  let diag;
  try { diag = await collectDiagnostics(); }
  catch (e) { toast.danger('تعذّر تجميع التقرير'); return null; }

  const desc = el('textarea', {
    className: 'input', rows: 3, id: 'report-issue-desc',
    placeholder: 'اكتب باختصار: ماذا كنت تفعل وماذا حدث؟',
    style: { width: '100%', marginBottom: '10px', fontSize: '16px' },
  });
  const preview = el('textarea', {
    className: 'input', id: 'report-issue-text', readOnly: true, rows: 10,
    dir: 'auto',
    style: { width: '100%', unicodeBidi: 'plaintext', textAlign: 'start', fontSize: '12px', fontFamily: 'monospace' },   /* كل سطر باتجاهه (عربي/لاتيني مختلط) */
  });
  const refresh = () => { preview.value = formatReport(diag, desc.value); };
  desc.addEventListener('input', refresh);
  refresh();

  const body = el('div', {}, [
    el('p', { style: { fontSize: '13px', lineHeight: '1.7', margin: '0 0 8px 0', color: '#123C2F' } },
      'يجمّع التطبيق معلومات التشخيص (الإصدار والجهاز وآخر الأخطاء) في رسالة جاهزة. لا تحتوي أسماء عملاء ولا أرقام هواتف ولا مبالغ.'),
    desc,
    el('div', { style: { fontSize: '12px', color: '#666', margin: '4px 0' } }, 'معاينة التقرير:'),
    preview,
  ]);

  return modal.open({
    title: '🛟 أبلغ عن مشكلة',
    body,
    variant: 'sheet',
    actions: [
      {
        text: '📤 مشاركة', variant: 'primary', action: 'share',
        onClick: async () => {
          const r = await shareReport(preview.value);
          if (r === 'copied') toast.success('تم نسخ التقرير — الصقه في المحادثة');
          else if (r === 'downloaded') toast.info('تم حفظ التقرير كملف — أرفقه في المحادثة');
        },
      },
      {
        text: '📋 نسخ', variant: 'secondary', action: 'copy',
        onClick: async () => {
          const ok = await copyReport(preview.value);
          if (ok) toast.success('تم النسخ'); else { downloadReport(preview.value); toast.info('تعذّر النسخ — حُفظ كملف'); }
        },
      },
      { text: 'إغلاق', variant: 'ghost', action: 'close', onClick: () => modal.close() },
    ],
  });
}
