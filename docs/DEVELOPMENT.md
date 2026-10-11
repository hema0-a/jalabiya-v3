# دليل بيئة التطوير

## البدء (مرة واحدة)

```bash
npm run setup        # يثبّت playwright + Chromium
```

> المتطلبات: Node 20 أو أحدث. لا توجد أي اعتماديات تشغيل — التطبيق Vanilla JS، و`playwright` أداة اختبار فقط.

## الأوامر اليومية

| الأمر | ما يفعله |
|---|---|
| `npm run dev` | خادم محلي على http://localhost:8080 بدون كاش (`-- 3000` لتغيير المنفذ، `--log` لعرض الطلبات) |
| `npm run dev:mobile` | نفس الخادم لكن متاح على الشبكة؛ افتح العنوان المطبوع من جوالك على نفس الـ Wi-Fi |
| `npm run check:static` | سريع (ثوانٍ، بلا متصفح): صياغة كل ملفات JS + فحص الاتساق |
| `npm run test:browser` | الاختبارات (537+) في Chromium + فتح كل الصفحات الـ28 والتأكد من خلوّها من الأخطاء |
| `npm run check` | الاثنان معاً — شغّله قبل كل commit |
| `npm run bump -- patch` | يرفع الإصدار في كل الأماكن (أو `3.4.0` / `minor` / `major`) |

خيارات `test:browser`: `-- --only=tests` أو `-- --only=pages` أو `-- --headed` (تشاهد المتصفح). عند الفشل تجد لقطات الشاشة ومخرجات الاختبارات في `test-results/`.

## ما الذي يفحصه `check:consistency`؟

- رقم الإصدار نفسه في `package.json` و`config.js` و`sw.js` و`README` وأول سطر في `CHANGELOG`.
- كل ملف في `src/` (غير الاختبارات) وكل ملف CSS مذكور في `PRECACHE_URLS` داخل `sw.js` — وإلا لن يعمل offline — وكل مسار مذكور موجود فعلاً.
- كل ملف `*.test.js` مستورد في `src/tests/index.js` (وإلا لن يُشغَّل أبداً).
- أيقونات `manifest.json` وروابط `index.html` موجودة، ولا توجد BOM أو علامات دمج Git.

## سير العمل لإصدار جديد

1. عدّل الكود، وأضف ملف اختبار `src/tests/modules/audit-XXXX.test.js` واستورده في `src/tests/index.js`.
2. ملف جديد؟ أضفه إلى `PRECACHE_URLS` في `sw.js` (الفحص سيذكّرك).
3. `npm run bump -- patch` ثم اكتب ملاحظات الإصدار في `CHANGELOG.md`.
4. `npm run check` — يجب أن يمر كله.
5. ادفع إلى GitHub؛ الـ CI يعيد نفس الفحص ويرفع لقطات الشاشة إن فشل.

## ملاحظات

- الـ Service Worker يخزّن الملفات؛ أثناء التطوير إن رأيت نسخة قديمة: DevTools → Application → Service Workers → Unregister، أو افتح نافذة خاصة.
- الاختبارات تعمل داخل المتصفح نفسه، ويمكنك تشغيلها يدوياً بفتح `http://localhost:8080/#/tests`.
