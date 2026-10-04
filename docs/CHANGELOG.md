# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### قيد التطوير
- المرحلة 5: UI Core (toast, modal, controls, form-builder, layout, sidebar, topbar)
- المرحلة 6: الصفحات الأساسية (dashboard, customers, orders)
- المرحلة 7: الصفحات الثانوية
- المرحلة 8: الإعدادات الاحترافية (13 قسماً)
- المرحلة 9: Firebase Sync
- المرحلة 10: PWA (manifest, service worker, icons)

---

## [0.2.0] — 2026-10-04 — Phase 2 Complete

### أُضيف

**طبقة البيانات (Data Layer):**
- `src/data/schema.js` — تعريف 10 مخازن + 24 فهرساً + دالة تحقق
- `src/data/idb.js` — غلاف Promise لـ IndexedDB + دعم Migrations
- `src/data/repository.js` — مصنع مستودعات عام (CRUD موحّد)

**المستودعات المتخصصة (9):**
- `src/data/repos/customers.js` — بحث بالهاتف، اسم، VIP
- `src/data/repos/orders.js` — فلترة بالحالة، المستحق قريباً، إحصائيات
- `src/data/repos/payments.js` — مجموع بالطلب/العميل
- `src/data/repos/inventory.js` — بحث بالفئة، تنبيه نقص، تعديل كمية
- `src/data/repos/workers.js` — العمال النشطون، تبديل التفعيل
- `src/data/repos/settings.js` — سجل واحد + deep merge
- `src/data/repos/appointments.js` — مواعيد اليوم، القادمة
- `src/data/repos/expenses.js` — مجموع بالفئة/الفترة
- `src/data/repos/trash.js` — نقل، استرجاع، تقليم تلقائي

**طبقة الأمان (Security Layer):**
- `src/security/pin-crypto.js` — SHA-256 + Salt عشوائي (WebCrypto)
- `src/security/auth.js` — مصادقة، قفل بالمحاولات، جلسات

### تغيّر
- `src/core/config.js` — ترقية DB version من 1 إلى 2 + مفاتيح تخزين جديدة
- `src/tests/all.js` — إعادة هيكلة (اختبارات في ملف منفصل)
- `src/main.js` — نسخة رقيقة تستورد ملف الاختبارات

### الأمان
- إصلاح ثغرة `data:image/svg+xml` في `sanitizeUrl` (SVG يُنفّذ سكربتات عند فتحه كـ document)
- إصلاح خطأ IDB: `boolean` غير صالح كمفاتيح فهرس (by_vip, by_active)
- تشفير PIN بـ SHA-256 + Salt آمن تشفيرياً

### الاختبارات
- **122 اختباراً** موزعة على 18 مجموعة — كلها ناجحة ✅

---

## [0.1.0] — 2026-10-04 — Phase 1 Complete

### أُضيف
- `index.html` — هيكل التطبيق + CSP مشدد (12 توجيهاً)
- `styles/base.css` — Reset + Variables + Typography + Animations
- `styles/main.css` — مُجمِّع الأنماط (Aggregator)
- `src/core/config.js` — ثوابت المشروع (181 سطر)
- `src/core/events.js` — EventBus (Pub/Sub) مع 7 اختبارات
- `src/core/sanitize.js` — خط الدفاع ضد XSS مع 16 حالة URL
- `src/core/dom.js` — أدوات DOM آمنة (el, qs, on, ...)
- `src/core/utils.js` — Validators + Formatters + Timing + agoPhrase
- `src/main.js` — نقطة الدخول

### الأمان
- CSP مشدد بـ 12 توجيهاً (frame-ancestors, object-src, base-uri, form-action)
- رفض `data:image/svg` في sanitizeUrl
- escapeHtml / escapeAttr قبل أي إدراج في DOM

---

## [0.0.1] — 2026-10-04 — Bootstrap

### أُضيف
- إنشاء المستودع `jalabiya-v3` على GitHub (Public)
- تفعيل GitHub Pages
- `README.md`, `.gitignore`, `docs/TODO.md`
