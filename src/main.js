/* ==========================================================================
   main.js — DIAGNOSTIC + TESTS (Hybrid v2)
   ==========================================================================
   ✅ يستخدم textContent بدل innerHTML — يعرض كل الرموز حرفياً.
   ✅ Dynamic imports — لا تعلّق شاشة التحميل.
   ✅ 32 اختباراً موزّعة على 4 ملفات.
   ========================================================================== */

const output = [];
const render = () => {
  let pre = document.getElementById('__diag');
  if (!pre) {
    document.body.innerHTML = '';
    pre = document.createElement('pre');
    pre.id = '__diag';
    pre.style.cssText = 'padding:16px;margin:0;font-family:monospace;direction:ltr;text-align:left;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#111;color:#0f0;min-height:100vh;box-sizing:border-box';
    document.body.appendChild(pre);
  }
  // textContent — لا يُفسّر HTML، يعرض كل شيء حرفياً
  pre.textContent = output.join('\n');
};
const log = (msg) => { output.push(msg); render(); };

log('🚀 main.js running');
log('');

/* ==========================================================================
   استيراد الملفات (dynamic — لتفادي مشاكل static imports)
   ========================================================================== */
let c, ev, s, d, u;

try { c  = await import('./core/config.js');   log('✅ config.js'); }
catch (e) { log('❌ config.js: ' + e.message); }

try { ev = await import('./core/events.js');   log('✅ events.js'); }
catch (e) { log('❌ events.js: ' + e.message); }

try { s  = await import('./core/sanitize.js'); log('✅ sanitize.js'); }
catch (e) { log('❌ sanitize.js: ' + e.message); }

try { d  = await import('./core/dom.js');      log('✅ dom.js'); }
catch (e) { log('❌ dom.js: ' + e.message); }

try { u  = await import('./core/utils.js');    log('✅ utils.js'); }
catch (e) { log('❌ utils.js: ' + e.message); }

log('');

let totalPassed = 0;
let totalTests = 0;

/* ==========================================================================
   1. events.js (7 اختبارات)
   ========================================================================== */
if (ev && ev.events) {
  const events = ev.events;
  let passed = 0;
  const total = 7;
  log('▶ events.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    let r1 = 0;
    events.on('t1', () => { r1++; });
    events.emit('t1');
    assert('1. on + emit', r1 === 1);

    let r2a = 0, r2b = 0;
    events.on('t2', () => { r2a++; });
    events.on('t2', () => { r2b++; });
    events.emit('t2');
    assert('2. multiple listeners', r2a === 1 && r2b === 1);

    let r3 = 0;
    const h3a = () => { r3++; };
    const h3b = () => { r3++; events.off('t3', h3a); };
    events.on('t3', h3a);
    events.on('t3', h3b);
    let err3 = false;
    try { events.emit('t3'); } catch { err3 = true; }
    assert('3. off during emit', !err3 && r3 === 2);

    let r4 = 0;
    events.once('t4', () => { r4++; });
    events.emit('t4');
    events.emit('t4');
    assert('4. once fires once', r4 === 1);

    let r5 = true;
    try { events.emit('t5-no-listeners'); } catch { r5 = false; }
    assert('5. emit without listeners', r5);

    events.on('t6a', () => {});
    events.on('t6b', () => {});
    events.clear();
    assert('6. clear all', events.count() === 0);

    let r7 = 0;
    const unsub7 = events.on('t7', () => { r7++; });
    unsub7();
    events.emit('t7');
    assert('7. unsubscribe function', r7 === 0);
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 events: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else {
  log('⚠️ events.js skipped');
  totalTests += 7;
}
log('');

/* ==========================================================================
   2. sanitize.js (7 اختبارات)
   ========================================================================== */
if (s && s.escapeHtml) {
  let passed = 0;
  const total = 7;
  log('▶ sanitize.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    assert('1. escapeHtml <script>',   s.escapeHtml('<script>') === '&lt;script&gt;');
    assert('2. escapeHtml "quoted"',   s.escapeHtml('"quoted"') === '&quot;quoted&quot;');
    assert("3. escapeHtml O'Brien",    s.escapeHtml("O'Brien") === 'O&#39;Brien');
    assert('4. escapeHtml null/undef', s.escapeHtml(null) === '' && s.escapeHtml(undefined) === '');
    assert('5. escapeHtml 123',        s.escapeHtml(123) === '123');

    const urlCases = [
      ['javascript:alert(1)',           '',                            'js basic'],
      ['JavaScript:alert(1)',           '',                            'js case'],
      ['java\nscript:alert(1)',         '',                            'js newline'],
      ['javascript :alert(1)',          '',                            'js space before colon'],
      ['java\tscript:alert(1)',         '',                            'js tab'],
      ['\u0000javascript:alert(1)',     '',                            'js null byte'],
      ['vbscript:msgbox(1)',            '',                            'vbscript'],
      ['data:text/html,x',              '',                            'data html'],
      ['data:image/svg+xml,...',        '',                            'svg+xml'],
      ['data:image/svg,...',            '',                            'svg bare'],
      ['data:image/png;base64,A',       'data:image/png;base64,A',     'png allowed'],
      ['data:image/jpeg;base64',        'data:image/jpeg;base64',      'jpeg allowed'],
      ['https://example.com',           'https://example.com',         'https'],
      ['https://example.com?x=<script>','https://example.com?x=<script>','query with <script>'],
      ['/relative/path',                '/relative/path',              'relative'],
      ['',                              '',                            'empty'],
    ];
    let urlOk = 0;
    urlCases.forEach(([input, expected, label]) => {
      const actual = s.sanitizeUrl(input);
      if (actual === expected) urlOk++;
      else log('    ❌ ' + label + ': got "' + actual + '", expected "' + expected + '"');
    });
    assert('6. sanitizeUrl (16 cases)', urlOk === urlCases.length);

    assert('7. escapeAttr comprehensive',
      s.escapeAttr('a`b') === 'a&#96;b' &&
      s.escapeAttr('a=b') === 'a&#61;b' &&
      s.escapeAttr(null) === '' &&
      s.escapeAttr(undefined) === '');
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 sanitize: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else {
  log('⚠️ sanitize.js skipped');
  totalTests += 7;
}
log('');

/* ==========================================================================
   3. dom.js (8 اختبارات)
   ========================================================================== */
if (d && d.el) {
  let passed = 0;
  const total = 8;
  log('▶ dom.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    const n1 = d.el('div');
    assert('1. el creates element', n1 instanceof HTMLElement && n1.tagName === 'DIV');

    const n2 = d.el('div', { className: 'card', text: 'مرحبا' });
    assert('2. className + text', n2.className === 'card' && n2.textContent === 'مرحبا');

    const n3 = d.el('div', { text: '<script>alert(1)</script>' });
    assert('3. text is safe (no script)', n3.querySelector('script') === null);

    let clicked = 0;
    const n4 = d.el('button', { onClick: () => { clicked++; } });
    n4.click();
    assert('4. onClick fires', clicked === 1);

    const n5 = d.el('div', {}, [d.el('span', { text: 'أ' }), d.el('span', { text: 'ب' })]);
    assert('5. children array', n5.children.length === 2);

    const root = d.el('div', {}, [
      d.el('span', { className: 'x' }),
      d.el('span', { className: 'x' }),
    ]);
    assert('6. qs + qsa', d.qs('.x', root) !== null && d.qsa('.x', root).length === 2);

    let hits = 0;
    const n7 = d.el('button');
    const unsubD = d.on(n7, 'click', () => { hits++; });
    n7.click();
    unsubD();
    n7.click();
    assert('7. on unsubscribe', hits === 1);

    const n8 = d.el('div', {}, [d.el('span'), d.el('span')]);
    d.clear(n8);
    assert('8. clear removes all', n8.children.length === 0);

    d.show(n8); d.hide(n8);
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 dom: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else {
  log('⚠️ dom.js skipped');
  totalTests += 8;
}
log('');

/* ==========================================================================
   4. utils.js (10 اختبارات)
   ========================================================================== */
if (u && u.isEgyptPhone) {
  let passed = 0;
  const total = 10;
  log('▶ utils.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    assert('1. isEgyptPhone valid/invalid',
      u.isEgyptPhone('01012345678') === true &&
      u.isEgyptPhone('+201012345678') === true &&
      u.isEgyptPhone('123') === false);

    assert('2. isEmail',
      u.isEmail('a@b.co') === true &&
      u.isEmail('bad') === false &&
      u.isEmail(null) === false);

    assert('3. isValidPin',
      u.isValidPin('1234') === true &&
      u.isValidPin('12') === false &&
      u.isValidPin('abcd') === false);

    assert('4. normalizePhone',
      u.normalizePhone('01012345678') === '+201012345678' &&
      u.normalizePhone('+201012345678') === '+201012345678');

    assert('5. formatDate includes 2026',
      u.formatDate(new Date('2026-10-04')).includes('2026'));

    assert('6. formatTime non-empty',
      u.formatTime(new Date()).length > 0);

    assert('7. relativeTime Arabic plurals',
      u.relativeTime(Date.now() - 30 * 1000).includes('الآن') &&
      u.relativeTime(Date.now() - 5 * 60 * 1000).includes('دقائق') &&
      u.agoPhrase(0,  ['دقيقة', 'دقيقتين', 'دقائق']) === '' &&
      u.agoPhrase(1,  ['دقيقة', 'دقيقتين', 'دقائق']) === 'دقيقة' &&
      u.agoPhrase(2,  ['دقيقة', 'دقيقتين', 'دقائق']) === 'دقيقتين' &&
      u.agoPhrase(5,  ['دقيقة', 'دقيقتين', 'دقائق']) === '5 دقائق' &&
      u.agoPhrase(15, ['دقيقة', 'دقيقتين', 'دقائق']) === '15 دقيقة');

    assert('8. formatEGP',
      u.formatEGP(1234.5).includes('ج.م') &&
      u.formatEGP('bad').includes('0'));

    assert('9. debounce/throttle return function',
      typeof u.debounce(() => {}, 100) === 'function' &&
      typeof u.throttle(() => {}, 100) === 'function');

    assert('10. uid unique + string',
      u.uid() !== u.uid() && typeof u.uid() === 'string');
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 utils: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else {
  log('⚠️ utils.js skipped');
  totalTests += 10;
}
log('');

/* ==========================================================================
   الخلاصة
   ========================================================================== */
log('━━━━━━━━━━━━━━━━━━━━━━━━');
log('🏁 TOTAL: ' + totalPassed + '/' + totalTests + ' tests passed');

console.log('🏁 TOTAL: ' + totalPassed + '/' + totalTests + ' tests passed');
