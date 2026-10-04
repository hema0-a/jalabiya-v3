/* ==========================================================================
   ui.test.js — اختبارات مكونات الواجهة
   ==========================================================================
   16 اختباراً: toast(5) + modal(5) + controls(6)
   ========================================================================== */

import { register } from '../registry.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle, createColorPicker, createSlider } from '../../ui/controls.js';

/* ===== toast.js (5) ===== */
register('toast.js', async (t) => {
  toast.clear();

  const r1 = toast.success('اختبار نجاح');
  const c1 = document.getElementById('toast-container');
  await t.test('1. toast.success adds node to container',
    c1 && c1.contains(r1.node));

  await t.test('2. toast.success has correct class',
    r1.node.classList.contains('toast--success'));

  toast.danger('خطر');
  await t.test('3. container holds multiple toasts',
    c1.children.length >= 2);

  const hasText = r1.node.textContent.includes('اختبار نجاح');
  await t.test('4. toast shows message text', hasText);

  toast.clear();
  await t.test('5. toast.clear empties container',
    c1.children.length === 0);
});

/* ===== modal.js (5) ===== */
register('modal.js', async (t) => {
  modal.closeAll();

  const h1 = modal.open({ title: 'عنوان', body: 'محتوى' });
  await t.test('1. modal.open adds backdrop to body',
    document.body.contains(h1.node) &&
    h1.node.classList.contains('modal-backdrop'));

  const titleEl = h1.node.querySelector('.modal__title');
  await t.test('2. modal renders title',
    titleEl !== null && titleEl.textContent === 'عنوان');

  h1.close();
  await t.test('3. modal.close removes from DOM',
    !document.body.contains(h1.node));

  const p4 = modal.confirm({
    title: 'حذف',
    message: 'هل أنت متأكد؟',
    confirmText: 'نعم',
    cancelText: 'لا',
  });
  await new Promise((r) => setTimeout(r, 20));
  const backdrop4 = document.querySelector('.modal-backdrop');
  const confirmBtn = backdrop4
    ? backdrop4.querySelector('[data-action="confirm"]')
    : null;
  if (confirmBtn) confirmBtn.click();
  const r4 = await p4;
  await t.test('4. confirm resolves true on confirm click', r4 === true);

  const p5 = modal.confirm({
    title: 'حذف',
    message: 'هل أنت متأكد؟',
  });
  await new Promise((r) => setTimeout(r, 20));
  const backdrop5 = document.querySelector('.modal-backdrop');
  const cancelBtn = backdrop5
    ? backdrop5.querySelector('[data-action="cancel"]')
    : null;
  if (cancelBtn) cancelBtn.click();
  const r5 = await p5;
  await t.test('5. confirm resolves false on cancel click', r5 === false);

  modal.closeAll();
});

/* ===== controls.js (6) ===== */
register('controls.js', async (t) => {
  /* 1. createToggle */
  const t1 = createToggle({ label: 'تجربة', checked: false });
  await t.test('1. createToggle creates toggle element',
    t1 instanceof HTMLElement &&
    t1.classList.contains('toggle') &&
    t1.querySelector('.toggle__input') !== null);

  /* 2. الحالة الافتراضية */
  const t2 = createToggle({ checked: true });
  await t.test('2. toggle reflects initial checked state',
    t2.isChecked() === true);

  /* 3. onChange fires */
  let toggleVal = null;
  const t3 = createToggle({
    onChange: (v) => { toggleVal = v; },
  });
  const input3 = t3.querySelector('.toggle__input');
  input3.checked = true;
  input3.dispatchEvent(new Event('change', { bubbles: true }));
  await t.test('3. toggle onChange fires with new value',
    toggleVal === true);

  /* 4. color picker swatch */
  let colorVal = null;
  const cp = createColorPicker({
    value: '#1F6D57',
    onChange: (v) => { colorVal = v; },
  });
  const swatch = cp.querySelector('.color-picker__swatch[data-color="#B8863B"]');
  if (swatch) swatch.click();
  await t.test('4. colorPicker swatch click updates value',
    cp.getValue() === '#B8863B' && colorVal === '#B8863B');

  /* 5. slider إنشاء + عرض القيمة */
  const sl = createSlider({
    min: 0, max: 100, value: 40, label: 'اختر', suffix: '%',
  });
  const valueEl = sl.querySelector('.slider__value');
  await t.test('5. slider renders value with suffix',
    sl.classList.contains('slider') &&
    valueEl !== null &&
    valueEl.textContent.includes('40') &&
    valueEl.textContent.includes('%'));

  /* 6. slider onChange fires */
  let sliderVal = null;
  const sl2 = createSlider({
    min: 0, max: 100, value: 10,
    onChange: (v) => { sliderVal = v; },
  });
  const rangeInput = sl2.querySelector('.slider__input');
  rangeInput.value = '75';
  rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
  await t.test('6. slider onChange fires with new value',
    sliderVal === 75);
});
