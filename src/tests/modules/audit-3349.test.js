/* ==========================================================================
   audit-3349.test.js — حماية التخزين المحلي من الحذف التلقائي (v3.3.49)
   ========================================================================== */

import { register } from '../registry.js';
import { requestPersistence, getStorageStatus, formatBytes } from '../../services/storage-health.js';

const nav = (o) => ({ storage: o });

register('audit v3.3.49 storage health', async (t) => {
  let r = await requestPersistence({});
  await t.test('1. متصفح بلا واجهة التخزين → غير مدعوم دون أخطاء', r.supported === false && r.persisted === false);

  let calls = 0;
  r = await requestPersistence(nav({ persisted: async () => true, persist: async () => { calls++; return true; } }));
  await t.test('2. ممنوح مسبقاً → لا يُعاد الطلب', r.persisted === true && r.requested === false && calls === 0);

  r = await requestPersistence(nav({ persisted: async () => false, persist: async () => { calls++; return true; } }));
  await t.test('3. غير ممنوح → يُطلب ويُمنح', r.persisted === true && r.requested === true && calls === 1);

  r = await requestPersistence(nav({ persisted: async () => false, persist: async () => false }));
  await t.test('4. المتصفح يرفض → persisted=false دون أخطاء', r.supported === true && r.persisted === false && r.requested === true);

  r = await requestPersistence(nav({ persisted: async () => { throw new Error('x'); }, persist: async () => true }));
  await t.test('5. فشل داخل المتصفح لا يُسقط الدالة', r.supported === true && r.persisted === false);

  let s = await getStorageStatus(nav({ persist: async () => true, persisted: async () => true, estimate: async () => ({ usage: 5_000_000, quota: 100_000_000 }) }));
  await t.test('6. الحالة: محمي + المساحة والنسبة (5%)', s.persisted && s.usage === 5_000_000 && s.quota === 100_000_000 && s.percent === 5);

  s = await getStorageStatus(nav({ persist: async () => true, persisted: async () => false }));
  await t.test('7. بلا estimate: المساحة null والنسبة null', !s.persisted && s.usage === null && s.percent === null);

  s = await getStorageStatus({});
  await t.test('8. بلا واجهة: غير مدعوم', s.supported === false);

  await t.test('9. تنسيق الأحجام', formatBytes(500) === '500 B' && formatBytes(1536) === '1.5 KB' && formatBytes(5 * 1024 * 1024) === '5 MB' && formatBytes(-1) === '—' && formatBytes('x') === '—');
});
