/* ==========================================================================
   display-settings.js — تطبيق إعدادات المظهر والعرض على الواجهة (v3.3.31)
   ==========================================================================
   كانت هذه الإعدادات تُطبَّق فقط عند فتح صفحة الإعدادات، فتضيع مع كل إعادة فتح للتطبيق،
   وكانت مفاتيح التباين العالي والمضغوط والليلي ووضع العميل تُحفظ دون أن يقرأها أحد.
   الآن: applyAllSettings تُستدعى عند الإقلاع وعند أي تغيير.
   - الوضع الليلي ووضع العميل: يُحفظان محلياً لكل جهاز (theme.js / client-mode.js).
   - حجم الخط: عبر zoom على html (التطبيق مبني بالبكسل فلا يتأثر rem).
   - الخطوط غير الافتراضية تُحمَّل عند الحاجة فقط من Google Fonts.
   ========================================================================== */

import { FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, LINE_HEIGHTS } from '../core/config.js';
import { applySilentBudget } from './silent-budget.js';
import { isCustomId, entryIdOf, findEntry, cssFamily, ensureCustomFont } from '../services/custom-fonts.js';

const FONT_URLS = {
  cairo: 'Cairo:wght@400;500;600;700',
  tajawal: 'Tajawal:wght@400;500;700',
  almarai: 'Almarai:wght@400;700',
  'noto-kufi': 'Noto+Kufi+Arabic:wght@400;500;600;700',
};

const loaded = new Set();

/** تحميل خط (مرة واحدة). IBM Plex محمَّل في index.html. */
export function ensureFont(id) {
  try {
    const q = FONT_URLS[id];
    if (!q || loaded.has(id)) return;
    loaded.add(id);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + q + '&display=swap';
    link.setAttribute('data-font-link', id);
    document.head.appendChild(link);
  } catch (e) { /* offline أو CSP: يعود الخط للبديل */ }
}

/** لمعاينة كل الخطوط في قسم «الخطوط» */
export function ensureAllFonts() { FONT_FAMILIES.forEach((f) => ensureFont(f.id)); }

export function applyAppearance(ap) {
  if (!ap) return;
  const root = document.documentElement.style;
  if (ap.primaryColor) root.setProperty('--color-primary', ap.primaryColor);
  if (ap.accentColor) root.setProperty('--color-accent', ap.accentColor);
  if (ap.backgroundColor) root.setProperty('--color-bg', ap.backgroundColor);
  document.body.classList.remove('bg-fabric', 'bg-sewing', 'bg-geometric', 'bg-paper');
  if (ap.backgroundPattern && ap.backgroundPattern !== 'none') document.body.classList.add('bg-' + ap.backgroundPattern);
  document.body.classList.remove('icons-colored-badges', 'icons-line');
  if (ap.iconStyle === 'colored-badges') document.body.classList.add('icons-colored-badges');
  if (ap.iconStyle === 'line') document.body.classList.add('icons-line');
}

/**
 * @param {string} fontId — معرّف خط مدمج أو «custom:<id>»
 * @param {Array} [customFonts] — settings.display.customFonts (للخطوط المضافة)
 */
export function applyFont(fontId, customFonts) {
  const root = document.documentElement;
  const entry = isCustomId(fontId) ? findEntry(customFonts, entryIdOf(fontId)) : null;
  if (entry) {
    root.setAttribute('data-font', 'custom');
    root.style.setProperty('--font-family-active', "'" + cssFamily(entry) + "', 'IBM Plex Sans Arabic', system-ui, sans-serif");
    ensureCustomFont(entry);
    return;
  }
  root.style.removeProperty('--font-family-active');
  const id = FONT_FAMILIES.some((f) => f.id === fontId) ? fontId : 'ibm-plex';
  document.documentElement.setAttribute('data-font', id);
  ensureFont(id);
}

export function applyFontSize(sizeId) {
  const id = FONT_SIZES.some((s) => s.id === sizeId) ? sizeId : 'normal';
  document.documentElement.setAttribute('data-size', id);
}

export function applyFontWeight(wId) {
  const id = FONT_WEIGHTS.some((w) => w.id === wId) ? wId : 'normal';
  document.documentElement.setAttribute('data-weight', id);
}

export function applyLineHeight(lId) {
  const id = LINE_HEIGHTS.some((l) => l.id === lId) ? lId : 'normal';
  document.documentElement.setAttribute('data-leading', id);
}

export function applyDisplay(dp) {
  const d = dp || {};
  applyFont(d.fontFamily, d.customFonts);
  applyFontSize(d.fontSize);
  applyFontWeight(d.fontWeight);
  applyLineHeight(d.lineHeight);
  document.body.classList.toggle('high-contrast', !!d.highContrast);
  document.body.classList.toggle('compact-mode', !!d.compactMode);
  applySilentBudget(!!d.silentBudget);   /* v3.9.1: غير متزامن، ولا يعطّل التطبيق إن فشل */
}

export function applyAllSettings(s) {
  if (!s) return;
  try { applyAppearance(s.appearance); } catch (e) { console.warn('[display] appearance:', e); }
  try { applyDisplay(s.display); } catch (e) { console.warn('[display] display:', e); }
}
