/* ==========================================================================
   v3170-trash-push-today.test.js — سلة المحذوفات للصفحات الجديدة · Push للمستندات والجمعيات والمهام · ملخص الرئيسية (v3.17.0)
   ========================================================================== */
import { register } from '../registry.js';
import { buildDigest, pushOptions, serverPrefs, sameDigest, localYmd } from '../../services/push-digest.js';
import { personalToday } from '../../services/personal-today.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);
const T = NOW.getTime();
const d = (m, day) => new Date(2026, m, day, 10).getTime();
const base = (o) => ({ orders: [], customers: [], settings: { notifications: { push: { enabled: true } } }, now: T, ...(o || {}) });

register('v3.17.0 السلة وPush والملخص الشخصي', async (t) => {
  /* ---- خيارات Push ---- */
  await t.test('1. خيارات Push الجديدة افتراضياً مفعّلة وتُعطَّل صراحةً', (() => { const o = pushOptions({}); const o2 = pushOptions({ notifications: { push: { documents: false, circles: false, tasks: false } } }); return o.documents && o.circles && o.tasks && !o2.documents && !o2.circles && !o2.tasks; })());
  await t.test('2. serverPrefs تمرّر الخيارات الثلاثة للخادمة', (() => { const p = serverPrefs({ notifications: { push: { documents: false } } }); return p.documents === false && p.circles === true && p.tasks === true; })());

  /* ---- الملخص: المستندات ---- */
  const docs = [{ title: 'عقد الإيجار', expiresAt: d(6, 1), remindDays: 30 }, { title: 'تأمين', expiresAt: d(4, 1) }, { title: 'بلا تاريخ' }, null];
  await t.test('3. الملخص يحمل المستندات بتواريخها (لا أعداد جاهزة) مرتبة بالأقدم', (() => { const g = buildDigest(base({ documents: docs })); return g.dc.length === 2 && g.dc[0].e === localYmd(d(4, 1)) && g.dc[0].r === 30 && g.dc[1].r === 30 && g.dc[1].t === 'عقد الإيجار'; })());
  await t.test('4. مدة تنبيه المستند (r) محصورة 0..365 والفاسدة ⟵ 30', (() => { const g = buildDigest(base({ documents: [{ title: 'أ', expiresAt: d(6, 1), remindDays: 9999 }, { title: 'ب', expiresAt: d(6, 2), remindDays: 'x' }, { title: 'ج', expiresAt: d(6, 3), remindDays: 0 }] })); return g.dc.map((x) => x.r).join() === '365,30,0'; })());
  await t.test('5. بلا أسماء (includeNames=false) لا عناوين تغادر الجهاز', (() => { const g = buildDigest(base({ settings: { notifications: { push: { enabled: true, includeNames: false } } }, documents: docs, circles: [{ name: 'جمعية', installment: 100, members: 4, myTurn: 2, startYm: '2026-06', payDay: 12, paid: {} }] })); return g.dc.every((x) => !('t' in x)) && g.cr.every((x) => !('t' in x)); })());
  await t.test('6. تعطيل الخيار يحذف الحقل من الملخص', !('dc' in buildDigest(base({ settings: { notifications: { push: { enabled: true, documents: false } } }, documents: docs }))));

  /* ---- الملخص: الجمعيات ---- */
  const C = { name: 'جمعية الشغل', installment: 1000, members: 10, myTurn: 4, startYm: '2026-04', payDay: 12, paid: { '2026-04': true, '2026-05': true } };
  await t.test('7. أقساط الجمعيات: غير المدفوعة هذا الشهر ولها يوم دفع فقط', (() => { const g = buildDigest(base({ circles: [C, { ...C, paid: { ...C.paid, '2026-06': true } }, { ...C, payDay: null }, { ...C, active: false }, { ...C, startYm: '2026-08' }] })); return g.cr.length === 1 && g.cr[0].day === 12 && g.cr[0].t === 'جمعية الشغل'; })());

  /* ---- الملخص: المهام ---- */
  await t.test('8. المهام: تواريخ المفتوحة ذات الموعد فقط، مرتبة', (() => { const g = buildDigest(base({ tasks: [{ kind: 'task', title: 'أ', due: d(5, 12) }, { kind: 'task', title: 'ب', due: d(5, 9) }, { kind: 'task', title: 'ج', due: d(5, 9), done: true }, { kind: 'task', title: 'د' }, { kind: 'shopping', title: 'هـ', due: d(5, 9) }, { kind: 'note', title: 'و' }, null] })); return g.tk.join() === localYmd(d(5, 9)) + ',' + localYmd(d(5, 12)); })());
  await t.test('9. لا مهام ولا مستندات ولا جمعيات ⟵ لا حقول إضافية (متوافق مع الخادمة القديمة)', (() => { const g = buildDigest(base({ tasks: [], documents: [], circles: [] })); return !('dc' in g) && !('cr' in g) && !('tk' in g); })());
  await t.test('10. مدخلات غير مصفوفات تُتجاهل بلا انهيار', (() => { const g = buildDigest(base({ tasks: 'x', documents: null, circles: 5 })); return !('tk' in g) && !('dc' in g) && !('cr' in g); })());
  await t.test('11. الحدود القصوى للحجم (30 مستنداً · 20 جمعية · 40 مهمة)', (() => { const many = (n, f) => Array.from({ length: n }, (_, i) => f(i)); const g = buildDigest(base({ documents: many(50, (i) => ({ title: 'م' + i, expiresAt: d(6, 1) + i * 86400000 })), tasks: many(80, (i) => ({ kind: 'task', title: 'م', due: d(5, 1) + i * 86400000 })), circles: many(30, () => C) })); return g.dc.length === 30 && g.tk.length === 40 && g.cr.length === 20; })());
  await t.test('12. sameDigest يميّز تغيّر الحقول الجديدة', !sameDigest(buildDigest(base({ tasks: [{ kind: 'task', title: 'أ', due: d(5, 9) }] })), buildDigest(base({ tasks: [{ kind: 'task', title: 'أ', due: d(5, 10) }] }))) && sameDigest(buildDigest(base({ documents: docs })), buildDigest(base({ documents: docs }))));

  /* ---- الخادمة ---- */
  let build = null;
  try { const mod = await import('../../../functions/push-logic.js'); build = mod.buildMessage || (mod.default && mod.default.buildMessage); } catch (e) { build = null; }
  const logic = await src('../functions/push-logic.js');
  await t.test('13. الخادمة: أسطر المستندات والجمعيات والمهام موجودة ومحكومة بتفضيلاتها', logic.includes("prefs.documents !== false") && logic.includes("prefs.circles !== false") && logic.includes("prefs.tasks !== false") && logic.includes("'🗂️ '") && logic.includes("'🪙 '") && logic.includes("'✅ '"));
  await t.test('14. الخادمة تحسب الفروق بتاريخ يومها (لا أعداد ثابتة في الملخص)', logic.includes('diffDays(lp.ymd, x.e)') && logic.includes('diffDays(lp.ymd, d)'));

  /* ---- ملخص الرئيسية ---- */
  const tasks = [{ kind: 'task', title: 'اتصال بالمورد', due: d(5, 9) }, { kind: 'task', title: 'تجديد', due: d(5, 10) }, { kind: 'task', title: 'لاحقاً', due: d(7, 1) }, { kind: 'task', title: 'منجزة', due: d(5, 9), done: true }];
  const pt = personalToday({ tasks, documents: [{ title: 'عقد', expiresAt: d(6, 1) }, { title: 'منتهٍ', expiresAt: d(5, 1) }, { title: 'بعيد', expiresAt: d(10, 1) }], circles: [{ id: 'c1', name: 'جمعية', installment: 1000, members: 10, myTurn: 1, startYm: '2026-06', payDay: 12, paid: {} }], now: NOW });
  await t.test('15. الملخص الشخصي: المهام المتأخرة واليوم (الأقرب أولاً) وأقصى 3 عناصر', pt.tasks.overdue === 1 && pt.tasks.today === 1 && pt.tasks.items.length === 2 && pt.tasks.items[0].title === 'اتصال بالمورد');
  await t.test('16. المستندات: المنتهي والقريب فقط ومرتبة بالأخطر', pt.docs.count === 2 && pt.docs.expired === 1 && pt.docs.items[0].d.title === 'منتهٍ');
  await t.test('17. الجمعيات: قسط قريب وقبض هذا الشهر', pt.circles.pay.length === 1 && pt.circles.pay[0].kind === 'due' && pt.circles.collect.length === 1 && pt.circles.collect[0].amount === 10000);
  await t.test('18. الإجمالي = مهام + مستندات + أقساط + قبض', pt.total === 2 + 2 + 1 + 1);
  await t.test('19. لا شيء ⟵ total = 0، ومدخلات فاسدة بلا انهيار', personalToday({ tasks: [], documents: [], circles: [], now: NOW }).total === 0 && personalToday({}).total === 0 && personalToday(null).total === 0 && personalToday({ tasks: 'x', documents: 5, circles: null, now: NOW }).total === 0);

  /* ---- السلة ---- */
  const trash = await src('data/repos/trash.js'); const tp = await src('pages/trash.js');
  await t.test('20. استرجاع المورد من السلة يعيد حركاته ولا يخزّن الحقل المساعد', trash.includes('data._entries') && trash.includes('delete data._entries;') && trash.includes('await idb.put(STORES.SUPPLIER_ENTRIES, { ...e, updatedAt: Date.now() })'));
  await t.test('21. صفحة السلة تعرف المخازن الستة الجديدة وعناوين الحالات والحركات', ['suppliers', 'supplierEntries', 'aftercare', 'circles', 'documents', 'todos'].every((k) => tp.includes("'" + k + "':")) && tp.includes("'حالة رجوع #'") && tp.includes("'دفعة مورد '"));
  const sf = await src('pages/suppliers-forms.js'); const af = await src('pages/aftercare-forms.js'); const cp = await src('pages/circles.js'); const dp = await src('pages/documents.js'); const tdp = await src('pages/todos.js');
  await t.test('22. كل حذف يُرسل للسلة أولاً ثم يحذف (حتى لا يضيع شيء إن فشل)', /addToTrash\(STORES\.SUPPLIER_ENTRIES, entry\);[^\n]*\n\s*await supplierEntries\.remove/.test(sf) && sf.includes('addToTrash(STORES.SUPPLIERS, { ...supplier, _entries: list })') && af.includes('trash.addToTrash(STORES.AFTERCARE, item); await aftercare.remove(item.id)') && cp.includes('trash.addToTrash(STORES.CIRCLES, c); await circles.remove(c.id)') && dp.includes('trash.addToTrash(STORES.DOCUMENTS, d); await documents.remove(d.id)') && tdp.includes('trash.addToTrash(STORES.TODOS, t); await todos.remove(t.id)'));
  await t.test('23. رسائل التأكيد تذكر السلة وسبعة أيام', [sf, af, cp, dp, tdp].every((x) => x.includes('سلة المحذوفات 7 أيام')));
  /* ---- الواجهات ---- */
  const ps = await src('pages/settings/section-push.js'); const psync = await src('sync/push-sync.js'); const di = await src('pages/dashboard-insights.js'); const card = await src('ui/personal-today-card.js');
  await t.test('24. إعدادات Push: ثلاثة مفاتيح جديدة، والمراقبة والتحميل في push-sync', ["row('documents'", "row('circles'", "row('tasks'"].every((x) => ps.includes(x)) && ["'documents', 'circles', 'todos'"].every((x) => psync.includes(x)) && psync.includes('documents: docs, circles: circs, tasks: tds'));
  await t.test('25. بطاقة الملخص: داخل «يومك في لمحة» وبفشل مستقل وبلا كتابة', di.includes('buildPersonalTodayCard(await loadPersonalToday())') && di.includes("personal summary failed") && !/\.(create|update|remove|delete)\(/.test(card) && !/innerHTML\s*=/.test(card));
  await t.test('26. البطاقة لا تظهر بلا شيء (null) وتعرض الصفوف مع روابط صفحاتها', card.includes('if (!m || m.total <= 0) return null;') && ["'#/todos'", "'#/documents'", "'#/circles'"].every((r) => card.includes(r)));
});
