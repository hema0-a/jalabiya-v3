/* ==========================================================================
   v3520-data-crypto.test.js — مكتبة التشفير المعزولة data-crypto.js (v3.5.20)
   ==========================================================================
   تعمل في Node والمتصفح (WebCrypto في الاثنين). الدورات 1000 في أغلب الاختبارات للسرعة؛ واختبار واحد بالافتراضي (600 ألف).
   أهم ما يُحرس هنا:
   - متجه معروف ثابت (KAT): ملف مشفّر اليوم يجب أن يفتحه كل إصدار مستقبلي — كسر الصيغة = ضياع نسخ المستخدم.
   - أي عبث (نص مشفّر · IV · غلاف مفتاح · إصدار) أو سرّ خاطئ ⟵ فشل صريح لا نص مشوَّه.
   - تطبيع NFKC للعبارة، وتطبيع مفتاح الاسترجاع كما يكتبه الإنسان.
   - سقف الدورات (ملف خبيث لا يعلّق الجهاز) وعدم تسرّب النص أو العبارة داخل الغلاف.
   ========================================================================== */

import { register } from '../registry.js';
import {
  encryptText, decryptText, isEncryptedEnvelope, generateRecoveryKey, normalizeRecoveryKey,
  normalizePassphrase, isValidRecoveryKey, isCryptoAvailable, DataCryptoError,
  DEFAULT_ITERATIONS, RECOVERY_ITERATIONS, MIN_PASSPHRASE_LENGTH, ENVELOPE_MARK,
} from '../../security/data-crypto.js';

const FAST = { iterations: 1000 };
const PASS = 'كلمة سر قوية 123';
const REC = 'ABCDE-FGH23-45678-9JKMN-PQRST';

/** غلاف معروف مولَّد بإصدار 3.5.20: عبارة known-pass-1234 أو مفتاح الاسترجاع أعلاه ⟵ KAT-ورشة-2026 */
const KAT_ENVELOPE = '{"m":"jalabiya-enc","v":1,"alg":"A256GCM","wraps":[{"t":"pass","kdf":"PBKDF2-SHA256","i":1000,"s":"ECi3P6DEeTXJfKtdF3VebA==","iv":"AY+wYoflNVsYsVUT","k":"GTNGrlpzA76HQ3ij9H3xqtQ1KzIh8aWRIU8Cn5gUiVKHUKt1Xj2BACAMcs/iIqgo"},{"t":"rec","kdf":"PBKDF2-SHA256","i":1000,"s":"aU8yKQy2qRFXtMiRl6dUrQ==","iv":"wZmMzgGW59FHD0/M","k":"0ZIX2X39Y3ud3Xg/UHPBK8go55il7itYgAiokeX36CbpLooa5DeLZO1VtTcINoqb"}],"iv":"tGDh7vizJekXbGSv","ct":"0BR1E7cm4QndL4ArGFCYqt6JxHJzkAXfx5Vbog5Xcc1D"}';
const KAT_PLAIN = 'KAT-ورشة-2026';

async function code(promise) {
  try { await promise; return ''; } catch (e) { return e && e.code ? e.code : 'other:' + (e && e.message); }
}

/** يعدّل حقلاً في الغلاف ويعيده نصاً. */
function tweak(env, fn) { const o = JSON.parse(env); fn(o); return JSON.stringify(o); }

/** يقلب بتّاً واحداً في نص Base64 (يحافظ على الطول والصلاحية). */
function flipB64(b64) {
  const bin = atob(b64);
  const arr = bin.split('');
  arr[0] = String.fromCharCode(arr[0].charCodeAt(0) ^ 1);
  return btoa(arr.join(''));
}

register('v3.5.20 data-crypto', async (t) => {
  /* ---------- متجه معروف: ثبات الصيغة عبر الإصدارات ---------- */
  await t.test('1. KAT: غلاف ثابت يُفتح بالعبارة المعروفة', async () =>
    (await decryptText(KAT_ENVELOPE, 'known-pass-1234')) === KAT_PLAIN);

  await t.test('2. KAT: يُفتح كذلك بمفتاح الاسترجاع (بصيغ كتابة مختلفة)', async () => {
    const a = await decryptText(KAT_ENVELOPE, REC);
    const b = await decryptText(KAT_ENVELOPE, 'abcde fgh23 45678 9jkmn pqrst');
    return a === KAT_PLAIN && b === KAT_PLAIN;
  });

  /* ---------- الذهاب والإياب ---------- */
  await t.test('3. ذهاب وإياب بالعبارة: عربي وإيموجي وJSON وأسطر جديدة', async () => {
    const text = 'ورشة الجلابيب 🧵\n{"phone":"0501234567","نوع":"جلابية"}\t';
    const env = await encryptText(text, [{ type: 'pass', secret: PASS }], FAST);
    return (await decryptText(env, PASS)) === text;
  });

  await t.test('4. نص فارغ يُشفَّر ويُفك', async () => {
    const env = await encryptText('', [{ type: 'pass', secret: PASS }], FAST);
    return (await decryptText(env, PASS)) === '';
  });

  await t.test('5. نص كبير (3MB) بلا سقوط المكدّس ولا تلف', async () => {
    const big = ('ورشة-' + 'x'.repeat(95)).repeat(30000);
    const env = await encryptText(big, [{ type: 'pass', secret: PASS }], FAST);
    return (await decryptText(env, PASS)) === big && big.length > 2900000;
  });

  await t.test('6. بالدورات الافتراضية (600 ألف للعبارة) ذهاب وإياب سليم', async () => {
    const env = await encryptText('افتراضي', [{ type: 'pass', secret: PASS }]);
    const o = JSON.parse(env);
    return DEFAULT_ITERATIONS === 600000 && o.wraps[0].i === 600000 && (await decryptText(env, PASS)) === 'افتراضي';
  });

  await t.test('7. مفتاح الاسترجاع يستعمل دورات أقل (100 ألف) وهو عالي العشوائية', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: PASS, iterations: 1000 }, { type: 'rec', secret: REC }]);
    const o = JSON.parse(env);
    return RECOVERY_ITERATIONS === 100000 && o.wraps[1].t === 'rec' && o.wraps[1].i === 100000;
  });

  /* ---------- الأسرار الخاطئة والعبث ---------- */
  await t.test('8. عبارة خاطئة ⟵ decrypt-failed (لا نص مشوَّه)', async () => {
    const env = await encryptText('سرّي', [{ type: 'pass', secret: PASS }], FAST);
    return (await code(decryptText(env, PASS + 'x'))) === 'decrypt-failed';
  });

  await t.test('9. عبث بالنص المشفّر ⟵ decrypt-failed', async () => {
    const env = await encryptText('سرّي', [{ type: 'pass', secret: PASS }], FAST);
    const bad = tweak(env, (o) => { o.ct = flipB64(o.ct); });
    return (await code(decryptText(bad, PASS))) === 'decrypt-failed';
  });

  await t.test('10. عبث بالـIV أو بغلاف المفتاح ⟵ decrypt-failed', async () => {
    const env = await encryptText('سرّي', [{ type: 'pass', secret: PASS }], FAST);
    const a = tweak(env, (o) => { o.iv = flipB64(o.iv); });
    const b = tweak(env, (o) => { o.wraps[0].k = flipB64(o.wraps[0].k); });
    return (await code(decryptText(a, PASS))) === 'decrypt-failed' && (await code(decryptText(b, PASS))) === 'decrypt-failed';
  });

  await t.test('11. تغيير عدد الدورات في الغلاف ⟵ decrypt-failed (مفتاح مشتق مختلف)', async () => {
    const env = await encryptText('سرّي', [{ type: 'pass', secret: PASS }], FAST);
    const bad = tweak(env, (o) => { o.wraps[0].i = 2000; });
    return (await code(decryptText(bad, PASS))) === 'decrypt-failed';
  });

  /* ---------- بنية الغلاف والإصدار ---------- */
  await t.test('12. ليس JSON / ليس غلافنا / بنية ناقصة ⟵ bad-format', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: PASS }], FAST);
    const results = await Promise.all([
      code(decryptText('not json at all', PASS)),
      code(decryptText('{"a":1}', PASS)),
      code(decryptText(tweak(env, (o) => { delete o.ct; }), PASS)),
      code(decryptText(tweak(env, (o) => { o.wraps = []; }), PASS)),
      code(decryptText(tweak(env, (o) => { o.alg = 'AES-CBC'; }), PASS)),
      code(decryptText(tweak(env, (o) => { o.wraps[0].s = '!!!'; }), PASS)),
    ]);
    return results.every((r) => r === 'bad-format');
  });

  await t.test('13. إصدار أحدث من المدعوم ⟵ unsupported-version (لا يُفسَّر كتالف)', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: PASS }], FAST);
    return (await code(decryptText(tweak(env, (o) => { o.v = 2; }), PASS))) === 'unsupported-version';
  });

  await t.test('14. سقف الدورات (5 ملايين): ما فوقه يُرفض فوراً بلا اشتقاق (bad-format)', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: PASS }], FAST);
    const t0 = Date.now();
    const c = await code(decryptText(tweak(env, (o) => { o.wraps[0].i = 5000001; }), PASS));
    return c === 'bad-format' && Date.now() - t0 < 500;
  });

  /* ---------- التطبيع ---------- */
  await t.test('15. NFKC: «ﻻ» (شكل العرض) و«لا» عبارتان متطابقتان', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: 'مرور-ﻻ-1234' }], FAST);
    return (await decryptText(env, 'مرور-لا-1234')) === 'x' && normalizePassphrase('ﻻ') === 'لا';
  });

  await t.test('16. NFKC: حرف مركّب وحرف + علامة منفصلة متطابقان', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: 'caf\u00e9-pass-1' }], FAST);
    return (await decryptText(env, 'cafe\u0301-pass-1')) === 'x';
  });

  await t.test('17. تطبيع مفتاح الاسترجاع: أحرف صغيرة · فواصل · O⟵0 · I,L⟵1', () =>
    normalizeRecoveryKey(' abcde-fgh23 45678_9jkmn pqrst ') === 'ABCDEFGH23456789JKMNPQRST'
    && normalizeRecoveryKey('OIL') === '011');

  /* ---------- مفتاح الاسترجاع ---------- */
  await t.test('18. generateRecoveryKey: 5×5 رمزاً من أبجدية Crockford وفريد ويمرّ فحص الصلاحية', () => {
    const keys = new Set();
    for (let i = 0; i < 50; i++) {
      const k = generateRecoveryKey();
      if (!/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/.test(k) || !isValidRecoveryKey(k)) return false;
      keys.add(k);
    }
    return keys.size === 50;
  });

  await t.test('19. مفتاح استرجاع خاطئ ⟵ decrypt-failed، وعبارة المرور تفتح الملف نفسه', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: PASS }, { type: 'rec', secret: REC }], FAST);
    const wrongRec = 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ';
    return (await code(decryptText(env, wrongRec))) === 'decrypt-failed' && (await decryptText(env, PASS)) === 'x';
  });

  /* ---------- مدخلات رديئة عند التشفير ---------- */
  await t.test('20. عبارة قصيرة ⟵ weak-secret، ومفتاح استرجاع بصيغة خاطئة ⟵ weak-secret', async () => {
    const short = 'a'.repeat(MIN_PASSPHRASE_LENGTH - 1);
    return (await code(encryptText('x', [{ type: 'pass', secret: short }], FAST))) === 'weak-secret'
      && (await code(encryptText('x', [{ type: 'rec', secret: 'ABC' }], FAST))) === 'weak-secret';
  });

  await t.test('21. مدخلات رديئة: لا أسرار · نوع مجهول · نص غير نصي · دورات غير صالحة ⟵ bad-input', async () => {
    const r = await Promise.all([
      code(encryptText('x', [], FAST)),
      code(encryptText('x', [{ type: 'zzz', secret: PASS }], FAST)),
      code(encryptText(123, [{ type: 'pass', secret: PASS }], FAST)),
      code(encryptText('x', [{ type: 'pass', secret: PASS }], { iterations: 10 })),
    ]);
    return r.every((c) => c === 'bad-input');
  });

  /* ---------- الأمان العملي ---------- */
  await t.test('22. تشفيران لنص وعبارة واحدة يختلفان (ملح وIV عشوائيان)', async () => {
    const a = await encryptText('نفس النص', [{ type: 'pass', secret: PASS }], FAST);
    const b = await encryptText('نفس النص', [{ type: 'pass', secret: PASS }], FAST);
    const A = JSON.parse(a), B = JSON.parse(b);
    return a !== b && A.ct !== B.ct && A.iv !== B.iv && A.wraps[0].s !== B.wraps[0].s;
  });

  await t.test('23. الغلاف لا يحوي النص ولا العبارة ولا مفتاح الاسترجاع (ولا أجزاءً منها)', async () => {
    const secretText = 'phone-0501234567-ABRACADABRA';
    const env = await encryptText(secretText, [{ type: 'pass', secret: PASS }, { type: 'rec', secret: REC }], FAST);
    return !env.includes('0501234567') && !env.includes('ABRACADABRA') && !env.includes(PASS)
      && !env.includes('ABCDE') && !env.includes('FGH23');
  });

  await t.test('24. isEncryptedEnvelope: نعم للغلاف (نصاً وكائناً)، لا لنسخة عادية وللقيم الفارغة', async () => {
    const env = await encryptText('x', [{ type: 'pass', secret: PASS }], FAST);
    return isEncryptedEnvelope(env) && isEncryptedEnvelope(JSON.parse(env)) && JSON.parse(env).m === ENVELOPE_MARK
      && !isEncryptedEnvelope('{"stores":{"customers":[]}}') && !isEncryptedEnvelope('') && !isEncryptedEnvelope(null)
      && !isEncryptedEnvelope('garbage');
  });

  await t.test('25. الأخطاء من نوع DataCryptoError برمز مقروء', async () => {
    try { await decryptText('nope', PASS); return false; }
    catch (e) { return e instanceof DataCryptoError && e.code === 'bad-format' && e.name === 'DataCryptoError'; }
  });

  await t.test('26. isCryptoAvailable صحيح هنا، وعند غياب WebCrypto (سياق HTTP) ⟵ unavailable برسالة واضحة', async () => {
    if (!isCryptoAvailable()) return false;
    const env = await encryptText('x', [{ type: 'pass', secret: PASS }], FAST);
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    } catch (e) { t.log('  ⏭️ تعذّر تعطيل crypto مؤقتاً في هذه البيئة'); return true; }
    try {
      const off = isCryptoAvailable();
      const a = await code(encryptText('x', [{ type: 'pass', secret: PASS }], FAST));
      const b = await code(decryptText(env, PASS));
      return off === false && a === 'unavailable' && b === 'unavailable';
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc); else delete globalThis.crypto;
    }
  });
});
