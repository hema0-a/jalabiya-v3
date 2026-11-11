/* ==========================================================================
   v3180-calendar-diagnostics-brief.test.js — تقويم موحّد · تشخيص الإشعارات · توحيد ملخص الصباح مع الإشعار (v3.18.0)
   ========================================================================== */
import { register } from '../registry.js';
import { personalEvents, PERSONAL_TYPES, PERSONAL_META } from '../../services/calendar-personal.js';
import { relTime, explainPushError, formatPushError, buildPushStatus } from '../../services/push-status.js';
import { briefCounts, EMPTY_COUNTS } from '../../services/daily-brief.js';
import { buildDigest, serverPrefs } from '../../services/push-digest.js';
import { buildMorningModel } from '../../services/morning-summary.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);          /* 2026-06-10 (بتوقيت الجهاز) */
const T = NOW.getTime();
const at = (m, d, h = 10) => new Date(2026, m, d, h).getTime();
const DAYMS = 86400000;
const range = (m) => [new Date(2026, m, 1).getTime(), new Date(2026, m + 1, 1).getTime()];
const ev = (s, m) => personalEvents({ ...s, now: T }, ...range(m));

register('v3.18.0 تقويم موحّد وتشخيص الإشعارات وتوحيد الملخص', async (t) => {
  /* ======== 1) التقويم الموحّد ======== */
  const CM = [{ id: 'c1', name: 'إيجار', amount: 5000, dueDay: 5 }, { id: 'c2', name: 'كهرباء', dueDay: 31 }, { id: 'c3', name: 'موقوف', dueDay: 8, active: false }, { id: 'c4', name: 'بلا يوم' }];
  await t.test('1. الالتزامات: يوم الاستحقاق من كل شهر، والموقوف وبلا يوم يُتجاهلان', (() => { const e = ev({ commitments: CM }, 5).filter((x) => x.type === 'commitment'); return e.length === 2 && new Date(e[0].date).getDate() === 5 && e.every((x) => x.icon === '💳' && x.route === '#/commitments'); })());
  await t.test('2. التزام يوم 31 في شهر 30 يوماً ⟵ آخر يوم (30)', (() => { const e = ev({ commitments: CM }, 5).find((x) => x.title === 'كهرباء'); return !!e && new Date(e.date).getDate() === 30; })());
  await t.test('3. وضع الشهر الصعب يُبقي الضروري فقط (كالإشعار)', (() => { const list = [{ id: 'a', name: 'أ', dueDay: 3, priority: 'essential' }, { id: 'b', name: 'ب', dueDay: 4, priority: 'flexible' }]; const off = ev({ commitments: list }, 5).length; const on = ev({ commitments: list, settings: { personalControls: { hardMonth: true } } }, 5); return off === 2 && on.length === 1 && on[0].title === 'أ'; })());
  await t.test('4. نطاق يمسّ شهرين يعرض الالتزام في كل شهر منهما مرة', (() => { const e = personalEvents({ commitments: [{ id: 'x', name: 'س', dueDay: 15 }], now: T }, at(4, 10), at(5, 25)).filter((x) => x.type === 'commitment'); return e.length === 2 && e[0].id !== e[1].id; })());

  const DOCS = [{ id: 'd1', title: 'رخصة', expiresAt: at(5, 20), remindDays: 30 }, { id: 'd2', title: 'سجل', expiresAt: at(5, 2) }, { id: 'd3', title: 'بلا تاريخ' }, null];
  await t.test('5. المستندات: يوم الانتهاء فقط، المنتهي أحمر والقريب برتقالي', (() => { const e = ev({ documents: DOCS }, 5).filter((x) => x.type === 'document'); const exp = e.find((x) => x.title === 'سجل'); const due = e.find((x) => x.title === 'رخصة'); return e.length === 2 && exp.status === 'expired' && exp.color === '#C62828' && due.status === 'due' && due.color === '#F57C00'; })());

  const C = { id: 'k1', name: 'جمعية الشغل', installment: 1000, members: 10, myTurn: 3, startYm: '2026-04', payDay: 12, paid: { '2026-04': true, '2026-05': true } };
  await t.test('6. الجمعيات: القسط يظهر في يوم الدفع (مدفوع/غير مدفوع)', (() => { const may = ev({ circles: [C] }, 4).filter((x) => x.type === 'circle'); const jun = ev({ circles: [C] }, 5).filter((x) => x.type === 'circle'); return may[0].status === 'paid' && may[0].color === '#2E7D32' && jun.some((x) => x.status === 'unpaid' && new Date(x.date).getDate() === 12); })());
  await t.test('7. دورك في القبض يظهر في شهره فقط وبعلم collected يختفي', (() => { const jun = ev({ circles: [C] }, 5).filter((x) => x.status === 'collect'); const none = ev({ circles: [{ ...C, collected: true }] }, 5).filter((x) => x.status === 'collect'); return jun.length === 1 && jun[0].amount === 10000 && none.length === 0; })());
  await t.test('8. جمعية بلا يوم دفع أو موقوفة أو خارج جدولها ⟵ لا أحداث', ev({ circles: [{ ...C, payDay: null }, { ...C, active: false }, { ...C, startYm: '2027-01' }] }, 5).length === 0);

  const TK = [{ id: 't1', kind: 'task', title: 'مهمة', due: at(5, 15) }, { id: 't2', kind: 'task', title: 'منجزة', due: at(5, 15), done: true }, { id: 't3', kind: 'shopping', title: 'مشتريات', due: at(5, 15) }, { id: 't4', kind: 'task', title: 'بلا موعد' }, { id: 't5', kind: 'task', title: 'فاتت', due: at(5, 3) }];
  await t.test('9. المهام: المفتوحة ذات الموعد فقط؛ المتأخرة حمراء', (() => { const e = ev({ tasks: TK }, 5).filter((x) => x.type === 'task'); const late = e.find((x) => x.title === 'فاتت'); return e.length === 2 && late.status === 'overdue' && late.color === '#C62828'; })());
  await t.test('10. حدود النطاق: [بداية، نهاية) — ما خارجه لا يظهر', (() => { const e = personalEvents({ tasks: [{ id: 'a', kind: 'task', title: 'أ', due: at(5, 1, 0) }, { id: 'b', kind: 'task', title: 'ب', due: at(6, 1, 0) }], now: T }, at(5, 1, 0), at(6, 1, 0)); return e.length === 1 && e[0].title === 'أ'; })());
  await t.test('11. شكل الحدث موحّد (id فريد · type · date · title · subtitle · color · icon · route)', (() => { const all = ev({ commitments: CM, documents: DOCS, circles: [C], tasks: TK }, 5); const ids = new Set(all.map((x) => x.id)); return all.length > 6 && ids.size === all.length && all.every((x) => PERSONAL_TYPES.includes(x.type) && Number.isFinite(x.date) && x.title && x.subtitle !== undefined && x.color && x.icon && x.route === PERSONAL_META[x.type].route && x.customerPhone === ''); })());
  await t.test('12. مدخلات فاسدة (null/نص/أرقام) بلا انهيار', (() => { try { return personalEvents({ commitments: 'x', documents: null, circles: 5, tasks: [null, 1, 'a'] }, 0, 1e13).length === 0 && personalEvents(null, 0, 1).length === 0 && personalEvents({}, 5, 1).length === 0; } catch { return false; } })());
  await t.test('13. التقويم والإشعار على نفس اليوم: التزام يوم 12 ⟵ digest.cm.day = يوم حدث التقويم', (() => { const g = buildDigest({ orders: [], customers: [], settings: { notifications: { push: { enabled: true } } }, commitments: [{ name: 'إيجار', dueDay: 12 }], now: T }); const e = ev({ commitments: [{ id: 'z', name: 'إيجار', dueDay: 12 }] }, 5)[0]; return g.cm[0].day === new Date(e.date).getDate(); })());

  /* عقود المصدر */
  const calSvc = await src('services/calendar-events.js'); const calPg = await src('pages/calendar.js'); const grid = await src('pages/calendar-grid.js'); const day = await src('pages/calendar-day.js');
  await t.test('14. getCalendarEvents: فلتر personal ويعزل فشل الشخصي عن الطلبات', calSvc.includes("filter === 'personal'") && calSvc.includes('personalEvents(') && calSvc.includes("[calendar] personal events failed"));
  await t.test('15. الواجهة: زر الفلتر والمفتاح والرقاقة ونافذة اليوم بروابط الصفحات', calPg.includes("f === 'personal'") && grid.includes("id: 'personal'") && grid.includes('buildPersonalChip(personal)') && grid.includes("label: '🗂️ شخصي'") && day.includes('PERSONAL_TYPES.includes') && day.includes('location.hash = e.route'));
  await t.test('16. calendar-personal.js نقي: بلا مستودعات ولا DOM', (() => { return null; })() === null && !/data\/repos|document\.|window\.|fetch\(/.test(await src('services/calendar-personal.js')));

  /* ======== 2) تشخيص الإشعارات ======== */
  await t.test('17. relTime بالعربية (الآن · دقائق · ساعات · أيام)', relTime(T, T + 5000) === 'الآن' && relTime(T, T + 5 * 60000) === 'منذ 5 دقائق' && relTime(T, T + 2 * 3600000) === 'منذ ساعتين' && relTime(T, T + 3 * DAYMS) === 'منذ 3 أيام' && relTime(0, T) === '');
  await t.test('18. شرح الأخطاء: القواعد · VAPID · واجهة FCM · الإذن · الشبكة · مجهول', explainPushError('error', 'Missing or insufficient permissions.').title.includes('قواعد Firestore') && explainPushError('error', 'Invalid raw ECDSA P-256 public key').title.includes('VAPID') && explainPushError('error', 'messaging/token-subscribe-failed: API has not been used').title.includes('FCM') && explainPushError('permission-denied', '').title.includes('إذن') && explainPushError('error', 'Failed to fetch').title.includes('الاتصال') && explainPushError('error', 'zzz').title.includes('غير معروف'));
  await t.test('19. formatPushError: السبب — الحل [الخام] والخام مقصوص 160', (() => { const f = formatPushError('error', 'Missing or insufficient permissions.'); const long = formatPushError('error', 'x'.repeat(500)); return f.includes('—') && f.endsWith('[Missing or insufficient permissions.]') && long.length < 400; })());

  const L = { supported: true, permission: 'granted', registered: true, signedIn: true };
  const goodCloud = { ok: true, tokens: 1, hasMyToken: true, digestAt: T - 10 * 60000, lastSentDay: '2026-06-10', lastCheckAt: T - 12 * 60000 };
  const st = (o) => buildPushStatus({ local: { ...L, ...(o.local || {}) }, cloud: 'cloud' in o ? o.cloud : goodCloud, now: T });
  await t.test('20. كل شيء سليم ⟵ level=ok وبلا خطوة تالية', (() => { const m = st({}); return m.level === 'ok' && m.next === '' && m.rows.map((r) => r.id).join() === 'support,permission,signin,device,digest,server,daily'; })());
  await t.test('21. الإذن مرفوض ⟵ bad مع الحل', (() => { const m = st({ local: { permission: 'denied' } }); return m.level === 'bad' && m.next.includes('إعدادات المتصفح'); })());
  await t.test('22. لم يعمل الخادم بعد ⟵ warn ويدلّ على Push cron', (() => { const m = st({ cloud: { ...goodCloud, lastCheckAt: 0 } }); return m.level === 'warn' && m.next.includes('Push cron'); })());
  await t.test('23. الخادم متوقف > 6 ساعات ⟵ bad؛ 3 ساعات ⟵ warn؛ 20 دقيقة ⟵ ok', st({ cloud: { ...goodCloud, lastCheckAt: T - 7 * 3600000 } }).level === 'bad' && st({ cloud: { ...goodCloud, lastCheckAt: T - 3 * 3600000 } }).level === 'warn' && st({ cloud: { ...goodCloud, lastCheckAt: T - 20 * 60000 } }).level === 'ok');
  await t.test('24. رمز الجهاز غير موجود في السحابة ⟵ bad', (() => { const m = st({ cloud: { ...goodCloud, hasMyToken: false } }); return m.level === 'bad' && m.rows.find((r) => r.id === 'device').state === 'bad'; })());
  await t.test('25. ملخص قديم (> 3 أيام) ⟵ warn', st({ cloud: { ...goodCloud, digestAt: T - 5 * DAYMS } }).level === 'warn');
  await t.test('26. بلا قراءة السحابة (cloud=null) ⟵ صفوف idle بلا ادّعاء نجاح', (() => { const m = st({ cloud: null }); return ['digest', 'server', 'daily'].every((id) => m.rows.find((r) => r.id === id).state === 'idle'); })());
  await t.test('27. فشل قراءة السحابة يُشرح بالعربية', (() => { const m = st({ cloud: { ok: false, message: 'Missing or insufficient permissions.' } }); const r = m.rows.find((x) => x.id === 'cloud'); return !!r && r.value.includes('قواعد Firestore') && m.level === 'warn'; })());
  await t.test('28. غير مفعّل على الجهاز ⟵ warn ويدلّ على زر التفعيل', (() => { const m = st({ local: { registered: false } }); return m.rows.find((r) => r.id === 'device').state === 'warn' && m.next.includes('تفعيل'); })());

  const psync = await src('sync/push-sync.js'); const sp = await src('pages/settings/section-push.js'); const runner = await src('../scripts/push-runner.cjs');
  const gcs = psync.slice(psync.indexOf('export async function getCloudStatus'), psync.indexOf('export { collect as collectDigestSource }'));
  await t.test('29. getCloudStatus قراءة فقط (لا setDoc/updateDoc/deleteDoc) ولا تُرمى أخطاؤها', gcs.length > 200 && !/setDoc|updateDoc|deleteDoc|deleteField/.test(gcs) && gcs.includes('catch (e)'));
  await t.test('30. البطاقة: لا تحميل Firebase عند مجرد فتح الإعدادات (فحص تلقائي للمفعّل فقط)', sp.includes('push-diag') && sp.includes('buildPushStatus(') && sp.includes('if (push.getLocalStatus().registered) runDiag()') && sp.includes('formatPushError('));
  await t.test('31. المُرسِل يسجّل lastCheckAt لتقرأه البطاقة (بلا كتابة ملفات)', runner.includes('lastCheckAt: now') && !/writeFileSync|appendFileSync/.test(runner));

  /* ======== 3) توحيد ملخص الصباح مع الإشعار ======== */
  const customers = [{ id: 1, name: 'محمد علي' }, { id: 2, name: 'سعيد' }];
  const orders = [
    { id: 'a', customerId: 1, status: 'in_progress', dueDate: at(5, 10) },                 /* اليوم */
    { id: 'r', customerId: 2, status: 'ready', dueDate: at(5, 10), readyAt: T - 5 * DAYMS }, /* جاهز وموعده اليوم: لا يتكرر في «اليوم» */
    { id: 'l', customerId: 1, status: 'pending', dueDate: at(5, 7) },                      /* متأخر */
    { id: 'f', customerId: 2, status: 'in_progress', dueDate: at(5, 20) },
  ];
  const source = {
    settings: { notifications: { push: { enabled: true, includeNames: true } } },
    orders, customers, lowStock: 2, outOfStock: 1,
    commitments: [{ name: 'إيجار', dueDay: 11 }], documents: [{ title: 'رخصة', expiresAt: at(5, 20), remindDays: 30 }, { title: 'سجل', expiresAt: at(5, 1) }],
    circles: [{ name: 'جمعية', installment: 500, members: 6, myTurn: 2, startYm: '2026-06', payDay: 12, paid: {} }],
    tasks: [{ kind: 'task', title: 'م1', due: at(5, 10) }, { kind: 'task', title: 'م2', due: at(5, 4) }],
  };
  const base = { orders, customers, appointments: [], payments: [] };
  const sec = (m, id) => m.sections.find((s) => s.id === id);
  const old = buildMorningModel(base, T);
  await t.test('32. بلا source السلوك القديم حرفياً (لا أقسام جديدة، unified=false)', old.unified === false && old.sections.every((s) => ['late', 'today', 'ready', 'appts', 'week'].includes(s.id)));
  const m = buildMorningModel({ ...base, source }, T);
  await t.test('33. مع source: أقسام المخزون والالتزامات والمستندات والجمعيات والمهام تظهر', m.unified === true && ['stock', 'commitments', 'docs', 'circles', 'tasks'].every((id) => !!sec(m, id)));
  const g = buildDigest({ ...source, now: T }); const bc = briefCounts(g, serverPrefs(source.settings, Intl.DateTimeFormat().resolvedOptions().timeZone), {}, T).counts;
  await t.test('34. أعداد الملخص = أعداد briefCounts على نفس الـdigest (لا رقمان)', sec(m, 'late').count === bc.overdue && sec(m, 'today').count === bc.today && sec(m, 'ready').count === bc.ready && sec(m, 'stock').count === bc.out + bc.low && sec(m, 'commitments').count === bc.commitments && sec(m, 'docs').count === bc.docsExpired + bc.docsNear && sec(m, 'circles').count === bc.circles && sec(m, 'tasks').count === bc.tasksToday + bc.tasksOverdue);
  await t.test('35. الجاهز الذي موعده اليوم يُحسب في «جاهز» فقط (اليوم=1 لا 2)', sec(m, 'today').count === 1 && sec(m, 'ready').count === 1);
  await t.test('36. أعداد الطلبات في النموذج القديم (شاشة الورشة) = الموحّد: لا تناقض بين الواجهتين', ['late', 'today', 'ready'].every((id) => (sec(old, id) || { count: 0 }).count === (sec(m, id) || { count: 0 }).count));
  await t.test('37. مفاتيح الإشعار تُحترم: إيقاف المخزون والمتأخر ⟵ يختفيان من الملخص', (() => { const m2 = buildMorningModel({ ...base, source: { ...source, settings: { notifications: { push: { enabled: true, stock: false, overdue: false } } } } }, T); return !sec(m2, 'stock') && !sec(m2, 'late') && !!sec(m2, 'today'); })());
  await t.test('38. بلا أسماء (includeNames=false) لا أسماء في الأقسام الجديدة', (() => { const m3 = buildMorningModel({ ...base, source: { ...source, settings: { notifications: { push: { enabled: true, includeNames: false } } } } }, T); return ['commitments', 'docs', 'circles'].every((id) => !sec(m3, id) || sec(m3, id).names.length === 0); })());
  await t.test('39. مصدر فارغ لا ينهار والإجمالي صفر', (() => { const e = buildMorningModel({ orders: [], customers: [], appointments: [], payments: [], source: { settings: {}, orders: [], customers: [] } }, T); return e.total === 0 && e.sections.length === 0; })());
  await t.test('40. EMPTY_COUNTS مجمّد ولا يتغير بين الاستدعاءات', (() => { const c1 = briefCounts({ orders: [{ i: 'x', r: 1 }] }, { tz: 'UTC' }, {}, T).counts; const c2 = briefCounts(null, { tz: 'UTC' }, {}, T).counts; return Object.isFrozen(EMPTY_COUNTS) && c1.ready === 1 && c2.ready === 0; })());

  const ui = await src('ui/morning-summary.js');
  await t.test('41. واجهة الصباح تقرأ نفس مصدر الإشعار وتتحمّل فشله', ui.includes("collectDigestSource } from '../sync/push-sync.js'") && ui.includes('data.source = await collectDigestSource()') && ui.includes('هذه الأرقام نفسها التي تصلك في إشعار الجوال'));
});
