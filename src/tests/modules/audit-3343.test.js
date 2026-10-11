/* ==========================================================================
   audit-3343.test.js — فحص وترقية الرسائل التلقائية (v3.3.43)
   ========================================================================== */

import { register } from '../registry.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import {
  DEFAULT_TEMPLATES, VARIABLES, buildVars, interpolate,
  findUnknownVariables, sampleVars, getTemplates, getOrderMessageOptions,
} from '../../services/auto-messages.js';

register('audit v3.3.43 auto-messages service (pure)', async (t) => {
  const order = { id: 'ord-123456789', amount: 1200, deposit: 200, dueDate: Date.now() };
  const customer = { name: 'أحمد', phone: '01012345678' };

  t.test('1. لا قالب افتراضي يكرّر «ج.م» بعد متغير مالي',
    DEFAULT_TEMPLATES.every((tp) => !/\{(amount|paid|remaining)\}\s*ج\.م/.test(tp.text)));

  const v = buildVars(order, customer, {}, { paid: 500 });
  t.test('2. المتبقي = الإجمالي - المدفوع', v.remaining.includes('700') && v.paid.includes('500'));
  t.test('3. بلا extra يُستخدم المقدم', buildVars(order, customer).remaining.includes('1,000') ||
    buildVars(order, customer).remaining.includes('1000') || buildVars(order, customer).remaining.includes('١'));
  t.test('4. المتبقي لا يكون سالباً',
    !/-/.test(buildVars({ ...order, amount: 100 }, customer, {}, { paid: 500 }).remaining));

  const out = interpolate('{amount} ج.م.', { amount: '1,200 ج.م' });
  t.test('5. تنظيف «ج.م ج.م» من القوالب القديمة', !/ج\.م\s*ج\.م/.test(out));

  t.test('6. اسم عميل فيه $& يُحفظ حرفياً',
    interpolate('أهلاً {customer}', { customer: 'أ$&ب' }) === 'أهلاً أ$&ب');

  t.test('7. اكتشاف متغير خاطئ', findUnknownVariables('مرحباً {customr} {amount}').join() === 'customr');
  t.test('8. المتغيرات المعروفة كلها سليمة',
    findUnknownVariables(VARIABLES.map((x) => '{' + x.key + '}').join(' ')).length === 0);
  t.test('9. sampleVars تغطي كل المتغيرات',
    VARIABLES.every((x) => typeof sampleVars()[x.key] === 'string' && sampleVars()[x.key]));
  t.test('10. قالب التذكير يستخدم {remaining}',
    DEFAULT_TEMPLATES.find((x) => x.id === 'payment_due').text.includes('{remaining}'));

  await settingsRepo.clear();
  const all = await getTemplates();
  t.test('11. getTemplates = 5 بلا تخصيص وisCustom=false', all.length === 5 && all.every((x) => x.isCustom === false));

  await settingsRepo.update({ autoMessages: { templates: { ready: { text: 'نصي {customer}' } } } });
  const all2 = await getTemplates();
  t.test('12. التخصيص يظهر isCustom', all2.find((x) => x.id === 'ready').isCustom === true);

  const opts = await getOrderMessageOptions(order, customer, { name: 'ورشتي' }, { paid: 500 });
  t.test('13. خيارات الطلب تحمل المتبقي الحقيقي',
    opts.find((o) => o.id === 'payment_due').text.includes('700'));
  await settingsRepo.clear();
});

register('audit v3.3.43 auto-messages settings section (UI)', async (t) => {
  await settingsRepo.clear();
  const sec = SYSTEM_SECTIONS.find((x) => x.id === 'auto-messages');
  const pending = [];
  const saveFn = (patch) => { pending.push(settingsRepo.update(patch)); };
  const body = document.createElement('div');
  await sec.render(body, await settingsRepo.get(), saveFn);

  const toggles = body.querySelectorAll('.toggle__input');
  t.test('1. مفتاح رئيسي + 5 مفاتيح قوالب', toggles.length === 6);

  const flip = (input, v) => { input.checked = v; input.dispatchEvent(new Event('change', { bubbles: true })); };
  flip(toggles[1], false);   /* new_order */
  flip(toggles[3], false);   /* ready */
  await Promise.all(pending);

  const s = await settingsRepo.get();
  const tpls = s.autoMessages.templates;
  t.test('2. تعطيل قالبين متتاليين: كلاهما محفوظ (لا يمحو الأول)',
    tpls.new_order && tpls.new_order.enabled === false && tpls.ready && tpls.ready.enabled === false);
  t.test('3. لا يُحفظ نص إن لم يتغيّر عن الافتراضي', !('text' in tpls.new_order));

  flip(toggles[1], true);
  await Promise.all(pending);
  const s2 = await settingsRepo.get();
  t.test('4. إعادة التفعيل تزيل التخصيص الفارغ', !s2.autoMessages.templates.new_order);

  t.test('5. دليل المتغيرات يعرض كل المتغيرات',
    VARIABLES.every((x) => body.textContent.includes('{' + x.key + '}')));
  t.test('6. المعاينة تعرض بيانات تجريبية بلا أقواس خام',
    !/\{customer\}|\{amount\}|\{remaining\}/.test(body.querySelector('[style*="pre-wrap"]').textContent));

  flip(toggles[0], false);
  await Promise.all(pending);
  t.test('7. إيقاف المفتاح الرئيسي يُحفظ', (await settingsRepo.get()).autoMessages.enabled === false);
  await settingsRepo.clear();
});
