/* modal-sheet.test.js - ui/modal.js: إتاحة + تركيز + مقبض السحب (v3.3.63) */
import { register } from '../registry.js';
import { modal } from '../../ui/modal.js';

const tab = (target, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));

register('ui/modal.js (a11y + sheet)', async (t) => {
  modal.closeAll();

  const opener = document.createElement('button');
  opener.textContent = 'open';
  document.body.appendChild(opener);
  opener.focus();

  const h = modal.open({
    title: 'عنوان',
    body: 'نص',
    actions: [{ text: 'أ', variant: 'ghost' }, { text: 'ب', variant: 'primary' }],
  });
  const dlg = h.node.querySelector('.modal');
  const titleEl = h.node.querySelector('.modal__title');

  await t.test('1. aria-labelledby يشير لعنوان النافذة',
    !!titleEl.id && dlg.getAttribute('aria-labelledby') === titleEl.id);
  await t.test('2. التركيز ينتقل للنافذة عند الفتح', document.activeElement === dlg);

  const btns = h.node.querySelectorAll('.modal__footer button');
  const closeBtn = h.node.querySelector('.modal__close');
  btns[btns.length - 1].focus();
  tab(btns[btns.length - 1]);
  await t.test('3. Tab من آخر عنصر يلتف لأول عنصر (حبس التركيز)', document.activeElement === closeBtn);
  tab(closeBtn, true);
  await t.test('4. Shift+Tab من أول عنصر يلتف لآخر عنصر', document.activeElement === btns[btns.length - 1]);

  h.close();
  await t.test('5. إغلاق النافذة يعيد التركيز لزر الفتح', document.activeElement === opener);

  const h2 = modal.open({ title: 'س', body: 'x', variant: 'sheet' });
  await t.test('6. sheet قابلة للإغلاق: يوجد مقبض سحب', !!h2.node.querySelector('.modal__grabber'));
  h2.close();

  const h3 = modal.open({ title: 'س', body: 'x' });
  await t.test('7. النافذة الوسطى: بلا مقبض سحب', h3.node.querySelector('.modal__grabber') === null);
  h3.close();

  const h4 = modal.open({ title: 'س', body: 'x', variant: 'sheet', closable: false });
  await t.test('8. sheet غير قابلة للإغلاق: بلا مقبض', h4.node.querySelector('.modal__grabber') === null);
  h4.close();

  /* مكدس + ESC ما زالا يعملان بعد إعادة الهيكلة */
  const m1 = modal.open({ title: '1', body: 'a' });
  const m2 = modal.open({ title: '2', body: 'b' });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await t.test('9. ESC يغلق العلوية فقط', !document.body.contains(m2.node) && document.body.contains(m1.node));
  modal.closeAll();
  await t.test('10. closeAll يغلق الكل ويعيد التمرير', !document.body.contains(m1.node) && document.body.style.overflow === '');

  let closed = 0;
  const m3 = modal.open({ title: '3', body: 'c', onClose: () => closed++ });
  m3.close(); m3.close();
  await t.test('11. onClose مرة واحدة حتى مع إغلاق مزدوج', closed === 1);

  opener.remove();
});
