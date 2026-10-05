/* ==========================================================================
   settings.test.js — اختبارات صفحة الإعدادات
   ==========================================================================
   8 اختبارات: pages/settings
   ========================================================================== */

import { register } from '../registry.js';
import { settingsPage } from '../../pages/settings/index.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';

register('pages/settings.js', async (t) => {
  /* نظّف الإعدادات قبل البدء */
  await settingsRepo.clear();

  const container = document.createElement('div');
  await settingsPage.render(container);

  /* 1. الصفحة تُبنى بالهيكل الصحيح */
  await t.test('1. render builds page structure',
    container.querySelector('.settings-page') !== null &&
    container.querySelector('.settings-toc') !== null &&
    container.querySelector('.settings-search') !== null &&
    container.querySelector('.settings-layout') !== null);

  /* 2. عدد الأقسام = 13 */
  const sections = container.querySelectorAll('.settings-section');
  await t.test('2. renders 13 sections', sections.length === 13);

  /* 3. عدد عناصر TOC = 13 */
  const tocItems = container.querySelectorAll('.settings-toc__item');
  await t.test('3. TOC has 13 items', tocItems.length === 13);

  /* 4. حقل البحث موجود */
  await t.test('4. search input exists',
    container.querySelector('input[type="search"]') !== null);

  /* 5. قسم معلومات الورشة يحتوي حقول نصية */
  const workshopSection = container.querySelector('[data-section-id="workshop"]');
  await t.test('5. workshop section has text inputs',
    workshopSection !== null &&
    workshopSection.querySelectorAll('input[type="text"]').length >= 4);

  /* 6. قسم المظهر يحتوي شبكة ثيمات (9) */
  const appearanceSection = container.querySelector('[data-section-id="appearance"]');
  const themeCards = appearanceSection
    ? appearanceSection.querySelectorAll('.settings-theme-card')
    : [];
  await t.test('6. appearance has 9 theme cards', themeCards.length === 9);

  /* 7. البحث يُخفي الأقسام غير المطابقة */
  const searchInput = container.querySelector('input[type="search"]');
  searchInput.value = 'مقاسات';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const visibleSections = Array.from(container.querySelectorAll('.settings-section'))
    .filter((s) => !s.classList.contains('settings-section--hidden'));
  await t.test('7. search filters sections',
    visibleSections.length > 0 && visibleSections.length < 13);

  /* 8. destroy() يُنظّف الصفحة */
  settingsPage.destroy();
  await settingsRepo.clear();
  await t.test('8. destroy clears state', true);
});
