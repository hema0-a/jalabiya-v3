/* ==========================================================================
   sections-workshop.js — أقسام: معلومات الورشة، المظهر، أوضاع العرض
   ========================================================================== */

import { el } from '../../core/dom.js';
import { createToggle, createColorPicker } from '../../ui/controls.js';
import { THEMES, DEFAULT_SETTINGS } from '../../core/config.js';

/* ==========================================================================
   1. معلومات الورشة
   ========================================================================== */
const workshopInfoSection = {
  id: 'workshop',
  icon: '🏢',
  title: 'معلومات الورشة',
  async render(body, currentSettings, saveFn) {
    const ws = currentSettings.workshop || {};

    /* حقل نصي */
    function textField(label, key, placeholder = '') {
      const inp = el('input', {
        className: 'input',
        type: 'text',
        placeholder,
        value: ws[key] || '',
      });
      inp.addEventListener('blur', () => {
        saveFn({ workshop: { ...ws, [key]: inp.value.trim() } });
      });
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label),
        inp,
      ]);
    }

    body.appendChild(textField('اسم الورشة', 'name', 'ورشة تفصيل الجلابيب'));
    body.appendChild(textField('العنوان', 'address', 'المحافظة — المدينة — الشارع'));
    body.appendChild(textField('رقم الهاتف', 'phone', '01xxxxxxxxx'));
    body.appendChild(textField('رقم WhatsApp', 'whatsapp', '+20xxxxxxxxxx'));

    /* الشعار (رفع) */
    const logoPreview = el('div', {
      style: {
        width: '80px', height: '80px', borderRadius: '12px',
        background: ws.logo ? 'url(' + ws.logo + ') center/cover' : '#E5DDD0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '32px', color: '#2E8B6F',
      },
    }, ws.logo ? '' : '🧵');

    const logoInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    logoInput.addEventListener('change', () => {
      const file = logoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        logoPreview.style.background = 'url(' + dataUrl + ') center/cover';
        logoPreview.textContent = '';
        saveFn({ workshop: { ...ws, logo: dataUrl } });
      };
      reader.readAsDataURL(file);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'شعار الورشة'),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
        logoPreview,
        el('button', {
          className: 'btn btn--secondary',
          type: 'button',
          onClick: () => logoInput.click(),
        }, '📁 اختر صورة'),
        logoInput,
      ]),
    ]));
  },
};

/* ==========================================================================
   2. المظهر والتخصيص
   ========================================================================== */
const appearanceSection = {
  id: 'appearance',
  icon: '🎨',
  title: 'المظهر والتخصيص',
  async render(body, currentSettings, saveFn) {
    const ap = currentSettings.appearance || {};

    /* شبكة الثيمات (9) */
    const themesGrid = el('div', { className: 'settings-themes' });
    THEMES.forEach((th) => {
      const isActive = ap.theme === th.id;
      const card = el('button', {
        type: 'button',
        className: 'settings-theme-card' + (isActive ? ' settings-theme-card--active' : ''),
        'data-theme': th.id,
        onClick: () => {
          saveFn({
            appearance: {
              ...ap,
              theme: th.id,
              primaryColor: th.primary,
              accentColor: th.accent,
              backgroundColor: th.bg,
            },
          });
          /* تحديث فوري */
          document.documentElement.style.setProperty('--color-primary', th.primary);
          document.documentElement.style.setProperty('--color-accent', th.accent);
          document.documentElement.style.setProperty('--color-bg', th.bg);
        },
      }, [
        el('span', { className: 'settings-theme-card__emoji' }, th.emoji),
        el('span', { className: 'settings-theme-card__name' }, th.name),
        el('div', { className: 'settings-theme-card__swatch' }, [
          el('span', { className: 'settings-theme-card__dot', style: { background: th.primary } }),
          el('span', { className: 'settings-theme-card__dot', style: { background: th.accent } }),
          el('span', { className: 'settings-theme-card__dot', style: { background: th.bg } }),
        ]),
      ]);
      themesGrid.appendChild(card);
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'الثيم الجاهز'),
      themesGrid,
    ]));

    /* Color pickers */
    const primaryPicker = createColorPicker({
      value: ap.primaryColor || '#1F6D57',
      onChange: (v) => {
        document.documentElement.style.setProperty('--color-primary', v);
        saveFn({ appearance: { ...ap, primaryColor: v } });
      },
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'اللون الأساسي'),
      primaryPicker,
    ]));

    const accentPicker = createColorPicker({
      value: ap.accentColor || '#B8863B',
      onChange: (v) => {
        document.documentElement.style.setProperty('--color-accent', v);
        saveFn({ appearance: { ...ap, accentColor: v } });
      },
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'اللون الثانوي'),
      accentPicker,
    ]));

    /* زر استعادة الافتراضي */
    body.appendChild(el('div', { className: 'settings-actions' }, [
      el('button', {
        className: 'btn btn--ghost',
        type: 'button',
        onClick: () => {
          const def = DEFAULT_SETTINGS.appearance;
          saveFn({ appearance: def });
          document.documentElement.style.setProperty('--color-primary', def.primaryColor);
          document.documentElement.style.setProperty('--color-accent', def.accentColor);
          toast.info('تمت الاستعادة — أعد فتح الصفحة');
        },
      }, '↩️ استعادة الافتراضي'),
    ]));
  },
};

/* ==========================================================================
   3. أوضاع العرض
   ========================================================================== */
const displaySection = {
  id: 'display',
  icon: '👁️',
  title: 'أوضاع العرض',
  async render(body, currentSettings, saveFn) {
    const dp = currentSettings.display || {};

    /* Toggle helper */
    function toggleRow(label, key, hint = '') {
      const t = createToggle({
        label,
        checked: !!dp[key],
        onChange: (v) => saveFn({ display: { ...dp, [key]: v } }),
      });
      return el('div', { className: 'settings-row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { className: 'settings-row__label' }, label),
          hint ? el('div', { className: 'settings-row__hint' }, hint) : null,
        ]),
        t,
      ]);
    }

    body.appendChild(toggleRow('الوضع الليلي 🌙', 'darkMode', 'يُطبَّق فوراً بعد إعادة الفتح'));
    body.appendChild(toggleRow('التباين العالي 🔲', 'highContrast'));
    body.appendChild(toggleRow('الوضع المضغوط 📏', 'compactMode', 'مسافات أقل'));
    body.appendChild(toggleRow('وضع العميل 👁️', 'clientMode', 'إخفاء الأرقام والإحصائيات'));

    /* حجم الخط */
    const fontSelect = el('select', { className: 'select' });
    [
      ['small', 'صغير'],
      ['medium', 'متوسط'],
      ['large', 'كبير'],
      ['xlarge', 'كبير جداً'],
    ].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (dp.fontSize === v) o.selected = true;
      fontSelect.appendChild(o);
    });
    fontSelect.addEventListener('change', () => {
      saveFn({ display: { ...dp, fontSize: fontSelect.value } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'حجم الخط'),
      fontSelect,
    ]));
  },
};

/* --- تصدير --- */
export const WORKSHOP_SECTIONS = [
  workshopInfoSection,
  appearanceSection,
  displaySection,
];

/* --- استيراد مؤجل لـ toast --- */
import { toast } from '../../ui/toast.js';
