# TODO — مؤجَّلات V3.1

## 🚀 Performance
- [ ] إعادة النظر في `@import` في CSS (تحويلها إلى `<link>` متعددة أو Concatenation عند البناء).

## 🔒 Security
- [ ] إضافة `frame-ancestors` عبر Cloudflare (GitHub Pages لا يدعمها عبر `<meta>`).

## 🏗️ Architecture
- [ ] نقل `DEFAULT_DB` من `schema.js` (تأكيد المكان الصحيح).
- [ ] مراجعة قيم `SYNC_CONFIG` بعد تصميم `firebase-init.js`.

## 🎯 EventBus
- [ ] تمرير اسم الحدث في `emit` → `handler(data, event)` لدعم مستمع عام `'*'`.

## 📌 Notes
- كل بند يُنفَّذ يُحذف من هنا ويُسجَّل في CHANGELOG (سيُنشأ لاحقاً).
- مراجعة القائمة قبل بدء V3.1.
