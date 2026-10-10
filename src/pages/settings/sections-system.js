/* ==========================================================================
   sections-system.js — أقسام النظام (6)
   ==========================================================================
   التنبيهات، المواسم والأعياد، الرسائل التلقائية، النسخ، Sync، ضغط الصور

   ⚠️ v3.3.1:
   - لا spread للمفاتيح القديمة (`...n`, `...am`, `...bk`, `...ic`).
   - الحفظ بحقل واحد فقط — `settings.update` يدمج مع DB الحيّ.

   ⚠️ v3.3.2 (إصلاح المزامنة):
   - استبدال `authSync.current()` بـ `authSync.onAuthChange()`.
   - السبب: `current()` قد يُعيد null قبل استعادة Firebase للجلسة.
   - النتيجة: جلسة المزامنة تبقى محفوظة عند التنقل.
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS, DEFAULT_OCCASIONS, STORAGE_KEYS } from '../../core/config.js';
import { formatDate, formatEGP, localDateInput } from '../../core/utils.js';
import * as authSync from '../../sync/auth-sync.js';
import { pushFlow, pullFlow } from '../../sync/sync-flow.js';
import {
  createBackup, listBackups, restoreBackup, deleteBackup,
  clearAllBackups, exportBackupToFile,
} from '../../services/auto-backup.js';

/* ==========================================================================
   1. التنبيهات
   ========================================================================== */

const notificationsSection = {
  id: 'notifications',
  icon: '🔔',
  title: 'التنبيهات',
  async render(body, currentSettings, saveFn) {
    const n = currentSettings.notifications || DEFAULT_SETTINGS.notifications;

    function toggleRow(key, label, hint = '') {
      const t = createToggle({
        label,
        checked: n[key] !== false,
        onChange: (v) => {
          saveFn({ notifications: { [key]: v } });
        },
      });
      return el('div', { className: 'settings-row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { className: 'settings-row__label' }, label),
          hint ? el('div', { className: 'settings-row__hint' }, hint) : null,
        ]),
        t,
      ]);
    }

    body.appendChild(toggleRow('seasons', 'تنبيهات المواسم والأعياد', 'مع اقتراب المناسبات'));
    body.appendChild(toggleRow('appointments', 'تنبيهات المواعيد', 'قبل الموعد بـ N يوم'));
    body.appendChild(toggleRow('inventory', 'تنبيهات المخزون', 'عند نقص الكمية'));
    body.appendChild(toggleRow('debts', 'تنبيهات المديونيات', 'العملاء بأرصدة معلقة'));

    const periodSelect = el('select', { className: 'select' });
    [['1', 'يوم'], ['2', 'يومان'], ['7', 'أسبوع']].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (String(n.leadDays || 2) === v) o.selected = true;
      periodSelect.appendChild(o);
    });
    periodSelect.addEventListener('change', () => {
      saveFn({ notifications: { leadDays: Number(periodSelect.value) } });
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'فترة التنبيه المسبق'),
      periodSelect,
    ]));
  },
};

/* ==========================================================================
   2. المواسم والأعياد
   ========================================================================== */

const occasionsSection = {
  id: 'occasions',
  icon: '🎉',
  title: 'المواسم والأعياد',
  async render(body, currentSettings, saveFn) {
    const occasions = currentSettings.occasions || [...DEFAULT_OCCASIONS];
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    function rebuild() {
      clear(list);
      if (occasions.length === 0) {
        list.appendChild(el('div', {
          style: { fontSize: '13px', color: '#2E8B6F', textAlign: 'center', padding: '12px' },
        }, 'لا توجد مناسبات — أضف مناسبة جديدة'));
        return;
      }
      occasions.forEach((o, idx) => {
        const enabled = o.enabled !== false;
        list.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', background: '#F6F1E6', borderRadius: '8px',
            opacity: enabled ? '1' : '0.5',
          },
        }, [
          el('span', { style: { fontSize: '20px' } }, o.icon || '🎉'),
          el('div', { style: { flex: '1' } }, [
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, o.name),
            el('div', { style: { fontSize: '11px', color: '#666' } },
              'الشهر ' + o.month + ' — اليوم ' + o.day + ' — تنبيه قبل ' + o.alertDays + ' يوم'),
          ]),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => {
              occasions[idx].enabled = !enabled;
              saveFn({ occasions: [...occasions] });
              rebuild();
            },
          }, enabled ? '✅' : '⬜'),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => openOccasionForm(occasions, idx, saveFn, rebuild),
          }, '✏️'),
          el('button', {
            className: 'btn btn--sm btn--danger', type: 'button',
            onClick: () => {
              occasions.splice(idx, 1);
              saveFn({ occasions: [...occasions] });
              rebuild();
            },
          }, '🗑️'),
        ]));
      });
    }

    body.appendChild(list);
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: () => openOccasionForm(occasions, -1, saveFn, rebuild),
    }, '➕ إضافة مناسبة جديدة'));
    rebuild();
  },
};

function openOccasionForm(occasions, editIdx, saveFn, rebuild) {
  const isEdit = editIdx >= 0;
  const existing = isEdit ? occasions[editIdx] : {
    month: 1, day: 1, alertDays: 14, recurring: true, enabled: true,
  };

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: رمضان',
    value: existing.name || '',
  });
  const iconInput = el('input', {
    className: 'input', type: 'text', placeholder: '🎉', maxLength: 4,
    value: existing.icon || '🎉',
  });
  const monthInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '12',
    value: String(existing.month),
  });
  const dayInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '31',
    value: String(existing.day),
  });
  const alertInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '90',
    value: String(existing.alertDays),
  });

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم المناسبة *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الأيقونة'), iconInput]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الشهر (1-12)'), monthInput]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اليوم (1-31)'), dayInput]),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التنبيه قبل (أيام)'), alertInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل مناسبة' : 'إضافة مناسبة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = {
            name,
            icon: iconInput.value.trim() || '🎉',
            month: Math.max(1, Math.min(12, Number(monthInput.value) || 1)),
            day: Math.max(1, Math.min(31, Number(dayInput.value) || 1)),
            alertDays: Math.max(1, Math.min(90, Number(alertInput.value) || 14)),
            recurring: true,
            enabled: isEdit ? (occasions[editIdx].enabled !== false) : true,
          };
          if (isEdit) {
            occasions[editIdx] = { ...occasions[editIdx], ...data };
          } else {
            occasions.push({ id: 'occ_' + Date.now(), ...data });
          }
          saveFn({ occasions: [...occasions] });
          handle.close();
          rebuild();
        },
      },
    ],
  });
}

/* ==========================================================================
   3. الرسائل التلقائية
   ========================================================================== */

const AUTO_MESSAGES = [
  { id: 'new_order', name: 'طلب جديد', text: 'شكراً لك {customer}، تم استلام طلبك بقيمة {amount} ج.م.' },
  { id: 'start_work', name: 'بدء التنفيذ', text: 'عميلنا العزيز {customer}، بدأنا في تنفيذ طلبك.' },
  { id: 'ready', name: 'جاهز للتسليم', text: 'طلبك جاهز للتسليم يا {customer}!' },
  { id: 'thanks', name: 'شكر بعد التسليم', text: 'شكراً لثقتك بنا {customer}!' },
  { id: 'payment_due', name: 'تذكير بالدفع', text: 'تذكير ودّي: متبقي عليك {amount} ج.م.' },
];

const autoMessagesSection = {
  id: 'auto-messages',
  icon: '💬',
  title: 'الرسائل التلقائية',
  async render(body, currentSettings, saveFn) {
    const am = currentSettings.autoMessages || { enabled: true, templates: {} };

    const mainToggle = createToggle({
      label: 'تفعيل الرسائل التلقائية',
      checked: am.enabled !== false,
      onChange: (v) => {
        saveFn({ autoMessages: { enabled: v } });
      },
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تفعيل الرسائل التلقائية'),
      mainToggle,
    ]));

    const templates = am.templates || {};

    AUTO_MESSAGES.forEach((tpl) => {
      const current = templates[tpl.id] || { enabled: true, text: tpl.text };

      const t = createToggle({
        label: '', checked: current.enabled !== false,
        onChange: (v) => {
          saveFn({
            autoMessages: {
              templates: {
                ...templates,
                [tpl.id]: { ...current, enabled: v },
              },
            },
          });
        },
      });

      const preview = el('div', {
        style: {
          fontSize: '12px', color: '#666', padding: '8px',
          background: '#F6F1E6', borderRadius: '6px', marginTop: '6px',
          lineHeight: '1.5', whiteSpace: 'pre-wrap',
        },
      }, current.text);

      const editBtn = el('button', {
        className: 'btn btn--sm btn--ghost', type: 'button',
        onClick: () => openTemplateEditor(tpl, current, (newText) => {
          saveFn({
            autoMessages: {
              templates: {
                ...templates,
                [tpl.id]: { ...current, text: newText },
              },
            },
          });
          preview.textContent = newText;
        }),
      }, '✏️ تعديل');

      body.appendChild(el('div', {
        style: {
          padding: '12px', background: '#FFF',
          border: '1px solid #E5DDD0', borderRadius: '8px',
          marginBottom: '8px',
        },
      }, [
        el('div', {
          style: {
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '4px',
          },
        }, [
          el('span', { style: { fontWeight: '500', fontSize: '14px' } }, tpl.name),
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [t, editBtn]),
        ]),
        preview,
      ]));
    });

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6',
      },
    }, '💡 المتغيرات: {customer} {amount} {phone}'));
  },
};

function openTemplateEditor(tpl, current, onSave) {
  const textarea = el('textarea', { className: 'textarea' });
  textarea.value = current.text;
  textarea.style.minHeight = '120px';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'نص القالب'),
      textarea,
    ]),
  ]);

  const handle = modal.open({
    title: 'تعديل: ' + tpl.name,
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: () => {
          const txt = textarea.value.trim();
          if (!txt) return toast.warning('النص مطلوب');
          onSave(txt);
          handle.close();
          toast.success('تم الحفظ');
        },
      },
    ],
  });
}

/* ==========================================================================
   4. النسخ الاحتياطي
   ========================================================================== */

const backupSection = {
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
            const ok = await exportBackupToFile(b.id);
            if (ok) toast.success('تم التحميل');
            else toast.danger('فشل التحميل');
          },
        }, '⬇️'));

        row.appendChild(el('button', {
          className: 'btn btn--sm btn--secondary', type: 'button', title: 'استرجاع',
          onClick: async () => {
            const ok = await modal.confirm({
              title: 'استرجاع نسخة احتياطية',
              message: '⚠️ سيتم استبدال كل البيانات الحالية ببيانات هذه النسخة. لا يمكن التراجع!',
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

async function exportAllData() {
  try {
    const db = await import('../../data/idb.js');
    const stores = [
      'customers', 'orders', 'payments', 'inventory', 'workers', 'expenses',
      'appointments', 'settings', 'portfolio', 'commitments',
      'commitmentPayments', 'savingsGoals', 'houseExpenses',
      'personalLoans', 'loanPayments', 'referrals', 'workerPayments',
    ];
    const data = { version: 9, exportedAt: Date.now(), stores: {} };
    for (const s of stores) data.stores[s] = await db.getAll(s);

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jalabiya-backup-' + localDateInput() + '.json';
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
    const data = JSON.parse(await file.text());
    if (!data || !data.stores || typeof data.stores !== 'object') throw new Error('ملف غير صالح');
    const db = await import('../../data/idb.js');

    /* مخازن مسموحة فقط (نفس قائمة التصدير) — لا نكتب في backups/trash ولا في اسم عشوائي */
    const ALLOWED = [
      'customers', 'orders', 'payments', 'inventory', 'workers', 'expenses',
      'appointments', 'settings', 'portfolio', 'commitments',
      'commitmentPayments', 'savingsGoals', 'houseExpenses',
      'personalLoans', 'loanPayments', 'referrals', 'workerPayments',
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

/* ==========================================================================
   5. المزامنة السحابية (v3.3.2 — إصلاح الجلسة)
   ========================================================================== */

const cloudSyncSection = {
  id: 'cloud-sync',
  icon: '☁️',
  title: 'المزامنة السحابية',
  async render(body, currentSettings, saveFn) {
    /* --- متغير محلي لحالة المستخدم (يُحدَّث تلقائياً) --- */
    let currentUser = null;
    let unsubAuth = null;
    let destroyed = false;

    /**
     * رسم الواجهة بناءً على currentUser.
     */
    const draw = () => {
      if (destroyed) return;
      clear(body);

      /* Firebase غير مُهيّأ */
      if (!authSync.isConfigured()) {
        body.appendChild(el('div', {
          style: {
            padding: '12px', background: '#FFF3E0', borderRadius: '8px',
            fontSize: '13px', color: '#F57C00', lineHeight: '1.6',
          },
        }, '⚠️ Firebase غير مُهيّأ. أضف إعدادات Firebase في config.js لتفعيل المزامنة.'));
        return;
      }

      /* حالة الاتصال */
      const isOnline = navigator.onLine;
      body.appendChild(el('div', {
        style: {
          padding: '10px', borderRadius: '8px', marginBottom: '12px',
          fontSize: '13px', fontWeight: '500',
          background: isOnline ? '#E8F5E9' : '#FFEBEE',
          color: isOnline ? '#2E7D32' : '#C62828',
        },
      }, isOnline ? '🟢 متصل بالإنترنت' : '🔴 غير متصل'));

      /* حالة التحميل (في انتظار Firebase) */
      if (currentUser === undefined) {
        body.appendChild(el('div', {
          style: {
            padding: '20px', textAlign: 'center',
            color: '#2E8B6F', fontSize: '13px',
          },
        }, '⏳ جارٍ التحقق من الجلسة...'));
        return;
      }

      /* غير مسجل الدخول */
      if (!currentUser) {
        const emailInput = el('input', {
          className: 'input', type: 'email', placeholder: 'example@mail.com',
        });
        const passInput = el('input', {
          className: 'input', type: 'password', placeholder: '••••••••',
        });
        const loginBtn = el('button', {
          className: 'btn btn--primary btn--block', type: 'button',
          onClick: async () => {
            loginBtn.disabled = true;
            loginBtn.textContent = '⏳ جارٍ الدخول...';
            const res = await authSync.login(emailInput.value.trim(), passInput.value);
            if (res.ok) {
              toast.success('تم تسجيل الدخول');
              /* onAuthChange سيُحدّث currentUser تلقائياً ويستدعي draw() */
            } else {
              toast.danger(res.error || 'فشل الدخول');
              loginBtn.disabled = false;
              loginBtn.textContent = '🔓 تسجيل الدخول';
            }
          },
        }, '🔓 تسجيل الدخول');

        body.appendChild(el('div', { className: 'settings-field' }, [
          el('label', { className: 'settings-field__label' }, 'البريد الإلكتروني'),
          emailInput,
        ]));
        body.appendChild(el('div', { className: 'settings-field' }, [
          el('label', { className: 'settings-field__label' }, 'كلمة المرور'),
          passInput,
        ]));
        body.appendChild(loginBtn);
        return;
      }

      /* مسجل الدخول */
      body.appendChild(el('div', {
        style: {
          padding: '12px', background: '#E8F5E9', borderRadius: '8px',
          marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px',
        },
      }, [
        el('div', { style: { fontSize: '24px' } }, '✅'),
        el('div', { style: { flex: '1' } }, [
          el('div', { style: { fontWeight: '600', color: '#2E7D32', fontSize: '14px' } }, 'مسجل الدخول'),
          el('div', { style: { fontSize: '12px', color: '#666' } }, currentUser.email || currentUser.uid || ''),
        ]),
      ]));

      const lastSync = localStorage.getItem(STORAGE_KEYS.V3_LAST_SYNC);
      body.appendChild(el('div', {
        style: {
          padding: '10px', background: '#F6F1E6', borderRadius: '8px',
          marginBottom: '12px', fontSize: '12px', color: '#123C2F',
        },
      }, lastSync
        ? '🕐 آخر مزامنة: ' + new Date(Number(lastSync)).toLocaleString('ar-EG')
        : '⚠️ لم تتم المزامنة بعد'));

      const pushBtn = el('button', {
        className: 'btn btn--primary btn--block', type: 'button',
        style: { marginBottom: '8px' },
        onClick: async () => {
          pushBtn.disabled = true;
          pushBtn.textContent = '⏳ جارٍ الرفع...';
          /* المسار الآمن: يحمي السحابة من الاستبدال ويعرض خيار الدمج عند التعارض */
          const res = await pushFlow(currentUser.uid);
          if (res.ok) {
            draw();
          } else {
            pushBtn.disabled = false;
            pushBtn.textContent = '⬆️ رفع إلى السحابة';
          }
        },
      }, '⬆️ رفع إلى السحابة');

      const pullBtn = el('button', {
        className: 'btn btn--secondary btn--block', type: 'button',
        style: { marginBottom: '8px' },
        onClick: async () => {
          pullBtn.disabled = true;
          pullBtn.textContent = '⏳ جارٍ التنزيل...';
          /* المسار الآمن: دمج أو استبدال بقرارك + نسخة أمان قبل أي تغيير */
          const res = await pullFlow(currentUser.uid);
          if (res.ok) {
            setTimeout(() => location.reload(), 1500);
          } else {
            pullBtn.disabled = false;
            pullBtn.textContent = '⬇️ تنزيل من السحابة';
          }
        },
      }, '⬇️ تنزيل من السحابة');

      const logoutBtn = el('button', {
        className: 'btn btn--danger btn--block', type: 'button',
        onClick: async () => {
          await authSync.logout();
          toast.info('تم تسجيل الخروج');
          /* onAuthChange سيُحدّث currentUser تلقائياً */
        },
      }, '🚪 تسجيل الخروج');

      body.appendChild(pushBtn);
      body.appendChild(pullBtn);
      body.appendChild(logoutBtn);
    };

    /* --- رسم أولي (بحالة "تحقق من الجلسة") --- */
    currentUser = undefined;
    draw();

    /* --- استماع تلقائي لحالة المصادقة (v3.3.2) --- */
    unsubAuth = authSync.onAuthChange((user) => {
      if (destroyed) return;
      currentUser = user || null;
      draw();
    });

    /* --- الاستماع لتغير حالة الاتصال --- */
    const onOnline = () => { if (!destroyed) draw(); };
    const onOffline = () => { if (!destroyed) draw(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    /* --- تسجيل دالة تنظيف على body (يُستدعى عند إعادة رسم القسم) --- */
    const cleanup = () => {
      if (destroyed) return;
      destroyed = true;
      try { if (unsubAuth) unsubAuth(); } catch (e) { /* ignore */ }
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };

    /* --- مراقبة إزالة body من DOM لتنظيف المستمعين --- */
    const observer = new MutationObserver(() => {
      if (!document.contains(body)) {
        observer.disconnect();
        cleanup();
      }
    });
    try {
      observer.observe(body.parentNode || document.body, { childList: true, subtree: true });
    } catch (e) {
      /* fail silently */
    }
  },
};

/* ==========================================================================
   6. ضغط الصور
   ========================================================================== */

const imageCompressionSection = {
  id: 'image-compression',
  icon: '🖼️',
  title: 'ضغط الصور',
  async render(body, currentSettings, saveFn) {
    const ic = currentSettings.imageCompression || DEFAULT_SETTINGS.imageCompression;

    function selectField(label, key, options, currentValue) {
      const sel = el('select', { className: 'select' });
      options.forEach(([v, l]) => {
        const o = el('option', { value: String(v) }, l);
        if (String(currentValue) === String(v)) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        const val = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
        saveFn({ imageCompression: { [key]: val } });
      });
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label),
        sel,
      ]);
    }

    body.appendChild(selectField('الجودة', 'quality', [
      ['0.60', '60%'], ['0.75', '75%'], ['0.85', '85%'], ['0.95', '95%'],
    ], ic.quality));

    body.appendChild(selectField('الحجم الأقصى', 'maxSizeKB', [
      [200, '200 KB'], [500, '500 KB'], [800, '800 KB'], [1500, '1.5 MB'],
    ], ic.maxSizeKB));

    body.appendChild(selectField('الأبعاد القصوى', 'maxDimensionPx', [
      [800, '800 px'], [1200, '1200 px'], [1600, '1600 px'], [2000, '2000 px'],
    ], ic.maxDimensionPx));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6',
      },
    }, '📊 التوفير المتوقع: ~' + Math.round((1 - (ic.quality || 0.85)) * 100) + '%'));
  },
};

/* --- تصدير --- */
export const SYSTEM_SECTIONS = [
  notificationsSection,
  occasionsSection,
  autoMessagesSection,
  backupSection,
  cloudSyncSection,
  imageCompressionSection,
];
