/* حارس استدعاءات ctx في صفحات src/pages (v3.5.14).
   الخطأ الذي وُلد منه (loans-views.js): معالج نقر يستدعي renderFilters() بلا ctx بينما تعريفها renderFilters(ctx)
   فيرمي TypeError عند أول نقرة ولا تتحدّث القائمة — وكل فحص آخر (صياغة/استيراد/تعريف الأسماء) يمر لأن الاسم معرَّف.
   قاعدتان تعملان على كل الصفحات المقسّمة (كل ما فيه `const ctx = {`):
     1) لا استدعاء لدالة تستلم ctx معاملاً أول بدونه (يشمل استدعاءها بلا معاملات).
     2) كل ctx.xxx (أو فكّ { xxx } = ctx) تستخدمه وحدات الصفحة معرَّف في كائن ctx بالمدخل.
   تشغيل: node --test scripts/tests/ctx-call-guard.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.cjs');

const PAGES = path.join(REPO_ROOT, 'src', 'pages');

/* ---------- أدوات قراءة (نص فقط، بلا تنفيذ) ---------- */

/** إزالة التعليقات مع الإبقاء على أطوال الأسطر (لتبقى أرقام الأسطر صحيحة) والنصوص كما هي. */
function stripComments(src) {
  let out = ''; let i = 0; const n = src.length;
  let str = null; // ' أو " أو `
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (str) {
      out += c;
      if (c === '\\') { out += d || ''; i += 2; continue; }
      if (c === str) str = null;
      i++; continue;
    }
    if (c === '/' && d === '*') { while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    if (c === '/' && d === '/' && src[i - 1] !== ':') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '\'' || c === '"' || c === '`') { str = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

function listJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'tests') out.push(...listJs(p)); } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out.sort();
}

/** نص المعامل الأول في استدعاء يبدأ عند فتحة القوس `open` (الفهرس بعد "(")، أو null. */
function firstArg(code, open) {
  let depth = 0; let i = open; let str = null; let buf = '';
  for (; i < code.length; i++) {
    const c = code[i];
    if (str) { buf += c; if (c === '\\') { buf += code[++i] || ''; } else if (c === str) str = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { str = c; buf += c; continue; }
    if ('([{'.includes(c)) { depth++; buf += c; continue; }
    if (')]}'.includes(c)) { if (depth === 0) return buf.trim(); depth--; buf += c; continue; }
    if (c === ',' && depth === 0) return buf.trim();
    buf += c;
  }
  return null;
}

/* ---------- القاعدة 1: استدعاء دالة (ctx) بدون ctx ---------- */

/** أسماء الدوال التي معاملها الأول ctx في هذا الملف. */
function ctxFirstFunctions(code) {
  const names = new Set();
  for (const m of code.matchAll(/\bfunction\*?\s+([A-Za-z_$][\w$]*)\s*\(\s*ctx\s*[,)]/g)) names.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(\s*ctx\s*[,)]/g)) names.add(m[1]);
  return names;
}

/** الأسماء المستوردة (محلياً) من ملف معيّن: { محلي -> أصلي }. */
function importedNames(code) {
  const map = new Map();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
    for (const part of m[1].split(',')) {
      const [orig, local] = part.trim().split(/\s+as\s+/);
      if (orig) map.set((local || orig).trim(), { orig: orig.trim(), from: m[2] });
    }
  }
  return map;
}

/**
 * استدعاءات غير سليمة: دالة معاملها الأول ctx تُستدعى بلا ctx.
 * @param {Object<string,string>} files — { مسار: مصدر }
 * @returns {string[]} «مسار:سطر — الاستدعاء»
 */
function findBadCtxCalls(files) {
  const stripped = {}; const defs = {}; // defs[file] = Set(أسماء معرَّفة بـ ctx أولاً)
  for (const [f, src] of Object.entries(files)) { stripped[f] = stripComments(src); defs[f] = ctxFirstFunctions(stripped[f]); }
  const bad = [];
  for (const [f, code] of Object.entries(stripped)) {
    /* الأسماء المعنية في هذا الملف: المعرَّفة فيه + المستوردة من ملف يعرّفها بـ ctx أولاً */
    const watch = new Set(defs[f]);
    for (const [local, info] of importedNames(code)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), info.from));
      if (defs[target] && defs[target].has(info.orig)) watch.add(local);
    }
    for (const name of watch) {
      const re = new RegExp('(^|[^\\w$.])' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
      for (const m of code.matchAll(re)) {
        const open = m.index + m[0].length;
        const before = code.slice(Math.max(0, m.index - 24), m.index + m[1].length);
        if (/\bfunction\*?\s*$/.test(before)) continue;                 // تعريف الدالة نفسه
        const arg = firstArg(code, open);
        const ok = arg !== null && /^(ctx|[A-Za-z_$][\w$]*ctx|\.\.\.ctx|\{\s*\.\.\.ctx\b.*)$/i.test(arg);
        if (!ok) {
          const line = code.slice(0, m.index).split('\n').length;
          bad.push(f + ':' + line + ' — ' + name + '(' + (arg === null ? '؟' : arg) + ')');
        }
      }
    }
  }
  return bad;
}

/* ---------- القاعدة 2: ctx.xxx معرَّف في كائن ctx بالمدخل ---------- */

/** مفاتيح المستوى الأول لكائن `const ctx = { ... }`، أو null لو لا يوجد. */
function ctxObjectKeys(code) {
  const m = code.match(/\bconst\s+ctx\s*=\s*\{/);
  if (!m) return null;
  const keys = new Set(); let depth = 0; let i = m.index + m[0].length; let token = ''; let expectKey = true;
  for (; i < code.length; i++) {
    const c = code[i];
    if (depth === 0 && c === '}') break;
    if ('([{'.includes(c)) { depth++; continue; }
    if (')]}'.includes(c)) { depth--; continue; }
    if (depth > 0) continue;
    if (c === ',') { if (token.trim() && expectKey) keys.add(token.trim().replace(/\W.*$/, '')); token = ''; expectKey = true; continue; }
    if (c === ':' && expectKey) { keys.add(token.trim()); token = ''; expectKey = false; continue; }
    if (expectKey) token += c;
  }
  if (token.trim() && expectKey) keys.add(token.trim().replace(/\W.*$/, ''));
  keys.delete('');
  return keys;
}

/** الأعضاء التي يقرأها الكود من ctx: ctx.x و const { x, y: z } = ctx. */
function ctxMembersUsed(code) {
  const used = new Set();
  for (const m of code.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let)\s*\{([^}]*)\}\s*=\s*ctx\b/g)) {
    for (const part of m[1].split(',')) { const k = part.trim().split(/\s*[:=]\s*/)[0].trim(); if (k) used.add(k); }
  }
  return used;
}

/** الملفات التي يصل إليها المدخل عبر الاستيراد النسبي داخل src/pages (تتبّع متعدّي). */
function reachable(entry, files) {
  const seen = new Set(); const stack = [entry];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f) || !(f in files)) continue; seen.add(f);
    for (const m of stripComments(files[f]).matchAll(/from\s*'(\.[^']+)'/g)) stack.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  }
  return seen;
}

/**
 * ctx.xxx غير معرَّف في كائن ctx لدى المدخل الذي يصل إلى الملف.
 * @param {Object<string,string>} files
 * @returns {string[]}
 */
function findUndefinedCtxMembers(files) {
  const stripped = {}; for (const [f, s] of Object.entries(files)) stripped[f] = stripComments(s);
  const bad = [];
  for (const [entry, code] of Object.entries(stripped)) {
    const keys = ctxObjectKeys(code);
    if (!keys) continue;
    for (const f of reachable(entry, files)) {
      if (/getContext\(/.test(stripped[f])) continue;                   // ctx = سياق canvas لا سياق الصفحة
      for (const k of ctxMembersUsed(stripped[f])) if (!keys.has(k)) bad.push(f + ' ← ctx.' + k + ' غير معرَّف في ctx ' + entry);
    }
  }
  return bad;
}

/* ---------- الاختبارات ---------- */

function loadPages() {
  const files = {};
  for (const p of listJs(PAGES)) files[path.relative(REPO_ROOT, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8');
  return files;
}

test('القاعدة 1: لا استدعاء لدالة تستلم ctx أولاً بدونه (كل src/pages)', () => {
  const bad = findBadCtxCalls(loadPages());
  assert.deepEqual(bad, [], 'استدعاءات بلا ctx:\n' + bad.join('\n'));
});

test('القاعدة 2: كل ctx.xxx تستخدمه وحدات الصفحة معرَّف في كائن ctx بالمدخل', () => {
  const bad = findUndefinedCtxMembers(loadPages());
  assert.deepEqual(bad, [], 'أعضاء ctx غير معرَّفة:\n' + bad.join('\n'));
});

test('الحارس نفسه: يكشف خطأ loans القديم (renderFilters() بلا ctx) ولا ينذر بالسليم', () => {
  const OLD = { 'src/pages/x-views.js': 'export function renderFilters(ctx) {\n  const { state } = ctx;\n  btn.onClick = () => {\n    renderFilters();\n    renderList(ctx);\n  };\n}\nexport function renderList(ctx) { return ctx.state; }\n' };
  const FIXED = { 'src/pages/x-views.js': OLD['src/pages/x-views.js'].replace('renderFilters();', 'renderFilters(ctx);') };
  const bad = findBadCtxCalls(OLD);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /x-views\.js:4 — renderFilters\(\)/);
  assert.deepEqual(findBadCtxCalls(FIXED), []);
});

test('الحارس نفسه: يلتقط الاستدعاء بلا ctx عبر استيراد من وحدة أخرى، ويتجاهل التعليقات والتعريفات والاستدعاء بمعامل أول آخر باسم ctx', () => {
  const files = {
    'src/pages/a.js': 'export function openForm(ctx, item) { return ctx.refresh(); }\n',
    'src/pages/b.js': 'import { openForm } from \'./a.js\';\n/* openForm() في تعليق لا يُحسب */\nexport function go(ctx) { openForm(); openForm(ctx, 1); openForm(pageCtx, 2); }\n',
  };
  const bad = findBadCtxCalls(files);
  assert.equal(bad.length, 1, bad.join('\n'));
  assert.match(bad[0], /b\.js:3 — openForm\(\)/);
});

test('الحارس نفسه: القاعدة 2 تكشف عضواً غير معرَّف في ctx وتتجاهل canvas', () => {
  const files = {
    'src/pages/p.js': 'import { v } from \'./p-views.js\';\nimport { c } from \'./p-canvas.js\';\nconst ctx = {\n  state,\n  refresh: () => load(),\n  openForm: (x) => open(ctx, x),\n};\n',
    'src/pages/p-views.js': 'export function v(ctx) { const { state } = ctx; ctx.refresh(); ctx.openMissing(); }\n',
    'src/pages/p-canvas.js': 'export function c(el) { const ctx = el.getContext(\'2d\'); ctx.fillRect(0, 0, 1, 1); }\n',
  };
  const bad = findUndefinedCtxMembers(files);
  assert.equal(bad.length, 1, bad.join('\n'));
  assert.match(bad[0], /p-views\.js ← ctx\.openMissing/);
});
