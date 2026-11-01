/* ==========================================================================
   v3524-split-payments-invoice.test.js — تقسيم payments.js وinvoice-image.js (v3.5.24، بلا تغيير سلوك)
   ==========================================================================
   يتحقق أن: الواجهة العامة للملفين لم تتغيّر (أسماء التصدير)، والوحدات الجديدة تؤدي دورها،
   والصفحة ترسم وتفلتر وتُدمَّر بأمان، والصور تُرسم بالمقاسات المعتادة، ولا استيراد دائري ولا import() ولا innerHTML،
   ولا ملف منها يتجاوز 300 سطر.
   ========================================================================== */
import { register } from '../registry.js';
import * as paymentsMod from '../../pages/payments.js';
import * as formMod from '../../pages/payments-form.js';
import * as cardMod from '../../pages/payments-card.js';
import * as listMod from '../../pages/payments-list.js';
import * as imgMod from '../../services/invoice-image.js';
import * as penMod from '../../services/invoice-image-pen.js';
import * as orderMod from '../../services/invoice-image-order.js';
import * as stMod from '../../services/invoice-image-statement.js';
import * as rcMod from '../../services/invoice-image-receipt.js';
import * as outMod from '../../services/invoice-image-output.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAY_FILES = ['pages/payments', 'pages/payments-form', 'pages/payments-card', 'pages/payments-list'];
const IMG_FILES = ['services/invoice-image', 'services/invoice-image-pen', 'services/invoice-image-order',
  'services/invoice-image-statement', 'services/invoice-image-receipt', 'services/invoice-image-output'];

register('v3.5.24 payments + invoice-image — تقسيم الملفات', async (t) => {
  /* --- 1) الواجهات العامة --- */
  await t.test('1. payments.js يصدّر paymentsPage فقط (render + destroy)',
    Object.keys(paymentsMod).join() === 'paymentsPage' &&
    typeof paymentsMod.paymentsPage.render === 'function' && typeof paymentsMod.paymentsPage.destroy === 'function');
  await t.test('2. invoice-image.js يصدّر الدوال السبع نفسها بلا زيادة ولا نقص',
    Object.keys(imgMod).sort().join() === [
      'renderCustomerStatementCanvas', 'renderDeliveryReceiptCanvas', 'renderOrderInvoiceCanvas',
      'shareCustomerStatementImage', 'shareDeliveryReceiptImage', 'shareOrderInvoiceImage', 'shareRenderedReceipt',
    ].join());
  await t.test('3. وحدات الدفعات تصدّر أسماءها',
    typeof formMod.openPaymentForm === 'function' && typeof cardMod.buildPaymentCard === 'function' &&
    typeof cardMod.deletePayment === 'function' && ['renderStats', 'renderFilters', 'renderList', 'disposePaymentsList'].every((k) => typeof listMod[k] === 'function'));
  await t.test('4. وحدات الصورة تصدّر أسماءها',
    ['plain', 'loadLogo', 'wrapLines', 'makePen', 'drawHeader', 'drawFooter', 'drawInfoRows', 'drawTable'].every((k) => typeof penMod[k] === 'function') &&
    penMod.W === 800 && typeof orderMod.layoutInvoice === 'function' && typeof stMod.layoutStatement === 'function' &&
    typeof rcMod.layoutDeliveryReceipt === 'function' && typeof outMod.paint === 'function' && typeof outMod.shareCanvas === 'function');

  /* --- 2) صفحة الدفعات: رسم + فلتر + بحث + تدمير --- */
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await paymentsMod.paymentsPage.render(box);
    await t.test('5. الصفحة ترسم الإحصائيات والفلاتر والقائمة وزر الإضافة',
      !!box.querySelector('#payments-stats') && !!box.querySelector('#payments-filters') && !!box.querySelector('#payments-list') &&
      box.textContent.includes('إضافة دفعة'));
    await t.test('6. ثلاثة أزرار فلتر (الكل/لها طلب/بدون طلب)', box.querySelectorAll('#payments-filters button').length === 3);
    const search = box.querySelector('input[type=search]');
    search.value = 'zzzz-لا-يوجد-مطلقاً'; search.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    await t.test('7. البحث بلا نتائج يعرض حالة «لا نتائج»', box.querySelector('#payments-list').textContent.includes('لا نتائج'));
    search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true }));
    box.querySelectorAll('#payments-filters button')[1].click();
    await sleep(50);
    await t.test('8. الضغط على فلتر يجعله الزر الأساسي', box.querySelectorAll('#payments-filters button')[1].className.includes('btn--primary'));
  } finally {
    paymentsMod.paymentsPage.destroy();
    paymentsMod.paymentsPage.destroy();   /* مرتين بأمان */
    box.remove();
  }
  await t.test('9. destroy مرتين لا يرمي خطأ', true);

  /* --- 3) الصور: رسم فعلي بالمقاسات المعتادة (دقة ×2 وعرض 1600) --- */
  const order = { id: 'order-123456', customerId: 'c1', status: 'pending', items: [{ id: 'a', name: 'جلابية', price: 500, quantity: 2 }], subtotal: 1000, amount: 1000, deposit: 200, createdAt: Date.now() };
  const cust = { id: 'c1', name: 'أحمد', phone: '01012345678' };
  const inv = await imgMod.renderOrderInvoiceCanvas(order, cust);
  await t.test('10. الفاتورة: عرض 1600 وارتفاع موجب والمتبقي 800', inv.canvas.width === 1600 && inv.canvas.height > 400 && inv.model.remaining === 800);
  const st = await imgMod.renderCustomerStatementCanvas(cust, [order], []);
  await t.test('11. كشف الحساب: عرض 1600 وارتفاع موجب', st.canvas.width === 1600 && st.canvas.height > 400);
  const withDel = { ...order, id: 'order-777777', items: [{ id: 'a', name: 'جلابية', price: 500, quantity: 2 }], deliveries: [{ id: 'd1', at: Date.now(), items: [{ id: 'a', qty: 1 }] }] };
  const rc = await imgMod.renderDeliveryReceiptCanvas(withDel, 'd1', cust);
  await t.test('12. إيصال التسليم: عرض 1600 والمعرّف 777777', rc.canvas.width === 1600 && rc.id6 === '777777');
  let bad = false;
  try { await imgMod.renderDeliveryReceiptCanvas(withDel, 'nope', cust); } catch (e) { bad = /غير موجودة/.test(e.message); }
  await t.test('13. تسليمة غير موجودة ← الخطأ نفسه كما كان', bad);
  await t.test('14. plain يزيل الإيموجي ويقصّ المسافات', penMod.plain('  أحمد 😀 ') === 'أحمد' && penMod.plain(null) === '');

  /* --- 4) حراس المصدر --- */
  const texts = await Promise.all([...PAY_FILES, ...IMG_FILES].map(async (f) => (await fetch(new URL('../../' + f + '.js', import.meta.url))).text()));
  await t.test('15. حراس: لا import() ديناميكي ولا innerHTML في الملفات العشرة', texts.every((s) => !/\bimport\s*\(/.test(s) && !/\.innerHTML\s*=/.test(s)));
  await t.test('16. حراس: وحدات الدفعات الثلاث لا تستورد payments.js (لا دوران)',
    texts.slice(1, 4).every((s) => !/from\s+'\.\/payments\.js'/.test(s)));
  await t.test('17. حراس: وحدات الصورة الخمس لا تستورد invoice-image.js (لا دوران)',
    texts.slice(5 + 0).every((s) => !/from\s+'\.\/invoice-image\.js'/.test(s)));
  await t.test('18. حراس: لا ملف منها يتجاوز 300 سطر', texts.every((s) => s.split('\n').length <= 300));
});
