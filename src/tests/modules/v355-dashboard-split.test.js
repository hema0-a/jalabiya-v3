/* ==========================================================================
   v355-dashboard-split.test.js — تقسيم dashboard.js إلى وحدات (v3.5.5، بلا تغيير سلوك)
   ==========================================================================
   يتحقق أن: الواجهة العامة للصفحة لم تتغيّر، والوحدات الجديدة تؤدي دورها منفردة،
   وتمرير الإجراءات (actions) والتخصيص (onApply) كوسطاء يعمل، ولا استيراد دائري ولا import() ولا innerHTML.
   ========================================================================== */
import { register } from '../registry.js';
import * as dashModule from '../../pages/dashboard.js';
import * as kpis from '../../pages/dashboard-kpis.js';
import * as actionsMod from '../../pages/dashboard-actions.js';
import * as sections from '../../pages/dashboard-sections.js';
import * as customize from '../../pages/dashboard-customize.js';
import { appointments } from '../../data/repos/appointments.js';
import { LAYOUT_KEY } from '../../services/dashboard-layout.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); }
  return !!fn();
}
const btnByText = (root, text) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.trim() === text);
const FILES = ['dashboard', 'dashboard-kpis', 'dashboard-actions', 'dashboard-sections', 'dashboard-customize'];

register('v3.5.5 dashboard — تقسيم الملفات', async (t) => {
  /* --- 1) الواجهة العامة --- */
  await t.test('1. dashboard.js يصدّر dashboardPage فقط (render + destroy) كما كان',
    Object.keys(dashModule).join() === 'dashboardPage' &&
    typeof dashModule.dashboardPage.render === 'function' && typeof dashModule.dashboardPage.destroy === 'function');

  /* --- 2) dashboard-kpis: حسابات نقية --- */
  await t.test('2. kpis: الدوال الخمس مصدَّرة',
    ['startOfMonth', 'computeSalesLast7Days', 'computeOrdersByStatus', 'computeFinance', 'loadKPIs'].every((k) => typeof kpis[k] === 'function'));
  const by = kpis.computeOrdersByStatus([{ status: 'pending' }, { status: 'pending' }, { status: 'ready' }, { status: 'weird' }]);
  await t.test('3. kpis: computeOrdersByStatus يعدّ الحالات ويتجاهل غير المعروف',
    by.pending === 2 && by.ready === 1 && by.in_progress === 0 && by.delivered === 0 && by.cancelled === 0);
  const now = Date.now();
  const fin = kpis.computeFinance([{ amount: 100, createdAt: now }, { amount: 50, createdAt: now - 40 * 86400000 }], [{ amount: 30, date: now }]);
  await t.test('4. kpis: computeFinance آخر 30 يوماً فقط (إيراد 100 − مصروف 30 = ربح 70)', fin.revenue === 100 && fin.expenses === 30 && fin.profit === 70);
  const week = kpis.computeSalesLast7Days([{ amount: 40, createdAt: now }]);
  await t.test('5. kpis: مبيعات 7 أيام = 7 عناصر وآخرها اليوم', week.length === 7 && week[6].value === 40 && week.slice(0, 6).every((d) => d.value === 0));
  const d1 = new Date(); d1.setDate(1); d1.setHours(0, 0, 0, 0);
  await t.test('6. kpis: startOfMonth = أول الشهر 00:00', kpis.startOfMonth() === d1.getTime());
  const data = await kpis.loadKPIs();
  await t.test('7. kpis: loadKPIs يرجع الشكل الكامل للوحة',
    ['custMap', 'orderById', 'pickups', 'overdueOrders', 'debtors', 'dueSoonRows', 'weekVisits', 'todayApptsRows', 'salesLast7Days', 'ordersByStatus', 'finance', 'recentCustomers']
      .every((k) => k in data) && data.salesLast7Days.length === 7);

  /* --- 3) dashboard-actions --- */
  await t.test('8. actions: NEXT_STATUS وSTATUS_LABEL وgo مصدَّرة بالمحتوى القديم',
    actionsMod.NEXT_STATUS.pending.to === 'in_progress' && actionsMod.NEXT_STATUS.in_progress.to === 'ready' && actionsMod.NEXT_STATUS.ready.to === 'delivered' &&
    actionsMod.STATUS_LABEL.delivered === 'تم التسليم' && typeof actionsMod.go === 'function');
  let refreshed = 0;
  const acts = actionsMod.createDashActions(async () => { refreshed++; });
  await t.test('9. actions: المصنع يرجع الإجراءات الثلاثة', ['advanceOrder', 'quickPay', 'markApptDone'].every((k) => typeof acts[k] === 'function'));
  await acts.advanceOrder({ id: 'x', status: 'delivered' }, 0);
  await t.test('10. actions: advanceOrder لحالة بلا تالية لا يفعل شيئاً ولا يعيد الرسم', refreshed === 0);
  const appt = await appointments.create({ customerId: 'c-split', date: Date.now(), status: 'scheduled', title: 'اختبار التقسيم' });
  try {
    await acts.markApptDone(appt);
    const after = await appointments.find(appt.id);
    await t.test('11. actions: markApptDone يحدّث الحالة إلى done ويستدعي refresh الممرَّرة مرة واحدة', after.status === 'done' && refreshed === 1);
  } finally { try { await appointments.remove(appt.id); } catch { /* تنظيف اختياري */ } }

  /* --- 4) dashboard-sections: بناء + ربط الإجراءات الممرَّرة --- */
  const spy = () => { const f = (...a) => { f.calls.push(a); }; f.calls = []; return f; };
  const A = { advanceOrder: spy(), quickPay: spy(), markApptDone: spy() };
  const baseData = { pickups: { items: [] }, overdueOrders: [], debtors: [], msgCounts: null, workshopObj: {}, workshopNameRaw: '', msgCfg: null, orderById: new Map() };

  const empty = sections.buildAttention(baseData, A);
  await t.test('12. sections: «يحتاج إجراءك» فارغة تعرض رسالة ✅ ولا مجموعات', empty.textContent.includes('لا شيء يحتاج إجراءً الآن') && !empty.querySelector('.dash-group'));

  const order1 = { id: 'o1', status: 'ready' };
  const withPickup = sections.buildAttention({ ...baseData, pickups: { items: [{ orderId: 'o1', late: true, name: 'سعاد', ageDays: 2, remaining: 50, phone: '', customerId: 'c1' }] }, orderById: new Map([['o1', order1]]) }, A);
  btnByText(withPickup, '📦 تسليم').click();
  await t.test('13. sections: زر «تسليم» يستدعي actions.advanceOrder(order, remaining)', A.advanceOrder.calls.length === 1 && A.advanceOrder.calls[0][0] === order1 && A.advanceOrder.calls[0][1] === 50);

  const order2 = { id: 'o2', status: 'in_progress', dueDate: Date.now() - 3 * 86400000, amount: 100 };
  const withOverdue = sections.buildAttention({ ...baseData, overdueOrders: [{ order: order2, name: 'هدى', phone: '', customerId: 'c2', remaining: 25 }] }, A);
  btnByText(withOverdue, actionsMod.NEXT_STATUS.in_progress.label).click();
  await t.test('14. sections: زر تقدّم الحالة للمتأخر يستدعي advanceOrder(order, remaining)', A.advanceOrder.calls.length === 2 && A.advanceOrder.calls[1][0] === order2 && A.advanceOrder.calls[1][1] === 25);

  const withDebt = sections.buildAttention({ ...baseData, debtors: [{ name: 'نادر', phone: '', customerId: 'c3', overdue: 70, oldestDays: 30, orders: [{ id: 'o3', delivered: true, remaining: 70 }] }] }, A);
  btnByText(withDebt, '💰 دفعة').click();
  const qp = A.quickPay.calls[0] && A.quickPay.calls[0][0];
  await t.test('15. sections: زر «دفعة» يستدعي actions.quickPay بالمعطيات الصحيحة',
    A.quickPay.calls.length === 1 && qp.customerId === 'c3' && qp.orderId === 'o3' && qp.name === 'نادر' && qp.remaining === 70);

  const ap = { id: 'a1', status: 'scheduled', date: Date.now(), title: 'قياس', customerId: 'c1' };
  const apSec = sections.buildTodayAppointmentsSection([{ appt: ap, name: 'سعاد', phone: '' }], A);
  btnByText(apSec, '✔ تم').click();
  await t.test('16. sections: زر «تم» للموعد يستدعي actions.markApptDone(appt)', A.markApptDone.calls.length === 1 && A.markApptDone.calls[0][0] === ap && apSec.getAttribute('data-collapsible-id') === 'dash-appts');

  const dueSec = sections.buildDueSoonSection([{ order: { id: 'o4', status: 'pending', dueDate: Date.now() + 86400000, amount: 10, customerId: 'c4' }, name: 'منى', phone: '', remaining: 10 }], A);
  btnByText(dueSec, actionsMod.NEXT_STATUS.pending.label).click();
  await t.test('17. sections: «مستحقة قريباً» يمرّر advanceOrder ومعرّف القسم dash-due', A.advanceOrder.calls.length === 3 && dueSec.getAttribute('data-collapsible-id') === 'dash-due');

  await t.test('18. sections: بقية الأقسام بمعرّفاتها (أسبوع/أحدث/ثلاثة رسوم) وبطاقات الأرقام الأربع',
    sections.buildWeekVisitsSection([], '').getAttribute('data-collapsible-id') === 'dash-week' &&
    sections.buildRecentCustomersSection([], '').getAttribute('data-collapsible-id') === 'dash-recent' &&
    sections.buildChartSections({ salesLast7Days: kpis.computeSalesLast7Days([]), finance: fin, ordersByStatus: by }).map((n) => n.getAttribute('data-collapsible-id')).join() === 'dash-sales,dash-finance,dash-orders' &&
    sections.buildKPICards({ totalCustomers: 1, activeOrders: 2, monthRevenue: 3, todayAppointments: 4 }).querySelectorAll('.stat--link').length === 4);

  /* --- 5) dashboard-customize: onApply وسيط (بلا استيراد دائري للصفحة) --- */
  localStorage.removeItem(LAYOUT_KEY);
  const dlg = () => document.querySelector('.modal .dash-custom');
  const closeDlg = async () => { document.querySelector('.modal [data-action="done"]').click(); await sleep(150); };
  try {
    let applied = 0;
    customize.openCustomize(() => { applied++; });
    await t.test('19. customize: openCustomize يفتح نافذة التخصيص بتسعة صفوف', !!dlg() && dlg().querySelectorAll('.dash-custom__row').length === 9);
    await closeDlg();
    await t.test('20. customize: الإغلاق بلا تغيير لا يستدعي onApply', applied === 0 && !dlg());

    customize.openCustomize(() => { applied++; });
    const cb = dlg().querySelector('#dash-custom-dash-sales');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    await closeDlg();
    await t.test('21. customize: الإغلاق بعد تغيير فعلي يستدعي onApply مرة واحدة', await waitFor(() => applied === 1) && !dlg());

    localStorage.removeItem(LAYOUT_KEY);
    let threw = false;
    try {
      customize.openCustomize();   /* بلا onApply: لا يرمي */
      const cb2 = dlg().querySelector('#dash-custom-dash-sales');
      cb2.checked = false; cb2.dispatchEvent(new Event('change'));
      await closeDlg();
    } catch { threw = true; }
    await t.test('22. customize: بلا onApply لا يرمي خطأ', !threw);

    const host = document.createElement('div');
    const bar = customize.buildSectionsBar(host, () => { applied += 10; });
    bar.querySelector('.dash-sections__custom').click();
    await t.test('23. customize: buildSectionsBar يعيد شريطاً بزرّين وزر «تخصيص» يستدعي المعاودة', applied === 11 && bar.children.length === 2 && typeof bar.update === 'function');
  } finally {
    localStorage.removeItem(LAYOUT_KEY);
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    document.body.style.overflow = '';
  }

  /* --- 6) حراس المصدر: static imports فقط، لا innerHTML، لا استيراد دائري --- */
  const texts = await Promise.all(FILES.map(async (f) => (await fetch(new URL('../../pages/' + f + '.js', import.meta.url))).text()));
  await t.test('24. حراس: لا import() ديناميكي في أي من الملفات الخمسة', texts.every((s) => !/\bimport\s*\(/.test(s)));
  await t.test('25. حراس: لا innerHTML في أي من الملفات الخمسة', texts.every((s) => !/\.innerHTML\s*=/.test(s)));
  await t.test('26. حراس: الوحدات الأربع الجديدة لا تستورد الصفحة (لا دوران)', texts.slice(1).every((s) => !/from\s+'\.\/dashboard\.js'/.test(s)));
});
