'use strict';
/* v3.18.0 — تكافؤ «نشرة اليوم»: services/daily-brief.js (التطبيق) ≡ functions/push-logic.js (الجوال).
   نفس المدخلات تُمرَّر للنسختين، ويُشترط تطابق الأعداد المنظَّمة تماماً، وأن تذكر أسطر الإشعار نفس الأعداد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const server = require('../../functions/push-logic.js');
const briefUrl = pathToFileURL(path.join(__dirname, '..', '..', 'src', 'services', 'daily-brief.js')).href;

/* مولّد عشوائي ثابت البذرة (mulberry32) ليكون الاختبار قابلاً للإعادة */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const ymdPlus = (ms, tz, n) => {
  const lp = server.localParts(ms + n * 86400000, tz);
  return lp.ymd;
};

function sample(r) {
  const tz = pick(r, ['UTC', 'Africa/Cairo', 'America/New_York', 'Asia/Riyadh', 'Pacific/Auckland']);
  const now = Date.UTC(2026, int(r, 0, 11), int(r, 1, 28), int(r, 0, 23), int(r, 0, 59));
  const prefs = { tz, daysBefore: int(r, 0, 7), commitmentsDays: pick(r, [0, 1, 3, 7, 14]), overdue: true, ready: true, stock: true, commitments: true, documents: true, circles: true, tasks: true };
  const orders = Array.from({ length: int(r, 0, 25) }, (_, i) => {
    const o = { i: 'o' + i, r: r() < 0.25 ? 1 : 0 };
    if (r() < 0.9) o.d = ymdPlus(now, tz, int(r, -12, 12));
    return o;
  });
  const notified = {};
  orders.forEach((o) => { if (o.d && r() < 0.3) notified[o.i] = o.d; });
  const digest = { v: 1, at: now - int(r, 0, 60) * 3600000, orders, low: int(r, 0, 4), out: int(r, 0, 3) };
  /* v3.19.0: مؤجَّلات مركز العمل + ملخص الأسبوع */
  const sz = {}; orders.forEach((o) => { if (r() < 0.2) sz[o.i] = ymdPlus(now, tz, int(r, -3, 5)); });
  if (Object.keys(sz).length) digest.sz = sz;
  if (r() < 0.7) digest.wk = { inc: int(r, 0, 9000), exp: int(r, 0, 4000), del: int(r, 0, 12), ovd: int(r, 0, 5), rec: int(r, 0, 3000) };
  if (r() < 0.2) prefs.weekly = false;
  digest.cm = Array.from({ length: int(r, 0, 6) }, () => ({ day: int(r, 1, 31), t: 'ت' + int(r, 1, 9) }));
  if (r() < 0.8) digest.dc = Array.from({ length: int(r, 0, 6) }, () => ({ e: ymdPlus(now, tz, int(r, -40, 90)), r: pick(r, [0, 7, 30, 365]), t: 'م' + int(r, 1, 9) }));
  if (r() < 0.8) digest.cr = Array.from({ length: int(r, 0, 4) }, () => ({ day: int(r, 1, 31), t: 'ج' + int(r, 1, 9) }));
  if (r() < 0.8) digest.tk = Array.from({ length: int(r, 0, 8) }, () => ymdPlus(now, tz, int(r, -6, 6)));
  return { digest, prefs, state: { notified }, now };
}

test('تكافؤ الأعداد: 3000 حالة عشوائية (التطبيق ≡ الخادمة)', async () => {
  const brief = await import(briefUrl);
  const r = rng(20261111);
  for (let k = 0; k < 3000; k++) {
    const s = sample(r);
    const a = server.buildMessage(s.digest, s.prefs, s.state, s.now).counts;
    const b = brief.briefCounts(s.digest, s.prefs, s.state, s.now).counts;
    assert.deepEqual(b, a, 'حالة #' + k + ' ' + JSON.stringify(s));
  }
});

test('أسطر الإشعار تذكر نفس أعداد التطبيق (لا تناقض بين الرقمين)', async () => {
  const brief = await import(briefUrl);
  const r = rng(77);
  for (let k = 0; k < 1500; k++) {
    const s = sample(r);
    const m = server.buildMessage(s.digest, s.prefs, s.state, s.now);
    const c = brief.briefCounts(s.digest, s.prefs, s.state, s.now).counts;
    const body = m.body;
    const has = (re) => re.test(body);
    if (c.overdue) assert.ok(has(new RegExp('🚨 ' + c.overdue + ' طلب متأخر')), 'متأخر ' + k); else assert.ok(!has(/🚨/), 'لا متأخر ' + k);
    if (c.ready) assert.ok(has(new RegExp('✅ ' + c.ready + ' جاهز')), 'جاهز ' + k); else assert.ok(!has(/جاهز لم يُستلم/), 'لا جاهز ' + k);
    if (c.out || c.low) assert.ok(has(/📦/), 'مخزون ' + k); else assert.ok(!has(/📦/), 'لا مخزون ' + k);
    assert.equal(has(/💳/), c.commitments > 0, 'التزامات ' + k);
    assert.equal(has(/🪙/), c.circles > 0, 'جمعيات ' + k);
    assert.equal(has(/🗂️/), c.docsExpired + c.docsNear > 0, 'مستندات ' + k);
    if (c.today) assert.ok(has(new RegExp(c.today === 1 ? '⏰' : '⏰ ' + c.today + ' طلب يُسلَّم اليوم')), 'اليوم ' + k); else assert.ok(!has(/⏰/), 'لا اليوم ' + k);
    if (c.tasksToday || c.tasksOverdue) assert.ok(has(/✅ .*(مهمة اليوم|متأخرة)/), 'مهام ' + k);
    assert.equal(has(/📈 أسبوعك/), c.weekly === 1, 'أسبوعك ' + k);
  }
});

test('الطلب الجاهز لا يتكرر في اليوم/القريب/المتأخر (قاعدة v3.18.0)', async () => {
  const brief = await import(briefUrl);
  const now = Date.UTC(2026, 10, 11, 9, 0);
  const tz = 'UTC';
  const digest = { orders: [
    { i: 'a', r: 1, d: '2026-11-11' },   // جاهز وموعده اليوم
    { i: 'b', r: 1, d: '2026-11-12' },   // جاهز وموعده غداً
    { i: 'c', r: 1, d: '2026-11-01' },   // جاهز ومتأخر
    { i: 'd', r: 0, d: '2026-11-11' },   // يُسلَّم اليوم فعلاً
  ] };
  const prefs = { tz, daysBefore: 3 };
  const c = brief.briefCounts(digest, prefs, {}, now).counts;
  assert.deepEqual([c.ready, c.today, c.soon, c.overdue], [3, 1, 0, 0]);
  const m = server.buildMessage(digest, prefs, {}, now);
  assert.deepEqual([m.counts.ready, m.counts.today, m.counts.soon, m.counts.overdue], [3, 1, 0, 0]);
});

test('daily-brief.js نقي: بلا استيرادات ولا DOM ولا شبكة', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'daily-brief.js'), 'utf8');
  assert.doesNotMatch(src, /^import\s/m);
  assert.doesNotMatch(src, /document\.|window\.|fetch\(|localStorage/);
});

test('v3.19.0: سطر «أسبوعك» يوم الجمعة فقط ومن ملخص حديث، وبلا طلبات أخرى يكفي لإرسال إشعار', async () => {
  const brief = await import(briefUrl);
  const fri = Date.UTC(2026, 10, 13, 9, 0);   /* الجمعة 13 نوفمبر 2026 */
  const prefs = { tz: 'UTC', daysBefore: 1 };
  const digest = { at: fri - 3600000, orders: [], wk: { inc: 12500, exp: 3000, del: 7, ovd: 2, rec: 900 } };
  const m = server.buildMessage(digest, prefs, {}, fri);
  assert.match(m.body, /📈 أسبوعك: محصّل 12,500 ج · مصروف 3,000 ج · سُلِّم 7 · متأخر 2/);
  assert.equal(m.counts.weekly, 1);
  assert.equal(brief.briefCounts(digest, prefs, {}, fri).counts.weekly, 1);
  const thu = fri - 86400000;   /* الخميس: لا سطر */
  assert.doesNotMatch(server.buildMessage(digest, prefs, {}, thu).body, /📈/);
  const stale = { ...digest, at: fri - 72 * 3600000 };   /* ملخص عمره 3 أيام: لا أرقام قديمة */
  assert.equal(server.buildMessage(stale, prefs, {}, fri).counts.weekly, 0);
  assert.equal(server.buildMessage(digest, { ...prefs, weekly: false }, {}, fri).counts.weekly, 0);
});

test('v3.19.0: الطلب المؤجَّل من مركز العمل يختفي من كل الأقسام حتى يوم عودته', async () => {
  const brief = await import(briefUrl);
  const now = Date.UTC(2026, 10, 11, 9, 0);
  const prefs = { tz: 'UTC', daysBefore: 3 };
  const orders = [{ i: 'a', r: 0, d: '2026-11-01' }, { i: 'b', r: 1 }, { i: 'c', r: 0, d: '2026-11-11' }, { i: 'd', r: 0, d: '2026-11-12' }];
  const base = { at: now, orders };
  assert.deepEqual(['overdue', 'ready', 'today', 'soon'].map((k) => server.buildMessage(base, prefs, {}, now).counts[k]), [1, 1, 1, 1]);
  const sz = { a: '2026-11-12', b: '2026-11-12', c: '2026-11-12', d: '2026-11-11' };   /* d: عاد اليوم فلا يُخفى */
  const m = server.buildMessage({ ...base, sz }, prefs, {}, now);
  assert.deepEqual(['overdue', 'ready', 'today', 'soon'].map((k) => m.counts[k]), [0, 0, 0, 1]);
  assert.deepEqual(brief.briefCounts({ ...base, sz }, prefs, {}, now).counts, m.counts);
});
