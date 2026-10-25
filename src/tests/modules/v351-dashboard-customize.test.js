/* ==========================================================================
   v351-dashboard-customize.test.js — تخصيص لوحة التحكم على DOM (v3.5.1)
   ========================================================================== */
import { register } from '../registry.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { LAYOUT_KEY } from '../../services/dashboard-layout.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (box) => Array.from(box.querySelectorAll('.dash-section')).map((n) => n.getAttribute('data-collapsible-id')).join();
async function waitFor(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); }
  return !!fn();
}

register('v3.5.1 dashboard — تخصيص اللوحة (DOM)', async (t) => {
  localStorage.removeItem(LAYOUT_KEY);
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await dashboardPage.render(box);
    await t.test('1. الافتراضي: سبعة أقسام بالترتيب القديم + الإجراءات السريعة + أربع بطاقات + زر «تخصيص»',
      ids(box) === 'dash-appts,dash-week,dash-due,dash-sales,dash-finance,dash-orders,dash-recent' &&
      !!box.querySelector('.dash-hero .dash-quick') && box.querySelectorAll('.stat--link').length === 4 && !!box.querySelector('.dash-sections__custom'));

    await t.test('2. زر «فتح الكل» ما زال أول زر بالشريط (لا يتغيّر سلوكه)',
      box.querySelector('.dash-sections__bar').firstElementChild.classList.contains('dash-sections__toggle'));

    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ hidden: ['dash-sales', 'quick'], order: ['dash-recent'] }));
    await dashboardPage.render(box);
    await t.test('3. تفضيل محفوظ: قسم مخفي، وقسم مُقدَّم، وإجراءات سريعة مخفية',
      ids(box) === 'dash-recent,dash-appts,dash-week,dash-due,dash-finance,dash-orders' && !box.querySelector('.dash-quick') && !!box.querySelector('.dash-hero'));

    await t.test('4. «يحتاج إجراءك» وبطاقات الأرقام باقيتان ولا تتأثران', !!box.querySelector('.dash-attention') && box.querySelectorAll('.stat--link').length === 4);

    localStorage.setItem(LAYOUT_KEY, '{bad json');
    await dashboardPage.render(box);
    await t.test('5. تفضيل تالف ← اللوحة الافتراضية بلا خطأ', ids(box).split(',').length === 7 && !!box.querySelector('.dash-quick'));

    localStorage.removeItem(LAYOUT_KEY);
    await dashboardPage.render(box);
    box.querySelector('.dash-sections__custom').click();
    const dlg = () => document.querySelector('.modal .dash-custom');
    await t.test('6. نقر «تخصيص» يفتح نافذة بتسع صفوف (كتلتان + سبعة أقسام)', !!dlg() && dlg().querySelectorAll('.dash-custom__row').length === 9);

    await t.test('7. أول قسم لا يُحرَّك لأعلى وآخر قسم لا يُحرَّك لأسفل (أزرار معطّلة)',
      (() => {
        const moves = Array.from(dlg().querySelectorAll('.dash-custom__move'));
        return moves.length === 14 && moves[0].disabled === true && moves[moves.length - 1].disabled === true && moves[1].disabled === false;
      })());

    const cb = dlg().querySelector('#dash-custom-dash-sales');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await t.test('8. إلغاء تحديد قسم يحفظ التفضيل فوراً ويُعتّم صفّه',
      JSON.parse(localStorage.getItem(LAYOUT_KEY)).hidden.includes('dash-sales') && !!dlg().querySelector('.dash-custom__row--off'));

    Array.from(dlg().querySelectorAll('.dash-custom__move'))[1].click();   /* ▼ لأول قسم (مواعيد اليوم): الأزرار بالتناوب ▲▼ لكل قسم */
    await t.test('9. ▼ ينقل القسم الأول إلى الثاني في الحفظ',
      JSON.parse(localStorage.getItem(LAYOUT_KEY)).order.slice(0, 2).join() === 'dash-week,dash-appts');

    document.querySelector('.modal [data-action="done"]').click();
    const applied = await waitFor(() => ids(box) === 'dash-week,dash-appts,dash-due,dash-finance,dash-orders,dash-recent');
    await t.test('10. «تم» يغلق النافذة ويُطبّق التغيير على اللوحة', applied && !document.querySelector('.modal .dash-custom'));

    box.querySelector('.dash-sections__custom').click();
    document.querySelector('.modal [data-action="reset"]').click();
    await t.test('11. «استعادة الافتراضي» تمسح التفضيل المحفوظ', localStorage.getItem(LAYOUT_KEY) === null);
    document.querySelector('.modal [data-action="done"]').click();
    const restored = await waitFor(() => ids(box).split(',').length === 7 && ids(box).startsWith('dash-appts'));
    await t.test('12. بعد الاستعادة تعود اللوحة الافتراضية كاملة', restored && !!box.querySelector('.dash-quick'));

    box.querySelector('.dash-sections__custom').click();
    document.querySelector('.modal [data-action="done"]').click();
    await sleep(150);
    await t.test('13. فتح النافذة وإغلاقها بلا تغيير لا يترك تفضيلاً ولا نافذة', localStorage.getItem(LAYOUT_KEY) === null && !dlg());
  } finally {
    localStorage.removeItem(LAYOUT_KEY);
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    document.body.style.overflow = '';
    dashboardPage.destroy();
    box.remove();
  }
});
