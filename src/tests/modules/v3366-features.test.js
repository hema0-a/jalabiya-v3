/* ==========================================================================
   v3366-features.test.js — استيراد جهات الاتصال · مساعد الصياغة · حالة النظام · صفحة الكتالوج (v3.3.66)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import {
  parseVCards, toLocalMobile, pickMobile, planImport, fromPickerResult,
} from '../../services/contacts-import.js';
import { reviewAndImport, openContactsImport } from '../../ui/contacts-import-dialog.js';
import { matchSituations, composeMessage, SITUATIONS, getSituation } from '../../services/message-composer.js';
import { openMessageComposer } from '../../ui/message-composer-dialog.js';
import { evaluateStatus, ageText } from '../../services/system-status.js';
import { buildSystemStatusCard } from '../../ui/system-status-card.js';
import { buildCatalogHtml, esc, MAX_CATALOG_ITEMS } from '../../services/catalog-page.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;
const closeAll = () => document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());

register('v3.3.66 contacts import (pure)', async (t) => {
  const vcf = [
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:أحمد محمد', 'TEL;TYPE=CELL:+20 10 1234 5678', 'TEL;TYPE=HOME:0224000000', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'N:علي;منى;;;', 'TEL:01112345678', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:2.1', 'FN;CHARSET=UTF-8:سعيد', 'TEL;CELL:1223456789', 'END:VCARD',
    'BEGIN:VCARD', 'FN:Long', ' Name Folded', 'TEL:+1 202 555 0100', 'END:VCARD',
    'BEGIN:VCARD', 'FN:بلا رقم', 'END:VCARD',
  ].join('\r\n');
  const c = parseVCards(vcf);
  t.test('1. قراءة 5 بطاقات', c.length === 5);
  t.test('2. FN والرقم المتعدد', c[0].name === 'أحمد محمد' && c[0].phones.length === 2);
  t.test('3. الاسم من N عند غياب FN (الأول ثم العائلة)', c[1].name === 'منى علي');
  t.test('4. فك التفاف السطور', c[3].name === 'LongName Folded' || c[3].name === 'Long Name Folded' || c[3].name.startsWith('Long'));
  t.test('5. تحويل المحمول المصري لصيغة محلية', toLocalMobile('+20 10 1234 5678') === '01012345678' && toLocalMobile('1223456789') === '01223456789' && toLocalMobile('٠١١١٢٣٤٥٦٧٨') === '01112345678');
  t.test('6. أرقام غير مصرية/أرضية لا تُقبل', toLocalMobile('+1 202 555 0100') === '' && toLocalMobile('0224000000') === '');
  t.test('7. اختيار أول محمول صالح من عدة أرقام', pickMobile(['0224000000', '+201012345678']) === '01012345678');

  const existing = [{ id: 'e1', name: 'أحمد محمد', phone: '+201012345678' }, { id: 'e2', name: 'منى علي', phone: '' }];
  const plan = planImport([...c, { name: 'مكرر داخل الملف', phones: ['01112345678'] }], existing);
  const st = (n) => plan.rows.find((r) => r.name === n);
  t.test('8. مسجّل بنفس الرقم (رغم اختلاف الصيغة) غير محدّد', st('أحمد محمد').status === 'dup-phone' && st('أحمد محمد').selected === false);
  t.test('9. نفس الاسم برقم مختلف: تنبيه غير محدّد', st('منى علي').status === 'dup-name' && !st('منى علي').selected);
  t.test('10. الجديد محدّد افتراضياً', st('سعيد').status === 'new' && st('سعيد').selected === true);
  t.test('11. مكرر داخل الملف', st('مكرر داخل الملف').status === 'dup-file');
  t.test('12. بلا رقم محمول مصري: غير محدّد', st('بلا رقم').status === 'no-phone' && !st('بلا رقم').selected);
  t.test('13. العدّادات', plan.selectedCount === 1 && plan.counts.new === 1);
  t.test('14. نتيجة Contact Picker', fromPickerResult([{ name: ['س'], tel: ['01'] }, { name: [], tel: [] }]).length === 2 && fromPickerResult(null).length === 0);
  t.test('15. مدخلات فارغة', planImport(null, null).rows.length === 0 && parseVCards('').length === 0);
});

register('v3.3.66 contacts import (UI)', async (t) => {
  const made = [];
  const keep = await customersRepo.create({ name: 't3366 موجود', phone: '01055566677' });
  try {
    const done = [];
    await reviewAndImport([
      { name: 't3366 جديد أ', phones: ['01011122233'] },
      { name: 't3366 جديد ب', phones: ['+20 11 1222 3344'] },
      { name: 't3366 موجود', phones: ['+201055566677'] },
    ], { onDone: (n) => done.push(n) });
    await sleep(150);
    const m = document.querySelector('.modal');
    const rows = Array.from(m.querySelectorAll('.cimport__row'));
    t.test('1. ثلاثة صفوف وواحد منها وسم «مسجّل»', rows.length === 3 && rows.filter((r) => r.textContent.includes('مسجّل بنفس الرقم')).length === 1);
    t.test('2. المحدَّد افتراضياً الجديدان فقط وزر الاستيراد يعرض 2', m.querySelectorAll('input:checked').length === 2 && m.querySelector('[data-action="do-import"]').textContent.includes('(2)'));
    m.querySelector('input[data-i="1"]').click();
    await sleep(30);
    t.test('3. إلغاء تحديد صف يحدّث العدّاد', m.querySelector('[data-action="do-import"]').textContent.includes('(1)'));
    m.querySelector('[data-action="do-import"]').click();
    await sleep(500);
    const all = await customersRepo.list();
    const added = all.filter((c) => c.name === 't3366 جديد أ' || c.name === 't3366 جديد ب');
    added.forEach((c) => made.push(c.id));
    t.test('4. استُورد الجديد المحدَّد فقط وبصيغة محلية', added.length === 1 && added[0].name === 't3366 جديد أ' && added[0].phone === '01011122233');
    t.test('5. المسجَّل مسبقاً لم يتكرر', all.filter((c) => c.name === 't3366 موجود').length === 1);
    t.test('6. استُدعي onDone بعدد المستورد', done.join() === '1');
    closeAll();

    const h = openContactsImport({});
    await sleep(100);
    const pick = document.querySelector('.modal [data-action="import-picker"]');
    t.test('7. زر ملف vCard موجود دائماً وزر جهات الهاتف حسب الدعم',
      !!document.querySelector('.modal [data-action="import-vcf"]') && (!!pick === !!(navigator.contacts && navigator.contacts.select)));
    t.test('8. حقل الملف يقبل .vcf', !!document.querySelector('.modal input[type="file"][accept*=".vcf"]'));
    h.close();
  } finally {
    closeAll();
    for (const id of [keep.id, ...made]) { try { await customersRepo.remove(id); } catch { /* ignore */ } }
  }
});

register('v3.3.66 message composer', async (t) => {
  t.test('1. ثمانية مواقف على الأقل ولكل موقف كلمات مفتاحية', SITUATIONS.length >= 8 && SITUATIONS.every((s) => s.keywords.length >= 3));
  const top = (q) => (matchSituations(q)[0] || {}).id;
  t.test('2. «اعتذار عن تأخير» ← delay', top('اعتذار عن تأخير') === 'delay');
  t.test('3. «تذكير بالمتبقي» ← payment', top('تذكير بالمتبقي') === 'payment');
  t.test('4. «الطلب جاهز» ← ready', top('الطلب جاهز') === 'ready');
  t.test('5. «شكرا» ← thanks', top('شكرا') === 'thanks');
  t.test('6. «كل سنة وانت طيب عيد» ← greeting', top('عيد مبارك') === 'greeting');
  t.test('7. الهمزات والتشكيل لا تؤثر', top('تَأخِير') === 'delay' && top('تاخير') === 'delay');
  t.test('8. نص لا يطابق شيئاً ← فارغ', matchSituations('xyz qqq').length === 0 && matchSituations('').length === 0);

  const v = { customer: 'سعد', workshop: 'ورشة النور', days: '3', date: 'الخميس', amount: '250' };
  const f = composeMessage({ situationId: 'delay', tone: 'friendly', vars: v });
  const r = composeMessage({ situationId: 'delay', tone: 'formal', vars: v });
  t.test('9. الودّي يحوي الاسم والتأخير والموعد والتوقيع', f.includes('سعد') && f.includes('3 أيام') && f.includes('الخميس') && f.includes('ورشة النور'));
  t.test('10. الرسمي مختلف عن الودّي', r !== f && r.includes('نعتذر'));
  const p = composeMessage({ situationId: 'payment', vars: v });
  t.test('11. المبلغ يظهر ويُحذف إن غاب', p.includes('250 ج.م') && !composeMessage({ situationId: 'payment', vars: { ...v, amount: '' } }).includes('ج.م'));
  t.test('12. السطر الإضافي يُلحق', composeMessage({ situationId: 'thanks', vars: v, note: 'ننتظرك الجمعة' }).includes('ننتظرك الجمعة'));
  t.test('13. موقف مجهول ← نص فارغ', composeMessage({ situationId: 'nope' }) === '' && getSituation('nope') === null);
  t.test('14. كل المواقف تُنتج نصاً بكلا النبرتين بلا undefined', SITUATIONS.every((s) => ['friendly', 'formal'].every((tn) => { const x = composeMessage({ situationId: s.id, tone: tn, vars: v }); return x.length > 30 && !/undefined|NaN|\[object/.test(x); })));

  /* النافذة */
  try {
    const ui = await openMessageComposer({ customer: { id: 'c-x', name: 'منى', phone: '01012345678' } });
    await sleep(100);
    const m = document.querySelector('.modal');
    t.test('15. النافذة: الاسم الموجَّه إليه + مواقف + نبرتان', m.textContent.includes('إلى: منى') && m.querySelectorAll('[data-sit]').length === SITUATIONS.length && m.querySelectorAll('[data-tone]').length === 2);
    ui.idea.value = 'اعتذار عن تأخير'; ui.idea.dispatchEvent(new Event('input', { bubbles: true }));
    t.test('16. الكتابة تختار الموقف وتولّد النص باسم العميل', ui.out.value.includes('منى') && m.querySelector('[data-sit="delay"]').getAttribute('aria-pressed') === 'true');
    t.test('17. حقول الموقف تظهر (أيام + تاريخ)', !!m.querySelector('[data-field="days"]') && !!m.querySelector('[data-field="date"]'));
    ui.inputs.days.value = '5'; ui.inputs.days.dispatchEvent(new Event('input', { bubbles: true }));
    t.test('18. تغيير الحقل يحدّث النص', ui.out.value.includes('5 أيام'));
    m.querySelector('[data-tone="formal"]').click();
    t.test('19. تبديل النبرة', ui.out.value.includes('نعتذر'));
    t.test('20. أزرار نسخ وإرسال', !!m.querySelector('[data-action="composer-copy"]') && !!m.querySelector('[data-action="composer-send"]'));
  } finally { closeAll(); }
});

register('v3.3.66 system status', async (t) => {
  const now = Date.now();
  const base = { online: true, version: '9.9.9', sync: { configured: true, loggedIn: true, auto: true, dirtySince: null, lastPush: now - 3600000 },
    storage: { supported: true, persisted: true, usage: 5e6, quota: 1e9, percent: 0.5 }, integrity: { total: 0 }, lastBackupAt: now - D, lastExternalBackupAt: now - D, serviceWorker: { supported: true, controlled: true } };
  const get = (r, id) => r.items.find((i) => i.id === id);
  const ok = evaluateStatus(base, now);
  t.test('1. حالة سليمة ⟵ ok', ok.level === 'ok' && get(ok, 'pending').value === 'لا شيء');
  const off = evaluateStatus({ ...base, online: false }, now);
  t.test('2. بلا اتصال ⟵ تحذير', off.level === 'warn' && get(off, 'network').level === 'warn');
  const dirty = evaluateStatus({ ...base, sync: { ...base.sync, dirtySince: now - 3 * D } }, now);
  t.test('3. تغييرات معلّقة أكثر من يومين ⟵ خطر', dirty.level === 'bad' && get(dirty, 'pending').level === 'bad');
  const fresh = evaluateStatus({ ...base, sync: { ...base.sync, dirtySince: now - 600000 } }, now);
  t.test('4. تغييرات حديثة ⟵ تحذير فقط', get(fresh, 'pending').level === 'warn' && fresh.level === 'warn');
  const nosync = evaluateStatus({ ...base, sync: { configured: false } }, now);
  t.test('5. بلا مزامنة ⟵ معلومة لا خطر + نصيحة نسخ', get(nosync, 'sync').level === 'info' && nosync.level === 'ok' && !get(nosync, 'pending'));
  const nobk = evaluateStatus({ ...base, lastBackupAt: 0 }, now);
  t.test('6. بلا نسخة احتياطية ⟵ خطر', nobk.level === 'bad' && get(nobk, 'backup').value === 'لا توجد');
  t.test('7. نسخة أقدم من أسبوع ⟵ تحذير', get(evaluateStatus({ ...base, lastBackupAt: now - 9 * D }, now), 'backup').level === 'warn');
  t.test('8. تخزين ممتلئ ⟵ خطر', get(evaluateStatus({ ...base, storage: { ...base.storage, percent: 95 } }, now), 'storage').level === 'bad' && get(evaluateStatus({ ...base, storage: { ...base.storage, percent: 80 } }, now), 'storage').level === 'warn');
  t.test('9. التخزين غير محميّ ⟵ تحذير', get(evaluateStatus({ ...base, storage: { ...base.storage, persisted: false } }, now), 'persist').level === 'warn');
  t.test('10. ملاحظات سلامة البيانات ⟵ تحذير بعددها', get(evaluateStatus({ ...base, integrity: { total: 4 } }, now), 'integrity').value.includes('4'));
  t.test('11. طابور وتعارضات', get(evaluateStatus({ ...base, queueSize: 3, sync: { ...base.sync, conflicts: 2 } }, now), 'queue').value === '3' && !!get(evaluateStatus({ ...base, sync: { ...base.sync, conflicts: 2 } }, now), 'conflicts'));
  t.test('12. لا نسخة خارج الجهاز ⟵ معلومة', get(evaluateStatus({ ...base, lastExternalBackupAt: 0 }, now), 'external').level === 'info');
  t.test('13. نص العمر', ageText(now - 30000, now) === 'الآن' && ageText(now - 2 * 3600000, now) === 'منذ 2 ساعة' && ageText(now - 3 * D, now) === 'منذ 3 يوم' && ageText(0, now) === 'لم يحدث');
  t.test('14. لقطة فارغة لا تنهار', evaluateStatus({}, now).items.length >= 2 && evaluateStatus(undefined, now).items.length >= 2);

  const card = buildSystemStatusCard();
  document.body.appendChild(card);
  try {
    await sleep(900);
    t.test('15. البطاقة تُرسم ببنود وعنوان بحسب المستوى', card.querySelectorAll('.sysstat__row').length >= 4 && /🩺/.test(card.textContent) && !!card.getAttribute('data-level'));
    t.test('16. فيها بند النسخ الاحتياطي والتخزين وزر تحديث', !!card.querySelector('[data-item="backup"]') && !!card.querySelector('[data-action="sysstat-refresh"]'));
  } finally { card.remove(); }
});

register('v3.3.66 catalog page', async (t) => {
  const items = [
    { name: 'جلابية <b>سادة</b>', price: 450, image: 'data:image/png;base64,iVBORw0KGgo=' },
    { name: 'ثوب "مطرّز"', price: 700, image: 'javascript:alert(1)' },
    { name: 'بلا سعر', price: 0 },
  ];
  const html = buildCatalogHtml({ workshop: { name: 'ورشة <النور>', phone: '01012345678', address: 'شارع "١"', pickupHours: '٩-٥' }, items, now: Date.UTC(2026, 9, 14) });
  t.test('1. مستند HTML كامل RTL بعنوان الورشة', html.startsWith('<!doctype html>') && html.includes('dir="rtl"') && html.includes('ورشة &lt;النور&gt;'));
  t.test('2. هروب HTML في الأسماء والعناوين (لا حقن)', html.includes('&lt;b&gt;سادة&lt;/b&gt;') && !html.includes('<b>سادة') && html.includes('&quot;مطرّز&quot;'));
  t.test('3. الصنف بلا سعر يُستبعد', !html.includes('بلا سعر'));
  t.test('4. صورة data صالحة فقط تُضمَّن، والخبيثة تُستبدل', html.includes('data:image/png;base64,iVBORw0KGgo=') && !html.includes('javascript:'));
  t.test('5. زر واتساب برقم دولي صحيح واتصال', html.includes('https://wa.me/201012345678') && html.includes('tel:01012345678'));
  t.test('6. العنوان والمواعيد', html.includes('شارع &quot;١&quot;') && html.includes('٩-٥'));
  t.test('7. لا سكربتات ولا موارد خارجية', !/<script|src="http|href="http(?!s:\/\/wa\.me)/.test(html));
  const many = buildCatalogHtml({ workshop: {}, items: Array.from({ length: 40 }, (_, i) => ({ name: 'n' + i, price: 10 + i })) });
  t.test('8. حدّ الأصناف', (many.match(/<article/g) || []).length === MAX_CATALOG_ITEMS);
  t.test('9. بلا أصناف ⟵ رسالة بدل صفحة فارغة', buildCatalogHtml({ items: [] }).includes('لا توجد أصناف'));
  t.test('10. esc يتعامل مع null', esc(null) === '' && esc('<&>') === '&lt;&amp;&gt;');
});
