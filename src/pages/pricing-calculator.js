/* ==========================================================================
   pricing-calculator.js — حاسبة تسعير الجلابية
   ==========================================================================
   - تقرأ الإعدادات (pricingCalculator) لإظهار/إخفاء الحقول.
   - حساب فوري عند تغيير أي حقل.
   - حفظ السجل في localStorage (V3_PRICING_HISTORY).
   - زر "إنشاء طلب" لفتح صفحة الطلبات مع السعر.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';
import { settings } from '../data/repos/settings.js';
import {
  DEFAULT_SETTINGS, STORAGE_KEYS,
} from '../core/config.js';
import { formatEGP, formatDate } from '../core/utils.js';

/* --- حالة الصفحة --- */
let state = {
  container: null,
  config: { ...DEFAULT_SETTINGS.pricingCalculator },
  inputs: {
    description: '',
    meters: 3,
    meterPrice: 0,
    extras: 0,
    hours: 0,
    hourlyRate: 0,
    overhead: 0,
    margin: 30,
  },
  history: [],
};

/* ==========================================================================
   1. الحساب (مُصدَّرة للاختبار)
   ========================================================================== */

/**
 * حساب نتائج التسعير بناءً على المدخلات والإعدادات.
 * @param {Object} inputs
 * @param {Object} config
 * @returns {{fabricCost:number, laborCost:number, extrasCost:number, overheadCost:number, totalCost:number, profit:number, sellingPrice:number}}
 */
export function computePricing(inputs, config) {
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

  const fabricCost = config.enableFabric
    ? num(inputs.meters) * num(inputs.meterPrice)
    : 0;
  const laborCost = config.enableLabor
    ? num(inputs.hours) * num(inputs.hourlyRate)
    : 0;
  const extrasCost = config.enableExtras ? num(inputs.extras) : 0;
  const overheadCost = config.enableOverhead ? num(inputs.overhead) : 0;

  const totalCost = fabricCost + laborCost + extrasCost + overheadCost;
  const margin = num(inputs.margin);
  const profit = totalCost * (margin / 100);
  const sellingPrice = totalCost + profit;

  return {
    fabricCost,
    laborCost,
    extrasCost,
    overheadCost,
    totalCost,
    profit,
    sellingPrice,
  };
}

/* ==========================================================================
   2. السجل (localStorage)
   ========================================================================== */

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.V3_PRICING_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    const max = state.config.maxHistoryItems || 50;
    const trimmed = state.history.slice(0, max);
    localStorage.setItem(STORAGE_KEYS.V3_PRICING_HISTORY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[pricing] save history failed:', e);
  }
}

/* ==========================================================================
   3. قراءة القيم من الحقول
   ========================================================================== */

function readInputs() {
  const c = state.container;
  if (!c) return;
  const q = (id) => c.querySelector('#' + id);

  const descEl = q('pc-description');
  const metersEl = q('pc-meters');
  const meterPriceEl = q('pc-meter-price');
  const extrasEl = q('pc-extras');
  const hoursEl = q('pc-hours');
  const hourlyRateEl = q('pc-hourly-rate');
  const overheadEl = q('pc-overhead');
  const marginEl = q('pc-margin');

  if (descEl)      state.inputs.description = descEl.value;
  if (metersEl)    state.inputs.meters = Number(metersEl.value) || 0;
  if (meterPriceEl) state.inputs.meterPrice = Number(meterPriceEl.value) || 0;
  if (extrasEl)    state.inputs.extras = Number(extrasEl.value) || 0;
  if (hoursEl)     state.inputs.hours = Number(hoursEl.value) || 0;
  if (hourlyRateEl) state.inputs.hourlyRate = Number(hourlyRateEl.value) || 0;
  if (overheadEl)  state.inputs.overhead = Number(overheadEl.value) || 0;
  if (marginEl)    state.inputs.margin = Number(marginEl.value) || 0;
}

/* ==========================================================================
   4. بناء الحقول
   ========================================================================== */

function numberField(id, label, value, placeholder = '0', step = '0.5', hint = '') {
  const inp = el('input', {
    className: 'input',
    type: 'number',
    id,
    min: '0',
    step,
    placeholder,
  });
  inp.value = String(value);
  return el('div', { className: 'settings-field' }, [
    el('label', { className: 'settings-field__label' }, label),
    inp,
    hint ? el('div', { className: 'settings-field__hint' }, hint) : null,
  ]);
}

function buildDescriptionField() {
  const inp = el('input', {
    className: 'input', type: 'text', id: 'pc-description',
    placeholder: 'مثال: جلابية سادة رجالي',
  });
  inp.value = state.inputs.description || '';
  return el('div', { className: 'settings-field' }, [
    el('label', { className: 'settings-field__label' }, '📝 نوع الجلابية / الوصف'),
    inp,
  ]);
}

function buildFabricFields() {
  const wrap = el('div', { className: 'card', style: { marginBottom: '12px' } });
  wrap.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🧵 تكاليف القماش والخامات'),
  ]));
  wrap.appendChild(numberField('pc-meters', 'الأمتار المطلوبة', state.inputs.meters, '3', '0.5'));
  wrap.appendChild(numberField('pc-meter-price', 'سعر المتر (ج.م)', state.inputs.meterPrice, '0'));
  wrap.appendChild(numberField('pc-extras', 'تكاليف إضافية (خيوط، أزرار، إلخ)', state.inputs.extras, '0'));
  return wrap;
}

function buildLaborFields() {
  const wrap = el('div', { className: 'card', style: { marginBottom: '12px' } });
  wrap.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '👷 أجور العمال'),
  ]));
  wrap.appendChild(numberField('pc-hours', 'ساعات العمل', state.inputs.hours, '0', '0.5'));
  wrap.appendChild(numberField('pc-hourly-rate', 'سعر الساعة (ج.م)', state.inputs.hourlyRate, '0'));
  return wrap;
}

function buildOverheadField() {
  const wrap = el('div', { className: 'card', style: { marginBottom: '12px' } });
  wrap.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '💸 المصاريف غير المباشرة'),
  ]));
  wrap.appendChild(numberField('pc-overhead', 'إيجار، كهرباء، إلخ (ج.م)', state.inputs.overhead, '0'));
  return wrap;
}

function buildMarginField() {
  const wrap = el('div', { className: 'card', style: { marginBottom: '12px' } });
  wrap.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📈 هامش الربح'),
  ]));

  wrap.appendChild(numberField('pc-margin', 'هامش الربح المطلوب (%)', state.inputs.margin, '30', '1'));

  /* أزرار النسب الجاهزة */
  const presets = Array.isArray(state.config.marginPresets) && state.config.marginPresets.length > 0
    ? state.config.marginPresets
    : [20, 30, 50, 100];

  const presetWrap = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' },
  });
  presets.forEach((p) => {
    presetWrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm btn--ghost',
      'data-preset': String(p),
      onClick: () => {
        const inp = state.container.querySelector('#pc-margin');
        if (inp) { inp.value = String(p); }
        state.inputs.margin = p;
        refreshResults();
      },
    }, p + '%'));
  });
  wrap.appendChild(presetWrap);

  return wrap;
}

/* ==========================================================================
   5. بطاقة النتائج
   ========================================================================== */

function buildResultsCard() {
  const card = el('div', {
    id: 'pc-results',
    style: {
      background: 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
      color: '#fff',
      borderRadius: '16px',
      padding: '16px',
      marginBottom: '16px',
      boxShadow: '0 4px 12px rgba(31, 109, 87, 0.25)',
    },
  });

  /* سعر البيع */
  card.appendChild(el('div', { style: { fontSize: '13px', opacity: '0.9', textAlign: 'center' } },
    '💰 سعر البيع المقترح'));
  card.appendChild(el('div', {
    id: 'pc-selling-price',
    style: {
      fontSize: '32px',
      fontWeight: '700',
      textAlign: 'center',
      margin: '6px 0 12px 0',
    },
  }, '0 ج.م'));

  /* فاصل */
  card.appendChild(el('div', {
    style: { height: '1px', background: 'rgba(255,255,255,0.2)', margin: '12px 0' },
  }));

  /* التفاصيل */
  const detail = el('div', {
    id: 'pc-details',
    style: { fontSize: '12px', lineHeight: '1.8' },
  });
  card.appendChild(detail);

  /* أزرار */
  const actions = el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '12px' },
  });
  actions.appendChild(el('button', {
    className: 'btn btn--accent btn--block',
    type: 'button',
    onClick: () => saveCurrentCalculation(),
  }, '💾 حفظ الحساب'));
  if (state.config.enableCreateOrder !== false) {
    actions.appendChild(el('button', {
      className: 'btn btn--secondary btn--block',
      type: 'button',
      style: { background: '#fff', color: '#1F6D57' },
      onClick: () => createOrderFromCalculation(),
    }, '📋 إنشاء طلب'));
  }
  card.appendChild(actions);

  return card;
}

function refreshResults() {
  const c = state.container;
  if (!c) return;

  const r = computePricing(state.inputs, state.config);

  const sellingEl = c.querySelector('#pc-selling-price');
  if (sellingEl) sellingEl.textContent = formatEGP(r.sellingPrice);

  const detailEl = c.querySelector('#pc-details');
  if (detailEl) {
    clear(detailEl);
    const rows = [
      ['🧵 تكلفة القماش:', r.fabricCost],
      ['👷 أجر العمال:', r.laborCost],
      ['📦 إضافات:', r.extrasCost],
      ['💸 مصاريف غير مباشرة:', r.overheadCost],
      ['━━━ إجمالي التكلفة:', r.totalCost],
      ['📈 الربح (' + state.inputs.margin + '%):', r.profit],
    ];
    rows.forEach(([label, val]) => {
      if (label.startsWith('━━━')) {
        detailEl.appendChild(el('div', {
          style: { display: 'flex', justifyContent: 'space-between', paddingTop: '6px', marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.2)', fontWeight: '600' },
        }, [el('span', {}, label), el('span', {}, formatEGP(val))]));
      } else {
        detailEl.appendChild(el('div', {
          style: { display: 'flex', justifyContent: 'space-between' },
        }, [el('span', {}, label), el('span', {}, formatEGP(val))]));
      }
    });
  }
}

/* ==========================================================================
   6. الأحداث (Live calc)
   ========================================================================== */

function bindLiveCalc() {
  const c = state.container;
  if (!c) return;
  const ids = ['pc-meters', 'pc-meter-price', 'pc-extras', 'pc-hours', 'pc-hourly-rate', 'pc-overhead', 'pc-margin'];
  ids.forEach((id) => {
    const inp = c.querySelector('#' + id);
    if (!inp) return;
    inp.addEventListener('input', () => {
      readInputs();
      refreshResults();
    });
  });
}

/* ==========================================================================
   7. حفظ الحساب
   ========================================================================== */

function saveCurrentCalculation() {
  const r = computePricing(state.inputs, state.config);
  if (r.sellingPrice <= 0) {
    toast.warning('أدخل بيانات صحيحة أولاً');
    return;
  }

  const item = {
    id: 'calc_' + Date.now(),
    description: state.inputs.description || 'بدون وصف',
    inputs: { ...state.inputs },
    results: r,
    savedAt: Date.now(),
  };

  state.history.unshift(item);
  saveHistory();
  toast.success('تم حفظ الحساب');
  renderHistory();
}

/* ==========================================================================
   8. إنشاء طلب
   ========================================================================== */

function createOrderFromCalculation() {
  const r = computePricing(state.inputs, state.config);
  if (r.sellingPrice <= 0) {
    toast.warning('أدخل بيانات صحيحة أولاً');
    return;
  }
  const desc = state.inputs.description || 'طلب من الحاسبة';
  modal.confirm({
    title: 'إنشاء طلب',
    message: 'سيتم فتح صفحة الطلبات مع تعبئة المبلغ (' + formatEGP(r.sellingPrice) + '). هل تريد المتابعة؟',
    confirmText: 'متابعة',
    cancelText: 'إلغاء',
  }).then((ok) => {
    if (!ok) return;
    try {
      sessionStorage.setItem('jalabiya_v3_new_order_prefill', JSON.stringify({
        amount: r.sellingPrice,
        notes: desc,
      }));
    } catch {}
    location.hash = '#/orders';
  });
}

/* ==========================================================================
   9. سجل الحسابات
   ========================================================================== */

function renderHistory() {
  const c = state.container;
  if (!c) return;
  const wrap = c.querySelector('#pc-history');
  if (!wrap) return;
  clear(wrap);

  if (state.history.length === 0) {
    wrap.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا توجد حسابات محفوظة بعد.'));
    return;
  }

  state.history.slice(0, 20).forEach((item) => {
    const row = el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        cursor: 'pointer',
      },
      onClick: () => {
        state.inputs = { ...item.inputs };
        renderPage();
        toast.info('تم تحميل الحساب');
      },
    });
    row.appendChild(el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } },
      item.description));
    row.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginTop: '2px' },
    }, formatEGP(item.results.sellingPrice) +
       ' | التكلفة: ' + formatEGP(item.results.totalCost) +
       ' | الربح: ' + formatEGP(item.results.profit)));
    row.appendChild(el('div', {
      style: { fontSize: '11px', color: '#2E8B6F', marginTop: '2px' },
    }, '📅 ' + formatDate(item.savedAt)));
    wrap.appendChild(row);
  });
}

function clearHistory() {
  modal.confirm({
    title: 'مسح السجل',
    message: 'سيتم حذف كل الحسابات المحفوظة. متابعة؟',
    confirmText: 'مسح',
    cancelText: 'إلغاء',
    danger: true,
  }).then((ok) => {
    if (!ok) return;
    state.history = [];
    saveHistory();
    toast.success('تم مسح السجل');
    renderHistory();
  });
}

/* ==========================================================================
   10. بناء الصفحة
   ========================================================================== */

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  /* الرأس */
  c.appendChild(el('div', {
    style: { textAlign: 'center', marginBottom: '16px' },
  }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '🧮 حاسبة تسعير الجلابية'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'احسب سعر البيع المناسب'),
  ]));

  /* الوصف */
  c.appendChild(buildDescriptionField());

  /* الحقول حسب الإعدادات */
  if (state.config.enableFabric) c.appendChild(buildFabricFields());
  if (state.config.enableLabor) c.appendChild(buildLaborFields());
  if (state.config.enableOverhead) c.appendChild(buildOverheadField());
  c.appendChild(buildMarginField());

  /* النتائج */
  c.appendChild(buildResultsCard());

  /* السجل */
  if (state.config.saveHistory !== false) {
    const histCard = el('div', { className: 'card', style: { marginBottom: '16px' } });
    histCard.appendChild(el('div', {
      className: 'card__header',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    }, [
      el('h3', { className: 'card__title' }, '📋 سجل الحسابات'),
      el('button', {
        className: 'btn btn--sm btn--ghost',
        type: 'button',
        onClick: () => clearHistory(),
      }, '🗑️ مسح'),
    ]));
    histCard.appendChild(el('div', { id: 'pc-history' }));
    c.appendChild(histCard);
  }

  /* ربط الأحداث */
  bindLiveCalc();
  refreshResults();
  renderHistory();
}

/* ==========================================================================
   11. API عام
   ========================================================================== */

export const pricingCalculatorPage = {
  async render(container) {
    clear(container);
    state.container = container;

    /* قراءة الإعدادات */
    try {
      const s = await settings.get();
      state.config = { ...DEFAULT_SETTINGS.pricingCalculator, ...(s.pricingCalculator || {}) };
    } catch {
      state.config = { ...DEFAULT_SETTINGS.pricingCalculator };
    }

    /* الهامش الافتراضي */
    state.inputs.margin = Number(state.config.defaultMargin) || 30;

    /* السجل */
    state.history = loadHistory();

    renderPage();
  },

  destroy() {
    state = {
      container: null,
      config: { ...DEFAULT_SETTINGS.pricingCalculator },
      inputs: {
        description: '',
        meters: 3,
        meterPrice: 0,
        extras: 0,
        hours: 0,
        hourlyRate: 0,
        overhead: 0,
        margin: 30,
      },
      history: [],
    };
  },
};
