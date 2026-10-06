/* sub-page.test.js - ui/sub-page */
import { register } from '../registry.js';
import { createSubPageManager } from '../../ui/sub-page.js';

register('ui/sub-page.js', async (t) => {
  const mockRender = (container, id) => {
    const p = document.createElement('div');
    p.textContent = 'Rendered: ' + id;
    container.appendChild(p);
  };

  const sections = [
    { id: 'sec-a', title: 'Section A', icon: '🅰️', render: mockRender },
    { id: 'sec-b', title: 'Section B', icon: '🅱️', render: mockRender },
    { id: 'sec-c', title: 'Section C', render: mockRender },
  ];

  const mgr = createSubPageManager({ baseId: 'test', sections });

  await t.test('1. returns node + functions',
    mgr.node instanceof HTMLElement &&
    typeof mgr.openSection === 'function' &&
    typeof mgr.closeSection === 'function' &&
    typeof mgr.isOpen === 'function' &&
    typeof mgr.getCurrentSection === 'function');

  await t.test('2. list contains all sections',
    mgr.node.querySelectorAll('.sub-page__item').length === 3);

  await mgr.openSection('sec-a');
  await t.test('3. openSection opens + adds class',
    mgr.isOpen() === true &&
    mgr.node.classList.contains('sub-page--open') &&
    mgr.getCurrentSection() === 'sec-a');

  const contentEl = mgr.node.querySelector('.sub-page__content');
  await t.test('4. render callback populates content',
    contentEl.textContent.includes('Rendered: sec-a'));

  mgr.closeSection();
  await t.test('5. closeSection returns to list',
    mgr.isOpen() === false &&
    !mgr.node.classList.contains('sub-page--open') &&
    mgr.getCurrentSection() === null);

  await mgr.openSection('sec-b');
  const detailEl = mgr.node.querySelector('.sub-page__detail');
  const listEl = mgr.node.querySelector('.sub-page__list');
  await t.test('6. ARIA updated on open',
    detailEl.getAttribute('aria-hidden') === 'false' &&
    listEl.getAttribute('aria-hidden') === 'true');

  await t.test('7. current item marked aria-current=page',
    mgr.node.querySelector('[data-section-id="sec-b"]')
      .getAttribute('aria-current') === 'page');

  mgr.closeSection();
  mgr.node.querySelector('[data-section-id="sec-c"]').click();
  await new Promise((r) => setTimeout(r, 10));
  await t.test('8. clicking item opens its section',
    mgr.getCurrentSection() === 'sec-c' &&
    contentEl.textContent.includes('Rendered: sec-c'));

  mgr.closeSection();
});
