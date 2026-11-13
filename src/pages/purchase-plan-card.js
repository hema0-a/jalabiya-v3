/* ==========================================================================
   purchase-plan-card.js — 🛒 اقتراح مشتريات القماش (v3.19.0) — بطاقة في صفحة المخزون
   ==========================================================================
   الطلبات المفتوحة ⟵ القماش اللازم (قوالب حاسبة القماش × متوسط طول زبائنك) ⟵ مقارنته بمخزون القماش بالمتر ⟵ أرخص مورد.
   ⚠️ تقدير: الطلبات لا تحفظ مقاس كل عميل، فالحساب بـ«متوسط الطول» الذي تضبطه هنا. الافتراضات تُعرض صراحةً.
   ========================================================================== */

import { el } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { orders } from '../data/repos/orders.js';
import { inventory } from '../data/repos/inventory.js';
import { suppliers, supplierEntries } from '../data/repos/suppliers.js';
import { settings } from '../data/repos/settings.js';
import { buildPurchasePlan, DEFAULT_AVG_HEIGHT_CM } from '../services/purchase-plan.js';

const safe = (p) => Promise.resolve(p).catch(() => []);
const dm = (ymd) => { const p = String(ymd || '').split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : ''; };
const money = (v) => Math.round(Number(v) || 0).toLocaleString('en-US') + ' ج';
const tile = (l, v, c) => el('div', { className: 'card', style: { padding: '8px', textAlign: 'center' } }, [el('div', { style: { fontSize: '11px', opacity: '0.75' } }, l), el('div', { style: { fontWeight: '700', color: c } }, v)]);

export async function buildPurchasePlanCard() {
  const card = el('details', { className: 'card purchase-plan-card', 'data-testid': 'purchase-plan-card', style: { padding: '12px', marginBottom: '14px' } });
  async function draw(open) {
    const [ords, inv, sups, entries, st] = await Promise.all([safe(orders.list()), safe(inventory.list()), safe(suppliers.list()), safe(supplierEntries.list()), settings.get().catch(() => ({}))]);
    const fab = (st && st.fabricCalc) || {};
    const avg = Number(st && st.purchasePlan && st.purchasePlan.avgHeightCm) || DEFAULT_AVG_HEIGHT_CM;
    const p = buildPurchasePlan({ now: Date.now(), orders: ords, templates: fab.templates, fabricCfg: fab, avgHeightCm: avg, inventory: inv, suppliers: sups, entries });
    card.textContent = '';
    card.open = open === true;
    card.appendChild(el('summary', { style: { cursor: 'pointer', fontWeight: '700' } }, '🛒 اقتراح مشتريات القماش' + (p.usable && p.shortM > 0 ? ' — ينقص ≈ ' + p.shortM + ' م' : '')));
    const h = el('input', { className: 'input', type: 'number', min: '100', max: '230', value: String(avg), 'data-role': 'pp-height', style: { maxWidth: '110px' } });
    h.addEventListener('change', async () => { try { await settings.update({ purchasePlan: { avgHeightCm: Math.min(230, Math.max(100, Math.round(Number(h.value) || DEFAULT_AVG_HEIGHT_CM))) } }); await draw(true); } catch (e) { toast.danger('تعذّر الحفظ'); } });
    card.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0', fontSize: '13px' } }, [el('span', {}, 'متوسط طول زبائنك (سم):'), h]));
    if (!p.usable) { card.appendChild(el('div', { style: { fontSize: '13px', opacity: '0.8' } }, 'أضف أنواع القطع في «حاسبة القماش» ليُحسب الاحتياج من طلباتك.')); }
    else if (!p.orders) { card.appendChild(el('div', { style: { fontSize: '13px', opacity: '0.8' } }, 'لا طلبات مفتوحة حالياً.')); }
    else {
      card.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' } }, [tile('يلزم', p.needM + ' م'), tile('متوفر', p.stockM + ' م'), tile('ينقص', p.shortM + ' م', p.shortM > 0 ? '#C62828' : '#2E7D32')]));
      if (p.shortM > 0) card.appendChild(el('div', { style: { background: '#FFF3E0', borderRadius: '8px', padding: '8px', margin: '8px 0', fontSize: '13px' } }, [
        el('div', {}, '🛒 اطلب ≈ ' + p.shortM + ' م' + (p.orderBy ? ' قبل ' + dm(p.orderBy) : '')),
        p.supplier ? el('div', {}, 'أرخص مورد: ' + p.supplier.name + ' (≈ ' + p.supplier.pricePerM + ' ج/م) ⟵ تكلفة تقريبية ' + money(p.supplier.estCost)) : el('div', { style: { opacity: '0.75' } }, 'لا أسعار موردين مسجّلة بعد.'),
      ]));
      p.byTemplate.forEach((r) => card.appendChild(el('div', { style: { fontSize: '12px', opacity: '0.85' } }, '• ' + r.name + ': ' + r.pieces + ' قطعة ≈ ' + Math.round(r.meters * 100) / 100 + ' م')));
      if (p.unmatched.length) card.appendChild(el('div', { style: { fontSize: '12px', color: '#B26A00', marginTop: '6px' } }, '⚠️ لا قالب لـ: ' + p.unmatched.slice(0, 4).map((u) => u.name + ' ×' + u.qty).join('، ')));
    }
    if (p.lowItems.length) card.appendChild(el('div', { style: { fontSize: '13px', marginTop: '8px' } }, '📉 تحت الحد الأدنى: ' + p.lowItems.slice(0, 5).map((i) => i.name + ' (' + i.quantity + '/' + i.minQuantity + ')').join('، ')));
    card.appendChild(el('div', { style: { fontSize: '11px', opacity: '0.65', marginTop: '8px', lineHeight: '1.6' } }, p.assumptions.map((a) => '• ' + a).join('\n')));
  }
  try { await draw(false); } catch (e) { console.warn('[purchase-plan] failed:', e); card.appendChild(el('div', { style: { color: '#C62828' } }, 'تعذّر حساب الاقتراح')); }
  return card;
}
