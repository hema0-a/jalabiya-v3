# Architecture — ورشة تفصيل الجلابيب V3

دليل معماري مختصر يشرح بنية التطبيق والعلاقات بين مكوناته.

---

## 🏛️ المبادئ الأربعة

1. **Event-Driven** — التواصل بين الوحدات عبر `EventBus` (لا استدعاءات مباشرة).
2. **Repository Pattern** — الصفحات لا تلمس IndexedDB؛ كل شيء عبر Repository.
3. **Single State Source** — `config.js` مصدر الحقيقة للثوابت، `settings.js` للإعدادات.
4. **Vanilla JS** — لا frameworks، فقط ES6 Modules.

---

## 📁 بنية المجلدات
