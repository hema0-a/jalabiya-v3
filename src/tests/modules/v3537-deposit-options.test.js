/* ==========================================================================
   v3537-deposit-options.test.js — سياسة العربون: مبلغ ثابت، طلبات كبيرة، إعفاءات (v3.5.37)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { normalizePolicy, checkDeposit, DEFAULT_DEPOSIT_POLICY } from '../../services/deposit-policy.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';

register('v3.5.37 سياسة العربون: خيارات متقدمة', async (t) => {
  const o = (amount) => ({ amount, status: 'pending' });
  const d = normalizePolicy({});
  await t.test('1. الافتراضيات: كل الخيارات المتقدمة معطّلة', d.minAmount === 0 && d.bigOrderThreshold === 0 && d.skipBelowAmount === 0 && d.exemptVip === false && d.bigOrderPercent === 50);
  const base = checkDeposit(o(1000), 0, { enabled: true, minPercent: 30 });
  await t.test('2. السلوك القديم كما هو: 1000 × 30% = 300', base.applies && base.required === 300 && base.percentRequired === 30 && !base.ok);
  await t.test('3. مبلغ ثابت أكبر من النسبة يُطبَّق (500 > 300)', checkDeposit(o(1000), 0, { minPercent: 30, minAmount: 500 }).required === 500);
  await t.test('4. مبلغ ثابت أصغر من النسبة لا يغيّر (100 < 300)', checkDeposit(o(1000), 0, { minPercent: 30, minAmount: 100 }).required === 300);
  await t.test('5. المبلغ الثابت لا يتجاوز إجمالي الطلب', checkDeposit(o(200), 0, { minPercent: 30, minAmount: 500 }).required === 200);
  const big = { minPercent: 30, bigOrderThreshold: 2000, bigOrderPercent: 50 };
  await t.test('6. طلب كبير يستخدم النسبة الأعلى', checkDeposit(o(3000), 0, big).required === 1500 && checkDeposit(o(3000), 0, big).percentRequired === 50);
  await t.test('7. طلب أقل من العتبة يبقى 30%', checkDeposit(o(1999), 0, big).required === 599.7);
  await t.test('8. تحقق ok عند دفع الكافي', checkDeposit(o(3000), 1500, big).ok === true);
  const vip = { minPercent: 30, exemptVip: true };
  await t.test('9. VIP معفى عند التفعيل', checkDeposit(o(1000), 0, vip, { customer: { vip: true } }).applies === false);
  await t.test('10. غير VIP أو بلا عميل لا يُعفى', checkDeposit(o(1000), 0, vip, { customer: { vip: false } }).applies && checkDeposit(o(1000), 0, vip).applies);
  await t.test('11. VIP لا يُعفى إذا الخيار معطّل', checkDeposit(o(1000), 0, { minPercent: 30 }, { customer: { vip: true } }).applies === true);
  await t.test('12. إعفاء الطلبات الصغيرة', checkDeposit(o(150), 0, { minPercent: 30, skipBelowAmount: 200 }).applies === false && checkDeposit(o(200), 0, { minPercent: 30, skipBelowAmount: 200 }).applies === true);
  const bad = normalizePolicy({ minAmount: -5, bigOrderThreshold: 'x', bigOrderPercent: 500, skipBelowAmount: NaN, exemptVip: 'yes' });
  await t.test('13. قيم فاسدة تُعاد للافتراضي', bad.minAmount === 0 && bad.bigOrderThreshold === 0 && bad.bigOrderPercent === 50 && bad.skipBelowAmount === 0 && bad.exemptVip === false);
  await t.test('14. سياسة معطّلة لا تُطبَّق', checkDeposit(o(1000), 0, { enabled: false }).applies === false);
  await t.test('15. مبلغ صفر لا يطبّق ولا ينهار', checkDeposit(o(0), 0, { minAmount: 100 }).applies === false);
  const dp = DEFAULT_SETTINGS.depositPolicy;
  await t.test('16. config يطابق الافتراضيات', dp.minAmount === 0 && dp.exemptVip === false && dp.bigOrderPercent === DEFAULT_DEPOSIT_POLICY.bigOrderPercent && dp.minPercent === 30);
  const rp = buildResetPatch('deposit-policy', DEFAULT_SETTINGS);
  await t.test('17. إعادة الضبط تشمل الحقول الجديدة', rp && rp.depositPolicy && rp.depositPolicy.minAmount === 0 && rp.depositPolicy.exemptVip === false);
  const sec = DATA_SECTIONS.find((s) => s.id === 'deposit-policy');
  const body = document.createElement('div');
  await sec.render(body, { depositPolicy: { ...dp } }, () => {});
  await t.test('18. الواجهة: 5 حقول أرقام', body.querySelectorAll('input[type=number]').length === 5);
});
