#!/usr/bin/env node
/* check-syntax.cjs — فحص صياغة كل ملفات JS بسرعة (بدون متصفح):
   وحدات ES لكل ملفات src، وسكربت عادي لـ sw.js وملفات scripts. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

if (!process.execArgv.includes('--experimental-vm-modules')) {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const vm = require('vm');

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, ext, out); } else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

let bad = 0;
const rel = (f) => path.relative(ROOT, f);
const modules = walk(path.join(ROOT, 'src'), '.js');
const scripts = [path.join(ROOT, 'sw.js'), ...walk(path.join(ROOT, 'scripts'), '.cjs')];

for (const f of modules) {
  try { new vm.SourceTextModule(fs.readFileSync(f, 'utf8'), { identifier: f }); }
  catch (e) { bad++; console.log(`✗ ${rel(f)}: ${e.message}`); }
}
for (const f of scripts) {
  try { new vm.Script(fs.readFileSync(f, 'utf8').replace(/^#!.*/, ''), { filename: f }); }
  catch (e) { bad++; console.log(`✗ ${rel(f)}: ${e.message}`); }
}
console.log(bad ? `syntax: ${bad} ملف به خطأ` : `syntax: ${modules.length + scripts.length} ملف سليم`);
process.exit(bad ? 1 : 0);
