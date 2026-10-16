/* precache.cjs — منطق توليد قائمة PRECACHE_URLS في sw.js (مشترك بين gen-precache و check-consistency).
   القاعدة: كل ملف يحتاجه التطبيق offline يُكتشف من القرص، فلا يُكتب بالإيد ولا يُنسى:
     - القشرة: ./  index.html  manifest.json
     - styles/*.css (كل الملفات)
     - كل الملفات تحت assets
     - كل ملفات js تحت src ما عدا مجلد src/tests (وحدات الاختبار لا تُخزَّن؛ صفحة الاختبارات src/pages/tests.js تُخزَّن)
   الناتج مرتّب ترتيباً ثابتاً (codepoint) فلا يتغير الملف بلا سبب. */
'use strict';
const fs = require('fs');
const path = require('path');

const BEGIN = '/* @generated:begin — scripts/gen-precache.cjs (لا تعدّل هذه القائمة يدوياً؛ شغّل: npm run gen:precache) */';
const END = '/* @generated:end */';
const WARN_BIG_BYTES = 300 * 1024;

function walk(root, dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(root, rel, out); else out.push(rel);
  }
  return out;
}

const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** @returns {{groups:Array<{title:string, files:string[]}>, all:string[], big:Array<{file:string,bytes:number}>}} */
function computeList(root) {
  const exists = (f) => fs.existsSync(path.join(root, f));
  const shell = ['index.html', 'manifest.json'].filter(exists);
  const styles = walk(root, 'styles').filter((f) => f.endsWith('.css')).sort(byCodepoint);
  const assets = walk(root, 'assets').sort(byCodepoint);
  const src = walk(root, 'src')
    .filter((f) => f.endsWith('.js') && !f.startsWith('src/tests/'))
    .sort(byCodepoint);

  const groups = [{ title: 'Core shell', files: ['.', ...shell] }];
  if (styles.length) groups.push({ title: 'Styles', files: styles });
  if (assets.length) groups.push({ title: 'Assets', files: assets });
  const entry = ['src/main.js', 'src/pwa.js'].filter((f) => src.includes(f));
  if (entry.length) groups.push({ title: 'Main entry', files: entry });
  const rest = src.filter((f) => !entry.includes(f));
  const dirs = [...new Set(rest.map((f) => f.split('/').slice(0, -1).join('/')))].sort(byCodepoint);
  for (const d of dirs) groups.push({ title: d, files: rest.filter((f) => f.split('/').slice(0, -1).join('/') === d) });

  const all = groups.flatMap((g) => g.files);
  const big = [];
  for (const f of all) {
    if (f === '.') continue;
    try { const b = fs.statSync(path.join(root, f)).size; if (b > WARN_BIG_BYTES) big.push({ file: f, bytes: b }); } catch (e) { /* ignore */ }
  }
  return { groups, all, big };
}

const urlOf = (f) => (f === '.' ? './' : './' + f);

/** نص الجسم المولَّد بين العلامتين (بدون الأقواس). */
function renderBody(groups) {
  const lines = ['  ' + BEGIN];
  groups.forEach((g, i) => {
    if (i > 0) lines.push('');
    lines.push('  /* --- ' + g.title + ' --- */');
    for (const f of g.files) lines.push("  '" + urlOf(f) + "',");
  });
  lines.push('  ' + END);
  return lines.join('\n');
}

/** يستخرج كتلة PRECACHE_URLS من نص sw.js. */
function locateBlock(sw) {
  const m = /(const PRECACHE_URLS = \[)\n([\s\S]*?)\n(\];)/.exec(sw);
  if (!m) return null;
  return { start: m.index + m[1].length + 1, end: m.index + m[1].length + 1 + m[2].length, body: m[2] };
}

/** قائمة URLs الحالية في sw.js (للمقارنة). */
function currentUrls(sw) {
  const b = locateBlock(sw);
  if (!b) return null;
  return [...b.body.matchAll(/'(\.[^']*)'/g)].map((m) => m[1]);
}

/** sw.js جديد بالقائمة المولَّدة. يُرجع null إن لم توجد الكتلة. */
function applyToSw(sw, groups) {
  const b = locateBlock(sw);
  if (!b) return null;
  return sw.slice(0, b.start) + renderBody(groups) + sw.slice(b.end);
}

module.exports = { computeList, renderBody, locateBlock, currentUrls, applyToSw, urlOf, BEGIN, END };
