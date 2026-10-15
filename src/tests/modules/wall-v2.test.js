/* ==========================================================================
   wall-v2.test.js — تطوير شاشة الورشة (v3.3.64)
   ========================================================================== */
import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { buildWallModel, paginate, firstName } from '../../services/wall-board.js';
import { wallPage, _internal } from '../../pages/wall.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;
const q = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));

register('wall v3.3.64 (pure model)', async (t) => {
  const now = new Date(2026, 9, 14, 12, 0, 0).getTime();
  const at = (n, h = 9) => new Date(2026, 9, 14 + n, h, 0, 0).getTime();

  const rows = Array.from({ length: 20 }, (_, i) => i);
  const p0 = paginate(rows, 0, 8);
  const p2 = paginate(rows, 2, 8);
  const pw = paginate(rows, 3, 8);       // يلتفّ للأولى
  const pn = paginate(rows, -1, 8);      // سالب يلتفّ للأخيرة
  await t.test('1. paginate: 20 صفاً → 3 صفحات (8/8/4)', p0.pages === 3 && p0.rows.length === 8 && p2.rows.length === 4);
  await t.test('2. paginate: الالتفاف للأمام والخلف', pw.page === 0 && pn.page === 2);
  const pe = paginate([], 5, 8);
  await t.test('3. paginate: فارغ/غير صالح لا ينهار', pe.pages === 1 && pe.rows.length === 0 && paginate(null).pages === 1);
  await t.test('4. firstName', firstName('أحمد سعيد علي') === 'أحمد' && firstName('  ') === 'عميل' && firstName(null) === 'عميل');

  const customers = [{ id: 'c1', name: 'سعد' }];
  const orders = [
    { id: 'o1', customerId: 'c1', status: 'in_progress', dueDate: at(-2) },
    { id: 'o2', customerId: 'c1', status: 'pending', dueDate: at(-3) },
    { id: 'o3', customerId: 'c1', status: 'pending', dueDate: at(-10) },
    { id: 'o4', customerId: 'c1', status: 'delivered', deliveredAt: at(0, 8) },
    { id: 'o5', customerId: 'c1', status: 'delivered', deliveredAt: at(-1, 8) },
    { id: 'o6', customerId: 'c1', status: 'delivered' },
  ];
  const appts = [
    { id: 'a1', date: at(0, 8), title: 'مضى', customerId: 'c1' },
    { id: 'a2', date: at(0, 16), title: 'قياس', customerId: 'c1' },
    { id: 'a3', date: at(0, 18), title: 'بروفة' },
  ];
  const m = buildWallModel({ orders, customers, appointments: appts, payments: [] }, now);
  const sev = Object.fromEntries(m.late.map((r) => [r.orderId, r.severity]));
  await t.test('5. شدّة التأخير: يومان=warn · 3 أيام فأكثر=critical', sev.o1 === 'warn' && sev.o2 === 'critical' && sev.o3 === 'critical');
  await t.test('6. سُلِّم اليوم: بتاريخ تسليم اليوم فقط (لا أمس ولا بلا تاريخ)', m.counts.deliveredToday === 1);
  await t.test('7. الموعد التالي: أول موعد قادم غير منتهٍ', !!m.nextAppointment && m.nextAppointment.id === 'a2');
  const empty = buildWallModel({}, now);
  await t.test('8. بيانات فارغة: لا موعد تالٍ و0 مسلَّم', empty.nextAppointment === null && empty.counts.deliveredToday === 0);
  await t.test('9. توافق رجعي: العدّادات القديمة كما هي', m.counts.inProgress === 1 && m.counts.pending === 2 && m.counts.late === 3);
});

register('wall v3.3.64 (page)', async (t) => {
  localStorage.removeItem(_internal.PREF_KEY);
  const box = document.createElement('div');
  document.body.appendChild(box);
  const cust = await customersRepo.create({ name: 'أحمد t3364', phone: '01064640001' });
  const made = [];
  /* 10 طلبات متأخرة (يومان) → عمود المتأخرة صفحتان */
  for (let i = 0; i < 10; i++) {
    made.push(await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 100, dueDate: Date.now() - 2 * D, items: [{ name: 'ثوب' + i, price: 100, quantity: 1 }] }));
  }
  /* جاهز بمتبقٍّ مالي (لاختبار إخفاء المبالغ) */
  made.push(await ordersRepo.create({ customerId: cust.id, status: 'ready', amount: 900, deposit: 100, readyAt: Date.now() - 2 * D }));
  try {
    await wallPage.render(box);
    await sleep(300);

    const chips = qa('.wall__chip').map((c) => c.textContent);
    await t.test('1. شريط الملخص: قيد التنفيذ · لم يبدأ · سُلِّم اليوم · الموعد التالي',
      chips.length === 4 && chips[0].includes('قيد التنفيذ') && chips[1].includes('لم يبدأ') && chips[2].includes('سُلِّم اليوم') && chips[3].includes('الموعد التالي'));

    const lateCol = () => q('.wall__col--late');
    await t.test('2. عمود طويل: 8 صفوف فقط + مؤشر «صفحة 1 /»',
      lateCol().querySelectorAll('.wall__row').length === _internal.MAX_ROWS && lateCol().querySelector('.wall__pager').textContent.includes('صفحة 1 /'));
    await t.test('3. شارة العمود تعرض الإجمالي (≥ 10) لا حجم الصفحة', Number(lateCol().querySelector('.wall__badge').textContent) >= 10);

    _internal.rotate();
    await t.test('4. التدوير ينقل للصفحة 2 ويعرض الباقي', lateCol().querySelector('.wall__pager').textContent.includes('صفحة 2 /') && lateCol().querySelectorAll('.wall__row').length >= 2);
    for (let i = 0; i < 6; i++) _internal.rotate();
    await t.test('5. التدوير يلتفّ ولا يخرج عن المدى', /صفحة \d+ \/ \d+/.test(lateCol().querySelector('.wall__pager').textContent));

    await t.test('6. عمود قصير (مواعيد) بلا مؤشر صفحات', !q('.wall__col--appts .wall__pager'));
    await t.test('7. التأخير يومان = warn (ليس حرجاً)', !!lateCol().querySelector('.wall__row--warn') && !lateCol().querySelector('.wall__row--critical'));

    /* الخصوصية */
    const readyText = () => q('.wall__col--ready').textContent;
    await t.test('8. افتراضياً: الاسم كاملاً والمتبقي ظاهر', readyText().includes('أحمد t3364') && readyText().includes('متبقٍّ'));
    q('[data-action="wall-privacy"]').click();
    await t.test('9. وضع الخصوصية: الاسم الأول فقط + المبلغ مخفي',
      !q('.wall').textContent.includes('t3364') && readyText().includes('أحمد') && !readyText().includes('متبقٍّ') &&
      q('.wall').classList.contains('wall--private') && q('[data-action="wall-privacy"]').getAttribute('aria-pressed') === 'true');
    await t.test('10. التفضيل محفوظ في localStorage', JSON.parse(localStorage.getItem(_internal.PREF_KEY)).privacy === true);

    /* الخط والتعتيم */
    q('[data-action="wall-scale"]').click();
    await t.test('11. حجم الخط: المستوى الثاني (--ws=1.2) والزر يعكسه',
      q('.wall').style.getPropertyValue('--ws') === '1.2' && q('[data-action="wall-scale"]').textContent === 'A+');
    q('[data-action="wall-scale"]').click(); q('[data-action="wall-scale"]').click();
    await t.test('12. حجم الخط يدور ثم يعود للأول', q('.wall').style.getPropertyValue('--ws') === '1' && q('[data-action="wall-scale"]').textContent === 'A');
    q('[data-action="wall-dim"]').click();
    await t.test('13. التعتيم', q('.wall').classList.contains('wall--dim') && q('[data-action="wall-dim"]').getAttribute('aria-pressed') === 'true');

    /* حداثة البيانات */
    _internal.setLastOk(Date.now() - 10 * 60000);
    _internal.tickClock();
    await t.test('14. بيانات قديمة: تنبيه ظاهر بعدد الدقائق', !q('.wall__stale').hidden && q('.wall__stale').textContent.includes('قديمة') && q('.wall__stale').textContent.includes('10'));
    _internal.setLastOk(Date.now());
    _internal.tickClock();
    await t.test('15. بيانات حديثة: التنبيه مخفي + «آخر تحديث» معبّأ', q('.wall__stale').hidden && q('.wall__updated').textContent.includes('آخر تحديث'));

    /* وميض الجديد */
    q('[data-action="wall-privacy"]').click();            // نعيد الخصوصية للوضع الافتراضي
    const before = qa('.wall__row--new').length;
    made.push(await ordersRepo.create({ customerId: cust.id, status: 'pending', amount: 50, dueDate: Date.now() + 100, items: [{ name: 'جديدالوميض', price: 50, quantity: 1 }] }));
    await _internal.refresh();
    await t.test('16. أول عرض بلا وميض، والصف الجديد (تسليم اليوم) يومض بعد التحديث',
      before === 0 && qa('.wall__col--today .wall__row--new').length === 1 && q('.wall__col--today .wall__row--new').textContent.includes('جديدالوميض'));
    const o = made[made.length - 1];
    await ordersRepo.update(o.id, { dueDate: Date.now() - 5 * D });   // يصبح متأخراً حرجاً
    await _internal.refresh();
    const crit = q('.wall__col--late .wall__row--critical');
    await t.test('17. طلب صار متأخراً 5 أيام: حرج + وميض، والعمود انتقل لصفحته (ظاهر دون انتظار التدوير)',
      !!crit && crit.classList.contains('wall__row--new') && q('.wall__col--late .wall__pager').textContent.includes('صفحة 1 /'));

    /* حفظ التفضيلات عبر إعادة الفتح */
    wallPage.destroy();
    await wallPage.render(box);
    await sleep(200);
    await t.test('18. التفضيلات (التعتيم) تُسترجع عند إعادة الفتح', q('.wall').classList.contains('wall--dim') && !q('.wall').classList.contains('wall--private'));
    wallPage.destroy();
    await t.test('19. destroy ينظّف الطبقة', !q('.wall') && !document.body.classList.contains('wall-open'));

    /* التكيّف مع ارتفاع الشاشة: عرض أفقي قصير */
    const old = { w: window.innerWidth };
    await wallPage.render(box);
    await sleep(200);
    const col = q('.wall__col--late');
    const cs = getComputedStyle(q('.wall__body'));
    const wide = cs.gridTemplateColumns.split(' ').length > 1;
    await t.test('20. التكيّف: الصفحة بين الحد الأدنى والأقصى دائماً',
      _internal.getPageSize() >= _internal.MIN_ROWS && _internal.getPageSize() <= _internal.MAX_ROWS);
    await t.test('21. شاشة عريضة (أعمدة متجاورة): لا تمرير عمودي في الجسم', !wide || q('.wall__body').scrollHeight <= q('.wall__body').clientHeight + 1);
    await t.test('22. عنوان العمود مقروء (ليس بلون الموقع الغامق)', getComputedStyle(q('.wall__col-title')).color !== getComputedStyle(document.documentElement).getPropertyValue('--color-primary-dark'));
    wallPage.destroy();
  } finally {
    wallPage.destroy();
    box.remove();
    for (const o of made) { try { await ordersRepo.remove(o.id); } catch { /* ignore */ } }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
    localStorage.removeItem(_internal.PREF_KEY);
  }
});
