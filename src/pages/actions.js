/* ==========================================================================
   actions.js — 📥 مركز العمل (v3.19.0)
   ==========================================================================
   قائمة واحدة بما يجب فعله اليوم من كل الميزات، مرتّبة بالأولوية، وعلى كل بند: ✓ تم · ⏰ أجّل · 📞 · 💬 · فتح.
   «تم» يُخفي البند اليوم فقط (إن بقيت المشكلة عاد غداً) · «أجّل» يُخفيه حتى تاريخ · وتأجيل الطلبات يحترمه إشعار الجوال أيضاً.
   المنطق في services/action-center.js، والتحميل في actions-data.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { todos } from '../data/repos/todos.js';
import { sendWhatsApp } from '../services/auto-messages.js';
import { snoozeKey, doneKey, clearKey, KINDS } from '../services/action-center.js';
import { loadActionCenter, saveActionState, saveMachines } from './actions-data.js';
import { buildMachinesSection } from './actions-machines.js';
import { addHours, serviceDone } from '../services/machinery.js';

let ui = { container: null, data: null, filter: 'all', showHidden: false };

const SNOOZES = [['غداً', 1], ['3 أيام', 3], ['أسبوع', 7]];
const SEL = { fontSize: '13px', width: 'auto', minWidth: '96px', flex: '0 0 auto' };

async function mutate(next) {
  try { ui.data.state = await saveActionState(next); await refresh(); }
  catch (e) { console.error('[actions] save:', e); toast.danger('تعذّر حفظ الحالة'); }
}

function itemCard(it, mode) {
  const st = ui.data.state;
  const btn = (txt, fn, cls = 'btn btn--sm') => el('button', { type: 'button', className: cls, onClick: fn }, txt);
  const actions = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } });
  if (mode === 'open' && it.kind === 'machine') {
    const ms = ui.data.machines || [];
    const upd = (fn) => saveMachines(ms.map((x) => (x.id === it.ref ? fn(x) : x))).then(() => refresh()).catch(() => toast.danger('تعذّر الحفظ'));
    actions.appendChild(btn('🛠️ تمّت الصيانة', () => upd((x) => serviceDone(x, Date.now())), 'btn btn--sm btn--primary'));
    actions.appendChild(btn('+5 س', () => upd((x) => addHours(x, 5))));
    actions.appendChild(el('select', { className: 'select', 'aria-label': 'تأجيل', style: SEL, onChange: (e) => { const d = Number(e.target.value); if (d) mutate(snoozeKey(st, it.key, d)); } }, [
      el('option', { value: '' }, '⏰ أجّل…'), ...SNOOZES.map(([l, d]) => el('option', { value: String(d) }, l)),
    ]));
  } else if (mode === 'open') {
    actions.appendChild(btn('✓ تم', async () => {
      if (it.kind === 'task') { try { await todos.update(it.ref, { done: true, doneAt: Date.now() }); } catch (e) { console.warn('[actions] task done:', e); } }
      mutate(doneKey(st, it.key));
    }, 'btn btn--sm btn--primary'));
    const sel = el('select', { className: 'select', 'aria-label': 'تأجيل', style: SEL, onChange: (e) => { const d = Number(e.target.value); if (d) mutate(snoozeKey(st, it.key, d)); } }, [
      el('option', { value: '' }, '⏰ أجّل…'), ...SNOOZES.map(([l, d]) => el('option', { value: String(d) }, l)),
    ]);
    actions.appendChild(sel);
    if (it.phone) {
      actions.appendChild(el('a', { className: 'btn btn--sm', href: 'tel:' + it.phone }, '📞'));
      actions.appendChild(btn('💬', () => { if (!sendWhatsApp(it.phone, '')) toast.warning('رقم الهاتف غير صالح'); }));
    }
    actions.appendChild(btn('فتح ‹', () => { location.hash = it.route; }));
  } else {
    actions.appendChild(el('span', { style: { fontSize: '12px', opacity: '0.75', alignSelf: 'center' } }, mode === 'snoozed' ? 'مؤجَّل حتى ' + it.until : 'أُنجز اليوم'));
    actions.appendChild(btn('↩ استرجاع', () => mutate(clearKey(st, it.key))));
  }
  return el('div', { className: 'card action-item', 'data-kind': it.kind, 'data-key': it.key, style: { padding: '10px 12px', marginBottom: '8px' } }, [
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline' } }, [
      el('span', {}, it.icon),
      el('div', { style: { flex: '1' } }, [el('div', { style: { fontWeight: '600', color: '#123C2F' } }, it.title), el('div', { style: { fontSize: '12px', opacity: '0.75' } }, it.label + ' · ' + it.subtitle)]),
    ]),
    actions,
  ]);
}

function draw() {
  const c = ui.container; clear(c);
  const m = ui.data.model;
  c.appendChild(el('div', { className: 'card', style: { padding: '12px', marginBottom: '10px' } }, [
    el('div', { style: { fontWeight: '700', fontSize: '16px' } }, m.total ? '📥 ' + m.total + ' بند بانتظارك اليوم' : '🎉 لا شيء ينتظرك الآن'),
    el('div', { style: { fontSize: '12px', opacity: '0.75', marginTop: '2px' } }, 'مرتّبة بالأولوية · «تم» يُخفي اليوم فقط · التأجيل يحترمه إشعار الجوال للطلبات'),
  ]));
  const kinds = Object.keys(m.byKind);
  if (kinds.length > 1) {
    const chips = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } });
    const chip = (id, label) => el('button', { type: 'button', className: 'btn btn--sm ' + (ui.filter === id ? 'btn--primary' : ''), 'data-filter': id, onClick: () => { ui.filter = id; draw(); } }, label);
    chips.appendChild(chip('all', 'الكل ' + m.total));
    kinds.forEach((k) => chips.appendChild(chip(k, KINDS[k].icon + ' ' + m.byKind[k])));
    c.appendChild(chips);
  }
  const list = ui.filter === 'all' ? m.items : m.items.filter((i) => i.kind === ui.filter);
  list.forEach((it) => c.appendChild(itemCard(it, 'open')));
  const hidden = m.snoozed.length + m.done.length;
  if (hidden) {
    c.appendChild(el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-testid': 'actions-toggle-hidden', style: { margin: '8px 0' }, onClick: () => { ui.showHidden = !ui.showHidden; draw(); } }, (ui.showHidden ? '▲ إخفاء' : '▼ عرض') + ' المؤجَّل والمُنجَز (' + hidden + ')'));
    if (ui.showHidden) { m.snoozed.forEach((it) => c.appendChild(itemCard(it, 'snoozed'))); m.done.forEach((it) => c.appendChild(itemCard(it, 'done'))); }
  }
  c.appendChild(buildMachinesSection({ machines: ui.data.machines || [], onSave: async (list) => { try { await saveMachines(list); await refresh(); } catch (e) { toast.danger('تعذّر الحفظ'); } } }));
}

async function refresh() { ui.data = await loadActionCenter(); draw(); }

export const actionsPage = {
  async render(container) {
    ui = { container, data: null, filter: 'all', showHidden: false };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try { await refresh(); } catch (err) {
      console.error('[actions] render:', err); clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() { ui = { container: null, data: null, filter: 'all', showHidden: false }; },
};
