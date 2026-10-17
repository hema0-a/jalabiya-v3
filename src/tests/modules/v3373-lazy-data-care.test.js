/* ==========================================================================
   v3373-lazy-data-care.test.js — القراءة الكسولة في «صيانة البيانات» (v3.3.73)
   ==========================================================================
   يتأكد أن فتح الصفحة وبطاقة الحالة لا يستدعيان orders.list()،
   وأن الضغط الصريح (افحص المؤهلين / تحديث) هو وحده الذي يقرأ الطلبات.
   ========================================================================== */

import { register } from '../registry.js';
import { orders } from '../../data/repos/orders.js';
import { dataCarePage } from '../../pages/data-care.js';
import { buildSystemStatusCard, collectStatus } from '../../ui/system-status-card.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** يلفّ orders.list بعدّاد استدعاءات ويعيد دالة الاسترجاع. */
function spyOrdersList() {
  const original = orders.list;
  const spy = { calls: 0, restore: () => { orders.list = original; } };
  orders.list = function (...args) { spy.calls++; return original.apply(this, args); };
  return spy;
}

/** يبحث عن زر بنصه داخل عقدة. */
const findBtn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text));

register('v3.3.73 lazy data-care', async (t) => {
  /* 1) collectStatus بدون فحص السلامة لا يقرأ الطلبات */
  let spy = spyOrdersList();
  try {
    const snap = await collectStatus({ integrity: false });
    t.test('1. collectStatus({integrity:false}) لا يستدعي orders.list ولا يضع integrity', spy.calls === 0 && !('integrity' in snap));
  } finally { spy.restore(); }

  /* 2) الافتراضي القديم محفوظ (يقرأ الطلبات) */
  spy = spyOrdersList();
  try {
    const snap = await collectStatus();
    t.test('2. collectStatus() الافتراضي ما زال يفحص السلامة', spy.calls >= 1 && 'integrity' in snap);
  } finally { spy.restore(); }

  /* 3) بطاقة الحالة الكسولة: التحميل الأول بلا طلبات، و«تحديث» يشملها */
  spy = spyOrdersList();
  const card = buildSystemStatusCard({ lazyIntegrity: true });
  document.body.appendChild(card);
  try {
    await sleep(900);
    t.test('3. البطاقة الكسولة لا تقرأ الطلبات عند أول تحميل', spy.calls === 0 && card.querySelectorAll('.sysstat__row').length >= 3);
    card.querySelector('[data-action="sysstat-refresh"]').click();
    await sleep(900);
    t.test('4. ضغط «تحديث» يشغّل فحص السلامة (يقرأ الطلبات)', spy.calls >= 1);
  } finally { card.remove(); spy.restore(); }

  /* 5) فتح صفحة الصيانة لا يقرأ الطلبات */
  spy = spyOrdersList();
  const container = document.createElement('div');
  document.body.appendChild(container);
  try {
    await dataCarePage.render(container);
    await sleep(900);
    t.test('5. فتح الصفحة لا يستدعي orders.list', spy.calls === 0);
    t.test('6. زر «افحص المؤهلين» ظاهر وزر «افحص الآن» ظاهر', !!findBtn(container, 'افحص المؤهلين') && !!findBtn(container, 'افحص الآن'));

    /* 7) الضغط على «افحص المؤهلين» يقرأ الطلبات */
    findBtn(container, 'افحص المؤهلين').click();
    await sleep(900);
    t.test('7. «افحص المؤهلين» يقرأ الطلبات ثم يعرض النتيجة', spy.calls >= 1 && !findBtn(container, 'افحص المؤهلين'));
  } finally { dataCarePage.destroy(); container.remove(); spy.restore(); }
});
