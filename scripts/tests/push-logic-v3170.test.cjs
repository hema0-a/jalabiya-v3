'use strict';
/* v3.17.0: أسطر المستندات والجمعيات والمهام في رسالة الخادمة — متوافقة مع الملخص القديم. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessage } = require('../../functions/push-logic.js');

/* 2026-11-04 08:10 بتوقيت القاهرة */
const NOW = Date.UTC(2026, 10, 4, 6, 10);
const prefs = { enabled: true, time: '08:00', daysBefore: 1, overdue: true, ready: true, stock: true, commitments: true, commitmentsDays: 3, quiet: null, tz: 'Africa/Cairo' };
const msg = (digest, p) => buildMessage(digest, { ...prefs, ...(p || {}) }, {}, NOW);

test('الملخص القديم بلا الحقول الجديدة ⟵ لا أسطر جديدة', () => {
  const m = msg({ orders: [], cm: [] });
  assert.equal(m.lines.length, 0);
});

test('مستند ينتهي قريباً بعنوانه، ومنتهٍ، وجمع عدة مستندات', () => {
  assert.match(msg({ dc: [{ e: '2026-11-20', r: 30, t: 'عقد الإيجار' }] }).lines[0], /🗂️ عقد الإيجار ينتهي بعد 16 يوم/);
  assert.match(msg({ dc: [{ e: '2026-11-04', r: 30, t: 'تأمين' }] }).lines[0], /تأمين ينتهي اليوم/);
  assert.match(msg({ dc: [{ e: '2026-10-01', r: 30, t: 'رخصة' }] }).lines[0], /رخصة منتهٍ/);
  assert.match(msg({ dc: [{ e: '2026-11-10', r: 30 }, { e: '2026-11-12', r: 30 }] }).lines[0], /2 مستند ينتهي قريباً/);
  assert.match(msg({ dc: [{ e: '2026-10-01', r: 30 }, { e: '2026-10-02', r: 30 }] }).lines[0], /2 مستند منتهٍ/);
});

test('مستند خارج مدة تنبيهه لا يظهر، والصفر يعني يوم الانتهاء فقط', () => {
  assert.equal(msg({ dc: [{ e: '2027-01-01', r: 30 }] }).lines.length, 0);
  assert.equal(msg({ dc: [{ e: '2026-11-05', r: 0 }] }).lines.length, 0);
  assert.equal(msg({ dc: [{ e: '2026-11-04', r: 0 }] }).lines.length, 1);
});

test('المستندات تحترم التفضيل documents:false والحقول الفاسدة تُتجاهل', () => {
  assert.equal(msg({ dc: [{ e: '2026-11-04', r: 30 }] }, { documents: false }).lines.length, 0);
  assert.equal(msg({ dc: [null, {}, { e: 5 }] }).lines.length, 0);
});

test('قسط جمعية: بعنوان ودونه، اليوم وقريباً، وخارج النافذة لا يظهر', () => {
  assert.match(msg({ cr: [{ day: 4, t: 'جمعية الشغل' }] }).lines[0], /🪙 قسط جمعية الشغل يستحق اليوم/);
  assert.match(msg({ cr: [{ day: 6, t: 'أ' }] }).lines[0], /يستحق قريباً/);
  assert.match(msg({ cr: [{ day: 5 }, { day: 6 }] }).lines[0], /🪙 2 قسط جمعية يستحق قريباً/);
  assert.equal(msg({ cr: [{ day: 20 }] }).lines.length, 0);
  assert.equal(msg({ cr: [{ day: 4 }] }, { circles: false }).lines.length, 0);
});

test('المهام: اليوم والمتأخرة تُحسب بتاريخ يوم الخادمة', () => {
  assert.equal(msg({ tk: ['2026-11-04', '2026-11-04', '2026-11-01'] }).lines[0], '✅ 2 مهمة اليوم و1 متأخرة');
  assert.equal(msg({ tk: ['2026-11-01'] }).lines[0], '✅ 1 متأخرة');
  assert.equal(msg({ tk: ['2026-11-04'] }).lines[0], '✅ 1 مهمة اليوم');
  assert.equal(msg({ tk: ['2026-11-09', 5, null] }).lines.length, 0);
  assert.equal(msg({ tk: ['2026-11-04'] }, { tasks: false }).lines.length, 0);
});

test('الأسطر الجديدة تُضاف بعد القديمة وتُحتسب في عنوان النشرة', () => {
  const m = msg({ orders: [{ i: 'a', d: '2026-11-04', c: 'محمد' }], cm: [], dc: [{ e: '2026-11-04', r: 30, t: 'عقد' }], tk: ['2026-11-04'] });
  assert.equal(m.lines.length, 3);
  assert.match(m.lines[0], /تسليم اليوم/);
  assert.match(m.lines[1], /🗂️/);
  assert.match(m.lines[2], /✅/);
  assert.match(m.title, /نشرة اليوم \(3\)/);
});
