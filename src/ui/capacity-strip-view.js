/* ==========================================================================
   capacity-strip-view.js — شريط أيام السعة تحت حقل تاريخ التسليم
   ==========================================================================
   أزرار صغيرة لأيام الأسبوعين القادمين ملوّنة بحسب الحِمل؛ الضغط على يوم يملأ التاريخ.
   لا يظهر إن لم يُضبط حد يومي. refresh() آمنة الاستدعاء بكثرة (تُؤجَّل لإطار واحد).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { buildCapacityStrip } from '../services/capacity-strip.js';

const COLORS = {
  ok: ['#E8F5E9', '#2E7D32'], near: ['#FFF3E0', '#E65100'], exceeded: ['#FFEBEE', '#C62828'],
  off: ['#EEEEEE', '#757575'], none: ['#F5F5F5', '#555'],
};

/**
 * @param {Object} o
 * @param {()=>Array} o.getOrders
 * @param {()=>Object} o.getConfig  {dailyOrderLimit, dayOffWeekday, excludeOrderId, orderAmount}
 * @param {(ts:number)=>void} o.onPick
 * @param {()=>number|null} [o.getSelectedTs]
 * @returns {HTMLElement & {refresh:Function}}
 */
export function buildCapacityStripView({ getOrders, getConfig, onPick, getSelectedTs }) {
  const box = el('div', { className: 'capstrip', 'data-role': 'capacity-strip' });
  let queued = false;

  function draw() {
    queued = false;
    clear(box);
    let days = [];
    try { days = buildCapacityStrip(getOrders(), getConfig(), Date.now(), 14); } catch (e) { days = []; }
    box.style.display = days.length ? '' : 'none';
    if (!days.length) return;
    const sel = getSelectedTs ? getSelectedTs() : null;
    box.appendChild(el('div', { className: 'capstrip__title' }, '📊 سعة الأيام القادمة (اضغط يوماً لاختياره)'));
    const row = el('div', { className: 'capstrip__row' });
    days.forEach((d) => {
      const [bg, fg] = COLORS[d.status] || COLORS.none;
      const isSel = sel != null && new Date(sel).toDateString() === new Date(d.ts).toDateString();
      const label = d.off ? 'إجازة' : (d.status === 'exceeded' ? 'ممتلئ' : (d.fits ? 'متاح' : 'لا يتسع'));
      row.appendChild(el('button', {
        type: 'button', className: 'capstrip__day' + (isSel ? ' is-selected' : ''),
        'data-day': d.key, 'data-status': d.status, 'data-fits': d.fits ? '1' : '0',
        disabled: d.off ? true : null,
        title: d.off ? 'إجازة الورشة' : (Math.round(d.amount) + ' / ' + Math.round(d.amount + d.remaining) + ' — ' + d.count + ' طلب'),
        style: { background: bg, color: fg, borderColor: fg + '55' },
        onClick: () => { if (!d.off) { onPick(d.ts); queueRefresh(); } },
      }, [
        el('span', { className: 'capstrip__wd' }, d.weekday),
        el('strong', { className: 'capstrip__num' }, String(new Date(d.ts).getDate())),
        el('span', { className: 'capstrip__st' }, label),
      ]));
    });
    box.appendChild(row);
  }

  function queueRefresh() {
    if (queued) return;
    queued = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16))(draw);
  }

  box.refresh = queueRefresh;
  box.refreshNow = draw;
  return box;
}
