/* ==========================================================================
   onboarding.js — الجولة التعريفية للمستخدم الجديد
   ==========================================================================
   - تظهر تلقائياً عند أول فتح للتطبيق.
   - 5 خطوات: ترحيب / العملاء / الطلبات / المالية / ابدأ.
   - إمكانية التخطّي + إعادة التشغيل من الإعدادات.
   - تحفظ الحالة في localStorage (V3_ONBOARDING_DONE).
   - Static imports فقط.
   ========================================================================== */

import { el } from '../core/dom.js';

/* --- مفتاح localStorage --- */
const STORAGE_KEY = 'jalabiya_v3_onboarding_done';

/* --- الخطوات الخمس --- */
const STEPS = [
  {
    id: 'welcome',
    icon: '🧵',
    title: 'أهلاً بك في ورشة الجلابيب',
    text: 'تطبيق متكامل لإدارة ورشتك من الألف إلى الياء. سيرشدك هذا العرض السريع إلى أهم الأقسام في 30 ثانية.',
    tip: 'يمكنك تخطّي هذا العرض في أي وقت بالضغط على "تخطّي".',
  },
  {
    id: 'customers',
    icon: '👥',
    title: 'العملاء + المقاسات',
    text: 'سجّل بيانات كل عميل ومقاساته (كتف، صدر، طول...). النظام يحفظها ويعرضها عند أي طلب جديد.',
    tip: 'انقر على أي عميل لعرض تفاصيله السريعة.',
  },
  {
    id: 'orders',
    icon: '📋',
    title: 'الطلبات الذكية',
    text: 'أنشئ طلباً ببنود متعددة + خصم + رسوم إضافية. تابع الحالة (انتظار → تنفيذ → جاهز → مُسلَّم) واحفظ توقيع العميل.',
    tip: 'اضغط ✨ في النموذج ليقترح النظام موعد تسليم مناسباً تلقائياً.',
  },
  {
    id: 'finance',
    icon: '💰',
    title: 'المالية الكاملة',
    text: 'الدفعات، المصروفات، المركز المالي، الالتزامات، القروض، مصاريف البيت — كل شيء في مكان واحد.',
    tip: 'المركز المالي يعرض توقعات لثلاثة شهور قادمة + نصائح ذكية.',
  },
  {
    id: 'start',
    icon: '🚀',
    title: 'ابدأ الآن',
    text: 'كل شيء جاهز. اضغط Ctrl+K (أو Cmd+K على Mac) للبحث الشامل، أو استخدم القائمة الجانبية للتنقّل.',
    tip: 'يمكنك تفعيل المزامنة السحابية لاحقاً من الإعدادات.',
  },
];

/* ==========================================================================
   1. حالة الجولة
   ========================================================================== */

/**
 * هل سبق للمستخدم إتمام الجولة؟
 * @returns {boolean}
 */
export function isOnboardingDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * تعليم الجولة كمكتملة.
 */
function markDone() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch (e) { /* ignore */ }
}

/**
 * إعادة تعيين حالة الجولة (لتشغيلها مرة أخرى).
 */
export function resetOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
}

/* ==========================================================================
   2. رسم الجولة
   ========================================================================== */

/**
 * فتح الجولة التعريفية.
 * @param {Object} [options]
 * @param {Function} [options.onFinish] — يُستدعى عند الانتهاء أو التخطّي
 * @returns {void}
 */
export function openOnboarding(options = {}) {
  const { onFinish = null } = options;

  let currentStep = 0;
  let completed = false;

  /* --- الطبقة الخلفية --- */
  const overlay = el('div', {
    style: {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.75)',
      zIndex: '9998',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      animation: 'fadeIn 0.25s ease both',
    },
  });

  /* --- البطاقة --- */
  const card = el('div', {
    style: {
      background: '#fff',
      borderRadius: '20px',
      maxWidth: '440px',
      width: '100%',
      padding: '28px 24px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      textAlign: 'center',
      position: 'relative',
      animation: 'scaleIn 0.3s ease both',
    },
  });

  /* --- زر التخطّي (أعلى يمين) --- */
  const skipBtn = el('button', {
    type: 'button',
    style: {
      position: 'absolute',
      top: '12px',
      left: '12px',
      background: 'transparent',
      border: 'none',
      color: '#999',
      fontSize: '13px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      padding: '6px 10px',
      borderRadius: '6px',
    },
    onClick: () => finish(true),
  }, 'تخطّي ✕');

  /* --- المحتوى (يتغيّر) --- */
  const content = el('div', {
    style: { marginTop: '12px', minHeight: '240px' },
  });

  /* --- مؤشر النقاط --- */
  const dotsWrap = el('div', {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: '6px',
      marginTop: '20px',
    },
  });

  /* --- الأزرار --- */
  const prevBtn = el('button', {
    type: 'button',
    className: 'btn btn--ghost',
    style: { flex: '1' },
    onClick: () => goTo(currentStep - 1),
  }, 'السابق');

  const nextBtn = el('button', {
    type: 'button',
    className: 'btn btn--primary',
    style: { flex: '2' },
    onClick: () => {
      if (currentStep === STEPS.length - 1) finish(false);
      else goTo(currentStep + 1);
    },
  }, 'التالي');

  const actions = el('div', {
    style: { display: 'flex', gap: '8px', marginTop: '24px' },
  }, [prevBtn, nextBtn]);

  /* --- التجميع --- */
  card.appendChild(skipBtn);
  card.appendChild(content);
  card.appendChild(dotsWrap);
  card.appendChild(actions);
  overlay.appendChild(card);

  /* ==========================================================
     منطق التنقل
     ========================================================== */

  /**
   * الانتقال إلى خطوة معيّنة.
   * @param {number} index
   */
  function goTo(index) {
    if (index < 0 || index >= STEPS.length) return;
    currentStep = index;
    renderStep();
  }

  /**
   * رسم الخطوة الحالية.
   */
  function renderStep() {
    const step = STEPS[currentStep];

    /* مسح المحتوى */
    while (content.firstChild) content.removeChild(content.firstChild);

    /* أيقونة */
    content.appendChild(el('div', {
      style: { fontSize: '64px', lineHeight: '1', marginBottom: '16px' },
    }, step.icon));

    /* عنوان */
    content.appendChild(el('h2', {
      style: {
        fontSize: '22px',
        fontWeight: '700',
        color: '#123C2F',
        margin: '0 0 12px 0',
      },
    }, step.title));

    /* نص */
    content.appendChild(el('p', {
      style: {
        fontSize: '14px',
        color: '#666',
        lineHeight: '1.7',
        margin: '0 0 16px 0',
      },
    }, step.text));

    /* نصيحة */
    if (step.tip) {
      content.appendChild(el('div', {
        style: {
          fontSize: '12px',
          color: '#1F6D57',
          background: '#E8F5E9',
          padding: '10px 12px',
          borderRadius: '8px',
          lineHeight: '1.5',
          textAlign: 'right',
        },
      }, '💡 ' + step.tip));
    }

    /* تحديث النقاط */
    while (dotsWrap.firstChild) dotsWrap.removeChild(dotsWrap.firstChild);
    for (let i = 0; i < STEPS.length; i++) {
      dotsWrap.appendChild(el('span', {
        style: {
          width: i === currentStep ? '20px' : '8px',
          height: '8px',
          borderRadius: '4px',
          background: i === currentStep ? '#1F6D57' : '#D5CCC0',
          transition: 'all 0.3s ease',
        },
      }));
    }

    /* تحديث الأزرار */
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = currentStep === STEPS.length - 1 ? 'ابدأ الاستخدام 🚀' : 'التالي';
  }

  /**
   * إغلاق الجولة.
   * @param {boolean} skipped
   */
  function finish(skipped) {
    if (completed) return;
    completed = true;
    document.removeEventListener('keydown', escHandler);

    markDone();

    /* حركة الإغلاق */
    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';

    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof onFinish === 'function') {
        try { onFinish({ skipped }); }
        catch (e) { console.error(e); }
      }
    }, 200);
  }

  /* --- ESC = تخطّي --- */
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', escHandler);
      finish(true);
    }
  };
  document.addEventListener('keydown', escHandler);

  /* --- التشغيل --- */
  document.body.appendChild(overlay);
  renderStep();
}

/* ==========================================================================
   3. التشغيل التلقائي
   ========================================================================== */

/**
 * تشغيل الجولة تلقائياً إن لم تكن مكتملة.
 * @param {Object} [options]
 * @param {boolean} [options.force=false] — تجاوز فحص الحالة (لإعادة التشغيل)
 * @param {Function} [options.onFinish]
 * @returns {boolean} — true إن فُتحت الجولة
 */
export function maybeStartOnboarding(options = {}) {
  const { force = false, onFinish = null } = options;

  if (!force && isOnboardingDone()) return false;

  /* تأخير 600ms ليظهر التطبيق أولاً */
  setTimeout(() => openOnboarding({ onFinish }), 600);
  return true;
}

/* --- تصدير داخلي للاختبار --- */
export const _internal = { STEPS, STORAGE_KEY };
