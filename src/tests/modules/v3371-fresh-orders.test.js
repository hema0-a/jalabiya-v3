/* ==========================================================================
   v3371-fresh-orders.test.js — اقتراح الموعد يقرأ أحدث الطلبات (v3.3.71)
   ==========================================================================
   السيناريو: صفحة الطلبات مفتوحة (لقطة state.orders قديمة)، ثم يظهر في قاعدة البيانات
   طلبان يملآن غداً وبعد غد (مزامنة من جهاز آخر). زر ✨ يجب ألا يقترح أياً منهما.
   ========================================================================== */

import { register } from '../registry.js';
import { ordersPage } from '../../pages/orders.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { settings as settingsRepo } from '../../data/repos/settings.js';
import * as draft from '../../services/draft-manager.js';
import { addDaysNoon } from '../../core/day-math.js';
import { localDateInput } from '../../core/utils.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
const findBtn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text));

register('v3.3.71 order form: suggestion uses fresh orders', async (t) => {
  const prevSettings = await settingsRepo.get();
  const now = Date.now();
  const offDay = new Date(addDaysNoon(now, 6)).getDay();   /* إجازة بعيدة: لا تقع بين +1 و+3 */
  await settingsRepo.update({ dailyLimit: { dailyOrderLimit: 700, dayOffWeekday: offDay } });

  const cust = await customersRepo.create({ name: 't3371-cust', phone: '01012345678' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  const made = [];
  try {
    await ordersPage.render(box);                 /* اللقطة تُحمَّل هنا — بلا أي طلب من طلباتنا */

    /* «مزامنة من جهاز آخر»: تصل بعد تحميل الصفحة وتملأ غداً وبعد غد */
    for (const n of [1, 2]) {
      made.push(await ordersRepo.create({
        customerId: cust.id, status: 'pending', amount: 700, dueDate: addDaysNoon(now, n),
        items: [{ id: 'i' + n, name: 't3371', price: 700, quantity: 1 }],
      }));
    }

    findBtn(box, 'إضافة طلب').click();
    await sleep(120);
    const price = document.querySelector('input[aria-label="السعر"]');
    price.value = '300'; fire(price, 'input');
    const dueIn = document.querySelector('input[aria-label="تاريخ التسليم"]');

    findBtn(document.body, 'اقتراح أقرب موعد').click();
    await sleep(250);
    const tomorrow = localDateInput(addDaysNoon(now, 1));
    const dayAfter = localDateInput(addDaysNoon(now, 2));
    const expected = localDateInput(addDaysNoon(now, 3));
    t.test('1. لا يقترح غداً الممتلئ (700/700) رغم أنه ظهر بعد تحميل الصفحة', dueIn.value !== tomorrow);
    t.test('2. ولا بعد غد الممتلئ', dueIn.value !== dayAfter);
    t.test('3. يقترح أول يوم فيه سعة (بعد 3 أيام)', dueIn.value === expected);
    t.test('4. نص الاقتراح يظهر تحت الحقل', /اقتراح|أقرب|💡/.test(document.querySelector('.order-hint').textContent));
  } finally {
    findBtn(document.body, 'إلغاء') && findBtn(document.body, 'إلغاء').click();
    await sleep(650);                              /* انتظار الحفظ التلقائي للمسودة ثم مسحها */
    try { draft.clear('order-form'); } catch (e) { /* ignore */ }
    ordersPage.destroy();
    box.remove();
    for (const o of made) { try { await ordersRepo.remove(o.id); } catch (e) { /* ignore */ } }
    try { await customersRepo.remove(cust.id); } catch (e) { /* ignore */ }
    try { await settingsRepo.update({ dailyLimit: prevSettings.dailyLimit }); } catch (e) { /* ignore */ }
  }
});
