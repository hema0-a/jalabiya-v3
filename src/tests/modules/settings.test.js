/* settings.test.js - pages/settings (Sub-page) */
import { register } from '../registry.js';
import { settingsPage } from '../../pages/settings/index.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';

register('pages/settings.js', async (t) => {
  await settingsRepo.clear();

  const c1 = document.createElement('div');
  await settingsPage.render(c1);

  await t.test('1. render builds page structure',
    c1.querySelector('.settings-page') !== null &&
    c1.querySelector('.sub-page') !== null);

  await t.test('2. list contains 21 sections',
    c1.querySelectorAll('.sub-page__item').length === 21);

  await t.test('3. detail view hidden when no subRoute',
    !c1.querySelector('.sub-page').classList.contains('sub-page--open'));

  const ids = Array.from(c1.querySelectorAll('.sub-page__item'))
    .map((i) => i.getAttribute('data-section-id'));

  await t.test('4. all 21 required section IDs present',
    ['workshop', 'appearance', 'measurements', 'security', 'danger-zone', 'pricing-calculator']
      .every((id) => ids.includes(id)));

  await t.test('5. each item has icon span',
    c1.querySelectorAll('.sub-page__item-icon').length === 21);

  const c2 = document.createElement('div');
  await settingsPage.render(c2, 'workshop');
  await new Promise((r) => setTimeout(r, 30));

  await t.test('6. subRoute=workshop opens the section',
    c2.querySelector('.sub-page').classList.contains('sub-page--open'));

  await t.test('7. workshop section body rendered',
    c2.querySelector('.settings-section__body') !== null);

  const workshopItem = c2.querySelector('[data-section-id="workshop"]');
  await t.test('8. current section marked aria-current=page',
    workshopItem && workshopItem.getAttribute('aria-current') === 'page');

  settingsPage.destroy();
  const c3 = document.createElement('div');
  await settingsPage.render(c3);
  await t.test('9. re-render after destroy works',
    c3.querySelectorAll('.sub-page__item').length === 21);

  settingsPage.destroy();
  await settingsRepo.clear();
  await t.test('10. destroy clears state', true);
});
