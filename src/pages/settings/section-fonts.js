/* ==========================================================================
   section-fonts.js — قسم «الخطوط» (v3.5.30: نُقل من sections-workshop.js وطُوِّر)
   ==========================================================================
   - الخطوط المدمجة الخمسة (كما كانت: أزرار data-font).
   - خطوطك: رفع ملف خط من الجوال (يعمل بدون إنترنت) أو إضافة خط من Google Fonts بالاسم.
   - حجم الخط، سُمك الخط، تباعد الأسطر.
   ⚠️ كل ضغطة تحفظ الحقل المتغير فقط (settings.update يدمج مع المحفوظ).
   ========================================================================== */

import { applyFont, applyFontSize, applyFontWeight, applyLineHeight, ensureAllFonts } from '../../ui/display-settings.js';
import { el } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import * as modal from '../../ui/modal.js';
import { FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, LINE_HEIGHTS } from '../../core/config.js';
import {
  MAX_CUSTOM_FONTS, normalizeCustomFonts, customValue, cssFamily, ensureCustomFont,
  addFontFile, addGoogleFont, removeCustomFont, isCustomId, entryIdOf,
} from '../../services/custom-fonts.js';

/** يميّز البطاقة النشطة في الشبكة (سمة data-<key>). */
function mark(grid, key, id) {
  grid.querySelectorAll('button[data-' + key + ']').forEach((b) => {
    b.classList.toggle('settings-theme-card--active', b.dataset[key] === id);
  });
}

function choiceGrid(items, key, activeId, onPick, cols) {
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: '6px' } });
  items.forEach((it) => {
    grid.appendChild(el('button', {
      type: 'button',
      className: 'settings-theme-card' + (activeId === it.id ? ' settings-theme-card--active' : ''),
      ['data-' + key]: it.id,
      onClick: () => { onPick(it.id); mark(grid, key, it.id); },
    }, [el('span', { className: 'settings-theme-card__name' }, it.name)]));
  });
  return grid;
}

export const fontsSection = {
  id: 'fonts',
  icon: '🔤',
  title: 'الخطوط',
  async render(body, currentSettings, saveFn) {
    const dp = currentSettings.display || {};
    let custom = normalizeCustomFonts(dp.customFonts);
    let activeFont = dp.fontFamily || 'ibm-plex';

    ensureAllFonts();   /* لمعاينة الخطوط */

    /* --- اختيار الخط: المدمجة ثم المضافة --- */
    const fontGrid = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    const cardStyle = { flexDirection: 'row', justifyContent: 'flex-start', gap: '12px', padding: '10px 12px', textAlign: 'right' };

    function markFonts() {
      fontGrid.querySelectorAll('button[data-font], button[data-custom-font]').forEach((b) => {
        const v = b.dataset.font || customValue(b.dataset.customFont);
        b.classList.toggle('settings-theme-card--active', v === activeFont);
      });
    }

    function pick(value) {
      activeFont = value;
      saveFn({ display: { fontFamily: value } });   /* ⚠️ حقل واحد */
      applyFont(value, custom);
      markFonts();
    }

    function drawFonts() {
      while (fontGrid.firstChild) fontGrid.removeChild(fontGrid.firstChild);
      FONT_FAMILIES.forEach((f) => {
        fontGrid.appendChild(el('button', {
          type: 'button',
          className: 'settings-theme-card' + (activeFont === f.id ? ' settings-theme-card--active' : ''),
          'data-font': f.id,
          style: cardStyle,
          onClick: () => pick(f.id),
        }, [
          el('span', { style: { fontFamily: f.font, fontSize: '18px', fontWeight: '600' } }, 'أ'),
          el('span', { style: { fontFamily: f.font, fontSize: '15px' } }, f.name),
          el('span', { style: { fontFamily: f.font, fontSize: '13px', color: '#666' } }, 'ورشة الجلابيب'),
        ]));
      });
      custom.forEach((e) => {
        const fam = "'" + cssFamily(e) + "', 'IBM Plex Sans Arabic', system-ui, sans-serif";
        ensureCustomFont(e);
        fontGrid.appendChild(el('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } }, [
          el('button', {
            type: 'button',
            className: 'settings-theme-card' + (activeFont === customValue(e.id) ? ' settings-theme-card--active' : ''),
            'data-custom-font': e.id,
            style: Object.assign({ flex: '1' }, cardStyle),
            onClick: () => pick(customValue(e.id)),
          }, [
            el('span', { style: { fontFamily: fam, fontSize: '18px', fontWeight: '600' } }, 'أ'),
            el('span', { style: { fontFamily: fam, fontSize: '15px' } }, e.name),
            el('span', { style: { fontSize: '11px', color: '#666' } }, e.kind === 'google' ? 'Google' : 'من جهازك'),
          ]),
          el('button', {
            type: 'button', className: 'btn btn--ghost', 'data-action': 'remove-font', 'data-font-id': e.id,
            'aria-label': 'حذف الخط ' + e.name, onClick: () => removeFont(e),
          }, '🗑️'),
        ]));
      });
    }

    async function removeFont(e) {
      const ok = await modal.confirm({
        title: 'حذف الخط', message: 'حذف الخط «' + e.name + '»؟' + (e.kind === 'file' ? ' سيُمسح ملفه من هذا الجهاز.' : ''),
        confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
      });
      if (!ok) return;
      await removeCustomFont(e);
      custom = custom.filter((x) => x.id !== e.id);
      const wasActive = activeFont === customValue(e.id);
      if (wasActive) activeFont = 'ibm-plex';
      saveFn({ display: wasActive ? { customFonts: custom, fontFamily: 'ibm-plex' } : { customFonts: custom } });
      applyFont(activeFont, custom);
      drawFonts();
      refreshCount();
      toast.success('تم حذف الخط');
    }

    drawFonts();
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'نوع الخط'),
      fontGrid,
    ]));

    /* --- إضافة خط --- */
    const countNote = el('div', { className: 'settings-field__hint', 'data-role': 'font-count' });
    function refreshCount() { countNote.textContent = 'خطوطك المضافة: ' + custom.length + ' من ' + MAX_CUSTOM_FONTS; }
    refreshCount();

    async function added(res) {
      if (res.error) { toast.danger(res.error); return false; }
      custom = custom.concat([res.entry]);
      activeFont = customValue(res.entry.id);
      saveFn({ display: { customFonts: custom, fontFamily: activeFont } });
      applyFont(activeFont, custom);
      drawFonts();
      refreshCount();
      toast.success('تمت إضافة الخط «' + res.entry.name + '» وتفعيله');
      return true;
    }

    const fileInput = el('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', style: { display: 'none' }, 'data-role': 'font-file' });
    const uploadBtn = el('button', { type: 'button', className: 'btn btn--secondary btn--block', 'data-action': 'upload-font' }, '📁 رفع ملف خط من الجوال');
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      uploadBtn.disabled = true;
      try { await added(await addFontFile(file, custom)); } finally { uploadBtn.disabled = false; }
    });

    const gInput = el('input', { className: 'input', type: 'text', dir: 'ltr', placeholder: 'Amiri  /  Reem Kufi  /  Lateef', 'data-role': 'font-google-name', maxlength: '40' });
    const gBtn = el('button', { type: 'button', className: 'btn btn--secondary btn--block', 'data-action': 'add-google-font' }, '🌐 إضافة من Google Fonts');
    gBtn.addEventListener('click', async () => {
      gBtn.disabled = true;
      try { if (await added(await addGoogleFont(gInput.value, custom))) gInput.value = ''; } finally { gBtn.disabled = false; }
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'إضافة خط جديد'),
      uploadBtn, fileInput,
      el('div', { style: { height: '8px' } }),
      gInput,
      el('div', { style: { height: '6px' } }),
      gBtn,
      el('div', { className: 'settings-field__hint' },
        'الملف المرفوع (ttf / otf / woff / woff2 حتى 3 ميجا) يُحفظ على هذا الجهاز ويعمل بدون إنترنت، ولا يدخل في النسخة الاحتياطية. خط Google يحتاج إنترنت عند إضافته أول مرة، وبدونه يُستعمل خط بديل.'),
      countNote,
    ]));

    /* --- حجم الخط --- */
    const sizeGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' } });
    FONT_SIZES.forEach((sz) => {
      sizeGrid.appendChild(el('button', {
        type: 'button',
        className: 'settings-theme-card' + ((dp.fontSize || 'normal') === sz.id ? ' settings-theme-card--active' : ''),
        'data-size': sz.id,
        onClick: () => {
          saveFn({ display: { fontSize: sz.id } });   /* ⚠️ حقل واحد */
          applyFontSize(sz.id);
          mark(sizeGrid, 'size', sz.id);
        },
      }, [
        el('span', { style: { fontSize: (16 * sz.factor) + 'px', lineHeight: '1' } }, 'أ'),
        el('span', { className: 'settings-theme-card__name' }, sz.name),
      ]));
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'حجم الخط'),
      sizeGrid,
    ]));

    /* --- سُمك الخط --- */
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'سُمك الخط'),
      choiceGrid(FONT_WEIGHTS, 'weight', dp.fontWeight || 'normal', (id) => {
        saveFn({ display: { fontWeight: id } });
        applyFontWeight(id);
      }, 3),
    ]));

    /* --- تباعد الأسطر --- */
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'تباعد الأسطر'),
      choiceGrid(LINE_HEIGHTS, 'leading', dp.lineHeight || 'normal', (id) => {
        saveFn({ display: { lineHeight: id } });
        applyLineHeight(id);
      }, 3),
    ]));
  },
};

/* لاستعمال الاختبارات */
export { isCustomId, entryIdOf };
