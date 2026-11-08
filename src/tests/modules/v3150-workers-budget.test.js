/* ==========================================================================
   v3150-workers-budget.test.js — حساب العمال والحضور والسلف · ميزانية الأسرة · Push والشهر الصعب (v3.15.0)
   ========================================================================== */
import { register } from '../registry.js';
import { STORES, DB_CONFIG, DEFAULT_SETTINGS } from '../../core/config.js';
import { SCHEMA } from '../../data/schema.js';
import { RECORD_STORES } from '../../data/record-meta.js';
import { SYNC_STORES } from '../../sync/firestore-sync.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import { buildDigest } from '../../services/push-digest.js';
import {
  PAY_KINDS, ATT_STATUSES, normalizePayKind, normalizeAttStatus, dayKey, validDayKey, attendanceId,
  checkAttendanceInput, checkWorkerPaymentInput, workDaysBetween, outstandingAdvance, workerStatement, statusOnDay, daySummary,
} from '../../services/worker-accounts.js';
import { normalizeBudget, hasBudget, budgetStatus, budgetAlerts, WARN_PCT } from '../../services/family-budget.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 5, 10, 12);                  /* الأربعاء 10 يونيو 2026 (الأحد إجازة) */
const at = (m, d) => new Date(2026, m, d, 10).getTime();
const FIXED = { id: 'w1', salaryType: 'fixed', salary: 2600 };
const ATT = [{ workerId: 'w1', day: '2026-06-03', status: 'absent' }, { workerId: 'w1', day: '2026-06-04', status: 'half' }, { workerId: 'w1', day: '2026-06-07', status: 'absent' }];
const PAY = [{ workerId: 'w1', kind: 'advance', amount: 500, date: at(5, 2) }, { workerId: 'w1', amount: 1000, date: at(5, 9) }];
const st = (o) => workerStatement({ worker: FIXED, attendance: ATT, payments: PAY, year: 2026, month: 5, now: NOW, dayOff: 0, ...(o || {}) });

register('v3.15.0 حساب العمال وميزانية الأسرة', async (t) => {
  /* ---- أساسيات ---- */
  await t.test('1. الأنواع: راتب وسلفة، وحالتان للغياب، والتطبيع الآمن', PAY_KINDS.length === 2 && ATT_STATUSES.length === 2 && normalizePayKind('advance') === 'advance' && normalizePayKind('x') === 'salary' && normalizePayKind(undefined) === 'salary' && normalizeAttStatus('absent') === 'absent' && normalizeAttStatus('half') === 'half' && normalizeAttStatus('present') === null && normalizeAttStatus(null) === null);
  await t.test('2. مفتاح اليوم والمعرّف الثابت والتحقق', dayKey(at(5, 3)) === '2026-06-03' && validDayKey('2026-06-03') && !validDayKey('2026-6-3') && !validDayKey('2026-13-40') && !validDayKey(null) && attendanceId('w1', '2026-06-03') === 'att_w1_2026-06-03');
  await t.test('3. checkAttendanceInput: عامل ويوم وحالة غياب صالحة', !checkAttendanceInput({}).ok && !checkAttendanceInput({ workerId: 'w', day: 'x', status: 'absent' }).ok && !checkAttendanceInput({ workerId: 'w', day: '2026-06-03', status: 'present' }).ok && checkAttendanceInput({ workerId: 'w', day: '2026-06-03', status: 'half' }).data.id === 'att_w_2026-06-03' && !checkAttendanceInput(null).ok);
  await t.test('4. checkWorkerPaymentInput: المبلغ موجب والنوع والخصم للراتب فقط', !checkWorkerPaymentInput({ amount: 0 }).ok && !checkWorkerPaymentInput({ amount: 1e9 }).ok && !checkWorkerPaymentInput({ amount: 5, advanceDeducted: -1 }).ok && checkWorkerPaymentInput({ amount: 100, kind: 'advance', advanceDeducted: 50 }).data.advanceDeducted === undefined && checkWorkerPaymentInput({ amount: 100, advanceDeducted: '25.555' }).data.advanceDeducted === 25.56 && checkWorkerPaymentInput({ amount: 100 }).data.kind === 'salary' && !('advanceDeducted' in checkWorkerPaymentInput({ amount: 100 }).data));
  await t.test('5. أيام العمل: يونيو 2026 = 26 (الأحد إجازة) والإجازة بتاريخ تُخصم', workDaysBetween(at(5, 1), at(5, 30), 0) === 26 && workDaysBetween(at(5, 1), at(5, 30), { weekdays: [], dates: ['2026-06-09'] }) === 29 && workDaysBetween(at(5, 10), at(5, 1), 0) === 0);

  /* ---- السلفة القائمة ---- */
  await t.test('6. السلفة القائمة = السلف − المخصوم، ولا تقل عن صفر', outstandingAdvance([{ kind: 'advance', amount: 500 }, { kind: 'advance', amount: 300 }, { amount: 2000, advanceDeducted: 600 }]) === 200 && outstandingAdvance([{ kind: 'advance', amount: 100 }, { amount: 500, advanceDeducted: 400 }]) === 0 && outstandingAdvance(null) === 0);
  await t.test('7. الدفعة القديمة بلا نوع راتب، والخصم المسجَّل على سلفة يُهمَل', outstandingAdvance([{ amount: 1000 }, { kind: 'advance', amount: 200, advanceDeducted: 150 }]) === 200);

  /* ---- كشف الشهر ---- */
  const s = st();
  await t.test('8. ثابت شهري: المستحق = الراتب − وحدات الغياب × الراتب ÷ أيام العمل', s.computable && s.earned === 2450 && s.workDays === 26 && s.absentDays === 1 && s.halfDays === 1 && s.absentUnits === 1.5);
  await t.test('9. غياب يوم إجازة لا يُحتسب (الأحد 7 يونيو)', st({ attendance: [{ workerId: 'w1', day: '2026-06-07', status: 'absent' }] }).absentUnits === 0);
  await t.test('10. المصروف والسلف والمتبقي واقتراح الخصم', s.salaryCash === 1000 && s.advancesGiven === 500 && s.deducted === 0 && s.outstandingAdvance === 500 && s.remaining === 1450 && s.suggestedDeduction === 500);
  await t.test('11. الخصم المسجَّل يُحتسب مصروفاً من الراتب ويقلّل السلفة القائمة والمتبقي', (() => { const x = st({ payments: PAY.concat([{ workerId: 'w1', amount: 1000, advanceDeducted: 500, date: at(5, 9) }]) }); return x.salaryCash === 2000 && x.deducted === 500 && x.remaining === -50 && x.outstandingAdvance === 0 && x.suggestedDeduction === 0; })());
  await t.test('12. يومي: الراتب × (أيام العمل حتى اليوم − الغياب)', (() => { const x = workerStatement({ worker: { id: 'w2', salaryType: 'daily', salary: 100 }, attendance: [{ workerId: 'w2', day: '2026-06-03', status: 'absent' }], payments: [], year: 2026, month: 5, now: NOW, dayOff: 0 }); return x.elapsedWorkDays === 9 && x.earned === 800; })());
  await t.test('13. بالقطعة والساعي: لا مستحق من الحضور (غير محسوب) مع بقاء المدفوع', (() => { const x = workerStatement({ worker: { id: 'w3', salaryType: 'per_piece', salary: 10 }, attendance: [], payments: [{ workerId: 'w3', amount: 300, date: at(5, 2) }], year: 2026, month: 5, now: NOW, dayOff: 0 }); return !x.computable && x.earned === null && x.remaining === null && x.salaryCash === 300 && x.suggestedDeduction === 0; })());
  await t.test('14. دفعات وحضور الأشهر والعمال الآخرين لا تدخل الكشف', (() => { const x = st({ payments: PAY.concat([{ workerId: 'w1', amount: 9999, date: at(4, 20) }, { workerId: 'other', amount: 7777, date: at(5, 5) }]), attendance: ATT.concat([{ workerId: 'other', day: '2026-06-02', status: 'absent' }, { workerId: 'w1', day: '2026-05-04', status: 'absent' }]) }); return x.salaryCash === 1000 && x.absentUnits === 1.5; })());
  await t.test('15. شهر ماضٍ كامل: كل أيامه تُحتسب، وشهر مستقبلي بلا أيام منقضية', (() => { const past = workerStatement({ worker: { id: 'w2', salaryType: 'daily', salary: 100 }, attendance: [], payments: [], year: 2026, month: 4, now: NOW, dayOff: 0 }); const fut = workerStatement({ worker: { id: 'w2', salaryType: 'daily', salary: 100 }, attendance: [], payments: [], year: 2026, month: 8, now: NOW, dayOff: 0 }); return past.earned === 100 * workDaysBetween(at(4, 1), at(4, 31), 0) && fut.elapsedWorkDays === 0 && fut.earned === 0; })());
  await t.test('16. غياب يوم مستقبلي لا يُحتسب', st({ attendance: [{ workerId: 'w1', day: '2026-06-20', status: 'absent' }] }).absentUnits === 0);
  await t.test('17. الغياب الزائد لا يجعل المستحق سالباً', workerStatement({ worker: FIXED, attendance: Array.from({ length: 9 }, (_, i) => ({ workerId: 'w1', day: '2026-06-0' + (i + 1 === 7 ? 8 : i + 1), status: 'absent' })).concat([{ workerId: 'w1', day: '2026-06-10', status: 'absent' }]), payments: [], year: 2026, month: 5, now: NOW, dayOff: 0 }).earned >= 0);
  await t.test('18. حالة اليوم وملخصه (الحضور افتراضي)', statusOnDay(ATT, 'w1', '2026-06-03') === 'absent' && statusOnDay(ATT, 'w1', '2026-06-05') === null && (() => { const d = daySummary(ATT, [{ id: 'w1' }, { id: 'w9' }], '2026-06-04'); return d.half === 1 && d.absent === 0 && d.present === 1; })());

  /* ---- ميزانية الأسرة ---- */
  const cats = [{ id: 'food', label: 'طعام', icon: '🍞' }, { id: 'bills', label: 'فواتير', icon: '🧾' }];
  const EX = [{ date: at(5, 2), amount: 850, category: 'food' }, { date: at(5, 3), amount: 300, category: 'bills' }, { date: at(5, 4), amount: 200, category: 'fun' }, { date: at(4, 3), amount: 9999, category: 'food' }];
  await t.test('19. normalizeBudget: ينقّي السقوف غير الصالحة ويحدّ العدد', (() => { const b = normalizeBudget({ total: '2000', caps: { food: '1000', bad: 'x', zero: 0, neg: -5, huge: 1e12, '': 5 } }); return b.total === 2000 && Object.keys(b.caps).join() === 'food' && b.caps.food === 1000 && normalizeBudget(null).total === 0 && Object.keys(normalizeBudget({ caps: Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['c' + i, 10])) }).caps).length === 30; })());
  await t.test('20. hasBudget: سقف فئة أو إجمالي', hasBudget({ total: 100 }) && hasBudget({ caps: { a: 5 } }) && !hasBudget({}) && !hasBudget(null));
  const bs = budgetStatus({ expenses: EX, budget: { total: 2000, caps: { food: 1000, bills: 300 } }, now: NOW, cats });
  await t.test('21. الحالة: الأعلى نسبة أولاً مع مستويات 80% و100%', bs.rows[0].id === 'bills' && bs.rows[0].pct === 100 && bs.rows[0].level === 'over' && bs.rows[1].id === 'food' && bs.rows[1].pct === 85 && bs.rows[1].level === 'warn' && WARN_PCT === 80);
  await t.test('22. المتبقي والتوقع بمعدل الإنفاق، وإنفاق الشهر الماضي خارج الحساب', bs.rows[1].spent === 850 && bs.rows[1].remaining === 150 && bs.rows[1].projected === 2550 && bs.total.spent === 1350);
  await t.test('23. الإجمالي الصريح، والمنفق خارج السقوف', bs.total.cap === 2000 && bs.total.explicit && bs.total.pct === 68 && bs.total.level === 'ok' && bs.unbudgeted === 200);
  await t.test('24. بلا إجمالي صريح ⟵ مجموع السقوف، وقبل اليوم الخامس لا توقع', (() => { const x = budgetStatus({ expenses: EX, budget: { caps: { food: 1000, bills: 300 } }, now: new Date(2026, 5, 4, 12), cats }); return x.total.cap === 1300 && !x.total.explicit && x.rows.every((r) => r.projected === null); })());
  await t.test('25. بلا ميزانية ⟵ has=false وصفوف فارغة بلا انهيار', (() => { const x = budgetStatus({ expenses: EX, budget: null, now: NOW }); return !x.has && x.rows.length === 0 && x.total === null && budgetStatus({ now: NOW }).has === false; })());
  await t.test('26. التنبيهات: المتجاوز أولاً ثم الأعلى نسبة، والإجمالي الصريح فقط', (() => { const a = budgetAlerts(bs); return a.length === 2 && a[0].id === 'bills' && a[0].level === 'over' && a[1].id === 'food' && budgetAlerts(null).length === 0; })() && budgetAlerts(budgetStatus({ expenses: [{ date: at(5, 2), amount: 2500, category: 'x' }], budget: { total: 2000 }, now: NOW })).some((a) => a.id === '_total' && a.level === 'over'));

  /* ---- Push والشهر الصعب ---- */
  const dsrc = { settings: { push: { enabled: true, commitments: true, commitmentsDays: 3 } }, orders: [], customers: [], now: NOW.getTime(), commitments: [{ name: 'إيجار', dueDay: 5, priority: 'essential' }, { name: 'نادي', dueDay: 6, priority: 'deferrable' }, { name: 'قديم', dueDay: 7 }] };
  await t.test('27. الملخص اليومي: كل الالتزامات عادةً، والضرورية فقط في الشهر الصعب', buildDigest(dsrc).cm.length === 3 && (() => { const c = buildDigest({ ...dsrc, settings: { ...dsrc.settings, personalControls: { hardMonth: true } } }).cm; return c.length === 1 && c[0].t === 'إيجار'; })());

  /* ---- التسجيل ---- */
  await t.test('28. مخزن attendance: STORES والمخطط وفهارسه والإصدار 15', STORES.ATTENDANCE === 'attendance' && SCHEMA.attendance && SCHEMA.attendance.indexes.some((i) => i.name === 'by_workerId') && SCHEMA.attendance.indexes.some((i) => i.name === 'by_day') && DB_CONFIG.version >= 15);
  await t.test('29. المخزن في قائمتي المزامنة والسجلات متطابقتين', RECORD_STORES.includes('attendance') && SYNC_STORES.includes('attendance') && RECORD_STORES.length === SYNC_STORES.length);
  const bk = await src('pages/settings/section-backup-io.js');
  await t.test('30. المخزن في تصدير واستيراد النسخ الاحتياطي (الموضعين)', (bk.match(/'attendance'/g) || []).length === 2);
  await t.test('31. الميزانية افتراضياً فارغة وتتزامن', DEFAULT_SETTINGS.familyBudget.total === 0 && Object.keys(DEFAULT_SETTINGS.familyBudget.caps).length === 0 && SETTINGS_SYNC_KEYS.includes('familyBudget'));

  /* ---- عقود الواجهات ---- */
  const wv = await src('pages/workers-views.js'); const w = await src('pages/workers.js');
  await t.test('32. تبويب «الحساب» مربوط ويحمّل الحضور وإعداد الإجازات', wv.includes("{ id: 'accounts', icon: '📒', label: 'الحساب' }") && wv.includes('mountAccounts(ctx, lc)') && w.includes('attendance.list().catch(() => [])') && w.includes('state.dayOff = resolveDayOffSettings('));
  const wf = await src('pages/workers-forms.js');
  await t.test('33. نموذج الدفعة: نوع، خصم سلفة لا يتجاوز القائمة، والمبلغ نقدي', wf.includes("'data-role': 'pay-kind'") && wf.includes('checkWorkerPaymentInput({ kind: kindSelect.value') && wf.includes('chk.data.advanceDeducted > outstanding') && wf.includes('...chk.data,'));
  const wc = await src('pages/workers-cards.js'); const wa = await src('pages/workers-actions.js');
  await t.test('34. صف الدفعة يُظهر السلفة والخصم، وحذف العامل يحذف حضوره', wc.includes("payment.kind === 'advance' ? '🤝 سلفة · '") && wc.includes('Number(payment.advanceDeducted) > 0') && wa.includes('(await attendance.list()).filter((x) => x.workerId === w.id)'));
  const acc = await src('pages/workers-accounts.js');
  await t.test('35. تبويب الحساب: بلا innerHTML ولا import ديناميكي ولا يستعمل غير ctx.state وctx.refresh', !/innerHTML\s*=/.test(acc) && !/\bimport\(/.test(acc) && !/ctx\.(?!state|refresh)[a-zA-Z]+/.test(acc) && acc.includes("'data-role': 'attendance-sheet'"));
  const ui = await src('ui/family-budget-card.js'); const hp = await src('pages/house-expenses.js'); const nc = await src('ui/notifications-center.js');
  await t.test('36. بطاقة الميزانية: بلا innerHTML وتكتب الإعدادات فقط، ومربوطة بفترة «هذا الشهر»', !/innerHTML\s*=/.test(ui) && ui.includes('settings.update({ familyBudget:') && !/(houseExpenses)\.(create|update|remove)\(/.test(ui) && hp.includes("if (state.period === 'month') {   /* v3.15.0") && hp.includes('buildBudgetCard(state.budgetStatus'));
  await t.test('37. إشعار الميزانية مغلَّف بـ try/catch ويقرأ الشهر الحالي فقط', /ميزانية الأسرة \(v3\.15\.0\)[\s\S]*?try \{[\s\S]*?hasBudget\(bud\)[\s\S]*?budgetAlerts\(budgetStatus\([\s\S]*?catch \(e\) \{ \/\* الميزانية اختيارية/.test(nc));
});
