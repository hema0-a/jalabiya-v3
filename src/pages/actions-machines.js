/* ==========================================================================
   actions-machines.js — 🛠️ قسم «الماكينات» في مركز العمل (v3.19.0)
   ==========================================================================
   كل ماكينة: ساعات التشغيل · شريط تقدّم نحو الصيانة · ➕ ساعات سريعة · 🛠️ تمّت الصيانة · حذف. وإضافة ماكينة بدورة صيانة تختارها.
   المنطق في services/machinery.js؛ الحفظ عبر onSave(list) من الصفحة.
   ========================================================================== */

import { el } from '../core/dom.js';
import { addHours, serviceDone, machineStatus, newMachine, DEFAULT_INTERVAL_H, MAX_MACHINES } from '../services/machinery.js';

const COLOR = { ok: '#2E7D32', soon: '#F57C00', due: '#C62828' };

export function buildMachinesSection({ machines = [], onSave }) {
  const sec = el('details', { className: 'card machines-section', 'data-testid': 'machines-section', style: { padding: '12px', marginTop: '12px' } });
  sec.appendChild(el('summary', { style: { cursor: 'pointer', fontWeight: '700' } }, '🛠️ الماكينات (' + machines.length + ')'));
  const save = (list) => onSave && onSave(list);

  machines.forEach((m) => {
    const s = machineStatus(m);
    const bar = el('div', { style: { height: '6px', background: '#E5E0D2', borderRadius: '3px', margin: '6px 0' } }, [el('div', { style: { height: '6px', borderRadius: '3px', width: Math.min(100, Math.round(s.pct * 100)) + '%', background: COLOR[s.state] } })]);
    const btn = (txt, fn) => el('button', { type: 'button', className: 'btn btn--sm', onClick: fn }, txt);
    sec.appendChild(el('div', { className: 'machine-row', 'data-machine': m.id, 'data-state': s.state, style: { padding: '8px 0', borderTop: '1px solid #eee' } }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px' } }, [el('b', {}, m.name), el('span', { style: { color: COLOR[s.state] } }, s.sinceService + ' / ' + s.intervalHours + ' س')]),
      bar,
      el('div', { style: { fontSize: '12px', opacity: '0.75' } }, 'إجمالي التشغيل ' + m.hours + ' ساعة'),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } }, [
        ...[1, 5, 8].map((h) => btn('+' + h + ' س', () => save(machines.map((x) => (x.id === m.id ? addHours(x, h) : x))))),
        btn('🛠️ تمّت الصيانة', () => save(machines.map((x) => (x.id === m.id ? serviceDone(x, Date.now()) : x)))),
        btn('🗑', () => { if (window.confirm('حذف الماكينة «' + m.name + '»؟')) save(machines.filter((x) => x.id !== m.id)); }),
      ]),
    ]));
  });

  if (machines.length < MAX_MACHINES) {
    const name = el('input', { className: 'input', type: 'text', value: 'Daimoku AE-1410', 'data-role': 'mc-name', 'aria-label': 'اسم الماكينة' });
    const iv = el('input', { className: 'input', type: 'number', min: '10', value: String(DEFAULT_INTERVAL_H), 'data-role': 'mc-interval', 'aria-label': 'دورة الصيانة بالساعات', style: { maxWidth: '90px' } });
    sec.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' } }, [
      name, iv, el('button', { type: 'button', className: 'btn btn--sm btn--primary', 'data-action': 'add-machine', onClick: () => save([...machines, newMachine({ name: name.value, intervalHours: iv.value })]) }, '➕ إضافة'),
    ]));
    sec.appendChild(el('div', { style: { fontSize: '11px', opacity: '0.65', marginTop: '4px' } }, 'الحقل الأول: اسم الماكينة · الثاني: كل كم ساعة صيانة (الافتراضي 100).'));
  }
  return sec;
}
