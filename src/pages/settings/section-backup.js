/* ==========================================================================
   section-backup.js — قسم النسخ الاحتياطي + التشفير + التصدير/الاستيراد (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: backupSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { formatDate } from '../../core/utils.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  clearAllBackups,
  exportBackupToFile,
  shareLatestBackup,
  daysSinceExternalBackup,
  setBackupPinned,
  backupOptions,
  manualBackupLabel,
  BACKUP_MIN_KEEP,
  BACKUP_MAX_KEEP,
  MAX_PINNED,
  MAX_BACKUP_LABEL,
  INTERVAL_MIN_HOURS,
  INTERVAL_MAX_HOURS,
} from '../../services/auto-backup.js';
import { askSecretFor, buildEncryptionBlock, exportAllData, importAllData } from './section-backup-io.js';
import { prepareExportEncryptor } from '../../services/backup-crypto.js';

/* ==========================================================================
   4. النسخ الاحتياطي
   ========================================================================== */

export const backupSection = {
  id: 'backup',
  icon: '💾',
  title: 'النسخ الاحتياطي',
  async render(body, currentSettings, saveFn) {
    const bk = currentSettings.backup || DEFAULT_SETTINGS.backup;

    body.appendChild(el('h4', {
      style: { fontSize: '13px', color: '#123C2F', margin: '0 0 8px 0', fontWeight: '600' },
    }, '⚙️ الإعدادات'));

    const autoToggle = createToggle({
      label: 'النسخ التلقائي',
      checked: bk.autoBackup !== false,
      onChange: (v) => {
        saveFn({ backup: { autoBackup: v } });
      },
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'النسخ التلقائي'),
      autoToggle,
    ]));

    const intervalSelect = el('select', { className: 'select' });
    const PRESETS = [['6', 'كل 6 ساعات'], ['12', 'كل 12 ساعة'], ['24', 'كل يوم'], ['48', 'كل يومين'], ['168', 'كل أسبوع']];
    const curHours = backupOptions({ backup: bk }).intervalHours;
    const isPreset = PRESETS.some(([v]) => v === String(curHours));
    PRESETS.forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (String(curHours) === v) o.selected = true;
      intervalSelect.appendChild(o);
    });
    const customOpt = el('option', { value: 'custom' }, 'مخصّص (بالساعات)…');
    if (!isPreset) customOpt.selected = true;
    intervalSelect.appendChild(customOpt);
    const customHours = el('input', {
      className: 'input', type: 'number', min: String(INTERVAL_MIN_HOURS), max: String(INTERVAL_MAX_HOURS),
      value: String(curHours), 'data-role': 'custom-hours', 'aria-label': 'عدد الساعات',
      style: { marginTop: '6px', display: isPreset ? 'none' : '' },
    });
    const saveCustomHours = () => {
      const n = Math.min(INTERVAL_MAX_HOURS, Math.max(INTERVAL_MIN_HOURS, Math.floor(Number(customHours.value) || 24)));
      customHours.value = String(n);
      saveFn({ backup: { intervalHours: n } });
    };
    customHours.addEventListener('change', saveCustomHours);
    customHours.addEventListener('blur', saveCustomHours);
    intervalSelect.addEventListener('change', () => {
      if (intervalSelect.value === 'custom') { customHours.style.display = ''; saveCustomHours(); return; }
      customHours.style.display = 'none';
      saveFn({ backup: { intervalHours: Number(intervalSelect.value) } });
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'فترة النسخ التلقائي'),
      intervalSelect,
      customHours,
    ]));

    /* v3.5.41: عدد النسخ المحفوظة (فارغ = 7) */
    const keepInput = el('input', {
      className: 'input', type: 'number', min: String(BACKUP_MIN_KEEP), max: String(BACKUP_MAX_KEEP),
      value: bk.maxBackups == null ? '' : String(bk.maxBackups), placeholder: 'الافتراضي: 7', 'data-role': 'max-backups',
    });
    let keepLast = keepInput.value;
    const saveKeep = () => {
      if (keepInput.value === keepLast) return;
      keepLast = keepInput.value;
      saveFn({ backup: { maxBackups: keepInput.value === '' ? null : Number(keepInput.value) } });
    };
    keepInput.addEventListener('change', saveKeep);
    keepInput.addEventListener('blur', saveKeep);
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'عدد النسخ المحفوظة'),
      el('div', { className: 'settings-row__hint' },
        'من ' + BACKUP_MIN_KEEP + ' إلى ' + BACKUP_MAX_KEEP + ' (فارغ = 7). الأقدم يُحذف تلقائياً، والنسخ المثبَّتة 📌 لا تُحذف ولا تُحسب'),
      keepInput,
    ]));

    /* v3.5.41: اسم النسخة اليدوية */
    const nameInput = el('input', {
      className: 'input', type: 'text', maxlength: String(MAX_BACKUP_LABEL),
      placeholder: 'اسم النسخة اليدوية (اختياري) — مثال: قبل الموسم', 'data-role': 'backup-name',
      style: { marginTop: '8px' },
    });
    body.appendChild(nameInput);

    const createBtn = el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: async () => {
        createBtn.disabled = true;
        createBtn.textContent = '⏳ جارٍ الإنشاء...';
        try {
          const res = await createBackup({ label: manualBackupLabel(nameInput.value) });
          if (res.ok) nameInput.value = '';
          if (res.ok) {
            toast.success('تم إنشاء نسخة (' + res.sizeKB + ' KB)');
            await renderBackupsList();
          } else {
            toast.danger('فشل: ' + (res.error || 'خطأ'));
          }
        } finally {
          createBtn.disabled = false;
          createBtn.textContent = '💾 إنشاء نسخة الآن';
        }
      },
    }, '💾 إنشاء نسخة الآن');
    body.appendChild(createBtn);

    /* نسخة خارج الجهاز: النسخ المحلية تضيع مع الجهاز نفسه */
    const extStatus = el('div', { style: { fontSize: '12px', marginTop: '6px', textAlign: 'center' } });
    const refreshExt = () => {
      const d = daysSinceExternalBackup();
      extStatus.textContent = d === null ? '⚠️ لم تحفظ نسخة خارج هذا الجهاز بعد'
        : d === 0 ? '✅ حفظت نسخة خارج الجهاز اليوم' : 'آخر نسخة خارج الجهاز: منذ ' + d + ' يوماً';
      extStatus.style.color = (d === null || d >= 7) ? '#B3261E' : '#2E8B6F';
    };
    refreshExt();
    const shareBtn = el('button', {
      className: 'btn btn--secondary btn--block', type: 'button', style: { marginTop: '8px' },
      onClick: async () => {
        shareBtn.disabled = true;
        try {
          /* تشفير الملفات مفعّل ⟵ يُطلب السرّ أولاً؛ الإلغاء ⟵ لا مشاركة (لا ملف صريح أبداً) */
          const ctx = await prepareExportEncryptor(askSecretFor);
          if (!ctx) return;
          const res = await shareLatestBackup({ encrypt: ctx.encrypt });
          if (res.ok) toast.success(res.method === 'share' ? 'تمت المشاركة' : 'تم تنزيل النسخة — احفظها خارج الجهاز');
          else if (!res.cancelled) toast.danger('فشل: ' + (res.error || 'خطأ'));
          await renderBackupsList();
        } finally { shareBtn.disabled = false; refreshExt(); }
      },
    }, '📤 مشاركة نسخة خارج الجهاز (واتساب / تيليجرام / درايف)');
    body.appendChild(shareBtn);
    body.appendChild(extStatus);

    /* تشفير الملفات الخارجية (اختياري ومعطّل افتراضياً). فشل رسمه لا يكسر بقية القسم. */
    try { body.appendChild(buildEncryptionBlock()); } catch (e) { console.warn('[backup-encryption] تعذّر رسم الكتلة:', e); }

    body.appendChild(el('h4', {
      style: { fontSize: '13px', color: '#123C2F', margin: '16px 0 8px 0', fontWeight: '600' },
    }, '📋 النسخ المحفوظة'));

    const listWrap = el('div', { id: 'backup-list-wrap' });
    body.appendChild(listWrap);

    async function renderBackupsList() {
      clear(listWrap);
      const backups = await listBackups();

      if (backups.length === 0) {
        listWrap.appendChild(el('div', {
          style: {
            textAlign: 'center', padding: '20px', color: '#999',
            fontSize: '13px', background: '#F6F1E6', borderRadius: '8px',
          },
        }, 'لا توجد نسخ محفوظة بعد'));
        return;
      }

      backups.forEach((b) => {
        const row = el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px', background: '#F6F1E6',
            borderRadius: '8px', marginBottom: '6px',
          },
        });

        row.appendChild(el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#123C2F' } },
            (b.pinned ? '📌 ' : '💾 ') + (b.label || 'نسخة')),
          el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
            '📅 ' + formatDate(b.createdAt) + ' · 📦 ' + (b.sizeKB || 0) + ' KB'),
        ]));

        row.appendChild(el('button', {
          className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'pin-backup', 'aria-pressed': b.pinned ? 'true' : 'false',
          title: b.pinned ? 'إلغاء التثبيت' : 'تثبيت (لا تُحذف تلقائياً — حتى ' + MAX_PINNED + ')',
          onClick: async () => {
            const r = await setBackupPinned(b.id, !b.pinned);
            if (!r.ok) toast.warning(r.error || 'تعذّر التثبيت');
            await renderBackupsList();
          },
        }, b.pinned ? '📌' : '📍'));

        row.appendChild(el('button', {
          className: 'btn btn--sm btn--ghost', type: 'button', title: 'تحميل كملف',
          onClick: async () => {
            const ctx = await prepareExportEncryptor(askSecretFor);
            if (!ctx) return;
            const ok = await exportBackupToFile(b.id, { encrypt: ctx.encrypt });
            if (ok) toast.success('تم التحميل');
            else toast.danger('فشل التحميل');
          },
        }, '⬇️'));

        row.appendChild(el('button', {
          className: 'btn btn--sm btn--secondary', type: 'button', title: 'استرجاع',
          onClick: async () => {
            const ok = await modal.confirm({
              title: 'استرجاع نسخة احتياطية',
              message: '⚠️ سيتم استبدال البيانات الحالية ببيانات هذه النسخة. لا يمكن التراجع!\n(الدفتر المالي لا يُمسح: تُدمج حركاته مع حركات النسخة، وتُحسب الأرصدة منه.)',
              confirmText: 'استرجاع', cancelText: 'إلغاء', danger: true,
            });
            if (!ok) return;
            const res = await restoreBackup(b.id);
            if (res.ok) {
              toast.success('تم الاسترجاع — جارٍ إعادة التحميل...');
              setTimeout(() => location.reload(), 1500);
            } else {
              toast.danger('فشل: ' + (res.error || 'خطأ'));
            }
          },
        }, '♻️'));

        row.appendChild(el('button', {
          className: 'btn btn--sm btn--danger', type: 'button', title: 'حذف',
          onClick: async () => {
            const ok = await modal.confirm({
              title: 'حذف نسخة',
              message: 'حذف "' + (b.label || 'نسخة') + '" نهائياً؟',
              confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
            });
            if (!ok) return;
            await deleteBackup(b.id);
            toast.success('تم الحذف');
            await renderBackupsList();
          },
        }, '🗑️'));

        listWrap.appendChild(row);
      });

      if (backups.length > 1) {
        listWrap.appendChild(el('button', {
          className: 'btn btn--ghost btn--block', type: 'button',
          style: { marginTop: '8px', color: '#C62828', fontSize: '12px' },
          onClick: async () => {
            const ok = await modal.confirm({
              title: 'حذف كل النسخ',
              message: 'سيتم حذف ' + backups.length + ' نسخة' + (backups.some((x) => x.pinned) ? ' (بما فيها المثبَّتة 📌)' : '') + '. لا يمكن التراجع!',
              confirmText: 'حذف الكل', cancelText: 'إلغاء', danger: true,
            });
            if (!ok) return;
            await clearAllBackups();
            toast.success('تم حذف كل النسخ');
            await renderBackupsList();
          },
        }, '🗑️ حذف كل النسخ (' + backups.length + ')'));
      }
    }

    await renderBackupsList();

    body.appendChild(el('h4', {
      style: { fontSize: '13px', color: '#123C2F', margin: '16px 0 8px 0', fontWeight: '600' },
    }, '📦 تصدير / استيراد JSON (كامل البيانات)'));

    body.appendChild(el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      style: { marginBottom: '8px' },
      onClick: () => exportAllData(),
    }, '⬇️ تنزيل نسخة JSON'));

    const importInput = el('input', {
      type: 'file', accept: '.json', style: { display: 'none' },
    });
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      importAllData(file);
      importInput.value = '';
    });

    body.appendChild(el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      onClick: () => importInput.click(),
    }, '⬆️ استيراد من JSON'));
    body.appendChild(importInput);
  },
};
