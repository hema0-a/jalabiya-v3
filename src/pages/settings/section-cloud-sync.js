/* ==========================================================================
   section-cloud-sync.js — قسم المزامنة السحابية (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: cloudSyncSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { STORAGE_KEYS } from '../../core/config.js';
import * as authSync from '../../sync/auth-sync.js';
import { pushFlow, pullFlow } from '../../sync/sync-flow.js';
import * as autoSync from '../../sync/auto-sync.js';

/* ==========================================================================
   5. المزامنة السحابية (v3.3.2 — إصلاح الجلسة)
   ========================================================================== */

export const cloudSyncSection = {
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
        /* v3.5.23: «نسيت كلمة المرور» و«إنشاء حساب» في صفحة المزامنة (مصدر واحد لهذه الواجهة) */
        body.appendChild(el('a', {
          className: 'btn btn--secondary btn--block', href: '#/cloud-sync', 'data-action': 'open-cloud-page',
          style: { marginTop: '8px', textDecoration: 'none', textAlign: 'center' },
        }, '🔐 نسيت كلمة المرور / إنشاء حساب'));
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
      body.appendChild(el('a', {
        className: 'btn btn--ghost btn--block', href: '#/cloud-sync', 'data-action': 'open-cloud-page',
        style: { marginTop: '8px', textDecoration: 'none', textAlign: 'center' },
      }, '☁️ فتح صفحة المزامنة الكاملة'));
    };

    /* --- رسم أولي (بحالة "تحقق من الجلسة") --- */
    currentUser = undefined;
    draw();

    /* --- استماع تلقائي لحالة المصادقة (v3.3.2) --- */
    unsubAuth = authSync.onAuthChange((user) => {
      autoSync.setUser(user);
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
