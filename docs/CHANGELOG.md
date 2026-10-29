# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-10-05 — Official Release 🎉

**الإصدار الرسمي الأول من V3 — مكتمل وجاهز للاستخدام.**

### ملخص

- **44 ملف** موزعة على 5 طبقات
- **189 اختباراً** — كلها ناجحة
- **10 مخازن** في IndexedDB
- **10 مستودعات** متخصصة
- **7 مكونات UI**
- **9 صفحات** كاملة
- **13 قسماً** في الإعدادات
- **4 ملفات** في طبقة Sync
- **PWA** قابل للتثبيت + يعمل offline

### أُضيف في المرحلة 10 (PWA)

**PWA Setup:**
- `manifest.json` — بيانات التطبيق + 4 أيقونات (192 PNG, 512 PNG x2 maskable/any, SVG)
- `sw.js` — Service Worker (Network-first للـ HTML، Cache-first للـ static)
- `assets/icons/icon.svg` — أيقونة خضراء ببكرة خيط
- `assets/icons/icon-192.png` — أيقونة 192x192
- `assets/icons/icon-512.png` — أيقونة 512x512
- `src/main.js` — تسجيل Service Worker

**الميزات:**
- تثبيت كتطبيق PWA على الجوال
- العمل offline بالكامل بعد أول تحميل
- أيقونات native على شاشة الجوال
- عرض standalone (بدون شريط المتصفح)
- اختصارات سريعة (3 shortcuts)

### تغيّر
- `manifest.json` — إضافة `id: "/jalabiya-v3/"` لمنع التعارض مع V2
- `manifest.json` — PNG icons بدلاً من SVG فقط (متوافق مع Chrome Android)

### إصلاحات
- تصحيح `id` في manifest — يمنع "already installed" عند التثبيت

### الاختبارات
- **189 اختباراً** في 27 وحدة — كلها ناجحة ✅

---

## [0.7.0] — 2026-10-05 — Phase 9 Complete

### أُضيف
- `src/sync/firebase-config.js` — تحميل Lazy لـ Firebase SDK
- `src/sync/auth-sync.js` — مصادقة Email/Password
- `src/sync/firestore-sync.js` — Push/Pull/Apply
- `src/sync/offline-queue.js` — طابور العمليات
- قسم "المزامنة السحابية" في الإعدادات

### ملاحظة
- Firebase config فارغ حالياً (`apiKey: ''`) — المزامنة تحتاج بيانات حقيقية

### الاختبارات
- **189 اختباراً** ✅

---

## [0.6.0] — 2026-10-05 — Phase 8 Complete

### أُضيف
- صفحة الإعدادات الاحترافية (13 قسماً)
- `src/pages/settings/index.js` + 4 ملفات أقسام
- `styles/settings.css`
- `src/tests/modules/settings.test.js` — 8 اختبارات

### الاختبارات
- **189 اختباراً** ✅

---

## [0.5.0] — 2026-10-05 — Phase 7 Complete

### أُضيف
- 5 صفحات: payments, inventory, workers, expenses, reports
- `src/tests/modules/pages2.test.js`

### الاختبارات
- **181 اختباراً** ✅

---

## [0.4.0] — 2026-10-05 — Phase 6 Complete

### أُضيف
- dashboard, customers, orders

### الاختبارات
- **168 اختباراً** ✅

---

## [0.3.0] — 2026-10-05 — Phase 5 Complete

### أُضيف
- طبقة الأمان + 7 مكونات UI + Registry Pattern

### الاختبارات
- **144 اختباراً** ✅

---

## [0.2.0] — 2026-10-04 — Phase 2 Complete

### أُضيف
- طبقة البيانات الكاملة

### الاختبارات
- **122 اختباراً** ✅

---

## [0.1.0] — 2026-10-04 — Phase 1 Complete

### أُضيف
- الأساس (config, events, sanitize, dom, utils)

### الاختبارات
- **39 اختباراً** ✅

---

## [0.0.1] — 2026-10-04 — Bootstrap

### أُضيف
- إنشاء المستودع + تفعيل Pages
