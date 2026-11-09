/* ==========================================================================
   section-backup-io.js — مساعدات قسم النسخ: نافذة السرّ، كتلة التشفير، تصدير/استيراد JSON (v3.5.41: مفصول عن section-backup.js دون تغيير سلوك)
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { formatDate, localDateInput } from '../../core/utils.js';
import * as db from '../../data/idb.js';
import { createBackup, buildBackupFile } from '../../services/auto-backup.js';
import { askSecret, showRecoveryKey } from '../../ui/secret-dialog.js';
import {
  getFileEncryptionInfo,
  createFileEncryptionSetup,
  disableFileEncryption,
  prepareExportEncryptor,
  decryptImportedText,
  describeCryptoError,
} from '../../services/backup-crypto.js';

/** نافذة السرّ حسب الغرض (تصدير/استيراد) — تُمرَّر كـask لدوال backup-crypto. */
export function askSecretFor({ purpose, verify }) {
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
export function buildEncryptionBlock() {
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

export async function exportAllData() {
  try {
    /* تشفير الملفات مفعّل ⟵ يُطلب السرّ أولاً؛ الإلغاء ⟵ لا تنزيل (لا ملف صريح أبداً) */
    const ctx = await prepareExportEncryptor(askSecretFor);
    if (!ctx) return;
    const stores = [
      'customers', 'orders', 'payments', 'inventory', 'workers', 'expenses',
      'appointments', 'settings', 'portfolio', 'commitments',
      'commitmentPayments', 'savingsGoals', 'houseExpenses',
      'personalLoans', 'loanPayments', 'referrals', 'workerPayments', 'quotes', 'ledger', 'orderMedia', 'suppliers', 'supplierEntries', 'aftercare', 'attendance', 'circles', 'documents', 'todos',
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

export async function importAllData(file) {
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
      'personalLoans', 'loanPayments', 'referrals', 'workerPayments', 'quotes', 'ledger', 'orderMedia', 'suppliers', 'supplierEntries', 'aftercare', 'attendance', 'circles', 'documents', 'todos',
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
