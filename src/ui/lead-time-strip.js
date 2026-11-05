/* ==========================================================================
   lead-time-strip.js — شريط «المدة المعتادة» تحت تاريخ التسليم (v3.8.2)
   ==========================================================================
   يتعلّم من طلبات الورشة المنتهية ويقترح موعداً، ويحذّر من الأصناف التي تتأخر عادةً.
   إرشادي: لا يكتب شيئاً إلا بضغطة «استخدم». يختفي إن لم تتوفر بيانات كافية.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatDate } from '../core/utils.js';
import { learnLeadTimes, statsForItems, suggestLeadDays, isChronicallyLate } from '../services/lead-time.js';

const DAY = 86400000;

/**
 * @param {{getOrders:()=>Array, getNames:()=>string[], onPick:(ts:number)=>void}} o
 * @returns {HTMLElement & {refresh:Function}}
 */
export function buildLeadTimeStrip({ getOrders, getNames, onPick }) {
  const box = el('div', { className: 'order-hint', 'data-role': 'lead-time-strip', style: { display: 'none' } });
  let queued = false;
  let cache = { src: null, learned: null };

  function draw() {
    queued = false;
    clear(box);
    let stats = [];
    try {
      const list = getOrders() || [];
      if (cache.src !== list) cache = { src: list, learned: learnLeadTimes(list) };
      stats = statsForItems(cache.learned, getNames());
    } catch (e) { stats = []; }
    box.style.display = stats.length ? '' : 'none';
    if (!stats.length) return;

    stats.slice(0, 3).forEach((s) => {
      box.appendChild(el('div', { style: { fontSize: '12.5px', lineHeight: '1.7' } },
        '⏱️ ' + s.name + ': عادةً ' + s.medianDays + ' يوم (80% منها خلال ' + s.p80Days + ' يوم) — من ' + s.count + ' طلب'));
      if (isChronicallyLate(s)) {
        box.appendChild(el('div', { style: { fontSize: '12px', color: '#E65100' } },
          '⚠️ ' + s.name + ' تأخّر في ' + s.lateRate + '% من طلباته (' + s.lateCount + ') — اترك هامش أمان'));
      }
    });
    const days = suggestLeadDays(stats);
    if (days !== null) {
      const ts = Date.now() + Math.max(1, days) * DAY;
      box.appendChild(el('button', {
        className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'use-lead-time', style: { marginTop: '4px' },
        onClick: () => onPick(ts),
      }, '📅 استخدم الموعد الآمن: ' + formatDate(ts) + ' (بعد ' + Math.max(1, days) + ' يوم)'));
    }
  }

  box.refresh = () => { if (queued) return; queued = true; Promise.resolve().then(draw); };
  box.refresh();
  return box;
}
