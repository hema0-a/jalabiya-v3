/* ==========================================================================
   sections-system.js — أقسام: التنبيهات، الرسائل، النسخ، المزامنة، ضغط الصور
   ========================================================================== */

import { el } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../core/config.js';

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

    /* فترة التنبيه */
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
   2. الرسائل التلقائية
   ========================================================================== */
const AUTO_MESSAGES = [
  { id: 'new_order',   name: 'طلب جديد',        text: 'شكراً لك {customer}، تم استلام طلبك بقيمة {amount} ج.م وسنبدأ التنفيذ قريباً.' },
  { id: 'start_work',  name: 'بدء التنفيذ',     text: 'عميلنا العزيز {customer}، بدأنا في تنفيذ طلبك. سنعلمك حين يكون جاهزاً.' },
  { id: 'ready',       name: 'جاهز للتسليم',    text: 'طلبك جاهز للتسليم يا {customer}! يمكنك المرور في أي وقت.' },
  { id: 'thanks',      name: 'شكر بعد التسليم', text: 'شكراً لثقتك بنا {customer}! نتشرف بخدمتك دائماً.' },
  { id: 'payment_due', name: 'تذكير بالدفع',    text: 'تذكير ودّي: متبقي عليك {amount} ج.م. شكراً لتعاونك.' },
];

const autoMessagesSection = {
  id: 'auto-messages',
  icon: '💬',
  title: 'الرسائل التلقائية',
  async render(body, currentSettings, saveFn) {
    const am = currentSettings.autoMessages || { enabled: true, templates: {} };

    /* Toggle رئيسي */
    const mainToggle = createToggle({
      label: 'تفعيل الرسائل التلقائية',
      checked: am.enabled !== false,
      onChange: (v) => saveFn({ autoMessages: { ...am, enabled: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تفعيل الرسائل التلقائية'),
      mainToggle,
    ]));

    /* القوالب */
    const templates = am.templates || {};
    AUTO_MESSAGES.forEach((tpl) => {
      const current = templates[tpl.id] || { enabled: true, text: tpl.text };

      /* Toggle القالب */
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

      /* معاينة */
      const preview = el('div', {
        style: {
          fontSize: '12px',
          color: '#666',
          padding: '8px',
          background: '#F6F1E6',
          borderRadius: '6px',
          marginTop: '6px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
        },
      }, current.text);

      /* زر تعديل */
      const editBtn = el('button', {
        className: 'btn btn--sm btn--ghost',
        type: 'button',
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
          padding: '12px',
          background: '#FFF',
          border: '1px solid #E5DDD0',
          borderRadius: '8px',
          marginBottom: '8px',
        },
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } }, [
          el('span', { style: { fontWeight: '500', fontSize: '14px' } }, tpl.name),
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [t, editBtn]),
        ]),
        preview,
      ]));
    });

    /* تلميح المتغيرات */
    body.appendChild(el('div', {
      style: {
        fontSize: '12px',
        color: '#2E8B6F',
        padding: '10px',
        background: '#F1F8E9',
        borderRadius: '8px',
        lineHeight: '1.6',
      },
    }, '💡 المتغيرات المتاحة: {customer} (اسم العميل)، {amount} (المبلغ)، {phone} (الهاتف)'));
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
    el('div', {
      style: { fontSize: '12px', color: '#2E8B6F', marginTop: '8px' },
    }, '💡 {customer} — {amount} — {phone}'),
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
   3. النسخ الاحتياطي
   ========================================================================== */
const backupSection = {
  id: 'backup',
  icon: '💾',
  title: 'النسخ الاحتياطي',
  async render(body, currentSettings, saveFn) {
    const bk = currentSettings.backup || DEFAULT_SETTINGS.backup;

    /* Toggle تلقائي */
    const autoToggle = createToggle({
      label: 'النسخ التلقائي',
      checked: bk.autoBackup !== false,
      onChange: (v) => saveFn({ backup: { ...bk, autoBackup: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'النسخ التلقائي'),
      autoToggle,
    ]));

    /* الفترة */
    const intervalSelect = el('select', { className: 'select' });
    [
      ['6',   'كل 6 ساعات'],
      ['12',  'كل 12 ساعة'],
      ['24',  'كل يوم'],
      ['48',  'كل يومين'],
      ['168', 'كل أسبوع'],
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

    /* زر نسخة يدوية الآن */
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      type: 'button',
      style: { marginTop: '8px' },
      onClick: () => exportAllData(),
    }, '💾 تنزيل نسخة احتياطية الآن (JSON)'));

    /* زر استيراد */
    const importInput = el('input', { type: 'file', accept: '.json', style: { display: 'none' } });
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      importAllData(file);
      importInput.value = '';
    });
    body.appendChild(el('button', {
      className: 'btn btn--secondary btn--block',
      type: 'button',
      style: { marginTop: '8px' },
      onClick: () => importInput.click(),
    }, '📂 استيراد من ملف JSON'));
    body.appendChild(importInput);
  },
};

async function exportAllData() {
  try {
    const db = await import('../../data/idb.js');
    const stores = ['customers', 'orders', 'payments', 'inventory', 'workers', 'expenses', 'appointments', 'settings'];
    const data = { version: 3, exportedAt: Date.now(), stores: {} };

    for (const s of stores) {
      data.stores[s] = await db.getAll(s);
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jalabiya-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تنزيل النسخة');
  } catch (err) {
    toast.danger('فشل: ' + err.message);
  }
}

async function importAllData(file) {
  const ok = await modal.confirm({
    title: 'استيراد بيانات',
    message: 'سيتم دمج البيانات مع الحالية. متابعة؟',
    confirmText: 'استيراد',
    cancelText: 'إلغاء',
    danger: true,
  });
  if (!ok) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !data.stores) throw new Error('ملف غير صالح');

    const db = await import('../../data/idb.js');
    let totalImported = 0;
    for (const [storeName, records] of Object.entries(data.stores)) {
      if (!Array.isArray(records)) continue;
      for (const rec of records) {
        await db.put(storeName, rec);
        totalImported++;
      }
    }
    toast.success('تم استيراد ' + totalImported + ' عنصر');
  } catch (err) {
    toast.danger('فشل الاستيراد: ' + err.message);
  }
}

/* ==========================================================================
   4. المزامنة السحابية
   ========================================================================== */
const cloudSyncSection = {
  id: 'cloud-sync',
  icon: '☁️',
  title: 'المزامنة السحابية',
  async render(body, currentSettings, saveFn) {
    const isOnline = navigator.onLine;

    /* حالة الاتصال */
    body.appendChild(el('div', {
      style: {
        padding: '12px',
        background: isOnline ? '#E8F5E9' : '#FFEBEE',
        borderRadius: '8px',
        marginBottom: '12px',
        fontSize: '13px',
        color: isOnline ? '#2E7D32' : '#C62828',
        fontWeight: '500',
      },
    }, isOnline ? '🟢 متصل بالإنترنت' : '🔴 غير متصل'));

    /* حالة تسجيل الدخول — من localStorage */
    const lastSync = localStorage.getItem(STORAGE_KEYS.V3_LAST_SYNC);
    body.appendChild(el('div', {
      style: {
        padding: '12px',
        background: '#F6F1E6',
        borderRadius: '8px',
        marginBottom: '12px',
        fontSize: '13px',
        color: '#123C2F',
      },
    }, lastSync ? '🕐 آخر مزامنة: ' + new Date(Number(lastSync)).toLocaleString('ar-EG') : '⚠️ لم تتم المزامنة بعد'));

    /* زر مزامنة الآن */
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      type: 'button',
      onClick: () => toast.info('Firebase Sync — المرحلة 9'),
    }, '🔄 مزامنة الآن'));

    /* تلميح */
    body.appendChild(el('div', {
      style: {
        fontSize: '12px',
        color: '#666',
        textAlign: 'center',
        marginTop: '12px',
        lineHeight: '1.6',
      },
    }, '☁️ سيتم تفعيل Firebase Sync في المرحلة 9'));
  },
};

/* ==========================================================================
   5. ضغط الصور
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
      ['0.60', '60%'],
      ['0.75', '75%'],
      ['0.85', '85%'],
      ['0.95', '95%'],
    ], ic.quality));

    body.appendChild(selectField('الحجم الأقصى', 'maxSizeKB', [
      [200, '200 KB'],
      [500, '500 KB'],
      [800, '800 KB'],
      [1500, '1.5 MB'],
    ], ic.maxSizeKB));

    body.appendChild(selectField('الأبعاد القصوى', 'maxDimensionPx', [
      [800, '800 px'],
      [1200, '1200 px'],
      [1600, '1600 px'],
      [2000, '2000 px'],
    ], ic.maxDimensionPx));

    /* معاينة القيم */
    body.appendChild(el('div', {
      style: {
        fontSize: '12px',
        color: '#2E8B6F',
        padding: '10px',
        background: '#F1F8E9',
        borderRadius: '8px',
        lineHeight: '1.6',
      },
    }, '📊 التوفير المتوقع: ~' + Math.round((1 - (ic.quality || 0.85)) * 100) + '% من الحجم الأصلي'));
  },
};

/* --- تصدير --- */
export const SYSTEM_SECTIONS = [
  notificationsSection,
  autoMessagesSection,
  backupSection,
  cloudSyncSection,
  imageCompressionSection,
];
