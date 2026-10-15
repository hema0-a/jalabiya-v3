/* collapsible.test.js - ui/collapsible */
import { register } from '../registry.js';
import { createCollapsible, _internal } from '../../ui/collapsible.js';

register('ui/collapsible.js', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);

  const content = document.createElement('div');
  content.textContent = 'content';

  const c1 = createCollapsible({
    id: 'test-1',
    title: 'Section 1',
    content,
  });

  await t.test('1. returns node + functions',
    c1.node instanceof HTMLElement &&
    typeof c1.open === 'function' &&
    typeof c1.close === 'function' &&
    typeof c1.toggle === 'function' &&
    typeof c1.isOpen === 'function' &&
    typeof c1.setId === 'function');

  await t.test('2. default closed + aria=false',
    c1.isOpen() === false &&
    c1.node.querySelector('.collapsible__header').getAttribute('aria-expanded') === 'false');

  c1.open();
  await t.test('3. open() opens + class + aria=true',
    c1.isOpen() === true &&
    c1.node.classList.contains('collapsible--open') &&
    c1.node.querySelector('.collapsible__header').getAttribute('aria-expanded') === 'true');

  c1.close();
  await t.test('4. close() closes',
    c1.isOpen() === false &&
    !c1.node.classList.contains('collapsible--open'));

  c1.toggle();
  const afterOpen = c1.isOpen();
  c1.toggle();
  const afterClose = c1.isOpen();
  await t.test('5. toggle() switches',
    afterOpen === true && afterClose === false);

  c1.open();
  const stored = JSON.parse(localStorage.getItem(_internal.STATE_KEY) || '{}');
  await t.test('6. state saved to localStorage',
    stored['test-1'] === true);

  const contentEl = c1.node.querySelector('.collapsible__content');
  await t.test('7. content has role=region + aria-labelledby',
    contentEl.getAttribute('role') === 'region' &&
    contentEl.getAttribute('aria-labelledby') === 'collapsible-header-test-1');

  const header = c1.node.querySelector('.collapsible__header');
  await t.test('8. header has aria-controls pointing to content',
    header.getAttribute('aria-controls') === 'collapsible-content-test-1');

  localStorage.removeItem(_internal.STATE_KEY);
});

/* ==========================================================================
   v2 — إصلاحات + ميزات جديدة (v3.3.63)
   ========================================================================== */
import { openAll, closeAll, pruneState, revealCollapsible } from '../../ui/collapsible.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const mk = (txt = 'c') => { const d = document.createElement('div'); d.textContent = txt; return d; };
const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

register('ui/collapsible.js v2', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);
  const host = document.createElement('div');
  document.body.appendChild(host);

  /* --- بنية + inert + ARIA --- */
  const a = createCollapsible({ id: 'v2-a', title: 'A', content: mk('A-content') });
  host.appendChild(a.node);
  const wrapA = a.node.querySelector('.collapsible__content');
  await t.test('1. محتوى عادي يُلحق فوراً داخل .collapsible__body',
    !!a.node.querySelector('.collapsible__content > .collapsible__body') &&
    a.node.textContent.includes('A-content'));
  await t.test('2. المغلق: inert + aria-hidden=true',
    wrapA.inert === true && wrapA.getAttribute('aria-hidden') === 'true');
  a.open();
  await t.test('3. المفتوح: بلا inert ولا aria-hidden',
    wrapA.inert === false && !wrapA.hasAttribute('aria-hidden'));

  /* --- setId: aria-controls (كان ناقصاً) --- */
  a.setId('v2-a2');
  await t.test('4. setId يحدّث aria-controls/labelledby/ids معاً',
    a.node.querySelector('.collapsible__header').getAttribute('aria-controls') === 'collapsible-content-v2-a2' &&
    wrapA.id === 'collapsible-content-v2-a2' &&
    wrapA.getAttribute('aria-labelledby') === 'collapsible-header-v2-a2');
  await t.test('5. setId ينقل الحالة المخزّنة للمعرّف الجديد',
    _internal.readState()['v2-a2'] === true && !('v2-a' in _internal.readState()));

  /* --- معرّفات تلقائية فريدة --- */
  const u1 = createCollapsible({ title: 'x', content: mk() });
  const u2 = createCollapsible({ title: 'y', content: mk() });
  await t.test('6. معرّفات تلقائية مختلفة (بلا Date.now)',
    u1.node.dataset.collapsibleId !== u2.node.dataset.collapsibleId);

  /* --- XSS --- */
  const xss = createCollapsible({ id: 'v2-xss', title: '<img src=x onerror=alert(1)>', summary: '<b>s</b>', content: mk() });
  await t.test('7. العنوان والملخص نصّ فقط (لا عناصر)',
    xss.node.querySelector('.collapsible__title img') === null &&
    xss.node.querySelector('.collapsible__summary b') === null &&
    xss.node.querySelector('.collapsible__title').textContent.includes('<img'));

  /* --- ملخص + شارة --- */
  const sb = createCollapsible({ id: 'v2-sb', title: 'S', content: mk() });
  const sumEl = sb.node.querySelector('.collapsible__summary');
  const badgeEl = sb.node.querySelector('.collapsible__badge');
  await t.test('8. الملخص والشارة مخفيان افتراضياً', sumEl.hidden === true && badgeEl.hidden === true);
  sb.setSummary('3 طلبات متأخرة'); sb.setBadge(3);
  await t.test('9. setSummary/setBadge يظهران بالقيمة',
    sumEl.hidden === false && sumEl.textContent === '3 طلبات متأخرة' && badgeEl.hidden === false && badgeEl.textContent === '3');
  sb.setBadge(0); sb.setSummary('');
  await t.test('10. القيمة 0/الفارغ تخفيهما', badgeEl.hidden === true && sumEl.hidden === true);

  /* --- وضع حصري --- */
  const gHost = document.createElement('div');
  host.appendChild(gHost);
  const g1 = createCollapsible({ id: 'v2-g1', title: '1', content: mk(), group: 'grp', persist: false });
  const g2 = createCollapsible({ id: 'v2-g2', title: '2', content: mk(), group: 'grp', persist: false });
  const free = createCollapsible({ id: 'v2-free', title: 'f', content: mk(), persist: false });
  gHost.append(g1.node, g2.node, free.node);
  free.open(); g1.open(); g2.open();
  await t.test('11. المجموعة الحصرية: فتح الثاني يغلق الأول',
    g1.isOpen() === false && g2.isOpen() === true &&
    g1.node.querySelector('.collapsible__header').getAttribute('aria-expanded') === 'false');
  await t.test('12. قسم خارج المجموعة لا يتأثر', free.isOpen() === true);

  /* --- تحميل كسول --- */
  let calls = 0;
  const lz = createCollapsible({ id: 'v2-lz', title: 'L', persist: false, content: async () => { calls++; return mk('lazy-ok'); } });
  host.appendChild(lz.node);
  await t.test('13. الكسول: لم يُستدعَ قبل الفتح ولا محتوى', calls === 0 && !lz.node.textContent.includes('lazy-ok'));
  lz.open(); await nextFrame();
  await t.test('14. الكسول: يُستدعى عند الفتح ويُبنى المحتوى',
    calls === 1 && lz.node.textContent.includes('lazy-ok') &&
    !lz.node.querySelector('.collapsible__content').hasAttribute('aria-busy'));
  lz.close(); lz.open(); await nextFrame();
  await t.test('15. الكسول: مرة واحدة فقط (لا إعادة بناء)', calls === 1);

  let calls2 = 0;
  const lzOpen = createCollapsible({ id: 'v2-lz2', title: 'L2', persist: false, defaultOpen: true, content: () => { calls2++; return mk('x'); } });
  await nextFrame();
  await t.test('16. الكسول + defaultOpen: يُبنى فوراً', calls2 === 1 && lzOpen.node.textContent.includes('x'));

  let fail = true;
  const lzErr = createCollapsible({ id: 'v2-lze', title: 'E', persist: false, content: async () => { if (fail) throw new Error('boom'); return mk('recovered'); } });
  const origErr = console.error; console.error = () => {};
  lzErr.open(); await nextFrame();
  console.error = origErr;
  const retry = lzErr.node.querySelector('.collapsible__retry');
  await t.test('17. فشل الكسول: رسالة خطأ + زر إعادة المحاولة', !!retry && !!lzErr.node.querySelector('[role="alert"]'));
  fail = false; retry.click(); await nextFrame();
  await t.test('18. إعادة المحاولة تنجح وتبني المحتوى', lzErr.node.textContent.includes('recovered'));

  /* --- كيبورد --- */
  const kHost = document.createElement('div');
  host.appendChild(kHost);
  const ks = ['k1', 'k2', 'k3'].map((id) => createCollapsible({ id, title: id, content: mk(), persist: false }));
  ks.forEach((k) => kHost.appendChild(k.node));
  const hs = ks.map((k) => k.node.querySelector('.collapsible__header'));
  hs[0].focus(); key(hs[0], 'ArrowDown');
  const d1 = document.activeElement === hs[1];
  key(hs[1], 'End');
  const d2 = document.activeElement === hs[2];
  key(hs[2], 'ArrowDown');                                   // التفاف للأول
  const d3 = document.activeElement === hs[0];
  key(hs[0], 'ArrowUp');                                     // التفاف للأخير
  const d4 = document.activeElement === hs[2];
  key(hs[2], 'Home');
  await t.test('19. ↓ End ↓(التفاف) ↑(التفاف) Home تنقل بين العناوين',
    d1 && d2 && d3 && d4 && document.activeElement === hs[0]);

  /* --- openAll/closeAll: onToggle + inert + حفظ --- */
  localStorage.removeItem(_internal.STATE_KEY);
  let toggles = 0;
  const oaHost = document.createElement('div');
  host.appendChild(oaHost);
  const o1 = createCollapsible({ id: 'oa1', title: '1', content: mk(), onToggle: () => toggles++ });
  const o2 = createCollapsible({ id: 'oa2', title: '2', content: mk(), onToggle: () => toggles++ });
  oaHost.append(o1.node, o2.node);
  openAll(oaHost);
  await t.test('20. openAll: isOpen صحيح + inert مرفوع + onToggle استُدعي',
    o1.isOpen() && o2.isOpen() && toggles === 2 &&
    o1.node.querySelector('.collapsible__content').inert === false);
  await t.test('21. openAll يحفظ الحالة', _internal.readState().oa1 === true && _internal.readState().oa2 === true);
  closeAll(oaHost);
  await t.test('22. closeAll: مغلق + inert + محفوظ',
    !o1.isOpen() && !o2.isOpen() && toggles === 4 &&
    o2.node.querySelector('.collapsible__content').inert === true && _internal.readState().oa2 === false);

  /* --- persist:false + كاش + تقليم --- */
  localStorage.removeItem(_internal.STATE_KEY);
  const np = createCollapsible({ id: 'v2-np', title: 'np', content: mk(), persist: false });
  np.open();
  await t.test('23. persist:false لا يكتب في localStorage', !(_internal.STATE_KEY in localStorage) || !('v2-np' in _internal.readState()));

  localStorage.setItem(_internal.STATE_KEY, JSON.stringify({ 'v2-cache': true }));
  const c1 = createCollapsible({ id: 'v2-cache', title: 'c', content: mk() });
  localStorage.setItem(_internal.STATE_KEY, JSON.stringify({ 'v2-cache': false }));   // تعديل خارجي (تبويب آخر)
  const c2 = createCollapsible({ id: 'v2-cache', title: 'c', content: mk() });
  await t.test('24. الكاش يلتقط التعديل الخارجي للتخزين', c1.isOpen() === true && c2.isOpen() === false);

  for (let i = 0; i < _internal.MAX_STORED + 40; i++) _internal.writeState('bulk' + i, true);
  await t.test('25. سقف التخزين: لا يتجاوز MAX_STORED والأحدث يبقى',
    Object.keys(_internal.readState()).length <= _internal.MAX_STORED &&
    _internal.readState()['bulk' + (_internal.MAX_STORED + 39)] === true &&
    !('bulk0' in _internal.readState()));
  _internal.writeState('keep-me', true);
  const removed = pruneState(['keep-me']);
  await t.test('26. pruneState يحذف غير الصالح فقط',
    removed > 0 && Object.keys(_internal.readState()).join() === 'keep-me');

  /* --- reveal + revealCollapsible --- */
  const rv = createCollapsible({ id: 'v2-rv', title: 'rv', content: mk(), persist: false });
  host.appendChild(rv.node);
  rv.reveal({ scroll: false });
  await nextFrame();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  await t.test('27. reveal يفتح ويومض (إلا مع تقليل الحركة)',
    rv.isOpen() && (reduced || rv.node.classList.contains('collapsible--highlight')));
  await t.test('28. revealCollapsible بالمعرّف: موجود=true / غير موجود=false',
    revealCollapsible('v2-rv', host) === true && revealCollapsible('nope', host) === false);

  host.remove();
  localStorage.removeItem(_internal.STATE_KEY);
});
