/* ==========================================================================
   v3530-fonts.test.js — تطوير الخطوط: رفع ملف، Google Fonts، سُمك، تباعد (v3.5.30)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS, FONT_WEIGHTS, LINE_HEIGHTS } from '../../core/config.js';
import { settings } from '../../data/repos/settings.js';
import { applyFont, applyDisplay, applyFontWeight, applyLineHeight } from '../../ui/display-settings.js';
import { WORKSHOP_SECTIONS } from '../../pages/settings/sections-workshop.js';
import { fontsSection } from '../../pages/settings/section-fonts.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import {
  sanitizeFontName, sanitizeGoogleName, fontNameFromFile, validateFontFile, normalizeCustomFonts, findEntry,
  googleCssUrl, cssFamily, isCustomId, entryIdOf, customValue, fontStore, addFontFile, addGoogleFont, removeCustomFont,
  MAX_CUSTOM_FONTS, MAX_FONT_BYTES,
} from '../../services/custom-fonts.js';

const TINY_TTF_B64 = 'AAEAAAAPAIAAAwBwR0RFRgARAAIAAANQAAAAFkdQT1NEdkx1AAADaAAAACBHU1VCJ6Q/wwAAA4gAAACWTUFUSAk/M4QAAAQgAAAA9k9TLzJqGm9NAAABeAAAAFZjbWFwAAwAlQAAAdwAAAA0Z2FzcAAHAAcAAANEAAAADGdseWZYU+gnAAACGAAAANBoZWFkLLVfuQAAAPwAAAA2aGhlYQznA68AAAE0AAAAJGhtdHgPwwE/AAAB0AAAAAxsb2NhADEAfQAAAhAAAAAIbWF4cAAHACIAAAFYAAAAIG5hbWUC5gsKAAAC6AAAADxwb3N0/9sAWgAAAyQAAAAgAAEAAAACXrgSf8HCXw889QAfCAAAAAAA4PrROQAAAADnDeZgABD+lgVoBdUAAAAIAAIAAAAAAAAAAQAAB23+HQAABX0AEAARBWgAAQAAAAAAAAAAAAAAAAAAAAMAAQAAAAMAIQADAAAAAAABAAAAAAAAAAAAAAAAAAAAAAABBA4BkAAFAAAFMwWZAAABHgUzBZkAAAPXAGYCEgAAAgsGAwMIBAICBAAAAAEAAAAAAAAAAAAAAABQZkVkAEAAQQBCBhT+FAGaB20B4wAAAAEAAAAAAAAEzQBmBXkAEAV9AMkAAAACAAAAAwAAABQAAwABAAAAFAAEACAAAAAEAAQAAQAAAEL//wAAAEH////AAAEAAAAAAAAAFQAxAGgAAgBm/pYEZgWkAAMABwAAExEhESUhESFmBAD8cwMb/OX+lgcO+PJyBikAAgAQAAAFaAXVAAIACgAAAQEhATMBIwMhAyMCvP7uAiX+e+UCOdKI/V+I1QUO/RkDrvorAX/+gQADAMkAAATsBdUACAARACAAAAERITI2NTQmIwERITI2NTQmIyUhMhYVFAYHFhYVFAQjIQGTAUSjnZ2j/rwBK5SRkZT+CwIE5/qAfJWl/vD7/egCyf3dh4uMhQJm/j5vcnFwpsCxiaIUIMuYyNoAAAAAAgAeAAMAAQQJAAEAFgAAAAMAAQQJAAIACAAWAEQAZQBqAGEAVgB1ACAAUwBhAG4AcwBCAG8AbwBrAAMAAAAAAAD/2ABaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAgAAv//AAMAAQAAAAwAAAAAAAAAAQABAAIAAQABAAAAAQAAAAoAHAAeAAFERkxUAAgABAAAAAD//wAAAAAAAAABAAAACgCSAJQAFERGTFQAemFyYWIAhGFybW4AhGJyYWkAhGNhbnMAhGNoZXIAhGN5cmwAhGdlb3IAhGdyZWsAhGhhbmkAhGhlYnIAhGthbmEAhGxhbyAAhGxhdG4AhG1hdGgAhG5rbyAAhG9nYW0AhHJ1bnIAhHRmbmcAhHRoYWkAhAAEAAAAAP//AAAAAAAAAAAAAAAAAAEAAAAKAOAA6ABQADwMAAfdAAAAAAKCAAAEYAAABdUAAAAAAAAEYAAAAAAAAAAAAAAAAAAABGAAAAAAAAABaAAABGAAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEOAAACdgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAQ4AAABaAAAAWgAAAQ4AAAAAAAAAAAAAAQ4AAABaAAAAWgAAAQ4AAABaAAAAWgAAAFoAAAFyAAAAWgAAAFoAAAI4AAD7jwAAADwAAAAAAAAAAAAoAAoACgAAAAAAAQAAAAA=';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); }
  return !!fn();
}
const tinyBytes = () => Uint8Array.from(atob(TINY_TTF_B64), (c) => c.charCodeAt(0));
const tinyFile = (name = 'My_Font-Test.ttf') => new File([tinyBytes()], name, { type: 'font/ttf' });

register('v3.5.30 تطوير الخطوط', async (t) => {
  const html = document.documentElement;
  const keep = { font: html.getAttribute('data-font'), size: html.getAttribute('data-size'), w: html.getAttribute('data-weight'), l: html.getAttribute('data-leading'), v: html.style.getPropertyValue('--font-family-active') };
  const created = [];
  try {
    /* --- منطق نقي --- */
    await t.test('1. sanitizeFontName: يُسقط رموز CSS/HTML ويقصّ على 40', sanitizeFontName('  a<b>"c";{d}  e ') === 'a b c d e' && sanitizeFontName('x'.repeat(80)).length === 40 && sanitizeFontName(null) === '');
    await t.test('2. sanitizeGoogleName: لاتيني/أرقام/مسافات فقط', sanitizeGoogleName(' Reem  Kufi ') === 'Reem Kufi' && sanitizeGoogleName('Amiri') === 'Amiri' && sanitizeGoogleName('خط') === '' && sanitizeGoogleName('a') === '' && sanitizeGoogleName('A;b') === '' && sanitizeGoogleName("x'y") === '');
    await t.test('3. fontNameFromFile: يحذف الامتداد ويبدّل _ و-', fontNameFromFile('My_Font-Test.ttf') === 'My Font Test' && fontNameFromFile('') === 'خط مخصص');
    await t.test('4. validateFontFile: الامتداد والحجم والفراغ',
      validateFontFile({ name: 'a.ttf', size: 100 }).ok && validateFontFile({ name: 'a.WOFF2', size: 100 }).ok && !validateFontFile({ name: 'a.txt', size: 100 }).ok
      && !validateFontFile({ name: 'a.ttf', size: 0 }).ok && !validateFontFile({ name: 'a.ttf', size: MAX_FONT_BYTES + 1 }).ok && !validateFontFile(null).ok);
    const dirty = [{ id: 'a1', kind: 'file', name: 'خط' }, { id: 'a1', kind: 'file', name: 'مكرر' }, { id: 'bad id', kind: 'file', name: 'x' }, { id: 'g1', kind: 'google', name: 'Amiri' }, { id: 'g2', kind: 'google', name: 'خط عربي' }, { id: 'k', kind: 'zzz', name: 'x' }, null, 5];
    const norm = normalizeCustomFonts(dirty);
    await t.test('5. normalizeCustomFonts: يُسقط التالف والمكرر وغير الصالح', norm.length === 2 && norm[0].id === 'a1' && norm[1].id === 'g1' && normalizeCustomFonts('x').length === 0 && normalizeCustomFonts(undefined).length === 0);
    await t.test('6. normalizeCustomFonts: حد أقصى', normalizeCustomFonts(Array.from({ length: 20 }, (_, i) => ({ id: 'f' + i, kind: 'file', name: 'n' + i }))).length === MAX_CUSTOM_FONTS);
    await t.test('7. findEntry / isCustomId / entryIdOf / customValue', findEntry(dirty, 'g1').name === 'Amiri' && findEntry(dirty, 'zz') === null && isCustomId('custom:a1') && !isCustomId('custom:') && !isCustomId('cairo') && entryIdOf('custom:a1') === 'a1' && customValue('a1') === 'custom:a1');
    await t.test('8. cssFamily: ملف ← jf-<id> وGoogle ← الاسم', cssFamily({ kind: 'file', id: 'a1' }) === 'jf-a1' && cssFamily({ kind: 'google', name: 'Reem Kufi', id: 'g' }) === 'Reem Kufi');
    await t.test('9. googleCssUrl: ترميز المسافات وأوزان اختيارية', googleCssUrl('Reem Kufi') === 'https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@400;500;600;700&display=swap' && googleCssUrl('Amiri', false) === 'https://fonts.googleapis.com/css2?family=Amiri&display=swap');

    /* --- الإعدادات الافتراضية والاسترجاع --- */
    const dd = DEFAULT_SETTINGS.display;
    await t.test('10. الافتراضي: fontWeight/lineHeight عاديان وcustomFonts فارغة', dd.fontWeight === 'normal' && dd.lineHeight === 'normal' && Array.isArray(dd.customFonts) && dd.customFonts.length === 0);
    const g = await settings.get();
    await t.test('11. settings.get تدمج الحقول الجديدة', g.display.fontWeight === 'normal' && Array.isArray(g.display.customFonts));
    await t.test('12. استرجاع الخطوط يشمل السُمك والتباعد ولا يمسّ customFonts',
      JSON.stringify(buildResetPatch('fonts', DEFAULT_SETTINGS)) === JSON.stringify({ display: { fontFamily: 'ibm-plex', fontSize: 'normal', fontWeight: 'normal', lineHeight: 'normal' } }));

    /* --- التطبيق على الصفحة --- */
    applyFont('custom:a1', dirty);
    await t.test('13. خط مضاف: data-font=custom ومتغير الخط يحمل العائلة وبديل IBM Plex',
      html.getAttribute('data-font') === 'custom' && /jf-a1/.test(html.style.getPropertyValue('--font-family-active')) && /IBM Plex/.test(html.style.getPropertyValue('--font-family-active')));
    applyFont('custom:غير-موجود', dirty);
    await t.test('14. معرّف مضاف غير موجود يعود للافتراضي ويزيل المتغير', html.getAttribute('data-font') === 'ibm-plex' && html.style.getPropertyValue('--font-family-active') === '');
    applyFont('cairo', dirty);
    await t.test('15. الخط المدمج يزيل المتغير المضاف', html.getAttribute('data-font') === 'cairo' && html.style.getPropertyValue('--font-family-active') === '');
    applyDisplay({ fontWeight: 'bold', lineHeight: 'loose' });
    const cs = getComputedStyle(document.body);
    await t.test('16. السُمك والتباعد يغيّران body فعلياً (600 و1.9)', html.getAttribute('data-weight') === 'bold' && html.getAttribute('data-leading') === 'loose' && cs.fontWeight === '600' && Math.abs(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) - 1.9) < 0.02);
    applyFontWeight('نحيف'); applyLineHeight('ضخم');
    await t.test('17. قيم غير معروفة ← عادي (400 و1.5)', html.getAttribute('data-weight') === 'normal' && html.getAttribute('data-leading') === 'normal' && getComputedStyle(document.body).fontWeight === '400');
    await t.test('18. خيارات السُمك والتباعد ثلاثة لكل منهما', FONT_WEIGHTS.length === 3 && LINE_HEIGHTS.length === 3);

    /* --- التخزين على الجهاز --- */
    const ab = new Uint8Array([1, 2, 3, 4]).buffer;
    await fontStore.put('t1', ab);
    const back = await fontStore.get('t1');
    await t.test('19. IndexedDB: حفظ واسترجاع ملف الخط', back && back.byteLength === 4 && new Uint8Array(back)[2] === 3);
    await fontStore.del('t1');
    await t.test('20. IndexedDB: الحذف يعمل', (await fontStore.get('t1')) === undefined);

    /* --- إضافة ملف --- */
    const r1 = await addFontFile(tinyFile(), []);
    if (r1.entry) created.push(r1.entry);
    await t.test('21. رفع ملف خط صالح: يُضاف ويُحفظ على الجهاز ويُسجَّل في الصفحة',
      !!r1.entry && r1.entry.kind === 'file' && r1.entry.name === 'My Font Test' && !!(await fontStore.get(r1.entry.id)) && Array.from(document.fonts).some((f) => f.family.replace(/["']/g, '') === 'jf-' + r1.entry.id));
    const r2 = await addFontFile(new File([new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])], 'bad.ttf'), []);
    await t.test('22. ملف تالف باسم ttf يُرفض بلا حفظ', !!r2.error && !r2.entry);
    const r3 = await addFontFile(new File([tinyBytes()], 'a.exe'), []);
    await t.test('23. امتداد غير مدعوم يُرفض', !!r3.error);
    const r4 = await addFontFile(tinyFile(), Array.from({ length: MAX_CUSTOM_FONTS }, (_, i) => ({ id: 'q' + i, kind: 'file', name: 'n' })));
    await t.test('24. الحد الأقصى للخطوط المضافة يُمنع تجاوزه', !!r4.error && /للحد الأقصى/.test(r4.error));
    const gErr = await addGoogleFont('خط عربي', []);
    const gDup = await addGoogleFont('amiri', [{ id: 'g1', kind: 'google', name: 'Amiri' }]);
    await t.test('25. Google: اسم غير لاتيني أو مكرر يُرفض قبل أي طلب شبكة', !!gErr.error && !!gDup.error && /مضاف/.test(gDup.error));

    /* --- واجهة القسم --- */
    const find = WORKSHOP_SECTIONS.find((s) => s.id === 'fonts');
    await t.test('26. القسم id=fonts في نفس الترتيب وهو fontsSection الجديد', find === fontsSection && WORKSHOP_SECTIONS.map((s) => s.id).join() === 'workshop,appearance,backgrounds,icons,fonts,display');
    const saves = [];
    const body = document.createElement('div');
    document.body.appendChild(body);
    const entry = r1.entry;
    await fontsSection.render(body, { display: { fontFamily: customValue(entry.id), customFonts: [entry, { id: 'g1', kind: 'google', name: 'Amiri' }] } }, (p) => { saves.push(p); });
    const builtin = () => body.querySelectorAll('button[data-font]');
    const customs = () => body.querySelectorAll('button[data-custom-font]');
    await t.test('27. المدمجة 5 والمضافة 2 والنشط هو المضاف المحفوظ', builtin().length === 5 && customs().length === 2 && body.querySelector('button.settings-theme-card--active').dataset.customFont === entry.id && body.querySelectorAll('button.settings-theme-card--active[data-font], button.settings-theme-card--active[data-custom-font]').length === 1);
    builtin()[1].click();
    await t.test('28. اختيار مدمج: حفظ حقل واحد، وإلغاء تمييز المضاف، وتطبيق فوري',
      JSON.stringify(saves[0]) === JSON.stringify({ display: { fontFamily: 'cairo' } }) && html.getAttribute('data-font') === 'cairo' && body.querySelectorAll('button.settings-theme-card--active[data-custom-font]').length === 0 && builtin()[1].classList.contains('settings-theme-card--active'));
    customs()[1].click();
    await t.test('29. اختيار خط Google مضاف: يحفظ custom:g1 ويطبّقه', JSON.stringify(saves[1]) === JSON.stringify({ display: { fontFamily: 'custom:g1' } }) && html.getAttribute('data-font') === 'custom' && /Amiri/.test(html.style.getPropertyValue('--font-family-active')) && body.querySelectorAll('button.settings-theme-card--active').length >= 1);
    body.querySelector('button[data-weight="medium"]').click();
    body.querySelector('button[data-leading="relaxed"]').click();
    await t.test('30. السُمك والتباعد: حفظ حقل واحد وتطبيق فوري وتمييز',
      JSON.stringify(saves[2]) === JSON.stringify({ display: { fontWeight: 'medium' } }) && JSON.stringify(saves[3]) === JSON.stringify({ display: { lineHeight: 'relaxed' } })
      && html.getAttribute('data-weight') === 'medium' && html.getAttribute('data-leading') === 'relaxed'
      && body.querySelector('button[data-weight].settings-theme-card--active').dataset.weight === 'medium');

    /* رفع من الواجهة */
    const input = body.querySelector('input[data-role="font-file"]');
    const dt = new DataTransfer(); dt.items.add(tinyFile('Second.ttf')); input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await waitFor(() => customs().length === 3);
    const upSave = saves.find((s) => s.display && Array.isArray(s.display.customFonts) && s.display.customFonts.length === 3);
    if (upSave) created.push(upSave.display.customFonts[2]);
    await t.test('31. الرفع من الواجهة: بطاقة جديدة تُفعَّل وتُحفظ في الإعدادات مع الخط النشط',
      customs().length === 3 && !!upSave && upSave.display.fontFamily === customValue(upSave.display.customFonts[2].id) && body.querySelector('[data-role="font-count"]').textContent.includes('3 من'));
    const sx = body.querySelector('input[data-role="font-google-name"]');
    body.querySelector('[data-action="add-google-font"]').click();
    await sleep(100);
    await t.test('32. زر Google بحقل فارغ لا يضيف شيئاً', customs().length === 3 && !!sx);

    /* حذف: خدمة + قسم */
    const delBtn = body.querySelector('button[data-action="remove-font"][data-font-id="' + entry.id + '"]');
    await t.test('33. لكل خط مضاف زر حذف', !!delBtn && body.querySelectorAll('button[data-action="remove-font"]').length === 3);
    delBtn.click();
    await waitFor(() => document.querySelector('.modal'));
    const confirmBtn = Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent.trim() === 'حذف');
    if (confirmBtn) confirmBtn.click();
    await waitFor(() => customs().length === 2);
    await t.test('34. الحذف من الواجهة يزيل البطاقة والملف من الجهاز والخط من الصفحة',
      customs().length === 2 && (await fontStore.get(entry.id)) === undefined && !Array.from(document.fonts).some((f) => f.family.replace(/["']/g, '') === 'jf-' + entry.id));
    body.remove();
    for (const e of created) await removeCustomFont(e);
    await t.test('35. removeCustomFont تنظّف بيانات الخط', (await fontStore.get(created[created.length - 1].id)) === undefined);
  } finally {
    for (const e of created) { try { await removeCustomFont(e); } catch { /* لا شيء */ } }
    document.querySelectorAll('.modal').forEach((m) => m.remove());
    if (keep.font) html.setAttribute('data-font', keep.font); else html.removeAttribute('data-font');
    if (keep.size) html.setAttribute('data-size', keep.size);
    if (keep.w) html.setAttribute('data-weight', keep.w); else html.removeAttribute('data-weight');
    if (keep.l) html.setAttribute('data-leading', keep.l); else html.removeAttribute('data-leading');
    if (keep.v) html.style.setProperty('--font-family-active', keep.v); else html.style.removeProperty('--font-family-active');
  }
});
