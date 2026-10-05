# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### قيد التطوير — المرحلة 10
- PWA (manifest + service worker + icons)
- تثبيت على الجوال + عمل offline كامل

---

## [0.7.0] — 2026-10-05 — Phase 9 Complete

### أُضيف

**طبقة المزامنة (Sync Layer):**
- `src/sync/firebase-config.js` — تحميل Firebase SDK (Lazy) + تحقق من الإعدادات
- `src/sync/auth-sync.js` — مصادقة Email/Password + ترجمة أخطاء عربية
- `src/sync/firestore-sync.js` — Push/Pull/Apply كامل
- `src/sync/offline-queue.js` — طابور العمليات أثناء عدم الاتصال

### تغيّر

- `src/core/config.js` — إضافة `V3_OFFLINE_QUEUE` لمفاتيح التخزين
- `src/pages/settings/sections-system.js` — قسم المزامنة يعمل فعلياً (نموذج دخول + رفع/تنزيل/خروج)

### الميزات

**firebase-config.js:**
- تحميل Lazy لـ Firebase SDK 10.12.0 من CDN
- لا يُحمَّل حتى يُستخدَم فعلاً
- تحقق من اكتمال الإعدادات + إرجاع المفاتيح الناقصة
- Singleton (يُهيَّأ مرة واحدة)

**auth-sync.js:**
- تسجيل دخول Email/Password
- تسجيل خروج
- مراقبة تغيّر الحالة (onAuthStateChanged)
- ترجمة رسائل Firebase إلى العربية

**firestore-sync.js:**
- Push: رفع كل البيانات المحلية (8 مخازن)
- Pull: قراءة snapshot من السحابة
- Apply: دمج snapshot في IndexedDB
- المسار: `users_v3/{uid}/data/main`
- البنية: `{ stores: { customers: [...], orders: [...], ... }, updatedAt }`

**offline-queue.js:**
- إضافة عمليات (add)
- قراءة + حذف (list, remove, size)
- معالجة الطابور (process) — يحاول كل عملية ويحذف الناجح
- حد أقصى 500 عملية
- التخزين في localStorage

**قسم المزامنة السحابية:**
- إذا Firebase غير مُهيّأ → رسالة صفراء توضيحية
- إذا لم يُسجَّل المستخدم → نموذج تسجيل دخول
- إذا مسجَّل → بطاقة خضراء + آخر مزامنة + 3 أزرار (رفع، تنزيل، خروج)
- مؤشر حالة الإنترنت (متصل/غير متصل)

### الاختبارات
- **189 اختباراً** — لا تغيير (لا اختبارات جديدة في هذه المرحلة)

### ملاحظة مهمة
- Firebase غير مُهيّأ حالياً (`FIREBASE_CONFIG.apiKey = ''`)
- المزامنة لن تعمل فعلياً حتى يتم وضع بيانات مشروع Firebase في `config.js`
- الكود جاهز للاستخدام بمجرد إضافة الإعدادات

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
