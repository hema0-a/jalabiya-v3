/* ==========================================================================
   section-push.js — قسم «إشعارات حقيقية (Push)» (v3.6.0)
   ==========================================================================
   تفعيل إشعارات تصل والتطبيق مقفول (عبر Firebase Cloud Messaging + دالة مجدولة).
   الشروط: حساب مزامنة مسجّل + مفتاح VAPID + نشر الدالة (docs/PUSH-SETUP.md).
   يصدّر: pushSection — ويُدرج في settings/index.js بعد قسم «التنبيهات».
   ========================================================================== */

import { el } from '../../core/dom.js';
import { createToggle } from '../../ui/controls.js';
import { toast } from '../../ui/toast.js';
import { pushOptions } from '../../services/push-digest.js';
import { buildPushStatus, formatPushError, STATE_ICON } from '../../services/push-status.js';
import * as push from '../../sync/push-sync.js';   /* ثابت (القاعدة 14)؛ الاستيراد الثقيل داخله كسول */

const REASONS = {
  unsupported: 'هذا المتصفح لا يدعم الإشعارات الحقيقية (جرّب Chrome على أندرويد أو ثبّت التطبيق على الشاشة الرئيسية في iOS 16.4+).',
  'no-vapid': 'الصق مفتاح VAPID أولاً.',
  'signed-out': 'سجّل الدخول من «المزامنة السحابية» أولاً.',
  'permission-denied': 'رُفض إذن الإشعارات — فعّله من إعدادات المتصفح للموقع ثم أعد المحاولة.',
  'permission-default': 'لم تُمنح إذن الإشعارات.',
  'no-token': 'تعذّر الحصول على رمز الجهاز — تأكد من صحة مفتاح VAPID.',
  error: 'حدث خطأ أثناء التفعيل.',
};

export const pushSection = {
  id: 'push',
  icon: '📲',
  title: 'إشعارات حقيقية (Push)',
  async render(body, currentSettings, saveFn) {
    const o = pushOptions(currentSettings);
    const cur = { ...((currentSettings.notifications || {}).push || {}) };

    /* يحفظ كائن push كاملاً (الدمج في الإعدادات بمستوى واحد) */
    const savePush = (patch) => {
      Object.assign(cur, patch);
      return saveFn({ notifications: { push: { ...cur } } });
    };

    const status = el('div', { className: 'settings-row__hint', style: { marginBottom: '8px' } });
    const refreshStatus = () => {
      const s = push.getLocalStatus();
      let txt;
      if (!s.supported) txt = '⚠️ غير مدعوم على هذا الجهاز/المتصفح.';
      else if (!s.signedIn) txt = '⚠️ سجّل الدخول من «المزامنة السحابية» لتفعيل الميزة.';
      else if (s.registered) txt = '✅ مفعّلة على هذا الجهاز' + (s.permission !== 'granted' ? ' (لكن إذن الإشعارات غير ممنوح!)' : '');
      else txt = 'غير مفعّلة على هذا الجهاز.';
      status.textContent = txt;
    };
    refreshStatus();

    body.appendChild(el('div', { className: 'settings-row__hint' },
      'تصلك إشعارات بمواعيد التسليم والمتأخر والجاهز والمخزون والالتزامات حتى لو التطبيق مغلق تماماً. تحتاج إعداداً لمرة واحدة (راجع docs/PUSH-SETUP.md).'));
    body.appendChild(status);

    /* مفتاح VAPID */
    const vapid = el('input', {
      className: 'input', type: 'text', dir: 'ltr', value: o.vapidKey,
      placeholder: 'Web Push certificate — Firebase Console ← Cloud Messaging',
      style: { fontSize: '12px', textAlign: 'left' },
    });
    vapid.addEventListener('change', () => { savePush({ vapidKey: vapid.value.trim() }); });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'مفتاح VAPID العام'), vapid,
    ]));

    /* زر التفعيل/الإيقاف */
    const mainBtn = el('button', { className: 'btn btn--primary', type: 'button' });
    const syncBtn = () => { mainBtn.textContent = push.getLocalStatus().registered ? '🔕 إيقاف على هذا الجهاز' : '🔔 تفعيل على هذا الجهاز'; };
    syncBtn();
    mainBtn.addEventListener('click', async () => {
      mainBtn.disabled = true;
      try {
        if (push.getLocalStatus().registered) {
          await push.disablePush();
          await savePush({ enabled: false });
          toast.info('تم إيقاف الإشعارات على هذا الجهاز');
        } else {
          const key = vapid.value.trim();
          await savePush({ vapidKey: key, enabled: true });
          const r = await push.enablePush(key);
          if (r.ok) { push.start(); toast.success('✅ تفعّلت الإشعارات الحقيقية'); }
          else {
            await savePush({ enabled: false });
            toast.danger(r.message ? formatPushError(r.reason, r.message) : (REASONS[r.reason] || formatPushError(r.reason, '')));
          }
        }
      } finally {
        mainBtn.disabled = false; syncBtn(); refreshStatus();
      }
    });
    body.appendChild(el('div', { className: 'settings-field' }, [mainBtn]));

    /* التوقيت والأيام */
    const time = el('input', { className: 'input', type: 'time', value: o.time });
    time.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(time.value)) savePush({ time: time.value }); });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'وقت الإشعار اليومي'), time,
    ]));

    const days = el('input', { className: 'input', type: 'number', min: '0', max: '14', value: String(o.daysBefore) });
    days.addEventListener('change', () => {
      const v = Math.min(14, Math.max(0, Math.floor(Number(days.value) || 0)));
      days.value = String(v); savePush({ daysBefore: v });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'نبّهني قبل التسليم بعدد الأيام (0 = يوم التسليم فقط)'), days,
    ]));

    /* ما الذي يُرسل */
    const row = (key, label, hint) => el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, label),
        hint ? el('div', { className: 'settings-row__hint' }, hint) : null,
      ]),
      createToggle({ label, checked: o[key] !== false, onChange: (v) => { savePush({ [key]: v }); } }),
    ]);
    body.appendChild(row('overdue', 'الطلبات المتأخرة'));
    body.appendChild(row('ready', 'الطلبات الجاهزة لم تُستلم'));
    body.appendChild(row('stock', 'نواقص المخزون'));
    body.appendChild(row('commitments', 'استحقاق الالتزامات', 'قبل الاستحقاق بـ 3 أيام'));
    body.appendChild(row('documents', 'المستندات المنتهية أو القريبة', 'حسب مدة التنبيه المحددة لكل مستند'));
    body.appendChild(row('circles', 'أقساط الجمعيات', 'تحتاج «يوم الدفع» في الجمعية'));
    body.appendChild(row('tasks', 'المهام المتأخرة واليوم'));
    body.appendChild(row('weekly', 'تقرير الأسبوع كل جمعة', 'سطر يلخّص محصّلك ومصروفك وما سلّمته (من آخر ملخص رفعه التطبيق)'));
    body.appendChild(row('includeNames', 'إرسال أول اسم العميل للخادم', 'عند الإيقاف لا يغادر أي اسم جهازك (الإشعار يذكر الأعداد فقط)'));

    body.appendChild(el('div', { className: 'settings-row__hint' }, 'ساعات الهدوء تُؤخذ من قسم «التنبيهات».'));

    /* أدوات */
    const toolsRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } });
    const testBtn = el('button', { className: 'btn', type: 'button' }, '🧪 إشعار تجريبي من الخادم');
    testBtn.addEventListener('click', async () => {
      if (!push.getLocalStatus().registered) { toast.warning('فعّل الميزة على هذا الجهاز أولاً'); return; }
      const r = await push.requestServerTest();
      if (r.ok) toast.info('طُلب إشعار تجريبي — يصل مع أقرب تشغيل للخادم (حتى 30 دقيقة، أو فوراً بتشغيل Push cron من GitHub)');
      else toast.danger('تعذّر الطلب: ' + (r.message || ''));
    });
    const refreshBtn = el('button', { className: 'btn', type: 'button' }, '🔄 تحديث الملخص الآن');
    refreshBtn.addEventListener('click', async () => {
      const r = await push.syncDigest({ force: true });
      if (r.ok) toast.success('تم تحديث الملخص'); else toast.warning('لم يُحدَّث الملخص — تأكد من التفعيل والاتصال');
    });
    toolsRow.appendChild(testBtn); toolsRow.appendChild(refreshBtn);
    body.appendChild(toolsRow);

    /* 🩺 حالة الإشعارات (v3.18.0): تشخيص بالعربية يغني عن فتح GitHub */
    const diagTitle = el('div', { className: 'settings-row__label', style: { marginTop: '14px' } }, '🩺 حالة الإشعارات');
    const diagBox = el('div', { className: 'push-diag', 'data-testid': 'push-diag', style: { marginTop: '6px' } });
    const diagNext = el('div', { className: 'settings-row__hint', style: { marginTop: '6px' } });
    const diagBtn = el('button', { className: 'btn', type: 'button' }, '🔍 فحص الحالة');
    const renderDiag = (cloud) => {
      const m = buildPushStatus({ local: push.getLocalStatus(), cloud, now: Date.now() });
      diagBox.textContent = '';
      m.rows.forEach((r) => {
        diagBox.appendChild(el('div', {
          className: 'push-diag__row', 'data-state': r.state,
          style: { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 0', fontSize: '13px' },
        }, [
          el('span', {}, STATE_ICON[r.state] || '⚪'),
          el('span', { style: { flex: '1' } }, r.label),
          el('span', { style: { opacity: '0.8', textAlign: 'left' } }, r.value),
        ]));
      });
      diagNext.textContent = m.next ? '👉 ' + m.next : (m.level === 'ok' ? 'كل شيء يعمل ✅' : '');
    };
    const runDiag = async () => {
      diagBtn.disabled = true;
      try {
        const s = push.getLocalStatus();
        const cloud = (s.supported && s.signedIn) ? await push.getCloudStatus() : null;
        renderDiag(cloud);
      } finally { diagBtn.disabled = false; }
    };
    diagBtn.addEventListener('click', runDiag);
    renderDiag(null);
    body.appendChild(diagTitle);
    body.appendChild(diagBox);
    body.appendChild(diagNext);
    body.appendChild(el('div', { style: { marginTop: '6px' } }, [diagBtn]));
    /* لا تحميل ثقيل لـ Firebase عند مجرد فتح الإعدادات: الفحص التلقائي فقط إن كان الجهاز مفعّلاً أصلاً */
    if (push.getLocalStatus().registered) runDiag().catch(() => {});
  },
};
