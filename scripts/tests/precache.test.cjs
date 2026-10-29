/* اختبارات مولّد قائمة الكاش (scripts/gen-precache.cjs + lib/precache.cjs). تشغيل: node --test scripts/tests */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { run, copyTree, tmpDir, REPO_ROOT } = require('./helpers.cjs');
const pre = require('../lib/precache.cjs');

function fixture() {
  const dir = tmpDir('jal-pc-');
  copyTree(REPO_ROOT, dir);
  return { dir, gen: (...a) => run('node', ['scripts/gen-precache.cjs', ...a], { cwd: dir }), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('القائمة الحالية في المشروع مطابقة للمولَّدة (لا انحراف)', () => {
  const r = run('node', ['scripts/gen-precache.cjs', '--check'], { cwd: REPO_ROOT });
  assert.equal(r.code, 0, r.out);
});

test('يضيف ملفاً جديداً تلقائياً ويزيل المحذوف، والتوليد idempotent', () => {
  const fx = fixture();
  try {
    fs.writeFileSync(path.join(fx.dir, 'src/services/zz-brand-new.js'), 'export const a = 1;\n');
    assert.equal(fx.gen('--check').code, 1, 'يجب أن يكتشف الملف المنسي');
    assert.equal(fx.gen().code, 0);
    const sw1 = fs.readFileSync(path.join(fx.dir, 'sw.js'), 'utf8');
    assert.match(sw1, /'\.\/src\/services\/zz-brand-new\.js'/);
    assert.equal(fx.gen('--check').code, 0);
    assert.equal(fx.gen().code, 0);
    assert.equal(fs.readFileSync(path.join(fx.dir, 'sw.js'), 'utf8'), sw1, 'التوليد المتكرر يجب ألا يغيّر شيئاً');
    fs.rmSync(path.join(fx.dir, 'src/services/zz-brand-new.js'));
    assert.equal(fx.gen().code, 0);
    assert.doesNotMatch(fs.readFileSync(path.join(fx.dir, 'sw.js'), 'utf8'), /zz-brand-new/);
  } finally { fx.cleanup(); }
});

test('لا يُدرج وحدات الاختبار، ويُدرج صفحة الاختبارات وكل CSS وكل الأيقونات', () => {
  const { all } = pre.computeList(REPO_ROOT);
  assert.ok(all.every((f) => !f.startsWith('src/tests/')), 'وحدات الاختبار يجب ألا تُخزَّن');
  assert.ok(all.includes('src/pages/tests.js'));
  for (const css of fs.readdirSync(path.join(REPO_ROOT, 'styles'))) assert.ok(all.includes('styles/' + css), css);
  for (const ic of fs.readdirSync(path.join(REPO_ROOT, 'assets/icons'))) assert.ok(all.includes('assets/icons/' + ic), ic);
  assert.ok(all.includes('.') && all.includes('index.html') && all.includes('manifest.json'));
});

test('كل مدخل في القائمة موجود على القرص، وsw.js المولَّد صالح نحوياً', () => {
  const fx = fixture();
  try {
    fx.gen();
    const sw = fs.readFileSync(path.join(fx.dir, 'sw.js'), 'utf8');
    for (const u of pre.currentUrls(sw)) if (u !== './') assert.ok(fs.existsSync(path.join(fx.dir, u)), u);
    assert.equal(run('node', ['--check', 'sw.js'], { cwd: fx.dir }).code, 0);
    const urls = pre.currentUrls(sw);
    assert.equal(new Set(urls).size, urls.length, 'مدخلات مكررة');
  } finally { fx.cleanup(); }
});

test('الترتيب ثابت (codepoint) ولا يتأثر بترتيب القرص', () => {
  const { groups } = pre.computeList(REPO_ROOT);
  for (const g of groups) {
    const sorted = [...g.files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (g.title === 'Core shell' || g.title === 'Main entry') continue;
    assert.deepEqual(g.files, sorted, g.title);
  }
});

test('يفشل بوضوح (2) إن لم توجد الكتلة في sw.js', () => {
  const fx = fixture();
  try {
    fs.writeFileSync(path.join(fx.dir, 'sw.js'), '// no list here\n');
    assert.equal(fx.gen().code, 2);
  } finally { fx.cleanup(); }
});

test('check-consistency يفشل عند قائمة قديمة ويرشد للحل', () => {
  const fx = fixture();
  try {
    fs.writeFileSync(path.join(fx.dir, 'src/services/zz-forgot.js'), 'export const b = 2;\n');
    const r = run('node', ['scripts/check-consistency.cjs'], { cwd: fx.dir });
    assert.equal(r.code, 1);
    assert.match(r.out, /gen:precache/);
    fx.gen();
    assert.equal(run('node', ['scripts/check-consistency.cjs'], { cwd: fx.dir }).code, 0);
  } finally { fx.cleanup(); }
});
