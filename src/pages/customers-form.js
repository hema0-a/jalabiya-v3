/* ==========================================================================
   customers-form.js — نموذج إضافة/تعديل العميل (v3.5.8)
   ==========================================================================
   openCustomerForm(ctx, existing) — منقول حرفياً (مقاسات · قوام · عيلة · كشف تكرار · Autosave للمسودة).
   التواصل مع الصفحة عبر ctx صريح { state, refresh, openForm }.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { saveFailMessage } from '../core/save-error.js';
import { customers, POSTURE_OPTIONS } from '../data/repos/customers.js';
import { modal, confirmIfStale } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { createOrderImagePicker } from '../ui/order-image-picker.js';
import { findSimilarCustomers, phoneKey } from '../services/customer-merge.js';
import * as draft from '../services/draft-manager.js';
import { buildMeasurementsSection } from './customers-measure.js';

/* --- مفتاح المسودة --- */
const DRAFT_KEY = 'customer-form';

export function openCustomerForm(ctx, existing = null) {
  const { state } = ctx;
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم العميل',
    value: isEdit ? (existing.name || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  const addressInput = el('input', {
    className: 'input', type: 'text', placeholder: 'العنوان (اختياري)',
    value: isEdit ? (existing.address || '') : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات إضافية...' });
  notesInput.value = isEdit ? (existing.notes || '') : '';

  const vipCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  vipCheckbox.checked = isEdit ? Boolean(existing.vip) : false;

  const vipToggle = el('label', { className: 'toggle' }, [
    vipCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'عميل مميز (VIP)'),
  ]);

  /* --- صورة العميل (reuse order-image-picker) --- */
  const imagePicker = createOrderImagePicker({
    value: isEdit ? (existing.image || '') : '',
    label: '🖼️ صورة العميل',
    hint: 'صورة شخصية (اختياري) — تظهر في البطاقة والكشف',
    /* v3.5.19: تظهر مصغّرة 44px وفي عرض مكبّر ≤ عرض الشاشة؛ 1200px/300KB زيادة تُفك كاملةً لكل بطاقة
       وتُضاعف حجم السجل والمزامنة والمسودة. 800px/150KB كافية (الطلبات تبقى 1200px/300KB). */
    maxDimensionPx: 800,
    maxSizeKB: 150,
  });

  const measurements = buildMeasurementsSection(
    ctx, isEdit ? existing.measurements : null
  );

  /* --- ملاحظات القوام (v3.3.51): اختيارات سريعة + ملاحظة حرة --- */
  const postureChecks = POSTURE_OPTIONS.map((o) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!(isEdit && Array.isArray(existing.posture) && existing.posture.includes(o.id));
    return { id: o.id, cb, label: o.label };
  });
  const postureNoteInput = el('input', {
    className: 'input', type: 'text', placeholder: 'ملاحظة أخرى عن القوام (اختياري)',
    value: isEdit ? (existing.postureNote || '') : '',
  });
  const postureField = el('div', { className: 'field' }, [
    el('label', { className: 'field__label' }, '🧍 ملاحظات القوام'),
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginBottom: '8px' } },
      postureChecks.map(({ cb, label }) => el('label', {
        style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' },
      }, [cb, el('span', {}, label)]))),
    postureNoteInput,
    el('div', { style: { fontSize: '11px', color: '#999', marginTop: '3px' } },
      'تظهر مع المقاسات في الطلب وملف العميل، وتُحفظ نسخة منها مع كل طلب جديد.'),
  ]);

  /* --- ملف العيلة (v3.3.51): ربط العميل برب أسرة. يُسمح فقط برب أسرة ليس تابعاً لغيره،
         ولا يُسمح لمن له أفراد تابعون أن يصير تابعاً (لا سلاسل). --- */
  const hasMembers = isEdit && state.customers.some((x) => x.familyHeadId === existing.id);
  const familySelect = el('select', { className: 'select' });
  familySelect.appendChild(el('option', { value: '' }, 'بدون (عميل مستقل)'));
  state.customers
    .filter((x) => (!isEdit || x.id !== existing.id) && !x.familyHeadId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'))
    .forEach((x) => familySelect.appendChild(el('option', { value: x.id }, x.name || '—')));
  if (isEdit && existing.familyHeadId) familySelect.value = existing.familyHeadId;
  if (hasMembers) familySelect.disabled = true;
  const familyField = el('div', { className: 'field' }, [
    el('label', { className: 'field__label' }, '👨‍👩‍👧 تابع لعيلة (رب الأسرة)'),
    familySelect,
    el('div', { style: { fontSize: '11px', color: '#999', marginTop: '3px' } },
      hasMembers ? 'هذا العميل رب أسرة لديه أفراد تابعون، فلا يمكن ربطه بعميل آخر.'
        : 'اختياري — مثلاً ابن يتبع أباه: تظهر مقاساته في ملف الأب ويُجمع حسابهم.'),
  ]);

  /* --- كشف التكرار (v3.3.54): تنبيه فوري أثناء الكتابة، وتأكيد عند الحفظ إن تطابق الهاتف --- */
  const dupHint = el('div', { className: 'order-hint order-hint--warn', role: 'status', 'aria-live': 'polite', 'data-role': 'dup-hint' });
  const dupMatches = () => findSimilarCustomers(
    { name: nameInput.value, phone: phoneInput.value }, state.customers, { excludeId: isEdit ? existing.id : undefined });
  const updateDupHint = () => {
    clear(dupHint);
    const m = dupMatches().slice(0, 3);
    m.forEach(({ customer, reason }) => dupHint.appendChild(el('div', {},
      (reason === 'phone' ? '⚠️ نفس الرقم: ' : 'ℹ️ نفس الاسم: ') + customer.name + (customer.phone ? ' (' + customer.phone + ')' : ''))));
    dupHint.style.display = m.length ? '' : 'none';
  };
  nameInput.addEventListener('input', updateDupHint);
  phoneInput.addEventListener('input', updateDupHint);
  updateDupHint();

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'رقم الهاتف'), phoneInput]),
    dupHint,
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العنوان'), addressInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
    el('div', { className: 'field' }, [vipToggle]),
    familyField,
    imagePicker.node,
    measurements.node,
    postureField,
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل عميل' : 'إضافة عميل',
    body,
    closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) { toast.warning('الاسم مطلوب'); return; }
          const data = {
            name,
            phone: phoneInput.value.trim(),
            address: addressInput.value.trim(),
            notes: notesInput.value.trim(),
            vip: vipCheckbox.checked,
            image: imagePicker.getValue() || '',
            /* ندمج مع المحفوظ: الحقول المعطَّلة/المحذوفة من الإعدادات لا تظهر في النموذج،
               وكان الحفظ يستبدل كل المقاسات بالظاهر فقط فتضيع قيمها بصمت. */
            measurements: (() => {
              const shown = new Set(state.measurementFields.map((f) => f.id));
              const kept = {};
              const old = (isEdit && existing.measurements && typeof existing.measurements === 'object') ? existing.measurements : {};
              Object.keys(old).forEach((k) => { if (!shown.has(k)) kept[k] = old[k]; });
              return { ...kept, ...measurements.getValues() };
            })(),
            familyHeadId: familySelect.value || '',
            posture: postureChecks.filter((x) => x.cb.checked).map((x) => x.id),
            postureNote: postureNoteInput.value.trim(),
          };
          /* تطابق الهاتف مع عميل آخر: نسأل قبل الحفظ (عند التعديل فقط إن تغيّر الرقم) */
          const phoneChanged = !isEdit || phoneKey(data.phone) !== phoneKey(existing.phone);
          const samePhone = phoneChanged ? dupMatches().filter((m) => m.reason === 'phone') : [];
          if (samePhone.length) {
            const okDup = await modal.confirm({
              title: 'عميل مكرر؟',
              message: 'يوجد عميل بنفس رقم الهاتف: ' + samePhone.map((m) => m.customer.name).join('، ') +
                '.\nهل هذا شخص آخر فعلاً؟ (يمكنك دمجهما لاحقاً من «صيانة البيانات»)',
              confirmText: 'نعم، احفظ كعميل مستقل', cancelText: 'رجوع للتعديل',
            });
            if (!okDup) { phoneInput.focus(); return; }
          }
          if (isEdit && !(await confirmIfStale((id) => customers.find(id), existing, 'هذا العميل'))) return;
          try {
            if (isEdit) {
              const res = await customers.update(existing.id, data);
              if (!res) { toast.danger('العميل لم يعد موجوداً (حُذف من جهاز آخر؟) — لم يُحفظ شيء'); return; }
              toast.success('تم تحديث العميل');
            }
            else { await customers.create(data); toast.success('تم إضافة العميل'); }
            draft.clear(DRAFT_KEY);
            handle.close();
            await ctx.refresh();
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
        if (typeof savedDraft.name === 'string') nameInput.value = savedDraft.name;
        if (typeof savedDraft.phone === 'string') phoneInput.value = savedDraft.phone;
        if (typeof savedDraft.address === 'string') addressInput.value = savedDraft.address;
        if (typeof savedDraft.notes === 'string') notesInput.value = savedDraft.notes;
        if (typeof savedDraft.vip === 'boolean') vipCheckbox.checked = savedDraft.vip;

        if (savedDraft.image && typeof imagePicker.setValue === 'function') {
          imagePicker.setValue(savedDraft.image);
        }
        if (savedDraft.measurements && typeof measurements.setValues === 'function') {
          measurements.setValues(savedDraft.measurements);
        }

        toast.info('📝 تم استرجاع مسودة سابقة');
      } catch (e) {
        console.warn('[CustomerForm] draft restore failed:', e);
      }
    }

    /* 2. حفظ تلقائي أثناء الكتابة (debounce 500ms) */
    let _saveTimer = null;
    const scheduleSave = () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        try {
          const payload = {
            name: nameInput.value,
            phone: phoneInput.value,
            address: addressInput.value,
            notes: notesInput.value,
            vip: vipCheckbox.checked,
            image: imagePicker.getValue() || '',
            measurements: measurements.getValues(),
          };
          draft.save(DRAFT_KEY, payload);
        } catch (e) {
          console.warn('[CustomerForm] draft save failed:', e);
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
      try { scheduleSave(); } catch { /* ignore */ }
      return origHandleClose.apply(this, arguments);
    };
  }
}

/* ==========================================================================
   5. حذف + VIP + طباعة
   ========================================================================== */
