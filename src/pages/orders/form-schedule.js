/* orders/form-schedule.js — لقطة السعة وشريط الأيام واقتراح الموعد وبناء خطة العمل (v3.5.11) */

import { el, clear } from '../../core/dom.js';
import { formatDate, localDateInput } from '../../core/utils.js';
import { orders } from '../../data/repos/orders.js';
import { suggestDueDate, planOrder } from '../../services/order-scheduler.js';
import { describeChosenDay } from '../../services/capacity-strip.js';
import { buildCapacityStripView } from '../../ui/capacity-strip-view.js';
import { computeTotals } from './logic.js';

export function buildSchedule(ctx, existing, f, flags) {
  const { state } = ctx;
  const { dueDateInput, itemsContainer, feesContainer, discountTypeSelect, discountValueInput } = f;

  /* آخر خطة عمل اقترحها زر ✨ (تُحفظ مع الطلب إن بقي المبلغ والتاريخ كما هما) */
  flags.suggestedPlan = null;

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
        flags.suggestedPlan = { amount: _orderAmount, dueTs: suggestion.timestamp, plan: suggestion.workPlan || [] };
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
  Object.assign(f, { dueHint, setHint, capStrip, suggestBtn, refreshCapOrders });
}

export async function buildWorkPlan({ orders, amount, dueDate, limit, dayOffWeekday, excludeOrderId }) {
  const pl = planOrder(orders, {
    orderAmount: amount, dailyOrderLimit: limit,
    dayOffWeekday,
    endDate: dueDate, excludeOrderId, minDays: 0,
  });
  if (pl) return { ok: true, plan: pl.plan, altTimestamp: null };
  const alt = suggestDueDate(orders, {
    dayOffWeekday, dailyOrderLimit: limit,
    minDays: 1, maxLookaheadDays: 60, excludeOrderId,
    orderAmount: amount,
  });
  return { ok: false, plan: null, altTimestamp: alt.timestamp };
}
