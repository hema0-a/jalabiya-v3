/* ==========================================================================
   orders-delivery.js — التسليم: تأكيد التسليم مع التوقيع + التسليم الجزئي مع التحصيل (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون تغيير منطق. API: deliverWithSignature(ctx, order) · openPartialDelivery(ctx, order).
   orders.js يحتفظ بغلافين رفيعين بالتوقيع القديم (order) ويمرّر ctx.
   ========================================================================== */

import { el } from '../../core/dom.js';
import { formatEGP } from '../../core/utils.js';
import { orders } from '../../data/repos/orders.js';
import { customers } from '../../data/repos/customers.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { openSignaturePad, SIGNATURE_SKIPPED } from '../../ui/signature-pad.js';
import { getAskSignature, setAskSignature } from '../../services/signature-pref.js';
import { orderPaidBreakdown } from '../../services/payments-view.js';
import { suggestCollection } from '../../services/delivery-receipt.js';
import { openDeliveryReceipt } from '../../ui/delivery-receipt-dialog.js';
import { deliveryProgress, planDelivery, applyDelivery, completeRemaining } from '../../services/partial-delivery.js';

/** نافذة تأكيد التسليم مع خانة «طلب توقيع العميل» (تحفظ اختيارها كتفضيل للجهاز). @returns {Promise<{ask:boolean}|null>} */
function confirmDeliveryDialog(message) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const box = el('input', { type: 'checkbox', id: 'deliver-ask-sig', 'aria-label': 'طلب توقيع العميل' });
    box.checked = getAskSignature();
    const body = el('div', {}, [
      el('p', { style: { margin: '0 0 12px', lineHeight: '1.7' } }, message),
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' } },
        [box, 'طلب توقيع العميل على الاستلام']),
    ]);
    const handle = modal.open({
      title: 'تأكيد التسليم', body, closable: true,
      onClose: () => finish(null),
      actions: [
        { text: 'إلغاء', variant: 'ghost', onClick: () => { finish(null); handle.close(); } },
        {
          text: '🚚 تأكيد التسليم', variant: 'primary',
          onClick: () => { const ask = box.checked; setAskSignature(ask); finish({ ask }); handle.close(); },
        },
      ],
    });
  });
}

/** تسليم المتبقي (كامل الطلب) — التوقيع اختياري: خانة في التأكيد + زر «تخطي» داخل اللوحة. */
export async function deliverWithSignature(ctx, order) {
  const refreshAll = ctx.refresh;
  const prog = deliveryProgress(order);
  const choice = await confirmDeliveryDialog(prog.state === 'partial'
    ? 'سيُسلَّم المتبقي (' + prog.remainingUnits + ' من ' + prog.totalUnits + ' قطعة) ويكتمل الطلب. هل العميل في انتظار التسليم الآن؟'
    : 'سيتم تعليم الطلب كمُسلَّم. هل العميل في انتظار التسليم الآن؟');
  if (!choice) return;
  let signature = null;
  if (choice.ask) {
    const got = await openSignaturePad({
      title: '✍️ توقيع استلام الطلب',
      hint: 'وقّع هنا لاستلام الطلب — سيُحفظ التوقيع مع الطلب',
      allowSkip: true,
    });
    if (!got) { toast.info('تم إلغاء التسليم'); return; }
    if (got !== SIGNATURE_SKIPPED) signature = got;
  }
  try {
    await orders.update(order.id, completeRemaining(order, signature ? { signature } : {}));
    toast.success(signature ? 'تم التسليم مع التوقيع ✅' : 'تم التسليم ✅');
  } catch (err) { toast.danger('فشل التسليم: ' + err.message); return; }
  try { await refreshAll(); } catch (err) { console.warn('[orders] refresh after delivery', err); }
}

/**
 * نافذة التسليم الجزئي: اختيار كمية كل بند يستلمها العميل الآن + تحصيل نسبي اختياري.
 * تقرأ الطلب والدفعات من قاعدة البيانات عند التأكيد (لا من نسخة البطاقة) حتى لا تُسلَّم قطعة مرتين
 * ولا يُحصَّل أكثر من المتبقي. بعد التأكيد تُعرض نافذة إيصال التسليم (إرسال واتساب بنقرة).
 */
export function openPartialDelivery(ctx, order) {
  const { state } = ctx;
  const refreshAll = ctx.refresh;
  const prog = deliveryProgress(order);
  const c = state.customerMap[order.customerId];
  const inputs = new Map();

  /* ---- التحصيل النسبي: المبلغ المقترح = المستحق عن المسلَّم − المدفوع ---- */
  let orderPays = [];
  let paysLoaded = false;
  let amountTouched = false;
  let boxTouched = false;
  const collectBox = el('input', { type: 'checkbox', 'aria-label': 'تحصيل دفعة الآن' });
  const amountInput = el('input', {
    type: 'number', className: 'input', min: '0', step: '0.01', inputmode: 'decimal',
    'aria-label': 'المبلغ المحصَّل الآن', style: { width: '160px', textAlign: 'center', direction: 'ltr' },
  });
  const methodSel = el('select', { className: 'select', 'aria-label': 'طريقة الدفع' });
  [['cash', 'نقدي'], ['instapay', 'InstaPay'], ['vodafone', 'Vodafone Cash'], ['other', 'أخرى']]
    .forEach(([v, l]) => methodSel.appendChild(el('option', { value: v }, l)));
  const collectInfo = el('div', { style: { fontSize: '12px', color: '#555', lineHeight: '1.9', marginTop: '6px' } }, 'اختر القطع لعرض المبلغ المستحق');
  const collectNow = el('div', { style: { fontSize: '13px', fontWeight: '700', marginTop: '6px', minHeight: '18px' } });
  const collectSection = el('div', { style: { marginTop: '12px', padding: '10px', background: '#F6F1E6', borderRadius: '10px' } }, [
    el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px' } },
      [collectBox, '💰 تحصيل دفعة الآن']),
    collectInfo,
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' } }, [amountInput, methodSel]),
    collectNow,
  ]);

  const summary = el('div', { role: 'status', style: { marginTop: '10px', fontSize: '13px', fontWeight: '600', minHeight: '20px' } });
  const readSelection = () => {
    const sel = {};
    inputs.forEach((inp, id) => { sel[id] = inp.value === '' ? 0 : Number(inp.value); });
    return sel;
  };
  const refreshCollect = () => {
    const sg = suggestCollection(order, orderPays, readSelection());
    if (!sg.ok) {
      collectInfo.textContent = 'اختر القطع لعرض المبلغ المستحق';
      collectNow.textContent = '';
      return;
    }
    collectInfo.textContent = 'قيمة المسلَّم ' + formatEGP(sg.deliveredValue) + ' · المدفوع ' + formatEGP(sg.paid) +
      ' · المستحق عن المسلَّم ' + formatEGP(sg.dueForDelivered) +
      (sg.suggested <= 0 ? ' — ✅ ما دُفع يغطّي المسلَّم' : '');
    if (!amountTouched) amountInput.value = sg.suggested > 0 ? String(sg.suggested) : '';
    if (!boxTouched && paysLoaded) collectBox.checked = sg.suggested > 0;
    const amt = Number(amountInput.value) || 0;
    if (collectBox.checked && amt > 0) {
      collectNow.textContent = amt > sg.balance + 0.009
        ? '⚠️ المبلغ أكبر من المتبقي على الطلب (' + formatEGP(sg.balance) + ')'
        : 'سيُسجَّل دفعة بمبلغ ' + formatEGP(amt);
      collectNow.style.color = amt > sg.balance + 0.009 ? '#B3261E' : '#2E7D32';
    } else {
      collectNow.textContent = 'لن تُسجَّل دفعة';
      collectNow.style.color = '#666';
    }
  };
  amountInput.addEventListener('input', () => { amountTouched = true; refreshCollect(); });
  collectBox.addEventListener('change', () => { boxTouched = true; refreshCollect(); });

  const refresh = () => {
    const plan = planDelivery(order, readSelection());
    if (!plan.ok) {
      const anyTyped = Array.from(inputs.values()).some((i) => Number(i.value) > 0);
      summary.textContent = anyTyped ? '⚠️ ' + plan.error : 'اختر الكميات التي يستلمها العميل الآن';
      summary.style.color = anyTyped ? '#B3261E' : '#666';
    } else {
      const left = prog.remainingUnits - plan.units;
      summary.textContent = plan.completes
        ? '✅ هذه آخر الأجزاء — سيكتمل الطلب (' + plan.units + ' قطعة)'
        : '🚚 سيُسلَّم ' + plan.units + ' قطعة — يتبقى ' + left;
      summary.style.color = plan.completes ? '#2E7D32' : '#0B5A8A';
    }
    refreshCollect();
  };

  const rows = prog.lines.filter((l) => l.remaining > 0).map((l) => {
    const input = el('input', {
      type: 'number', className: 'input', min: '0', max: String(l.remaining), step: '1',
      inputmode: 'numeric', value: '0', 'aria-label': 'كمية ' + l.name,
      style: { width: '84px', textAlign: 'center' },
    });
    input.addEventListener('input', refresh);
    inputs.set(l.id, input);
    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #EFE7D8' } }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F' } }, l.name),
        el('div', { style: { fontSize: '12px', color: '#666' } },
          'المتبقي ' + l.remaining + ' من ' + l.quantity + (l.delivered > 0 ? ' · سُلِّم ' + l.delivered : '')),
      ]),
      input,
      el('button', {
        type: 'button', className: 'btn btn--sm btn--ghost', title: 'تسليم كل المتبقي من هذا البند',
        onClick: () => { input.value = String(l.remaining); refresh(); },
      }, 'الكل'),
    ]);
  });

  const noteInput = el('input', { type: 'text', className: 'input', placeholder: 'ملاحظة (اختياري)', style: { marginTop: '10px' } });
  const sigBox = el('input', { type: 'checkbox', id: 'partial-sig' });
  sigBox.checked = getAskSignature();                        /* يتذكّر اختيارك السابق */
  sigBox.addEventListener('change', () => setAskSignature(sigBox.checked));
  const sigRow = el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px' } },
    [sigBox, 'طلب توقيع العميل على الاستلام (اختياري)']);

  const body = el('div', {}, [
    el('div', { style: { fontSize: '13px', color: '#555', marginBottom: '6px' } },
      (c ? c.name + ' — ' : '') + 'سُلِّم ' + prog.deliveredUnits + ' من ' + prog.totalUnits + ' قطعة حتى الآن'),
    ...rows, noteInput, sigRow, collectSection, summary,
  ]);
  refresh();
  /* الدفعات تُحمَّل بعد فتح النافذة (الفتح متزامن)؛ التحصيل لا يُفعَّل تلقائياً قبل اكتمال تحميلها */
  paymentsRepo.findByOrder(order.id)
    .then((list) => { orderPays = list; paysLoaded = true; refresh(); })
    .catch(() => { paysLoaded = true; refresh(); });

  modal.open({
    title: '🚚 تسليم جزئي', body, closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', onClick: () => modal.close() },
      {
        text: '🚚 تأكيد التسليم', variant: 'primary',
        onClick: async () => {
          const sel = readSelection();
          const fresh = (await orders.find(order.id)) || order;       /* أحدث نسخة من قاعدة البيانات */
          const plan = planDelivery(fresh, sel);
          if (!plan.ok) { toast.warning(plan.error); return; }

          /* التحصيل: يُتحقق منه قبل التوقيع حتى لا يوقّع العميل ثم يُرفض */
          let collectAmt = 0;
          if (collectBox.checked) {
            collectAmt = Number(amountInput.value) || 0;
            if (!Number.isFinite(collectAmt) || collectAmt < 0) { toast.warning('أدخل مبلغاً صحيحاً للتحصيل'); return; }
            if (collectAmt > 0) {
              let freshPays = [];
              try { freshPays = await paymentsRepo.findByOrder(order.id); } catch (e) { /* نكمل */ }
              const balance = Math.max(0, (Number(fresh.amount) || 0) - orderPaidBreakdown(fresh, freshPays).paid);
              if (collectAmt > balance + 0.009) {
                toast.warning('المبلغ أكبر من المتبقي على الطلب (' + formatEGP(balance) + ')');
                return;
              }
            }
          }

          let signature = null;
          if (sigBox.checked) {
            const got = await openSignaturePad({
              title: '✍️ توقيع استلام ' + plan.units + ' قطعة',
              hint: 'وقّع هنا لاستلام هذا الجزء — سيُحفظ التوقيع مع التسليم',
              allowSkip: true,
            });
            if (!got) { toast.info('تم إلغاء التسليم'); return; }
            signature = got === SIGNATURE_SKIPPED ? null : got;
          }
          const res = applyDelivery(fresh, sel, { note: noteInput.value, signature });
          if (!res.ok) { toast.warning(res.error); return; }
          const deliveryId = res.patch.deliveries[res.patch.deliveries.length - 1].id;
          try {
            await orders.update(order.id, res.patch);
          } catch (err) { toast.danger('فشل التسليم: ' + err.message); return; }

          let collected = 0;
          if (collectAmt > 0) {
            try {
              await paymentsRepo.create({
                customerId: fresh.customerId, orderId: fresh.id, amount: collectAmt,
                method: methodSel.value, notes: 'تحصيل عند تسليم جزئي', isDeposit: false, deliveryId,
              });
              collected = collectAmt;
            } catch (err) {
              toast.warning('تم التسليم لكن تعذّر تسجيل الدفعة — سجّلها يدوياً من صفحة المدفوعات');
            }
          }

          modal.close();
          /* الإيصال أولاً: تعذّر تحديث القائمة لا يجوز أن يحجبه (التسليم والدفعة محفوظان).
             النتيجة في عنوان النافذة (لا toast فوقها يغطّي زر الإرسال)؛ toast فقط إن تعذّر فتحها. */
          const headline = (res.completes ? 'اكتمل تسليم الطلب ✅'
            : 'تم تسليم ' + res.units + ' قطعة — يتبقى ' + res.remainingUnits) +
            (collected > 0 ? ' · تم تحصيل ' + formatEGP(collected) : '');
          try {
            const updated = (await orders.find(order.id)) || { ...fresh, ...res.patch };
            let cust = c || null;
            if (!cust) { try { cust = await customers.find(fresh.customerId); } catch (e) { cust = null; } }   /* خريطة العملاء قد تكون قديمة */
            openDeliveryReceipt(updated, deliveryId, cust, { collected, headline });
          } catch (err) {
            console.error('[orders] receipt', err);
            toast.success(headline);
          }
          try { await refreshAll(); } catch (err) { console.warn('[orders] refresh after delivery', err); }
        },
      },
    ],
  });
}
