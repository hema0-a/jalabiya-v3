#!/usr/bin/env bash
# apply-update.sh — تطبيق ملف تحديث (zip) على المشروع بأمر واحد، مع فحص قبل الرفع.
#
#   bash scripts/apply-update.sh ~/storage/downloads/jalabiya-v3_v3_3_65.zip
#
# الخطوات: فك الـ zip ← نسخه فوق المشروع ← توليد قائمة الكاش ← فحص الصياغة والاتساق
#          ← عرض الملفات المتغيرة ← commit ← push.
# لو فشل أي فحص: يتراجع تلقائياً عن كل التغييرات ولا يرفع شيئاً.
#
# الخيارات:
#   -m, --message "نص"   رسالة الـ commit (الافتراضي: من أحدث إدخال في CHANGELOG داخل التحديث)
#       --no-push        commit بدون push
#       --dry-run        طبّق وافحص ثم تراجع (لمعرفة ما سيحدث دون تغيير شيء)
#       --skip-checks    لا تشغّل الفحوص (غير مُوصى به)
#       --force          اسمح بشجرة عمل غير نظيفة (يُعطّل التراجع التلقائي)
#       --confirm        اسأل قبل الـ commit
#   -h, --help
#
# رموز الخروج: 0 نجاح · 1 استخدام/بيئة · 2 شجرة عمل غير نظيفة · 3 فشل فحص (تم التراجع) · 4 فشل push

set -euo pipefail

MSG=""
DO_PUSH=1
DRY=0
SKIP_CHECKS=0
FORCE=0
CONFIRM=0
ZIP=""

say()  { printf '%s\n' "$*"; }
err()  { printf '❌ %s\n' "$*" >&2; }
usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message) [ $# -ge 2 ] || { err "الخيار $1 يحتاج قيمة"; exit 1; }; MSG="$2"; shift 2 ;;
    --no-push) DO_PUSH=0; shift ;;
    --dry-run) DRY=1; shift ;;
    --skip-checks) SKIP_CHECKS=1; shift ;;
    --force) FORCE=1; shift ;;
    --confirm) CONFIRM=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) err "خيار غير معروف: $1"; usage; exit 1 ;;
    *) [ -z "$ZIP" ] || { err "أكثر من ملف zip: $ZIP و $1"; exit 1; }; ZIP="$1"; shift ;;
  esac
done

[ -n "$ZIP" ] || { err "حدّد ملف الـ zip"; usage; exit 1; }
# توسيع ~ إن وصل نصاً حرفياً
case "$ZIP" in "~/"*) ZIP="$HOME/${ZIP#\~/}" ;; esac
[ -f "$ZIP" ] || { err "الملف غير موجود: $ZIP"; exit 1; }

for tool in git unzip tar; do
  command -v "$tool" >/dev/null 2>&1 || { err "الأداة '$tool' غير مثبّتة (Termux: pkg install $tool)"; exit 1; }
done
HAVE_NODE=1
command -v node >/dev/null 2>&1 || HAVE_NODE=0
if [ "$HAVE_NODE" = 0 ] && [ "$SKIP_CHECKS" = 0 ]; then
  err "node غير مثبّت فلا يمكن تشغيل الفحوص (Termux: pkg install nodejs-lts) — أو استعمل --skip-checks"
  exit 1
fi

REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { err "هذا ليس مستودع git — ادخل مجلد المشروع أولاً"; exit 1; }
cd "$REPO"

if [ "$FORCE" = 0 ] && [ -n "$(git status --porcelain)" ]; then
  err "في المشروع تغييرات غير محفوظة. اعمل لها commit أو تراجع عنها أولاً (git status) — أو استعمل --force"
  git status --short | sed -n '1,15p' >&2
  exit 2
fi

BASE="$(git rev-parse HEAD)"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# ---- 1) فحص محتوى الـ zip قبل الفك (مسارات خطرة) ----
say "📦 فحص الملف: $(basename "$ZIP")"
if ! unzip -tq "$ZIP" >/dev/null 2>&1; then err "الـ zip تالف أو غير مكتمل"; exit 1; fi
# ملاحظة: نخزّن القائمة أولاً ونستعمل here-string — grep -q يخرج مبكراً فيُسقط الأنبوب بـ SIGPIPE تحت pipefail
if ! NAMES="$(unzip -Z1 "$ZIP" 2>/dev/null)"; then
  # بديل إن لم تدعم نسخة unzip وضع zipinfo: نقرأ الأسماء من القائمة العادية
  NAMES="$(unzip -l "$ZIP" | awk 'NR>3 && NF>=4 { print substr($0, index($0,$4)) }')"
fi
if grep -Eq '(^/|(^|/)\.\.(/|$))' <<< "$NAMES"; then
  err "الـ zip يحتوي مسارات خطرة (مطلقة أو ..) — رفضته"
  exit 1
fi

unzip -q -o "$ZIP" -d "$TMP/x"

# ---- 2) تحديد جذر التحديث (مجلد واحد يلفّ كل شيء؟) ----
ROOT="$TMP/x"
entries=$(find "$ROOT" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
if [ "$entries" = "1" ] && [ -d "$(find "$ROOT" -mindepth 1 -maxdepth 1)" ]; then
  inner="$(find "$ROOT" -mindepth 1 -maxdepth 1)"
  if [ -e "$inner/package.json" ] || [ -d "$inner/src" ] || [ -e "$inner/index.html" ]; then ROOT="$inner"; fi
fi
nfiles=$(find "$ROOT" -type f ! -path '*/.git/*' | wc -l | tr -d ' ')
[ "$nfiles" -gt 0 ] || { err "الـ zip فارغ"; exit 1; }
say "   $nfiles ملفاً في التحديث"

# ---- 3) قراءة رسالة الـ commit الافتراضية قبل الدمج ----
if [ -z "$MSG" ] && [ -f "$ROOT/CHANGELOG.md" ]; then
  line="$(grep -m1 -E '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$ROOT/CHANGELOG.md" || true)"
  if [ -n "$line" ]; then
    ver="$(printf '%s' "$line" | sed -E 's/^## \[([0-9.]+)\].*/\1/')"
    title="$(printf '%s' "$line" | sed -E 's/^## \[[0-9.]+\][^—]*—[^—]*—[[:space:]]*//')"
    [ "$title" = "$line" ] && title=""
    MSG="v$ver${title:+: $title}"
  fi
fi
[ -n "$MSG" ] || MSG="Apply update $(basename "$ZIP" .zip)"

# ---- 4) قائمة الحذف (اختيارية): DELETE.txt بمسار في كل سطر ----
DELETES=()
if [ -f "$ROOT/DELETE.txt" ]; then
  while IFS= read -r p || [ -n "$p" ]; do
    p="${p%$'\r'}"
    [ -z "$p" ] && continue
    case "$p" in \#*) continue ;; esac
    case "$p" in /*|*..*|.git*|*/.git/*) err "مسار حذف مرفوض في DELETE.txt: $p"; exit 1 ;; esac
    DELETES+=("$p")
  done < "$ROOT/DELETE.txt"
fi

rollback() {
  if [ "$FORCE" = 1 ]; then
    err "لم أتراجع تلقائياً (--force). للتراجع يدوياً: git reset --hard $BASE && git clean -fd"
    return
  fi
  git reset -q --hard "$BASE" >/dev/null 2>&1 || true
  git clean -fdq >/dev/null 2>&1 || true
  say "↩️  تم التراجع عن كل التغييرات — المشروع كما كان."
}

# ---- 5) نسخ التحديث فوق المشروع ----
( cd "$ROOT" && tar cf - --exclude=.git --exclude=node_modules --exclude=test-results --exclude=DELETE.txt . ) | tar xf -
for p in "${DELETES[@]+"${DELETES[@]}"}"; do
  if [ -e "$p" ]; then rm -rf -- "$p"; say "🗑️  حُذف: $p"; fi
done

# ---- 6) توليد قائمة الكاش + الفحوص ----
FAILED=0
if [ "$HAVE_NODE" = 1 ] && [ -f scripts/gen-precache.cjs ]; then
  node scripts/gen-precache.cjs >/dev/null 2>&1 || { err "فشل توليد قائمة الكاش"; FAILED=1; }
fi

if [ "$SKIP_CHECKS" = 1 ]; then
  say "⚠️  تخطّيت الفحوص (--skip-checks)"
elif [ "$FAILED" = 0 ]; then
  say "🔍 فحص الصياغة..."
  if ! node scripts/check-syntax.cjs; then FAILED=1; fi
  if [ "$FAILED" = 0 ]; then
    say "🔍 فحص الاتساق..."
    if ! node scripts/check-consistency.cjs; then FAILED=1; fi
  fi
fi

if [ "$FAILED" = 1 ]; then
  err "فشل الفحص — لن أرفع شيئاً."
  rollback
  exit 3
fi

# ---- 7) عرض ما تغيّر ----
git add -A >/dev/null 2>&1
if git diff --cached --quiet; then
  say "ℹ️  لا تغييرات — المشروع مطابق للتحديث."
  exit 0
fi
say ""
say "📝 الملفات المتغيرة:"
git diff --cached --name-status | sed 's/^/   /'
say ""
git diff --cached --shortstat | sed 's/^/   /'

if [ "$DRY" = 1 ]; then
  say ""
  say "🧪 --dry-run: لن أعمل commit."
  git reset -q >/dev/null 2>&1 || true
  rollback
  exit 0
fi

if [ "$CONFIRM" = 1 ]; then
  printf '\nمتابعة commit%s بالرسالة «%s»؟ [y/N] ' "$([ "$DO_PUSH" = 1 ] && printf ' + push')" "$MSG"
  read -r ans || ans=""
  case "$ans" in y|Y|yes|YES|ن|نعم) ;; *) git reset -q >/dev/null 2>&1 || true; rollback; say "أُلغي."; exit 0 ;; esac
fi

# ---- 8) commit + push ----
git commit -q -m "$MSG"
say ""
say "✅ commit: $(git log -1 --format='%h %s')"
if [ "$DO_PUSH" = 1 ]; then
  say "⬆️  push..."
  if git push; then
    say "🚀 تم الرفع."
  else
    err "فشل push — الـ commit محفوظ محلياً. أعد المحاولة بـ: git push"
    exit 4
  fi
else
  say "⏸️  --no-push: لم أرفع. للرفع: git push"
fi
