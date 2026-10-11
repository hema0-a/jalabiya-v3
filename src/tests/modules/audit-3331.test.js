/* ==========================================================================
   audit-3331.test.js — تطبيق إعدادات المظهر والعرض (v3.3.31)
   ========================================================================== */

import { register } from '../registry.js';
import { applyDisplay, applyAppearance, applyAllSettings, applyFont, applyFontSize } from '../../ui/display-settings.js';

register('audit v3.3.31 display settings', async (t) => {
  const html = document.documentElement;
  const body = document.body;
  const snap = {
    font: html.getAttribute('data-font'), size: html.getAttribute('data-size'),
    hc: body.classList.contains('high-contrast'), cm: body.classList.contains('compact-mode'),
    primary: html.style.getPropertyValue('--color-primary'), cls: body.className,
  };
  const restore = () => {
    snap.font ? html.setAttribute('data-font', snap.font) : html.removeAttribute('data-font');
    snap.size ? html.setAttribute('data-size', snap.size) : html.removeAttribute('data-size');
    body.classList.toggle('high-contrast', snap.hc);
    body.classList.toggle('compact-mode', snap.cm);
    snap.primary ? html.style.setProperty('--color-primary', snap.primary) : html.style.removeProperty('--color-primary');
    body.className = snap.cls;
  };

  try {
    applyDisplay({ fontFamily: 'cairo', fontSize: 'xlarge', highContrast: true, compactMode: true });
    await t.test('1. خط وحجم وتباين ومضغوط تُطبَّق على الصفحة',
      html.getAttribute('data-font') === 'cairo' && html.getAttribute('data-size') === 'xlarge'
      && body.classList.contains('high-contrast') && body.classList.contains('compact-mode'));

    applyDisplay({});
    await t.test('2. إعدادات فارغة = الافتراضي (ibm-plex / normal) وإزالة التباين والمضغوط',
      html.getAttribute('data-font') === 'ibm-plex' && html.getAttribute('data-size') === 'normal'
      && !body.classList.contains('high-contrast') && !body.classList.contains('compact-mode'));

    applyFont('خط-غير-موجود'); applyFontSize('ضخم');
    await t.test('3. قيم غير معروفة تعود للافتراضي بدل كسر الواجهة',
      html.getAttribute('data-font') === 'ibm-plex' && html.getAttribute('data-size') === 'normal');

    applyAppearance({ primaryColor: '#123456', backgroundPattern: 'paper', iconStyle: 'line' });
    await t.test('4. اللون الأساسي ونمط الخلفية وأيقونات الخط تُطبَّق',
      html.style.getPropertyValue('--color-primary') === '#123456'
      && body.classList.contains('bg-paper') && body.classList.contains('icons-line'));

    applyAppearance({ backgroundPattern: 'none', iconStyle: 'default' });
    await t.test('5. «بلا نمط» و«افتراضي» يزيلان الأصناف السابقة',
      !body.classList.contains('bg-paper') && !body.classList.contains('icons-line'));

    let threw = false;
    try { applyAllSettings(null); applyAllSettings({}); applyAllSettings({ display: null, appearance: null }); } catch { threw = true; }
    await t.test('6. إعدادات تالفة/ناقصة لا تُسقط التطبيق', !threw);

    const zoomOf = (id) => { html.setAttribute('data-size', id); return parseFloat(getComputedStyle(html).zoom) || 1; };
    await t.test('7. حجم الخط يغيّر zoom فعلياً (0.9 / 1 / 1.12 / 1.25)',
      zoomOf('small') === 0.9 && zoomOf('normal') === 1 && zoomOf('large') === 1.12 && zoomOf('xlarge') === 1.25);
  } finally { restore(); }
});
