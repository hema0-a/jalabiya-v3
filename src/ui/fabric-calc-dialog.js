/* ==========================================================================
   fabric-calc-dialog.js — نافذة حاسبة استهلاك القماش (v3.7.0)
   ==========================================================================
   تُفتح من حاسبة التسعير (زر «🧵 احسب استهلاك القماش»). تحسب بقالب كل نوع قطعة،
   مع هالك وتقريب اختياريين، وتدير القوالب (إضافة/تعديل/حذف). «تطبيق» يملأ الأمتار.
   تُحفظ في settings.fabricCalc (تتزامن). static imports فقط، وبناء DOM آمن.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { settings } from '../data/repos/settings.js';
import { formatEGP } from '../core/utils.js';
import { openQitanCalcDialog } from './qitan-calc-dialog.js';   /* v3.19.0: 🧵 حاسبة القيطان */
import {
  normalizeFabricConfig, normalizeTemplate, calcFabric, formulaText, newTemplateId,
  ROUND_OPTIONS, MAX_TEMPLATES, MAX_WASTE,
} from '../services/fabric-calc.js';

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('ar-EG');

async function loadConfig() {
  try { return normalizeFabricConfig((await settings.get()).fabricCalc); } catch (e) { return normalizeFabricConfig({}); }
}
async function saveConfig(cfg) {
  await settings.update({ fabricCalc: { templates: cfg.templates, wastePercent: cfg.wastePercent, roundTo: cfg.roundTo } });
}

/**
 * @param {{meterPrice?:number, onApply?:(meters:number)=>void}} [opts]
 */
export async function openFabricCalcDialog(opts = {}) {
  let cfg = await loadConfig();
  const body = el('div', { 'data-role': 'fabric-dialog' });
  let handle = null;
  let selectedId = cfg.templates[0] ? cfg.templates[0].id : null;
  let last = null;   /* آخر نتيجة */

  const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);

  /* ---------------- عرض الحاسبة ---------------- */
  function renderCalc() {
    clear(body);
    if (cfg.templates.length === 0) {
      body.appendChild(el('div', { style: { textAlign: 'center', padding: '12px', color: '#666', fontSize: '13px' } },
        'لم تسجّل أنواع قطع بعد. أضف أول نوع (مثال: جلابية رجالي: زيادة 10 · مضاعف 2 · خصم 30).'));
      body.appendChild(el('button', { className: 'btn btn--primary btn--block', type: 'button', 'data-action': 'add-type', onClick: () => renderForm(null) }, '➕ إضافة نوع قطعة'));
      body.appendChild(el('button', { className: 'btn btn--ghost btn--block', type: 'button', 'data-action': 'open-qitan', style: { marginTop: '6px' }, onClick: () => openQitanCalcDialog() }, '🧵 حاسبة القيطان'));
      return;
    }
    const sel = el('select', { className: 'select', 'data-role': 'fc-type' });
    cfg.templates.forEach((t) => {
      const o = el('option', { value: t.id }, t.name);
      if (t.id === selectedId) o.selected = true;
      sel.appendChild(o);
    });
    const height = el('input', { className: 'input', type: 'number', min: '0', step: '0.5', inputMode: 'decimal', 'data-role': 'fc-height', placeholder: 'طول العميل بالسم' });
    const qty = el('input', { className: 'input', type: 'number', min: '1', step: '1', value: '1', 'data-role': 'fc-qty' });
    const out = el('div', { 'data-role': 'fc-result', style: { marginTop: '8px' } });

    function recalc() {
      selectedId = sel.value;
      const t = cfg.templates.find((x) => x.id === selectedId);
      clear(out);
      last = null;
      if (!t) return;
      const h = num(height.value);
      if (h <= 0) { out.appendChild(el('div', { style: { color: '#888', fontSize: '13px' } }, 'أدخل طول العميل')); applyBtn.disabled = true; return; }
      const r = calcFabric(t, h, num(qty.value), cfg, num(opts.meterPrice));
      last = r;
      applyBtn.disabled = false;
      out.appendChild(el('div', { style: { background: '#F6F1E6', borderRadius: '8px', padding: '10px', lineHeight: '1.9', fontSize: '13px' } }, [
        el('div', { style: { color: '#666' } }, formulaText(t, h) + ' = ' + fmt(r.perPieceCm) + ' سم للقطعة'),
        el('div', {}, 'لكل قطعة: ' + fmt(r.perPieceM) + ' م'),
        cfg.wastePercent > 0 ? el('div', { style: { color: '#666' } }, 'شامل هالك ' + cfg.wastePercent + '%') : null,
        el('div', { style: { fontWeight: '700', fontSize: '15px', color: '#123C2F' } }, 'الإجمالي (' + r.qty + ' قطعة): ' + fmt(r.billedM) + ' متر'),
        cfg.roundTo > 0 && r.billedM !== r.totalM ? el('div', { style: { color: '#666' } }, 'قبل التقريب: ' + fmt(r.totalM) + ' م') : null,
        r.cost > 0 ? el('div', {}, 'تكلفة القماش التقديرية: ' + formatEGP(r.cost)) : null,
      ]));
    }
    sel.addEventListener('change', recalc);
    height.addEventListener('input', recalc);
    qty.addEventListener('input', recalc);

    const applyBtn = el('button', {
      className: 'btn btn--primary btn--block', type: 'button', 'data-action': 'apply-meters', disabled: 'disabled',
      style: { marginTop: '8px' },
      onClick: () => {
        if (!last) return;
        if (typeof opts.onApply === 'function') opts.onApply(last.billedM);
        if (handle) handle.close();
      },
    }, typeof opts.onApply === 'function' ? '✅ استخدم هذا العدد في حاسبة التسعير' : 'تم');
    if (typeof opts.onApply !== 'function') applyBtn.style.display = 'none';

    body.appendChild(field('نوع القطعة', sel));
    body.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [field('طول العميل (سم)', height), field('عدد القطع', qty)]));
    body.appendChild(out);
    body.appendChild(applyBtn);
    body.appendChild(el('button', { className: 'btn btn--ghost btn--block', type: 'button', 'data-action': 'open-qitan', style: { marginTop: '6px' }, onClick: () => openQitanCalcDialog() }, '🧵 حاسبة القيطان'));
    body.appendChild(el('button', { className: 'btn btn--ghost btn--block', type: 'button', 'data-action': 'manage', style: { marginTop: '6px' }, onClick: renderManage }, '⚙️ إدارة الأنواع والإعدادات'));
    recalc();
  }

  /* ---------------- إدارة الأنواع ---------------- */
  function renderManage() {
    clear(body);
    cfg.templates.forEach((t, idx) => {
      body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '6px' }, 'data-tid': t.id }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { style: { fontWeight: '600', fontSize: '13px' } }, t.name),
          el('div', { style: { fontSize: '11px', color: '#666' } }, '(الطول ' + (t.addCm < 0 ? '− ' + Math.abs(t.addCm) : '+ ' + t.addCm) + ') × ' + t.multiplier + ' − ' + t.subtractCm),
        ]),
        el('button', { className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'edit-type', onClick: () => renderForm(t) }, '✏️'),
        el('button', {
          className: 'btn btn--sm btn--danger', type: 'button', 'data-action': 'delete-type',
          onClick: async () => {
            const ok = await modal.confirm({ title: 'حذف نوع', message: 'حذف «' + t.name + '» من الحاسبة؟', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
            if (!ok) return;
            cfg = { ...cfg, templates: cfg.templates.filter((x) => x.id !== t.id) };
            if (selectedId === t.id) selectedId = cfg.templates[0] ? cfg.templates[0].id : null;
            await saveConfig(cfg);
            renderManage();
          },
        }, '🗑️'),
      ]));
    });
    if (cfg.templates.length < MAX_TEMPLATES) {
      body.appendChild(el('button', { className: 'btn btn--secondary btn--block', type: 'button', 'data-action': 'add-type', onClick: () => renderForm(null) }, '➕ إضافة نوع'));
    }
    /* الهالك والتقريب */
    const waste = el('input', { className: 'input', type: 'number', min: '0', max: String(MAX_WASTE), step: '1', value: String(cfg.wastePercent), 'data-role': 'fc-waste' });
    waste.addEventListener('change', async () => {
      cfg = normalizeFabricConfig({ ...cfg, wastePercent: waste.value });
      waste.value = String(cfg.wastePercent);
      await saveConfig(cfg);
    });
    const round = el('select', { className: 'select', 'data-role': 'fc-round' });
    ROUND_OPTIONS.forEach((v) => {
      const o = el('option', { value: String(v) }, v === 0 ? 'بدون تقريب' : 'لأعلى لأقرب ' + v + ' متر');
      if (v === cfg.roundTo) o.selected = true;
      round.appendChild(o);
    });
    round.addEventListener('change', async () => {
      cfg = normalizeFabricConfig({ ...cfg, roundTo: Number(round.value) });
      await saveConfig(cfg);
    });
    body.appendChild(el('div', { style: { marginTop: '10px' } }, [
      field('نسبة الهالك % (تُضاف على الإجمالي)', waste),
      field('تقريب الكمية المطلوبة', round),
    ]));
    body.appendChild(el('button', { className: 'btn btn--ghost btn--block', type: 'button', 'data-action': 'back', onClick: renderCalc }, '⬅️ رجوع للحاسبة'));
  }

  /* ---------------- نموذج نوع ---------------- */
  function renderForm(t) {
    clear(body);
    const name = el('input', { className: 'input', type: 'text', maxlength: '40', placeholder: 'مثال: جلابية رجالي عادي', value: t ? t.name : '', 'data-role': 'tf-name' });
    const add = el('input', { className: 'input', type: 'number', step: '0.5', value: String(t ? t.addCm : 10), 'data-role': 'tf-add' });
    const mult = el('input', { className: 'input', type: 'number', step: '0.1', value: String(t ? t.multiplier : 2), 'data-role': 'tf-mult' });
    const sub = el('input', { className: 'input', type: 'number', step: '0.5', value: String(t ? t.subtractCm : 30), 'data-role': 'tf-sub' });
    body.appendChild(field('اسم النوع *', name));
    body.appendChild(field('الزيادة على الطول (سم)', add));
    body.appendChild(field('المضاعف', mult));
    body.appendChild(field('الخصم النهائي (سم)', sub));
    body.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } }, 'المعادلة: (طول العميل + الزيادة) × المضاعف − الخصم = طول القماش بالسم'));
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button', 'data-action': 'save-type',
      onClick: async () => {
        const next = normalizeTemplate({ id: t ? t.id : newTemplateId(), name: name.value, addCm: num(add.value), multiplier: num(mult.value) || 1, subtractCm: num(sub.value) });
        if (!next) { toast.warning('اسم النوع مطلوب'); return; }
        if (cfg.templates.some((x) => x.id !== next.id && x.name === next.name)) { toast.warning('يوجد نوع بنفس الاسم'); return; }
        const list = t ? cfg.templates.map((x) => (x.id === next.id ? next : x)) : cfg.templates.concat(next);
        cfg = normalizeFabricConfig({ ...cfg, templates: list });
        selectedId = next.id;
        await saveConfig(cfg);
        toast.success('تم حفظ النوع');
        renderCalc();
      },
    }, '💾 حفظ'));
    body.appendChild(el('button', { className: 'btn btn--ghost btn--block', type: 'button', 'data-action': 'back', style: { marginTop: '6px' }, onClick: () => (cfg.templates.length ? renderManage() : renderCalc()) }, 'إلغاء'));
  }

  renderCalc();
  handle = modal.open({ title: '🧵 حاسبة استهلاك القماش', body, actions: [] });
  return handle;
}
