/* ==========================================================================
   v3212-actions-cache.test.js — ذاكرة مؤقتة لمركز العمل تُبطَل بأي كتابة (v3.21.2)
   ========================================================================== */
import { register } from '../registry.js';
import { loadActionCenter, clearActionCenterCache } from '../../pages/actions-data.js';
import { customers } from '../../data/repos/customers.js';
import { settings } from '../../data/repos/settings.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();

register('v3.21.2 مركز العمل: ذاكرة مؤقتة تُبطَل بالكتابة', async (t) => {
  clearActionCenterCache();
  const a = await loadActionCenter();
  const b = await loadActionCenter();
  await t.test('1. نداءان متتاليان بلا كتابة يعيدان النتيجة نفسها (لا إعادة تحميل)', a === b);
  await customers.create({ name: 'عميل إبطال ' + Date.now(), phone: '01000000000' });
  const c = await loadActionCenter();
  await t.test('2. أي كتابة (عميل جديد) تُبطل الذاكرة فتُحسب نتيجة جديدة', c !== b && c.model && Array.isArray(c.model.items));
  const d = await loadActionCenter();
  await t.test('3. وبعدها تعود الذاكرة من جديد', d === c);
  await settings.update({ purchasePlan: { avgHeightCm: 151 } });
  const e = await loadActionCenter();
  await t.test('4. كتابة الإعدادات (كما يفعل التأجيل و«تم») تُبطلها أيضاً', e !== d);
  clearActionCenterCache();
  const f = await loadActionCenter();
  await t.test('5. clearActionCenterCache يفرض إعادة الحساب', f !== e);
  const g = await loadActionCenter(Date.now());
  const h = await loadActionCenter(Date.now());
  await t.test('6. نداء بـ now صريح لا يستعمل الذاكرة (اختبارات/أدوات)', g !== h && g !== f);
  const code = await src('pages/actions-data.js');
  await t.test('7. العقد: مفتاح الذاكرة عدّاد الكتابة + الدور + مهلة دقيقة، ولا تُحفظ إن حدثت كتابة أثناء الحساب', code.includes('_cache.ver === ver') && code.includes('_cache.role === role') && code.includes('CACHE_TTL_MS = 60000') && code.includes('getWriteVersion() === ver'));
  await settings.update({ purchasePlan: { avgHeightCm: 150 } });
});
