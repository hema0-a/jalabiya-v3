'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { localParts, diffDays, inQuiet, isDue, buildMessage } = require('../../functions/push-logic.js');

/* 2026-11-04 08:10 بتوقيت القاهرة (UTC+2 شتاءً) = 06:10 UTC */
const NOW = Date.UTC(2026, 10, 4, 6, 10);
const prefs = { enabled: true, time: '08:00', daysBefore: 1, overdue: true, ready: true, stock: true, commitments: true, commitmentsDays: 3, quiet: null, tz: 'Africa/Cairo' };

test('localParts يحوّل للمنطقة الزمنية', () => {
  const p = localParts(NOW, 'Africa/Cairo');
  assert.equal(p.ymd, '2026-11-04'); assert.equal(p.minutes, 8 * 60 + 10); assert.equal(p.day, 4);
});

test('diffDays', () => {
  assert.equal(diffDays('2026-11-04', '2026-11-05'), 1);
  assert.equal(diffDays('2026-11-04', '2026-10-31'), -4);
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
});

test('inQuiet يدعم العبور لمنتصف الليل', () => {
  const q = { from: '22:00', to: '07:00' };
  assert.ok(inQuiet(q, 23 * 60)); assert.ok(inQuiet(q, 3 * 60));
  assert.ok(!inQuiet(q, 12 * 60)); assert.ok(!inQuiet(q, 7 * 60)); assert.ok(!inQuiet(null, 60));
});

test('isDue: بعد الوقت المختار ومرة واحدة يومياً', () => {
  assert.equal(isDue(prefs, {}, NOW), true);
  assert.equal(isDue(prefs, { lastSentDay: '2026-11-04' }, NOW), false, 'أُرسل اليوم');
  assert.equal(isDue({ ...prefs, enabled: false }, {}, NOW), false);
  assert.equal(isDue({ ...prefs, time: '09:00' }, {}, NOW), false, 'قبل الوقت');
  assert.equal(isDue({ ...prefs, time: '04:00' }, {}, NOW), false, 'تجاوز نافذة 3 ساعات');
  assert.equal(isDue({ ...prefs, quiet: { from: '07:00', to: '09:00' } }, {}, NOW), false, 'ساعات الهدوء');
});

test('buildMessage: اليوم + قريب + متأخر + جاهز + مخزون + التزام', () => {
  const digest = {
    orders: [
      { i: 'a', d: '2026-11-04', c: 'محمد' },
      { i: 'b', d: '2026-11-05', c: 'علي' },
      { i: 'c', d: '2026-11-01' },
      { i: 'd', r: 1 },
    ],
    low: 2, out: 1, cm: [{ day: 5, t: 'إيجار' }, { day: 28 }],
  };
  const m = buildMessage(digest, prefs, {}, NOW);
  assert.equal(m.lines.length, 6);
  assert.match(m.lines[0], /تسليم اليوم: محمد/);
  assert.match(m.lines[1], /علي — تسليمه بعد 1 يوم/);
  assert.deepEqual(m.ids, ['b']);
  assert.ok(m.lines.some((l) => l.includes('1 طلب متأخر')));
  assert.ok(m.lines.some((l) => l.includes('1 جاهز لم يُستلم')));
  assert.ok(m.lines.some((l) => l.includes('1 نفد') && l.includes('2 ناقص')));
  assert.ok(m.lines.some((l) => l.includes('إيجار')));
  assert.equal(m.url, '#/orders'); assert.match(m.title, /\(6\)/);
});

test('buildMessage: لا يكرر تنبيه «قريب» لنفس الطلب والموعد', () => {
  const digest = { orders: [{ i: 'b', d: '2026-11-05', c: 'علي' }], low: 0, out: 0, cm: [] };
  const m = buildMessage(digest, prefs, { notified: { b: '2026-11-05' } }, NOW);
  assert.equal(m.lines.length, 0);
  /* لو تغيّر الموعد يُنبَّه من جديد */
  const m2 = buildMessage({ orders: [{ i: 'b', d: '2026-11-05' }], low: 0, out: 0, cm: [] }, prefs, { notified: { b: '2026-11-02' } }, NOW);
  assert.equal(m2.lines.length, 1);
});

test('buildMessage: بلا أسماء يذكر الأعداد فقط، والمفاتيح المعطّلة تُسقط أسطرها', () => {
  const digest = { orders: [{ i: 'a', d: '2026-11-04' }, { i: 'c', d: '2026-11-01' }, { i: 'd', r: 1 }], low: 3, out: 0, cm: [] };
  const m = buildMessage(digest, { ...prefs, overdue: false, ready: false, stock: false }, {}, NOW);
  assert.deepEqual(m.lines, ['⏰ 1 طلب يُسلَّم اليوم']);
});

test('التزام آخر الشهر: يوم 31 في شهر 30 يوماً يُعامل كآخر يوم', () => {
  const t = Date.UTC(2026, 10, 29, 6, 10); /* 29 نوفمبر */
  const m = buildMessage({ orders: [], low: 0, out: 0, cm: [{ day: 31, t: 'قسط' }] }, prefs, {}, t);
  assert.ok(m.lines[0].includes('قسط'));
});
