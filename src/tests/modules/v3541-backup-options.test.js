/* ==========================================================================
   v3541-backup-options.test.js — النسخ الاحتياطي: عدد النسخ، التثبيت، فترة حرة، اسم يدوي (v3.5.41)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS, STORES } from '../../core/config.js';
import * as idb from '../../data/idb.js';
import {
  backupOptions, manualBackupLabel, selectPruneIds, setBackupPinned, listBackups,
  MAX_PINNED, MAX_BACKUP_LABEL, BACKUP_MIN_KEEP, BACKUP_MAX_KEEP,
} from '../../services/auto-backup.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { backupSection } from '../../pages/settings/section-backup.js';

const mk = (n, extra) => Array.from({ length: n }, (_, i) => ({ id: 'b' + i, createdAt: 1000 - i, sizeKB: 10, ...(extra && extra(i)) }));   /* b0 الأحدث */

register('v3.5.41 النسخ الاحتياطي: خيارات متقدمة', async (t) => {
  const d = backupOptions({});
  await t.test('1. الافتراضيات: تلقائي، 24 ساعة، 7 نسخ', d.autoBackup === true && d.intervalHours === 24 && d.maxBackups === 7);
  await t.test('2. maxBackups يُقصّ 3–20 وفاسده 7', backupOptions({ backup: { maxBackups: 1 } }).maxBackups === BACKUP_MIN_KEEP && backupOptions({ backup: { maxBackups: 99 } }).maxBackups === BACKUP_MAX_KEEP
    && backupOptions({ backup: { maxBackups: 'x' } }).maxBackups === 7 && backupOptions({ backup: { maxBackups: null } }).maxBackups === 7 && backupOptions({ backup: { maxBackups: 12.8 } }).maxBackups === 12);
  await t.test('3. الفترة الحرة 1–720 والقديم صفر/فاسد = 24', backupOptions({ backup: { intervalHours: 5 } }).intervalHours === 5 && backupOptions({ backup: { intervalHours: 5000 } }).intervalHours === 720
    && backupOptions({ backup: { intervalHours: 0 } }).intervalHours === 24 && backupOptions({ backup: { intervalHours: 'x' } }).intervalHours === 24 && backupOptions({ backup: { intervalHours: 168 } }).intervalHours === 168);
  await t.test('4. autoBackup=false فقط عند false صريحة', backupOptions({ backup: { autoBackup: false } }).autoBackup === false && backupOptions({ backup: { autoBackup: 0 } }).autoBackup === true);
  await t.test('5. manualBackupLabel: افتراضي، تنظيف، قص', manualBackupLabel('') === 'نسخة يدوية' && manualBackupLabel(null) === 'نسخة يدوية' && manualBackupLabel('  قبل   الموسم ') === 'قبل الموسم' && manualBackupLabel('ع'.repeat(100)).length === MAX_BACKUP_LABEL);
  await t.test('6. selectPruneIds: 9 نسخ والحد 7 ⟵ يحذف الأقدم اثنتين', J(selectPruneIds(mk(9), 7)) === J(['b7', 'b8']));
  await t.test('7. عدد أقل من الحد ⟵ لا حذف', selectPruneIds(mk(5), 7).length === 0 && selectPruneIds([], 7).length === 0 && selectPruneIds(null, 7).length === 0);
  await t.test('8. حد 3: يحذف الباقي', selectPruneIds(mk(6), 3).length === 3);
  await t.test('9. المثبَّتة لا تُحذف ولا تُحسب: 9 نسخ منها الأقدم مثبَّتتان', J(selectPruneIds(mk(9, (i) => ({ pinned: i >= 7 })), 7)) === J([]));
  await t.test('10. مثبَّتة + زائد: تُحذف الزائدة غير المثبَّتة فقط', (() => {
    const ids = selectPruneIds(mk(10, (i) => ({ pinned: i === 9 })), 7);   /* 9 غير مثبَّتة، الحد 7 */
    return J(ids) === J(['b7', 'b8']);
  })());
  await t.test('11. قاعدة الحجم: كبر الإجمالي يُبقي ≥ 3', selectPruneIds(mk(7, () => ({ sizeKB: 20000 })), 7).length === 4);
  await t.test('12. config + إعادة الضبط', DEFAULT_SETTINGS.backup.maxBackups === null && DEFAULT_SETTINGS.backup.intervalHours === 24
    && buildResetPatch('backup', DEFAULT_SETTINGS).backup.maxBackups === null);

  /* ---- التثبيت (سجلات صغيرة وهمية) ---- */
  const ids = ['t3541-a', 't3541-b', 't3541-c', 't3541-d'];
  const before = new Set((await listBackups()).filter((b) => b.pinned).map((b) => b.id));
  try {
    for (const id of ids) await idb.put(STORES.BACKUPS, { id, createdAt: 1, label: 'x', sizeKB: 1, counts: {}, stores: {} });
    const room = Math.max(0, MAX_PINNED - before.size);
    await t.test('13. التثبيت يظهر في listBackups وإلغاؤه يعيده', await (async () => {
      const r = await setBackupPinned(ids[0], true);
      const p1 = (await listBackups()).find((b) => b.id === ids[0]).pinned;
      await setBackupPinned(ids[0], false);
      const p2 = (await listBackups()).find((b) => b.id === ids[0]).pinned;
      return (r.ok || room === 0) && (room === 0 || p1 === true) && p2 === false;
    })());
    /* املأ الحد ثم جرّب واحدة زائدة */
    for (const id of ids) await setBackupPinned(id, true);
    const over = await setBackupPinned(ids[3], true);
    const pinnedNow = (await listBackups()).filter((b) => b.pinned).length;
    await t.test('14. حد التثبيت ' + MAX_PINNED + ': الزائدة مرفوضة برسالة', pinnedNow <= MAX_PINNED && (pinnedNow < MAX_PINNED || over.ok === true || /الحد الأقصى/.test(over.error || '')));
    await t.test('15. نسخة غير موجودة', (await setBackupPinned('nope-3541', true)).ok === false);
    await t.test('16. التثبيت لا يمس بقية السجل', await (async () => { const r = await idb.get(STORES.BACKUPS, ids[1]); return r.label === 'x' && r.sizeKB === 1 && !!r.stores; })());
  } finally {
    for (const id of ids) { try { await idb.remove(STORES.BACKUPS, id); } catch (e) { /* ignore */ } }
  }

  /* ---- الواجهة ---- */
  const saved = [];
  const body = document.createElement('div');
  await backupSection.render(body, { backup: { ...DEFAULT_SETTINGS.backup } }, (p) => saved.push(p));
  const sel = body.querySelector('select');
  const ch = body.querySelector('[data-role="custom-hours"]');
  await t.test('17. الفترة: خيار «مخصص» وحقل مخفي افتراضياً', [...sel.options].some((o) => o.value === 'custom') && ch.style.display === 'none');
  sel.value = 'custom'; sel.dispatchEvent(new Event('change'));
  ch.value = '5'; ch.dispatchEvent(new Event('change'));
  await t.test('18. فترة مخصصة 5 ساعات تُحفظ', ch.style.display !== 'none' && saved.some((s) => s.backup.intervalHours === 5));
  ch.value = '99999'; ch.dispatchEvent(new Event('change'));
  await t.test('19. قيمة أكبر من 720 تُقصّ', saved[saved.length - 1].backup.intervalHours === 720);
  const keep = body.querySelector('[data-role="max-backups"]');
  keep.value = '12'; keep.dispatchEvent(new Event('change'));
  const k1 = saved[saved.length - 1].backup.maxBackups;
  keep.value = ''; keep.dispatchEvent(new Event('change'));
  await t.test('20. عدد النسخ: 12 ثم فراغ ⟵ null', k1 === 12 && saved[saved.length - 1].backup.maxBackups === null);
  const b2 = document.createElement('div');
  await backupSection.render(b2, { backup: { ...DEFAULT_SETTINGS.backup, intervalHours: 36 } }, () => {});
  await t.test('21. فترة قديمة غير مألوفة (36) تُعرض كمخصّص بقيمتها', b2.querySelector('select').value === 'custom' && b2.querySelector('[data-role="custom-hours"]').value === '36');
  await t.test('22. حقل اسم النسخة اليدوية موجود', !!body.querySelector('[data-role="backup-name"]'));
});
const J = JSON.stringify;
