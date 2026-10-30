/* ==========================================================================
   orders-form.js — نموذج إضافة/تعديل الطلب (openOrderForm) + وضع الإدخال السريع + المسودة التلقائية (v3.5.6)
   ==========================================================================
   مقتطع من orders.js حرفياً دون أي تقسيم داخلي (تقسيم صيانة فقط). API: openOrderForm(ctx, existing = null).
   السطران الأولان في الدالة يربطان state وrefreshAll من ctx؛ الجسم كما كان.
   ملاحظة: capOrders = state.orders لقطة وقت الفتح (مقصودة) وتُستبدل بقراءة حديثة من القاعدة.
   ========================================================================== */
/* v3.5.15: قُسِّمت الدالة إلى orders/form.js (المدخل) + form-inputs/items/schedule/save/draft؛ الجسم منقول حرفياً. التفاصيل في CHANGELOG. */

import { el, clear } from '../../core/dom.js';
import { formatEGP, toNonNegative } from '../../core/utils.js';
import { createCollapsible } from '../../ui/collapsible.js';
import { hasReferenceImage } from '../../services/order-media.js';
import { orderProfit } from '../../services/order-profit.js';
import { computeTotals, discountPercentOf, isDiscountExcessive, MAX_DISCOUNT_PERCENT } from './logic.js';
import { buildInputs } from './form-inputs.js';
import { buildItems } from './form-items.js';
import { buildSchedule } from './form-schedule.js';
import { openOrderModal } from './form-save.js';
import { buildModeBar, attachDraft, readFormMode, writeFormMode } from './form-draft.js';

/* ─────────────────────────────────────────────────────────────────────────
   ترتيب التهيئة — لا تغيّره دون مراجعة كل الوحدات أدناه:
   1) form.js         ينشئ f = {}, flags = {}، يُعرّف recalc() و setMode() (hoisted)
   2) form-inputs.js  يبني customerSelect, statusSelect, dates, deposit, cost, notes, imagePicker
   3) form-items.js   يبني itemsContainer, feesContainer, addItemRow, addFeeRow, الخصم, «عاجل»
   4) form-schedule.js يبني capStrip, dueHint, suggestBtn
                       يبدأ refreshCapOrders() (async، لا يعطّل)
   5) form.js         يجمّع body ثم يستدعي setMode(readFormMode()) و recalc() الأوليين
                       (يعتمدان على 2 و3 و4)
   6) form-save.js    يبني handle = modal.open(...) ويستخدم كل ما سبق
   7) form-draft.js   يلفّ handle.close (آخر خطوة)، يستدعي scheduleSave() بعد 100ms

   ctx: { state, refresh } — يستلمه openOrderForm من orders.js ويمرّره للوحدات.

   ⚠️ hoisting: recalc و setMode يُستدعيان قبل تعريفهما (الأصل هكذا)
   ⚠️ currentOrderAmount() محاطة بـ try/catch لأنها قد تُستدعى قبل بناء البنود
   ───────────────────────────────────────────────────────────────────────── */

export function openOrderForm(ctx, existing = null) {
  const isEdit = existing !== null;
  const f = {};
  const flags = { draftDone: false };   /* بعد الحفظ الناجح لا تُعاد كتابة المسودة عند إغلاق النافذة */
  f.recalc = recalc;
  f.setMode = setMode;

  buildInputs(ctx, existing, f, flags);
  buildItems(ctx, existing, f);
  buildSchedule(ctx, existing, f, flags);

  const { capStrip, itemsContainer, feesContainer, discountTypeSelect, discountValueInput, depositInput, costInput } = f;
  const { customerSelect, statusSelect, receivedDateInput, notesInput, imagePicker, urgentField, addItemBtn, addFeeBtn, suggestBtn, dueDateInput, dueHint } = f;

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

  const { quickBtn, fullBtn, modeBar } = buildModeBar(setMode);

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

  Object.assign(f, { body, extras });
  f.handle = openOrderModal(ctx, existing, f, flags);
  attachDraft(ctx, existing, f, flags);
}
