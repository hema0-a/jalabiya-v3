/* narrow-scan.cjs — فحص الشاشات الضيقة: لا تمرير أفقي في أي صفحة، ولا عنصر يخرج عن نافذة «إضافة»، ولا حقل أضيق من 60px.
   يُستدعى من ci-check.cjs (يلتقط مشاكل مثل تجاوز حقل التاريخ لحدود النافذة على 320/360px). */
async function scanNarrow(browser, base, widths, routes, shot) {
  const problems = [];
  for (const W of widths) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 700 }, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('jalabiya_v3_onboarding_done', '1'));
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    for (const r of routes) {
      await page.evaluate((x) => { location.hash = '#/' + x; }, r);
      await page.waitForTimeout(600);
      const wide = await page.evaluate(() => {
        const iw = innerWidth; const bad = [];
        document.querySelectorAll('#app *').forEach((e) => {
          if (e.closest('.sidebar')) return;
          const b = e.getBoundingClientRect();
          if (!(b.width > 0) || (b.right <= iw + 2 && b.left >= -2)) return;
          for (let a = e; a && a.id !== 'app'; a = a.parentElement) { if (/auto|scroll|hidden/.test(getComputedStyle(a).overflowX)) return; }
          bad.push(String(e.className || e.tagName).slice(0, 40));
        });
        return bad.slice(0, 3);
      });
      if (wide.length) problems.push(`${W}px /${r}: عناصر تتجاوز عرض الشاشة (${wide.join(', ')})`);

      const btns = await page.$$('#app button.btn--primary, #app button.btn--block');
      for (let i = 0; i < Math.min(btns.length, 3); i++) {
        const label = (await btns[i].innerText()).trim();
        if (!/إضافة|جديد|➕|تسجيل|\+/.test(label)) continue;
        try { await btns[i].click({ timeout: 1500 }); await page.waitForTimeout(350); } catch { continue; }
        const m = await page.evaluate(() => {
          const mo = document.querySelector('.modal'); if (!mo) return null;
          const mr = mo.getBoundingClientRect();
          const over = [...mo.querySelectorAll('input,select,button,textarea')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > mr.right + 1 || b.left < mr.left - 1); })
            .map((e) => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.textContent || e.tagName).trim().slice(0, 20));
          const tiny = [...mo.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.width < 60; })
            .map((e) => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.type) + ':' + Math.round(e.getBoundingClientRect().width));
          return { title: mo.querySelector('.modal__title')?.textContent || '', over, tiny };
        });
        if (m && (m.over.length || m.tiny.length)) {
          problems.push(`${W}px /${r} «${m.title}»: ${m.over.length ? 'تخرج عن النافذة: ' + m.over.join(', ') : ''} ${m.tiny.length ? 'حقول ضيقة: ' + m.tiny.join(', ') : ''}`.trim());
          if (shot) await shot(`narrow-${W}-${r}`, page);
        }
        await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove()));
        await page.waitForTimeout(120);
      }
    }
    await ctx.close();
  }
  return problems;
}
module.exports = { scanNarrow };
