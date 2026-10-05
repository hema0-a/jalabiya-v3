/* ==========================================================================
   sections-system.js — أقسام النظام (6)
   ==========================================================================
   التنبيهات، المواسم والأعياد، الرسائل التلقائية، النسخ، Sync، ضغط الصور
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS, DEFAULT_OCCASIONS, STORAGE_KEYS } from '../../core/config.js';
import * as authSync from '../../sync/auth-sync.js';
import * as firestoreSync from '../../sync/firestore-sync.js';

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
        onChange: (v) => saveFn({ notifications: { ...n, [key]: v } }),
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
      saveFn({ notifications: { ...n, leadDays: Number(periodSelect.value) } });
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
            padding: '8px 10px', background: '#F6F1E6',
            borderRadius: '8px', opacity: enabled ? '1' : '0.5',
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
              saveFn({ occasions });
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
              saveFn({ occasions });
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
  const existing = isEdit ? occasions[editIdx] : { month: 1, day: 1, alertDays: 14, recurring: true, enabled: true };

  const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'مثال: رمضان', value: existing.name || '' });
  const iconInput = el('input', { className: 'input', type: 'text', placeholder: '🎉', maxLength: 4, value: existing.icon || '🎉' });
  const monthInput = el('input', { className: 'input', type: 'number', min: '1', max: '12', value: String(existing.month) });
  const dayInput = el('input', { className: 'input', type: 'number', min: '1', max: '31', value: String(existing.day) });
  const alertInput = el('input', { className: 'input', type: 'number', min: '1', max: '90', value: String(existing.alertDays) });

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
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
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
          if (isEdit) occasions[editIdx] = { ...occasions[editIdx], ...data };
          else occasions.push({ id: 'occ_' + Date.now(), ...data });
          saveFn({ occasions });
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
  { id: 'new_order',   name: 'طلب جديد',        text: 'شكراً لك {customer}، تم استلام طلبك بقيمة {amount} ج.م.' },
  { id: 'start_work',  name: 'بدء التنفيذ',     text: 'عميلنا العزيز {customer}، بدأنا في تنفيذ طلبك.' },
  { id: 'ready',       name: 'جاهز للتسليم',    text: 'طلبك جاهز للتسليم يا {customer}!' },
  { id: 'thanks',      name: 'شكر بعد التسليم', text: 'شكراً لثقتك بنا {customer}!' },
  { id: 'payment_due', name: 'تذكير بالدفع',    text: 'تذكير ودّي: متبقي عليك {amount} ج.م.' },
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
      onChange: (v) => saveFn({ autoMessages: { ...am, enabled: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تفعيل الرسائل التلقائية'),
      mainToggle,
    ]));

    const templates = am.templates || {};
    AUTO_MESSAGES.forEach((tpl) => {
      const current = templates[tpl.id] || { enabled: true, text: tpl.text };

      const t = createToggle({
        label: '',
        checked: current.enabled !== false,
        onChange: (v) => {
          saveFn({
            autoMessages: {
              ...am,
              templates: { ...templates, [tpl.id]: { ...current, enabled: v } },
            },
          });
        },
      });

      const preview = el('div', {
        style: {
          fontSize: '12px', color: '#666', padding: '8px',
          background: '#F6F1E6', borderRadius: '6px',
          marginTop: '6px', lineHeight: '1.5', whiteSpace: 'pre-wrap',
        },
      }, current.text);

      const editBtn = el('button', {
        className: 'btn btn--sm btn--ghost', type: 'button',
        onClick: () => openTemplateEditor(tpl, current, (newText) => {
          saveFn({
            autoMessages: {
              ...am,
              templates: { ...templates, [tpl.id]: { ...current, text: newText } },
            },
          });
          preview.textContent = newText;
        }),
      }, '✏️ تعديل');

      body.appendChild(el('div', {
        style: {
          padding: '12px', background: '#FFF',
          border: '1px solid #E5DDD0', borderRadius: '8px', marginBottom: '8px',
        },
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } }, [
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

    const autoToggle = createToggle({
      label: 'النسخ التلقائي',
      checked: bk.autoBackup !== false,
      onChange: (v) => saveFn({ backup: { ...bk, autoBackup: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'النسخ التلقائي'),
      autoToggle,
    ]));

    const intervalSelect = el('select', { className: 'select' });
    [
      ['6', 'كل 6 ساعات'], ['12', 'كل 12 ساعة'],
      ['24', 'كل يوم'], ['48', 'كل يومين'], ['168', 'كل أسبوع'],
    ].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (String(bk.intervalHours || 24) === v) o.selected = true;
      intervalSelect.appendChild(o);
    });
    intervalSelect.addEventListener('change', () => {
      saveFn({ backup: { ...bk, intervalHours: Number(intervalSelect.value) } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'فترة النسخ التلقائي'),
      intervalSelect,
    ]));

    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: () => exportAllData(),
    }, '💾 تنزيل نسخة احتياطية (JSON)'));

    const importInput = el('input', { type: 'file', accept: '.json', style: { display: 'none' } });
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      importAllData(file);
      importInput.value = '';
    });
    body.appendChild(el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: () => importInput.click(),
    }, '📂 استيراد من JSON'));
    body.appendChild(importInput);
  },
};

async function exportAllData() {
  try {
    const db = await import('../../data/idb.js');
    const stores = ['customers', 'orders', 'payments', 'inventory', 'workers', 'expenses', 'appointments', 'settings'];
    const data = { version: 3, exportedAt: Date.now(), stores: {} };
    for (const s of stores) data.stores[s] = await db.getAll(s);

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jalabiya-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تنزيل النسخة');
  } catch (err) { toast.danger('فشل: ' + err.message); }
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
    if (!data || !data.stores) throw new Error('ملف غير صالح');
    const db = await import('../../data/idb.js');
    let total = 0;
    for (const [sn, recs] of Object.entries(data.stores)) {
      if (!Array.isArray(recs)) continue;
      for (const r of recs) { await db.put(sn, r); total++; }
    }
    toast.success('تم استيراد ' + total + ' عنصر');
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

/* ==========================================================================
   5. المزامنة السحابية
   ========================================================================== */
const cloudSyncSection = {
  id: 'cloud-sync',
  icon: '☁️',
  title: 'المزامنة السحابية',
  async render(body, currentSettings, saveFn) {
    const redraw = async () => {
      clear(body);
      await cloudSyncSection.render(body, currentSettings, saveFn);
    };

    if (!authSync.isConfigured()) {
      body.appendChild(el('div', {
        style: {
          padding: '12px', background: '#FFF3E0', borderRadius: '8px',
          fontSize: '13px', color: '#F57C00', lineHeight: '1.6',
        },
      }, '⚠️ Firebase غير مُهيّأ. أضف إعدادات Firebase في config.js لتفعيل المزامنة.'));
      return;
    }

    const isOnline = navigator.onLine;
    body.appendChild(el('div', {
      style: {
        padding: '10px', borderRadius: '8px', marginBottom: '12px',
        fontSize: '13px', fontWeight: '500',
        background: isOnline ? '#E8F5E9' : '#FFEBEE',
        color: isOnline ? '#2E7D32' : '#C62828',
      },
    }, isOnline ? '🟢 متصل بالإنترنت' : '🔴 غير متصل'));

    const user = await authSync.current();

    if (!user) {
      const emailInput = el('input', { className: 'input', type: 'email', placeholder: 'example@mail.com' });
      const passInput = el('input', { className: 'input', type: 'password', placeholder: '••••••••' });

      const loginBtn = el('button', {
        className: 'btn btn--primary btn--block', type: 'button',
        onClick: async () => {
          loginBtn.disabled = true;
          loginBtn.textContent = '⏳ جارٍ الدخول...';
          const res = await authSync.login(emailInput.value.trim(), passInput.value);
          if (res.ok) { toast.success('تم تسجيل الدخول'); await redraw(); }
          else {
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

    body.appendChild(el('div', {
      style: {
        padding: '12px', background: '#E8F5E9', borderRadius: '8px',
        marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px',
      },
    }, [
      el('div', { style: { fontSize: '24px' } }, '✅'),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontWeight: '600', color: '#2E7D32', fontSize: '14px' } }, 'مسجل الدخول'),
        el('div', { style: { fontSize: '12px', color: '#666' } }, user.email || user.uid || ''),
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
        const res = await firestoreSync.push(user.uid);
        if (res.ok) {
          localStorage.setItem(STORAGE_KEYS.V3_LAST_SYNC, String(Date.now()));
          toast.success('تم رفع البيانات');
          await redraw();
        } else {
          toast.danger(res.error || 'فشل الرفع');
          pushBtn.disabled = false;
          pushBtn.textContent = '⬆️ رفع إلى السحابة';
        }
      },
    }, '⬆️ رفع إلى السحابة');

    const pullBtn = el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      style: { marginBottom: '8px' },
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'تنزيل من السحابة',
          message: 'سيتم استبدال البيانات المحلية بالبيانات السحابية. متابعة؟',
          confirmText: 'تنزيل', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        pullBtn.disabled = true;
        pullBtn.textContent = '⏳ جارٍ التنزيل...';
        const res = await firestoreSync.pull(user.uid);
        if (!res.ok) {
          toast.danger(res.error || 'فشل التنزيل');
          pullBtn.disabled = false;
          pullBtn.textContent = '⬇️ تنزيل من السحابة';
          return;
        }
        if (!res.data) {
          toast.warning('لا توجد بيانات سحابية بعد');
          pullBtn.disabled = false;
          pullBtn.textContent = '⬇️ تنزيل من السحابة';
          return;
        }
        const applyRes = await firestoreSync.apply(res.data);
        if (applyRes.ok) {
          localStorage.setItem(STORAGE_KEYS.V3_LAST_SYNC, String(Date.now()));
          toast.success('تم التنزيل — جارٍ إعادة التحميل...');
          setTimeout(() => location.reload(), 1500);
        } else {
          toast.danger(applyRes.error || 'فشل التطبيق');
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
        await redraw();
      },
    }, '🚪 تسجيل الخروج');

    body.appendChild(pushBtn);
    body.appendChild(pullBtn);
    body.appendChild(logoutBtn);
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
        saveFn({ imageCompression: { ...ic, [key]: val } });
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
