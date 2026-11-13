/* ==========================================================================
   v3190-actions-cashflow-quickorder.test.js — مركز العمل · توقّع السيولة · الإدخال السريع · القيطان · التقرير والإقفال · المشتريات · الماكينات (v3.19.0)
   ========================================================================== */
import { register } from '../registry.js';
import { calcQitan, QITAN_RATIO, toMeters, MAX_QTY } from '../../services/qitan-calc.js';
import { parseQuickOrder, toOrderDraft, normalizeDigits } from '../../services/quick-order.js';
import { buildWeeklyReport, weeklyDigest, weeklyText, weekRange } from '../../services/weekly-report.js';
import { buildMonthClose, closeWindow, monthBounds, ymOf } from '../../services/month-close.js';
import { buildCashflow } from '../../services/cashflow-forecast.js';
import { buildPurchasePlan, matchTemplate, DEFAULT_AVG_HEIGHT_CM } from '../../services/purchase-plan.js';
import { buildActionCenter, pruneState, snoozeKey, doneKey, clearKey, snoozedOrders, ORDER_KEY, KINDS } from '../../services/action-center.js';
import { newMachine, addHours, serviceDone, machineStatus, machineAlerts, sanitizeMachines } from '../../services/machinery.js';
import { scanIntegrity, ISSUE_LABELS } from '../../services/data-integrity.js';
import { buildDigest, pushOptions, serverPrefs } from '../../services/push-digest.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const DAY = 86400000;
const NOW = new Date(2026, 10, 11, 10, 0).getTime();   /* الأربعاء 2026-11-11 */
const ymd = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

register('v3.19.0 مركز العمل وتوقّع السيولة والإدخال السريع والقيطان والتقرير والمشتريات والماكينات', async (t) => {
  /* ======== 1) حاسبة القيطان ======== */
  await t.test('1. المعامل = 1.70 ÷ 1.30 ≈ 1.30769', Math.abs(QITAN_RATIO - 1.3076923) < 1e-6);
  await t.test('2. القاعدة: 1.30 م نهائي ⟵ 1.70 م خام بالضبط', calcQitan({ finalLength: 1.3, unit: 'm', marginPct: 0 }).exactRawM === 1.7);
  await t.test('3. 85 سم بهامش 5% ⟵ 1.112 خام و1.167 موصى به (مثال المستخدم)', (() => { const r = calcQitan({ finalLength: 0.85, unit: 'm', marginPct: 5 }); return r.ok && r.exactRawM === 1.112 && r.recommendedRawM === 1.167 && r.extraM === 0.055 && r.exactRawM + r.extraM === r.recommendedRawM; })());
  await t.test('4. السنتيمتر والمتر يعطيان النتيجة نفسها', calcQitan({ finalLength: 85, unit: 'cm' }).recommendedRawM === calcQitan({ finalLength: 0.85, unit: 'm' }).recommendedRawM && toMeters(250, 'cm') === 2.5);
  await t.test('5. عدد القطع يضرب الطول: 4 × 85 سم ⟵ 4.446 م خام', (() => { const r = calcQitan({ finalLength: 85, unit: 'cm', quantity: 4, marginPct: 0 }); return r.totalFinalM === 3.4 && r.exactRawM === 4.446 && r.quantity === 4; })());
  await t.test('6. الهامش: غير رقمي ⟵ 5%، فوق 30 ⟵ 30، سالب ⟵ 0؛ العدد: 0 ⟵ 1 وفوق 999 ⟵ 999', calcQitan({ finalLength: 1, marginPct: 'abc' }).marginPct === 5 && calcQitan({ finalLength: 1, marginPct: 99 }).marginPct === 30 && calcQitan({ finalLength: 1, marginPct: -5 }).marginPct === 0 && calcQitan({ finalLength: 1, quantity: 0 }).quantity === 1 && calcQitan({ finalLength: 1, quantity: 5000 }).quantity === MAX_QTY);
  await t.test('7. مدخلات خاطئة ⟵ ok:false بلا استثناء (فارغ · سالب · صفر · وحدة غريبة · بلا وسائط)', [calcQitan({ finalLength: '' }), calcQitan({ finalLength: -2 }), calcQitan({ finalLength: 0 }), calcQitan({ finalLength: 5, unit: 'ft' }), calcQitan()].every((r) => r.ok === false && r.error));

  /* ======== 2) الإدخال السريع بجملة ======== */
  const customers = [{ id: 'c1', name: 'محمد علي' }, { id: 'c2', name: 'سعيد حسن' }, { id: 'c3', name: 'فاطمة' }, { id: 'c4', name: 'محمد سالم' }];
  const catalog = [{ name: 'جلابية', price: 500 }, { name: 'عباية', price: 800 }];
  const q = (text) => parseQuickOrder(text, { customers, catalog, now: NOW });
  await t.test('8. «جلابية محمد علي 600 الخميس عربون 200» ⟵ عميل وسعر وعربون وموعد الخميس', (() => { const r = q('جلابية محمد علي 600 الخميس عربون 200'); return r.customerId === 'c1' && r.items[0].name === 'جلابية' && r.items[0].quantity === 1 && r.items[0].price === 600 && r.deposit === 200 && r.dueDate === '2026-11-12'; })());
  await t.test('9. أرقام هندية وعدد وسعر كلي: «٢ جلابية لسعيد حسن بـ ١٢٠٠ بعد 3 أيام»', (() => { const r = q('٢ جلابية لسعيد حسن بـ ١٢٠٠ بعد 3 أيام'); return r.customerId === 'c2' && r.items[0].quantity === 2 && r.items[0].price === 600 && r.total === 1200 && r.dueDate === '2026-11-14'; })());
  await t.test('10. «عباية فاطمة 800 بكرة» ⟵ بكرة = غداً', (() => { const r = q('عباية فاطمة 800 بكرة'); return r.customerId === 'c3' && r.items[0].name === 'عباية' && r.total === 800 && r.dueDate === '2026-11-12'; })());
  await t.test('11. اسم يطابق عميلين ⟵ لا يُخمَّن: مرشحون وتحذير', (() => { const r = q('جلابية محمد 600 الخميس'); return r.customerId === null && r.candidates.length === 2 && r.warnings.some((w) => w.includes('أكثر من عميل')); })());
  await t.test('12. «ثلاث جلابيات سعيد 450 للواحدة 20/11» ⟵ 3 × 450 = 1350 وتاريخ 20/11', (() => { const r = q('ثلاث جلابيات سعيد 450 للواحدة 20/11'); return r.customerId === 'c2' && r.items[0].quantity === 3 && r.items[0].price === 450 && r.total === 1350 && r.dueDate === '2026-11-20'; })());
  await t.test('13. بلا سعر ⟵ سعر القطعة من أنواعك مع تحذير صريح', (() => { const r = q('جلابية سعيد حسن'); return r.items[0].price === 500 && r.warnings.some((w) => w.includes('السعر من قائمة أنواعك')); })());
  await t.test('14. «يوم 15» ⟵ 15 من هذا الشهر، و«بعد أسبوع» ⟵ +7', q('جلابية فاطمة 400 يوم 15').dueDate === '2026-11-15' && q('جلابية فاطمة 400 بعد أسبوع').dueDate === '2026-11-18');
  await t.test('15. جملة فارغة أو عشوائية ⟵ ok:false بتحذير ولا استثناء', (() => { const a = q(''); const b = q('كلام عشوائي'); return a.ok === false && a.warnings.length === 1 && b.ok === false && b.items[0].name === 'بند'; })());
  await t.test('16. عميل غير موجود ⟵ لا تخمين (customerId=null) مع تحذير باسمه', (() => { const r = q('جلابية خالد 600'); return r.customerId === null && r.candidates.length === 0 && r.warnings.some((w) => w.includes('خالد')); })());
  await t.test('17. العربون الأكبر من الإجمالي يُنبَّه', q('جلابية فاطمة 300 عربون 500').warnings.some((w) => w.includes('العربون أكبر')));
  await t.test('18. toOrderDraft: مسودة بشكل استمارة الطلب (معرّف نصي · pending · تاريخ اليوم · بنود)', (() => { const d = toOrderDraft(q('جلابية محمد علي 600 الخميس عربون 200'), NOW); return d.customerId === 'c1' && d.status === 'pending' && d.receivedDate === '2026-11-11' && d.dueDate === '2026-11-12' && d.deposit === 200 && d.items.length === 1 && d.items[0].id.startsWith('qo_') && d.items[0].price === 600 && Array.isArray(d.fees); })());
  await t.test('19. normalizeDigits يحوّل الأرقام الهندية', normalizeDigits('٢٠٢٦ ١٢٣') === '2026 123');

  /* ======== 3) تقرير الأسبوع ======== */
  const wOrders = [
    { id: 'o1', customerId: 1, status: 'delivered', amount: 1000, deliveredAt: NOW - DAY, createdAt: NOW - 20 * DAY },
    { id: 'o2', customerId: 1, status: 'pending', amount: 500, dueDate: NOW - 3 * DAY, createdAt: NOW - 20 * DAY },
    { id: 'o3', customerId: 2, status: 'in_progress', amount: 700, dueDate: NOW + 5 * DAY, createdAt: NOW - 2 * DAY },
    { id: 'o4', customerId: 2, status: 'ready', amount: 300, createdAt: NOW - 20 * DAY },
  ];
  const wPays = [{ id: 'p1', orderId: 'o1', customerId: 1, amount: 600, date: NOW - DAY }, { id: 'p2', orderId: 'o1', customerId: 1, amount: 999, date: NOW - 10 * DAY }];
  const wr = buildWeeklyReport({ orders: wOrders, payments: wPays, expenses: [{ id: 'e1', amount: 200, date: NOW - 2 * DAY }, { id: 'e2', amount: 50, date: NOW - 30 * DAY }], customers: [{ id: 1, name: 'محمد' }, { id: 2, name: 'سعيد' }], now: NOW });
  await t.test('20. المحصّل = دفعات الأسبوع فقط (600) والمصروف = 200 والصافي 400', wr.income === 600 && wr.expenses === 200 && wr.net === 400);
  await t.test('21. المسلَّم والجديد والمتأخر والجاهز', wr.delivered.count === 1 && wr.delivered.amount === 1000 && wr.created === 1 && wr.overdue === 1 && wr.ready === 1);
  await t.test('22. أعلى العملاء دفعاً بالاسم', wr.top.length === 1 && wr.top[0].name === 'محمد' && wr.top[0].amount === 600);
  await t.test('23. weeklyDigest أرقام مضغوطة صحيحة', (() => { const d = weeklyDigest(wr); return d.inc === 600 && d.exp === 200 && d.del === 1 && d.ovd === 1 && typeof d.rec === 'number'; })());
  await t.test('24. نص المشاركة يحوي العنوان والمحصّل والصافي واسم الورشة', (() => { const x = weeklyText(wr, 'ورشة النور'); return x.includes('📈 تقرير الأسبوع — ورشة النور') && x.includes('المحصّل: 600 ج') && x.includes('الصافي: 400 ج'); })());
  await t.test('25. weekRange: 7 أيام كاملة', (() => { const r = weekRange(NOW, 7); const d = (r.to - r.from) / DAY; return d > 6.8 && d < 7.2; })());
  await t.test('26. بلا بيانات ⟵ أصفار لا استثناء', (() => { const e = buildWeeklyReport({}); return e.income === 0 && e.net === 0 && e.top.length === 0 && weeklyText(e).includes('تقرير الأسبوع'); })());

  /* ======== 4) إقفال الشهر ======== */
  await t.test('27. ymOf/monthBounds والتسمية العربية', ymOf(NOW) === '2026-11' && monthBounds('2026-11').label === 'نوفمبر 2026' && monthBounds('2026-11').dim === 30);
  await t.test('28. نافذة الإقفال: وسط الشهر مغلقة، آخر 3 أيام وأول 5 أيام مفتوحتان', closeWindow(NOW).open === false && closeWindow(new Date(2026, 10, 29, 9).getTime()).open === true && closeWindow(new Date(2026, 11, 3, 9).getTime()).ym === '2026-11');
  const mcBase = { ym: '2026-11', now: NOW, orders: wOrders, payments: wPays, customers: [{ id: 1, name: 'محمد' }, { id: 2, name: 'سعيد' }], commitments: [{ id: 'cm1', name: 'إيجار', amount: 3000, dueDay: 5 }], commitmentPayments: [], circles: [{ id: 'k1', name: 'جمعية', installment: 500, members: 6, myTurn: 2, startYm: '2026-11', payDay: 12, paid: {} }], lastBackupAt: NOW - 2 * DAY };
  const mc = buildMonthClose(mcBase);
  const st = (m, id) => (m.items.find((i) => i.id === id) || {}).state;
  await t.test('29. فحوص الإقفال: التزام لم يُسجَّل دفعه ⟵ warn، وجمعية غير مدفوعة ⟵ warn، ونسخة حديثة ⟵ ok', st(mc, 'commitments') === 'warn' && st(mc, 'circles') === 'warn' && st(mc, 'backup') === 'ok');
  await t.test('30. تسجيل دفعة الالتزام وقسط الجمعية يحوّلهما إلى ok', (() => { const m2 = buildMonthClose({ ...mcBase, commitmentPayments: [{ commitmentId: 'cm1', amount: 3000, date: NOW - 3 * DAY }], circles: [{ ...mcBase.circles[0], paid: { '2026-11': true } }] }); return st(m2, 'commitments') === 'ok' && st(m2, 'circles') === 'ok' && m2.warns < mc.warns; })());
  await t.test('31. بلا نسخة احتياطية ⟵ warn، وعلامة الإقفال تُقرأ', st(buildMonthClose({ ...mcBase, lastBackupAt: 0 }), 'backup') === 'warn' && buildMonthClose({ ...mcBase, closedAt: NOW }).closed === true && mc.closed === false);
  await t.test('32. الملخص والتقدم متّسقان (done+warns = total)', mc.progress.total === mc.items.length && mc.progress.done + mc.warns === mc.progress.total && mc.summary.income === 1599);

  /* ======== 5) توقّع السيولة ======== */
  const cfBase = {
    now: NOW, opening: 1000, homeMonthly: 3000,
    customers: [{ id: 1, name: 'محمد' }],
    orders: [{ id: 'o1', customerId: 1, status: 'in_progress', amount: 2000, dueDate: NOW + 3 * DAY }],
    payments: [{ id: 'p1', orderId: 'o1', amount: 500, date: NOW - DAY }],
    commitments: [{ id: 'r', name: 'إيجار', amount: 3000, dueDay: 16 }],
    workers: [{ id: 'w1', active: true, salaryType: 'fixed', salary: 4000 }],
  };
  const cf = buildCashflow(cfBase);
  await t.test('33. 30 يوماً، والمتبقي على الطلب (2000−500) يدخل يوم التسليم', cf.days.length === 30 && cf.days[3].inflow === 1500 && cf.days[3].items.some((i) => i.label === 'تحصيل محمد' && i.amount === 1500));
  await t.test('34. الإيجار يوم 16 (اليوم +5) ورواتب العمال آخر الشهر (30 نوفمبر = اليوم +19)', cf.days[5].items.some((i) => i.label === 'إيجار' && i.amount === 3000) && cf.days[19].items.some((i) => i.label.includes('رواتب') && i.amount === 4000));
  await t.test('35. الإجماليات: داخل 1500 · خارج 3000+4000+3000(بيت) · صافي −8500 · رصيد −7500', cf.summary.inflow === 1500 && cf.summary.outflow === 10000 && cf.summary.net === -8500 && cf.summary.end === -7500);
  await t.test('36. بوجود رصيد افتتاحي: أول يوم ينفد فيه الرصيد وأسابيع ضيقة', !!cf.summary.firstNegative && cf.tightWeeks.length >= 1 && cf.days[0].balance !== null);
  await t.test('37. بلا رصيد افتتاحي: لا ادّعاء رصيد (balance=null) ولا يوم نفاد', (() => { const c = buildCashflow({ ...cfBase, opening: null }); return c.hasOpening === false && c.days[0].balance === null && c.summary.firstNegative === null && c.summary.end === null; })());
  await t.test('38. الالتزام المدفوع هذا الشهر لا يُجدوَل، وغير الشهري والمنتهي يُتجاهلان', (() => { const c = buildCashflow({ ...cfBase, commitmentPayments: [{ commitmentId: 'r', amount: 3000, date: NOW - 2 * DAY }] }); const y = buildCashflow({ ...cfBase, commitments: [{ id: 'y', name: 'سنوي', amount: 900, dueDay: 14, frequency: 'yearly' }, { id: 'e', name: 'منتهٍ', amount: 900, dueDay: 14, endMonth: '2026-10' }] }); return !c.days.some((d) => d.items.some((i) => i.label === 'إيجار')) && !y.days.some((d) => d.items.some((i) => i.label === 'سنوي' || i.label === 'منتهٍ')); })());
  await t.test('39. طلب متأخر ⟵ بعد 3 أيام (late)، وجاهز ⟵ بعد يومين، وبلا موعد ⟵ خارج الجدولة، وملغى/مُسلَّم يُتجاهل', (() => {
    const c = buildCashflow({ now: NOW, orders: [
      { id: 'a', status: 'pending', amount: 100, dueDate: NOW - 5 * DAY }, { id: 'b', status: 'ready', amount: 200 }, { id: 'c', status: 'pending', amount: 300 },
      { id: 'd', status: 'delivered', amount: 999, dueDate: NOW + DAY }, { id: 'e', status: 'cancelled', amount: 999, dueDate: NOW + DAY },
    ] });
    return c.days[3].items.some((i) => i.flag === 'late' && i.amount === 100) && c.days[2].items.some((i) => i.flag === 'ready' && i.amount === 200) && c.unscheduled.orders === 1 && c.unscheduled.ordersAmount === 300 && c.summary.inflow === 300;
  })());
  await t.test('40. جمعية: القسط غير المدفوع خارج، وقبض دورك داخل (دورك في نفس شهر الدفع)', (() => {
    const c = buildCashflow({ now: NOW, circles: [{ id: 'k', name: 'ج', installment: 500, members: 6, myTurn: 1, startYm: '2026-11', payDay: 20, paid: {} }] });
    const d = c.days[9];
    return d.items.some((i) => i.kind === 'out' && i.amount === 500) && d.items.some((i) => i.kind === 'in' && i.amount === 3000);
  })());
  await t.test('41. الأفق يُقيَّد بين 7 و90 يوماً، ومدخلات فاسدة بلا استثناء', buildCashflow({ now: NOW, days: 500 }).days.length === 90 && buildCashflow({ now: NOW, days: 1 }).days.length === 7 && buildCashflow(null).days.length === 30 && buildCashflow({ now: NOW, orders: 'x', commitments: [null, 1], circles: 5, workers: [null] }).summary.net === 0);

  /* ======== 6) اقتراح المشتريات ======== */
  const tpl = [{ id: 't1', name: 'جلابية', addCm: 10, multiplier: 2, subtractCm: 30 }];   /* (150+10)×2−30 = 290 سم */
  const ppBase = { now: NOW, avgHeightCm: 150, templates: tpl, fabricCfg: {}, orders: [
    { id: 'a', status: 'in_progress', dueDate: NOW + 6 * DAY, items: [{ name: 'جلابية صعيدي', quantity: 2 }] },
    { id: 'b', status: 'pending', dueDate: NOW + 3 * DAY, items: [{ name: 'جلابية', quantity: 1 }, { name: 'سديري', quantity: 3 }] },
    { id: 'c', status: 'delivered', items: [{ name: 'جلابية', quantity: 9 }] },
  ], inventory: [{ name: 'قماش أبيض', category: 'fabric', unit: 'متر', quantity: 5 }, { name: 'قماش رول', category: 'fabric', unit: 'رول', quantity: 3 }, { name: 'خيط', category: 'thread', quantity: 1, minQuantity: 4, unit: 'بكرة' }] };
  const pp = buildPurchasePlan(ppBase);
  await t.test('42. القماش اللازم = 3 قطع × 2.9 م = 8.7 م، والمتوفر بالمتر 5، والناقص 3.7', pp.pieces === 6 && pp.matchedPieces === 3 && pp.needM === 8.7 && pp.stockM === 5 && pp.shortM === 3.7);
  await t.test('43. المُسلَّم لا يدخل الحساب، وغير المطابق لقالب يُذكر ولا يُخمَّن (سديري ×3)', pp.orders === 2 && pp.unmatched.length === 1 && pp.unmatched[0].qty === 3);
  await t.test('44. «اطلب قبل» = أقرب موعد تسليم − يومين، وأصناف بوحدة غير المتر تُنبَّه في الافتراضات', pp.orderBy === ymd(NOW + 3 * DAY - 2 * DAY) && pp.assumptions.some((a) => a.includes('غير المتر')));
  await t.test('45. أصناف تحت الحد الأدنى (الخيط 1 من 4) في lowItems', pp.lowItems.some((i) => i.name === 'خيط' && i.short === 3));
  await t.test('46. أرخص مورد من لوحة الأسعار', (() => {
    const p = buildPurchasePlan({ ...ppBase, suppliers: [{ id: 's1', name: 'مورد أ' }, { id: 's2', name: 'مورد ب' }], entries: [
      { id: 'e1', supplierId: 's1', type: 'purchase', item: 'قماش أبيض', qty: 10, amount: 500, date: NOW - 5 * DAY }, { id: 'e2', supplierId: 's2', type: 'purchase', item: 'قماش أبيض', qty: 10, amount: 400, date: NOW - 4 * DAY }] });
    return p.supplier === null || (p.supplier.name === 'مورد ب' && p.supplier.pricePerM === 40 && p.supplier.estCost === 148);
  })());
  await t.test('47. متوسط الطول يغيّر النتيجة (170 سم ⟵ 3.3 م للقطعة)، وبلا قوالب usable=false', buildPurchasePlan({ ...ppBase, avgHeightCm: 170 }).needM === 9.9 && buildPurchasePlan({ ...ppBase, templates: [] }).usable === false && buildPurchasePlan().needM === 0 && DEFAULT_AVG_HEIGHT_CM === 150);
  await t.test('48. matchTemplate بالاسم الأطول ويتسامح مع الهمزة والتاء المربوطة', matchTemplate('جلابيه بلدي', tpl) !== null && matchTemplate('سديري', tpl) === null && matchTemplate('', tpl) === null);

  /* ======== 7) الماكينات ======== */
  const m0 = newMachine({ name: 'Daimoku AE-1410', now: NOW });
  await t.test('49. ماكينة جديدة: 0 ساعة، دورة 100، بمعرّف', m0.id.startsWith('mc_') && m0.hours === 0 && m0.intervalHours === 100 && m0.name === 'Daimoku AE-1410');
  await t.test('50. addHours: موجب فقط وحتى 24 للإدخال، والأصل لا يتغير', addHours(m0, 5).hours === 5 && addHours(m0, -3) === m0 && addHours(m0, NaN) === m0 && addHours(m0, 100).hours === 24 && m0.hours === 0);
  await t.test('51. العتبات: 89 ok · 90 soon · 100 due', machineStatus({ hours: 89, intervalHours: 100 }).state === 'ok' && machineStatus({ hours: 90, intervalHours: 100 }).state === 'soon' && machineStatus({ hours: 100, intervalHours: 100 }).state === 'due');
  await t.test('52. ثغرة «hours % 100»: القفز 98 ⟵ 103 يبقى «due» (لا يفوّت الإنذار)', machineStatus({ hours: 103, intervalHours: 100 }).state === 'due' && machineStatus({ hours: 103, intervalHours: 100 }).overBy === 3);
  await t.test('53. تمّت الصيانة تبدأ دورة جديدة من الساعات الحالية', (() => { const m = serviceDone({ ...m0, hours: 130 }, NOW); return m.lastServiceHours === 130 && machineStatus(m).state === 'ok' && machineStatus(m).sinceService === 0; })());
  await t.test('54. machineAlerts: القريبة والمتجاوِزة فقط، والمتجاوِزة أولاً', (() => { const a = machineAlerts([{ id: 'a', name: 'ا', hours: 95, intervalHours: 100 }, { id: 'b', name: 'ب', hours: 120, intervalHours: 100 }, { id: 'c', name: 'ج', hours: 10, intervalHours: 100 }]); return a.length === 2 && a[0].id === 'b' && a[0].state === 'due' && a[1].state === 'soon'; })());
  await t.test('55. sanitizeMachines يحذف الفاسد ويحدّ العدد ويصلح القيم', (() => { const s = sanitizeMachines([null, 5, { name: 'بلا معرّف' }, { id: 'x', hours: -4, intervalHours: 0, name: 'م' }]); return s.length === 1 && s[0].hours === 0 && s[0].intervalHours === 100 && sanitizeMachines('x').length === 0 && sanitizeMachines(Array.from({ length: 50 }, (_, i) => ({ id: 'm' + i }))).length === 20; })());

  /* ======== 8) مركز العمل ======== */
  const customersAc = [{ id: 1, name: 'محمد', phone: '01012345678' }, { id: 2, name: 'سعيد', phone: '' }];
  const acBase = {
    now: NOW, customers: customersAc, canFinance: true,
    orders: [
      { id: 'late1', customerId: 1, status: 'pending', amount: 500, dueDate: NOW - 3 * DAY },
      { id: 'today1', customerId: 2, status: 'in_progress', amount: 400, dueDate: NOW },
      { id: 'rdy1', customerId: 1, status: 'ready', amount: 300, readyAt: NOW - 12 * DAY },
    ],
    appointments: [{ id: 'ap1', customerId: 2, title: 'قياس', date: NOW + 2 * 3600000, status: 'pending' }],
    documents: [{ id: 'dc1', title: 'رخصة', expiresAt: NOW - 5 * DAY }],
    commitments: [{ id: 'cm1', name: 'إيجار', amount: 3000, dueDay: 13 }],
    circles: [{ id: 'k1', name: 'جمعية', installment: 500, members: 6, myTurn: 2, startYm: '2026-11', payDay: 12, paid: {} }],
    tasks: [{ id: 't1', kind: 'task', title: 'اتصل بالمورد', due: NOW - DAY }],
    outOfStock: 2,
    machines: [{ id: 'mc1', name: 'Daimoku AE-1410', hours: 104, lastServiceHours: 0, intervalHours: 100 }],
    purchase: { usable: true, shortM: 3.7, orderBy: '2026-11-12', supplier: { name: 'مورد ب' } },
    cashflow: { tightWeeks: [{ from: '2026-11-15', to: '2026-11-21', inflow: 100, outflow: 5000, net: -4900 }] },
    monthClose: { open: true, ym: '2026-11', label: 'نوفمبر 2026', warns: 2 },
  };
  const ac = buildActionCenter(acBase);
  const kinds = new Set(ac.items.map((i) => i.kind));
  await t.test('56. كل أنواع البنود تظهر (طلبات · جاهز · مواعيد · مستندات · التزامات · جمعيات · مهام · مخزون · ماكينة · قماش · أسبوع ضيق · إقفال)', ['late-order', 'today-order', 'pickup', 'appointment', 'document', 'commitment', 'circle', 'task', 'stock', 'machine', 'purchase', 'cashflow', 'month-close'].every((k) => kinds.has(k)));
  await t.test('57. الترتيب بالأولوية تنازلياً والمفاتيح فريدة ومنتظمة (النوع:المرجع)', ac.items.every((it, i, a) => i === 0 || a[i - 1].priority >= it.priority) && new Set(ac.items.map((i) => i.key)).size === ac.items.length && ac.items.every((i) => i.key === i.kind + ':' + i.ref));
  await t.test('58. المتأخر أولاً قبل اليوم، وبنود المتأخر تحمل هاتف العميل', ac.items[0].kind === 'late-order' && ac.items.find((i) => i.kind === 'late-order').phone === '01012345678');
  await t.test('59. بلا صلاحية مالية ⟵ تختفي بنود (مستحقات · التزام · جمعية · أسبوع ضيق · إقفال)', (() => { const x = buildActionCenter({ ...acBase, canFinance: false }); const k = new Set(x.items.map((i) => i.kind)); return !k.has('commitment') && !k.has('circle') && !k.has('cashflow') && !k.has('month-close') && k.has('late-order') && k.has('task'); })());
  await t.test('60. «تم» يخفيه اليوم فقط، و«أجّل» يخفيه حتى التاريخ ويظهر في المؤجَّل', (() => {
    const k = 'late-order:late1';
    const a = buildActionCenter({ ...acBase, state: doneKey({}, k, NOW) });
    const b = buildActionCenter({ ...acBase, state: snoozeKey({}, k, 3, NOW) });
    const tomorrow = buildActionCenter({ ...acBase, now: NOW + DAY, state: doneKey({}, k, NOW) });
    return !a.items.some((i) => i.key === k) && a.done.some((i) => i.key === k) && !b.items.some((i) => i.key === k) && b.snoozed.some((i) => i.key === k && i.until === ymd(NOW + 3 * DAY)) && tomorrow.items.some((i) => i.key === 'late-order:late1');
  })());
  await t.test('61. pruneState يحذف المنتهي، وclearKey يسترجع، والأصل لا يتغير', (() => { const s0 = { snoozed: { a: ymd(NOW - DAY), b: ymd(NOW + 2 * DAY) }, done: { c: ymd(NOW - DAY), d: ymd(NOW) } }; const p = pruneState(s0, NOW); const c = clearKey(p, 'b', NOW); return !p.snoozed.a && p.snoozed.b && !p.done.c && p.done.d && !c.snoozed.b && s0.snoozed.a === ymd(NOW - DAY); })());
  await t.test('62. snoozedOrders يرحّل مؤجَّلات الطلبات وحدها (لا المستندات ولا المهام)', (() => { let s = snoozeKey({}, 'late-order:o9', 2, NOW); s = snoozeKey(s, 'pickup:o8', 1, NOW); s = snoozeKey(s, 'document:d1', 5, NOW); const o = snoozedOrders(s, NOW); return o.o9 === ymd(NOW + 2 * DAY) && o.o8 === ymd(NOW + DAY) && Object.keys(o).length === 2 && ORDER_KEY.test('today-order:x') && !ORDER_KEY.test('task:x'); })());
  await t.test('63. لكل نوع أيقونة ومسار، وبدون بيانات لا استثناء', Object.keys(KINDS).every((k) => KINDS[k].icon && KINDS[k].route.startsWith('#/')) && buildActionCenter().total === 0 && buildActionCenter({ orders: 'x', customers: null, tasks: [null] }).total === 0);
  await t.test('64. تأجيل الماكينة لا يخفي غيرها، وتمّت الصيانة تزيلها من القائمة', (() => { const x = buildActionCenter({ ...acBase, machines: [serviceDone(acBase.machines[0], NOW)] }); return !x.items.some((i) => i.kind === 'machine') && x.items.some((i) => i.kind === 'late-order'); })());

  /* ======== 9) فحوص سلامة جديدة ======== */
  const di = scanIntegrity({ customers: [{ id: 'c1' }, { id: 'c1' }], orders: [{ id: 'o1', customerId: 'c1', amount: 'abc', dueDate: 'غداً' }, { id: 'o2', customerId: 'c1', amount: 500 }, { id: 'o2', customerId: 'c1', amount: 1 }], payments: [{ id: 'p1', orderId: 'o2', customerId: 'c1', amount: NaN }] });
  await t.test('65. السلامة: مبلغ طلب غير رقمي · موعد غير صالح · دفعة غير رقمية · معرّفات مكررة', di.counts.order_bad_amount === 1 && di.counts.order_bad_due === 1 && di.counts.payment_bad_amount === 1 && di.counts.duplicate_id === 2);
  await t.test('66. بيانات سليمة أو ناقصة (undefined/null) = صفر مشاكل (لا إنذار كاذب)', scanIntegrity({ customers: [{ id: 'c1' }], orders: [{ id: 'o1', customerId: 'c1' }, { id: 'o2', customerId: 'c1', amount: 0, dueDate: null }, { id: 'o3', customerId: 'c1', amount: '', dueDate: '' }], payments: [] }).total === 0);
  await t.test('67. كل نوع جديد له تسمية عربية ولا إصلاح آلي (fix) يمسّ الأرقام', ['order_bad_amount', 'order_bad_due', 'payment_bad_amount', 'duplicate_id'].every((k) => !!ISSUE_LABELS[k]) && di.issues.filter((i) => ['order_bad_amount', 'order_bad_due', 'payment_bad_amount', 'duplicate_id'].includes(i.type)).every((i) => !i.fix));

  /* ======== 10) الإشعار: مؤجَّلات وأسبوعك ======== */
  await t.test('68. pushOptions: weekly افتراضياً true ويُطفأ بـ false', pushOptions({}).weekly === true && pushOptions({ notifications: { push: { weekly: false } } }).weekly === false && serverPrefs({ notifications: { push: { weekly: false } } }, 'UTC').weekly === false);
  const digSrc = { settings: { notifications: { push: { enabled: true } } }, orders: [{ id: 'a', customerId: 1, status: 'pending', dueDate: NOW - DAY }, { id: 'b', customerId: 1, status: 'pending', dueDate: NOW + DAY }], customers: [{ id: 1, name: 'م' }], now: NOW };
  await t.test('69. digest.sz: المؤجَّل المستقبلي لطلب موجود فقط (لا ماضٍ ولا طلب غريب)', (() => { const d = buildDigest({ ...digSrc, snoozed: { a: ymd(NOW + 2 * DAY), b: ymd(NOW - DAY), zzz: ymd(NOW + DAY) } }); return d.sz && d.sz.a === ymd(NOW + 2 * DAY) && !d.sz.b && !d.sz.zzz; })());
  await t.test('70. digest.wk: بأرقام الأسبوع فقط إن وُجدت وكان المفتاح مفعّلاً', (() => { const on = buildDigest({ ...digSrc, weekly: { inc: 1200.4, exp: 300, del: 3, ovd: 1, rec: 50 } }); const off = buildDigest({ ...digSrc, settings: { notifications: { push: { enabled: true, weekly: false } } }, weekly: { inc: 5 } }); const zero = buildDigest({ ...digSrc, weekly: { inc: 0, exp: 0, del: 0, ovd: 0 } }); return on.wk && on.wk.inc === 1200 && on.wk.del === 3 && !off.wk && !zero.wk && !buildDigest(digSrc).wk; })());

  /* ======== 11) عقود المصدر والتسجيل ======== */
  const main = await src('main.js'); const roles = await src('services/roles.js'); const ci = await src('../scripts/ci-check.cjs');
  await t.test('71. تسجيل صفحة actions: main.js (حالة + خريطة + عنوان) + الأدوار + فحص الصفحات', main.includes("case 'actions':") && main.includes("actions:              'actionsPage'") && main.includes('📥 مركز العمل') && roles.includes("'wall', 'actions'") && ci.includes('todos actions'));
  const dash = await src('pages/dashboard.js'); const rep = await src('pages/reports.js'); const fc = await src('pages/financial-center.js'); const inv = await src('pages/inventory.js'); const ords = await src('pages/orders.js'); const fab = await src('ui/fabric-calc-dialog.js');
  await t.test('72. الربط: بطاقة اللوحة · التقرير والإقفال · السيولة · المشتريات · الإدخال السريع · القيطان', dash.includes('mountActionsTeaser(teaserSlot)') && rep.includes('buildWeeklyCard()') && rep.includes('buildMonthCloseCard()') && fc.includes('buildCashflowCard()') && inv.includes('buildPurchasePlanCard()') && ords.includes('buildQuickEntry(ctx)') && fab.includes('openQitanCalcDialog()') && fab.includes('open-qitan'));
  const qe = await src('pages/orders/quick-entry.js');
  await t.test('73. الإدخال السريع لا يحفظ طلباً مباشرة: مسودة order-form ثم فتح النموذج للمراجعة', qe.includes('draft.save(DRAFT_KEY') && qe.includes('ctx.openForm()') && !/orders\.(create|save|update)\(/.test(qe) && !/fetch\(|XMLHttpRequest/.test(qe));
  const cfg = await src('sync/settings-sync.js');
  await t.test('74. مفاتيح الإعدادات الجديدة: افتراضات + مزامنة', ['actionCenter', 'cashflow', 'purchasePlan', 'monthClose', 'machines'].every((k) => k in DEFAULT_SETTINGS && cfg.includes("'" + k + "'")) && DEFAULT_SETTINGS.purchasePlan.avgHeightCm === 150 && Array.isArray(DEFAULT_SETTINGS.machines.list));
  const ad = await src('pages/actions-data.js'); const ps = await src('sync/push-sync.js');
  await t.test('75. الحالة تُحفظ كاملة (snoozed+done معاً) والإشعار يقرأ المؤجَّلات وملخص الأسبوع', ad.includes('actionCenter: { snoozed: p.snoozed, done: p.done }') && ps.includes('snoozedOrders(st && st.actionCenter') && ps.includes('weeklyDigest(buildWeeklyReport(') && ps.includes("'payments', 'expenses'"));
  await t.test('76. الخدمات الجديدة نقية: بلا مستودعات ولا DOM ولا شبكة', (await Promise.all(['qitan-calc', 'quick-order', 'weekly-report', 'month-close', 'cashflow-forecast', 'purchase-plan', 'action-center', 'machinery'].map((f) => src('services/' + f + '.js')))).every((s) => !/data\/repos|document\.|window\.|fetch\(|localStorage/.test(s)));
});
