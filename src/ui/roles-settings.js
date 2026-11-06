/* ==========================================================================
   roles-settings.js — لوحة أرقام المدير والاستقبال والقفل المالي (v3.10.0)
   ==========================================================================
   تظهر في إعدادات الأمان للمالك فقط وبعد تعيين رقم المالك.
   ⚠️ قفل واجهة على هذا الجهاز (ليس تشفير بيانات) — الأرقام لا تُزامَن بين الأجهزة.
   ========================================================================== */

import { el } from '../core/dom.js';
import { toast } from './toast.js';
import { modal } from './modal.js';
import { toLatinDigits } from '../core/utils.js';
import { ROLE_LABELS } from '../services/roles.js';
import { hasSlot, setSlotPin, clearSlotPin, setRole } from '../security/role-pins.js';

const SLOT_INFO = [
  { name: 'manager', icon: '🧑‍💼', label: ROLE_LABELS.manager || 'المدير', hint: 'يدخل كل الصفحات ما عدا الإعدادات والأموال الشخصية والمزامنة' },
  { name: 'receptionist', icon: '🧾', label: ROLE_LABELS.receptionist || 'الاستقبال', hint: 'الطلبات والعملاء والتسليم والرسائل والمواعيد فقط' },
  { name: 'finance', icon: '💰', label: 'القفل المالي', hint: 'رقم إضافي يُطلب لفتح الصفحات المالية (يبقى مفتوحاً 10 دقائق)' },
];

function askNewPin(info, onDone) {
  const input = el('input', { className: 'input', type: 'password', inputMode: 'numeric', maxLength: 4, autocomplete: 'off', placeholder: '••••', 'aria-label': 'الرقم الجديد', 'data-role': 'slot-pin', style: { textAlign: 'center', fontSize: '22px', letterSpacing: '8px' } });
  const msg = el('div', { role: 'alert', style: { minHeight: '20px', fontSize: '13px', color: '#C62828', marginTop: '6px' } });
  let h = null;
  const save = async () => {
    const r = await setSlotPin(info.name, toLatinDigits(input.value));
    if (!r.ok) { msg.textContent = r.error || 'تعذّر الحفظ'; return; }
    /* المالك يبقى مالكاً في جلسته الحالية */
    setRole('owner');
    h.close(); toast.success('تم حفظ رقم «' + info.label + '»'); onDone();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  h = modal.open({
    title: info.icon + ' ' + info.label,
    body: el('div', {}, [el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '8px' } }, 'أدخل 4 أرقام مختلفة عن رقم المالك وعن بقية الأرقام'), input, msg]),
    actions: [{ text: 'حفظ', variant: 'primary', action: 'slot-save', onClick: save }],
  });
  setTimeout(() => { try { input.focus(); } catch (e) { /* اختياري */ } }, 50);
}

/** @returns {HTMLElement} */
export function buildRolesPanel() {
  const box = el('div', { className: 'settings-field', 'data-role': 'roles-panel', style: { marginTop: '12px' } });
  const draw = () => {
    box.replaceChildren();
    box.appendChild(el('div', { className: 'settings-row__label', style: { fontWeight: '700', marginBottom: '4px' } }, '👥 أرقام الموظفين والقفل المالي'));
    box.appendChild(el('div', { style: { fontSize: '12px', color: '#777', marginBottom: '8px' } }, 'قفل واجهة على هذا الجهاز فقط: يمنع الفتح بالخطأ ولا يشفّر البيانات، ولا يُزامَن مع الأجهزة الأخرى. رقمك أنت (المالك) يفتح كل شيء.'));
    SLOT_INFO.forEach((info) => {
      const on = hasSlot(info.name);
      const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderTop: '1px solid rgba(0,0,0,.08)' } }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { style: { fontWeight: '600' } }, info.icon + ' ' + info.label + (on ? ' ✅' : '')),
          el('div', { style: { fontSize: '12px', color: '#777' } }, info.hint),
        ]),
        el('button', { className: 'btn btn--secondary', type: 'button', 'data-slot': info.name, onClick: () => askNewPin(info, draw) }, on ? 'تغيير' : 'تعيين'),
      ]);
      if (on) {
        row.appendChild(el('button', { className: 'btn btn--ghost', type: 'button', 'data-slot-clear': info.name, 'aria-label': 'إزالة ' + info.label, onClick: () => { clearSlotPin(info.name); toast.info('أُزيل رقم «' + info.label + '»'); draw(); } }, '🗑️'));
      }
      box.appendChild(row);
    });
  };
  draw();
  return box;
}
