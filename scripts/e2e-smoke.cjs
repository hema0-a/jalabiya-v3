'use strict';
/* ==========================================================================
   e2e-smoke.cjs — اختبار شامل على التطبيق الحقيقي ببيانات مزروعة (v3.21.1)
   ==========================================================================
   اختبارات الوحدات تفحص الدوال النقية وكل بطاقة منفردة؛ هذا يفتح التطبيق نفسه (index.html + الموجِّه + IndexedDB) ويمرّ
   بالشاشات الجديدة كما يفعل المستخدم: اللوحة ⟵ مركز العمل (تم/أجّل/استرجاع/الماكينات) ⟵ المركز المالي (السيولة) ⟵ التقارير
   ⟵ المخزون (المشتريات) ⟵ الطلبات (الإدخال السريع ⟵ نموذج الطلب) + الأدوار، ويفشل لو ظهر أي خطأ في الكونسول.
   وقد كشف عند أول تشغيل أن قسم «الماكينات» ينطوي بعد كل حفظ (أُصلح في 3.20.3).
   الاستخدام:  npm run test:e2e        (يعمل على أي منطقة زمنية؛ كل الانتظارات بالاستطلاع لا بمهل ثابتة)
   ========================================================================== */
const { createServer, listen } = require('./lib/static-server.cjs');
const { chromium } = require('playwright');

const IGNORE = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|Failed to load resource|fonts\.googleapis|gstatic/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = createServer(); const { port } = await listen(server, Number(process.env.PORT) || 0);
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await ctx.addInitScript(() => { localStorage.setItem('jalabiya_v3_onboarding_done', '1'); localStorage.setItem('jalabiya_v3_morning_summary', 'off'); });
  const page = await ctx.newPage(); const errs = []; const results = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  /* يستطلع شرطاً حتى يتحقق (≤ 8 ثوانٍ) — يغني عن مهل ثابتة هشّة على أجهزة بطيئة */
  async function until(fn, timeout = 8000) {
    const t0 = Date.now(); let last;
    while (Date.now() - t0 < timeout) { try { last = await fn(); if (last) return { ok: true, last }; } catch (e) { last = e.message; } await sleep(120); }
    return { ok: false, last };
  }
  async function check(name, fn, timeout) { const r = await until(fn, timeout); results.push({ name, ok: r.ok, detail: r.ok ? '' : String(r.last).slice(0, 220) }); return r.ok; }
  const getSettings = () => page.evaluate(async () => (await import('/src/data/repos/settings.js')).settings.get());
  const go = (h) => page.evaluate((x) => { location.hash = x; }, h);
  const base = `http://127.0.0.1:${port}/index.html`;

  try {
    await page.goto(base + '#/dashboard', { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#app, main, body'), null, { timeout: 15000 });

    /* ---- بذر بيانات عبر وحدات التطبيق نفسها ---- */
    await until(() => page.evaluate(async () => { try { await import('/src/data/repos/settings.js'); return true; } catch (e) { return false; } }));
    await page.evaluate(async () => {
      const L = (n) => import('/src/data/repos/' + n + '.js');
      const [{ customers }, { orders }, { payments }, { commitments }, { circles }, { workers }, { todos }, { documents }, { inventory }, { appointments }, { settings }] = await Promise.all(['customers', 'orders', 'payments', 'commitments', 'circles', 'workers', 'todos', 'documents', 'inventory', 'appointments', 'settings'].map(L));
      const D = 86400000; const T = Date.now(); const dom = new Date().getDate();
      const c1 = await customers.create({ name: 'محمد علي', phone: '01012345678' }); const c2 = await customers.create({ name: 'سعيد حسن', phone: '01122223333' });
      window.__c1 = c1.id;
      const o1 = await orders.create({ customerId: c1.id, status: 'pending', amount: 1200, dueDate: T - 3 * D, items: [{ name: 'جلابية صعيدي', price: 600, quantity: 2 }] });
      await orders.create({ customerId: c2.id, status: 'in_progress', amount: 900, dueDate: T + 2 * D, items: [{ name: 'جلابية', price: 450, quantity: 2 }] });
      await orders.create({ customerId: c1.id, status: 'ready', amount: 500, readyAt: T - 9 * D, items: [{ name: 'عباية', price: 500, quantity: 1 }] });
      await payments.create({ orderId: o1.id, customerId: c1.id, amount: 400, date: T - D });
      await commitments.create({ name: 'إيجار الورشة', amount: 3000, dueDay: Math.min(28, dom + 1), frequency: 'monthly', active: true });
      await circles.create({ name: 'جمعية الأسرة', installment: 500, members: 6, myTurn: 2, startYm: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'), payDay: Math.min(28, dom + 1), paid: {} });
      await workers.create({ name: 'عامل', salaryType: 'fixed', salary: 4000, active: true });
      await todos.create({ kind: 'task', title: 'اتصل بمورد القماش', due: T - D });
      await documents.create({ title: 'رخصة الورشة', expiresAt: T - 4 * D, remindDays: 30 });
      await appointments.create({ customerId: c2.id, title: 'قياس جلابية', date: T + 3600000, status: 'pending' });
      await inventory.create({ name: 'قماش أبيض', category: 'fabric', unit: 'متر', quantity: 4, minQuantity: 10 });
      await inventory.create({ name: 'خيط', category: 'thread', unit: 'بكرة', quantity: 0, minQuantity: 5 });
      await settings.update({ fabricCalc: { templates: [{ id: 't1', name: 'جلابية', addCm: 10, multiplier: 2, subtractCm: 30 }], wastePercent: 5, roundTo: 0 }, familyBudget: { total: 3000 }, machines: { list: [{ id: 'mc1', name: 'Daimoku AE-1410', hours: 104, lastServiceHours: 0, lastServiceAt: T, intervalHours: 100 }] } });
    });
    await page.reload({ waitUntil: 'load' });

    /* ---- 1) اللوحة ⟵ مركز العمل ---- */
    await check('اللوحة: بطاقة «📥 مركز العمل» تظهر', async () => (await page.locator('[data-testid=actions-teaser]').count()) === 1, 12000);
    await page.locator('[data-testid=actions-teaser]').click();
    await check('الضغط على البطاقة يفتح #/actions', async () => (await page.evaluate(() => location.hash)) === '#/actions');
    await check('مركز العمل: بنود من ≥ 7 أنواع وأولها طلب متأخر', async () => { const k = await page.evaluate(() => [...document.querySelectorAll('.action-item')].map((e) => e.dataset.kind)); return new Set(k).size >= 7 && k[0] === 'late-order'; });
    const before = await page.locator('.action-item').count();
    await page.locator('.action-item').first().getByText('✓ تم').click();
    await check('«✓ تم» يحفظ الحالة ويخفي البند', async () => { const st = await getSettings(); return Object.keys(st.actionCenter.done).length === 1 && (await page.locator('.action-item').count()) === before - 1; });
    await page.locator('.action-item select').first().selectOption('3');
    await check('«⏰ أجّل 3 أيام» يحفظ تاريخ العودة', async () => { const st = await getSettings(); const v = Object.values(st.actionCenter.snoozed); return v.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(v[0]); });
    await page.locator('[data-testid=actions-toggle-hidden]').click();
    await page.getByText('↩ استرجاع').first().click();
    await check('«↩ استرجاع» يزيل بنداً من المؤجَّل/المُنجَز', async () => { const st = await getSettings(); return Object.keys(st.actionCenter.snoozed).length + Object.keys(st.actionCenter.done).length === 1; });
    await page.evaluate(() => { document.querySelector('.machines-section').open = true; });
    await check('ماكينة متجاوزة الدورة (104/100) تظهر بنداً «صيانة»', async () => (await page.locator('.action-item[data-kind=machine]').count()) === 1);
    await page.locator('.action-item[data-kind=machine]').getByText('🛠️ تمّت الصيانة').click();
    await check('«تمّت الصيانة» تبدأ دورة جديدة ويختفي البند', async () => { const st = await getSettings(); return st.machines.list[0].lastServiceHours === 104 && (await page.locator('.action-item[data-kind=machine]').count()) === 0; });
    await check('قسم «الماكينات» يبقى مفتوحاً بعد الحفظ (حراسة 3.20.3)', async () => page.evaluate(() => document.querySelector('.machines-section').open === true));
    await page.locator('[data-action=add-machine]').click();
    await check('إضافة ماكينة جديدة بدورة 100', async () => { const st = await getSettings(); return st.machines.list.length === 2 && st.machines.list[1].intervalHours === 100; });
    await page.locator('.machine-row').last().getByText('+5 س').click();
    await check('+5 ساعات تُحفظ', async () => (await getSettings()).machines.list[1].hours === 5);

    /* ---- 2) المركز المالي: توقّع السيولة ---- */
    await go('#/financial-center');
    await check('المركز المالي: بطاقة توقّع السيولة', async () => (await page.locator('[data-testid=cashflow-card]').count()) === 1, 12000);
    const inp = page.locator('[data-role=cf-opening]'); await inp.fill('5000'); await inp.blur();
    await check('السيولة الحالية تُحفظ ويظهر «الرصيد بعد 30 يوماً»', async () => (await getSettings()).cashflow.opening === 5000 && /الرصيد بعد 30/.test(await page.locator('[data-testid=cashflow-card]').innerText()));

    /* ---- 3) التقارير ---- */
    await go('#/reports');
    await check('التقارير: بطاقتا الأسبوع والإقفال', async () => (await page.locator('[data-testid=weekly-card]').count()) === 1 && (await page.locator('[data-testid=month-close-card]').count()) === 1, 12000);
    await page.locator('[data-testid=month-close-card] [data-action=toggle-close]').click();
    await check('«اعتبر الشهر مُقفلاً» يحفظ علامة الشهر', async () => Object.keys((await getSettings()).monthClose.closed).length === 1);
    await page.locator('[data-testid=month-close-card] [data-action=toggle-close]').click();
    await check('«إلغاء الإقفال» يزيلها', async () => Object.keys((await getSettings()).monthClose.closed).length === 0);

    /* ---- 4) المخزون: اقتراح المشتريات ---- */
    await go('#/inventory');
    await check('المخزون: بطاقة اقتراح المشتريات', async () => (await page.locator('[data-testid=purchase-plan-card]').count()) === 1, 12000);
    await page.evaluate(() => { document.querySelector('[data-testid=purchase-plan-card]').open = true; });
    const h = page.locator('[data-role=pp-height]'); await h.fill('170'); await h.blur();
    await check('متوسط الطول يُحفظ (170 سم)', async () => (await getSettings()).purchasePlan.avgHeightCm === 170);

    /* ---- 5) الطلبات: الإدخال السريع ⟵ نموذج الطلب ---- */
    await go('#/orders');
    await check('الطلبات: لوحة الإدخال السريع', async () => (await page.locator('.quick-order').count()) === 1, 12000);
    await page.evaluate(() => { document.querySelector('.quick-order').open = true; });
    await page.locator('[data-testid=quick-order-input]').fill('جلابية محمد علي 600 الخميس عربون 200');
    await page.locator('[data-testid=quick-order-go]').click();
    await check('المعاينة تعرض العميل والسعر والعربون', async () => { const t = await page.locator('[data-testid=quick-order-out]').innerText(); return /محمد علي/.test(t) && /600/.test(t) && /200/.test(t); });
    await page.locator('[data-testid=quick-order-open]').click();
    const formOf = () => page.evaluate(() => { const m = document.querySelector('.modal, [role=dialog]'); if (!m) return null; return { fields: [...m.querySelectorAll('input,select,textarea')].map((e) => ({ t: e.type, v: e.value })), text: m.innerText, hidden: [...m.querySelectorAll('input')].map((e) => e.value), c1: window.__c1 }; });
    await check('نموذج الطلب يُفتح بالعميل المختار', async () => { const f = await formOf(); return !!f && (f.text.includes('محمد علي') || f.hidden.includes(f.c1)); });
    await check('النموذج معبّأ: العربون 200 · السعر 600 · البند جلابية · موعد تسليم', async () => { const f = await formOf(); return !!f && f.fields.some((x) => x.v === '200') && f.fields.some((x) => x.v === '600') && f.fields.some((x) => /جلابية/.test(x.v)) && f.fields.some((x) => x.t === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(x.v)); });
    await check('لا طلب حُفظ تلقائياً (3 طلبات فقط)', async () => (await page.evaluate(async () => (await (await import('/src/data/repos/orders.js')).orders.list()).length)) === 3);

    /* ---- 6) الأدوار ---- */
    await check('الأدوار: الاستقبال يفتح «مركز العمل» ولا يفتح «المركز المالي»', async () => page.evaluate(async () => { const { canAccess } = await import('/src/services/roles.js'); return canAccess('receptionist', 'actions') === true && canAccess('receptionist', 'financial-center') === false && canAccess('owner', 'actions') === true; }));
  } catch (e) {
    results.push({ name: 'تعطّل السكربت', ok: false, detail: String(e.message).split('\n')[0] });
  }
  results.push({ name: 'لا أخطاء في الكونسول ولا استثناءات صفحة', ok: errs.length === 0, detail: errs.slice(0, 4).join(' || ').slice(0, 300) });

  const failed = results.filter((r) => !r.ok);
  console.log(results.map((r) => (r.ok ? '✅ ' : '❌ ') + r.name + (r.ok || !r.detail ? '' : ' :: ' + r.detail)).join('\n'));
  console.log(`\ne2e: ${results.length - failed.length}/${results.length}`);
  await browser.close(); server.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('e2e crashed:', e); process.exit(2); });
