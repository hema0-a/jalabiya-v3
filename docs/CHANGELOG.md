# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### قيد التطوير — المرحلة 6
- صفحة العملاء (CRUD كامل + بحث + VIP)
- صفحة الطلبات (كانبان + فلاتر)
- لوحة المعلومات (KPIs حقيقية)

### مخطط لاحقاً
- المرحلة 7: الصفحات الثانوية (inventory, workers, expenses, reports)
- المرحلة 8: الإعدادات الاحترافية (13 قسماً)
- المرحلة 9: Firebase Sync
- المرحلة 10: PWA (manifest, service worker, icons)

---

## [0.3.0] — 2026-10-05 — Phase 5 Complete

### أُضيف

**طبقة الأمان (Security Layer):**
- `src/security/pin-crypto.js` — SHA-256 + Salt (WebCrypto)
- `src/security/auth.js` — مصادقة، قفل بالمحاولات، جلسات

**مكونات الواجهة (UI Components):**
- `src/ui/toast.js` — إشعارات قصيرة (success, warning, danger, info)
- `src/ui/modal.js` — نوافذ منبثقة + confirm (Promise-based)
- `src/ui/controls.js` — Toggle + Color Picker + Slider
- `src/ui/form-builder.js` — نماذج ديناميكية (9 أنواع حقول)
- `src/ui/sidebar.js` — قائمة جانبية (10 عناصر)
- `src/ui/topbar.js` — شريط علوي (عنوان + أزرار ديناميكية)
- `src/ui/layout.js` — App Shell (Sidebar + Topbar + Content + Overlay)

**طبقة الأنماط (Styles):**
- `styles/components.css` — 14 مكون واجهة (buttons, cards, toasts, modal, toggle, slider, ...)
- `styles/layout.css` — App Shell + Sidebar + Topbar + responsive

**بنية الاختبارات (Test Registry Pattern):**
- `src/tests/registry.js` — سجل اختبارات (register + runAll)
- `src/tests/index.js` — قائمة الوحدات (Entry Point)
- `src/tests/modules/core.test.js` — 32 اختباراً
- `src/tests/modules/data.test.js` — 22 اختباراً
- `src/tests/modules/repos.test.js` — 52 اختباراً
- `src/tests/modules/security.test.js` — 16 اختباراً
- `src/tests/modules/ui.test.js` — 22 اختباراً

### تغيّر

**البنية:**
- إعادة تنظيم الاختبارات من ملف واحد ضخم (~900 سطر) إلى 5 وحدات
- `main.js` أصبح يستخدم App Shell + Dynamic imports
- إلغاء شاشة التحميل (`#app-loading`) نهائياً
- `index.html` يُظهر `#app` فوراً مع نص placeholder

### الأمان
- SHA-256 + Salt عشوائي (16 بايت) لتشفير PIN
- قفل تلقائي بعد 5 محاولات فاشلة (30 ثانية)
- جلسات بمدة قابلة للتخصيص (24 ساعة افتراضياً)

### الاختبارات
- **144 اختباراً** في 22 وحدة — كلها ناجحة ✅
- إضافة `Registry Pattern` لتقليل حجم التعديلات المستقبلية

### إصلاحات
- `form-builder.js`: `Number('')` → 0 خطأ (يُعود الآن `''` للحقول الفارغة)
- إعادة هيكلة كاملة لملفات الاختبارات (تحسين الأداء والصيانة)

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

### تغيّر
- `src/core/config.js` — ترقية DB version من 1 إلى 2 + مفاتيح تخزين جديدة

### الأمان
- إصلاح ثغرة `data:image/svg+xml` في `sanitizeUrl`
- إصلاح خطأ IDB: `boolean` غير صالح كمفاتيح فهرس

### الاختبارات
- **122 اختباراً** — كلها ناجحة ✅

---

## [0.1.0] — 2026-10-04 — Phase 1 Complete

### أُضيف
- `index.html` — هيكل التطبيق + CSP مشدد (12 توجيهاً)
- `styles/base.css` — Reset + Variables + Typography + Animations
- `styles/main.css` — مُجمِّع الأنماط (Aggregator)
- `src/core/config.js` — ثوابت المشروع
- `src/core/events.js` — EventBus (Pub/Sub)
- `src/core/sanitize.js` — خط الدفاع ضد XSS
- `src/core/dom.js` — أدوات DOM آمنة
- `src/core/utils.js` — Validators + Formatters + Timing + agoPhrase

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
