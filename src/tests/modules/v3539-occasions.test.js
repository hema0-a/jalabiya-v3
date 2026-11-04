/* ==========================================================================
   v3539-occasions.test.js — المناسبات: احترام مدة كل مناسبة + الترتيب والفرز (v3.5.39)
   ========================================================================== */
import { register } from '../registry.js';
import { occasionAlertDays, occasionDaysUntil, upcomingOccasions, sortOccasionsByDate } from '../../services/alert-rules.js';
import { occasionsSection } from '../../pages/settings/section-occasions.js';
import { getNotifications } from '../../ui/notifications-center.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';

const NOW = new Date(2026, 5, 1, 12, 0, 0).getTime();   /* 1 يونيو 2026 */
const occ = (name, month, day, extra) => ({ id: name, name, month, day, alertDays: 14, enabled: true, ...extra });

register('v3.5.39 المناسبات: مدة كل مناسبة وترتيبها', async (t) => {
  await t.test('1. occasionAlertDays: قيمة المناسبة تُقصّ 1–90، وإلا الاحتياطي',
    occasionAlertDays({ alertDays: 30 }, 14) === 30 && occasionAlertDays({ alertDays: 500 }, 14) === 90 && occasionAlertDays({}, 14) === 14
    && occasionAlertDays({ alertDays: 0 }, 14) === 14 && occasionAlertDays({ alertDays: 'x' }, 7) === 7 && occasionAlertDays(null, 9) === 9);
  await t.test('2. occasionDaysUntil: اليوم = 0، غداً = 1، بعد 10 أيام = 10', occasionDaysUntil(occ('a', 6, 1), NOW) === 0 && occasionDaysUntil(occ('a', 6, 2), NOW) === 1 && occasionDaysUntil(occ('a', 6, 11), NOW) === 10);
  await t.test('3. مناسبة مرّت هذه السنة ⟵ تُحسب للسنة القادمة', occasionDaysUntil(occ('a', 5, 31), NOW) === 364);
  await t.test('4. تاريخ غير صالح ⟵ null', occasionDaysUntil(occ('a', 13, 1), NOW) === null && occasionDaysUntil(occ('a', 1, 0), NOW) === null && occasionDaysUntil(null, NOW) === null);
  const list = [occ('far', 6, 25, { alertDays: 30 }), occ('near', 6, 5), occ('out', 9, 1), occ('off', 6, 3, { enabled: false }), occ('bad', 14, 1)];
  const up = upcomingOccasions(list, NOW, 14);
  await t.test('5. upcoming: كل مناسبة بمدتها (far عند 24 يوماً داخل نافذة 30، out خارج)، المعطّلة والفاسدة مستبعدة، الأقرب أولاً',
    up.map((x) => x.occ.name).join() === 'near,far');
  await t.test('6. مناسبة بلا alertDays تستخدم الاحتياطي', upcomingOccasions([{ name: 'z', month: 6, day: 20, enabled: true }], NOW, 14).length === 0
    && upcomingOccasions([{ name: 'z', month: 6, day: 20, enabled: true }], NOW, 30).length === 1);
  await t.test('7. upcoming يتحمل مدخلات فاسدة', upcomingOccasions(null, NOW).length === 0 && upcomingOccasions([null, undefined, {}], NOW).length === 0);
  const sorted = sortOccasionsByDate(list, NOW).map((o) => o.name).join();
  await t.test('8. الفرز: الأقرب أولاً، المعطّلة ثم الفاسدة أخيراً', sorted === 'near,far,out,off,bad');
  await t.test('9. الفرز مستقر عند التعادل ولا يعدّل المصفوفة الأصلية', (() => {
    const a = [occ('x', 7, 1), occ('y', 7, 1), occ('z', 6, 2)];
    const snap = a.map((o) => o.name).join();
    return sortOccasionsByDate(a, NOW).map((o) => o.name).join() === 'z,x,y' && a.map((o) => o.name).join() === snap;
  })());

  /* ---- الواجهة ---- */
  const mk = () => [occ('A', 9, 1), occ('B', 6, 5), occ('C', 12, 1)];
  const saved = [];
  const arr = mk();
  const body = document.createElement('div');
  await occasionsSection.render(body, { occasions: arr }, (p) => saved.push(p));
  const ups = body.querySelectorAll('[data-action="move-up"]');
  const downs = body.querySelectorAll('[data-action="move-down"]');
  await t.test('10. أزرار ▲▼ لكل مناسبة؛ الأولى لا ▲ والأخيرة لا ▼', ups.length === 3 && downs.length === 3 && ups[0].hasAttribute('disabled') && !ups[1].hasAttribute('disabled') && downs[2].hasAttribute('disabled'));
  downs[0].click();
  await t.test('11. ▼ على الأولى يبدّلها مع الثانية ويحفظ المصفوفة كاملة', saved.length === 1 && saved[0].occasions.map((o) => o.name).join() === 'B,A,C');
  body.querySelector('[data-action="sort-date"]').click();
  await t.test('12. زر الفرز يرتّب حسب الأقرب تاريخاً ويحفظ', saved.length === 2 && saved[1].occasions.length === 3
    && saved[1].occasions.map((o) => o.name).join() === sortOccasionsByDate(mk()).map((o) => o.name).join());

  /* ---- تكامل: مركز التنبيهات يحترم مدة المناسبة ---- */
  const orig = (await settingsRepo.get()).occasions;
  const today = new Date();
  const in20 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20);
  const mkOcc = (alertDays) => [{ id: 't3539', name: 'مناسبة-اختبار-3539', icon: '🎉', month: in20.getMonth() + 1, day: in20.getDate(), alertDays, recurring: true, enabled: true }];
  const shows = async () => (await getNotifications()).some((n) => /مناسبة-اختبار-3539/.test(n.subtitle || ''));
  try {
    await settingsRepo.update({ occasions: mkOcc(30) });
    const a = await shows();
    await settingsRepo.update({ occasions: mkOcc(10) });
    const b = await shows();
    await t.test('13. المركز: مناسبة بعد 20 يوماً تظهر إن كان تنبيهها 30، ولا تظهر إن كان 10', a === true && b === false);
  } finally {
    await settingsRepo.update({ occasions: orig });
  }
});
