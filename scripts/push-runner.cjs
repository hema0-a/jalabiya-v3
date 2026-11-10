'use strict';
/* ==========================================================================
   push-runner.cjs — بديل مجاني لـ Cloud Functions: يعمل على GitHub Actions
   (خطة Spark بلا بطاقة). نفس منطق functions/index.js:
   1) الإشعار اليومي: لكل users_v3/{uid}/push/main يطبّق isDue/buildMessage.
   2) الاختبار: إن كتب التطبيق users_v3/{uid}/push/testRequest بعد آخر معالجة، يرسل إشعاراً تجريبياً.
   يحتاج متغير البيئة FIREBASE_SERVICE_ACCOUNT (محتوى JSON) وتثبيت functions/node_modules.
   ========================================================================== */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const { isDue, buildMessage } = require(path.join(__dirname, '..', 'functions', 'push-logic.js'));

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT غير موجود'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const INVALID = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

async function sendToTokens(mainRef, tokensMap, msg) {
  const entries = Object.entries(tokensMap || {}).filter(([, v]) => v && typeof v.t === 'string');
  if (!entries.length) return 0;
  const res = await admin.messaging().sendEachForMulticast({
    tokens: entries.map(([, v]) => v.t),
    data: { title: msg.title, body: msg.body, url: msg.url || '#/dashboard', tag: msg.tag || 'jalabiya-daily' },
    webpush: { headers: { Urgency: 'high', TTL: '43200' } },
  });
  const dead = {};
  res.responses.forEach((r, i) => {
    if (!r.success && r.error && INVALID.has(r.error.code)) dead['tokens.' + entries[i][0]] = admin.firestore.FieldValue.delete();
    if (!r.success && r.error) console.log('فشل إرسال لرمز:', r.error.code);
  });
  if (Object.keys(dead).length) await mainRef.update(dead).catch(() => {});
  return res.successCount;
}

(async () => {
  const now = Date.now();
  const snap = await db.collectionGroup('push').get();
  console.log('مستندات push:', snap.size);

  /* 1) طلبات الاختبار */
  for (const doc of snap.docs) {
    if (doc.id !== 'testRequest') continue;
    try {
      const at = Number((doc.data() || {}).at) || 0;
      const parent = doc.ref.parent;
      const stateRef = parent.doc('state');
      const state = (await stateRef.get()).data() || {};
      if (!at || at <= (Number(state.testHandledAt) || 0)) continue;
      const mainRef = parent.doc('main');
      const main = (await mainRef.get()).data() || {};
      const sent = await sendToTokens(mainRef, main.tokens, {
        title: '🔔 اختبار الإشعارات', body: 'الإشعارات الحقيقية تعمل بنجاح ✅', url: '#/dashboard', tag: 'jalabiya-test',
      });
      console.log('test sent=', sent, 'path=', doc.ref.path);
      await stateRef.set({ testHandledAt: at }, { merge: true });
    } catch (e) { console.error('test failed for', doc.ref.path, e); }
  }

  /* 2) الإشعار اليومي */
  for (const doc of snap.docs) {
    if (doc.id !== 'main') continue;
    try {
      const data = doc.data() || {};
      const prefs = data.prefs; const digest = data.digest;
      if (!prefs || !digest) continue;
      const stateRef = doc.ref.parent.doc('state');
      const state = (await stateRef.get()).data() || {};
      if (!isDue(prefs, state, now)) continue;

      const msg = buildMessage(digest, prefs, state, now);
      const patch = { lastSentDay: msg.today };
      if (msg.lines.length) {
        const sent = await sendToTokens(doc.ref, data.tokens, { title: msg.title, body: msg.body, url: msg.url, tag: 'jalabiya-daily' });
        console.log('daily sent=', sent, 'path=', doc.ref.path);
        if (sent > 0 && msg.ids.length) {
          const notified = Object.assign({}, state.notified || {});
          const byId = new Map((digest.orders || []).map((o) => [o.i, o.d]));
          msg.ids.forEach((id) => { notified[id] = byId.get(id) || msg.today; });
          const keys = Object.keys(notified);
          if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete notified[k]);
          patch.notified = notified;
        }
        if (sent === 0) delete patch.lastSentDay;
      }
      if (patch.lastSentDay || patch.notified) await stateRef.set(patch, { merge: true });
    } catch (e) { console.error('daily failed for', doc.ref.path, e); }
  }
  console.log('انتهى');
})().catch((e) => { console.error(e); process.exit(1); });
