#!/usr/bin/env node
/* gen-precache.cjs — يولّد قائمة PRECACHE_URLS في sw.js من القرص.
   npm run gen:precache            ← يكتب sw.js إن اختلفت القائمة
   npm run gen:precache -- --check ← لا يكتب؛ يخرج 1 إن كانت القائمة قديمة (للـ CI)
   السبب: كتابة القائمة بالإيد = ملف جديد يُنسى فلا يعمل offline. */
'use strict';
const fs = require('fs');
const path = require('path');
const { computeList, currentUrls, applyToSw, urlOf } = require('./lib/precache.cjs');

const ROOT = path.resolve(__dirname, '..');
const swPath = path.join(ROOT, 'sw.js');
const check = process.argv.includes('--check');

const sw = fs.readFileSync(swPath, 'utf8');
const cur = currentUrls(sw);
if (!cur) { console.error('✗ تعذّر العثور على PRECACHE_URLS في sw.js'); process.exit(2); }

const { groups, all, big } = computeList(ROOT);
const next = applyToSw(sw, groups);
const want = all.map(urlOf);
const added = want.filter((u) => !cur.includes(u));
const removed = cur.filter((u) => !want.includes(u));

for (const b of big) console.warn(`⚠ ملف كبير في الكاش المسبق: ${b.file} (${Math.round(b.bytes / 1024)}KB)`);

if (next === sw) { console.log(`precache: محدَّثة (${want.length} ملفاً)`); process.exit(0); }

if (check) {
  console.log('✗ قائمة PRECACHE_URLS في sw.js قديمة' + (added.length ? `\n   ناقص: ${added.join(', ')}` : '') + (removed.length ? `\n   زائد: ${removed.join(', ')}` : '') + (!added.length && !removed.length ? '\n   (فرق في الترتيب/التنسيق فقط)' : '') + '\n   الحل: npm run gen:precache');
  process.exit(1);
}
fs.writeFileSync(swPath, next);
console.log(`precache: حُدِّثت (${want.length} ملفاً)` + (added.length ? `\n  + ${added.join('\n  + ')}` : '') + (removed.length ? `\n  - ${removed.join('\n  - ')}` : ''));
