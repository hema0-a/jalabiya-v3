/* ==========================================================================
   morning-summary.js — نافذة «صباح الخير» عند أول فتح كل يوم (v3.3.58)
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { appointments } from '../data/repos/appointments.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { shouldShowMorning, buildMorningModel, dayKey } from '../services/morning-summary.js';

export const ENABLED_KEY = 'jalabiya_v3_morning_summary';   /* 'off' يوقفه */
export const LAST_KEY = 'jalabiya_v3_morning_last';

export function isMorningEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'off'; } catch { return true; }
}
export function setMorningEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}
const readLast = () => { try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; } };
const writeLast = (k) => { try { localStorage.setItem(LAST_KEY, k); } catch { /* ignore */ } };

function buildBody(model, workshopName) {
  return el('div', { className: 'morning' }, [
    el('p', { className: 'morning__lead' }, 'صباح الخير' + (workshopName ? ' — ' + workshopName : '') + ' ☀️ هذا ما ينتظرك اليوم:'),
    ...model.sections.map((s) => el('div', { className: 'morning__row', 'data-section': s.id }, [
      el('div', { className: 'morning__head' }, [
        el('span', {}, s.icon + ' ' + s.title),
        el('span', { className: 'badge badge--info' }, String(s.count)),
      ]),
      s.names.length ? el('div', { className: 'morning__names' }, s.names.join(' · ') + (s.count > s.names.length && s.id !== 'week' ? ' …' : '')) : null,
    ])),
  ]);
}

/**
 * يعرض الملخص إن حان وقته وكان فيه ما يُعرض. يُسجَّل اليوم كـ«معروض» حتى لا يتكرر.
 * @returns {Promise<'shown'|'empty'|'skipped'>}
 */
export async function maybeShowMorningSummary(now = Date.now()) {
  if (!shouldShowMorning({ enabled: isMorningEnabled(), last: readLast(), now })) return 'skipped';
  let data;
  let workshopName = '';
  try {
    const [o, c, a, p, s] = await Promise.all([orders.list(), customers.list(), appointments.list(), payments.list(), settings.get().catch(() => ({}))]);
    data = { orders: o, customers: c, appointments: a, payments: p };
    workshopName = (s.workshop && s.workshop.name) || '';
  } catch { return 'skipped'; }
  const model = buildMorningModel(data, now);
  writeLast(dayKey(now));
  if (!model.total) return 'empty';
  const handle = modal.open({
    title: '☀️ ملخص الصباح',
    body: buildBody(model, workshopName),
    closable: true,
    actions: [
      { text: 'تم', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      { text: 'فتح لوحة التحكم', variant: 'primary', action: 'open-dashboard', onClick: () => { handle.close(); location.hash = '#/dashboard'; } },
    ],
  });
  return 'shown';
}
