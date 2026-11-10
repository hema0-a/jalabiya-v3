'use strict';
/* v3.17.1: عقود البديل المجاني للدوال (GitHub Actions + push-runner) — قراءة مصدر فقط، بلا شبكة ولا firebase-admin. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const runner = read('scripts/push-runner.cjs');
const wf = read('.github/workflows/push-cron.yml');

test('المشغّل يستعمل نفس منطق الدوال (لا نسخة ثانية تتباعد)', () => {
  assert.match(runner, /require\(path\.join\(__dirname, '\.\.', 'functions', 'push-logic\.js'\)\)/);
  assert.match(runner, /\{ isDue, buildMessage \}/);
  assert.ok(fs.existsSync(path.join(root, 'functions', 'push-logic.js')));
});

test('المشغّل يقرأ الحساب من متغير بيئة ولا يطبع السرّ ولا يحفظه', () => {
  assert.match(runner, /process\.env\.FIREBASE_SERVICE_ACCOUNT/);
  assert.doesNotMatch(runner, /console\.(log|error|info)\([^)]*\braw\b/);
  assert.doesNotMatch(runner, /writeFileSync|appendFileSync/);
  assert.doesNotMatch(runner, /private_key/);
});

test('المشغّل يعالج الاختبار واليومي ويحذف الرموز الميتة ويقيّد المُرسَل سابقاً', () => {
  assert.match(runner, /testRequest/);
  assert.match(runner, /isDue\(prefs, state, now\)/);
  assert.match(runner, /buildMessage\(digest, prefs, state, now\)/);
  assert.match(runner, /registration-token-not-registered/);
  assert.match(runner, /keys\.length > 300/);
  assert.match(runner, /if \(sent === 0\) delete patch\.lastSentDay/);
});

test('الـWorkflow: جدولة + تشغيل يدوي + صلاحيات قراءة فقط + عدم التداخل', () => {
  assert.match(wf, /schedule:\s*\n\s*- cron: '\*\/30 \* \* \* \*'/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
  assert.match(wf, /concurrency:\s*\n\s*group: push-cron\s*\n\s*cancel-in-progress: false/);
  assert.match(wf, /timeout-minutes: \d+/);
});

test('الـWorkflow: السرّ من secrets فقط وتثبيت firebase-admin من functions', () => {
  assert.match(wf, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
  assert.match(wf, /npm install --prefix functions --omit=dev/);
  assert.match(wf, /node scripts\/push-runner\.cjs/);
  assert.doesNotMatch(wf, /BEGIN PRIVATE KEY|private_key/);
});

test('التوثيق يشرح الطريقتين ويحذّر من الجمع بينهما ومن تسريب المفتاح', () => {
  const doc = read('docs/PUSH-SETUP.md');
  assert.match(doc, /push-cron\.yml/);
  assert.match(doc, /Blaze مطلوبة فقط للطريقة الزرقاء/);
  assert.match(doc, /لا تشغّل الطريقتين معاً/);
  assert.match(doc, /60 يوماً/);
  assert.match(doc, /احذف\*\* المفتاح القديم/);
});
