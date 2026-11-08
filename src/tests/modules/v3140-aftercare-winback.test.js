/* ==========================================================================
   v3140-aftercare-winback.test.js — خطة التحصيل · التعديلات والمرتجعات · العملاء المنقطعون (v3.14.0)
   ========================================================================== */
import { register } from '../registry.js';
import { STORES, DB_CONFIG } from '../../core/config.js';
import { SCHEMA } from '../../data/schema.js';
import { RECORD_STORES } from '../../data/record-meta.js';
import { SYNC_STORES } from '../../sync/firestore-sync.js';
import { NAV_IDS, groupIdOf, NAV_GROUPS } from '../../services/nav-groups.js';
import { canAccess, FINANCE_LOCK_PAGES } from '../../services/roles.js';
import { collectionPlan } from '../../services/daily-need.js';
import {
  KINDS, REASONS, normalizeKind, normalizeReason, normalizeStatus, kindMeta, reasonLabel,
  checkCaseInput, deliveredCount, aftercareStats, sortCases,
} from '../../services/aftercare.js';
import { RANGES, DEFAULT_DAYS, normalizeDays, winbackList, winbackSummary, buildWinbackText } from '../../services/winback.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const DAY = 86400000;
const NOW = new Date(2026, 5, 10, 12);
const T = NOW.getTime();

register('v3.14.0 التحصيل والتعديلات والمنقطعون', async (t) => {
  /* ---- خطة التحصيل ---- */
  const items = [{ name: 'أ', remaining: 300 }, { name: 'ب', remaining: 900 }, { name: 'ج', remaining: 0 }, { name: 'د', remaining: 300, late: true }, { name: 'هـ', remaining: -50 }, null];
  await t.test('1. خطة التحصيل: بلا عجز ⟵ null', collectionPlan(items, 0) === null && collectionPlan(items, -5) === null && collectionPlan(items, 'x') === null);
  await t.test('2. الأكبر متبقياً أولاً ويتوقف عند تغطية العجز', (() => { const p = collectionPlan(items, 800); return p.picks.length === 1 && p.picks[0].name === 'ب' && p.met && p.covered === 900 && p.gap === 0; })());
  await t.test('3. عند التساوي المتأخر أولاً، ويتجاهل الصفر والسالب والفاسد', (() => { const p = collectionPlan(items, 1500); return p.picks.map((x) => x.name).join('') === 'بدأ' && p.covered === 1500 && p.met; })());
  await t.test('4. لا تكفي الطلبات ⟵ met=false والفجوة المتبقية', (() => { const p = collectionPlan(items, 5000); return !p.met && p.covered === 1500 && p.gap === 3500 && p.picks.length === 3; })());
  await t.test('5. حد أقصى للعدد', collectionPlan(Array.from({ length: 10 }, () => ({ remaining: 10 })), 1000, 3).picks.length === 3 && collectionPlan(Array.from({ length: 10 }, () => ({ remaining: 10 })), 1000, 0).picks.length === 5);
  await t.test('6. بلا طلبات أو مدخل فاسد ⟵ خطة فارغة بلا انهيار', collectionPlan([], 100).picks.length === 0 && collectionPlan(null, 100).gap === 100);

  /* ---- التعديلات والمرتجعات ---- */
  await t.test('7. ثلاثة أنواع وستة أسباب والتطبيع الآمن', KINDS.length === 3 && REASONS.length === 6 && normalizeKind('x') === 'alteration' && normalizeKind('return') === 'return' && normalizeReason('x') === 'other' && normalizeReason('measure') === 'measure' && normalizeStatus('x') === 'open' && normalizeStatus('done') === 'done');
  await t.test('8. kindMeta وreasonLabel', kindMeta('remake').icon === '🔁' && kindMeta(null).id === 'alteration' && reasonLabel('sewing') === 'عيب خياطة' && reasonLabel('zz') === 'أخرى');
  await t.test('9. checkCaseInput: الطلب مطلوب والمبالغ غير سالبة ومعقولة', !checkCaseInput({}).ok && !checkCaseInput({ orderId: 'o1', cost: -1 }).ok && !checkCaseInput({ orderId: 'o1', refund: -1 }).ok && !checkCaseInput({ orderId: 'o1', cost: 1e9 }).ok && !checkCaseInput(null).ok);
  await t.test('10. checkCaseInput: يُنقّي ويقرّب ويحدّ الملاحظات', (() => { const r = checkCaseInput({ orderId: 'o1', kind: 'zz', reason: 'zz', cost: '12.345', refund: '', notes: ' <b>مقاس</b>  ضيق ' + 'س'.repeat(900) }); return r.ok && r.data.kind === 'alteration' && r.data.reason === 'other' && r.data.cost === 12.35 && r.data.refund === 0 && r.data.notes.startsWith('b مقاس') && r.data.notes.length === 400; })());
  await t.test('11. عدد المُسلَّم في 90 يوماً (تاريخ التسليم ثم التحديث ثم الإنشاء)', deliveredCount([
    { status: 'delivered', deliveredAt: T - 10 * DAY }, { status: 'delivered', deliveredAt: T - 120 * DAY }, { status: 'delivered', updatedAt: T - 5 * DAY },
    { status: 'new', createdAt: T }, null,
  ], NOW) === 2);
  const cases = [
    { status: 'open', reason: 'measure', cost: 100, refund: 0, createdAt: T - 2 * DAY },
    { status: 'open', reason: 'measure', cost: 50, refund: 200, createdAt: T - 5 * DAY },
    { status: 'done', reason: 'sewing', cost: 30, refund: 0, createdAt: T - 40 * DAY, closedAt: T - 38 * DAY },
    { status: 'done', reason: 'late', cost: 0, refund: 0, createdAt: T - 200 * DAY, closedAt: T - 190 * DAY },
    null,
  ];
  const st = aftercareStats(cases, 20, NOW);
  await t.test('12. إحصاءات: المفتوحة وتكلفة ومرتجع الشهر الحالي فقط', st.open === 2 && st.monthCount === 2 && st.monthCost === 150 && st.monthRefund === 200);
  await t.test('13. معدل الرجوع = حالات 90 يوماً ÷ المُسلَّم في 90 يوماً', st.rate90 === 15 && aftercareStats(cases, 0, NOW).rate90 === null);
  await t.test('14. الأسباب الأكثر تكراراً في 90 يوماً (القديمة خارجها)', st.topReasons[0].id === 'measure' && st.topReasons[0].count === 2 && !st.topReasons.some((r) => r.id === 'late'));
  await t.test('15. متوسط مدة الحل من المغلقة الصالحة', st.avgCloseDays === 6 && aftercareStats([], 5, NOW).avgCloseDays === null);
  await t.test('16. إحصاءات بلا بيانات ⟵ أصفار بلا انهيار', (() => { const z = aftercareStats(null, 0, NOW); return z.open === 0 && z.monthCost === 0 && z.topReasons.length === 0 && z.rate90 === null; })());
  await t.test('17. الترتيب: المفتوحة أولاً (الأقدم أولاً) ثم المغلقة (الأحدث أولاً)', (() => { const s = sortCases(cases); return s.length === 4 && s[0].createdAt === T - 5 * DAY && s[1].createdAt === T - 2 * DAY && s[2].status === 'done' && s[2].closedAt > s[3].closedAt; })());

  /* ---- العملاء المنقطعون ---- */
  const cu = [{ id: 'a', name: 'أحمد', phone: '0100' }, { id: 'b', name: 'منى' }, { id: 'c', name: 'سمير' }, { id: 'd', name: 'ليلى' }, { id: 'e', name: 'بلا طلبات' }];
  const od = [
    { customerId: 'a', status: 'delivered', amount: 500, deliveredAt: T - 120 * DAY }, { customerId: 'a', status: 'delivered', amount: 700, deliveredAt: T - 100 * DAY },
    { customerId: 'b', status: 'delivered', amount: 300, deliveredAt: T - 95 * DAY }, { customerId: 'c', status: 'delivered', amount: 900, deliveredAt: T - 200 * DAY },
    { customerId: 'c', status: 'new', amount: 100, createdAt: T - DAY }, { customerId: 'd', status: 'delivered', amount: 100, deliveredAt: T - 10 * DAY },
    { customerId: 'e', status: 'cancelled', amount: 50, createdAt: T - 300 * DAY },
  ];
  await t.test('18. المنقطعون: لهم طلب مُسلَّم ولا مفتوح ومرّت المدة، الأعلى إنفاقاً أولاً', (() => { const l = winbackList(cu, od, T, 90); return l.length === 2 && l[0].name === 'أحمد' && l[0].totalSpent === 1200 && l[0].orders === 2 && l[0].daysSince === 100 && l[1].name === 'منى'; })());
  await t.test('19. من عنده طلب مفتوح أو مُسلَّم حديثاً أو لا مُسلَّم له ليس منقطعاً', !winbackList(cu, od, T, 60).some((i) => ['c', 'd', 'e'].includes(i.customerId)));
  await t.test('20. المدة الأطول تُقصي أكثر، والمدة غير الصالحة ⟵ 90', winbackList(cu, od, T, 180).length === 0 && normalizeDays(7) === 90 && normalizeDays('180') === 180 && RANGES.join() === '60,90,180' && DEFAULT_DAYS === 90 && winbackList(cu, od, T, 7).length === 2);
  await t.test('21. مدخلات فاسدة ⟵ قائمة فارغة', winbackList(null, null, T).length === 0 && winbackList([null], [null], T).length === 0);
  await t.test('22. الملخص: العدد ومن لديهم رقم ومتوسط الإنفاق', (() => { const s = winbackSummary(winbackList(cu, od, T, 90)); return s.count === 2 && s.withPhone === 1 && s.avgSpent === 750; })() && winbackSummary(null).count === 0);
  await t.test('23. رسالة «نفتقدك»: اسم العميل والورشة، ومحايدة بلا عبارات دينية', (() => { const m = buildWinbackText({ name: 'أحمد' }, 'ورشة النور'); return m.includes('أحمد') && m.includes('ورشة النور') && !/(الله|إن شاء|بسم|السلام|رمضان|عيد)/.test(m); })() && buildWinbackText(null).startsWith('أهلاً بك'));

  /* ---- التسجيل ---- */
  await t.test('24. مخزن aftercare في STORES والمخطط بفهارسه والإصدار 14', STORES.AFTERCARE === 'aftercare' && SCHEMA.aftercare && SCHEMA.aftercare.indexes.some((i) => i.name === 'by_orderId') && SCHEMA.aftercare.indexes.some((i) => i.name === 'by_status') && DB_CONFIG.version >= 14);
  await t.test('25. المخزن في قائمتي المزامنة والسجلات متطابقتين', RECORD_STORES.includes('aftercare') && SYNC_STORES.includes('aftercare') && RECORD_STORES.length === SYNC_STORES.length);
  const bk = await src('pages/settings/section-backup-io.js');
  await t.test('26. المخزن في تصدير واستيراد النسخ الاحتياطي (الموضعين)', (bk.match(/'aftercare'/g) || []).length === 2);
  await t.test('27. الصفحتان في القائمة بمجموعتيهما وبلا أيقونة مكررة وبحد 7 للمجموعة', NAV_IDS.has('aftercare') && NAV_IDS.has('winback') && groupIdOf('aftercare') === 'daily' && groupIdOf('winback') === 'growth' && NAV_GROUPS.every((g) => g.items.length <= 7));
  await t.test('28. الصلاحيات: المالك والمدير نعم والاستقبال لا، والتعديلات تحت القفل المالي', ['aftercare', 'winback'].every((p) => canAccess('owner', p) && canAccess('manager', p) && !canAccess('receptionist', p)) && FINANCE_LOCK_PAGES.includes('aftercare'));
  const main = await src('main.js');
  await t.test('29. الراوتر وخريطة التصدير', main.includes("case 'aftercare':          return await import('./pages/aftercare.js');") && main.includes("case 'winback':            return await import('./pages/winback.js');") && main.includes("aftercare:            'aftercarePage'") && main.includes("winback:              'winbackPage'"));

  /* ---- عقود الواجهات ---- */
  const dn = await src('ui/daily-need-cards.js');
  await t.test('30. خطة التحصيل: تظهر عند العجز فقط وتستعمل تذكير الاستلام المسجَّل', dn.includes('if (!sur || sur.surplus >= 0) return;') && dn.includes("kind: 'pickup_ready'") && dn.includes('collectionPlan(d.pickups && d.pickups.items, -sur.surplus, 5)'));
  const ap = await src('pages/aftercare.js'); const af = await src('pages/aftercare-forms.js'); const wp = await src('pages/winback.js');
  await t.test('31. الصفحات الجديدة: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ap + af + wp) && !/\bimport\(/.test(ap + af + wp));
  await t.test('32. التعديلات منفصلة عن المال: لا تلمس الدفعات ولا المصروفات', !/repos\/(payments|expenses)\.js/.test(ap + af) && af.includes("status: 'open'"));
  await t.test('33. العملاء المنقطعون: الرسالة تُفتح ولا تُرسل تلقائياً وتُسجَّل بنوع winback', wp.includes("kind: 'winback'") && wp.includes('sendLogged(') && !/setTimeout|setInterval/.test(wp) && wp.includes("lastSentIn(loadLog(), { kinds: ['winback']"));
  await t.test('34. إعادة فتح الحالة تمسح تاريخ الإغلاق', af.includes("{ status: 'open', closedAt: null }"));
  await t.test('35. سياق الصفحة يحمل الطلبات والعملاء للنماذج (قاعدة ctx الثابتة)', ap.includes('const ctx = { refresh, orders: [], customers: [] }') && ap.includes('ctx.orders = o; ctx.customers = cu;') && af.includes('ctx.orders') && af.includes('ctx.customers'));
});
