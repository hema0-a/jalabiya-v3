/* ==========================================================================
   delivery-receipt-dialog.js — نافذة إيصال التسليم (معاينة + إرسال واتساب)  [v3.3.60]
   ==========================================================================
   تُفتح بعد تأكيد تسليم جزئي، ومن سجل التسليمات في المعاينة السريعة (لإعادة الإصدار).
   الإرسال بنقرة جديدة من المستخدم (Web Share يحتاج تفاعلاً حديثاً) — لا يُستدعى تلقائياً.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { renderDeliveryReceiptCanvas, shareRenderedReceipt } from '../services/invoice-image.js';

/**
 * @param {Object} order — الطلب بعد حفظ التسليمة
 * @param {string} deliveryId
 * @param {Object} [customer]
 * @param {{collected?:number, headline?:string}} [opts]
 * @returns {Object} handle النافذة
 */
export function openDeliveryReceipt(order, deliveryId, customer, opts = {}) {
  const status = el('div', { role: 'status', style: { fontSize: '13px', color: '#666', margin: '6px 0 10px' } }, 'جارٍ تجهيز الإيصال...');
  const img = el('img', {
    alt: 'إيصال التسليم',
    style: { display: 'none', width: '100%', borderRadius: '12px', border: '1px solid #E5DDD0', background: '#fff' },
  });
  const body = el('div', {}, [
    opts.headline ? el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } }, opts.headline) : null,
    status, img,
  ].filter(Boolean));

  let rendered = null;
  const handle = modal.open({
    title: '🧾 إيصال التسليم', body, closable: true,
    actions: [
      { text: 'إغلاق', variant: 'ghost', onClick: () => handle.close() },
      {
        text: '📤 إرسال على واتساب', variant: 'primary',
        onClick: async () => {
          if (!rendered) { toast.info('الإيصال قيد التجهيز، لحظة...'); return; }
          try {
            const r = await shareRenderedReceipt(rendered, customer);
            if (r === 'downloaded') toast.info('تم حفظ صورة الإيصال — أرفقها في محادثة واتساب');
            if (r !== 'cancelled') handle.close();
          } catch (err) {
            console.error('[delivery-receipt] share', err);
            toast.danger('تعذّر إرسال الإيصال');
          }
        },
      },
    ],
  });

  renderDeliveryReceiptCanvas(order, deliveryId, customer, { collected: opts.collected })
    .then((r) => {
      rendered = r;
      img.src = r.canvas.toDataURL('image/png');
      img.style.display = 'block';
      status.textContent = '';
    })
    .catch((err) => {
      console.error('[delivery-receipt] render', err);
      status.textContent = '⚠️ تعذّر إنشاء الإيصال';
      status.style.color = '#B3261E';
    });
  return handle;
}
