# Changelog — ورشة تفصيل الجلابيب V3

جميع التغييرات المهمة في المشروع تُوثَّق هنا.
التنسيق يتبع [Keep a Changelog](https://keepachangelog.com/) و[Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### قيد التطوير — المرحلة 8
- صفحة الإعدادات الاحترافية (13 قسماً)
- بحث فوري + فهرس جانبي
- حفظ تلقائي + معاينة فورية

### مخطط لاحقاً
- المرحلة 9: Firebase Sync
- المرحلة 10: PWA (manifest, service worker, icons)

---

## [0.5.0] — 2026-10-05 — Phase 7 Complete

### أُضيف

**5 صفحات جديدة:**
- `src/pages/payments.js` — الدفعات (CRUD + طرائق دفع + إحصائيات الشهر)
- `src/pages/inventory.js` — المخزون (CRUD + فلاتر بالفئة + تنبيه نقص + تعديل الكمية)
- `src/pages/workers.js` — العمال (CRUD + تفعيل/تعطيل + رواتب)
- `src/pages/expenses.js` — المصروفات (CRUD + فلاتر بالفترة)
- `src/pages/reports.js` — التقارير (KPIs + رسوم بيانية بسيطة)

**ملف اختبارات موحّد:**
- `src/tests/modules/pages2.test.js` — 13 اختباراً للصفحات الجديدة

### تغيّر

- `src/main.js` — دمج كل الصفحات الثمانية عبر `renderRepoPage()`
- `src/tests/index.js` — إضافة `pages2.test.js`

### الميزات

**صفحة الدفعات:**
- إضافة/تعديل/حذف دفعة
- ربط بعميل من قائمة
- 4 طرائق دفع: نقدي، InstaPay، Vodafone Cash، أخرى
- إحصائيات: الإجمالي + إجمالي الشهر

**صفحة المخزون:**
- إضافة/تعديل/حذف صنف
- 5 فئات: قماش، خيوط، إكسسوارات، أدوات، أخرى
- فلاتر تفاعلية
- تنبيه بصري عند نقص المخزون (< 5)
- أزرار +/- لتعديل الكمية السريع
- إحصائيات: الأصناف + أصناف ناقصة

**صفحة العمال:**
- إضافة/تعديل/حذف عامل
- تفعيل/تعطيل بنقرة
- إحصائيات: الإجمالي، النشط، مجموع الرواتب
- فلاتر: الكل، نشط، معطَّل

**صفحة المصروفات:**
- إضافة/تعديل/حذف مصروف
- 8 فئات: قماش، خيوط، أدوات، إيجار، كهرباء، مياه، رواتب، أخرى
- فلاتر بالفترة: الأسبوع، الشهر، السنة، الكل
- إحصائيات: الإجمالي + عدد البنود

**صفحة التقارير:**
- 4 KPIs: الإيرادات، المصروفات، الربح، طلبات الفترة
- رسم توزيع الطلبات (شريط بياني)
- رسم أكثر العملاء دفعاً (Top 5)
- فلاتر بالفترة

### الاختبارات
- **181 اختباراً** في 26 وحدة — كلها ناجحة ✅

---

## [0.4.0] — 2026-10-05 — Phase 6 Complete

### أُضيف
- `src/pages/customers.js` — CRUD + بحث + VIP + سلة محذوفات
- `src/pages/orders.js` — CRUD + فلاتر بالحالة + تقدّم الحالة
- `src/pages/dashboard.js` — KPIs حقيقية
- `src/tests/modules/pages.test.js`, `orders.test.js`, `dashboard.test.js`

### الميزات
- كل صفحة تدعم CRUD كامل + modal + toast + سلة محذوفات
- Dashboard يعرض ترحيباً حسب الوقت + 4 KPIs + طلبات مستحقة + مواعيد اليوم

### الاختبارات
- **168 اختباراً** ✅

---

## [0.3.0] — 2026-10-05 — Phase 5 Complete

### أُضيف

**طبقة الأمان:**
- `src/security/pin-crypto.js` — SHA-256 + Salt
- `src/security/auth.js` — مصادقة + قفل + جلسات

**مكونات الواجهة (7):**
- `src/ui/toast.js`, `modal.js`, `controls.js`, `form-builder.js`
- `src/ui/sidebar.js`, `topbar.js`, `layout.js`

**الأنماط:**
- `styles/components.css` — 14 مكون
- `styles/layout.css` — App Shell + responsive

**بنية الاختبارات (Registry Pattern):**
- `src/tests/registry.js`, `index.js`
- 5 وحدات اختبار (core, data, repos, security, ui)

### تغيّر
- إلغاء شاشة التحميل نهائياً
- إعادة تنظيم الاختبارات في وحدات

### الاختبارات
- **144 اختباراً** ✅

---

## [0.2.0] — 2026-10-04 — Phase 2 Complete

### أُضيف
- `src/data/schema.js`, `idb.js`, `repository.js`
- 10 مستودعات في `src/data/repos/`

### الأمان
- إصلاح ثغرة `data:image/svg+xml` في `sanitizeUrl`
- إصلاح خطأ IDB: `boolean` غير صالح كمفاتيح فهرس

### الاختبارات
- **122 اختباراً** ✅

---

## [0.1.0] — 2026-10-04 — Phase 1 Complete

### أُضيف
- `index.html` — CSP مشدد
- `styles/base.css`, `main.css`
- `src/core/config.js`, `events.js`, `sanitize.js`, `dom.js`, `utils.js`

### الاختبارات
- **39 اختباراً** ✅

---

## [0.0.1] — 2026-10-04 — Bootstrap

### أُضيف
- إنشاء المستودع `jalabiya-v3`
- تفعيل GitHub Pages
- `README.md`, `.gitignore`, `docs/TODO.md`
