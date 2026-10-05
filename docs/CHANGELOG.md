# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### قيد التطوير — المرحلة 9
- Firebase Sync (auth-sync, firestore-sync, offline-queue)

### مخطط لاحقاً
- المرحلة 10: PWA (manifest, service worker, icons)

---

## [0.6.0] — 2026-10-05 — Phase 8 Complete

### أُضيف

**صفحة الإعدادات الاحترافية (13 قسماً):**
- `src/pages/settings/index.js` — المُجمِّع + بحث فوري + TOC + Scroll Spy
- `src/pages/settings/sections-workshop.js` — معلومات الورشة، المظهر، أوضاع العرض
- `src/pages/settings/sections-data.js` — حقول المقاسات، أنواع الجلابيات، المخزون
- `src/pages/settings/sections-system.js` — التنبيهات، الرسائل، النسخ، Sync، ضغط الصور
- `src/pages/settings/sections-security.js` — الأمان + منطقة الخطر

**طبقة الأنماط:**
- `styles/settings.css` — 12 فئة نمط للإعدادات

**اختبارات:**
- `src/tests/modules/settings.test.js` — 8 اختبارات

### تغيّر
- `src/main.js` — إضافة صفحة الإعدادات + بطاقة ⚙️ في السايدبار
- `styles/main.css` — إضافة `@import 'settings.css'`
- `src/tests/index.js` — إضافة `settings.test.js`

### الميزات

**البحث الفوري:** كتابة أي كلمة → تُخفي الأقسام غير المطابقة.

**الفهرس الجانبي (TOC):** 13 عنصراً مع Scroll Spy تلقائي يُبرز القسم الحالي.

**معلومات الورشة:** اسم، شعار (رفع صورة)، عنوان، هاتف، WhatsApp.

**المظهر:**
- 9 ثيمات قابلة للتبديل بضغطة
- Color Pickers (أساسي + ثانوي + خلفية)
- تطبيق فوري للألوان (CSS Variables)

**أوضاع العرض:** الوضع الليلي، التباين العالي، المضغوط، وضع العميل + حجم الخط.

**حقول المقاسات:** CRUD ديناميكي (إضافة/تعديل/حذف/تفعيل).

**أنواع الجلابيات:** CRUD مع الاسم + السعر + الملاحظات.

**المخزون والحدود:** الحد الأدنى للتنبيه + تنبيهات القماش/المنتج.

**التنبيهات:** مواسم، مواعيد، مخزون، مديونيات + فترة التنبيه.

**الرسائل التلقائية:** 5 قوالب (طلب جديد، بدء التنفيذ، جاهز، شكر، تذكير) + متغيرات ديناميكية.

**النسخ الاحتياطي:** تصدير/استيراد JSON + نسخ تلقائي بفترات.

**المزامنة السحابية:** حالة الاتصال + آخر مزامنة (واجهة جاهزة للمرحلة 9).

**ضغط الصور:** الجودة، الحجم الأقصى، الأبعاد القصوى.

**الأمان:** تعيين/تغيير PIN، قفل تلقائي، مدة جلسة، تسجيل محاولات.

**منطقة الخطر:** حذف كل البيانات (تأكيد مزدوج) + إعادة تعيين الإعدادات.

### الاختبارات
- **189 اختباراً** في 27 وحدة — كلها ناجحة ✅

---

## [0.5.0] — 2026-10-05 — Phase 7 Complete

### أُضيف
- 5 صفحات: `payments.js`, `inventory.js`, `workers.js`, `expenses.js`, `reports.js`
- `src/tests/modules/pages2.test.js` — 13 اختباراً

### الاختبارات
- **181 اختباراً** ✅

---

## [0.4.0] — 2026-10-05 — Phase 6 Complete

### أُضيف
- `src/pages/customers.js`, `orders.js`, `dashboard.js`
- 3 وحدات اختبار

### الاختبارات
- **168 اختباراً** ✅

---

## [0.3.0] — 2026-10-05 — Phase 5 Complete

### أُضيف
- طبقة الأمان: `pin-crypto.js`, `auth.js`
- 7 مكونات UI: `toast`, `modal`, `controls`, `form-builder`, `sidebar`, `topbar`, `layout`
- `styles/components.css`, `styles/layout.css`
- Registry Pattern للاختبارات

### الاختبارات
- **144 اختباراً** ✅

---

## [0.2.0] — 2026-10-04 — Phase 2 Complete

### أُضيف
- `src/data/schema.js`, `idb.js`, `repository.js`
- 10 مستودعات

### الأمان
- إصلاح ثغرة `data:image/svg+xml`
- إصلاح فهارس boolean

### الاختبارات
- **122 اختباراً** ✅

---

## [0.1.0] — 2026-10-04 — Phase 1 Complete

### أُضيف
- `index.html` (CSP مشدد)
- `styles/base.css`, `main.css`
- 5 ملفات core

### الاختبارات
- **39 اختباراً** ✅

---

## [0.0.1] — 2026-10-04 — Bootstrap

### أُضيف
- إنشاء المستودع
- تفعيل GitHub Pages
