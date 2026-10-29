#!/usr/bin/env node
/* apply-v357.cjs — يُنهي إصدار 3.5.7 (تقسيم quick-preview.js إلى مدخل + 5 وحدات).
   الاستخدام من جذر المشروع:  node apply-v357.cjs   (أو node scripts/apply-v357.cjs)
   شرطه: الوحدات الخمس + المدخل الجديد موجودة في src/ui/ (يتحقق ويتوقف برسالة واضحة إن نقص شيء).
   يفعل: رفع الإصدار (package.json · config.js · sw.js CACHE_VERSION · README) ← ملء إدخال CHANGELOG
        ← عنوان الإصدار في ترويستي sw.js وREADME ← gen:precache ← check:syntax + check:consistency.
   آمن لإعادة التشغيل: يتخطى ما تم. لا يلمس أي ملف آخر. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = fs.existsSync(path.join(__dirname, 'package.json')) ? __dirname : path.resolve(__dirname, '..');
const p = (f) => path.join(ROOT, f);
const read = (f) => fs.readFileSync(p(f), 'utf8');
const write = (f, s) => fs.writeFileSync(p(f), s);
const run = (script, ...args) => execFileSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' });

const NEXT = '3.5.7';
const TITLE = 'تقسيم المعاينات السريعة إلى وحدات (صيانة بلا تغيير سلوك) 🧩';
const SHORT = 'تقسيم المعاينات السريعة';
const BODY = [
  'تقسيم `quick-preview.js` (1150 سطراً ← مدخل + خمس وحدات). **لا تغيير في السلوك ولا في الشكل ولا في أي API.**',
  'قاعدة التقسيم: الدوال تُنقل **حرفياً** (الكود والتعليقات العربية)، بلا `ctx` وبلا حالة مشتركة.',
  '',
  '### 🧩 الملفات',
  '- **`src/ui/quick-preview.js`** (يبقى المدخل): إعادة تصدير فقط للواجهة العامة (9 دوال).',
  '- **`quick-preview-helpers.js`** (جديد، 196 سطراً): `_row` · `_stat` · `_listItem` · `_section` · `_acc` · `_progress` · `_whatsapp` · `_closeAction` · `_orderItems` · `_askNumber`.',
  '- **`quick-preview-catalog.js`** (جديد، 145): `shareCatalog`.',
  '- **`quick-preview-customer.js`** (جديد، 292): `previewCustomer` + «التفاصيل الكاملة» (مقاسات، عيلة، رصيد ونقاط، طلبات).',
  '- **`quick-preview-order.js`** (جديد، 243): `previewOrder` + `_orderMeasurementRows`.',
  '- **`quick-preview-entities.js`** (جديد، 330، ملف واحد): `previewPayment` · `previewCommitment` · `previewGoal` · `previewPortfolio` · `previewInventory` · `previewWorker`.',
  '',
  '### 🛡️ قرارات التصميم',
  '- الاستيراد أحادي الاتجاه: helpers ← catalog ← customer · helpers ← order · helpers ← entities (لا استيراد دائري؛ الوحدات لا تستورد المدخل).',
  '- `_askNumber` و`_orderItems` في helpers لأن customer وorder كلتيهما تستخدمهما؛ و`_orderMeasurementRows` في order لأنها تُستخدم هناك فقط.',
  '- تعليق الترويسة القديم عن «dynamic imports» حُذف لأنه لم يكن صحيحاً (كل الاستيرادات static).',
  '',
  '### 🧪 الاختبارات',
  '- لم يُعدَّل ولم يُحذف أي اختبار. مقارنة أسطر الوحدات بالأصل (1023 سطراً غير فارغ): لا فرق سوى كلمة `export` على عشر دوال مساعدة.',
  '',
  '### 📦 الإصدار',
  '- `package.json` · `config.js` · `sw.js` (`CACHE_VERSION`) · `README.md` ← 3.5.7، وقائمة precache مولَّدة.',
  '',
].join('\n');

/* 1) شروط مسبقة */
for (const m of ['helpers', 'catalog', 'customer', 'order', 'entities']) {
  if (!fs.existsSync(p(`src/ui/quick-preview-${m}.js`))) throw new Error(`ناقص: src/ui/quick-preview-${m}.js`);
}
const entry = read('src/ui/quick-preview.js');
if (entry.split('\n').length > 80 || !entry.includes("from './quick-preview-entities.js'")) {
  throw new Error('src/ui/quick-preview.js ليس المدخل الجديد بعد — انسخه أولاً ثم أعد التشغيل');
}

/* 2) رفع الإصدار (يضيف قالب إدخال في CHANGELOG) */
if (JSON.parse(read('package.json')).version !== NEXT) run('scripts/bump-version.cjs', NEXT);
else console.log('· الإصدار ' + NEXT + ' مرفوع سابقاً');

/* 3) ملء إدخال CHANGELOG مكان القالب (دالة بدل نص لتجنّب تفسير $ في الاستبدال) */
const cl = read('CHANGELOG.md');
const stub = '(عنوان الإصدار)\n\n- \n';
if (cl.includes(stub)) { write('CHANGELOG.md', cl.replace(stub, () => TITLE + '\n\n' + BODY)); console.log('✓ CHANGELOG'); }
else console.log('· CHANGELOG مملوء سابقاً');

/* 4) عنوان الإصدار في ترويستي sw.js وREADME (bump يغيّر الرقم فقط) */
const swHead = new RegExp('(الإصدار:\\s*v' + NEXT.replace(/\./g, '\\.') + ') — [^\\n]*');
write('sw.js', read('sw.js').replace(swHead, (_, a) => a + ' — ' + SHORT));
const rdHead = new RegExp('(\\*\\*الإصدار:\\*\\*\\s*v' + NEXT.replace(/\./g, '\\.') + ') — [^\\n]*');
write('README.md', read('README.md').replace(rdHead, (_, a) => a + ' — 🧩 ' + SHORT + ' (راجع CHANGELOG)'));
console.log('✓ ترويستا sw.js وREADME');

/* 5) قائمة precache ثم الفحوص الساكنة */
run('scripts/gen-precache.cjs');
run('scripts/check-syntax.cjs');
run('scripts/check-consistency.cjs');
console.log('✅ v' + NEXT + ' جاهز — بعدها: npm run check ثم git add / commit / push');
