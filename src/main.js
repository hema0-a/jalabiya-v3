/* ==========================================================================
   main.js — نقطة الدخول + Demo UI (المرحلة 5)
   ==========================================================================
   ✅ Dynamic imports — لا تُعلّق شاشة التحميل إن فشل أي ملف.
   ✅ يعرض أي خطأ على الشاشة مباشرة (بدل صمت مطبق).
   ========================================================================== */

/* --- إظهار التطبيق فوراً (حتى لو فشل أي استيراد) --- */
const loading = document.getElementById('app-loading');
const app = document.getElementById('app');
if (loading) loading.hidden = true;
if (app) app.hidden = false;

/* --- عرض خطأ على الشاشة --- */
function showError(title, err) {
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : '';
  if (!app) return;
  app.innerHTML = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:16px;margin:0;font-family:monospace;direction:ltr;text-align:left;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#2a0000;color:#ff8080;min-height:100vh;box-sizing:border-box';
  pre.textContent = '❌ ' + title + '\n\n' + msg + '\n\n' + stack;
  app.appendChild(pre);
}

/* --- استيراد الأدوات --- */
let el, toast;
try {
  ({ el } = await import('./core/dom.js'));
} catch (e) {
  showError('Failed to load core/dom.js', e);
  throw e;
}
try {
  ({ toast } = await import('./ui/toast.js'));
} catch (e) {
  showError('Failed to load ui/toast.js', e);
  throw e;
}

/* --- بناء الـ Demo UI --- */
function buildDemo() {
  if (!app) return;

  /* Header */
  const header = el('header', {
    style: {
      background: 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
      color: '#fff',
      padding: '24px 16px',
      borderRadius: '0 0 16px 16px',
      textAlign: 'center',
      marginBottom: '24px',
    },
  }, [
    el('div', { style: { fontSize: '42px', lineHeight: '1' } }, '🧵'),
    el('h1', {
      style: {
        color: '#fff',
        fontSize: '22px',
        margin: '8px 0 0 0',
        fontWeight: '600',
      },
    }, 'ورشة تفصيل الجلابيب'),
    el('p', {
      style: {
        fontSize: '13px',
        margin: '4px 0 0 0',
        opacity: '0.9',
      },
    }, 'نسخة تجريبية — المرحلة 5: UI Core'),
  ]);

  /* Demo Section */
  const demoSection = el('section', {
    style: { padding: '0 16px', marginBottom: '24px' },
  }, [
    el('h2', {
      style: {
        fontSize: '18px',
        color: '#123C2F',
        margin: '0 0 16px 0',
        fontWeight: '600',
      },
    }, '🎨 تجربة المكونات'),

    el('div', { className: 'card' }, [
      el('div', { className: 'card__header' }, [
        el('h3', { className: 'card__title' }, 'Toast — الإشعارات القصيرة'),
      ]),
      el('p', {
        style: {
          fontSize: '13px',
          color: '#2E8B6F',
          margin: '0 0 16px 0',
        },
      }, 'اضغط أي زر لعرض الإشعار أسفل الشاشة:'),
      el('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
        },
      }, [
        el('button', {
          className: 'btn btn--primary',
          onClick: () => toast.success('تم حفظ البيانات بنجاح'),
        }, '✅ نجاح'),
        el('button', {
          className: 'btn btn--accent',
          onClick: () => toast.warning('المخزون على وشك الانتهاء'),
        }, '⚠️ تحذير'),
        el('button', {
          className: 'btn btn--danger',
          onClick: () => toast.danger('فشل في حفظ الطلب'),
        }, '❌ خطأ'),
        el('button', {
          className: 'btn btn--secondary',
          onClick: () => toast.info('آخر مزامنة قبل 3 دقائق'),
        }, 'ℹ️ معلومة'),
      ]),
      el('div', { style: { marginTop: '8px' } }, [
        el('button', {
          className: 'btn btn--ghost btn--block',
          onClick: () => { toast.clear(); toast.info('تم مسح الإشعارات'); },
        }, '🗑️ مسح الإشعارات'),
      ]),
    ]),

    el('div', { className: 'card', style: { marginTop: '16px' } }, [
      el('div', { className: 'card__header' }, [
        el('h3', { className: 'card__title' }, 'Badges — الشارات'),
      ]),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [
        el('span', { className: 'badge badge--success' }, 'مكتمل'),
        el('span', { className: 'badge badge--warning' }, 'قيد التنفيذ'),
        el('span', { className: 'badge badge--danger' }, 'متأخر'),
        el('span', { className: 'badge badge--info' }, 'جديد'),
        el('span', { className: 'badge badge--accent' }, 'VIP'),
      ]),
    ]),
  ]);

  /* Stats Demo */
  const statsSection = el('section', {
    style: { padding: '0 16px', marginBottom: '24px' },
  }, [
    el('h2', {
      style: {
        fontSize: '18px',
        color: '#123C2F',
        margin: '0 0 16px 0',
        fontWeight: '600',
      },
    }, '📊 إحصائيات (تجريبية)'),
    el('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
      },
    }, [
      el('div', { className: 'stat' }, [
        el('span', { className: 'stat__icon' }, '👥'),
        el('span', { className: 'stat__value' }, '0'),
        el('span', { className: 'stat__label' }, 'عملاء'),
      ]),
      el('div', { className: 'stat' }, [
        el('span', { className: 'stat__icon' }, '📦'),
        el('span', { className: 'stat__value' }, '0'),
        el('span', { className: 'stat__label' }, 'طلبات نشطة'),
      ]),
      el('div', { className: 'stat' }, [
        el('span', { className: 'stat__icon' }, '💰'),
        el('span', { className: 'stat__value' }, '0 ج.م'),
        el('span', { className: 'stat__label' }, 'إيرادات الشهر'),
      ]),
      el('div', { className: 'stat' }, [
        el('span', { className: 'stat__icon' }, '📅'),
        el('span', { className: 'stat__value' }, '0'),
        el('span', { className: 'stat__label' }, 'مواعيد اليوم'),
      ]),
    ]),
  ]);

  /* Tests Section — قابل للطي */
  const testsSection = el('section', {
    style: {
      padding: '0 16px',
      marginBottom: '32px',
    },
  }, [
    el('details', {
      style: {
        background: '#FFFFFF',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      },
    }, [
      el('summary', {
        style: {
          cursor: 'pointer',
          fontWeight: '600',
          color: '#123C2F',
          fontSize: '16px',
          padding: '4px 0',
          userSelect: 'none',
        },
      }, '🧪 نتائج الاختبارات (اضغط للعرض)'),
      el('div', {
        id: 'tests-container',
        style: { marginTop: '16px' },
      }),
    ]),
  ]);

  app.appendChild(header);
  app.appendChild(demoSection);
  app.appendChild(statsSection);
  app.appendChild(testsSection);
}

/* --- البناء ثم الاختبار --- */
try {
  buildDemo();
} catch (e) {
  showError('Failed to build Demo UI', e);
  throw e;
}

try {
  await import('./tests/all.js');
} catch (err) {
  const tc = document.getElementById('tests-container') || document.body;
  const pre = document.createElement('pre');
  pre.style.cssText = 'font-family:monospace;font-size:12px;white-space:pre-wrap;color:#c00;background:#fff;padding:8px;border-radius:6px';
  pre.textContent = '❌ Failed to load tests:\n' + (err.message || String(err)) + '\n\n' + (err.stack || '');
  tc.appendChild(pre);
  console.error(err);
}
