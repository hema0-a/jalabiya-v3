/* ==========================================================================
   v3521b-secret-dialog.test.js — نوافذ السرّ الحقيقية (v3.5.21) — للمتصفح فقط
   ==========================================================================
   تشغّل النوافذ على DOM حقيقي: askSecret (خطأ ثم صحيح · إلغاء · عدم تطابق · Enter · إظهار/إخفاء · حقل فارغ)
   وshowRecoveryKey (لا يكتمل بلا تأكيد) وتدفق التفعيل كاملاً (عبارة ← مفتاح استرجاع ← commit).
   ملاحظة: modal.js يلمس document عند الاستيراد، لذلك هذه الوحدة لا تُحمَّل في Node.
   ========================================================================== */

import { register } from '../registry.js';
import { modal } from '../../ui/modal.js';
import { askSecret, showRecoveryKey } from '../../ui/secret-dialog.js';
import {
  isFileEncryptionEnabled, createFileEncryptionSetup, _setStorageForTest,
} from '../../services/backup-crypto.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await tick(20);
  }
  return false;
}

/** أعلى نافذة مفتوحة. */
const topModal = () => { const all = document.querySelectorAll('.modal-backdrop'); return all.length ? all[all.length - 1] : null; };
const modalCount = () => document.querySelectorAll('.modal-backdrop').length;
const field = (m, i = 0) => m.querySelectorAll('input:not([type="checkbox"])')[i];
const press = (m, action) => m.querySelector('[data-action="' + action + '"]').click();
const statusText = (m) => (m.querySelector('[role="alert"]') || {}).textContent || '';

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

function failing(code) { const e = new Error('x'); e.code = code; return e; }

register('v3.5.21 secret dialogs (browser)', async (t) => {
  if (typeof document === 'undefined') { t.log('  ⏭️ اختبارات النوافذ تُشغَّل في المتصفح فقط'); return; }
  modal.closeAll();

  await t.test('1. سرّ خاطئ ⟵ رسالة خطأ والنافذة تبقى؛ ثم الصحيح ⟵ يُحَلّ الوعد بناتج verify وتُغلق', async () => {
    const p = askSecret({
      title: 'اختبار', verify: async (s) => { if (s !== 'good-secret-1') throw failing('decrypt-failed'); return { ok: s }; },
    });
    await tick(30);
    const m = topModal();
    field(m).value = 'bad';
    press(m, 'confirm');
    const showedError = await waitFor(() => /غير صحيح/.test(statusText(m)));
    const stillOpen = modalCount() === 1;
    field(m).value = 'good-secret-1';
    press(m, 'confirm');
    const result = await p;
    return showedError && stillOpen && result && result.ok === 'good-secret-1' && modalCount() === 0;
  });

  await t.test('2. زر إلغاء ⟵ null وتُغلق النافذة', async () => {
    const p = askSecret({ title: 'اختبار', verify: async () => 'x' });
    await tick(30);
    press(topModal(), 'cancel');
    return (await p) === null && modalCount() === 0;
  });

  await t.test('3. إغلاق النافذة من الخارج (closeAll) ⟵ null', async () => {
    const p = askSecret({ title: 'اختبار', verify: async () => 'x' });
    await tick(30);
    modal.closeAll();
    return (await p) === null && modalCount() === 0;
  });

  await t.test('4. حقل فارغ ⟵ «اكتب السرّ أولاً» ولا يُستدعى verify', async () => {
    let called = 0;
    const p = askSecret({ title: 'اختبار', verify: async () => { called++; return 1; } });
    await tick(30);
    const m = topModal();
    press(m, 'confirm');
    await tick(30);
    const msg = statusText(m);
    modal.closeAll();
    await p;
    return /اكتب السرّ/.test(msg) && called === 0;
  });

  await t.test('5. عبارتان غير متطابقتين ⟵ خطأ ولا verify؛ ثم متطابقتان ⟵ نجاح', async () => {
    let called = 0;
    const p = askSecret({ title: 'اختبار', confirm: true, verify: async (s) => { called++; return { pass: s }; } });
    await tick(30);
    const m = topModal();
    field(m, 0).value = 'first-pass-1';
    field(m, 1).value = 'other-pass-2';
    press(m, 'confirm');
    await tick(30);
    const mismatch = /غير متطابقتين/.test(statusText(m)) && called === 0;
    field(m, 1).value = 'first-pass-1';
    press(m, 'confirm');
    const r = await p;
    return mismatch && called === 1 && r.pass === 'first-pass-1';
  });

  await t.test('6. زر Enter في الحقل يرسل', async () => {
    const p = askSecret({ title: 'اختبار', verify: async (s) => s });
    await tick(30);
    const m = topModal();
    field(m).value = 'enter-secret-1';
    field(m).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return (await p) === 'enter-secret-1';
  });

  await t.test('7. إظهار/إخفاء يبدّل نوع الحقل بين password وtext', async () => {
    const p = askSecret({ title: 'اختبار', confirm: true });
    await tick(30);
    const m = topModal();
    const toggle = [...m.querySelectorAll('button')].find((b) => /إظهار|إخفاء/.test(b.textContent));
    const t0 = field(m, 0).type;
    toggle.click();
    const t1 = field(m, 0).type;
    const t1b = field(m, 1).type;
    toggle.click();
    const t2 = field(m, 0).type;
    modal.closeAll();
    await p;
    return t0 === 'password' && t1 === 'text' && t1b === 'text' && t2 === 'password';
  });

  await t.test('8. الحقل بلا إكمال تلقائي (autocomplete=off)', async () => {
    const p = askSecret({ title: 'اختبار' });
    await tick(30);
    const m = topModal();
    const ok = field(m).getAttribute('autocomplete') === 'off' && field(m).getAttribute('spellcheck') === 'false';
    modal.closeAll();
    await p;
    return ok;
  });

  await t.test('9. مفتاح الاسترجاع: بلا تأكيد لا يكتمل؛ مع التأكيد ⟵ true؛ ويُعرض المفتاح نفسه', async () => {
    const KEY = 'ABCDE-FGH23-45678-9JKMN-PQRST';
    const p = showRecoveryKey(KEY);
    await tick(30);
    const m = topModal();
    const shown = m.textContent.includes(KEY);
    press(m, 'confirm');
    await tick(30);
    const blocked = modalCount() === 1 && /أكّد/.test(m.textContent);
    m.querySelector('input[type="checkbox"]').checked = true;
    press(m, 'confirm');
    return shown && blocked && (await p) === true && modalCount() === 0;
  });

  await t.test('10. مفتاح الاسترجاع: «إلغاء التفعيل» ⟵ false', async () => {
    const p = showRecoveryKey('ABCDE-FGH23-45678-9JKMN-PQRST');
    await tick(30);
    press(topModal(), 'cancel');
    return (await p) === false && modalCount() === 0;
  });

  await t.test('11. تدفق التفعيل كاملاً: عبارة+تأكيد ← مفتاح استرجاع ← تأكيد ← commit ⟵ مفعّل؛ والإلغاء عند المفتاح لا يفعّل', async () => {
    const st = memoryStorage();
    _setStorageForTest(st);
    try {
      /* مسار ناجح */
      let p = askSecret({ title: 'تفعيل', confirm: true, verify: (pass) => createFileEncryptionSetup(pass, { iterations: 1000 }) });
      await tick(30);
      let m = topModal();
      field(m, 0).value = 'flow-pass-2026'; field(m, 1).value = 'flow-pass-2026';
      press(m, 'confirm');
      const setup = await p;
      const q = showRecoveryKey(setup.recoveryKey);
      await tick(30);
      m = topModal();
      const offBefore = !isFileEncryptionEnabled();
      m.querySelector('input[type="checkbox"]').checked = true;
      press(m, 'confirm');
      const saved = await q;
      if (saved) setup.commit();
      const onAfter = isFileEncryptionEnabled();

      /* عند الإلغاء في مرحلة المفتاح لا يُحفظ شيء */
      st.map.clear();
      p = askSecret({ title: 'تفعيل', confirm: true, verify: (pass) => createFileEncryptionSetup(pass, { iterations: 1000 }) });
      await tick(30);
      m = topModal();
      field(m, 0).value = 'flow-pass-2026'; field(m, 1).value = 'flow-pass-2026';
      press(m, 'confirm');
      const setup2 = await p;
      const q2 = showRecoveryKey(setup2.recoveryKey);
      await tick(30);
      press(topModal(), 'cancel');
      const saved2 = await q2;
      return offBefore && saved === true && onAfter && saved2 === false && !isFileEncryptionEnabled();
    } finally { _setStorageForTest(null); modal.closeAll(); }
  });
});
