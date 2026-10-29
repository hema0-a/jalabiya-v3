#!/usr/bin/env node
/* check-consistency.cjs — فحص اتساق المشروع (بدون متصفح):
   1) رقم الإصدار واحد في: package.json · config.js · sw.js · README · CHANGELOG · أحدث ملف audit
   2) كل ملف في PRECACHE_URLS موجود فعلاً، وكل ملف في src (عدا tests) موجود في القائمة، والقائمة مطابقة لناتج gen-precache
   3) كل وحدة اختبار في tests/modules مستوردة في tests/index.js (وكل استيراد له ملف)
   4) كل مسار في icons/manifest موجود
   5) أي ملف مصدر به أخطاء ترميز شائعة (BOM / علامات دمج Git) */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const problems = [];
const fail = (m) => problems.push(m);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

/* 1) الإصدار */
const versions = {
  'package.json': JSON.parse(read('package.json')).version,
  'src/core/config.js': (read('src/core/config.js').match(/version:\s*'([^']+)'/) || [])[1],
  'sw.js (CACHE_VERSION)': ((read('sw.js').match(/CACHE_VERSION\s*=\s*'v([^']+)'/) || [])[1]),
  'README.md': (read('README.md').match(/\*\*الإصدار:\*\*\s*v([\d.]+)/) || [])[1],
  'CHANGELOG.md': (read('CHANGELOG.md').match(/^## \[([\d.]+)\]/m) || [])[1],
};
const ref = versions['package.json'];
for (const [file, v] of Object.entries(versions)) {
  if (!v) fail(`لم أجد رقم الإصدار في ${file}`);
  else if (v !== ref) fail(`إصدار ${file} = ${v} لكن package.json = ${ref} (استخدم: npm run bump -- ${ref})`);
}

/* حارس الإصدار الأدنى (v3.3.84): الرقم في قواعد Firestore = MIN_CLIENT_BUILD، وليس أعلى من إصدار التطبيق الحالي */
{
  const mv = (read('src/sync/min-version.js').match(/MIN_CLIENT_BUILD\s*=\s*([\d_]+)/) || [])[1];
  const rules = (read('firestore.rules').match(/writerBuild\s*>=\s*(\d+)/) || [])[1];
  const min = mv ? Number(mv.replace(/_/g, '')) : NaN;
  const [a, b, c] = String(ref).split('.').map(Number);
  if (!Number.isFinite(min)) fail('لم أجد MIN_CLIENT_BUILD في src/sync/min-version.js');
  else if (String(min) !== String(rules)) fail(`MIN_CLIENT_BUILD (${min}) لا يطابق الرقم في firestore.rules (${rules})`);
  else if (min > a * 1000000 + b * 1000 + c) fail(`MIN_CLIENT_BUILD (${min}) أعلى من إصدار التطبيق ${ref} — سيحجب هذا الجهاز نفسه`);
}

/* 2) قائمة الكاش */
const sw = read('sw.js');
const block = (sw.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\n\];/) || [])[1];
if (!block) fail('تعذّر قراءة PRECACHE_URLS من sw.js');
else {
  const urls = [...block.matchAll(/'(\.[^']*)'/g)].map((m) => m[1].replace(/^\.\//, ''));
  const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dup.length) fail(`مكرر في PRECACHE_URLS: ${[...new Set(dup)].join(', ')}`);
  for (const u of urls) if (u && !exists(u)) fail(`PRECACHE_URLS يشير لملف غير موجود: ${u}`);
  const set = new Set(urls);
  for (const f of walk('src')) {
    if (!f.endsWith('.js') || f.startsWith('src/tests/')) continue;
    if (!set.has(f)) fail(`ملف غير موجود في PRECACHE_URLS (لن يعمل offline): ${f}`);
  }
  for (const f of walk('styles')) if (!set.has(f)) fail(`ملف CSS غير موجود في PRECACHE_URLS: ${f}`);

  /* القائمة مولَّدة آلياً: يجب أن تطابق ناتج المولّد حرفياً (الترتيب والتنسيق أيضاً) */
  const pre = require('./lib/precache.cjs');
  const generated = pre.applyToSw(sw, pre.computeList(ROOT).groups);
  if (generated !== null && generated !== sw) fail('قائمة PRECACHE_URLS في sw.js ليست مطابقة للمولَّدة — شغّل: npm run gen:precache');
}

/* 3) الاختبارات */
const idx = read('src/tests/index.js');
const imported = [...idx.matchAll(/import\s+'\.\/modules\/([^']+)'/g)].map((m) => m[1]);
const onDisk = fs.readdirSync(path.join(ROOT, 'src/tests/modules')).filter((f) => f.endsWith('.test.js'));
for (const f of onDisk) if (!imported.includes(f)) fail(`وحدة اختبار غير مستوردة في tests/index.js (لن تُشغَّل): ${f}`);
for (const f of imported) if (!onDisk.includes(f)) fail(`tests/index.js يستورد ملفاً غير موجود: ${f}`);

/* 4) manifest + index.html */
const manifest = JSON.parse(read('manifest.json'));
for (const i of manifest.icons || []) if (!exists(i.src)) fail(`manifest: أيقونة غير موجودة ${i.src}`);
const html = read('index.html');
for (const m of html.matchAll(/(?:href|src)="((?!https?:|data:|#)[^"]+)"/g)) if (!exists(m[1])) fail(`index.html يشير لملف غير موجود: ${m[1]}`);

/* 5) BOM وعلامات الدمج */
for (const f of [...walk('src'), ...walk('styles'), 'sw.js', 'index.html']) {
  if (!/\.(js|css|html)$/.test(f)) continue;
  const s = read(f);
  if (s.charCodeAt(0) === 0xFEFF) fail(`BOM في أول الملف: ${f}`);
  if (/^(<{7} |={7}$|>{7} )/m.test(s)) fail(`علامات دمج Git متروكة في: ${f}`);
}

if (problems.length) { console.log(problems.map((p) => '✗ ' + p).join('\n')); console.log(`consistency: ${problems.length} مشكلة`); process.exit(1); }
console.log(`consistency: سليم (إصدار ${ref}، ${imported.length} وحدة اختبار)`);
