/* ==========================================================================
   secret-dialog.js — نوافذ إدخال السرّ لتشفير الملفات (v3.5.21)
   ==========================================================================
   - askSecret: نافذة إدخال عبارة (أو مفتاح استرجاع). يُمرَّر verify(secret) فيُنفَّذ داخل النافذة:
       نجح ⟵ تُغلق النافذة ويُحَلّ الوعد بناتجه · رمى ⟵ تبقى مفتوحة وتُعرض رسالة الخطأ (محاولة أخرى).
       الإلغاء أو الإغلاق ⟵ null. (الاشتقاق قد يستغرق ثواني على الجوال: يظهر «جارٍ التحقق».)
   - showRecoveryKey: يعرض مفتاح الاسترجاع مرة واحدة ولا يُكمل إلا بعد تأكيد حفظه (وإلا false ⟵ لا يتفعّل التشفير).
   لا يُخزَّن السرّ ولا يُطبع في أي مكان؛ حقل كلمة المرور بلا إكمال تلقائي.
   لا زر «نسخ» لمفتاح الاسترجاع عمداً: لوحة المفاتيح وسجل الحافظة يحتفظان بما يُنسخ، ومكانه الصحيح الورق.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { describeCryptoError } from '../services/backup-crypto.js';

const FIELD_STYLE = { width: '100%', boxSizing: 'border-box', marginBottom: '8px' };

/** حقل كلمة مرور بلا إكمال ولا تصحيح ولا أحرف كبيرة تلقائية. */
function passwordInput(placeholder) {
  return el('input', {
    className: 'input', type: 'password', placeholder,
    autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    'aria-label': placeholder, style: FIELD_STYLE,
  });
}

/**
 * نافذة إدخال سرّ.
 * @param {Object} cfg
 * @param {string} [cfg.title]
 * @param {string} [cfg.message]
 * @param {string} [cfg.confirmText='متابعة']
 * @param {string} [cfg.placeholder]
 * @param {boolean} [cfg.confirm=false] — حقل ثانٍ يجب أن يطابق الأول (عند تعيين عبارة جديدة)
 * @param {(secret:string) => Promise<*>} [cfg.verify] — يرمي عند الفشل؛ ناتجه يُحَلّ به الوعد
 * @returns {Promise<*|null>} ناتج verify، أو null عند الإلغاء
 */
export function askSecret(cfg = {}) {
  const {
    title = '🔐 أدخل السرّ', message = '', confirmText = 'متابعة',
    placeholder = 'عبارة المرور أو مفتاح الاسترجاع', confirm = false, verify,
  } = cfg;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (finished) return; finished = true; resolve(v); };

    const input = passwordInput(placeholder);
    const input2 = confirm ? passwordInput('أعد كتابة العبارة للتأكيد') : null;
    const status = el('div', { role: 'alert', style: { fontSize: '12px', minHeight: '18px', marginTop: '4px' } });

    const showBtn = el('button', {
      type: 'button', className: 'btn btn--sm btn--ghost',
      onClick: () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        if (input2) input2.type = input.type;
        showBtn.textContent = show ? '🙈 إخفاء' : '👁️ إظهار';
      },
    }, '👁️ إظهار');

    const body = el('div', {}, [
      message ? el('p', { text: message, style: { margin: '0 0 10px 0', lineHeight: '1.7', fontSize: '13px' } }) : null,
      input, input2, showBtn, status,
    ]);

    const say = (text, ok) => { status.style.color = ok ? '#2E7D32' : '#B3261E'; status.textContent = text; };

    const submit = async () => {
      const value = input.value;
      if (!value) { say('اكتب السرّ أولاً', false); return; }
      if (input2 && value !== input2.value) { say('العبارتان غير متطابقتين', false); return; }
      say('⏳ جارٍ التحقق… قد يستغرق ثواني', true);
      try {
        const result = typeof verify === 'function' ? await verify(value) : value;
        finish(result === undefined ? true : result);
        handle.close();
      } catch (e) {
        say(describeCryptoError(e), false);
        try { input.focus(); } catch (err) { /* اختياري */ }
      }
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    });

    const handle = modal.open({
      title, body,
      actions: [
        { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => { finish(null); handle.close(); } },
        { text: confirmText, variant: 'primary', action: 'confirm', onClick: submit },
      ],
      onClose: () => finish(null),
    });
    setTimeout(() => { try { input.focus(); } catch (e) { /* اختياري */ } }, 60);
  });
}

/**
 * يعرض مفتاح الاسترجاع مرة واحدة ويطلب تأكيد حفظه.
 * @param {string} key
 * @returns {Promise<boolean>} true فقط إن أكّد المستخدم أنه حفظه
 */
export function showRecoveryKey(key) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (finished) return; finished = true; resolve(v); };

    const check = el('input', { type: 'checkbox', id: 'rk-saved-check' });
    const status = el('div', { role: 'alert', style: { color: '#B3261E', fontSize: '12px', minHeight: '18px', marginTop: '6px' } });

    const body = el('div', {}, [
      el('p', {
        text: 'هذا مفتاح الاسترجاع. يُعرض هذه المرة فقط ولا يُخزَّن في أي مكان. اكتبه على ورقة واحتفظ بها بعيداً عن الهاتف '
          + '(لا تحفظه في ملاحظات الهاتف أو واتساب). إن نسيت عبارة المرور فهو الطريقة الوحيدة لفتح ملفاتك المشفّرة، '
          + 'وبدونهما معاً تضيع الملفات المشفّرة نهائياً.',
        style: { margin: '0 0 12px 0', lineHeight: '1.7', fontSize: '13px' },
      }),
      /* المجموعات الخمس كتل غير قابلة للكسر: يلتفّ المفتاح عند حدود المجموعات فقط (لا في منتصف مجموعة) */
      el('div', {
        dir: 'ltr',
        style: {
          fontFamily: 'monospace', fontSize: '18px', letterSpacing: '1px', padding: '12px', textAlign: 'center',
          background: '#F6F1E6', borderRadius: '8px', userSelect: 'all', lineHeight: '2',
        },
      }, String(key).split('-').map((g, i, a) => el('span', {
        text: g + (i < a.length - 1 ? '-' : ''), style: { display: 'inline-block', whiteSpace: 'nowrap' },
      }))),
      el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', fontSize: '13px' } }, [
        check, 'كتبتُ المفتاح في مكان آمن',
      ]),
      status,
    ]);

    const handle = modal.open({
      title: '🗝️ مفتاح الاسترجاع', body, closable: false,
      actions: [
        { text: 'إلغاء التفعيل', variant: 'ghost', action: 'cancel', onClick: () => { finish(false); handle.close(); } },
        {
          text: 'تفعيل التشفير', variant: 'primary', action: 'confirm',
          onClick: () => {
            if (!check.checked) { status.textContent = 'أكّد أنك كتبت المفتاح أولاً'; return; }
            finish(true); handle.close();
          },
        },
      ],
      onClose: () => finish(false),
    });
  });
}
