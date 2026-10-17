/* ==========================================================================
   customer-menu.js — ضغطة مطوّلة على اسم عميل في أي صفحة (v3.3.55)
   ==========================================================================
   أي عنصر عليه data-customer-id: ضغط مطوّل (550ms) أو زر أيمن ⟵ قائمة:
   اتصال · واتساب · ملف العميل. التمرير لا يفعّلها (تُلغى عند التحرّك > 10px).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { customers } from '../data/repos/customers.js';
import { sendWhatsApp } from '../services/auto-messages.js';
import { previewCustomer } from './quick-preview.js';
import { openMessageComposer } from './message-composer-dialog.js';

export const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE = 10;

export async function openCustomerMenu(customerId) {
  let c = null;
  try { c = await customers.find(customerId); } catch { /* ignore */ }
  if (!c) { toast.warning('العميل غير موجود'); return null; }
  const phone = String(c.phone || '');
  const tel = phone.replace(/[^\d+]/g, '');
  const item = (cls, label, props) => el(props.href ? 'a' : 'button', { className: 'btn btn--secondary btn--block customer-menu__item ' + cls, type: props.href ? null : 'button', ...props }, label);

  const handle = modal.open({
    title: '👤 ' + (c.name || 'عميل'),
    body: el('div', { className: 'customer-menu' }, [
      phone ? el('div', { className: 'customer-menu__phone' }, phone) : el('div', { className: 'customer-menu__phone' }, 'لا يوجد رقم هاتف'),
      phone ? item('customer-menu__call', '📞 اتصال', { href: 'tel:' + tel, 'data-action': 'cm-call' }) : null,
      phone ? item('customer-menu__wa', '💬 واتساب', {
        'data-action': 'cm-wa',
        onClick: () => { if (!sendWhatsApp(phone, 'السلام عليكم ' + (c.name || '') + '،')) toast.warning('رقم الهاتف غير صالح'); handle.close(); },
      }) : null,
      item('customer-menu__compose', '✍️ صياغة رسالة', {
        'data-action': 'cm-compose',
        onClick: () => { handle.close(); setTimeout(() => openMessageComposer({ customer: c }), 50); },
      }),
      item('customer-menu__profile', '📋 ملف العميل', {
        'data-action': 'cm-profile',
        onClick: () => { handle.close(); setTimeout(() => previewCustomer(c), 50); },
      }),
    ].filter(Boolean)),
    closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', action: 'cancel', onClick: () => handle.close() }],
  });
  return handle;
}

let installed = null;

/** تثبيت المراقب العام مرة واحدة. يُرجع دالة إزالة. */
export function installCustomerLongPress(root = document) {
  if (installed) return installed;
  let timer = null;
  let start = null;
  let suppressClick = false;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; start = null; };
  const target = (e) => (e.target && e.target.closest ? e.target.closest('[data-customer-id]') : null);

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = target(e);
    if (!t) return;
    clear(); start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      const id = t.getAttribute('data-customer-id');
      clear();
      if (!id) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 600);
      openCustomerMenu(id);
    }, LONG_PRESS_MS);
  };
  const onMove = (e) => {
    if (!timer || !start) return;
    if (Math.abs(e.clientX - start.x) > MOVE_TOLERANCE || Math.abs(e.clientY - start.y) > MOVE_TOLERANCE) clear();
  };
  const onClickCapture = (e) => {
    if (suppressClick && target(e)) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
  };
  const onContext = (e) => {
    const t = target(e);
    if (!t) return;
    e.preventDefault();
    const id = t.getAttribute('data-customer-id');
    if (id) openCustomerMenu(id);
  };

  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('pointermove', onMove, true);
  root.addEventListener('pointerup', clear, true);
  root.addEventListener('pointercancel', clear, true);
  root.addEventListener('click', onClickCapture, true);
  root.addEventListener('contextmenu', onContext, true);
  installed = () => {
    root.removeEventListener('pointerdown', onDown, true);
    root.removeEventListener('pointermove', onMove, true);
    root.removeEventListener('pointerup', clear, true);
    root.removeEventListener('pointercancel', clear, true);
    root.removeEventListener('click', onClickCapture, true);
    root.removeEventListener('contextmenu', onContext, true);
    installed = null;
  };
  return installed;
}
