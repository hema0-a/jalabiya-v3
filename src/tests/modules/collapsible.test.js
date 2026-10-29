/* collapsible.test.js - ui/collapsible */
import { register } from '../registry.js';
import { createCollapsible, _internal } from '../../ui/collapsible.js';

register('ui/collapsible.js', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);

  const content = document.createElement('div');
  content.textContent = 'content';

  const c1 = createCollapsible({
    id: 'test-1',
    title: 'Section 1',
    content,
  });

  await t.test('1. returns node + functions',
    c1.node instanceof HTMLElement &&
    typeof c1.open === 'function' &&
    typeof c1.close === 'function' &&
    typeof c1.toggle === 'function' &&
    typeof c1.isOpen === 'function' &&
    typeof c1.setId === 'function');

  await t.test('2. default closed + aria=false',
    c1.isOpen() === false &&
    c1.node.querySelector('.collapsible__header').getAttribute('aria-expanded') === 'false');

  c1.open();
  await t.test('3. open() opens + class + aria=true',
    c1.isOpen() === true &&
    c1.node.classList.contains('collapsible--open') &&
    c1.node.querySelector('.collapsible__header').getAttribute('aria-expanded') === 'true');

  c1.close();
  await t.test('4. close() closes',
    c1.isOpen() === false &&
    !c1.node.classList.contains('collapsible--open'));

  c1.toggle();
  const afterOpen = c1.isOpen();
  c1.toggle();
  const afterClose = c1.isOpen();
  await t.test('5. toggle() switches',
    afterOpen === true && afterClose === false);

  c1.open();
  const stored = JSON.parse(localStorage.getItem(_internal.STATE_KEY) || '{}');
  await t.test('6. state saved to localStorage',
    stored['test-1'] === true);

  const contentEl = c1.node.querySelector('.collapsible__content');
  await t.test('7. content has role=region + aria-labelledby',
    contentEl.getAttribute('role') === 'region' &&
    contentEl.getAttribute('aria-labelledby') === 'collapsible-header-test-1');

  const header = c1.node.querySelector('.collapsible__header');
  await t.test('8. header has aria-controls pointing to content',
    header.getAttribute('aria-controls') === 'collapsible-content-test-1');

  localStorage.removeItem(_internal.STATE_KEY);
});
