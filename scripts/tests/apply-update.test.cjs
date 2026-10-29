/* اختبارات scripts/apply-update.sh — مشروع مؤقت + remote حقيقي (bare). تشغيل: node --test scripts/tests */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { run, git, makeFixture, makeZip, PY, hasBash, hasUnzip, hasTar } = require('./helpers.cjs');

const can = hasBash && hasUnzip && hasTar && PY;
const T = (name, fn) => test(name, { skip: can ? false : 'يتطلب bash+unzip+tar+python' }, fn);

const apply = (fx, zip, ...args) => run('bash', ['scripts/apply-update.sh', zip, ...args], { cwd: fx.repo });
const currentVersion = () => JSON.parse(fs.readFileSync(path.join(fixtureRoot(), 'package.json'), 'utf8')).version;
/* CHANGELOG التحديث: أول إدخال بإصدار المشروع الحالي (فحص الاتساق يطابقه) ثم باقي السجل */
const changelogEntry = (title) => fs.readFileSync(path.join(fixtureRoot(), 'CHANGELOG.md'), 'utf8')
  .replace(/^## \[[0-9.]+\] — ([^—\n]*) — .*$/m, (m, date) => `## [${currentVersion()}] — ${date} — ${title}`);
function fixtureRoot() { return path.resolve(__dirname, '..', '..'); }
const GOOD_FILE = 'export const hello = () => 1;\n';

T('نجاح: يفك ويولّد الكاش ويفحص ويعمل commit ثم push، ورسالة الـ commit من CHANGELOG', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), {
      'src/services/new-thing.js': GOOD_FILE,
      'CHANGELOG.md': changelogEntry('ميزة تجريبية'),
    });
    const before = fx.head();
    const r = apply(fx, zip);
    assert.equal(r.code, 0, r.out);
    assert.notEqual(fx.head(), before, 'لم يُنشأ commit');
    assert.equal(fx.remoteHead(), fx.head(), 'لم يصل الـ push');
    assert.match(git(fx.repo, 'log', '-1', '--format=%s').stdout, new RegExp('^v' + currentVersion().replace(/\./g, '\\.') + ': ميزة تجريبية'));
    assert.match(fs.readFileSync(path.join(fx.repo, 'sw.js'), 'utf8'), /'\.\/src\/services\/new-thing\.js'/, 'لم يُضَف الملف الجديد لقائمة الكاش تلقائياً');
    assert.equal(git(fx.repo, 'status', '--porcelain').stdout.trim(), '');
  } finally { fx.cleanup(); }
});

T('جذر ملفوف: zip بمجلد واحد (مثل jalabiya-v3-main/) يُعامل كالمسطّح', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/wrapped.js': GOOD_FILE }, 'jalabiya-v3-main/');
    const r = apply(fx, zip, '-m', 'wrapped');
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(fx.repo, 'src/services/wrapped.js')));
    assert.ok(!fs.existsSync(path.join(fx.repo, 'jalabiya-v3-main')));
  } finally { fx.cleanup(); }
});

T('خطأ صياغة: يوقف قبل الرفع ويتراجع كلياً (لا commit ولا ملف متروك ولا push)', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/bad.js': 'export const = ;\n' });
    const before = fx.head(), remoteBefore = fx.remoteHead();
    const r = apply(fx, zip);
    assert.equal(r.code, 3, r.out);
    assert.equal(fx.head(), before);
    assert.equal(fx.remoteHead(), remoteBefore);
    assert.ok(!fs.existsSync(path.join(fx.repo, 'src/services/bad.js')));
    assert.equal(git(fx.repo, 'status', '--porcelain').stdout.trim(), '');
    assert.match(r.out, /تم التراجع/);
  } finally { fx.cleanup(); }
});

T('فشل اتساق (إصدار config ≠ package.json): يوقف ويتراجع', () => {
  const fx = makeFixture();
  try {
    const cfg = fs.readFileSync(path.join(fx.repo, 'src/core/config.js'), 'utf8').replace(/version:\s*'[^']+'/, "version: '9.9.9'");
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/core/config.js': cfg });
    const before = fx.head();
    const r = apply(fx, zip);
    assert.equal(r.code, 3, r.out);
    assert.equal(fx.head(), before);
    assert.match(fs.readFileSync(path.join(fx.repo, 'src/core/config.js'), 'utf8'), /version:\s*'\d+\.\d+\.\d+'/);
    assert.match(r.out, /9\.9\.9/);
  } finally { fx.cleanup(); }
});

T('شجرة عمل غير نظيفة: يرفض (2) دون لمس شيء', () => {
  const fx = makeFixture();
  try {
    fs.writeFileSync(path.join(fx.repo, 'scratch.txt'), 'x');
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/a.js': GOOD_FILE });
    const r = apply(fx, zip);
    assert.equal(r.code, 2, r.out);
    assert.ok(!fs.existsSync(path.join(fx.repo, 'src/services/a.js')));
    assert.ok(fs.existsSync(path.join(fx.repo, 'scratch.txt')), 'يجب ألا يمسّ ملف المستخدم');
  } finally { fx.cleanup(); }
});

T('DELETE.txt: يحذف الملفات المذكورة ولا يُنسخ هو نفسه', () => {
  const fx = makeFixture();
  try {
    fs.writeFileSync(path.join(fx.repo, 'docs/old.md'), 'old');
    git(fx.repo, 'add', '-A'); git(fx.repo, 'commit', '-q', '-m', 'add old'); git(fx.repo, 'push', '-q');
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/b.js': GOOD_FILE, 'DELETE.txt': '# قديم\ndocs/old.md\n' });
    const r = apply(fx, zip, '-m', 'del');
    assert.equal(r.code, 0, r.out);
    assert.ok(!fs.existsSync(path.join(fx.repo, 'docs/old.md')));
    assert.ok(!fs.existsSync(path.join(fx.repo, 'DELETE.txt')));
  } finally { fx.cleanup(); }
});

T('DELETE.txt بمسار خطر (..) يُرفض', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/c.js': GOOD_FILE, 'DELETE.txt': '../outside.txt\n' });
    const r = apply(fx, zip);
    assert.equal(r.code, 1, r.out);
    assert.ok(!fs.existsSync(path.join(fx.repo, 'src/services/c.js')), 'لا يجب أن يُنسخ شيء قبل رفض القائمة');
  } finally { fx.cleanup(); }
});

T('--dry-run: يطبّق ويفحص ثم يتراجع بلا commit', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/d.js': GOOD_FILE });
    const before = fx.head();
    const r = apply(fx, zip, '--dry-run');
    assert.equal(r.code, 0, r.out);
    assert.equal(fx.head(), before);
    assert.ok(!fs.existsSync(path.join(fx.repo, 'src/services/d.js')));
    assert.match(r.out, /d\.js/, 'يجب أن يعرض الملفات المتغيرة');
  } finally { fx.cleanup(); }
});

T('--no-push: commit محلي فقط والـ remote لا يتغير', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/e.js': GOOD_FILE });
    const remoteBefore = fx.remoteHead();
    const r = apply(fx, zip, '--no-push', '-m', 'local only');
    assert.equal(r.code, 0, r.out);
    assert.notEqual(fx.head(), remoteBefore);
    assert.equal(fx.remoteHead(), remoteBefore);
  } finally { fx.cleanup(); }
});

T('لا تغييرات (التحديث مطابق للمشروع): لا commit', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'README.md': fs.readFileSync(path.join(fx.repo, 'README.md')) });
    const before = fx.head();
    const r = apply(fx, zip);
    assert.equal(r.code, 0, r.out);
    assert.equal(fx.head(), before);
    assert.match(r.out, /لا تغييرات/);
  } finally { fx.cleanup(); }
});

T('مسار خطر داخل الـ zip (../): يُرفض (1) قبل الفك', () => {
  const fx = makeFixture();
  try {
    const zip = path.join(fx.base, 'evil.zip');
    const r0 = run(PY, ['-c', 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],"w")\nz.writestr("../evil.txt","x")\nz.writestr("src/ok.js","export const a=1;\\n")\nz.close()', zip]);
    assert.equal(r0.code, 0, r0.out);
    const r = apply(fx, zip);
    assert.equal(r.code, 1, r.out);
    assert.ok(!fs.existsSync(path.join(fx.base, 'evil.txt')));
    assert.ok(!fs.existsSync(path.join(fx.repo, 'src/ok.js')));
  } finally { fx.cleanup(); }
});

T('ملف غير موجود / zip تالف: خطأ (1) واضح', () => {
  const fx = makeFixture();
  try {
    assert.equal(apply(fx, path.join(fx.base, 'nope.zip')).code, 1);
    const bad = path.join(fx.base, 'bad.zip'); fs.writeFileSync(bad, 'not a zip');
    const r = apply(fx, bad);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /تالف/);
  } finally { fx.cleanup(); }
});

T('فشل push: الـ commit يبقى محلياً ورمز الخروج 4', () => {
  const fx = makeFixture();
  try {
    git(fx.repo, 'remote', 'set-url', 'origin', path.join(fx.base, 'does-not-exist.git'));
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/f.js': GOOD_FILE });
    const before = fx.head();
    const r = apply(fx, zip, '-m', 'x');
    assert.equal(r.code, 4, r.out);
    assert.notEqual(fx.head(), before, 'الـ commit المحلي يجب أن يبقى');
    assert.match(r.out, /git push/);
  } finally { fx.cleanup(); }
});

T('--skip-checks: يسمح بالمرور رغم الصياغة (للطوارئ فقط)', () => {
  const fx = makeFixture();
  try {
    const zip = makeZip(path.join(fx.base, 'p.zip'), { 'src/services/bad2.js': 'export const = ;\n' });
    const r = apply(fx, zip, '--skip-checks', '--no-push', '-m', 'unsafe');
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(fx.repo, 'src/services/bad2.js')));
  } finally { fx.cleanup(); }
});

T('خيار غير معروف / بلا ملف: يطبع الاستخدام (1)', () => {
  const fx = makeFixture();
  try {
    assert.equal(run('bash', ['scripts/apply-update.sh', '--bogus'], { cwd: fx.repo }).code, 1);
    assert.equal(run('bash', ['scripts/apply-update.sh'], { cwd: fx.repo }).code, 1);
    const h = run('bash', ['scripts/apply-update.sh', '--help'], { cwd: fx.repo });
    assert.equal(h.code, 0);
    assert.match(h.out, /--dry-run/);
  } finally { fx.cleanup(); }
});
