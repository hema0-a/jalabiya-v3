/* helpers.cjs — أدوات مشتركة لاختبارات السكربتات (بلا اعتماديات؛ node:test). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results']);

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const s = path.join(src, e.name); const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else { fs.copyFileSync(s, d); try { fs.chmodSync(d, fs.statSync(s).mode); } catch (e2) { /* ignore */ } }
  }
}

function tmpDir(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

/* منع git من تشغيل gc/maintenance في الخلفية: كان يكتب في .git/objects أثناء حذف المشروع المؤقت
   فيفشل الحذف بـ ENOTEMPTY (فشل متقطع على CI فقط). يصل للسكربت المُختبَر أيضاً عبر وراثة البيئة. */
const GIT_NO_BG = {
  GIT_CONFIG_COUNT: '4',
  GIT_CONFIG_KEY_0: 'gc.auto', GIT_CONFIG_VALUE_0: '0',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_KEY_2: 'receive.autogc', GIT_CONFIG_VALUE_2: 'false',
  GIT_CONFIG_KEY_3: 'gc.autoDetach', GIT_CONFIG_VALUE_3: 'false',
};

/** حذف مجلد مؤقت بإعادة محاولة؛ فشل التنظيف لا يُفشل الاختبار (مجلد /tmp يُمسح لاحقاً). */
function rmTree(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  catch (e) { /* تنظيف فقط — لا يؤثر على نتيجة الاختبار */ }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_TERMINAL_PROMPT: '0', ...GIT_NO_BG, ...(opts.env || {}) }, ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', stderr: r.stderr || '' };
}
const git = (cwd, ...args) => run('git', args, { cwd });

/** مشروع مؤقت = نسخة من المشروع الحالي + git + remote فارغ (bare). */
function makeFixture() {
  const base = tmpDir('jal-fx-');
  const remote = path.join(base, 'remote.git');
  const repo = path.join(base, 'repo');
  git(base, 'init', '-q', '--bare', '-b', 'main', remote);
  copyTree(REPO_ROOT, repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'remote', 'add', 'origin', remote);
  const p = git(repo, 'push', '-q', '-u', 'origin', 'main');
  if (p.code !== 0) throw new Error('fixture push failed: ' + p.out);
  return { base, repo, remote, head: () => git(repo, 'rev-parse', 'HEAD').stdout.trim(), remoteHead: () => git(remote, 'rev-parse', 'main').stdout.trim(), cleanup: () => rmTree(base) };
}

const PY = (() => { for (const c of ['python3', 'python']) { const r = run(c, ['--version']); if (r.code === 0) return c; } return null; })();

/** يبني zip من {path: content|Buffer} (بـ python لأنه متاح على Linux/macOS/CI). prefix: مجلد يلفّ الملفات. */
function makeZip(zipPath, files, prefix = '') {
  if (!PY) throw new Error('python غير متاح لبناء zip');
  const spec = JSON.stringify(Object.entries(files).map(([p, c]) => [prefix + p, Buffer.from(c).toString('base64')]));
  /* المواصفات عبر stdin (تجاوز حد حجم معاملات سطر الأوامر مع الملفات الكبيرة) */
  const code = 'import sys,json,base64,zipfile\nspec=json.loads(sys.stdin.read())\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\nfor p,b in spec: z.writestr(p,base64.b64decode(b))\nz.close()';
  const r = run(PY, ['-c', code, zipPath], { input: spec, maxBuffer: 1 << 28 });
  if (r.code !== 0) throw new Error('zip failed: ' + r.out);
  return zipPath;
}

const hasBash = run('bash', ['--version']).code === 0;
const hasUnzip = run('unzip', ['-v']).code === 0;
const hasTar = run('tar', ['--version']).code === 0;

module.exports = { REPO_ROOT, copyTree, tmpDir, run, git, makeFixture, makeZip, PY, hasBash, hasUnzip, hasTar };
