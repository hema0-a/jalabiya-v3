/* ==========================================================================
   v3527-data-care-in-settings.test.js — نقل «صيانة البيانات» إلى الإعدادات (v3.5.27)
   ==========================================================================
   يتحقق أن: القسم موجود بين أقسام النظام ويرسم أدواته، والصفحة القديمة تعمل كما كانت (وضع مستقل بعنوان)،
   ووضع embedded بلا عنوان مكرر، وفتح #/settings/data-care مباشرة يعمل، وإغلاق القسم يستدعي destroy،
   والقائمة الجانبية بلا data-care، والمسار القديم يُعاد توجيهه، وزر «احفظ نسخة» يشير للمكان الجديد.
   ========================================================================== */
import { register } from '../registry.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import { dataCareSection } from '../../pages/settings/section-data-care.js';
import { dataCarePage } from '../../pages/data-care.js';
import { settingsPage } from '../../pages/settings/index.js';
import { NAV_IDS } from '../../services/nav-groups.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); }
  return !!fn();
}
async function source(rel) {
  try { const r = await fetch(new URL('../../' + rel, import.meta.url)); return r.ok ? await r.text() : null; } catch (e) { return null; }
}

register('v3.5.27 صيانة البيانات داخل الإعدادات', async (t) => {
  await t.test('1. قسم data-care بين أقسام النظام بعد النسخ الاحتياطي مباشرة وبأيقونته وعنوانه',
    SYSTEM_SECTIONS.map((s) => s.id).indexOf('data-care') === SYSTEM_SECTIONS.map((s) => s.id).indexOf('backup') + 1 &&
    dataCareSection === SYSTEM_SECTIONS.find((s) => s.id === 'data-care') &&
    dataCareSection.icon === '🧰' && dataCareSection.title === 'صيانة البيانات' &&
    typeof dataCareSection.render === 'function' && typeof dataCareSection.destroy === 'function');

  /* الوضع المضمَّن: بلا عنوان h2 مكرر، وأدوات الصفحة كلها موجودة */
  const emb = document.createElement('div');
  document.body.appendChild(emb);
  try {
    await dataCareSection.render(emb);
    await waitFor(() => emb.querySelectorAll('.card').length >= 5);
    await t.test('2. داخل الإعدادات: بلا عنوان h2 مكرر', emb.querySelector('h2') === null);
    const txt = emb.textContent;
    await t.test('3. أدوات الصفحة الخمس حاضرة (VIP، سلامة البيانات، دمج المكررين، التحقق من النسخ، ترحيل الوسائط)',
      txt.includes('VIP') && txt.includes('سلامة') && txt.includes('المكرر') && txt.includes('النسخ') && txt.includes('الوسائط'));
  } finally { dataCareSection.destroy(); emb.remove(); }

  /* الوضع المستقل القديم لم يتغيّر */
  const solo = document.createElement('div');
  document.body.appendChild(solo);
  try {
    await dataCarePage.render(solo);
    await waitFor(() => solo.querySelector('h2'));
    await t.test('4. الوضع المستقل القديم يعرض العنوان «🧰 صيانة البيانات» كما كان',
      !!solo.querySelector('h2') && solo.querySelector('h2').textContent.includes('صيانة البيانات'));
  } finally { dataCarePage.destroy(); solo.remove(); }

  /* فتح القسم مباشرة عبر الإعدادات + destroy عند المغادرة */
  const orig = dataCareSection.destroy;
  let destroyed = 0;
  dataCareSection.destroy = function () { destroyed += 1; return orig.apply(this, arguments); };
  const host = document.createElement('div');
  document.body.appendChild(host);
  try {
    await settingsPage.render(host, 'data-care');
    await waitFor(() => host.querySelector('.sub-page__content .card'));
    await t.test('5. فتح #/settings/data-care مباشرة يعرض أدوات الصيانة داخل الإعدادات',
      !!host.querySelector('.sub-page__content .card') && host.querySelector('.sub-page__content').textContent.includes('سلامة'));
    settingsPage.destroy();
    await t.test('6. مغادرة صفحة الإعدادات تستدعي destroy للقسم المفتوح مرة واحدة', destroyed === 1);
  } finally { dataCareSection.destroy = orig; host.remove(); }

  await t.test('7. القائمة الجانبية بلا data-care', !NAV_IDS.has('data-care'));
  const main = await source('main.js');
  const dash = await source('pages/dashboard.js');
  if (main === null || dash === null) { t.log('  ⏭️ عقود المصدر تتطلب خادماً (fetch)'); return; }
  await t.test('8. main.js يعيد توجيه #/data-care إلى #/settings/data-care',
    /id === 'data-care'[\s\S]{0,260}location\.replace\('#\/settings\/data-care'\)/.test(main));
  await t.test('9. زر «احفظ نسخة» في اللوحة يشير للمكان الجديد', dash.includes("href: '#/settings/data-care'") && !dash.includes("href: '#/data-care'"));
});
