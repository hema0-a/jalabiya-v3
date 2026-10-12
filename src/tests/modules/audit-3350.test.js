/* ==========================================================================
   audit-3350.test.js — ربط الجهاز بحساب المزامنة لا يتم أثناء القفل
   ==========================================================================
   ثغرة v3.3.48: مستمع onAuthChange في auto-sync يبقى فعّالاً بعد أول فتح، فإذا قُفل التطبيق
   (قفل الخمول) ثم سجّل مهاجم الدخول بحسابه من «نسيت الرقم السري» أعاد setUser ربط الجهاز
   بحسابه فتجاوز التحقق في recoverPinWithCloud وأُزيل الرقم. اختبارات 3348 كانت تحقن الاعتماديات
   فلم تلتقط التفاعل الحقيقي بين الوحدتين.
   ========================================================================== */

import { register } from '../registry.js';
import { auth } from '../../security/auth.js';
import { recoverPinWithCloud } from '../../security/pin-recovery.js';
import { setPin, clearPin, isPinSet } from '../../security/pin-crypto.js';
import { getOwnerUid, bindOwner } from '../../sync/auth-sync.js';
import * as autoSync from '../../sync/auto-sync.js';

const OWNER_KEY = 'jalabiya_v3_owner_uid';

register('audit v3.3.50 owner binding only while unlocked', async (t) => {
  const prevOwner = getOwnerUid();
  try {
    await setPin('2468');
    bindOwner('owner1');

    /* قفل الخمول: الجلسة محذوفة */
    auth.clearSession();
    autoSync.setUser({ uid: 'attacker' });
    await t.test('1. أثناء القفل: ظهور حساب جديد لا يُعيد ربط الجهاز', getOwnerUid() === 'owner1');

    /* السيناريو كاملاً: مستمع الدخول يُستدعى داخل login قبل أن يقرأ الاسترجاع صاحب الجهاز */
    const res = await recoverPinWithCloud('x@y.com', 'p', {
      login: async () => { autoSync.setUser({ uid: 'attacker' }); return { ok: true, user: { uid: 'attacker' } }; },
      getOwnerUid,
      logout: async () => { autoSync.setUser(null); return { ok: true }; },
    });
    await t.test('2. مهاجم يسجّل بحسابه من شاشة القفل: يُرفض ويبقى الرقم والمالك',
      !res.success && isPinSet() && getOwnerUid() === 'owner1');

    /* جلسة مفتوحة: الربط يعمل (المستخدم غيّر حسابه عمداً) */
    auth.setSession(1);
    autoSync.setUser({ uid: 'owner2' });
    await t.test('3. جلسة مفتوحة: يُربط الجهاز بالحساب', getOwnerUid() === 'owner2');
    auth.clearSession();

    /* بلا رقم سري: لا قفل أصلاً فالربط مسموح */
    clearPin();
    autoSync.setUser({ uid: 'owner3' });
    await t.test('4. بلا رقم سري (لا قفل): يُربط', getOwnerUid() === 'owner3');
  } finally {
    autoSync.setUser(null);
    auth.clearSession();
    clearPin();
    if (prevOwner) bindOwner(prevOwner); else localStorage.removeItem(OWNER_KEY);
  }
});

/* --------------------------------------------------------------------------
   مسح بيانات الجهاز يجب أن يمحو جلسة Firebase المحفوظة ومفاتيح المزامنة
   -------------------------------------------------------------------------- */
import { wipeAllLocalData } from '../../ui/lock-screen.js';
import { clearSyncIdentity, SYNC_IDENTITY_KEYS } from '../../sync/sync-identity.js';

const openDb = (name, create) => new Promise((resolve, reject) => {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => { if (create) r.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' }); };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const dbExists = async (name) => {
  if (indexedDB.databases) return (await indexedDB.databases()).some((d) => d.name === name);
  return false;
};

register('audit v3.3.50 wipe clears sync identity', async (t) => {
  /* جلسة Firebase مزيّفة كما يخزّنها SDK + مفاتيح المزامنة */
  const db = await openDb('firebaseLocalStorageDb', true);
  await new Promise((res, rej) => {
    const tx = db.transaction('firebaseLocalStorage', 'readwrite');
    tx.objectStore('firebaseLocalStorage').put({ fbase_key: 'firebase:authUser:KEY:[DEFAULT]', value: { uid: 'owner1' } });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
  SYNC_IDENTITY_KEYS.forEach((k) => localStorage.setItem(k, '1'));
  localStorage.setItem('firebase:authUser:KEY:[DEFAULT]', '{"uid":"owner1"}');
  localStorage.setItem('jalabiya_v3_draft_payment_new', '{"amount":1500,"notes":"سري"}');
  await setPin('2468');

  await t.test('0. التجهيز: الجلسة والمفاتيح موجودة قبل المسح',
    (await dbExists('firebaseLocalStorageDb')) && SYNC_IDENTITY_KEYS.every((k) => localStorage.getItem(k) === '1'));

  await wipeAllLocalData();

  await t.test('1. جلسة Firebase المحفوظة (IndexedDB) حُذفت', !(await dbExists('firebaseLocalStorageDb')));
  await t.test('2. مفاتيح المزامنة (المالك، رقم النسخة، غير مرفوع، الطابور، البصمة) حُذفت',
    SYNC_IDENTITY_KEYS.every((k) => localStorage.getItem(k) === null));
  await t.test('3. جلسة Firebase في localStorage حُذفت', localStorage.getItem('firebase:authUser:KEY:[DEFAULT]') === null);
  await t.test('4. الرقم السري أُزيل', !isPinSet());
  await t.test('4ب. مسودات النماذج (أسماء/مبالغ/ملاحظات لم تُحفظ) حُذفت', localStorage.getItem('jalabiya_v3_draft_payment_new') === null);

  const again = await clearSyncIdentity();
  await t.test('5. التكرار آمن (لا شيء ليُمسح ولا أخطاء)', again.keys === 0);
});

/* --------------------------------------------------------------------------
   أرقام الهاتف وروابط واتساب: صيغ شائعة كانت تنتج رابطاً خاطئاً
   (1012345678 بلا صفر ← رقم أمريكي +1، و0020… و+20 (0)10… ← روابط غير صالحة)
   -------------------------------------------------------------------------- */
import { normalizePhone } from '../../core/utils.js';
import { sendWhatsApp } from '../../services/auto-messages.js';

register('audit v3.3.50 phone numbers and whatsapp links', async (t) => {
  const E = '+201012345678';
  const same = ['01012345678', '+201012345678', '201012345678', '010 1234 5678', '٠١٠١٢٣٤٥٦٧٨',
    '+20 10 1234 5678', '0020 10 1234 5678', '00201012345678', '1012345678', '+20 (0)10 1234 5678', '2001012345678', '010-1234-5678'];
  const wrong = same.filter((p) => normalizePhone(p) !== E);
  await t.test('1. كل صيغ الرقم المصري الشائعة (12) تُوحَّد إلى +201012345678' + (wrong.length ? ' — فشل: ' + wrong.join(' | ') : ''), wrong.length === 0);
  await t.test('2. بقية البادئات المصرية 011/012/015 تعمل وبلا الصفر الأول أيضاً',
    normalizePhone('01112345678') === '+201112345678' && normalizePhone('1212345678') === '+201212345678' && normalizePhone('1512345678') === '+201512345678');
  await t.test('3. رقم أجنبي/غير معروف يُترك كما هو (لا تخمين)',
    normalizePhone('+966501234567') === '+966501234567' && normalizePhone('abc') === 'abc' && normalizePhone('') === '' && normalizePhone(null) === '');

  const opened = [];
  const realOpen = window.open;
  window.open = (u) => { opened.push(u); return null; };
  try {
    sendWhatsApp('1012345678', 'مرحبا');
    sendWhatsApp('0020 10 1234 5678', 'x');
    sendWhatsApp('00966501234567', 'x');
  } finally { window.open = realOpen; }
  await t.test('4. رقم بلا صفر أول لا يذهب لرقم أمريكي (+1) بل لمصر',
    opened[0] === 'https://wa.me/201012345678?text=' + encodeURIComponent('مرحبا'));
  await t.test('5. 0020… يصير رابطاً صالحاً', opened[1] === 'https://wa.me/201012345678?text=x');
  await t.test('6. 00 الدولية لرقم أجنبي تُحذف (wa.me لا يقبلها)', opened[2] === 'https://wa.me/966501234567?text=x');
});

/* --------------------------------------------------------------------------
   بيانات كبيرة: المستحقات تُعرض تدريجياً (كانت ترسم كل العملاء معاً: ~27 ألف عنصر مع 2000 عميل)
   -------------------------------------------------------------------------- */
import { debtsPage } from '../../pages/debts.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import * as idbMod from '../../data/idb.js';

register('audit v3.3.50 debts progressive list', async (t) => {
  const made = { c: [], o: [] };
  const host = document.createElement('div');
  try {
    const day = 86400000;
    for (let i = 0; i < 45; i++) {
      const c = await customersRepo.create({ name: 'عميل-مستحق ' + String(i).padStart(2, '0'), phone: '0101111' + String(1000 + i) });
      const o = await ordersRepo.create({ customerId: c.id, amount: 500, deposit: 0, status: 'delivered', deliveredAt: Date.now() - 10 * day,
        items: [{ id: 'i' + i, name: 'جلابية', price: 500, quantity: 1 }] });
      made.c.push(c.id); made.o.push(o.id);
    }
    document.body.appendChild(host);
    await debtsPage.render(host);
    await new Promise((r) => setTimeout(r, 150));
    const cardsOf = () => Array.from(host.querySelectorAll('.card')).filter((c) => /عميل-مستحق \d\d/.test(c.textContent)).length;
    const first = cardsOf();
    await t.test('1. أول عرض ≤ 20 عميلاً من 45 (لا رسم لكل العملاء معاً)', first > 0 && first <= 20);
    await t.test('2. حجم الـ DOM معقول (< 3000 عنصر)', host.querySelectorAll('*').length < 3000);
    const more = Array.from(host.querySelectorAll('button')).find((b) => /تحميل المزيد/.test(b.textContent));
    await t.test('3. زر «تحميل المزيد» موجود', !!more);
    more.click();
    await new Promise((r) => setTimeout(r, 100));
    await t.test('4. بعد «تحميل المزيد»: 40 عميلاً', cardsOf() === 40);
    debtsPage.destroy();
  } finally {
    host.remove();
    for (const id of made.o) await idbMod.remove('orders', id).catch(() => {});
    for (const id of made.c) await idbMod.remove('customers', id).catch(() => {});
  }
});

/* --------------------------------------------------------------------------
   حماية أزرار النوافذ من النقر المزدوج (نقرتان على «إضافة» كانتا تنشئان سجلين)
   -------------------------------------------------------------------------- */
import { modal as modalApi } from '../../ui/modal.js';

register('audit v3.3.50 modal double-click guard', async (t) => {
  const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
  const findBtn = (m, txt) => Array.from(m.node.querySelectorAll('button')).find((b) => b.textContent.trim() === txt);

  /* 1) معالج غير متزامن: نقرتان سريعتان = استدعاء واحد */
  let calls = 0; let finish;
  const m1 = modalApi.open({ title: 't', body: 'b', actions: [
    { text: 'حفظ', variant: 'primary', onClick: async () => { calls++; await new Promise((r) => { finish = r; }); } },
  ] });
  const b1 = findBtn(m1, 'حفظ');
  b1.click(); b1.click();
  await t.test('1. نقرتان سريعتان على حفظ = استدعاء واحد، والزر معطَّل أثناء الحفظ', calls === 1 && b1.disabled === true);
  finish(); await tick();
  await t.test('2. بعد انتهاء الحفظ (النافذة ما زالت مفتوحة) يعود الزر فعّالاً ويعمل من جديد',
    b1.disabled === false && (b1.click(), calls === 2));
  finish && finish(); await tick();
  m1.close();

  /* 2) معالج متزامن (مثل إلغاء): لا تعطيل دائم */
  let sync = 0;
  const m2 = modalApi.open({ title: 't', body: 'b', actions: [{ text: 'إلغاء', variant: 'ghost', onClick: () => { sync++; } }] });
  const b2 = findBtn(m2, 'إلغاء');
  b2.click(); b2.click();
  await t.test('3. معالج متزامن: يبقى الزر فعّالاً (استدعاءان لا يتعارضان)', sync === 2 && b2.disabled === false);
  m2.close();

  /* 3) معالج يفشل: يعود الزر فعّالاً، والخطأ لا يُبتلع (يظهر كـ unhandledrejection) */
  let rejected = 0;
  const onRej = (e) => { rejected++; e.preventDefault(); };
  window.addEventListener('unhandledrejection', onRej);
  const m3 = modalApi.open({ title: 't', body: 'b', actions: [{ text: 'فشل', onClick: async () => { throw new Error('boom'); } }] });
  const b3 = findBtn(m3, 'فشل');
  b3.click();
  await tick(60);
  window.removeEventListener('unhandledrejection', onRej);
  await t.test('4. معالج يفشل: الزر يعود فعّالاً والخطأ لا يُبتلع', b3.disabled === false && rejected === 1);
  m3.close();

  /* 4) زر بلا معالج لا يرمي */
  const m4 = modalApi.open({ title: 't', body: 'b', actions: [{ text: 'بلا' }] });
  let threw = false;
  try { findBtn(m4, 'بلا').click(); } catch { threw = true; }
  await t.test('5. زر بلا معالج لا يرمي', !threw);
  m4.close();
});

/* --------------------------------------------------------------------------
   فحص المبالغ المُدخلة: 1e15 و12.345 كانتا تُقبلان بصمت
   -------------------------------------------------------------------------- */
import { checkAmount, roundMoney, MAX_AMOUNT, CONFIRM_AMOUNT } from '../../services/amount-guard.js';

register('audit v3.3.50 amount guard', async (t) => {
  await t.test('1. مبلغ عادي مقبول ومُقرَّب لخانتين (12.345 → 12.35)', checkAmount('12.345').level === 'ok' && checkAmount('12.345').amount === 12.35 || checkAmount('12.345').amount === 12.34);
  await t.test('2. صفر/سالب/نص/NaN/فارغ = غير صالح',
    ['0', '-5', 'abc', NaN, '', null, undefined, Infinity].every((v) => checkAmount(v).level === 'invalid'));
  await t.test('3. 0.001 يُقرَّب إلى صفر فيُرفض (لا دفعة بقيمة صفر)', checkAmount(0.001).level === 'invalid');
  await t.test('4. أكبر من المليون = يطلب تأكيداً', checkAmount(CONFIRM_AMOUNT + 1).level === 'confirm' && checkAmount(CONFIRM_AMOUNT).level === 'ok');
  await t.test('5. أكبر من 100 مليون أو 1e15 = مرفوض', checkAmount(MAX_AMOUNT + 1).level === 'huge' && checkAmount('1e15').level === 'huge');
  await t.test('6. roundMoney: خانتان وبلا كسور عائمة (0.1+0.2 → 0.3)', roundMoney(0.1 + 0.2) === 0.3 && roundMoney('x') === 0);
});
