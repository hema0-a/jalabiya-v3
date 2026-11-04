/* ==========================================================================
   v3540-auto-messages-options.test.js — الرسائل: حالات الاقتراح، ترويسة/تذييل، استرجاع الأصلي (v3.5.40)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { promptAllowed, frameMessage, PROMPT_TEMPLATE_IDS, MAX_FRAME_LENGTH, DEFAULT_TEMPLATES } from '../../services/message-templates.js';
import { notifyActionFor } from '../../services/status-notify.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { autoMessagesSection } from '../../pages/settings/section-auto-messages.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';

register('v3.5.40 الرسائل التلقائية: خيارات متقدمة', async (t) => {
  await t.test('1. promptAllowed: null/غير مصفوفة/بلا cfg = الكل مسموح (السلوك السابق)',
    promptAllowed(null, 'ready') && promptAllowed({}, 'ready') && promptAllowed({ promptStatuses: null }, 'thanks') && promptAllowed({ promptStatuses: 'x' }, 'new_order'));
  await t.test('2. promptAllowed بمصفوفة: المذكور فقط', promptAllowed({ promptStatuses: ['ready'] }, 'ready') && !promptAllowed({ promptStatuses: ['ready'] }, 'thanks') && !promptAllowed({ promptStatuses: [] }, 'ready'));
  await t.test('3. PROMPT_TEMPLATE_IDS كلها قوالب افتراضية موجودة', PROMPT_TEMPLATE_IDS.every((id) => DEFAULT_TEMPLATES.some((x) => x.id === id)));
  await t.test('4. frameMessage بلا ترويسة/تذييل = النص كما هو', frameMessage('مرحبا', {}) === 'مرحبا' && frameMessage('مرحبا', null) === 'مرحبا' && frameMessage('مرحبا', { header: '  ', footer: '' }) === 'مرحبا');
  await t.test('5. ترويسة وتذييل: قبل النص وبعده بسطر فارغ', frameMessage('نص', { header: 'أ', footer: 'ب' }) === 'أ\n\nنص\n\nب');
  await t.test('6. لا تكرار إن وُجدا مسبقاً', frameMessage('أ\n\nنص\n\nب', { header: 'أ', footer: 'ب' }) === 'أ\n\nنص\n\nب');
  await t.test('7. قصّ الطول الأقصى وتجاهل غير النص', frameMessage('x', { header: 'ع'.repeat(500) }).length === MAX_FRAME_LENGTH + 3 && frameMessage('x', { header: 5, footer: {} }) === 'x' && frameMessage(undefined, { header: 'h' }) === 'h\n\n');
  const am = DEFAULT_SETTINGS.autoMessages;
  await t.test('8. config: الافتراضيات الجديدة', am.promptStatuses === null && am.header === '' && am.footer === '' && am.enabled === true && am.promptOnStatus === true);
  const rp = buildResetPatch('auto-messages', DEFAULT_SETTINGS);
  await t.test('9. إعادة الضبط تشمل الحقول الجديدة', rp && rp.autoMessages && rp.autoMessages.promptStatuses === null && rp.autoMessages.header === '');

  /* ---- الواجهة ---- */
  const saved = [];
  const body = document.createElement('div');
  await autoMessagesSection.render(body, { autoMessages: { ...am, templates: {}, custom: [] } }, (p) => saved.push(p));
  const chips = body.querySelectorAll('[data-prompt]');
  await t.test('10. 4 أزرار حالات، كلها مفعّلة افتراضياً', chips.length === 4 && [...chips].every((c) => c.getAttribute('aria-pressed') === 'true'));
  body.querySelector('[data-prompt="thanks"]').click();
  await t.test('11. إلغاء «تسليم» يحفظ الثلاث الباقية', saved.length === 1 && J(saved[0].autoMessages.promptStatuses) === J(['new_order', 'start_work', 'ready']));
  body.querySelector('[data-prompt="thanks"]').click();
  await t.test('12. إعادة تفعيلها (الكل) يحفظ null', saved.length === 2 && saved[1].autoMessages.promptStatuses === null);
  const hd = body.querySelector('[data-frame="header"]');
  hd.value = '  السلام عليكم  '; hd.dispatchEvent(new Event('change'));
  await t.test('13. حفظ الترويسة منظّفة', saved[saved.length - 1].autoMessages.header === 'السلام عليكم');
  const ft = body.querySelector('[data-frame="footer"]');
  ft.value = 'ورشتنا'; ft.dispatchEvent(new Event('blur'));
  await t.test('14. حفظ التذييل', saved[saved.length - 1].autoMessages.footer === 'ورشتنا');

  const restores = body.querySelectorAll('[data-action="restore-template"]');
  await t.test('15. أزرار الاسترجاع مخفية للقوالب غير المعدَّلة', restores.length > 0 && [...restores].every((b) => b.style.display === 'none'));
  const tpl0 = DEFAULT_TEMPLATES.find((x) => x.id === 'ready');
  const b2 = document.createElement('div');
  await autoMessagesSection.render(b2, { autoMessages: { ...am, templates: { ready: { text: 'نص معدّل {customer}' } }, custom: [] } }, (p) => saved.push(p));
  const shown = [...b2.querySelectorAll('[data-action="restore-template"]')].filter((b) => b.style.display !== 'none');
  await t.test('16. قالب معدَّل ⟵ زر استرجاع ظاهر لواحد فقط', shown.length === 1);
  const before = saved.length;
  shown[0].click();
  const last = saved[saved.length - 1];
  await t.test('17. الاسترجاع يحذف التخصيص ويحفظ ويخفي الزر', saved.length > before && (!last.autoMessages.templates || !last.autoMessages.templates.ready) && shown[0].style.display === 'none' && !!tpl0);

  /* ---- تكامل: زر إشعار العميل ---- */
  const origAm = (await settingsRepo.get()).autoMessages;
  const cust = await customersRepo.create({ name: 't3540-c', phone: '01054000001' });
  const o = await ordersRepo.create({ customerId: cust.id, status: 'ready', amount: 100, deposit: 0, dueDate: Date.now() });
  try {
    await settingsRepo.update({ autoMessages: { enabled: true, promptOnStatus: true, promptStatuses: null } });
    const a = await notifyActionFor(o, 'ready');
    await settingsRepo.update({ autoMessages: { promptStatuses: ['new_order'] } });
    const b = await notifyActionFor(o, 'ready');
    const c = await notifyActionFor(o, 'new_order');
    await t.test('18. الزر: يظهر عند null، ويختفي لحالة غير مختارة، ويظهر للمختارة', !!a && b === null && !!c);
  } finally {
    await ordersRepo.remove(o.id);
    await customersRepo.remove(cust.id);
    await settingsRepo.update({ autoMessages: origAm });
  }
});
const J = JSON.stringify;
