# إعداد الإشعارات الحقيقية (Push) — مرة واحدة

تصلك إشعارات بمواعيد التسليم والمتأخر والجاهز والمخزون والالتزامات **حتى لو التطبيق مغلق**.
الفكرة: التطبيق يرفع «ملخصاً» صغيراً (أعداد/تواريخ، وأول اسم العميل اختيارياً) إلى حسابك في Firestore،
وجهة إرسال خارجية تفحصه دورياً وترسل إشعاراً واحداً يومياً في الوقت الذي تختاره.

**طريقتان للإرسال (اختر واحدة فقط):**
- 🟢 **مجانية (موصى بها): GitHub Actions** — ملف `.github/workflows/push-cron.yml` يشغّل `scripts/push-runner.cjs` كل 30 دقيقة. **لا تحتاج خطة Blaze ولا بطاقة ولا Termux.**
- 🔵 **Cloud Functions** — دالة مجدولة كل 15 دقيقة. تحتاج **خطة Blaze** (بطاقة).

الطريقتان تستعملان **نفس منطق الرسالة** (`functions/push-logic.js`)، فتصلك نفس الأسطر (التسليم والمتأخر والمخزون والالتزامات والمستندات والجمعيات والمهام).

## ما تحتاجه
1. مشروع Firebase الحالي (`jalabiya-workshop-v2`). **خطة Blaze مطلوبة فقط للطريقة الزرقاء (Cloud Functions)**؛ الطريقة المجانية تعمل على خطة Spark.
2. تسجيل الدخول في «المزامنة السحابية» داخل التطبيق.

## الخطوات
### 1) مفتاح VAPID
Firebase Console ← ⚙️ Project settings ← **Cloud Messaging** ← *Web Push certificates* ← **Generate key pair**
ثم انسخ المفتاح (يبدأ بـ `B...`).

### 2) قواعد Firestore
انسخ محتوى `firestore.rules` إلى Firestore ← Rules ← **Publish** (أُضيف مسار `users_v3/{uid}/push`).

### 3) الإرسال — اختر طريقة

#### 🟢 المجانية: GitHub Actions (بلا Blaze)
1. فعّل واجهتين في Google Cloud (مجانيتان): **Cloud Firestore API** و**Firebase Cloud Messaging API**.
2. Google Cloud Console ← IAM & Admin ← Service Accounts ← أنشئ حساباً بدور *Firebase Admin* (أو *Cloud Datastore User* + *Firebase Cloud Messaging Admin*) ← Keys ← Add key ← JSON.
3. GitHub ← المستودع ← Settings ← Secrets and variables ← Actions ← سرّ جديد باسم `FIREBASE_SERVICE_ACCOUNT` بمحتوى ملف JSON كاملاً. **لا ترفع الملف في أي محادثة ولا تضعه في المستودع.**
4. انسخ محتوى `firestore.rules` إلى Firestore ← Rules ← Publish (الخطوة 2).
5. Actions ← **Push cron** ← Run workflow لتجربة التشغيل. بعدها يعمل تلقائياً كل 30 دقيقة (قد يتأخر GitHub بضع دقائق عن الموعد، فيصل الإشعار بعد الوقت المختار بـ0–30 دقيقة).
6. نظّف: إن كان عندك Workflow «Deploy Firebase» أو دوال منشورة سابقاً فلا حاجة لها مع هذه الطريقة (لا تشغّل الطريقتين معاً كي لا يصلك إشعاران).

> ⚠️ **تنبيه GitHub:** يوقف GitHub الـWorkflows المجدولة تلقائياً بعد **60 يوماً بلا أي نشاط** في المستودع العام. أي رفع جديد (commit) يعيد تشغيلها، أو فعّلها يدوياً من تبويب Actions.
> المستودع **الخاص** يستهلك من دقائق Actions المجانية (نحو 1 دقيقة لكل تشغيل، أي ≈1400 دقيقة شهرياً من 2000). فإن ضاقت الدقائق فعدّل `cron` في `push-cron.yml` إلى `'0,30 5-9 * * *'` (تشغيل صباحي فقط؛ التوقيت في GitHub هو **UTC**، أي 7–11 صباحاً بتوقيت القاهرة).

#### 🔵 Cloud Functions (تحتاج Blaze)
**من GitHub:**
1. نفس خطوة حساب الخدمة أعلاه، مع دور *Cloud Functions Admin* و*Service Account User* إضافةً.
2. نفس سرّ `FIREBASE_SERVICE_ACCOUNT`.
3. Actions ← **Deploy Firebase** ← Run workflow ← `both`.

**من Termux/الحاسوب:**
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

## الأمان
- مفتاح حساب الخدمة (JSON) يمنح صلاحية كاملة على مشروعك. إن ظهر في محادثة أو ملف أو لقطة شاشة فاعتبره مكشوفاً: Google Cloud ← Service Accounts ← الحساب ← Keys ← **احذف** المفتاح القديم ← أنشئ مفتاحاً جديداً ← حدّث السرّ `FIREBASE_SERVICE_ACCOUNT` في GitHub.
- مفتاح `apiKey` في `config.js` معرّف عام لتطبيق الويب (يُحميه Firestore Rules)، وليس سرّاً.
