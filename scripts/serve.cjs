#!/usr/bin/env node
/* serve.cjs — خادم تطوير محلي بلا اعتماديات.
   npm run dev            → http://localhost:8080  (بدون كاش)
   npm run dev -- 3000    → منفذ آخر
   --host                 → إتاحته على الشبكة لتجربة الجوال (http://IP:PORT)
   --log                  → طباعة كل الطلبات
   ملاحظة: الـ Service Worker يعمل على localhost؛ إن ظهرت نسخة قديمة افتح DevTools → Application → Unregister. */
const os = require('os');
const { createServer, listen } = require('./lib/static-server.cjs');

const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a))) || Number(process.env.PORT) || 8080;
const exposed = args.includes('--host');
const host = exposed ? '0.0.0.0' : '127.0.0.1';

listen(createServer({ noCache: true, log: args.includes('--log') }), port, host).then(({ port: p }) => {
  console.log(`\n  ورشة الجلابيب — خادم التطوير\n  محلي:   http://localhost:${p}/`);
  if (exposed) {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  الشبكة: http://${i.address}:${p}/`);
    }
  }
  console.log(`  الاختبارات: http://localhost:${p}/#/tests\n  (Ctrl+C للإيقاف)\n`);
}).catch((e) => { console.error(e.code === 'EADDRINUSE' ? `المنفذ ${port} مستخدم — جرّب: npm run dev -- ${port + 1}` : e); process.exit(1); });
