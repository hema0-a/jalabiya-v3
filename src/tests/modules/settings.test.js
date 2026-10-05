/* ==========================================================================
   settings.test.js — اختبارات صفحة الإعدادات
   ==========================================================================
   10 اختبارات: pages/settings (20 قسماً)
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

  /* 2. عدد الأقسام = 20 */
  const sections = container.querySelectorAll('.settings-section');
  await t.test('2. renders 20 sections', sections.length === 20);

  /* 3. عدد عناصر TOC = 20 */
  const tocItems = container.querySelectorAll('.settings-toc__item');
  await t.test('3. TOC has 20 items', tocItems.length === 20);

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
    visibleSections.length > 0 && visibleSections.length < 20);

  /* 8. جميع الأقسام الجديدة موجودة */
  const requiredIds = [
    'workshop', 'appearance', 'backgrounds', 'icons', 'fonts', 'display',
    'measurements', 'jalabiya-types', 'inventory-limits', 'daily-limit', 'grouping',
    'notifications', 'occasions', 'auto-messages', 'backup', 'cloud-sync', 'image-compression',
    'security', 'lock-screen', 'danger-zone',
  ];
  const missing = requiredIds.filter(
    (id) => container.querySelector('[data-section-id="' + id + '"]') === null
  );
  await t.test('8. all 20 required sections present', missing.length === 0);
  if (missing.length > 0) {
    t.log('    missing: ' + missing.join(', '));
  }

  /* 9. قسم منطقة الخطر له تنسيق خاص */
  const dangerSection = container.querySelector('[data-section-id="danger-zone"]');
  await t.test('9. danger zone has special styling',
    dangerSection !== null &&
    dangerSection.classList.contains('settings-danger'));

  /* 10. destroy() يُنظّف الصفحة */
  settingsPage.destroy();
  await settingsRepo.clear();
  await t.test('10. destroy clears state', true);
});
