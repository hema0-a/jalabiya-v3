/* ==========================================================================
   message-composer-dialog.js — نافذة «صياغة رسالة» (v3.3.66)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { settings } from '../data/repos/settings.js';
import { sendLogged } from '../services/auto-messages.js';
import { workshopVars } from '../services/message-templates.js';
import { SITUATIONS, TONES, matchSituations, getSituation, composeMessage } from '../services/message-composer.js';

/**
 * @param {{customer?:Object|null, amount?:number, date?:string, text?:string}} [opts]
 */
export async function openMessageComposer(opts = {}) {
  const customer = opts.customer || null;
  let ws = {};
  try { ws = (await settings.get()).workshop || {}; } catch { /* ignore */ }
  const wv = workshopVars(ws);

  let situationId = null;
  let tone = 'friendly';
  let userEdited = false;

  const idea = el('input', { className: 'input', type: 'text', placeholder: 'اكتب فكرتك بكلمتين… مثل: اعتذار عن تأخير', 'data-role': 'idea', value: opts.text || '' });
  const chips = el('div', { className: 'composer__chips' });
  const toneBar = el('div', { className: 'composer__tones', role: 'group', 'aria-label': 'النبرة' });
  const fieldsBox = el('div', { className: 'composer__fields' });
  const out = el('textarea', { className: 'textarea', rows: '8', 'data-role': 'composer-out', style: { width: '100%', lineHeight: '1.8' } });
  const inputs = {};
  const mkField = (key, label, ph, val = '') => {
    const i = el('input', { className: 'input', type: key === 'amount' || key === 'days' ? 'number' : 'text', min: '0', placeholder: ph, value: val, 'data-field': key, 'aria-label': label });
    i.addEventListener('input', () => build());
    inputs[key] = i;
    return el('label', { className: 'composer__field', 'data-for': key }, [el('span', {}, label), i]);
  };
  const fieldNodes = {
    days: mkField('days', 'أيام التأخير', 'مثلاً 3'),
    date: mkField('date', 'التاريخ / اليوم', 'مثلاً الخميس القادم', opts.date || ''),
    amount: mkField('amount', 'المبلغ (ج.م)', '0', opts.amount ? String(opts.amount) : ''),
  };
  const note = el('input', { className: 'input', type: 'text', placeholder: 'سطر إضافي بصوتك (اختياري)', 'data-role': 'note' });
  note.addEventListener('input', () => build());

  function vars() {
    return {
      customer: customer ? customer.name : '', workshop: wv.workshop, address: wv.address, pickupHours: wv.pickupHours,
      days: inputs.days.value, date: inputs.date.value.trim(), amount: inputs.amount.value,
    };
  }
  function build() {
    if (!situationId) { out.value = ''; return; }
    out.value = composeMessage({ situationId, tone, vars: vars(), note: note.value });
    userEdited = false;
  }
  out.addEventListener('input', () => { userEdited = true; });

  function drawFields() {
    clear(fieldsBox);
    const s = getSituation(situationId);
    (s ? s.fields : []).forEach((f) => fieldsBox.appendChild(fieldNodes[f]));
  }
  function pick(id) {
    situationId = id;
    chips.querySelectorAll('[data-sit]').forEach((c) => {
      const on = c.getAttribute('data-sit') === id;
      c.classList.toggle('composer__chip--on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    drawFields();
    build();
  }
  SITUATIONS.forEach((s) => chips.appendChild(el('button', {
    type: 'button', className: 'composer__chip', 'data-sit': s.id, 'aria-pressed': 'false',
    onClick: () => pick(s.id),
  }, s.icon + ' ' + s.title)));
  TONES.forEach((t) => toneBar.appendChild(el('button', {
    type: 'button', className: 'composer__tone' + (t.id === tone ? ' composer__tone--on' : ''), 'data-tone': t.id,
    onClick: () => {
      tone = t.id;
      toneBar.querySelectorAll('[data-tone]').forEach((b) => b.classList.toggle('composer__tone--on', b.getAttribute('data-tone') === tone));
      build();
    },
  }, t.label)));

  idea.addEventListener('input', () => {
    const m = matchSituations(idea.value);
    if (m.length && !userEdited) pick(m[0].id);
  });

  const send = () => {
    const text = out.value.trim();
    if (!text) { toast.warning('اختر موقفاً أولاً'); return; }
    const phone = customer && customer.phone;
    if (phone) { if (!sendLogged(phone, text, { kind: 'composer', customerId: customer.id })) toast.warning('رقم الهاتف غير صالح'); }
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  };
  const copy = async () => {
    const text = out.value.trim();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success('تم النسخ'); }
    catch { out.select(); try { document.execCommand('copy'); toast.success('تم النسخ'); } catch { toast.warning('تعذّر النسخ'); } }
  };

  const body = el('div', { className: 'composer' }, [
    customer ? el('div', { className: 'composer__to' }, '👤 إلى: ' + customer.name + (customer.phone ? ' — ' + customer.phone : '')) : null,
    idea, chips, toneBar, fieldsBox, note, out,
    el('div', { className: 'composer__note' }, 'يصيغ من قوالب جاهزة محلياً دون إنترنت — عدّل النص كما تشاء قبل الإرسال.'),
  ].filter(Boolean));

  const handle = modal.open({
    title: '✍️ صياغة رسالة', body, closable: true, variant: 'sheet',
    actions: [
      { text: 'إغلاق', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      { text: '📋 نسخ', variant: 'secondary', action: 'composer-copy', onClick: copy },
      { text: customer && customer.phone ? '📱 إرسال واتساب' : '📱 واتساب', variant: 'primary', action: 'composer-send', onClick: send },
    ],
  });
  if (opts.text) { const m = matchSituations(opts.text); if (m.length) pick(m[0].id); }
  return { handle, pick, build, out, idea, inputs };
}
