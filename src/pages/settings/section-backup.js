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
import { formatDate, localDateInput } from '../../core/utils.js';
import * as db from '../../data/idb.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  clearAllBackups,
  exportBackupToFile,
  shareLatestBackup,
  daysSinceExternalBackup,
  buildBackupFile,
} from '../../services/auto-backup.js';
import { askSecret, showRecoveryKey } from '../../ui/secret-dialog.js';
import {
  getFileEncryptionInfo,
  createFileEncryptionSetup,
  disableFileEncryption,
  prepareExportEncryptor,
  decryptImportedText,
  describeCryptoError,
} from '../../services/backup-crypto.js';

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
    [
      ['6', 'كل 6 ساعات'],
      ['12', 'كل 12 ساعة'],
      ['24', 'كل يوم'],
      ['48', 'كل يومين'],
      ['168', 'كل أسبوع'],
    ].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (String(bk.intervalHours || 24) === v) o.selected = true;
      intervalSelect.appendChild(o);
    });
    intervalSelect.addEventListener('change', () => {
      saveFn({ backup: { intervalHours: Number(intervalSelect.value) } });
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'فترة النسخ التلقائي'),
      intervalSelect,
    ]));

    const createBtn = el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: async () => {
        createBtn.disabled = true;
        createBtn.textContent = '⏳ جارٍ الإنشاء...';
        try {
          const res = await createBackup({ label: 'نسخة يدوية' });
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
            '💾 ' + (b.label || 'نسخة')),
          el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
            '📅 ' + formatDate(b.createdAt) + ' · 📦 ' + (b.sizeKB || 0) + ' KB'),
        ]));

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
              message: 'سيتم حذف ' + backups.length + ' نسخة. لا يمكن التراجع!',
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

/** نافذة السرّ حسب الغرض (تصدير/استيراد) — تُمرَّر كـask لدوال backup-crypto. */
function askSecretFor({ purpose, verify }) {
  const isExport = purpose === 'export';
  return askSecret({
    title: isExport ? '🔐 تشفير الملف' : '🔐 ملف مشفّر',
    message: isExport
      ? 'أدخل عبارة المرور (أو مفتاح الاسترجاع) لتشفير الملف قبل خروجه من الجهاز.'
      : 'هذا الملف مشفّر. أدخل عبارة المرور أو مفتاح الاسترجاع لفتحه.',
    confirmText: isExport ? 'تشفير ومتابعة' : 'فتح الملف',
    verify,
  });
}

/** كتلة الإعدادات: تفعيل/تعطيل تشفير الملفات الخارجية (مفتاح التشغيل على هذا الجهاز). */
function buildEncryptionBlock() {
  const wrap = el('div', { style: { marginTop: '14px', padding: '10px', background: '#F6F1E6', borderRadius: '8px' } });

  const draw = () => {
    clear(wrap);
    const info = getFileEncryptionInfo();
    wrap.appendChild(el('div', {
      style: { fontSize: '13px', fontWeight: '600', color: '#123C2F', marginBottom: '4px' },
    }, '🔐 تشفير الملفات الخارجية'));
    wrap.appendChild(el('div', {
      style: { fontSize: '12px', color: '#555', lineHeight: '1.7', marginBottom: '8px' },
    }, 'يشفّر الملفات التي تخرج من الجهاز (مشاركة النسخة عبر واتساب أو درايف، وتنزيل الملفات) بعبارة مرور تختارها. '
      + 'النسخ داخل التطبيق والمزامنة السحابية لا تتأثر. التفعيل لهذا الجهاز فقط. '
      + 'فقدان العبارة ومفتاح الاسترجاع معاً يعني فقدان الملفات المشفّرة نهائياً.'));

    if (info.enabled) {
      wrap.appendChild(el('div', {
        style: { fontSize: '12px', color: '#2E8B6F', marginBottom: '8px' },
      }, '🔒 مفعّل' + (info.enabledAt ? ' منذ ' + formatDate(info.enabledAt) : '')));
      wrap.appendChild(el('button', {
        className: 'btn btn--ghost btn--block', type: 'button', style: { color: '#C62828' },
        onClick: async () => {
          const ok = await modal.confirm({
            title: 'تعطيل التشفير',
            message: 'بعد التعطيل ستخرج الملفات صريحة غير مشفّرة. الملفات المشفّرة السابقة تبقى تُفتح بعبارتك أو بمفتاح الاسترجاع. متابعة؟',
            confirmText: 'متابعة', cancelText: 'إلغاء', danger: true,
          });
          if (!ok) return;
          const done = await askSecret({
            title: 'تأكيد التعطيل',
            message: 'أدخل عبارة المرور (أو مفتاح الاسترجاع) لتأكيد التعطيل.',
            confirmText: 'تعطيل',
            verify: (secret) => disableFileEncryption(secret),
          });
          if (done) { toast.success('تم تعطيل تشفير الملفات'); draw(); }
        },
      }, 'تعطيل التشفير'));
    } else {
      wrap.appendChild(el('button', {
        className: 'btn btn--secondary btn--block', type: 'button',
        onClick: async () => {
          const setup = await askSecret({
            title: '🔐 تفعيل تشفير الملفات',
            message: 'اختر عبارة مرور (8 أحرف على الأقل). لا تُخزَّن في أي مكان ولا يمكن استرجاعها، وستحتاجها لفتح أي ملف مشفّر. '
              + 'وهي ليست الرقم السري للتطبيق.',
            confirm: true, confirmText: 'متابعة',
            verify: (pass) => createFileEncryptionSetup(pass),
          });
          if (!setup) return;
          /* لا يتفعّل شيء حتى يؤكد المستخدم حفظ مفتاح الاسترجاع */
          if (!(await showRecoveryKey(setup.recoveryKey))) return;
          try { setup.commit(); toast.success('تم تفعيل تشفير الملفات'); }
          catch (e) { toast.danger('فشل: ' + describeCryptoError(e)); }
          draw();
        },
      }, 'تفعيل تشفير الملفات'));
    }
  };

  draw();
  return wrap;
}

async function exportAllData() {
  try {
    /* تشفير الملفات مفعّل ⟵ يُطلب السرّ أولاً؛ الإلغاء ⟵ لا تنزيل (لا ملف صريح أبداً) */
    const ctx = await prepareExportEncryptor(askSecretFor);
    if (!ctx) return;
    const stores = [
      'customers', 'orders', 'payments', 'inventory', 'workers', 'expenses',
      'appointments', 'settings', 'portfolio', 'commitments',
      'commitmentPayments', 'savingsGoals', 'houseExpenses',
      'personalLoans', 'loanPayments', 'referrals', 'workerPayments', 'quotes', 'ledger', 'orderMedia',
    ];
    const data = { version: 10, exportedAt: Date.now(), stores: {} };
    for (const s of stores) data.stores[s] = await db.getAll(s);

    const file = await buildBackupFile(JSON.stringify(data, null, 2), 'jalabiya-backup-' + localDateInput() + '.json', ctx.encrypt);
    const blob = new Blob([file.text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    /* الرابط يجب أن يكون في الـ DOM ولا يُلغى فوراً وإلا يفشل التنزيل في Safari/بعض متصفحات الجوال */
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('تم تنزيل النسخة');
  } catch (err) {
    toast.danger('فشل: ' + err.message);
  }
}

async function importAllData(file) {
  const ok = await modal.confirm({
    title: 'استيراد بيانات',
    message: 'سيتم دمج البيانات مع الحالية. متابعة؟',
    confirmText: 'استيراد', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;

  try {
    /* ملف مشفّر ⟵ يُتعرَّف عليه ويُطلب سرّه؛ الإلغاء ⟵ لا استيراد */
    const text = await decryptImportedText(await file.text(), askSecretFor);
    if (text === null) return;
    const data = JSON.parse(text);
    if (!data || !data.stores || typeof data.stores !== 'object') throw new Error('ملف غير صالح');

    /* مخازن مسموحة فقط (نفس قائمة التصدير) — لا نكتب في backups/trash ولا في اسم عشوائي */
    const ALLOWED = [
      'customers', 'orders', 'payments', 'inventory', 'workers', 'expenses',
      'appointments', 'settings', 'portfolio', 'commitments',
      'commitmentPayments', 'savingsGoals', 'houseExpenses',
      'personalLoans', 'loanPayments', 'referrals', 'workerPayments', 'quotes', 'ledger', 'orderMedia',
    ];
    const plan = {};
    let skipped = 0;
    for (const [sn, recs] of Object.entries(data.stores)) {
      if (!ALLOWED.includes(sn) || !Array.isArray(recs)) continue;
      const valid = recs.filter((r) => r && typeof r === 'object' && r.id != null);
      skipped += recs.length - valid.length;
      plan[sn] = { clear: false, records: valid };
    }
    if (Object.keys(plan).length === 0) throw new Error('لا توجد بيانات صالحة في الملف');

    /* نسخة أمان قبل الدمج */
    const safety = await createBackup({ label: 'قبل الاستيراد' });
    if (!safety.ok) throw new Error('تعذّر إنشاء نسخة أمان: ' + (safety.error || ''));

    /* كتابة ذرّية: كلها أو لا شيء */
    const counts = await db.writeBatch(plan);
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    if (skipped > 0) toast.warning('تم تجاهل ' + skipped + ' سجل غير صالح');
    toast.success('تم استيراد ' + total + ' عنصر');
  } catch (err) {
    toast.danger('فشل: ' + err.message);
  }
}
