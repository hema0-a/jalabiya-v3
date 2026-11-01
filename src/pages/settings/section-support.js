/* ==========================================================================
   section-support.js — قسم الدعم وحل المشاكل (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: supportSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../../core/dom.js';
import { APP_CONFIG as APP_INFO } from '../../core/config.js';
import { openReportIssue } from '../../ui/report-issue.js';
import { getRecent as getRecentErrors } from '../../core/error-handler.js';

export const supportSection = {
  id: 'support',
  icon: '🛟',
  title: 'الدعم وحل المشاكل',
  async render(body) {
    const errCount = getRecentErrors(15).length;
    body.appendChild(el('p', { style: { fontSize: '13px', color: '#123C2F', lineHeight: '1.7', margin: '0 0 10px 0' } },
      'لو حدث عطل أو سلوك غريب: اضغط الزر لتجهيز رسالة فيها رقم الإصدار ونوع الجهاز وآخر الأخطاء وأعداد السجلات، وأرسلها بدل وصف العطل أو تصوير الشاشة. ' +
      'لا تحتوي أسماء عملاء ولا أرقام هواتف ولا مبالغ، وتراها كاملة قبل الإرسال.'));
    body.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '10px' } },
      'الإصدار الحالي: v' + APP_INFO.version + ' · أخطاء مسجّلة في هذه الجلسة: ' + errCount));
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button', id: 'btn-report-issue',
      onClick: () => { openReportIssue(); },
    }, '🛟 أبلغ عن مشكلة'));
  },
};
