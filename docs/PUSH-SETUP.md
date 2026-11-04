# إعداد الإشعارات الحقيقية (Push) — مرة واحدة

تصلك إشعارات بمواعيد التسليم والمتأخر والجاهز والمخزون والالتزامات **حتى لو التطبيق مغلق**.
الفكرة: التطبيق يرفع «ملخصاً» صغيراً (أعداد/تواريخ، وأول اسم العميل اختيارياً) إلى حسابك في Firestore،
ودالة سحابية تعمل كل 15 دقيقة وترسل إشعاراً واحداً يومياً في الوقت الذي تختاره.

## ما تحتاجه
1. مشروع Firebase الحالي (`jalabiya-workshop-v2`) على **خطة Blaze** (مجانية عملياً لهذا الحجم؛ تحتاج بطاقة للتفعيل).
2. تسجيل الدخول في «المزامنة السحابية» داخل التطبيق.

## الخطوات
### 1) مفتاح VAPID
Firebase Console ← ⚙️ Project settings ← **Cloud Messaging** ← *Web Push certificates* ← **Generate key pair**
ثم انسخ المفتاح (يبدأ بـ `B...`).

### 2) قواعد Firestore
انسخ محتوى `firestore.rules` إلى Firestore ← Rules ← **Publish** (أُضيف مسار `users_v3/{uid}/push`).

### 3) نشر الدالة (اختر طريقة)
**أ) من GitHub (مناسب للجوال):**
1. Google Cloud Console ← IAM ← Service Accounts ← أنشئ حساباً بدور *Firebase Admin* (+ *Cloud Functions Admin* و*Service Account User*) ← Keys ← JSON.
2. GitHub ← المستودع ← Settings ← Secrets ← Actions ← سرّ جديد باسم `FIREBASE_SERVICE_ACCOUNT` بمحتوى الملف كاملاً.
3. Actions ← **Deploy Firebase** ← Run workflow ← `both`.

**ب) من Termux/الحاسوب:**
```bash
npm i -g firebase-tools
firebase login
firebase deploy --only functions,firestore:rules --project jalabiya-workshop-v2
```
> أول نشر يطلب تفعيل واجهات: Cloud Functions, Cloud Build, Artifact Registry, Cloud Scheduler — وافق عليها.

### 4) التفعيل في التطبيق
الإعدادات ← **إشعارات حقيقية (Push)** ← الصق مفتاح VAPID ← **تفعيل على هذا الجهاز** ← امنح الإذن.
جرّب زر **🧪 إشعار تجريبي من الخادم**. كرّر التفعيل على كل جهاز.

## ملاحظات
- **iPhone:** يتطلب iOS 16.4+ و«إضافة إلى الشاشة الرئيسية» أولاً.
- **الخصوصية:** عند إيقاف «إرسال أول اسم العميل» لا يغادر أي اسم جهازك. المستند خاص بحسابك فقط (قواعد Firestore).
- **التكرار:** إشعار واحد يومياً. تنبيه «قريب» يُرسل مرة لكل طلب وموعد. ساعات الهدوء تُحترم.
- إن كان التطبيق مفتوحاً أمامك لا يظهر إشعار نظام (تظهر رسالة داخل التطبيق).
- إن لم يُحدَّث الملخص (لم تفتح التطبيق أياماً) تبقى الإشعارات صحيحة بالتواريخ المخزنة، لكن لا تعكس الطلبات الجديدة.
- الرموز الميتة تُحذف تلقائياً. «إيقاف على هذا الجهاز» يحذف رمزه فوراً.
- اختبار منطق الإرسال محلياً: `node --test scripts/tests/push-logic.test.cjs`.
