/* ==========================================================================
   audit-3351.test.js — مشاركة الفاتورة كصورة (v3.3.51)
   - الأرقام في الصورة من نفس نموذج الفاتورة المطبوعة (buildOrderInvoiceModel).
   - المشاركة: Web Share مع ملف PNG؛ الإلغاء لا يُعدّ خطأً؛ والبديل تنزيل + محادثة واتساب العميل.
   ========================================================================== */

import { register } from '../registry.js';
import { writeBatch } from '../../data/idb.js';
import { buildOrderInvoiceModel } from '../../services/invoice-print.js';
import { renderOrderInvoiceCanvas, shareOrderInvoiceImage } from '../../services/invoice-image.js';

/** تجاوز مؤقت لخاصية في navigator/window ثم استعادتها. */
function stub(target, key, value) {
  const had = Object.prototype.hasOwnProperty.call(target, key);
  const prev = target[key];
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  return () => { if (had) Object.defineProperty(target, key, { value: prev, configurable: true, writable: true }); else delete target[key]; };
}

register('audit v3.3.51 invoice image share', async (t) => {
  const now = Date.now();
  const order = {
    id: 't3351-order-998877', customerId: 't3351-c', status: 'in_progress', createdAt: now,
    items: [{ name: 'جلابية رجالي', price: 800, quantity: 2 }, { name: 'سروال', price: 150, quantity: 1 }],
    subtotal: 1750, amount: 1750, deposit: 500,
  };
  const customer = { id: 't3351-c', name: 'عميل اختبار', phone: '01012345678' };
  await writeBatch({ orders: { records: [{ ...order, updatedAt: now }] } });

  const restores = [];
  try {
    const model = await buildOrderInvoiceModel(order);
    await t.test('1. نموذج الفاتورة: المتبقي = الإجمالي − المقدم (1750 − 500)',
      model.total === 1750 && model.deposit === 500 && model.remaining === 1250 && model.items.length === 2);

    const { canvas, model: m2 } = await renderOrderInvoiceCanvas(order, customer);
    await t.test('2. الصورة بعرض 1600px وارتفاع معقول، وبنفس أرقام النموذج',
      canvas.width === 1600 && canvas.height > 900 && canvas.height < 4000 && m2.remaining === 1250);

    /* --- 3. Web Share مع ملف PNG --- */
    let shared = null;
    restores.push(stub(navigator, 'canShare', (d) => !!(d && d.files && d.files.length)));
    restores.push(stub(navigator, 'share', async (d) => { shared = d; }));
    const r1 = await shareOrderInvoiceImage(order, customer);
    await t.test('3. المشاركة: ملف PNG باسم invoice-<رقم>.png ونص يذكر المتبقي',
      r1 === 'shared' && shared && shared.files[0].type === 'image/png'
      && shared.files[0].name === 'invoice-998877.png' && shared.files[0].size > 2000
      && /1,?250/.test(shared.text));

    /* --- 4. إلغاء المستخدم --- */
    navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
    const r2 = await shareOrderInvoiceImage(order, customer);
    await t.test('4. إلغاء المشاركة يُرجع cancelled ولا يُنزّل ولا يفتح واتساب', r2 === 'cancelled');

    /* --- 5. بلا Web Share: تنزيل + محادثة العميل (رقم دولي مطبَّع) --- */
    restores.push(stub(navigator, 'canShare', undefined));
    let opened = null, downloaded = null;
    restores.push(stub(window, 'open', (u) => { opened = u; return null; }));
    const origCreate = URL.createObjectURL;
    restores.push(stub(URL, 'createObjectURL', (b) => { downloaded = b; return origCreate.call(URL, b); }));
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return origClick.call(this); };
    try {
      const r3 = await shareOrderInvoiceImage(order, customer);
      await t.test('5. البديل: تنزيل الصورة وفتح wa.me برقم العميل الدولي',
        r3 === 'downloaded' && downloaded && downloaded.type === 'image/png'
        && typeof opened === 'string' && opened.startsWith('https://wa.me/201012345678?text='));
    } finally { HTMLAnchorElement.prototype.click = origClick; }

    /* --- 6. عميل بلا هاتف: تنزيل فقط --- */
    opened = null;
    const r4 = await shareOrderInvoiceImage(order, { id: 'x', name: 'بلا هاتف' });
    await t.test('6. عميل بلا هاتف: يُنزَّل فقط ولا تُفتح محادثة', r4 === 'downloaded' && opened === null);

    /* --- 7. طلب بلا عميل (محذوف): لا يسقط الرسم --- */
    const { canvas: c3 } = await renderOrderInvoiceCanvas(order, null);
    await t.test('7. عميل محذوف: الصورة تُرسم بلا خطأ', c3.width === 1600 && c3.height > 900);
  } finally {
    restores.reverse().forEach((r) => { try { r(); } catch (e) { /* ignore */ } });
    await writeBatch({ orders: { deletes: [order.id] } });
  }
});
