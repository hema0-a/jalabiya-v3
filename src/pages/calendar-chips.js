/* ==========================================================================
   calendar-chips.js — رقاقة «شخصي» في خلية اليوم (v3.18.0: مفصولة عن calendar-grid.js ليبقى ≤ 300 سطر)
   ==========================================================================
   API: isPersonal(event) · buildPersonalChip(events) → HTMLElement
   تعرض عدد الأحداث الشخصية (التزامات·مستندات·جمعيات·مهام) ببنفسجي هادئ، وأحمر إن فيها منتهٍ أو متأخر.
   لا تستورد calendar.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { PERSONAL_TYPES } from '../services/calendar-personal.js';

export const isPersonal = (e) => PERSONAL_TYPES.includes(e.type);

export function buildPersonalChip(events) {
  const late = events.some((e) => e.status === 'expired' || e.status === 'overdue');
  return el('span', {
    className: 'cal-chip cal-chip--personal',
    style: {
      fontSize: '9px', background: late ? '#FFEBEE' : '#E0F2F1', color: late ? '#C62828' : '#00695C',
      padding: '1px 4px', borderRadius: '6px', lineHeight: '1.2',
    },
  }, '🗂️' + events.length);
}
