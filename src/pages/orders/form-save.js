/* orders/form-save.js — نافذة نموذج الطلب وزر الحفظ: التحقق والتأكيدات وبناء data والحفظ (v3.5.11) */

import { saveFailMessage } from '../../core/save-error.js';
import { formatEGP, formatDate, parseDateInput, toNonNegative } from '../../core/utils.js';
import { orders } from '../../data/repos/orders.js';
import { payments as paymentsRepoForDelete } from '../../data/repos/payments.js';
import { modal, confirmIfStale } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { thumbFromDataUrl } from '../../services/image-compressor.js';
import { orderPaidBreakdown, overpaidBy } from '../../services/payments-view.js';
import { newOrderNotifyAction } from '../../services/status-notify.js';
import { isValidWorkPlan } from '../../services/order-scheduler.js';
import { sanitizeDeliveries, completeRemaining } from '../../services/partial-delivery.js';
import * as draft from '../../services/draft-manager.js';
import { MAX_AMOUNT, CONFIRM_AMOUNT } from '../../services/amount-guard.js';
import { computeTotals, discountPercentOf, isDiscountExcessive, MAX_DISCOUNT_PERCENT } from './logic.js';
import { DRAFT_KEY } from './form-draft.js';
import { buildWorkPlan } from './form-schedule.js';

export function openOrderModal(ctx, existing, f, flags) {
  const { state } = ctx;
  const refreshAll = ctx.refresh;
  const isEdit = existing !== null;
  const {
    customerSelect, statusSelect, receivedDateInput, dueDateInput, discountTypeSelect, discountValueInput,
    depositInput, costInput, notesInput, imagePicker, itemsContainer, feesContainer, urgentInput,
    extras, body, setMode, refreshCapOrders,
  } = f;

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
            else if (flags.refReady && curImg !== flags.loadedRef) data.referenceImage = curImg;
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
            } else if (flags.suggestedPlan && flags.suggestedPlan.dueTs === data.dueDate &&
                       cents(flags.suggestedPlan.amount) === cents(data.amount) && flags.suggestedPlan.plan.length > 0) {
              data.workPlan = flags.suggestedPlan.plan;                /* الخطة التي اقترحها ✨ */
            } else {
              const latestOrders = await refreshCapOrders();   /* قراءة حديثة قبل بناء الخطة */
              const wp = await buildWorkPlan({
                orders: latestOrders, amount: data.amount, dueDate: data.dueDate, limit: planLimit,
                dayOffWeekday: state.scheduleConfig.dayOffWeekday, excludeOrderId: isEdit ? existing.id : null,
              });
              data.workPlan = wp.plan;
              if (!wp.ok) {
                toast.warning('⚠️ السعة اليومية لا تتسع للطلب حتى هذا التاريخ — أقرب موعد ممكن: ' + formatDate(wp.altTimestamp));
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
            flags.draftDone = true;
            draft.clear(DRAFT_KEY);
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger(saveFailMessage(err)); }
        },
      },
    ],
  });
  return handle;
}
