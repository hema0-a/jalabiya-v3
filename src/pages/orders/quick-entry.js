/* ==========================================================================
   orders/quick-entry.js — ⚡ إدخال طلب بجملة واحدة (v3.19.0)
   ==========================================================================
   اكتب: «جلابية محمد 600 الخميس عربون 200» ⟵ يفهمها services/quick-order.js ويعرض ما فهمه للمراجعة،
   ثم يُحفظ كمسودة للنموذج (مفتاح order-form) ويُفتح النموذج نفسه ليراجعه المستخدم ويحفظ: لا حفظ مباشر بلا مراجعة.
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { customers } from '../../data/repos/customers.js';
import { settings } from '../../data/repos/settings.js';
import * as draft from '../../services/draft-manager.js';
import { buildItemCatalog } from '../../services/item-catalog.js';
import { parseQuickOrder, toOrderDraft } from '../../services/quick-order.js';
import { DRAFT_KEY } from './form-draft.js';

const niceDate = (ymd) => { const p = String(ymd || '').split('-').map(Number); if (p.length !== 3 || !p[0]) return ymd || '—'; const d = new Date(p[0], p[1] - 1, p[2]); return d.toLocaleDateString('ar-EG', { weekday: 'long' }) + ' ' + p[2] + '/' + p[1]; };
const ROW = { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 0', fontSize: '13px' };

export function buildQuickEntry(ctx) {
  const input = el('textarea', {
    className: 'input', rows: '2', 'data-testid': 'quick-order-input',
    placeholder: 'مثال: جلابية محمد 600 الخميس عربون 200',
    style: { width: '100%', resize: 'vertical' },
  });
  const out = el('div', { className: 'quick-order__out', 'data-testid': 'quick-order-out', style: { marginTop: '8px' } });
  let parsed = null;

  const row = (ok, label, value) => el('div', { style: ROW }, [
    el('span', {}, ok ? '✅' : '⚠️'), el('span', { style: { flex: '1' } }, label), el('span', { style: { opacity: '0.85' } }, value),
  ]);

  const render = () => {
    clear(out);
    if (!parsed) return;
    const p = parsed; const it = p.items[0];
    out.appendChild(row(p.found.customer, 'العميل', p.customerName || '—'));
    if (p.candidates.length) {
      const chips = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0' } });
      p.candidates.forEach((c) => chips.appendChild(el('button', {
        type: 'button', className: 'btn btn--sm', 'data-cand': String(c.id),
        onClick: () => { parsed = { ...p, customerId: c.id, customerName: c.name, candidates: [], found: { ...p.found, customer: true }, warnings: p.warnings.filter((w) => !w.includes('أكثر من عميل')) }; render(); },
      }, '👤 ' + c.name)));
      out.appendChild(chips);
    }
    out.appendChild(row(p.found.item, 'القطعة', it ? it.name + (it.quantity > 1 ? ' × ' + it.quantity : '') : '—'));
    out.appendChild(row(p.found.price || (it && it.price > 0), 'السعر', p.total > 0 ? p.total + ' ج' + (it && it.quantity > 1 ? ' (' + it.price + ' للقطعة)' : '') : '—'));
    out.appendChild(row(p.found.date, 'التسليم', niceDate(p.dueDate)));
    if (p.deposit > 0) out.appendChild(row(true, 'العربون', p.deposit + ' ج'));
    p.warnings.filter((w) => !/لم أجد (موعد|عميلاً)|لم أجد السعر/.test(w) || true).forEach((w) => out.appendChild(el('div', { style: { fontSize: '12px', opacity: '0.75', padding: '1px 0' } }, '• ' + w)));
    out.appendChild(el('button', {
      type: 'button', className: 'btn btn--primary btn--block', 'data-testid': 'quick-order-open', style: { marginTop: '8px' },
      onClick: () => {
        try { draft.save(DRAFT_KEY, toOrderDraft(parsed)); } catch (e) { console.warn('[quick-order] draft failed:', e); }
        input.value = ''; parsed = null; clear(out);
        ctx.openForm();
      },
    }, '📝 افتح في نموذج الطلب للمراجعة'));
  };

  const understand = async () => {
    try {
      const [custs, cfg] = await Promise.all([customers.list(), settings.get()]);
      const catalog = buildItemCatalog((cfg && cfg.jalabiyaTypes) || [], (ctx.state && ctx.state.orders) || []);
      parsed = parseQuickOrder(input.value, { customers: custs, catalog, now: Date.now() });
      if (!parsed.ok && !parsed.warnings.length) toast.info('لم أفهم الجملة');
      render();
    } catch (e) { console.warn('[quick-order] parse failed:', e); toast.danger('تعذّر تحليل الجملة'); }
  };

  const go = el('button', { type: 'button', className: 'btn btn--sm', 'data-testid': 'quick-order-go', style: { marginTop: '6px' }, onClick: understand }, '🔍 افهم الطلب');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); understand(); } });

  return el('details', { className: 'quick-order', style: { marginBottom: '12px' } }, [
    el('summary', { style: { cursor: 'pointer', fontWeight: '600', padding: '6px 0' } }, '⚡ إدخال سريع بجملة واحدة'),
    input, go, out,
  ]);
}
