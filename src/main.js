/* ==========================================================================
   main.js — نقطة الدخول + Demo UI (المرحلة 5)
   ==========================================================================
   1. يُخفي شاشة التحميل ويُظهر #app
   2. يبني واجهة تجريبية تُظهر المكونات (Toast حالياً)
   3. يستورد ملف الاختبارات ديناميكياً ويعرض النتائج في #tests-container
   ========================================================================== */

import { el } from './core/dom.js';
import { toast } from './ui/toast.js';

/* --- 1. إظهار التطبيق --- */
const loading = document.getElementById('app-loading');
const app = document.getElementById('app');
if (loading) loading.hidden = true;
if (app) app.hidden = false;

/* --- 2. بناء الـ Demo UI --- */
function buildDemo() {
  if (!app) return;

  /* Header */
  const header = el('header', {
    style: {
      background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary))',
      color: '#fff',
      padding: 'var(--space-l) var(--space-m)',
      borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
      textAlign: 'center',
      marginBottom: 'var(--space-l)',
    },
  }, [
    el('div', { style: { fontSize: '42px', lineHeight: '1' } }, '🧵'),
    el('h1', {
      style: {
        color: '#fff',
        fontSize: 'var(--font-size-xl)',
        margin: 'var(--space-s) 0 0 0',
      },
    }, 'ورشة تفصيل الجلابيب'),
    el('p', {
      style: {
        fontSize: 'var(--font-size-sm)',
        margin: 'var(--space-xs) 0 0 0',
        opacity: '0.9',
      },
    }, 'نسخة تجريبية — المرحلة 5: UI Core'),
  ]);

  /* Demo Section */
  const demoSection = el('section', {
    style: { padding: '0 var(--space-m)', marginBottom: 'var(--space-l)' },
  }, [
    el('h2', {
      style: {
        fontSize: 'var(--font-size-lg)',
        color: 'var(--color-primary-dark)',
        margin: '0 0 var(--space-m) 0',
      },
    }, '🎨 تجربة المكونات'),

    el('div', { className: 'card' }, [
      el('div', { className: 'card__header' }, [
        el('h3', { className: 'card__title' }, 'Toast — الإشعارات القصيرة'),
      ]),
      el('p', {
        style: {
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-primary-light)',
          margin: '0 0 var(--space-m) 0',
        },
      }, 'اضغط أي زر لعرض الإشعار في أسفل الشاشة:'),
      el('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-s)',
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
          onClick: () => toast.info('معلومة: آخر مزامنة قبل 3 دقائق'),
        }, 'ℹ️ معلومة'),
      ]),
      el('div', {
        style: { marginTop: 'var(--space-s)' },
      }, [
        el('button', {
          className: 'btn btn--ghost btn--block',
          onClick: () => { toast.clear(); toast.info('تم مسح الإشعارات'); },
        }, '🗑️ مسح الإشعارات'),
      ]),
    ]),

    el('div', { className: 'card', style: { marginTop: 'var(--space-m)' } }, [
      el('div', { className: 'card__header' }, [
        el('h3', { className: 'card__title' }, 'Badges — الشارات'),
      ]),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-s)' } }, [
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
    style: { padding: '0 var(--space-m)', marginBottom: 'var(--space-l)' },
  }, [
    el('h2', {
      style: {
        fontSize: 'var(--font-size-lg)',
        color: 'var(--color-primary-dark)',
        margin: '0 0 var(--space-m) 0',
      },
    }, '📊 إحصائيات (تجريبية)'),
    el('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--space-s)',
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
      padding: '0 var(--space-m)',
      marginBottom: 'var(--space-xl)',
    },
  }, [
    el('details', {
      style: {
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-l)',
        padding: 'var(--space-m)',
        boxShadow: 'var(--shadow-s)',
      },
    }, [
      el('summary', {
        style: {
          cursor: 'pointer',
          fontWeight: '600',
          color: 'var(--color-primary-dark)',
          fontSize: 'var(--font-size-base)',
          padding: 'var(--space-xs) 0',
          userSelect: 'none',
        },
      }, '🧪 نتائج الاختبارات (اضغط للعرض)'),
      el('div', {
        id: 'tests-container',
        style: { marginTop: 'var(--space-m)' },
      }),
    ]),
  ]);

  app.appendChild(header);
  app.appendChild(demoSection);
  app.appendChild(statsSection);
  app.appendChild(testsSection);
}

/* --- 3. البناء ثم الاختبار --- */
buildDemo();

try {
  await import('./tests/all.js');
} catch (err) {
  const tc = document.getElementById('tests-container') || document.body;
  tc.textContent = '❌ Failed to load tests: ' + err.message;
  console.error(err);
}
