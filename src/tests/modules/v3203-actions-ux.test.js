/* ==========================================================================
   v3203-actions-ux.test.js — قسم «الماكينات» لا ينطوي بعد كل حفظ (v3.20.3)
   ==========================================================================
   كشفه اختبار شامل على التطبيق الحقيقي: الصفحة تُعاد رسمها بعد كل حفظ فكان <details> يعود مغلقاً تحت إصبع المستخدم.
   ========================================================================== */
import { register } from '../registry.js';
import { buildMachinesSection } from '../../pages/actions-machines.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const M = [{ id: 'm1', name: 'ماكينة', hours: 50, lastServiceHours: 0, lastServiceAt: 0, intervalHours: 100 }];

register('v3.20.3 مركز العمل: قسم الماكينات يحتفظ بحالة الفتح', async (t) => {
  await t.test('1. open=true يرسم القسم مفتوحاً، وافتراضياً مغلق', buildMachinesSection({ machines: M, open: true }).open === true && buildMachinesSection({ machines: M }).open === false);
  await t.test('2. فتح/طيّ القسم يُبلَّغ به onToggle (فتحفظه الصفحة قبل إعادة الرسم)', (() => { const seen = []; const sec = buildMachinesSection({ machines: M, onToggle: (v) => seen.push(v) }); sec.open = true; sec.dispatchEvent(new Event('toggle')); sec.open = false; sec.dispatchEvent(new Event('toggle')); return seen.join() === 'true,false'; })());
  const page = await src('pages/actions.js');
  await t.test('3. الصفحة تحفظ الحالة وتمرّرها عند كل إعادة رسم', page.includes('machinesOpen: false') && page.includes('open: ui.machinesOpen') && page.includes('onToggle: (v) => { ui.machinesOpen = v; }'));
});
