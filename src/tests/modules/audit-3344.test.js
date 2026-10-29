/* ==========================================================================
   audit-3344.test.js — رسائل: قوالب مخصّصة · سجل · طابور · إشعار الحالة (v3.3.44)
   ========================================================================== */

import { register } from '../registry.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import { toast } from '../../ui/toast.js';
import {
  DEFAULT_TEMPLATES, listTemplates, getTemplateSync, interpolate, findUnknownVariables,
  variablesFor, workshopVars, buildVars, renderTemplate,
} from '../../services/message-templates.js';
import { pruneLog, lastSentIn, sinceText, logMessage, loadLog, clearLog } from '../../services/message-log.js';
import { buildQueue, buildCampaign, upcomingGreetings, occasionDaysLeft, countTasks } from '../../services/message-queue.js';
import { buildPickupText } from '../../services/pickup-reminders.js';
import { buildReminderText } from '../../services/receivables.js';
import { buildQuoteText } from '../../services/quotes.js';
import { templateForStatus } from '../../services/status-notify.js';
import { getOrderMessageOptions } from '../../services/auto-messages.js';

const DAY = 86400000;

register('audit v3.3.44 template engine', async (t) => {
  t.test('1. سطر متغير فارغ وحده يُحذف',
    interpolate('أ\n{remainingLine}\nب', { remainingLine: '' }) === 'أ\nب');
  t.test('2. سطر متغير غير فارغ يبقى',
    interpolate('أ\n{remainingLine}\nب', { remainingLine: 'س' }) === 'أ\nس\nب');
  t.test('3. متغيرات كل نوع تختلف (debt لا يقبل {orderId})',
    findUnknownVariables('{orderId}', 'debt').join() === 'orderId' && findUnknownVariables('{overdue}', 'debt').length === 0);
  t.test('4. المتغيرات الجديدة workshopPhone/address/pickupHours في نوع الطلب',
    ['workshopPhone', 'address', 'pickupHours'].every((k) => variablesFor('order').some((v) => v.key === k)));
  const w = workshopVars({ name: 'ن', whatsapp: '0100', phone: '0200', address: 'ع', pickupHours: 'س' });
  t.test('5. هاتف الورشة = واتساب ثم الهاتف', w.workshopPhone === '0100' && workshopVars({ phone: '0200' }).workshopPhone === '0200');
  t.test('6. اسم الورشة نص قديم يعمل', workshopVars('ورشة النور').workshop === 'ورشة النور');

  const cfg = { custom: [
    { id: 'c1', name: 'رمضان', icon: '🌙', scope: 'customer', enabled: true, text: 'رمضان كريم {customer}' },
    { id: 'c2', name: 'فارغ', scope: 'order', text: '   ' },
    { id: 'c3', name: 'معطّل', scope: 'order', enabled: false, text: 'x' },
  ] };
  const all = listTemplates(cfg);
  t.test('7. المخصّصة الصالحة فقط (الفارغ يُهمل) والنوع محفوظ',
    all.filter((x) => !x.builtin).length === 2 && getTemplateSync('c1', cfg).scope === 'customer');
  t.test('8. قالب مخصّص معطّل enabled=false', getTemplateSync('c3', cfg).enabled === false);
  t.test('9. قوالب الصفحات لا تُعطَّل حتى لو طُلب',
    getTemplateSync('pickup_ready', { templates: { pickup_ready: { enabled: false } } }).enabled === true);
  t.test('10. تخصيص نص قالب أساسي يُحترم', renderTemplate('thanks', { customer: 'سالم' }, { templates: { thanks: { text: 'يا {customer}' } } }) === 'يا سالم');
  t.test('11. كل القوالب الأساسية بلا متغيرات غير معروفة لنوعها',
    DEFAULT_TEMPLATES.every((x) => findUnknownVariables(x.text, x.scope).length === 0));
});

register('audit v3.3.44 page builders honour custom templates', async (t) => {
  const item = { orderId: 'o123456', name: 'أحمد', phone: '0101', remaining: 600, amount: 1000, late: true, ageDays: 5 };
  t.test('1. افتراضي: استلام فيه المتبقي والورشة', (() => { const x = buildPickupText(item, 'ورشة النور'); return x.includes('600') && x.includes('ورشة النور'); })());
  t.test('2. مسدَّد: سطر المتبقي يختفي وبلا سطر فارغ',
    !buildPickupText({ ...item, remaining: 0 }, 'ن').includes('المتبقي') && !/\n\n/.test(buildPickupText({ ...item, remaining: 0 }, 'ن')));
  t.test('3. تخصيص قالب الاستلام عبر cfg',
    buildPickupText(item, 'ن', { templates: { pickup_ready: { text: 'جاهز {orderId} {customer}' } } }) === 'جاهز #123456 أحمد');
  t.test('4. تخصيص قالب المستحقات',
    buildReminderText('سالم', '500 ج.م', 'ن', { templates: { debt_reminder: { text: 'عليك {overdue}' } } }) === 'عليك 500 ج.م');
  const q = { items: [{ name: 'جلابية', price: 500, quantity: 2 }], discount: 0, validUntil: Date.now() + DAY };
  const qt = buildQuoteText(q, 'سالم', 'ن');
  t.test('5. العرض بلا خصم: لا سطر «خصم» ولا ملاحظات فارغة', !qt.includes('خصم') && !/\n$/.test(qt) && qt.includes('1,000'));
  t.test('6. تخصيص قالب العرض', buildQuoteText(q, 'سالم', 'ن', { templates: { quote_share: { text: 'عرض {total}' } } }).startsWith('عرض 1,000'));
  t.test('7. عنوان الورشة يدخل من كائن الورشة',
    buildPickupText(item, { name: 'ن', address: 'القاهرة' }, { templates: { pickup_ready: { text: '{address}' } } }) === 'القاهرة');
});

register('audit v3.3.44 message log', async (t) => {
  const now = 1_700_000_000_000;
  const list = pruneLog([
    { k: 'ready', r: 'o1', c: 'c1', t: now - 2 * DAY },
    { k: 'ready', r: 'o1', c: 'c1', t: now - 1 * DAY },
    { k: 'x', r: null, c: null, t: now - 500 * DAY },
    { bad: true },
  ], now);
  t.test('1. التنظيف: القديم والتالف يُحذفان', list.length === 2);
  t.test('2. آخر إرسال = الأحدث', lastSentIn(list, { kinds: ['ready'], ref: 'o1' }) === now - DAY);
  t.test('3. ref مختلف = لا شيء', lastSentIn(list, { kinds: ['ready'], ref: 'o2' }) === null);
  t.test('4. التصفية بالعميل', lastSentIn(list, { kinds: ['ready'], customerId: 'c1' }) === now - DAY && lastSentIn(list, { kinds: ['ready'], customerId: 'c9' }) === null);
  t.test('5. sinceText', sinceText(now, now) === 'اليوم' && sinceText(now - DAY, now) === 'أمس' && sinceText(now - 3 * DAY, now) === 'قبل 3 أيام');
  const big = Array.from({ length: 700 }, (_, i) => ({ k: 'a', r: String(i), c: null, t: now - i }));
  t.test('6. حد 600 سجل', pruneLog(big, now).length === 600);
  clearLog();
  logMessage({ kind: 'ready', ref: 'o9', customerId: 'c9' });
  t.test('7. التسجيل والقراءة من التخزين', loadLog().length === 1 && lastSentIn(loadLog(), { kinds: ['ready'], ref: 'o9' }) != null);
  clearLog();
  t.test('8. المسح', loadLog().length === 0);
});

register('audit v3.3.44 message queue', async (t) => {
  const now = new Date(2026, 9, 12, 12).getTime();
  const soon = new Date(now + 2 * DAY);
  const customers = [
    { id: 'c1', name: 'أحمد', phone: '01011111111' },
    { id: 'c2', name: 'مدين', phone: '01022222222' },
    { id: 'c3', name: 'مميز', phone: '01033333333', vip: true },
    { id: 'c4', name: 'بلا هاتف', phone: '', vip: true },
  ];
  const orders = [
    { id: 'o1000001', customerId: 'c1', status: 'ready', amount: 1000, readyAt: now - 5 * DAY },
    { id: 'o1000002', customerId: 'c2', status: 'delivered', amount: 500, deliveredAt: now - 10 * DAY },
  ];
  const occasions = [{ id: 'eid', name: 'عيد', icon: '🎉', month: soon.getMonth() + 1, day: soon.getDate(), enabled: true },
    { id: 'far', name: 'بعيد', month: 1, day: 1, enabled: true }];
  const q = buildQueue({ orders, payments: [], customers, occasions, log: [], now });
  const types = q.tasks.map((x) => x.type);
  t.test('1. استلام ثم مستحقات ثم تهاني', types.indexOf('pickup') < types.indexOf('debt') && types.indexOf('debt') < types.indexOf('greeting'));
  t.test('2. التهنئة للـ VIP فقط وبلا هاتف تُهمل', q.tasks.filter((x) => x.type === 'greeting').length === 1);
  t.test('3. المناسبة البعيدة لا تظهر', !q.tasks.some((x) => x.detail.includes('بعيد')));
  t.test('4. المتأخر في الاستلام له شارة', q.tasks.find((x) => x.type === 'pickup').badge === 'متأخر');
  t.test('5. نص المستحقات فيه المبلغ', q.tasks.find((x) => x.type === 'debt').text.includes('500'));
  t.test('6. العدّاد: 3 بانتظار', q.counts.pending === 3);

  const log = [{ k: 'pickup_ready', r: 'o1000001', c: 'c1', t: now - DAY }, { k: 'payment_due', r: 'x', c: 'c2', t: now - 3 * DAY }];
  const q2 = buildQueue({ orders, payments: [], customers, occasions, log, now });
  t.test('7. استلام أُرسل أمس يُخفى (حد يومين)', q2.tasks.find((x) => x.type === 'pickup').recentlySent === true);
  t.test('8. تذكير دفع من قائمة الطلب قبل 3 أيام يُحتسب للمستحقات (حد 7)', q2.tasks.find((x) => x.type === 'debt').recentlySent === true);

  const log3 = [{ k: 'pickup_ready', r: 'o1000001', c: 'c1', t: now - 3 * DAY }];
  t.test('9. بعد انتهاء المهلة يعود للطابور', buildQueue({ orders, payments: [], customers, occasions, log: log3, now }).tasks.find((x) => x.type === 'pickup').recentlySent === false);

  const off = buildQueue({ orders, payments: [], customers, occasions, log: [], now, cfg: { templates: { greeting_occasion: { enabled: false } } } });
  t.test('10. تعطيل قالب التهنئة يُلغي التهاني', !off.tasks.some((x) => x.type === 'greeting'));

  t.test('11. نافذة التهنئة', upcomingGreetings(occasions, now).length === 1 && occasionDaysLeft(occasions[0], now).daysLeft === 2);

  const camp = buildCampaign({ templateId: 'season_offer', audience: 'vip', customers, log: [], now, workshop: { name: 'ن', whatsapp: '0100' } });
  t.test('12. الحملة للـ VIP لهم هاتف', camp.tasks.length === 1 && camp.tasks[0].text.includes('0100'));
  t.test('13. الحملة للكل (لهم هاتف) = 3', buildCampaign({ templateId: 'season_offer', audience: 'all', customers, log: [], now }).tasks.length === 3);
  const sentLog = [{ k: 'season_offer', r: camp.tasks[0].ref, c: 'c3', t: now - DAY }];
  t.test('14. من أُرسل له هذا الشهر يُخفى', buildCampaign({ templateId: 'season_offer', audience: 'vip', customers, log: sentLog, now }).tasks[0].recentlySent === true);
  t.test('15. قالب غير «عملاء» لا يصلح حملة', buildCampaign({ templateId: 'ready', customers, now }).tasks.length === 0);
  t.test('16. countTasks يدعم قائمة فارغة', countTasks([]).total === 0);
});

register('audit v3.3.44 toast extra action + status notify', async (t) => {
  let undone = 0; let notified = 0;
  const h = toast.undo('اختبار', () => { undone++; }, { extraAction: { label: '📱 إشعار', onClick: () => { notified++; } }, duration: 0 });
  const btns = h.node.querySelectorAll('.toast__action');
  t.test('1. زران: تراجع + الإضافي', btns.length === 2 && btns[0].textContent === 'تراجع');
  btns[1].click();
  t.test('2. الزر الإضافي ينفّذ ويُغلق', notified === 1 && undone === 0);
  const h2 = toast.undo('بلا إضافي', () => {}, { duration: 0 });
  t.test('3. بدون extraAction: زر واحد', h2.node.querySelectorAll('.toast__action').length === 1);
  h2.close();
  t.test('4. قالب الحالة', templateForStatus('ready') === 'ready' && templateForStatus('in_progress') === 'start_work' && templateForStatus('delivered') === 'thanks' && templateForStatus('pending') === null);
});

register('audit v3.3.44 order menu: custom templates + last sent', async (t) => {
  await settingsRepo.clear();
  clearLog();
  await settingsRepo.update({ autoMessages: { custom: [
    { id: 'cx', name: 'موعد', icon: '🕘', scope: 'order', enabled: true, text: 'موعدك {pickupHours} في {workshop}' },
    { id: 'cy', name: 'عروض', icon: '🌟', scope: 'customer', enabled: true, text: 'عرض' },
  ] } });
  const order = { id: 'o9999991', amount: 1000, deposit: 0, customerId: 'c1' };
  const opts = await getOrderMessageOptions(order, { id: 'c1', name: 'سالم', phone: '' }, { name: 'ن', pickupHours: '10-9' });
  t.test('1. القالب المخصّص (طلب) يظهر والعملاء لا', opts.some((o) => o.id === 'cx') && !opts.some((o) => o.id === 'cy'));
  t.test('2. المتغيرات الجديدة تُستبدل', opts.find((o) => o.id === 'cx').text === 'موعدك 10-9 في ن');
  t.test('3. «موعد البروفة» الجديد ضمن الخيارات', opts.some((o) => o.id === 'fitting'));
  t.test('4. لا إرسال قبل الضغط: lastSentAt فارغ', opts.every((o) => o.lastSentAt === null));
  logMessage({ kind: 'cx', ref: order.id, customerId: 'c1' });
  const opts2 = await getOrderMessageOptions(order, { id: 'c1', name: 'سالم', phone: '' }, {});
  t.test('5. بعد التسجيل يظهر آخر إرسال', opts2.find((o) => o.id === 'cx').lastSentAt != null);
  clearLog();
  await settingsRepo.clear();
});

register('audit v3.3.44 settings: custom templates UI', async (t) => {
  await settingsRepo.clear();
  const sec = SYSTEM_SECTIONS.find((x) => x.id === 'auto-messages');
  const pending = [];
  const saveFn = (patch) => { pending.push(settingsRepo.update(patch)); };
  await settingsRepo.update({ autoMessages: { custom: [{ id: 'k1', name: 'تجريبي', icon: '🧪', scope: 'order', enabled: true, text: 'مرحباً {customer}' }] } });
  const body = document.createElement('div');
  await sec.render(body, await settingsRepo.get(), saveFn);
  t.test('1. القالب المخصّص المحفوظ يظهر', body.textContent.includes('تجريبي') && body.textContent.includes('مرحباً أحمد محمد'));
  t.test('2. المجموعات الثلاث وقسم قوالبي', ['رسائل الطلب', 'رسائل الصفحات', 'العملاء والمناسبات', 'قوالبي'].every((x) => body.textContent.includes(x)));
  t.test('3. زر قالب جديد موجود', [...body.querySelectorAll('button')].some((b) => b.textContent.includes('قالب جديد')));
  const prompt = body.querySelectorAll('.toggle__input')[1];
  prompt.checked = false; prompt.dispatchEvent(new Event('change', { bubbles: true }));
  await Promise.all(pending);
  const s = await settingsRepo.get();
  t.test('4. إيقاف اقتراح الإشعار يُحفظ ولا يمحو القوالب المخصّصة',
    s.autoMessages.promptOnStatus === false && s.autoMessages.custom.length === 1);
  await settingsRepo.clear();
});
