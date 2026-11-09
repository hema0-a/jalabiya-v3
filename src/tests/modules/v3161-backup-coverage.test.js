/* ==========================================================================
   v3161-backup-coverage.test.js — النسخ التلقائي يشمل كل مخازن السجلات (v3.16.1)
   ==========================================================================
   خلل اكتُشف بالتدقيق: مخازن 3.12–3.16 لم تكن في BACKUP_STORES فغابت عن النسخ التلقائي (التصدير اليدوي كان سليماً).
   هذا الاختبار «حارس» دائم: أي مخزن سجلات يُضاف مستقبلاً ويُنسى في النسخ التلقائي يُفشل الاختبار.
   ========================================================================== */
import { register } from '../registry.js';
import { STORES } from '../../core/config.js';
import { RECORD_STORES } from '../../data/record-meta.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();

register('v3.16.1 تغطية النسخ التلقائي', async (t) => {
  const ab = await src('services/auto-backup.js');
  const m = ab.match(/const BACKUP_STORES = \[([\s\S]*?)\n\];/);
  const block = m ? m[1] : '';
  const used = new Set((block.match(/STORES\.([A-Z_]+)/g) || []).map((x) => x.replace('STORES.', '')));
  const keyOf = (name) => Object.keys(STORES).find((k) => STORES[k] === name);

  await t.test('1. قائمة النسخ التلقائي موجودة وغير فارغة', !!m && used.size >= 20);
  /* الاستثناء الوحيد المقصود: سجل النشاط (يتزامن لكنه خارج التصدير اليدوي والنسخ التلقائي معاً، وليس بيانات عمل) */
  const missing = RECORD_STORES.filter((s) => !(keyOf(s) && used.has(keyOf(s))));
  await t.test('2. كل مخزن سجلات موجود في BACKUP_STORES عدا سجل النشاط وحده', missing.length === 1 && missing[0] === 'activity');
  await t.test('3. المخازن الجديدة السبعة موجودة صراحةً', ['SUPPLIERS', 'SUPPLIER_ENTRIES', 'AFTERCARE', 'ATTENDANCE', 'CIRCLES', 'DOCUMENTS', 'TODOS'].every((k) => used.has(k)));
  await t.test('4. لا مخزن النسخ نفسه (backups) داخل النسخة', !used.has('BACKUPS'));
  await t.test('5. الاستعادة تتخطى المخزن الغائب من نسخة أقدم بدل مسحه', ab.includes('if (!Array.isArray(backup.stores[s])) continue;'));
});
