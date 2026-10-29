/* ==========================================================================
   orders-form.js — نموذج إضافة/تعديل الطلب (openOrderForm) + وضع الإدخال السريع + المسودة التلقائية (v3.5.6)
   ==========================================================================
   مقتطع من orders.js حرفياً دون أي تقسيم داخلي (تقسيم صيانة فقط). API: openOrderForm(ctx, existing = null).
   السطران الأولان في الدالة يربطان state وrefreshAll من ctx؛ الجسم كما كان.
   ملاحظة: capOrders = state.orders لقطة وقت الفتح (مقصودة) وتُستبدل بقراءة حديثة من القاعدة.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { saveFailMessage } from '../core/save-error.js';
import { uid, formatEGP, formatDate, parseDateInput, localDateInput, toNonNegative } from '../core/utils.js';
import { orders } from '../data/repos/orders.js';
import { payments as paymentsRepoForDelete } from '../data/repos/payments.js';
import { modal, confirmIfStale } from '../ui/modal.js';
import { createCollapsible } from '../ui/collapsible.js';
import { toast } from '../ui/toast.js';
import { createOrderImagePicker } from '../ui/order-image-picker.js';
import { getOrderMedia } from '../data/repos/order-media.js';
import { hasReferenceImage } from '../services/order-media.js';
import { thumbFromDataUrl } from '../services/image-compressor.js';
import { orderPaidBreakdown, overpaidBy } from '../services/payments-view.js';
import { createCustomerPicker } from '../ui/customer-picker.js';
import { newOrderNotifyAction } from '../services/status-notify.js';
import { suggestDueDate, planOrder, isValidWorkPlan } from '../services/order-scheduler.js';
import { buildItemCatalog } from '../services/item-catalog.js';
import { describeChosenDay } from '../services/capacity-strip.js';
import { buildCapacityStripView } from '../ui/capacity-strip-view.js';
import { sanitizeDeliveries, completeRemaining } from '../services/partial-delivery.js';
import * as draft from '../services/draft-manager.js';
import { orderProfit } from '../services/order-profit.js';
import { MAX_AMOUNT, CONFIRM_AMOUNT } from '../services/amount-guard.js';
import { STATUS_MAP, STATUS_ORDER, computeTotals, discountPercentOf, isDiscountExcessive, MAX_DISCOUNT_PERCENT, itemsFromOrder } from './orders-logic.js';
import { buildItemRow, buildFeeRow } from './orders-item-rows.js';

/* --- مفاتيح المسودات --- */
const DRAFT_KEY = 'order-form';

/* --- وضع الإدخال السريع (v3.3.42) --- */
const FORM_MODE_KEY = 'jalabiya_v3_order_form_mode';
function readFormMode() {
  try { return localStorage.getItem(FORM_MODE_KEY) === 'quick' ? 'quick' : 'full'; } catch { return 'full'; }
}
function writeFormMode(m) {
  try { localStorage.setItem(FORM_MODE_KEY, m); } catch { /* ignore */ }
}

export function openOrderForm(ctx, existing = null) {
  const { state } = ctx;
  const refreshAll = ctx.refresh;
  const isEdit = existing !== null;
  let draftDone = false;   /* بعد الحفظ الناجح لا تُعاد كتابة المسودة عند إغلاق النافذة */

  /* اختيار بالبحث (اسم/هاتف) بدل قائمة طويلة — بنفس واجهة .value */
  const customerSelect = createCustomerPicker({ customers: state.customers, value: isEdit ? existing.customerId : '' });

  const statusSelect = el('select', { className: 'select' });
  STATUS_ORDER.forEach((s) => {
    statusSelect.appendChild(el('option', { value: s }, STATUS_MAP[s].label));
  });
  statusSelect.value = isEdit ? existing.status : 'pending';

  const receivedDateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.receivedDate) {
    receivedDateInput.value = localDateInput(existing.receivedDate);
  }

  const dueDateInput = el('input', { className: 'input', type: 'date', 'aria-label': 'تاريخ التسليم' });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = localDateInput(existing.dueDate);
  }

  /* آخر خطة عمل اقترحها زر ✨ (تُحفظ مع الطلب إن بقي المبلغ والتاريخ كما هما) */
  let suggestedPlan = null;

  /* لقطة الطلبات لحسابات السعة داخل هذا النموذج (v3.3.71).
     state.orders لقطة وقت آخر تحميل للصفحة: لا ترى طلباً وصل بعدها (مزامنة سحابية من جهاز آخر،
     أو تبويب ثانٍ، أو حفظ من شاشة أخرى)، فكان الاقتراح يقترح يوماً صار ممتلئاً. لذلك نعيد القراءة
     من قاعدة البيانات عند فتح النموذج، وقبل الاقتراح، وقبل بناء خطة الحفظ. */
  let capOrders = state.orders;
  let capSeq = 0;        /* رقم آخر قراءة بدأت */
  let capApplied = 0;    /* رقم آخر قراءة طُبِّقت (لا تُطبَّق قراءة أقدم بعد أحدث) */
  /**
   * إعادة قراءة الطلبات من القاعدة وتحديث لقطة النموذج.
   * @returns {Promise<Array>} أحدث لقطة متاحة (القديمة إن فشلت القراءة)
   */
  const refreshCapOrders = async () => {
    const seq = ++capSeq;
    try {
      const list = await orders.list();
      if (Array.isArray(list) && seq > capApplied) { capApplied = seq; capOrders = list; }
    } catch (e) { /* نكتفي باللقطة الحالية */ }
    return capOrders;
  };

  /* نتيجة الاقتراح تظهر تحت الحقل نفسه (بدل إشعارات عائمة تختفي وتتراكب مع النموذج) */
  const dueHint = el('div', { className: 'order-hint', role: 'status', 'aria-live': 'polite' });
  const setHint = (lines, warn) => {
    clear(dueHint);
    dueHint.classList.toggle('order-hint--warn', !!warn);
    lines.forEach((l) => dueHint.appendChild(el('div', {}, l)));
  };
  dueDateInput.addEventListener('input', () => setHint([]));

  /* مبلغ الطلب الجاري (يُحسب عند الحاجة فقط) */
  const currentOrderAmount = () => {
    try {
      const its = Array.from(itemsContainer.children).map((r) => r._getValues());
      const fs = Array.from(feesContainer.children).map((r) => r._getValues());
      return Number(computeTotals(its, discountTypeSelect.value, discountValueInput.value, fs).amount) || 0;
    } catch (e) { return 0; }
  };
  const capConfig = () => ({
    dailyOrderLimit: state.scheduleConfig.dailyOrderLimit,
    dayOffWeekday: state.scheduleConfig.dayOffWeekday,
    excludeOrderId: existing ? existing.id : null,
    orderAmount: currentOrderAmount(),
  });
  const dueTsOf = () => (dueDateInput.value ? new Date(dueDateInput.value + 'T12:00:00').getTime() : null);
  const capStrip = buildCapacityStripView({
    getOrders: () => capOrders,
    getConfig: capConfig,
    getSelectedTs: dueTsOf,
    onPick: (ts) => {
      dueDateInput.value = localDateInput(ts);
      dueDateInput.dispatchEvent(new Event('change', { bubbles: true }));   /* يحفظ المسودة + يُظهر ملاحظة اليوم */
    },
  });
  /* اختيار يدوي لتاريخ: تنبيه إن كان اليوم مزدحماً أو إجازة */
  dueDateInput.addEventListener('change', () => {
    const ts = dueTsOf();
    if (ts == null) { capStrip.refresh(); return; }
    const d = describeChosenDay(capOrders, capConfig(), ts);
    if (d.level !== 'none') setHint([d.text], d.level !== 'ok');
    capStrip.refresh();
  });

  const suggestBtn = el('button', {
    className: 'btn btn--sm btn--secondary btn--block', type: 'button',
    title: 'اقتراح أقرب موعد تسليم يناسب الحد اليومي',
    onClick: async () => {
      suggestBtn.disabled = true;   /* يمنع ضغطتين متتاليتين أثناء القراءة */
      try {
        const _items = Array.from(itemsContainer.children).map((r) => r._getValues());
        const _fees = Array.from(feesContainer.children).map((r) => r._getValues());
        const _t = computeTotals(_items, discountTypeSelect.value, discountValueInput.value, _fees);
        const _orderAmount = Number(_t.amount) || 0;
        const latestOrders = await refreshCapOrders();
        const suggestion = suggestDueDate(latestOrders, {
          dayOffWeekday: state.scheduleConfig.dayOffWeekday,
          dailyOrderLimit: state.scheduleConfig.dailyOrderLimit,
          minDays: 1, maxLookaheadDays: 60,
          excludeOrderId: existing ? existing.id : null,
          orderAmount: _orderAmount,
        });
        dueDateInput.value = localDateInput(suggestion.timestamp);
        dueDateInput.dispatchEvent(new Event('change', { bubbles: true }));   /* يحفظ المسودة */
        suggestedPlan = { amount: _orderAmount, dueTs: suggestion.timestamp, plan: suggestion.workPlan || [] };
        const lines = ['💡 ' + suggestion.reason + ': ' + formatDate(suggestion.timestamp)];
        if (suggestion.daysUsed > 1) {
          lines.push((suggestion.overLimit ? '⚠️ الطلب أكبر من الحد اليومي — ' : 'ℹ️ السعة المتبقية موزّعة — ') +
            'يُنفَّذ على ' + suggestion.daysUsed + ' أيام عمل: يبدأ ' + formatDate(suggestion.startTimestamp) +
            ' وينتهي ' + formatDate(suggestion.timestamp));
        }
        setHint(lines, suggestion.overLimit);
        capStrip.refresh();   /* الشريط يعكس نفس اللقطة الحديثة */
      } catch (e) { setHint(['تعذّر اقتراح موعد — اختر التاريخ يدوياً'], true); }
      finally { suggestBtn.disabled = false; }
    },
  }, '✨ اقتراح أقرب موعد متاح');

  /* تحديث الشريط بعد فتح النموذج بقراءة حديثة (لا يعطّل فتح النموذج) */
  refreshCapOrders().then(() => { try { capStrip.refresh(); } catch (e) { /* النموذج أُغلق */ } });

  /* --- الصورة المرجعية --- */
  /* الصورة المضمَّنة القديمة تظهر فوراً؛ المفصولة (orderMedia) تُحمَّل بعد فتح النموذج بلا تعطيله (v3.3.87).
     loadedRef = ما حُمِّل (للمقارنة عند الحفظ فلا تُعاد كتابة صورة لم تتغيّر)، وrefReady = اكتمل التحميل
     (قبله لا نكتب الصورة أبداً، فلا يُحذف وسيط بسبب حفظ سريع قبل وصوله). */
  const inlineRef = isEdit ? (existing.referenceImage || '') : '';
  const imagePicker = createOrderImagePicker({
    value: inlineRef,
    label: '🖼️ صورة مرجعية',
    hint: 'صورة الموديل المطلوب (اختياري)',
  });
  let loadedRef = inlineRef;
  let refReady = !isEdit || !!inlineRef || !hasReferenceImage(existing);
  if (!refReady) {
    getOrderMedia(existing, 'ref').then((v) => {
      loadedRef = v || '';
      if (loadedRef && !imagePicker.getValue()) imagePicker.setValue(loadedRef);
    }).catch((e) => console.warn('[orders] تعذّر تحميل الصورة المرجعية', e)).finally(() => { refReady = true; });
  }

  /* --- البنود --- */
  const itemsContainer = el('div', {});
  const initialItems = isEdit ? itemsFromOrder(existing) : [{ id: uid(), name: '', price: 0, quantity: 1 }];

  /* قائمة البنود المنسدلة: أنواع الإعدادات + أسماء الطلبات السابقة (بدون الطلب الجاري تعديله) */
  const itemCatalog = buildItemCatalog(state.jalabiyaTypes, state.orders.filter((o) => !existing || o.id !== existing.id));

  function addItemRow(item) {
    const row = buildItemRow(item, (r) => {
      if (itemsContainer.children.length <= 1) { toast.warning('يجب بند واحد على الأقل'); return; }
      itemsContainer.removeChild(r);
      recalc();
    }, itemCatalog);
    itemsContainer.appendChild(row);
  }

  initialItems.forEach((it) => addItemRow(it));

  const addItemBtn = el('button', {
    className: 'btn btn--sm btn--secondary btn--block', type: 'button', 'data-full': '1',
    onClick: () => {
      addItemRow({ id: uid(), name: '', price: 0, quantity: 1 }); recalc();
      /* جاهز للاختيار فوراً: القائمة المنسدلة إن وُجدت (وتُفتح مباشرة حيث يدعم المتصفح)، وإلا حقل الكتابة */
      const lastRow = itemsContainer.lastElementChild;
      const sel = lastRow?.querySelector('select');
      if (sel) { sel.focus(); try { sel.showPicker && sel.showPicker(); } catch (e) { /* اختياري */ } }
      else lastRow?.querySelector('input')?.focus();
    },
  }, '➕ إضافة بند');

  /* --- الخصم --- */
  const discountTypeSelect = el('select', { className: 'select' });
  [
    { v: 'none',    l: 'بدون خصم' },
    { v: 'percent', l: 'خصم %' },
    { v: 'fixed',   l: 'خصم ثابت (ج.م)' },
  ].forEach((o) => {
    const opt = el('option', { value: o.v }, o.l);
    if (isEdit ? (existing.discountType || 'none') === o.v : o.v === 'none') opt.selected = true;
    discountTypeSelect.appendChild(opt);
  });

  const discountValueInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.discountValue || '') : '',
    style: { marginTop: '6px', display: (isEdit && existing.discountType && existing.discountType !== 'none') ? '' : 'none' },
  });

  discountTypeSelect.addEventListener('change', () => {
    discountValueInput.style.display = discountTypeSelect.value === 'none' ? 'none' : '';
    recalc();
  });
  discountValueInput.addEventListener('input', recalc);

  /* --- الرسوم الإضافية --- */
  const feesContainer = el('div', {});
  const initialFees = isEdit && Array.isArray(existing.extraFees) ? existing.extraFees : [];

  function addFeeRow(fee) {
    const row = buildFeeRow(fee, (r) => { feesContainer.removeChild(r); recalc(); });
    feesContainer.appendChild(row);
  }

  initialFees.forEach((f) => addFeeRow(f));

  const addFeeBtn = el('button', {
    className: 'btn btn--sm btn--secondary', type: 'button',
    onClick: () => { addFeeRow({ id: uid(), feeType: 'urgency', type: 'percent', value: 20 }); recalc(); },
  }, '➕ إضافة رسم');

  /* --- عاجل (v3.3.51): شارة حمراء + يتقدّم القوائم + يقترح رسم استعجال --- */
  const urgentInput = el('input', { type: 'checkbox' });
  urgentInput.checked = !!(isEdit && existing.urgent);
  urgentInput.addEventListener('change', () => {
    if (!urgentInput.checked) return;
    const hasUrgencyFee = Array.from(feesContainer.children).some((r) => {
      try { return r._getValues().feeType === 'urgency'; } catch { return false; }
    });
    if (!hasUrgencyFee) {
      addFeeRow({ id: uid(), feeType: 'urgency', type: 'percent', value: 20 });
      recalc();
      toast.info('⚡ أُضيف رسم استعجال 20% — عدّله أو احذفه من «رسوم إضافية»');
    }
  });
  const urgentField = el('label', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: '#B3261E', padding: '6px 0' },
  }, [urgentInput, el('span', {}, '⚡ طلب عاجل')]);

  /* --- المقدم --- */
  const depositInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.deposit || '') : '',
  });
  depositInput.addEventListener('input', recalc);

  /* --- تكلفة الطلب (اختياري — لحساب الربح التقديري) --- */
  const costInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: 'قماش + خيط + أجر (اختياري)',
    value: isEdit ? (existing.cost || '') : '',
  });
  costInput.addEventListener('input', recalc);

  /* --- الملاحظات --- */
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  /* --- ملخص الحساب --- */
  const totalsSummary = el('div', {
    style: { padding: '12px', background: '#F6F1E6', borderRadius: '8px', fontSize: '13px', lineHeight: '1.8' },
  });

  function recalc() {
    capStrip.refresh();
    const items = Array.from(itemsContainer.children).map((r) => r._getValues());
    const fees = Array.from(feesContainer.children).map((r) => r._getValues());
    const t = computeTotals(items, discountTypeSelect.value, discountValueInput.value, fees);
    const deposit = toNonNegative(depositInput.value);
    const remaining = Math.max(0, t.amount - deposit);

    clear(totalsSummary);
    const row = (lbl, val, color) => el('div', {
      style: { display: 'flex', justifyContent: 'space-between', color: color || '#123C2F' },
    }, [el('span', {}, lbl), el('span', { style: { fontWeight: '600' } }, val)]);

    totalsSummary.appendChild(row('المجموع الفرعي:', formatEGP(t.subtotal)));
    if (t.discountAmount > 0) totalsSummary.appendChild(row('الخصم:', '− ' + formatEGP(t.discountAmount) + ' (' + discountPercentOf(t) + '%)', '#C62828'));
    if (isDiscountExcessive(t)) {
      totalsSummary.appendChild(el('div', { className: 'order-hint order-hint--warn', role: 'alert' },
        '⚠️ الخصم أعلى من ' + MAX_DISCOUNT_PERCENT + '% من المجموع — تأكد من الرقم'));
    }
    if (t.extraFeesTotal > 0) totalsSummary.appendChild(row('الرسوم الإضافية:', '+ ' + formatEGP(t.extraFeesTotal), '#F57C00'));
    totalsSummary.appendChild(row('الإجمالي:', formatEGP(t.amount)));
    if (deposit > 0) totalsSummary.appendChild(row('المقدم:', '− ' + formatEGP(deposit), '#2E7D32'));
    totalsSummary.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5DDD0', marginTop: '6px', paddingTop: '6px', fontWeight: '700' },
    }, [
      el('span', {}, 'المتبقي:'),
      el('span', { style: { color: remaining > 0 ? '#F57C00' : '#2E7D32' } }, formatEGP(remaining)),
    ]));
    const pr = orderProfit({ amount: t.amount, cost: costInput.value });
    if (pr.hasCost) {
      totalsSummary.appendChild(row('الربح التقديري:',
        formatEGP(pr.profit) + ' (' + pr.margin + '%)', pr.profit < 0 ? '#C62828' : '#2E7D32'));
    }
  }

  /* --- body: الأساسيات أولاً، والباقي في «خيارات إضافية» (مطوي) --- */
  const fieldOf = (label, ...nodes) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), ...nodes]);

  const statusField = fieldOf('الحالة', statusSelect);

  /* القسم الإضافي يُفتح تلقائياً إن كان فيه بيانات (تعديل طلب موجود) */
  const hasExtras = isEdit && (
    (existing.discountType && existing.discountType !== 'none' && Number(existing.discountValue) > 0) ||
    (Array.isArray(existing.extraFees) && existing.extraFees.length > 0) ||
    Number(existing.cost) > 0 || !!existing.notes || hasReferenceImage(existing) || !!existing.receivedDate || !!existing.urgent
  );
  /* «خيارات إضافية»: المكوّن الموحّد createCollapsible بنمط dashed (v3.5.4) — بدل <details> الأصلي.
     persist:false لأن الفتح يتبع بيانات الطلب (hasExtras) لا آخر اختيار محفوظ. extras.open يعمل كما في <details>. */
  const extrasUi = createCollapsible({
    id: 'order-extras-' + (isEdit ? existing.id : 'new'),
    className: 'order-extras',
    variant: 'dashed',
    persist: false,
    title: '⚙️ خيارات إضافية',
    summary: 'خصم · رسوم · تكلفة · ملاحظات · صورة',
    defaultOpen: hasExtras,
    content: el('div', {}, [
      ...(isEdit ? [] : [statusField]),
      urgentField,
      fieldOf('📥 تاريخ استلام القماش', receivedDateInput),
      fieldOf('🎁 خصم', discountTypeSelect, discountValueInput),
      fieldOf('➕ رسوم إضافية', feesContainer, addFeeBtn),
      fieldOf('🧵 التكلفة (لحساب الربح)', costInput),
      fieldOf('📝 ملاحظات', notesInput),
      imagePicker.node,
    ]),
  });
  const extras = extrasUi.node;

  const depositField = fieldOf('💰 المقدم (ج.م)', depositInput);
  depositField.setAttribute('data-full', '1');
  extras.setAttribute('data-full', '1');

  /* مبدّل الوضع: «سريع» = العميل + البند + التاريخ فقط (للزحام)، «كامل» = كل الحقول. للطلب الجديد فقط */
  const modeBtn = (key, label) => el('button', {
    type: 'button', className: 'btn btn--sm order-mode__btn', 'data-mode': key,
    onClick: () => setMode(key),
  }, label);
  const quickBtn = modeBtn('quick', '⚡ سريع');
  const fullBtn = modeBtn('full', '📋 كامل');
  const modeBar = el('div', { className: 'order-mode', role: 'group', 'aria-label': 'وضع النموذج' }, [quickBtn, fullBtn]);

  const body = el('div', { className: 'order-form' }, [
    ...(isEdit ? [] : [modeBar]),
    fieldOf('العميل *', customerSelect),
    ...(isEdit ? [statusField] : []),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '📦 بنود الطلب'),
      itemsContainer, addItemBtn,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '📅 تاريخ التسليم'),
      dueDateInput, suggestBtn, dueHint, capStrip,
    ]),
    depositField,
    extras,
    totalsSummary,
  ]);

  function setMode(m, persist = true) {
    const quick = !isEdit && m === 'quick';
    body.classList.toggle('order-form--quick', quick);
    quickBtn.setAttribute('aria-pressed', String(quick));
    fullBtn.setAttribute('aria-pressed', String(!quick));
    quickBtn.classList.toggle('order-mode__btn--on', quick);
    fullBtn.classList.toggle('order-mode__btn--on', !quick);
    if (persist && !isEdit) writeFormMode(quick ? 'quick' : 'full');
  }
  setMode(readFormMode(), false);

  itemsContainer.addEventListener('input', recalc);
  recalc();

  const handle = modal.open({
    title: isEdit ? 'تعديل طلب' : 'إضافة طلب',
    body, closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          if (!customerId) { toast.warning('اختر عميلاً'); return; }
          const items = Array.from(itemsContainer.children)
            .map((r) => r._getValues()).filter((it) => it.name && it.name !== 'بند');
          if (items.length === 0) { toast.warning('أضف بنداً واحداً على الأقل'); return; }

          const extraFees = Array.from(feesContainer.children)
            .map((r) => r._getValues()).filter((f) => f.value > 0);

          const dt = discountTypeSelect.value;
          const dv = dt === 'percent'
            ? Math.min(100, toNonNegative(discountValueInput.value))
            : toNonNegative(discountValueInput.value);
          const deposit = toNonNegative(depositInput.value);
          const totals = computeTotals(items, dt, dv, extraFees);
          if (deposit > totals.amount) {
            toast.warning('المقدم (' + formatEGP(deposit) + ') أكبر من إجمالي الطلب (' + formatEGP(totals.amount) + ')');
            return;
          }

          /* تعديل طلب عليه مدفوعات: تخفيض الإجمالي دون المدفوع يصنع فائضاً يختفي (المتبقي لا يقل عن صفر) */
          if (isEdit && statusSelect.value !== 'cancelled') {
            try {
              const pays = await paymentsRepoForDelete.findByOrder(existing.id);
              const over = overpaidBy({ ...existing, amount: totals.amount, deposit }, pays);
              if (over > 0 && !(await modal.confirm({
                title: 'المدفوع أكبر من الإجمالي',
                message: 'المدفوع حتى الآن أكبر من الإجمالي الجديد (' + formatEGP(totals.amount) + ') بمقدار ' +
                  formatEGP(over) + '.\nسيظهر الفرق كفائض يجب ردّه للعميل. هل تريد المتابعة؟',
                confirmText: 'نعم، احفظ', cancelText: 'تعديل',
              }))) return;
            } catch (e) { /* فشل الفحص لا يمنع الحفظ */ }
          }

          /* إلغاء طلب مدفوع: لا إيراد منه ويُردّ المدفوع للعميل (لا يُحتفظ بالعربون) — نُنبّه قبل التنفيذ */
          if (statusSelect.value === 'cancelled' && !(isEdit && existing.status === 'cancelled')) {
            let paidNow = deposit;
            if (isEdit) {
              try { paidNow = orderPaidBreakdown({ ...existing, amount: totals.amount, deposit }, await paymentsRepoForDelete.findByOrder(existing.id)).paid; } catch (e) { /* ignore */ }
            }
            if (paidNow > 0 && !(await modal.confirm({
              title: 'إلغاء طلب مدفوع',
              message: 'المدفوع على هذا الطلب ' + formatEGP(paidNow) + '.\nعند الإلغاء يُستبعد من الإيرادات ويصير مستحقاً ردّه للعميل (يظهر في صفحة «المستحقات» لتسجيل الردّ).',
              confirmText: 'نعم، ألغِ الطلب', cancelText: 'رجوع',
            }))) return;
          }

          /* إعادة فتح طلب سبق ردّ مبلغه: دفعاته القديمة ستُحتسب مدفوعة من جديد */
          if (isEdit && existing.status === 'cancelled' && statusSelect.value !== 'cancelled' && existing.refundedAt) {
            if (!(await modal.confirm({
              title: 'إعادة فتح طلب ملغى',
              message: 'سبق ردّ مبلغ هذا الطلب (' + formatEGP(existing.refundedAmount || 0) + ') للعميل.\nإعادة فتحه تُعيد احتساب دفعاته القديمة كمدفوعة. تأكد أن العميل دفع مجدداً، أو احذف/عدّل تلك الدفعات بعد الحفظ.',
              confirmText: 'إعادة الفتح', cancelText: 'رجوع',
            }))) return;
          }

          /* إجمالي صفر: غالباً نُسي السعر أو أُدخل ناقصاً (كان يُحفظ بصمت) — وأرقام مستحيلة تُرفض */
          if (totals.amount > MAX_AMOUNT) { toast.warning('إجمالي الطلب كبير جداً — تأكد من الأسعار والكميات'); return; }
          if (totals.amount <= 0 && statusSelect.value !== 'cancelled') {
            const okZero = await modal.confirm({
              title: 'إجمالي الطلب صفر',
              message: 'لم تُدخل سعراً للبنود (أو السعر ناقص). هل تريد حفظ الطلب بدون مبلغ؟',
              confirmText: 'احفظ بدون سعر', cancelText: 'تعديل الأسعار',
            });
            if (!okZero) return;
          } else if (totals.amount > CONFIRM_AMOUNT) {
            const okBig = await modal.confirm({
              title: 'إجمالي كبير',
              message: 'إجمالي الطلب ' + formatEGP(totals.amount) + ' كبير جداً. هل الرقم صحيح؟',
              confirmText: 'نعم، احفظ', cancelText: 'تعديل',
            });
            if (!okBig) return;
          }

          if (isDiscountExcessive(totals)) {
            const okDisc = await modal.confirm({
              title: 'خصم كبير',
              message: 'الخصم ' + discountPercentOf(totals) + '% (' + formatEGP(totals.discountAmount) + ') من مجموع ' +
                formatEGP(totals.subtotal) + ' — أعلى من ' + MAX_DISCOUNT_PERCENT + '%.\nهل الرقم صحيح؟',
              confirmText: 'نعم، احفظ', cancelText: 'تعديل الخصم',
            });
            if (!okDisc) { extras.open = true; setMode('full', false); discountValueInput.focus(); return; }
          }

          const data = {
            customerId, status: statusSelect.value,
            dueDate: (dueDateInput.value ? parseDateInput(dueDateInput.value) : null),
            receivedDate: (receivedDateInput.value ? parseDateInput(receivedDateInput.value) : null),
            items, discountType: dt, discountValue: dv, discountAmount: totals.discountAmount,
            extraFees, extraFeesTotal: totals.extraFeesTotal,
            subtotal: totals.subtotal, deposit, amount: totals.amount,
            cost: toNonNegative(costInput.value),
            notes: notesInput.value.trim(),
            urgent: urgentInput.checked,
          };
          /* الصورة المرجعية: طلب جديد ⟵ تُكتب (إن وُجدت)؛ تعديل ⟵ فقط إن تغيّرت بعد اكتمال تحميلها.
             المصغّر refThumb يبقى في سجل الطلب لقوائم سريعة، والأصل يذهب إلى orderMedia (انظر orders repo). */
          {
            const curImg = imagePicker.getValue() || '';
            if (!isEdit) data.referenceImage = curImg;
            else if (refReady && curImg !== loadedRef) data.referenceImage = curImg;
            if (data.referenceImage) data.refThumb = await thumbFromDataUrl(data.referenceImage);
          }
          /* إعادة فتح طلب ملغى: تُلغى علامة «تم الرد» حتى لا تبقى على طلب عاد فعّالاً */
          if (isEdit && existing.status === 'cancelled' && data.status !== 'cancelled' && existing.refundedAt) {
            data.refundedAt = null;
            data.refundedAmount = null;
          }
          /* تاريخ التسليم الفعلي (تعتمد عليه مؤشرات الأداء): يُحفظ عند التحوّل لـ delivered ويُمسح عند الرجوع منها */
          if (data.status === 'delivered') {
            data.deliveredAt = (isEdit && existing.deliveredAt) || Date.now();
          } else if (isEdit && existing.deliveredAt) {
            data.deliveredAt = null;
          }

          /* التسليم الجزئي: تتبع التسليمات المحفوظة تعديل البنود والحالة */
          if (isEdit && Array.isArray(existing.deliveries) && existing.deliveries.length > 0) {
            if (existing.status === 'delivered' && data.status !== 'delivered') {
              data.deliveries = [];                              /* إعادة فتح الطلب: يُبدأ التسليم من جديد */
            } else {
              const cleaned = sanitizeDeliveries(existing, data.items);
              if (data.status === 'delivered') {
                const cr = completeRemaining({ ...existing, ...data, deliveries: cleaned, status: 'ready' }, { now: data.deliveredAt });
                data.deliveries = cr.deliveries || cleaned;      /* الحالة «تم التسليم» تُسلِّم المتبقي */
              } else {
                data.deliveries = cleaned;
              }
            }
          }

          /* خطة العمل على أساس الحد اليومي: تُحفظ مع الطلب فتُحسب سعة كل يوم بدقة (حتى الجزئية) */
          const planLimit = state.scheduleConfig.dailyOrderLimit || 0;
          const planActive = data.status !== 'delivered' && data.status !== 'cancelled';
          const cents = (v) => Math.round((Number(v) || 0) * 100);
          if (planActive && data.dueDate && planLimit > 0 && data.amount > 0) {
            const unchanged = isEdit && isValidWorkPlan(existing) &&
              cents(existing.amount) === cents(data.amount) && existing.dueDate === data.dueDate;
            if (unchanged) {
              data.workPlan = existing.workPlan;                 /* لا نحرّك خطة سبق الوعد بها */
            } else if (suggestedPlan && suggestedPlan.dueTs === data.dueDate &&
                       cents(suggestedPlan.amount) === cents(data.amount) && suggestedPlan.plan.length > 0) {
              data.workPlan = suggestedPlan.plan;                /* الخطة التي اقترحها ✨ */
            } else {
              const latestOrders = await refreshCapOrders();   /* قراءة حديثة قبل بناء الخطة */
              const pl = planOrder(latestOrders, {
                orderAmount: data.amount, dailyOrderLimit: planLimit,
                dayOffWeekday: state.scheduleConfig.dayOffWeekday,
                endDate: data.dueDate, excludeOrderId: isEdit ? existing.id : null, minDays: 0,
              });
              if (pl) {
                data.workPlan = pl.plan;
              } else {
                data.workPlan = null;
                const alt = suggestDueDate(latestOrders, {
                  dayOffWeekday: state.scheduleConfig.dayOffWeekday, dailyOrderLimit: planLimit,
                  minDays: 1, maxLookaheadDays: 60, excludeOrderId: isEdit ? existing.id : null,
                  orderAmount: data.amount,
                });
                toast.warning('⚠️ السعة اليومية لا تتسع للطلب حتى هذا التاريخ — أقرب موعد ممكن: ' + formatDate(alt.timestamp));
              }
            }
          } else if (planActive) {
            data.workPlan = null;
          }                                                      /* المسلَّم/الملغى: تبقى خطته كما هي */

          /* تغيّر الطلب (مزامنة/تبويب آخر) بعد فتح النموذج؟ نسأل قبل الاستبدال */
          if (isEdit && !(await confirmIfStale((id) => orders.find(id), existing, 'هذا الطلب'))) return;
          try {
            if (isEdit) {
              const res = await orders.update(existing.id, data);
              if (!res) { toast.danger('الطلب لم يعد موجوداً (حُذف من جهاز آخر؟) — لم يُحفظ شيء'); return; }
              toast.success('تم تحديث الطلب');
            }
            else {
              const created = await orders.create(data);
              const notify = await newOrderNotifyAction(created && created.id ? created : { ...data });
              toast.success('تم إضافة الطلب', notify ? { action: notify, duration: 9000 } : {});
            }
            draftDone = true;
            draft.clear(DRAFT_KEY);
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger(saveFailMessage(err)); }
        },
      },
    ],
  });

  /* --- 📝 Autosave: حفظ + استرجاع المسودة (فقط للنماذج الجديدة) --- */
  if (!isEdit) {
    /* 1. استرجاع المسودة إن وُجدت */
    const savedDraft = draft.get(DRAFT_KEY);
    if (savedDraft && typeof savedDraft === 'object') {
      try {
        if (savedDraft.customerId) customerSelect.value = savedDraft.customerId;
        if (savedDraft.status) statusSelect.value = savedDraft.status;
        if (savedDraft.receivedDate) receivedDateInput.value = savedDraft.receivedDate;
        if (savedDraft.dueDate) dueDateInput.value = savedDraft.dueDate;
        if (typeof savedDraft.discountType === 'string') {
          discountTypeSelect.value = savedDraft.discountType;
          discountValueInput.style.display = savedDraft.discountType === 'none' ? 'none' : '';
        }
        if (savedDraft.discountValue != null) discountValueInput.value = String(savedDraft.discountValue);
        if (savedDraft.deposit != null) depositInput.value = String(savedDraft.deposit);
        if (savedDraft.cost != null && savedDraft.cost !== 0) costInput.value = String(savedDraft.cost);
        if (typeof savedDraft.notes === 'string') notesInput.value = savedDraft.notes;
        if (savedDraft.image && typeof imagePicker.setValue === 'function') {
          imagePicker.setValue(savedDraft.image);
        }

        /* استرجاع البنود */
        if (Array.isArray(savedDraft.items) && savedDraft.items.length > 0) {
          clear(itemsContainer);
          savedDraft.items.forEach((it) => addItemRow(it));
        }

        /* استرجاع الرسوم */
        if (Array.isArray(savedDraft.fees) && savedDraft.fees.length > 0) {
          clear(feesContainer);
          savedDraft.fees.forEach((f) => addFeeRow(f));
        }

        if (savedDraft.receivedDate || (savedDraft.discountType && savedDraft.discountType !== 'none') ||
            (savedDraft.fees && savedDraft.fees.length) || savedDraft.cost || savedDraft.notes || savedDraft.image) {
          extras.open = true;
        }
        recalc();
        if (extras.open || itemsContainer.children.length > 1 || Number(savedDraft.deposit) > 0) setMode('full', false);
        toast.info('📝 تم استرجاع مسودة سابقة');
      } catch (e) {
        console.warn('[OrderForm] draft restore failed:', e);
      }
    }

    /* 2. حفظ تلقائي أثناء الكتابة (debounced 500ms) */
    let _saveTimer = null;
    const scheduleSave = () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        if (draftDone) return;
        try {
          const itemsData = Array.from(itemsContainer.children).map((r) => r._getValues());
          const feesData = Array.from(feesContainer.children).map((r) => r._getValues());
          const payload = {
            customerId: customerSelect.value,
            status: statusSelect.value,
            receivedDate: receivedDateInput.value,
            dueDate: dueDateInput.value,
            discountType: discountTypeSelect.value,
            discountValue: Number(discountValueInput.value) || 0,
            deposit: Number(depositInput.value) || 0,
            cost: Number(costInput.value) || 0,
            notes: notesInput.value,
            image: imagePicker.getValue() || '',
            items: itemsData,
            fees: feesData,
          };
          draft.save(DRAFT_KEY, payload);
        } catch (e) {
          console.warn('[OrderForm] draft save failed:', e);
        }
      }, 500);
    };

    /* ربط المراقبة بمحتوى النموذج */
    body.addEventListener('input', scheduleSave);
    body.addEventListener('change', scheduleSave);

    /* حفظ أولي بعد فتح النموذج بلحظة */
    setTimeout(scheduleSave, 100);

    /* حفظ عند إغلاق النافذة */
    const origHandleClose = handle.close;
    handle.close = function () {
      try { if (!draftDone) scheduleSave(); } catch { /* ignore */ }
      return origHandleClose.apply(this, arguments);
    };
  }
}
