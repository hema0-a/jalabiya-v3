/* ==========================================================================
   sections-workshop.js — أقسام الورشة (6)
   ==========================================================================
   معلومات الورشة، المظهر، الخلفيات، الأيقونات، الخطوط، أوضاع العرض

   ⚠️ إصلاح حرج (v3.3.1):
   - لا تستخدم spread للمفاتيح القديمة (`...ws`, `...ap`, `...dp`).
     السبب: stale closure — بعد أول حفظ، المفاتيح القديمة تُلغي التغييرات السابقة.
   - أرسل الحقل المتغير فقط — `settings.update` يدمج مع DB الحيّ.
   - استخدم `input` بـ debounce + `blur` — لتغطية الجوال.
   ========================================================================== */

import { el } from '../../core/dom.js';
import { createToggle, createColorPicker } from '../../ui/controls.js';
import { toast } from '../../ui/toast.js';
import {
  THEMES, DEFAULT_SETTINGS, BACKGROUNDS, ICON_STYLES, FONT_FAMILIES, FONT_SIZES,
} from '../../core/config.js';

/* ==========================================================================
   1. معلومات الورشة
   ========================================================================== */

const workshopInfoSection = {
  id: 'workshop',
  icon: '🏢',
  title: 'معلومات الورشة',
  async render(body, currentSettings, saveFn) {
    const ws = currentSettings.workshop || {};

    function textField(label, key, placeholder = '') {
      const inp = el('input', {
        className: 'input', type: 'text', placeholder,
        value: ws[key] || '',
      });

      /* ✅ إصلاح: حفظ آمن بـ debounce + blur */
      let lastSaved = String(ws[key] || '');
      let saveTimer = null;

      const doSave = () => {
        const newValue = inp.value.trim();
        if (newValue === lastSaved) return;
        lastSaved = newValue;
        /* ⚠️ نرسل الحقل المتغير فقط — لا spread */
        saveFn({ workshop: { [key]: newValue } });
      };

      inp.addEventListener('blur', () => {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        doSave();
      });

      inp.addEventListener('input', () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(doSave, 800);
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

    /* الشعار */
    const logoPreview = el('div', {
      style: {
        width: '80px', height: '80px', borderRadius: '12px',
        background: ws.logo ? 'url(' + ws.logo + ') center/cover' : '#E5DDD0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '32px', color: '#2E8B6F',
      },
    }, ws.logo ? '' : '🧵');

    const logoInput = el('input', {
      type: 'file', accept: 'image/*', style: { display: 'none' },
    });

    logoInput.addEventListener('change', () => {
      const file = logoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        logoPreview.style.background = 'url(' + dataUrl + ') center/cover';
        logoPreview.textContent = '';
        /* ⚠️ حقل واحد فقط */
        saveFn({ workshop: { logo: dataUrl } });
      };
      reader.readAsDataURL(file);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'شعار الورشة'),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
        logoPreview,
        el('button', {
          className: 'btn btn--secondary', type: 'button',
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

    /* شبكة الثيمات */
    const themesGrid = el('div', { className: 'settings-themes' });

    THEMES.forEach((th) => {
      const isActive = ap.theme === th.id;
      const card = el('button', {
        type: 'button',
        className: 'settings-theme-card' + (isActive ? ' settings-theme-card--active' : ''),
        'data-theme': th.id,
        onClick: () => {
          /* ⚠️ حقول صريحة فقط — لا spread */
          saveFn({
            appearance: {
              theme: th.id,
              primaryColor: th.primary,
              accentColor: th.accent,
              backgroundColor: th.bg,
            },
          });
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

    /* Color Picker — أساسي */
    const primaryPicker = createColorPicker({
      value: ap.primaryColor || '#1F6D57',
      onChange: (v) => {
        document.documentElement.style.setProperty('--color-primary', v);
        /* ⚠️ حقل واحد */
        saveFn({ appearance: { primaryColor: v } });
      },
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'اللون الأساسي'),
      primaryPicker,
    ]));

    /* Color Picker — ثانوي */
    const accentPicker = createColorPicker({
      value: ap.accentColor || '#B8863B',
      onChange: (v) => {
        document.documentElement.style.setProperty('--color-accent', v);
        /* ⚠️ حقل واحد */
        saveFn({ appearance: { accentColor: v } });
      },
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'اللون الثانوي'),
      accentPicker,
    ]));

    /* استعادة الافتراضي */
    body.appendChild(el('div', { className: 'settings-actions' }, [
      el('button', {
        className: 'btn btn--ghost', type: 'button',
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
   3. الخلفيات الإبداعية
   ========================================================================== */

const backgroundsSection = {
  id: 'backgrounds',
  icon: '🖼️',
  title: 'الخلفيات الإبداعية',
  async render(body, currentSettings, saveFn) {
    const ap = currentSettings.appearance || {};
    const current = ap.backgroundPattern || 'none';

    const grid = el('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
    });

    function applyBackground(id) {
      document.body.classList.remove('bg-fabric', 'bg-sewing', 'bg-geometric', 'bg-paper');
      if (id !== 'none') document.body.classList.add('bg-' + id);
    }

    BACKGROUNDS.forEach((bg) => {
      const isActive = current === bg.id;

      const previewStyle = {
        width: '100%', height: '48px', borderRadius: '6px',
        background: '#F6F1E6', border: '1px solid #E5DDD0',
        marginBottom: '4px', position: 'relative', overflow: 'hidden',
      };
      if (bg.id === 'fabric') previewStyle.backgroundImage = 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.08) 4px, rgba(0,0,0,0.08) 5px)';
      if (bg.id === 'sewing') previewStyle.backgroundImage = 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(31,109,87,0.15) 10px, rgba(31,109,87,0.15) 11px)';
      if (bg.id === 'geometric') {
        previewStyle.backgroundImage = 'radial-gradient(circle at 1px 1px, rgba(31,109,87,0.2) 1.5px, transparent 0)';
        previewStyle.backgroundSize = '12px 12px';
      }
      if (bg.id === 'paper') previewStyle.backgroundImage = 'repeating-linear-gradient(0deg, transparent, transparent 12px, rgba(0,0,0,0.06) 12px, rgba(0,0,0,0.06) 13px)';

      const btn = el('button', {
        type: 'button',
        className: 'settings-theme-card' + (isActive ? ' settings-theme-card--active' : ''),
        'data-bg': bg.id,
        onClick: () => {
          /* ⚠️ حقل واحد */
          saveFn({ appearance: { backgroundPattern: bg.id } });
          applyBackground(bg.id);
          /* إعادة رسم القسم */
          const parent = grid.parentNode;
          parent.innerHTML = '';
          backgroundsSection.render(parent, {
            ...currentSettings,
            appearance: { ...ap, backgroundPattern: bg.id },
          }, saveFn);
        },
      }, [
        el('div', { style: previewStyle }),
        el('span', { className: 'settings-theme-card__name' }, bg.name),
      ]);

      grid.appendChild(btn);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'نمط الخلفية'),
      grid,
      el('div', { className: 'settings-field__hint' }, 'يُطبَّق على خلفية التطبيق بالكامل — مستقل عن الثيم'),
    ]));
  },
};

/* ==========================================================================
   4. أنماط الأيقونات
   ========================================================================== */

const iconsSection = {
  id: 'icons',
  icon: '✨',
  title: 'أنماط الأيقونات',
  async render(body, currentSettings, saveFn) {
    const ap = currentSettings.appearance || {};
    const current = ap.iconStyle || 'default';

    const grid = el('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
    });

    function applyIconStyle(id) {
      document.body.classList.remove('icons-colored-badges', 'icons-line');
      if (id === 'colored-badges') document.body.classList.add('icons-colored-badges');
      if (id === 'line') document.body.classList.add('icons-line');
    }

    ICON_STYLES.forEach((st) => {
      const isActive = current === st.id;

      const btn = el('button', {
        type: 'button',
        className: 'settings-theme-card' + (isActive ? ' settings-theme-card--active' : ''),
        'data-icon': st.id,
        onClick: () => {
          /* ⚠️ حقل واحد */
          saveFn({ appearance: { iconStyle: st.id } });
          applyIconStyle(st.id);
          const parent = grid.parentNode;
          parent.innerHTML = '';
          iconsSection.render(parent, {
            ...currentSettings,
            appearance: { ...ap, iconStyle: st.id },
          }, saveFn);
        },
      }, [
        el('span', { style: { fontSize: '24px', lineHeight: '1', marginBottom: '4px' } }, '👥'),
        el('span', { className: 'settings-theme-card__name' }, st.name),
      ]);

      grid.appendChild(btn);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'نمط الأيقونات'),
      grid,
      el('div', { className: 'settings-field__hint' }, 'يُطبَّق على أيقونات السايدبار والبطاقات'),
    ]));
  },
};

/* ==========================================================================
   5. الخطوط
   ========================================================================== */

const fontsSection = {
  id: 'fonts',
  icon: '🔤',
  title: 'الخطوط',
  async render(body, currentSettings, saveFn) {
    const dp = currentSettings.display || {};

    /* --- اختيار الخط --- */
    const fontGrid = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '6px' },
    });

    FONT_FAMILIES.forEach((f) => {
      const isActive = (dp.fontFamily || 'ibm-plex') === f.id;
      const btn = el('button', {
        type: 'button',
        className: 'settings-theme-card' + (isActive ? ' settings-theme-card--active' : ''),
        'data-font': f.id,
        style: {
          flexDirection: 'row', justifyContent: 'flex-start', gap: '12px',
          padding: '10px 12px', textAlign: 'right',
        },
        onClick: () => {
          /* ⚠️ حقل واحد */
          saveFn({ display: { fontFamily: f.id } });
          document.documentElement.setAttribute('data-font', f.id);
          const parent = fontGrid.parentNode;
          parent.innerHTML = '';
          fontsSection.render(parent, {
            ...currentSettings,
            display: { ...dp, fontFamily: f.id },
          }, saveFn);
        },
      }, [
        el('span', { style: { fontFamily: f.font, fontSize: '18px', fontWeight: '600' } }, 'أ'),
        el('span', { style: { fontFamily: f.font, fontSize: '15px' } }, f.name),
        el('span', { style: { fontFamily: f.font, fontSize: '13px', color: '#666' } }, 'ورشة الجلابيب'),
      ]);
      fontGrid.appendChild(btn);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'نوع الخط'),
      fontGrid,
    ]));

    /* --- حجم الخط --- */
    const sizeGrid = el('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' },
    });

    FONT_SIZES.forEach((sz) => {
      const isActive = (dp.fontSize || 'normal') === sz.id;
      const btn = el('button', {
        type: 'button',
        className: 'settings-theme-card' + (isActive ? ' settings-theme-card--active' : ''),
        'data-size': sz.id,
        onClick: () => {
          /* ⚠️ حقل واحد */
          saveFn({ display: { fontSize: sz.id } });
          document.documentElement.setAttribute('data-size', sz.id);
          const parent = sizeGrid.parentNode;
          parent.innerHTML = '';
          fontsSection.render(parent, {
            ...currentSettings,
            display: { ...dp, fontSize: sz.id },
          }, saveFn);
        },
      }, [
        el('span', { style: { fontSize: (16 * sz.factor) + 'px', lineHeight: '1' } }, 'أ'),
        el('span', { className: 'settings-theme-card__name' }, sz.name),
      ]);
      sizeGrid.appendChild(btn);
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'حجم الخط'),
      sizeGrid,
    ]));
  },
};

/* ==========================================================================
   6. أوضاع العرض
   ========================================================================== */

const displaySection = {
  id: 'display',
  icon: '👁️',
  title: 'أوضاع العرض',
  async render(body, currentSettings, saveFn) {
    const dp = currentSettings.display || {};

    function toggleRow(label, key, hint = '') {
      const t = createToggle({
        label,
        checked: !!dp[key],
        onChange: (v) => {
          /* ⚠️ حقل واحد */
          saveFn({ display: { [key]: v } });
        },
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
  },
};

/* --- تصدير --- */
export const WORKSHOP_SECTIONS = [
  workshopInfoSection,
  appearanceSection,
  backgroundsSection,
  iconsSection,
  fontsSection,
  displaySection,
];
