/* ==========================================================================
   v381-input-checks.test.js — المدقّق الذكي للمدخلات (v3.8.1)
   ========================================================================== */
import { register } from '../registry.js';
import { checkPhone, checkName, checkPrice, checkQty, checkDueDate, checkDeposit } from '../../services/input-checks.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12).getTime();
const day = (n) => new Date(2026, 5, 10 + n, 9).getTime();
const lv = (r) => (r ? r.level : null);

register('v3.8.1 المدقّق الذكي', async (t) => {
  await t.test('1. هاتف فارغ ⟵ null', checkPhone('') === null && checkPhone(null) === null && checkPhone('  ') === null);
  await t.test('2. هاتف صحيح (محلي/دولي/أرقام عربية)', lv(checkPhone('01012345678')) === 'good' && lv(checkPhone('+201012345678')) === 'good' && lv(checkPhone('٠١٠١٢٣٤٥٦٧٨')) === 'good');
  await t.test('3. هاتف ناقص ⟵ تحذير مع العدد', (() => { const r = checkPhone('0101234'); return r.level === 'warn' && r.msg.includes('7'); })());
  await t.test('4. هاتف زائد ⟵ تحذير', lv(checkPhone('010123456789')) === 'warn');
  await t.test('5. بادئة خاطئة ⟵ خطأ', lv(checkPhone('01312345678')) === 'danger' && lv(checkPhone('09012345678')) === 'danger');
  await t.test('6. بلا الصفر الأول ⟵ معلومة', lv(checkPhone('1012345678')) === 'info');
  await t.test('7. رقم أرضي ⟵ معلومة', lv(checkPhone('0227654321')) === 'info');
  await t.test('8. نص بلا أرقام ⟵ خطأ', lv(checkPhone('abc')) === 'danger');
  await t.test('9. اسم قصير/أرقام/طويل', lv(checkName('أ')) === 'warn' && lv(checkName('01012345678')) === 'warn' && lv(checkName('ا'.repeat(60))) === 'info' && checkName('محمد علي') === null && checkName('') === null);
  await t.test('10. سعر: فارغ/نص/سالب/صفر', checkPrice('') === null && lv(checkPrice('abc')) === 'danger' && lv(checkPrice('-5')) === 'danger' && lv(checkPrice('0')) === 'info');
  await t.test('11. سعر عالٍ بلا مرجع', lv(checkPrice('12000')) === 'info' && lv(checkPrice('50000')) === 'warn' && checkPrice('450') === null);
  await t.test('12. سعر مقابل المعتاد: ×3 أو ÷3 ⟵ تحذير', lv(checkPrice('4500', { reference: 450 })) === 'warn' && lv(checkPrice('100', { reference: 450 })) === 'warn' && checkPrice('500', { reference: 450 }) === null);
  await t.test('13. مع مرجع لا تُطبّق الحدود العامة', checkPrice('12000', { reference: 10000 }) === null);
  await t.test('14. أرقام عربية في السعر', checkPrice('٤٥٠') === null && lv(checkPrice('٥٠٠٠٠')) === 'warn');
  await t.test('15. كمية: صغيرة/كسر/كبيرة/ضخمة', lv(checkQty('0')) === 'danger' && lv(checkQty('1.5')) === 'warn' && lv(checkQty('60')) === 'info' && lv(checkQty('300')) === 'warn' && checkQty('3') === null && checkQty('') === null);
  await t.test('16. موعد: ماضٍ ⟵ تحذير مع الأيام', (() => { const r = checkDueDate(day(-3), NOW); return r.level === 'warn' && r.msg.includes('3'); })());
  await t.test('17. موعد: اليوم والقريب ⟵ null، والبعيد ⟵ معلومة', checkDueDate(day(0), NOW) === null && checkDueDate(day(10), NOW) === null && lv(checkDueDate(day(120), NOW)) === 'info' && checkDueDate(null, NOW) === null);
  await t.test('18. مقدم أكبر من الإجمالي', lv(checkDeposit(600, 500)) === 'warn' && checkDeposit(200, 500) === null && lv(checkDeposit(-1, 500)) === 'danger' && checkDeposit('', 500) === null);
  const ui = await src('ui/input-hints.js');
  await t.test('19. واجهة التلميحات: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
  const cf = await src('pages/customers-form.js');
  await t.test('20. نموذج العميل مربوط بالهاتف والاسم', cf.includes('attachHint(phoneInput, checkPhone)') && cf.includes('attachHint(nameInput, checkName)'));
  const ir = await src('pages/orders/item-rows.js');
  await t.test('21. بند الطلب مربوط بالسعر (مع الكتالوج) والكمية', ir.includes('attachHint(priceIn') && ir.includes('reference: known') && ir.includes('attachHint(qtyIn, checkQty)'));
  const fs = await src('pages/orders/form-schedule.js');
  await t.test('22. موعد التسليم مربوط', fs.includes('checkDueDate(ts, Date.now())'));
});
