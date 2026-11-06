/* ==========================================================================
   kiosk-settings.js — لوحة وضع الكشك في إعدادات الأمان (v3.10.1)
   ========================================================================== */

import { el } from '../core/dom.js';
import { toast } from './toast.js';
import { settings } from '../data/repos/settings.js';
import { normalizeKiosk, MAX_MESSAGE } from '../services/kiosk.js';
import { enterKiosk } from './kiosk.js';

const OPTIONS = [
  ['showStats', 'أرقام الطلبات (قيد التنفيذ / سُلِّم اليوم)'],
  ['showPortfolio', 'معرض الأعمال (صور متحركة)'],
  ['showContact', 'الهاتف والعنوان ومواعيد الاستلام'],
];

/** @returns {HTMLElement} */
export function buildKioskPanel() {
  const box = el('div', { className: 'settings-field', 'data-role': 'kiosk-panel', style: { marginTop: '12px' } });
  const draw = async () => {
    const s = await settings.get();
    const cfg = normalizeKiosk(s.kiosk);
    const save = async (patch) => { await settings.update({ kiosk: { ...cfg, ...patch } }); };
    box.replaceChildren();
    box.appendChild(el('div', { className: 'settings-row__label', style: { fontWeight: '700', marginBottom: '4px' } }, '🖥️ وضع الكشك (شاشة عرض للزبائن)'));
    box.appendChild(el('div', { style: { fontSize: '12px', color: '#777', marginBottom: '8px' } }, 'لجهاز لوحي في المحل: يعرض اسم الورشة وصور أعمالك وبيانات التواصل دون أي مبالغ أو أسماء عملاء، ولا يُخرَج منه إلا برقم المالك. قفل واجهة وليس تشفير بيانات.'));
    OPTIONS.forEach(([key, label]) => {
      const cb = el('input', { type: 'checkbox', 'data-kiosk-opt': key, checked: cfg[key] ? 'checked' : null, onChange: async () => { await save({ [key]: cb.checked }); } });
      box.appendChild(el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' } }, [cb, el('span', {}, label)]));
    });
    const msg = el('input', { className: 'input', type: 'text', maxLength: MAX_MESSAGE, value: cfg.message, placeholder: 'رسالة ترحيب (اختياري)', 'aria-label': 'رسالة الترحيب', 'data-role': 'kiosk-message', style: { marginTop: '6px' } });
    msg.addEventListener('change', async () => { await save({ message: msg.value }); });
    box.appendChild(msg);
    box.appendChild(el('button', { className: 'btn btn--primary btn--block', type: 'button', 'data-role': 'kiosk-start', style: { marginTop: '8px' }, onClick: async () => {
      await save({ message: msg.value });
      const r = enterKiosk();
      if (!r.ok) toast.warning(r.error);
    } }, '🖥️ تشغيل وضع الكشك'));
  };
  draw().catch((e) => console.error('[KioskSettings]', e));
  return box;
}
