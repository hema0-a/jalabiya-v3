/* ==========================================================================
   audit-3352.test.js — مشاركة كشف حساب العميل كصورة (v3.3.52)
   - الإجماليات من buildCustomerStatementModel نفسه الذي تعتمده الطباعة.
   - الصورة تُقتطع لآخر 25 سجلاً (والإجماليات تشمل الكل)، والمشاركة كما في الفاتورة.
   ========================================================================== */

import { register } from '../registry.js';
import { buildCustomerStatementModel } from '../../services/invoice-print.js';
import { renderCustomerStatementCanvas, shareCustomerStatementImage } from '../../services/invoice-image.js';

/** تجاوز مؤقت لخاصية ثم استعادتها. */
function stub(target, key, value) {
  const had = Object.prototype.hasOwnProperty.call(target, key);
  const prev = target[key];
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  return () => { if (had) Object.defineProperty(target, key, { value: prev, configurable: true, writable: true }); else delete target[key]; };
}

register('audit v3.3.52 customer statement image', async (t) => {
  const now = Date.now(), D = 86400000;
  const customer = { id: 't3352-cust-445566', name: 'عميل كشف', phone: '01112345678' };
  const mkOrders = (n) => Array.from({ length: n }, (_, i) => ({
    id: 't3352-o' + i, customerId: customer.id, status: 'delivered', amount: 100, createdAt: now - i * D,
  }));
  const pays = [{ id: 't3352-p1', orderId: 't3352-o0', customerId: customer.id, amount: 40, method: 'cash', createdAt: now }];

  const restores = [];
  try {
    /* --- 1. قواعد الإجماليات: الملغى لا يُحسب --- */
    const withCancelled = [
      { id: 'a1', status: 'delivered', amount: 1000, createdAt: now },
      { id: 'a2', status: 'cancelled', amount: 500, createdAt: now },
    ];
    const m = await buildCustomerStatementModel(customer, withCancelled, [{ id: 'pp', orderId: 'a1', amount: 400, method: 'cash', createdAt: now }]);
    await t.test('1. الإجماليات: الطلب الملغى لا يُحسب (1000 − 400 = 600)',
      m.totalOrders === 1000 && m.totalPaid === 400 && m.remaining === 600);

    /* --- 2. الاقتطاع --- */
    const h3 = (await renderCustomerStatementCanvas(customer, mkOrders(3), pays)).canvas.height;
    const h30 = (await renderCustomerStatementCanvas(customer, mkOrders(30), pays)).canvas.height;
    const h40 = (await renderCustomerStatementCanvas(customer, mkOrders(40), pays)).canvas.height;
    await t.test('2. الصورة بعرض 1600px، وتُقتطع بعد 25 سجلاً (30 و40 طلباً بالارتفاع نفسه، و3 أقصر)',
      h30 === h40 && h3 < h30);

    /* --- 3. قوائم فارغة --- */
    const { canvas: ce } = await renderCustomerStatementCanvas({ id: 'e', name: 'فارغ' }, [], []);
    await t.test('3. عميل بلا طلبات ولا دفعات: تُرسم الصورة بلا خطأ', ce.width === 1600 && ce.height > 600);

    /* --- 4. Web Share --- */
    let shared = null;
    restores.push(stub(navigator, 'canShare', (d) => !!(d && d.files && d.files.length)));
    restores.push(stub(navigator, 'share', async (d) => { shared = d; }));
    const r1 = await shareCustomerStatementImage(customer, mkOrders(3), pays);
    await t.test('4. المشاركة: ملف PNG باسم statement-<رقم>.png ونص فيه اسم العميل والمتبقي',
      r1 === 'shared' && shared && shared.files[0].type === 'image/png'
      && shared.files[0].name === 'statement-445566.png' && shared.files[0].size > 2000
      && shared.text.includes('عميل كشف') && /260/.test(shared.text));

    /* --- 5. إلغاء المستخدم --- */
    navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
    await t.test('5. إلغاء المشاركة يُرجع cancelled', (await shareCustomerStatementImage(customer, mkOrders(1), [])) === 'cancelled');

    /* --- 6. بلا Web Share: تنزيل + wa.me برقم دولي --- */
    restores.push(stub(navigator, 'canShare', undefined));
    let opened = null, downloaded = null;
    restores.push(stub(window, 'open', (u) => { opened = u; return null; }));
    const origCreate = URL.createObjectURL;
    restores.push(stub(URL, 'createObjectURL', (b) => { downloaded = b; return origCreate.call(URL, b); }));
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return origClick.call(this); };
    try {
      const r3 = await shareCustomerStatementImage(customer, mkOrders(2), pays);
      await t.test('6. البديل: تنزيل الصورة وفتح wa.me برقم العميل الدولي',
        r3 === 'downloaded' && downloaded && downloaded.type === 'image/png'
        && typeof opened === 'string' && opened.startsWith('https://wa.me/201112345678?text='));
      opened = null;
      const r4 = await shareCustomerStatementImage({ id: 'np', name: 'بلا هاتف' }, [], []);
      await t.test('7. عميل بلا هاتف: يُنزَّل فقط ولا تُفتح محادثة', r4 === 'downloaded' && opened === null);
    } finally { HTMLAnchorElement.prototype.click = origClick; }
  } finally {
    restores.reverse().forEach((r) => { try { r(); } catch (e) { /* ignore */ } });
  }
});
