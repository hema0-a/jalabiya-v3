# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### قيد التطوير — المرحلة 7
- صفحة الدفعات (payments)
- صفحة المخزون (inventory)
- صفحة العمال (workers)
- صفحة المصروفات (expenses)
- صفحة التقارير (reports)

### مخطط لاحقاً
- المرحلة 8: الإعدادات الاحترافية (13 قسماً)
- المرحلة 9: Firebase Sync
- المرحلة 10: PWA (manifest, service worker, icons)

---

## [0.4.0] — 2026-10-05 — Phase 6 Complete

### أُضيف

**الصفحات الأساسية (Pages):**
- `src/pages/customers.js` — صفحة العملاء (CRUD + بحث فوري + VIP + سلة محذوفات)
- `src/pages/orders.js` — صفحة الطلبات (CRUD + فلاتر بالحالة + تقدّم الحالة)
- `src/pages/dashboard.js` — لوحة المعلومات (KPIs حقيقية من IndexedDB)

**اختبارات الصفحات:**
- `src/tests/modules/pages.test.js` — 8 اختبارات (customers)
- `src/tests/modules/orders.test.js` — 8 اختبارات (orders)
- `src/tests/modules/dashboard.test.js` — 8 اختبارات (dashboard)

### تغيّر

- `src/main.js` — إضافة Dashboard كصفحة "الرئيسية" الحقيقية
- `src/tests/index.js` — إضافة 3 وحدات اختبار جديدة

### الميزات

**صفحة العملاء:**
- إضافة/تعديل/حذف (بـ modal + form)
- بحث فوري (اسم أو هاتف، غير حساس لحالة الأحرف)
- تبديل حالة VIP
- الحذف ينقل إلى سلة المحذوفات (restorable)
- إحصائيات: الإجمالي + عدد VIP

**صفحة الطلبات:**
- إضافة/تعديل/حذف طلب
- ربط بعميل من قائمة منسدلة
- 5 حالات: pending → in_progress → ready → delivered / cancelled
- زر "▶️ التالي" للانتقال بين الحالات
- فلاتر تفاعلية مع عدّاد لكل حالة
- إحصائيات: الإجمالي، النشط، الجاهز، مجموع المبالغ

**لوحة المعلومات:**
- ترحيب حسب وقت اليوم (صباح/مساء)
- 4 KPIs: العملاء، الطلبات النشطة، إيرادات الشهر، مواعيد اليوم
- قسم "طلبات مستحقة خلال 7 أيام"
- قسم "مواعيد اليوم"
- قسم "أحدث 5 عملاء"

### الاختبارات
- **168 اختباراً** في 25 وحدة — كلها ناجحة ✅

---

## [0.3.0] — 2026-10-05 — Phase 5 Complete

### أُضيف

**طبقة الأمان (Security Layer):**
- `src/security/pin-crypto.js` — SHA-256 + Salt (WebCrypto)
- `src/security/auth.js` — مصادقة، قفل بالمحاولات، جلسات

**مكونات الواجهة (UI Components):**
- `src/ui/toast.js` — إشعارات قصيرة
- `src/ui/modal.js` — نوافذ منبثقة + confirm
- `src/ui/controls.js` — Toggle + Color Picker + Slider
- `src/ui/form-builder.js` — نماذج ديناميكية
- `src/ui/sidebar.js` — قائمة جانبية
- `src/ui/topbar.js` — شريط علوي
- `src/ui/layout.js` — App Shell

**طبقة الأنماط:**
- `styles/components.css` — 14 مكون واجهة
- `styles/layout.css` — App Shell + responsive

**بنية الاختبارات:**
- `src/tests/registry.js` — سجل اختبارات (Registry Pattern)
- `src/tests/index.js` — قائمة الوحدات
- 5 وحدات اختبار (core, data, repos, security, ui)

### تغيّر
- إعادة تنظيم الاختبارات من ملف واحد إلى 5 وحدات
- إلغاء شاشة التحميل نهائياً
- `main.js` يستخدم App Shell + Dynamic imports

### الأمان
- SHA-256 + Salt عشوائي (16 بايت)
- قفل تلقائي بعد 5 محاولات فاشلة
- جلسات (24 ساعة افتراضياً)

### الاختبارات
- **144 اختباراً** ✅

### إصلاحات
- `form-builder.js`: `Number('')` → 0 خطأ

---

## [0.2.0] — 2026-10-04 — Phase 2 Complete

### أُضيف

**طبقة البيانات:**
- `src/data/schema.js` — 10 مخازن + 24 فهرساً + تحقق
- `src/data/idb.js` — غلاف Promise + Migrations
- `src/data/repository.js` — CRUD عام

**10 مستودعات:** customers, orders, payments, inventory, workers, settings, appointments, expenses, trash.

### تغيّر
- `src/core/config.js` — DB version 1 → 2

### الأمان
- إصلاح ثغرة `data:image/svg+xml` في `sanitizeUrl`
- إصلاح خطأ IDB: `boolean` غير صالح كمفاتيح فهرس

### الاختبارات
- **122 اختباراً** ✅

---

## [0.1.0] — 2026-10-04 — Phase 1 Complete

### أُضيف
- `index.html` — هيكل + CSP مشدد (12 توجيهاً)
- `styles/base.css` — Reset + Variables + Typography + Animations
- `styles/main.css` — مُجمِّع
- `src/core/config.js`, `events.js`, `sanitize.js`, `dom.js`, `utils.js`

### الأمان
- CSP مشدد بـ 12 توجيهاً
- رفض `data:image/svg` في sanitizeUrl
- escapeHtml / escapeAttr

---

## [0.0.1] — 2026-10-04 — Bootstrap

### أُضيف
- إنشاء المستودع `jalabiya-v3`
- تفعيل GitHub Pages
- `README.md`, `.gitignore`, `docs/TODO.md`
