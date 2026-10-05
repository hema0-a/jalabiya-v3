/* ==========================================================================
   sections-security.js — أقسام الأمان (3)
   ==========================================================================
   الأمان، شاشة القفل، منطقة الخطر
   ========================================================================== */

import { el } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { auth } from '../../security/auth.js';

/* ==========================================================================
   1. الأمان
   ========================================================================== */
const securitySection = {
  id: 'security',
  icon: '🔒',
  title: 'الأمان',
  async render(body, currentSettings, saveFn) {
    const sc = currentSettings.security || DEFAULT_SETTINGS.security;

    /* --- تغيير/تعيين PIN --- */
    if (auth.hasPin()) {
      body.appendChild(el('button', {
        className: 'btn btn--secondary btn--block', type: 'button',
        onClick: () => openChangePinModal(),
      }, '🔑 تغيير PIN'));
    } else {
      body.appendChild(el('button', {
        className: 'btn btn--primary btn--block', type: 'button',
        onClick: () => openSetPinModal(),
      }, '🔑 تعيين PIN'));
    }

    /* --- القفل التلقائي --- */
    const autoLockToggle = createToggle({
      label: 'القفل التلقائي',
      checked: sc.autoLock !== false,
      onChange: (v) => saveFn({ security: { ...sc, autoLock: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'القفل التلقائي'),
      autoLockToggle,
    ]));

    /* --- مدة القفل --- */
    const lockSelect = el('select', { className: 'select' });
    [[1, 'دقيقة'], [2, 'دقيقتان'], [3, '3 دقائق'], [5, '5 دقائق'], [10, '10 دقائق']].forEach(([v, l]) => {
      const o = el('option', { value: String(v) }, l);
      if (Number(sc.lockAfterMinutes) === v) o.selected = true;
      lockSelect.appendChild(o);
    });
    lockSelect.addEventListener('change', () => {
      saveFn({ security: { ...sc, lockAfterMinutes: Number(lockSelect.value) } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'القفل بعد'),
      lockSelect,
    ]));

    /* --- مدة الجلسة --- */
    const sessionSelect = el('select', { className: 'select' });
    [[6, '6 ساعات'], [12, '12 ساعة'], [24, 'يوم'], [72, '3 أيام'], [168, 'أسبوع']].forEach(([v, l]) => {
      const o = el('option', { value: String(v) }, l);
      if (Number(sc.sessionDurationHours) === v) o.selected = true;
      sessionSelect.appendChild(o);
    });
    sessionSelect.addEventListener('change', () => {
      saveFn({ security: { ...sc, sessionDurationHours: Number(sessionSelect.value) } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'مدة الجلسة'),
      sessionSelect,
    ]));

    /* --- تسجيل المحاولات --- */
    const logToggle = createToggle({
      label: 'تسجيل محاولات الدخول',
      checked: sc.logLoginAttempts !== false,
      onChange: (v) => saveFn({ security: { ...sc, logLoginAttempts: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تسجيل محاولات الدخول'),
      logToggle,
    ]));

    /* --- حالة القفل --- */
    if (auth.isLocked()) {
      const remaining = Math.ceil(auth.getLockRemainingMs() / 1000);
      body.appendChild(el('div', {
        style: {
          padding: '10px', background: '#FFEBEE', borderRadius: '8px',
          color: '#C62828', fontSize: '13px', marginTop: '8px',
        },
      }, '🔒 التطبيق مقفل حالياً — يتبقى ' + remaining + ' ثانية'));
    }
  },
};

function openSetPinModal() {
  const pinInput = el('input', {
    className: 'input', type: 'password', inputMode: 'numeric', maxLength: 4,
    placeholder: '••••',
    style: { fontSize: '24px', textAlign: 'center', letterSpacing: '8px' },
  });

  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'أدخل PIN مكوَّن من 4 أرقام'),
      pinInput,
    ]),
  ]);

  const handle = modal.open({
    title: 'تعيين PIN',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'تعيين', variant: 'primary', action: 'save',
        onClick: async () => {
          const pin = pinInput.value.trim();
          if (!/^\d{4}$/.test(pin)) return toast.warning('PIN يجب أن يكون 4 أرقام');
          try {
            await auth.setPinAndSave(pin);
            toast.success('تم تعيين PIN');
            handle.close();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

function openChangePinModal() {
  const oldInput = el('input', {
    className: 'input', type: 'password', inputMode: 'numeric', maxLength: 4,
    placeholder: '••••',
    style: { fontSize: '22px', textAlign: 'center', letterSpacing: '6px' },
  });
  const newInput = el('input', {
    className: 'input', type: 'password', inputMode: 'numeric', maxLength: 4,
    placeholder: '••••',
    style: { fontSize: '22px', textAlign: 'center', letterSpacing: '6px' },
  });

  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'PIN الحالي'),
      oldInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'PIN الجديد'),
      newInput,
    ]),
  ]);

  const handle = modal.open({
    title: 'تغيير PIN',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'تغيير', variant: 'primary', action: 'save',
        onClick: async () => {
          const oldPin = oldInput.value.trim();
          const newPin = newInput.value.trim();
          if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin)) {
            return toast.warning('كلا الحقلين يجب أن يكونا 4 أرقام');
          }
          try {
            const ok = await auth.changePin(oldPin, newPin);
            if (!ok) return toast.danger('PIN الحالي غير صحيح');
            toast.success('تم التغيير');
            handle.close();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   2. تخصيص شاشة القفل
   ========================================================================== */
const lockScreenSection = {
  id: 'lock-screen',
  icon: '🔐',
  title: 'تخصيص شاشة القفل',
  async render(body, currentSettings, saveFn) {
    const ls = currentSettings.lockScreen || DEFAULT_SETTINGS.lockScreen;

    /* --- رسالة الترحيب --- */
    const msgInput = el('input', {
      className: 'input', type: 'text',
      placeholder: 'أدخل الرقم السري للدخول',
      value: ls.message || 'أدخل الرقم السري للدخول',
    });
    msgInput.addEventListener('blur', () => {
      saveFn({ lockScreen: { ...ls, message: msgInput.value.trim() || 'أدخل الرقم السري للدخول' } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'رسالة الترحيب'),
      msgInput,
    ]));

    /* --- إظهار الشعار --- */
    const logoToggle = createToggle({
      label: 'إظهار شعار الورشة',
      checked: ls.showLogo !== false,
      onChange: (v) => saveFn({ lockScreen: { ...ls, showLogo: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'إظهار شعار الورشة'),
      logoToggle,
    ]));

    /* --- خلفية مخصصة --- */
    const bgPreview = el('div', {
      style: {
        width: '100%', height: '80px', borderRadius: '8px',
        background: ls.background ? 'url(' + ls.background + ') center/cover' : 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
        marginBottom: '8px',
      },
    });

    const bgInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    bgInput.addEventListener('change', () => {
      const file = bgInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        bgPreview.style.background = 'url(' + dataUrl + ') center/cover';
        saveFn({ lockScreen: { ...ls, background: dataUrl } });
      };
      reader.readAsDataURL(file);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'خلفية شاشة القفل'),
      bgPreview,
      el('div', { style: { display: 'flex', gap: '6px' } }, [
        el('button', {
          className: 'btn btn--secondary btn--sm', type: 'button',
          onClick: () => bgInput.click(),
        }, '📁 اختر صورة'),
        el('button', {
          className: 'btn btn--ghost btn--sm', type: 'button',
          onClick: () => {
            bgPreview.style.background = 'linear-gradient(135deg, #2E8B6F, #1F6D57)';
            saveFn({ lockScreen: { ...ls, background: null } });
          },
        }, '↩️ افتراضي'),
        bgInput,
      ]),
    ]));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6', marginTop: '8px',
      },
    }, '💡 شاشة القفل تظهر عند فتح التطبيق (بعد تعيين PIN) أو بعد القفل التلقائي.'));
  },
};

/* ==========================================================================
   3. منطقة الخطر
   ========================================================================== */
const dangerZoneSection = {
  id: 'danger-zone',
  icon: '⚠️',
  title: 'منطقة الخطر',
  dangerous: true,
  async render(body, currentSettings, saveFn) {
    body.appendChild(el('div', {
      style: {
        fontSize: '13px', color: '#C62828', marginBottom: '12px', lineHeight: '1.6',
      },
    }, 'العمليات التالية لا يمكن التراجع عنها. استخدمها بحذر شديد.'));

    body.appendChild(el('button', {
      className: 'btn btn--danger btn--block', type: 'button',
      style: { marginBottom: '8px' },
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف جميع البيانات',
          message: 'سيتم حذف كل العملاء والطلبات والدفعات والمخزون... لا يمكن التراجع!',
          confirmText: 'حذف الكل', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;

        const ok2 = await modal.confirm({
          title: 'تأكيد نهائي',
          message: 'هل أنت متأكد 100%؟ لا يمكن التراجع.',
          confirmText: 'نعم، احذف الكل', cancelText: 'إلغاء', danger: true,
        });
        if (!ok2) return;

        try {
          const db = await import('../../data/idb.js');
          const stores = ['customers', 'orders', 'payments', 'inventory', 'workers', 'expenses', 'appointments', 'trash', 'activity'];
          for (const s of stores) await db.clear(s).catch(() => {});
          toast.success('تم حذف كل البيانات');
          setTimeout(() => location.reload(), 1500);
        } catch (err) { toast.danger('فشل: ' + err.message); }
      },
    }, '🗑️ حذف جميع البيانات'));

    body.appendChild(el('button', {
      className: 'btn btn--danger btn--block', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'إعادة تعيين الإعدادات',
          message: 'سيتم استرجاع الإعدادات الافتراضية فقط (بدون حذف البيانات).',
          confirmText: 'إعادة تعيين', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          const db = await import('../../data/idb.js');
          await db.remove('settings', 'main');
          toast.success('تمت إعادة التعيين — أعد تحميل الصفحة');
          setTimeout(() => location.reload(), 1500);
        } catch (err) { toast.danger('فشل: ' + err.message); }
      },
    }, '↩️ إعادة تعيين الإعدادات'));
  },
};

/* --- تصدير --- */
export const SECURITY_SECTIONS = [
  securitySection,
  lockScreenSection,
  dangerZoneSection,
];
