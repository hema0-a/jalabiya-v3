#!/usr/bin/env node
/* apply-v310.cjs — تحقق ما بعد النسخ لإصدار v3.5.10 (تقسيم commitments.js). لا يكتب أي ملف.
   التشغيل من جذر المستودع:  node apply-v310.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = __dirname;
let bad = 0;
const ok = (m) => console.log('✓ ' + m);
const no = (m) => { bad++; console.log('✗ ' + m); };

const files = {
  'src/pages/commitments.js': 88, 'src/pages/commitments-logic.js': 49, 'src/pages/commitments-load.js': 24,
  'src/pages/commitments-forms.js': 269, 'src/pages/commitments-actions.js': 157,
  'src/pages/commitments-cards.js': 157, 'src/pages/commitments-views.js': 334,
};
for (const [f, n] of Object.entries(files)) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { no(f + ' غير موجود'); continue; }
  const lines = fs.readFileSync(p, 'utf8').split('\n').length - 1;
  lines === n ? ok(`${f} (${lines} سطراً)`) : no(`${f}: ${lines} سطراً بدل ${n}`);
}
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
ver === '3.5.10' ? ok('package.json = 3.5.10') : no('package.json = ' + ver);

for (const args of [['scripts/gen-precache.cjs', '--check'], ['scripts/check-syntax.cjs'], ['scripts/check-consistency.cjs']]) {
  const r = spawnSync(process.execPath, args.map((a, i) => (i === 0 ? path.join(ROOT, a) : a)), { stdio: 'inherit', cwd: ROOT });
  r.status === 0 ? ok(args.join(' ')) : no(args.join(' '));
}
const t = spawnSync(process.execPath, ['--test', ...fs.readdirSync(path.join(ROOT, 'scripts/tests')).filter((f) => f.endsWith('.test.cjs')).map((f) => 'scripts/tests/' + f)], { stdio: 'ignore', cwd: ROOT });
t.status === 0 ? ok('test:scripts') : no('test:scripts');

console.log(bad ? `\n✗ فشل ${bad} فحص — لا تنشر` : '\n✓ v3.5.10 جاهز: git add -A && git commit -m "v3.5.10: split commitments.js" && git push');
process.exit(bad ? 1 : 0);
