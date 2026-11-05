/* ==========================================================================
   production-board.js — لوحة الإنتاج (v3.8.0) — تبويب «لوحة الإنتاج» في صفحة العمال
   ==========================================================================
   تركيز اليوم · الطلبات غير المُسندة · حمل كل عامل · إسناد بنقرة · تغيير حالة عدة طلبات معاً.
   تحمّل بياناتها بنفسها ولا تغيّر شيئاً إلا بإسناد (workerId) أو بتغيير حالة صريح مع تراجع.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { workers } from '../data/repos/workers.js';
import { customers } from '../data/repos/customers.js';
import { toast } from './toast.js';
import { modal } from './modal.js';
import { depositGuard } from './deposit-guard.js';
import { buildBoard, loadRatio, suggestWorker, splitBulk, BULK_TARGETS } from '../services/production-board.js';
import { STATUS_MAP } from '../pages/orders/logic.js';

const dueText = (r) => {
  if (r.daysLeft === null) return 'بلا موعد';
  if (r.daysLeft < 0) return 'متأخر ' + Math.abs(r.daysLeft) + ' يوم';
  if (r.daysLeft === 0) return 'اليوم';
  if (r.daysLeft === 1) return 'غداً';
  return 'بعد ' + r.daysLeft + ' يوم';
};
const dueColor = (r) => (r.late ? '#C62828' : (r.today ? '#E65100' : '#2E7D32'));

export function mountProductionBoard(host) {
  const st = { board: null, workers: [], orders: [], selected: new Set(), busy: false };

  async function load() {
    const [o, w, c] = await Promise.all([orders.list(), workers.list(), customers.list()]);
    st.orders = o;
    st.workers = w;
    st.board = buildBoard({ orders: o, workers: w, customers: c });
    const ids = new Set(st.board.workers.flatMap((x) => x.orders).concat(st.board.unassigned).map((r) => r.id));
    st.selected.forEach((id) => { if (!ids.has(id)) st.selected.delete(id); });
  }

  async function reload() { try { await load(); draw(); } catch (e) { console.error('[production-board]', e); toast.danger('تعذّر تحميل اللوحة'); } }

  async function assign(row, workerId) {
    try {
      await orders.update(row.id, { workerId: workerId || null });
      toast.success(workerId ? 'تم الإسناد' : 'أُلغي الإسناد');
      await reload();
    } catch (e) { toast.danger('فشل الإسناد: ' + e.message); }
  }

  function workerSelect(row) {
    const sel = el('select', { className: 'select', 'data-role': 'assign', 'aria-label': 'إسناد الطلب', style: { fontSize: '12px', padding: '4px', maxWidth: '120px' } });
    sel.appendChild(el('option', { value: '' }, 'غير مُسند'));
    st.workers.filter((w) => w.active !== false).forEach((w) => {
      const o = el('option', { value: w.id }, w.name || 'عامل');
      if (w.id === row.workerId) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => assign(row, sel.value));
    return sel;
  }

  function orderLine(row) {
    const cb = el('input', { type: 'checkbox', 'data-role': 'pick', 'aria-label': 'تحديد الطلب' });
    cb.checked = st.selected.has(row.id);
    cb.addEventListener('change', () => { if (cb.checked) st.selected.add(row.id); else st.selected.delete(row.id); drawBulk(); });
    return el('div', { className: 'card', 'data-order-id': row.id, style: { padding: '8px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' } }, [
      cb,
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          (row.urgent ? '🔥 ' : '') + row.name + ' · ' + row.label),
        el('div', { style: { fontSize: '11px', color: '#666' } }, [
          row.code + ' · ' + (STATUS_MAP[row.status] ? STATUS_MAP[row.status].label : row.status) + ' · ',
          el('span', { style: { color: dueColor(row), fontWeight: '700' } }, dueText(row)),
        ]),
      ]),
      workerSelect(row),
    ]);
  }

  const heading = (text) => el('h3', { style: { margin: '14px 0 6px', fontSize: '15px', color: '#123C2F' } }, text);
  const stat = (label, value, color) => el('div', { className: 'card', style: { padding: '8px 4px', textAlign: 'center' } }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, label),
    el('div', { style: { fontSize: '16px', fontWeight: '700', color: color || 'inherit' } }, String(value)),
  ]);

  const bulkBar = el('div', { 'data-role': 'bulk-bar', style: { position: 'sticky', bottom: '64px', zIndex: '5', background: '#123C2F', color: '#fff', borderRadius: '10px', padding: '8px', margin: '10px 0', display: 'none', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } });

  function drawBulk() {
    clear(bulkBar);
    const n = st.selected.size;
    bulkBar.style.display = n ? 'flex' : 'none';
    if (!n) return;
    bulkBar.appendChild(el('span', { style: { flex: '1', fontSize: '13px' } }, 'محدَّد: ' + n));
    BULK_TARGETS.forEach((tg) => bulkBar.appendChild(el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'bulk-' + tg, disabled: st.busy ? 'disabled' : null,
      onClick: () => bulkMove(tg),
    }, (tg === 'ready' ? '✅ ' : '▶️ ') + STATUS_MAP[tg].label)));
    bulkBar.appendChild(el('button', { className: 'btn btn--sm btn--ghost', type: 'button', style: { color: '#fff' }, 'data-action': 'bulk-clear', onClick: () => { st.selected.clear(); draw(); } }, 'إلغاء التحديد'));
  }

  async function bulkMove(target) {
    const { ok, skipped } = splitBulk(st.orders, [...st.selected], target);
    if (!ok.length) { toast.warning('لا طلب صالح لهذا الانتقال'); return; }
    const okGo = await modal.confirm({
      title: 'تغيير الحالة', confirmText: 'تأكيد', cancelText: 'إلغاء',
      message: 'نقل ' + ok.length + ' طلب إلى «' + STATUS_MAP[target].label + '»' + (skipped.length ? ' (سيُتخطّى ' + skipped.length + ' لا ينطبق عليه)' : '') + '؟',
    });
    if (!okGo) return;
    st.busy = true;
    const done = [];
    try {
      for (const o of ok) {
        if (!(await depositGuard(o, target))) continue;   /* تحذير العربون يظهر لكل طلب ناقص */
        await orders.update(o.id, { status: target });
        done.push({ id: o.id, status: o.status, readyAt: o.readyAt ?? null });
      }
    } catch (e) { toast.danger('توقّف التنفيذ: ' + e.message); }
    st.busy = false;
    st.selected.clear();
    if (done.length) {
      toast.undo('تم نقل ' + done.length + ' طلب إلى ' + STATUS_MAP[target].label, async () => {
        for (const p of done) await orders.update(p.id, { status: p.status, readyAt: p.readyAt });
        toast.info('تم التراجع');
        await reload();
      });
    }
    await reload();
  }

  function draw() {
    clear(host);
    const b = st.board;
    if (!b) return;
    host.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' } }, [
      stat('نشطة', b.totals.active), stat('غير مُسندة', b.totals.unassigned, b.totals.unassigned ? '#E65100' : '#2E7D32'),
      stat('متأخرة', b.totals.late, b.totals.late ? '#C62828' : '#2E7D32'), stat('اليوم', b.totals.dueToday, '#B8863B'),
    ]));
    if (!b.totals.active) {
      host.appendChild(el('div', { className: 'empty-state' }, [el('div', { className: 'empty-state__icon' }, '✅'), el('h2', { className: 'empty-state__title' }, 'لا طلبات نشطة'), el('p', { className: 'empty-state__text' }, 'ستظهر هنا الطلبات المعلّقة وقيد التنفيذ')]));
      return;
    }
    if (b.focus.length) {
      host.appendChild(heading('🎯 تركيز اليوم (' + b.focus.length + ')'));
      b.focus.forEach((r) => host.appendChild(orderLine(r)));
    }
    if (b.unassigned.length) {
      const sug = suggestWorker(b);
      host.appendChild(heading('📥 غير مُسندة (' + b.unassigned.length + ')'));
      if (sug) host.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '6px' } }, 'الأخفّ حملاً الآن: ' + sug.name));
      b.unassigned.forEach((r) => host.appendChild(orderLine(r)));
    }
    b.workers.forEach((w) => {
      const pct = Math.round(loadRatio(w.count, b.totals.maxCount) * 100);
      host.appendChild(el('div', { 'data-worker-id': w.worker.id, style: { marginTop: '14px' } }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700' } }, [
          el('span', {}, '👷 ' + w.worker.name),
          el('span', { style: { fontSize: '12px', color: w.lateCount ? '#C62828' : '#666' } },
            w.count + ' طلب · ' + w.pieces + ' قطعة' + (w.lateCount ? ' · ' + w.lateCount + ' متأخر' : '')),
        ]),
        el('div', { style: { height: '6px', background: '#EEE', borderRadius: '3px', margin: '4px 0 6px' } },
          [el('div', { style: { height: '6px', width: pct + '%', background: w.lateCount ? '#C62828' : '#1F6D57', borderRadius: '3px' } })]),
      ]));
      if (!w.orders.length) host.appendChild(el('div', { style: { fontSize: '12px', color: '#888' } }, 'لا طلبات مُسندة'));
      w.orders.forEach((r) => host.appendChild(orderLine(r)));
    });
    host.appendChild(bulkBar);
    drawBulk();
  }

  host.appendChild(el('div', { style: { padding: '16px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
  reload();
  return { destroy() { st.selected.clear(); }, reload };
}
