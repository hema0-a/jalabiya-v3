'use strict';
/* ==========================================================================
   Cloud Functions — إشعارات Push لورشة الجلابيب (v3)
   ==========================================================================
   1) dailyPush  : كل 15 دقيقة تمرّ على مستندات users_v3/{uid}/push/main وترسل
                   إشعاراً واحداً يومياً (في الوقت الذي اختاره المستخدم) بما يستحق.
   2) pushTest   : عند كتابة users_v3/{uid}/push/testRequest ترسل إشعاراً تجريبياً
                   لكل أجهزة الحساب.
   الرسائل data-only؛ الـ Service Worker (sw.js) يعرضها.
   النشر: انظر docs/PUSH-SETUP.md (خطة Blaze مطلوبة).
   ========================================================================== */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { isDue, buildMessage } = require('./push-logic');

admin.initializeApp();
const db = admin.firestore();
const REGION = 'europe-west1';

const INVALID = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** إرسال رسالة لكل رموز المستند وحذف الرموز الميتة. يرجع عدد الناجح. */
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
  });
  if (Object.keys(dead).length) await mainRef.update(dead).catch(() => {});
  return res.successCount;
}

exports.dailyPush = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Africa/Cairo', region: REGION, memory: '256MiB', timeoutSeconds: 120 },
  async () => {
    const now = Date.now();
    const snap = await db.collectionGroup('push').get();
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
          if (sent > 0 && msg.ids.length) {
            const notified = Object.assign({}, state.notified || {});
            const byId = new Map((digest.orders || []).map((o) => [o.i, o.d]));
            msg.ids.forEach((id) => { notified[id] = byId.get(id) || msg.today; });
            /* نُبقي آخر 300 فقط */
            const keys = Object.keys(notified);
            if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete notified[k]);
            patch.notified = notified;
          }
          if (sent === 0) delete patch.lastSentDay; /* لم يصل لأحد: أعد المحاولة في الدورة التالية */
        }
        if (patch.lastSentDay || patch.notified) await stateRef.set(patch, { merge: true });
      } catch (e) {
        console.error('dailyPush failed for', doc.ref.path, e);
      }
    }
  }
);

exports.pushTest = onDocumentWritten(
  { document: 'users_v3/{uid}/push/testRequest', region: REGION },
  async (event) => {
    if (!event.data || !event.data.after.exists) return;
    const mainRef = db.doc('users_v3/' + event.params.uid + '/push/main');
    const main = (await mainRef.get()).data() || {};
    const sent = await sendToTokens(mainRef, main.tokens, {
      title: '🔔 اختبار الإشعارات', body: 'الإشعارات الحقيقية تعمل بنجاح ✅', url: '#/dashboard', tag: 'jalabiya-test',
    });
    console.log('pushTest sent=', sent, 'uid=', event.params.uid);
  }
);
