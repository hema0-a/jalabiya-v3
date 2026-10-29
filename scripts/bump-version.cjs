#!/usr/bin/env node
/* bump-version.cjs — يرفع رقم الإصدار في كل الأماكن دفعة واحدة.
   npm run bump -- 3.3.36            ← رقم صريح
   npm run bump -- patch|minor|major
   يحدّث: package.json · config.js · sw.js · README.md، ويضيف قالب إدخال في أعلى CHANGELOG.md.
   بعدها: اكتب ملاحظات الإصدار في CHANGELOG ثم شغّل npm run check. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const p = (f) => path.join(ROOT, f);
const read = (f) => fs.readFileSync(p(f), 'utf8');

const pkg = JSON.parse(read('package.json'));
const arg = process.argv[2];
if (!arg) { console.error('الاستخدام: npm run bump -- <3.3.36 | patch | minor | major>'); process.exit(1); }
let [a, b, c] = pkg.version.split('.').map(Number);
let next = arg;
if (arg === 'patch') next = `${a}.${b}.${c + 1}`;
else if (arg === 'minor') next = `${a}.${b + 1}.0`;
else if (arg === 'major') next = `${a + 1}.0.0`;
if (!/^\d+\.\d+\.\d+$/.test(next)) { console.error('رقم إصدار غير صالح: ' + next); process.exit(1); }
const old = pkg.version;
if (next === old) { console.error('الإصدار الحالي هو نفسه: ' + old); process.exit(1); }

function sub(file, re, to) {
  const s = read(file);
  if (!re.test(s)) throw new Error(`لم أجد النمط في ${file}`);
  fs.writeFileSync(p(file), s.replace(re, to));
}
sub('package.json', /("version":\s*")[^"]+"/, `$1${next}"`);
sub('src/core/config.js', /(version:\s*')[^']+'/, `$1${next}'`);
sub('sw.js', /(CACHE_VERSION\s*=\s*')v[^']+'/, `$1v${next}'`);
sub('sw.js', /(الإصدار:\s*)v[\d.]+/, `$1v${next}`);
sub('README.md', /(\*\*الإصدار:\*\*\s*)v[\d.]+/, `$1v${next}`);
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
sub('CHANGELOG.md', /^## \[/m, `## [${next}] — ${date} — (عنوان الإصدار)\n\n- \n\n---\n\n## [`);
console.log(`✓ ${old} → ${next}\n  الخطوة التالية: عدّل عنوان وملاحظات الإصدار في CHANGELOG.md ثم npm run check`);
