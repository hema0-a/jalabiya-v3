/* ==========================================================================
   v3528-settings-search-reset.test.js — بحث الإعدادات + استرجاع الافتراضي لكل قسم (v3.5.28)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { settings } from '../../data/repos/settings.js';
import { applyAllSettings } from '../../ui/display-settings.js';
import { settingsPage } from '../../pages/settings/index.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import { WORKSHOP_SECTIONS } from '../../pages/settings/sections-workshop.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';
import { SECURITY_SECTIONS } from '../../pages/settings/sections-security.js';
import { SEARCH_KEYWORDS, RESET_MAP, matchSections, canReset, buildResetPatch, describeReset } from '../../services/settings-tools.js';

const ALL = [...WORKSHOP_SECTIONS, ...DATA_SECTIONS, ...SYSTEM_SECTIONS, ...SECURITY_SECTIONS];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); }
  return !!fn();
}

register('v3.5.28 بحث الإعدادات + استرجاع الافتراضي', async (t) => {
  /* --- 1) منطق نقي --- */
  await t.test('1. لكل قسم كلمات مفتاحية ولا كلمات لقسم غير موجود',
    ALL.every((s) => typeof SEARCH_KEYWORDS[s.id] === 'string' && SEARCH_KEYWORDS[s.id].length > 3) &&
    Object.keys(SEARCH_KEYWORDS).every((id) => ALL.some((s) => s.id === id)));
  await t.test('2. matchSections: بلا استعلام ← null (اعرض الكل)', matchSections('', ALL) === null && matchSections('   ', ALL) === null);
  const hitsFont = matchSections('خط', ALL);
  await t.test('3. البحث «خط» يجد قسم الخطوط ولا يجد «الدعم» (أخطاء) لأن المطابقة من بداية الكلمة', hitsFont.has('fonts') && !hitsFont.has('support'));
  await t.test('4. البحث بكلمة داخل القسم: «عربون» ← سياسة العربون، «تشفير» ← النسخ الاحتياطي، «ترحيل» ← الصيانة',
    matchSections('عربون', ALL).has('deposit-policy') && matchSections('تشفير', ALL).has('backup') && matchSections('ترحيل', ALL).has('data-care'));
  await t.test('5. كل الكلمات يجب أن تتطابق (AND) والتشكيل/الهمزات لا تهم',
    matchSections('نسخ تشفير', ALL).has('backup') && !matchSections('نسخ زززز', ALL).has('backup') && matchSections('أمان', ALL).has('security') && matchSections('امان', ALL).has('security'));
  await t.test('6. بحث بلا نتائج ← مجموعة فارغة (وليس null)', matchSections('qqqqzzzz', ALL).size === 0);

  /* --- 2) خريطة الاسترجاع --- */
  await t.test('7. كل مفاتيح RESET_MAP أقسام موجودة وكل مفاتيح/حقولها موجودة في DEFAULT_SETTINGS',
    Object.keys(RESET_MAP).every((id) => ALL.some((s) => s.id === id) &&
      Object.entries(RESET_MAP[id]).every(([k, f]) => DEFAULT_SETTINGS[k] !== undefined && (f === null || f.every((x) => DEFAULT_SETTINGS[k][x] !== undefined)))));
  await t.test('8. الأقسام الحساسة مستثناة: workshop/appearance/cloud-sync/data-care/demo-data/support/danger-zone',
    ['workshop', 'appearance', 'cloud-sync', 'data-care', 'demo-data', 'support', 'danger-zone'].every((id) => !canReset(id)));
  const pf = buildResetPatch('fonts', DEFAULT_SETTINGS);
  await t.test('9. استرجاع الخطوط يمسّ حقول الخط فقط (النوع والحجم والسُمك والتباعد) لا الوضع الليلي',
    JSON.stringify(pf) === JSON.stringify({ display: { fontFamily: 'ibm-plex', fontSize: 'normal', fontWeight: 'normal', lineHeight: 'normal' } }));
  const po = buildResetPatch('occasions', DEFAULT_SETTINGS);
  po.occasions.push({ id: 'x' });
  await t.test('10. patch نسخة عميقة: تعديله لا يلوّث DEFAULT_SETTINGS', !DEFAULT_SETTINGS.occasions.some((o) => o.id === 'x'));
  await t.test('11. buildResetPatch لقسم غير قابل أو افتراضيات ناقصة ← null',
    buildResetPatch('workshop', DEFAULT_SETTINGS) === null && buildResetPatch('grouping', null) === null && buildResetPatch('grouping', {}) === null);
  await t.test('12. describeReset يذكر أن باقي الأقسام والبيانات لا تتأثر', describeReset('grouping').includes('لا تتأثر') && describeReset('auto-messages').includes('قوالب'));

  /* --- 3) الواجهة: البحث --- */
  const c1 = document.createElement('div');
  document.body.appendChild(c1);
  try {
    await settingsPage.render(c1);
    const input = c1.querySelector('[data-role="settings-search"]');
    const items = () => Array.from(c1.querySelectorAll('.sub-page__item'));
    const visible = () => items().filter((i) => i.style.display !== 'none').map((i) => i.getAttribute('data-section-id'));
    await t.test('13. خانة البحث موجودة وكل الأقسام (كلها) ظاهرة مبدئياً', !!input && visible().length === ALL.length);
    input.value = 'خط'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await t.test('14. كتابة «خط» تُبقي قسم الخطوط وتُخفي غيره', visible().includes('fonts') && visible().length < ALL.length && !visible().includes('backup'));
    input.value = 'zzzzqq'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await t.test('15. بلا نتائج: كل الأقسام مخفية وتظهر رسالة «لا يوجد قسم مطابق»',
      visible().length === 0 && c1.querySelector('[data-role="settings-search-empty"]').style.display !== 'none');
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    await t.test('16. مسح البحث يعيد الأقسام كلها ويُخفي الرسالة',
      visible().length === ALL.length && c1.querySelector('[data-role="settings-search-empty"]').style.display === 'none');
  } finally { settingsPage.destroy(); c1.remove(); }

  /* --- 4) الواجهة: استرجاع قسم --- */
  await settings.clear();
  await settings.update({ grouping: { enabled: true, tolerance: 7 }, display: { darkMode: true, fontSize: 'large' } });
  const c2 = document.createElement('div');
  document.body.appendChild(c2);
  try {
    await settingsPage.render(c2, 'grouping');
    await waitFor(() => c2.querySelector('[data-action="reset-section"]'));
    const resetBtn = c2.querySelector('[data-action="reset-section"]');
    await t.test('17. قسم التجميع يعرض زر «استرجاع الافتراضي»', !!resetBtn);
    resetBtn.click();
    await waitFor(() => document.querySelector('.modal'));
    const confirmBtn = Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent.trim() === 'استرجاع');
    await t.test('18. يظهر تأكيد قبل الاسترجاع', !!confirmBtn && document.querySelector('.modal').textContent.includes('لا تتأثر'));
    confirmBtn.click();
    await sleep(600);
    const after = await settings.get();
    await t.test('19. بعد التأكيد يعود التجميع للافتراضي (enabled=false, tolerance=2)', after.grouping.enabled === false && after.grouping.tolerance === 2);
    await t.test('20. أقسام أخرى لا تتأثر (الوضع الليلي وحجم الخط كما هما)', after.display.darkMode === true && after.display.fontSize === 'large');
  } finally { settingsPage.destroy(); document.querySelectorAll('.modal').forEach((m) => m.remove()); c2.remove(); }

  /* الإلغاء لا يغيّر شيئاً + قسم الخطوط يمسّ حقليه فقط */
  const c3 = document.createElement('div');
  document.body.appendChild(c3);
  try {
    await settingsPage.render(c3, 'fonts');
    await waitFor(() => c3.querySelector('[data-action="reset-section"]'));
    c3.querySelector('[data-action="reset-section"]').click();
    await waitFor(() => document.querySelector('.modal'));
    Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent.trim() === 'إلغاء').click();
    await sleep(300);
    let s2 = await settings.get();
    await t.test('21. «إلغاء» لا يغيّر شيئاً', s2.display.fontSize === 'large');
    c3.querySelector('[data-action="reset-section"]').click();
    await waitFor(() => document.querySelector('.modal'));
    Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent.trim() === 'استرجاع').click();
    await sleep(600);
    s2 = await settings.get();
    await t.test('22. استرجاع الخطوط يعيد الحجم والنوع فقط ويُبقي الوضع الليلي', s2.display.fontSize === 'normal' && s2.display.fontFamily === 'ibm-plex' && s2.display.darkMode === true);
  } finally { settingsPage.destroy(); document.querySelectorAll('.modal').forEach((m) => m.remove()); c3.remove(); await settings.clear(); applyAllSettings(await settings.get()); }
});
