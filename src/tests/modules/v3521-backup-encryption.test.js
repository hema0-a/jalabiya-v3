/* ==========================================================================
   v3521-backup-encryption.test.js — تشفير الملفات الخارجية (v3.5.21)
   ==========================================================================
   القسم 1: حلقة المفاتيح في data-crypto (Node + المتصفح).
   القسم 2: خدمة backup-crypto (تفعيل بتأكيد · فتح المشفِّر · تعطيل بإثبات · مسارات التصدير/الاستيراد بـask وهمي).
   القسم 3: الفشل المغلق وبناء الملف في auto-backup (لا ملف صريح والتشفير مفعّل).
   القسم 4: عقود المصدر (fetch): كل مسار تصدير يمرّ بالمشفِّر، ولا مستدعٍ آخر لدوال التصدير.
   القسم 5 (المتصفح فقط، IndexedDB حقيقية): ملف مشترَك ومصدَّر مشفّر فعلاً ويُفتح بالعبارة.
   الدورات 1000 للسرعة. التخزين وهمي (_setStorageForTest) فلا يمسّ localStorage الحقيقي.
   ========================================================================== */

import { register } from '../registry.js';
import {
  createKeyring, openKeyring, encryptWithKey, decryptText, isEncryptedEnvelope, generateRecoveryKey,
} from '../../security/data-crypto.js';
import {
  isFileEncryptionEnabled, getFileEncryptionInfo, createFileEncryptionSetup, openEncryptor, disableFileEncryption,
  decryptBackupFile, looksEncrypted, encryptedFileName, prepareExportEncryptor, decryptImportedText,
  describeCryptoError, _setStorageForTest,
} from '../../services/backup-crypto.js';
import {
  buildBackupFile, shareLatestBackup, exportBackupToFile, createBackup,
} from '../../services/auto-backup.js';
import { STORAGE_KEYS } from '../../core/config.js';

const FAST = { iterations: 1000 };
const PASS = 'عبارة مرور قوية 2026';
const REC = 'ABCDE-FGH23-45678-9JKMN-PQRST';
const KEY = STORAGE_KEYS.V3_FILE_ENCRYPTION;

/** تخزين وهمي في الذاكرة (يحاكي localStorage). */
function memoryStorage(opts = {}) {
  const m = new Map();
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts.failSet) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { if (opts.failRemove) throw new Error('denied'); m.delete(k); },
  };
}

async function code(p) { try { await p; return ''; } catch (e) { return e && e.code ? e.code : 'other:' + (e && e.message); } }

/** يفعّل التشفير على تخزين وهمي نظيف ويعيد مفتاح الاسترجاع. */
async function enableFresh(storage = memoryStorage()) {
  _setStorageForTest(storage);
  const setup = await createFileEncryptionSetup(PASS, FAST);
  setup.commit();
  return { storage, recoveryKey: setup.recoveryKey };
}

const cleanup = () => _setStorageForTest(null);

/** يجلب مصدر ملف (fetch) أو null إن تعذّر. */
async function source(path) {
  try { const r = await fetch('./' + path); return r.ok ? await r.text() : null; } catch (e) { return null; }
}
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const hasIdb = typeof indexedDB !== 'undefined' && typeof document !== 'undefined' && typeof File !== 'undefined';

register('v3.5.21 backup file encryption', async (t) => {
  /* ======================= 1. حلقة المفاتيح ======================= */
  await t.test('1. حلقة مفاتيح ⟵ ملف مشفّر يُفتح بالعبارة وبمفتاح الاسترجاع (بلا الحلقة)', async () => {
    const ring = await createKeyring([{ type: 'pass', secret: PASS }, { type: 'rec', secret: REC }], FAST);
    const dek = await openKeyring(ring, PASS);
    const file = await encryptWithKey('ورشة {"phone":"0501234567"}', dek, ring);
    return isEncryptedEnvelope(file) && (await decryptText(file, PASS)) === 'ورشة {"phone":"0501234567"}'
      && (await decryptText(file, 'abcde fgh23 45678 9jkmn pqrst')) === 'ورشة {"phone":"0501234567"}';
  });

  await t.test('2. ملفان بالمفتاح نفسه: IV ونص مشفّر مختلفان، وأغلفتهما هي أغلفة الحلقة، وكلاهما يُفتح', async () => {
    const ring = await createKeyring([{ type: 'pass', secret: PASS }], FAST);
    const dek = await openKeyring(ring, PASS);
    const a = JSON.parse(await encryptWithKey('نفس النص', dek, ring));
    const b = JSON.parse(await encryptWithKey('نفس النص', dek, ring));
    const wraps = JSON.stringify(JSON.parse(ring).wraps);
    return a.iv !== b.iv && a.ct !== b.ct && JSON.stringify(a.wraps) === wraps && JSON.stringify(b.wraps) === wraps
      && (await decryptText(JSON.stringify(a), PASS)) === 'نفس النص' && (await decryptText(JSON.stringify(b), PASS)) === 'نفس النص';
  });

  await t.test('3. سرّ خاطئ على الحلقة ⟵ decrypt-failed (فلا يُنتج ملف بعبارة خاطئة)', async () => {
    const ring = await createKeyring([{ type: 'pass', secret: PASS }], FAST);
    return (await code(openKeyring(ring, PASS + 'x'))) === 'decrypt-failed';
  });

  await t.test('4. الحلقة ليست ملفاً: decryptText ⟵ bad-format؛ وحلقة معدَّلة لا تُفتح', async () => {
    const ring = await createKeyring([{ type: 'pass', secret: PASS }], FAST);
    const o = JSON.parse(ring);
    const bytes = atob(o.wraps[0].k).split('');
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    o.wraps[0].k = btoa(bytes.join(''));
    return (await code(decryptText(ring, PASS))) === 'bad-format'
      && (await code(openKeyring(JSON.stringify(o), PASS))) === 'decrypt-failed'
      && (await code(openKeyring('{"m":"jalabiya-enc","v":1,"alg":"A256GCM","wraps":[]}', PASS))) === 'bad-format';
  });

  await t.test('5. مفتاح البيانات المفتوح غير قابل للتصدير، ومدخلات encryptWithKey الرديئة ⟵ bad-input', async () => {
    const ring = await createKeyring([{ type: 'pass', secret: PASS }], FAST);
    const dek = await openKeyring(ring, PASS);
    return dek.extractable === false
      && (await code(encryptWithKey(5, dek, ring))) === 'bad-input'
      && (await code(encryptWithKey('x', null, ring))) === 'bad-input';
  });

  /* ======================= 2. خدمة backup-crypto ======================= */
  await t.test('6. معطّل افتراضياً', () => {
    _setStorageForTest(memoryStorage());
    try { return !isFileEncryptionEnabled() && getFileEncryptionInfo().enabled === false && getFileEncryptionInfo().enabledAt === null; }
    finally { cleanup(); }
  });

  await t.test('7. التجهيز بلا commit لا يفعّل شيئاً؛ commit يفعّله مع وقت التفعيل', async () => {
    const st = memoryStorage();
    _setStorageForTest(st);
    try {
      const setup = await createFileEncryptionSetup(PASS, FAST);
      const before = isFileEncryptionEnabled() || st.map.size > 0;
      setup.commit();
      const info = getFileEncryptionInfo();
      return before === false && isFileEncryptionEnabled() && info.enabled && info.enabledAt > 0;
    } finally { cleanup(); }
  });

  await t.test('8. المخزَّن حلقة فقط: لا العبارة ولا مفتاح الاسترجاع ولا أجزاء منهما', async () => {
    const { storage, recoveryKey } = await enableFresh();
    try {
      const raw = storage.map.get(KEY);
      const compact = recoveryKey.replace(/-/g, '');
      return recoveryKey.length === 29 && !raw.includes(PASS) && !raw.includes(recoveryKey) && !raw.includes(compact)
        && !raw.includes(recoveryKey.slice(0, 5)) && JSON.parse(raw).v === 1 && typeof JSON.parse(raw).keyring === 'string';
    } finally { cleanup(); }
  });

  await t.test('9. openEncryptor: العبارة ومفتاح الاسترجاع (بصيغة حرة) ينجحان، والخاطئ decrypt-failed، وغير المفعّل not-enabled', async () => {
    const { recoveryKey } = await enableFresh();
    try {
      const a = await openEncryptor(PASS);
      const b = await openEncryptor(recoveryKey.toLowerCase().replace(/-/g, ' '));
      const wrong = await code(openEncryptor('عبارة خاطئة تماماً'));
      _setStorageForTest(memoryStorage());
      const off = await code(openEncryptor(PASS));
      return typeof a.encrypt === 'function' && typeof b.encrypt === 'function' && wrong === 'decrypt-failed' && off === 'not-enabled';
    } finally { cleanup(); }
  });

  await t.test('10. ملف المشفِّر يُفتح بالعبارة وبالاسترجاع عبر decryptBackupFile ولا يحوي النص الصريح', async () => {
    const { recoveryKey } = await enableFresh();
    try {
      const enc = await openEncryptor(PASS);
      const text = JSON.stringify({ stores: { customers: [{ id: 'c1', name: 'عميلة-سرية-12345', phone: '0501234567' }] } });
      const file = await enc.encrypt(text);
      return looksEncrypted(file) && !file.includes('عميلة-سرية') && !file.includes('0501234567')
        && (await decryptBackupFile(file, PASS)) === text && (await decryptBackupFile(file, recoveryKey)) === text;
    } finally { cleanup(); }
  });

  await t.test('11. التعطيل بإثبات: سرّ خاطئ يُبقيه مفعّلاً، والصحيح يعطّله، وغير المفعّل ⟵ true', async () => {
    await enableFresh();
    try {
      const wrong = await code(disableFileEncryption('عبارة خاطئة تماماً'));
      const stillOn = isFileEncryptionEnabled();
      const ok = await disableFileEncryption(PASS);
      const noopWhenOff = await disableFileEncryption('لا يهم');
      return wrong === 'decrypt-failed' && stillOn && ok === true && !isFileEncryptionEnabled() && noopWhenOff === true;
    } finally { cleanup(); }
  });

  await t.test('12. تفعيل ثانٍ أو commit مزدوج ⟵ already-enabled', async () => {
    const st = memoryStorage();
    _setStorageForTest(st);
    try {
      const s1 = await createFileEncryptionSetup(PASS, FAST);
      const s2 = await createFileEncryptionSetup(PASS, FAST);
      s1.commit();
      return (await code(createFileEncryptionSetup(PASS, FAST))) === 'already-enabled' && (() => { try { s2.commit(); return false; } catch (e) { return e.code === 'already-enabled'; } })();
    } finally { cleanup(); }
  });

  await t.test('13. فشل الحفظ (امتلاء/غياب التخزين) ⟵ storage-failed ويبقى معطّلاً، وعبارة قصيرة ⟵ weak-secret', async () => {
    _setStorageForTest(memoryStorage({ failSet: true }));
    try {
      const setup = await createFileEncryptionSetup(PASS, FAST);
      let c1 = ''; try { setup.commit(); } catch (e) { c1 = e.code; }
      const off1 = !isFileEncryptionEnabled();
      const weak = await code(createFileEncryptionSetup('قصيرة', FAST));
      return c1 === 'storage-failed' && off1 && weak === 'weak-secret';
    } finally { cleanup(); }
  });

  await t.test('14. prepareExportEncryptor: معطّل ⟵ لا يسأل ولا مشفِّر؛ مفعّل + إلغاء ⟵ null (لا تصدير)', async () => {
    _setStorageForTest(memoryStorage());
    let asked = 0;
    try {
      const off = await prepareExportEncryptor(async () => { asked++; return null; });
      await enableFresh();
      const cancelled = await prepareExportEncryptor(async () => null);
      return off && off.encrypt === undefined && asked === 0 && cancelled === null;
    } finally { cleanup(); }
  });

  await t.test('15. prepareExportEncryptor: سرّ خاطئ ثم صحيح عبر verify ⟵ مشفِّر يعمل', async () => {
    await enableFresh();
    try {
      const errors = [];
      const ask = async ({ purpose, verify }) => {
        if (purpose !== 'export') return null;
        for (const s of ['خاطئة تماماً هنا', PASS]) {
          try { return await verify(s); } catch (e) { errors.push(e.code); }
        }
        return null;
      };
      const ctx = await prepareExportEncryptor(ask);
      const file = await ctx.encrypt('نص');
      return errors.length === 1 && errors[0] === 'decrypt-failed' && isEncryptedEnvelope(file) && (await decryptText(file, PASS)) === 'نص';
    } finally { cleanup(); }
  });

  await t.test('16. decryptImportedText: الصريح يمرّ بلا سؤال؛ المشفّر يُفك بالسرّ؛ الإلغاء ⟵ null', async () => {
    const { recoveryKey } = await enableFresh();
    try {
      const enc = await openEncryptor(PASS);
      const plain = '{"stores":{"customers":[]}}';
      const file = await enc.encrypt(plain);
      let asked = 0;
      const passthrough = await decryptImportedText(plain, async () => { asked++; return null; });
      const opened = await decryptImportedText(file, ({ verify }) => verify(recoveryKey));
      const cancelled = await decryptImportedText(file, async () => null);
      const wrong = await decryptImportedText(file, async ({ verify }) => { try { return await verify('عبارة خاطئة تماماً'); } catch (e) { return null; } });
      return passthrough === plain && asked === 0 && opened === plain && cancelled === null && wrong === null;
    } finally { cleanup(); }
  });

  await t.test('17. encryptedFileName يضيف .enc.json ولا يكرره', () =>
    encryptedFileName('jalabiya-backup-2026-10-31.json') === 'jalabiya-backup-2026-10-31.enc.json'
    && encryptedFileName('a.enc.json') === 'a.enc.json' && encryptedFileName('noext') === 'noext.enc.json');

  await t.test('18. describeCryptoError: رسائل عربية للرموز المعروفة وبديل لغيرها، ولا تكشف سرّاً', () =>
    /غير صحيح/.test(describeCryptoError({ code: 'decrypt-failed' })) && /8 أحرف/.test(describeCryptoError({ code: 'weak-secret' }))
    && describeCryptoError({ message: 'خطأ ما' }) === 'خطأ ما' && describeCryptoError(null).length > 0);

  /* ======================= 3. الفشل المغلق في auto-backup ======================= */
  await t.test('19. buildBackupFile: صريح بلا مشفِّر، ومشفّر بامتداد .enc.json بلا نص صريح', async () => {
    const { storage } = await enableFresh();
    try {
      const enc = await openEncryptor(PASS);
      const plain = await buildBackupFile('{"x":"سر-123"}', 'b.json', null);
      const sealed = await buildBackupFile('{"x":"سر-123"}', 'b.json', enc.encrypt);
      return plain.text === '{"x":"سر-123"}' && plain.name === 'b.json'
        && looksEncrypted(sealed.text) && sealed.name === 'b.enc.json' && !sealed.text.includes('سر-123') && storage.map.size === 1;
    } finally { cleanup(); }
  });

  await t.test('20. مشفِّر معيب يعيد نصاً صريحاً ⟵ buildBackupFile يرفض (لا يخرج شيء)', async () => {
    let threw = false;
    try { await buildBackupFile('{"x":"سر"}', 'b.json', async (txt) => txt); } catch (e) { threw = true; }
    return threw;
  });

  await t.test('21. shareLatestBackup: مفعّل بلا مشفِّر ⟵ needsSecret بلا مشاركة ولا تنزيل ولا نسخة', async () => {
    await enableFresh();
    try {
      let shared = 0; let downloaded = 0;
      const r = await shareLatestBackup({
        navigator: { canShare: () => true, share: async () => { shared++; } },
        download: async () => { downloaded++; return true; },
      });
      return r.ok === false && r.needsSecret === true && shared === 0 && downloaded === 0;
    } finally { cleanup(); }
  });

  await t.test('22. shareLatestBackup: معطّل ⟵ لا يُحجب (السلوك القديم كما هو)', async () => {
    _setStorageForTest(memoryStorage());
    try {
      const r = await shareLatestBackup({ navigator: {}, download: async () => true });
      return !r.needsSecret;
    } finally { cleanup(); }
  });

  /* ======================= 4. عقود المصدر ======================= */
  const sysMain = await source('src/pages/settings/section-backup.js');   /* v3.5.26: قسم النسخ نُقل من sections-system.js */
  const sysIo = await source('src/pages/settings/section-backup-io.js');   /* v3.5.41: مساعدات التصدير/الاستيراد نُقلت لملف مجاور */
  const sys = sysMain === null || sysIo === null ? null : sysMain + '\n' + sysIo;
  const ab = await source('src/services/auto-backup.js');
  if (sys === null || ab === null) { t.log('  ⏭️ عقود المصدر تتطلب خادماً (fetch)'); }
  else {
    const sysCode = strip(sys);
    const abCode = strip(ab);

    await t.test('23. exportBackupToFile: فحص الفشل المغلق قبل قراءة النسخة؛ وshareLatestBackup قبل إنشائها', () => {
      const exp = abCode.slice(abCode.indexOf('export async function exportBackupToFile'));
      const shr = abCode.slice(abCode.indexOf('export async function shareLatestBackup'));
      return exp.indexOf('isFileEncryptionEnabled()') > 0 && exp.indexOf('isFileEncryptionEnabled()') < exp.indexOf('getBackup(id)')
        && shr.indexOf('isFileEncryptionEnabled()') > 0 && shr.indexOf('isFileEncryptionEnabled()') < shr.indexOf('createBackup(');
    });

    await t.test('24. الإعدادات: المسارات الثلاثة تمرّ بـprepareExportEncryptor والاستيراد بـdecryptImportedText قبل JSON.parse', () => {
      const exportsPrepared = (sysCode.match(/prepareExportEncryptor\(askSecretFor\)/g) || []).length;
      const imp = sysCode.slice(sysCode.indexOf('async function importAllData'));
      const iDec = imp.indexOf('decryptImportedText(');
      const iParse = imp.indexOf('JSON.parse(');
      return exportsPrepared === 3 && iDec > 0 && iParse > iDec
        && /shareLatestBackup\(\{ encrypt: ctx\.encrypt \}\)/.test(sysCode)
        && /exportBackupToFile\(b\.id, \{ encrypt: ctx\.encrypt \}\)/.test(sysCode)
        && /buildBackupFile\(JSON\.stringify\(data, null, 2\),[\s\S]*?,\s*ctx\.encrypt\)/.test(sysCode);
    });

    await t.test('25. لا مستدعٍ آخر لدوال التصدير خارج auto-backup والإعدادات (لا باب خلفي يخرج ملفاً صريحاً)', async () => {
      const sw = await source('sw.js');
      if (!sw) return true;
      const paths = [...sw.matchAll(/'\.\/(src\/[^']+\.js)'/g)].map((m) => m[1])
        .filter((p) => p !== 'src/services/auto-backup.js' && p !== 'src/pages/settings/section-backup.js');
      const offenders = [];
      for (let i = 0; i < paths.length; i += 20) {
        const batch = paths.slice(i, i + 20);
        const texts = await Promise.all(batch.map((p) => source(p)));
        batch.forEach((p, k) => {
          if (texts[k] && /\b(exportBackupToFile|shareLatestBackup)\s*\(/.test(strip(texts[k]))) offenders.push(p);
        });
      }
      return paths.length > 150 && offenders.length === 0;
    });
  }

  /* ======================= 5. المتصفح فقط (IndexedDB حقيقية) ======================= */
  if (!hasIdb) { t.log('  ⏭️ اختبارات التصدير الفعلي تُشغَّل في المتصفح فقط'); return; }

  await t.test('26. [متصفح] مشاركة نسخة والتشفير مفعّل ⟵ الملف المشارَك مشفّر ويُفتح بالعبارة إلى JSON فيه stores', async () => {
    await enableFresh();
    try {
      const enc = await openEncryptor(PASS);
      let sharedFile = null;
      const nav = { canShare: () => true, share: async ({ files }) => { sharedFile = files[0]; } };
      const r = await shareLatestBackup({ navigator: nav, encrypt: enc.encrypt });
      if (!r.ok || !sharedFile) return false;
      const text = await sharedFile.text();
      const plain = JSON.parse(await decryptText(text, PASS));
      return r.method === 'share' && /\.enc\.json$/.test(sharedFile.name) && looksEncrypted(text) && plain && typeof plain.stores === 'object';
    } finally { cleanup(); }
  });

  await t.test('27. [متصفح] exportBackupToFile: مفعّل بلا مشفِّر ⟵ false ولا رابط تنزيل؛ ومع المشفِّر ⟵ Blob مشفّر', async () => {
    await enableFresh();
    const realCreate = URL.createObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    const blobs = [];
    try {
      URL.createObjectURL = (b) => { blobs.push(b); return 'blob:test'; };
      HTMLAnchorElement.prototype.click = function () { /* لا تنزيل فعلي في الاختبار */ };
      const made = await createBackup({ label: 'اختبار تشفير' });
      if (!made.ok) return false;
      const noKey = await exportBackupToFile(made.id);
      const blocked = noKey === false && blobs.length === 0;
      const enc = await openEncryptor(PASS);
      const withKey = await exportBackupToFile(made.id, { encrypt: enc.encrypt });
      const text = blobs.length === 1 ? await blobs[0].text() : '';
      return blocked && withKey === true && looksEncrypted(text) && typeof JSON.parse(await decryptText(text, PASS)).stores === 'object';
    } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; cleanup(); }
  });
});
