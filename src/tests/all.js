/* ==========================================================================
   all.js — جميع اختبارات المشروع
   ==========================================================================
   94 اختباراً: events(7)+sanitize(7)+dom(8)+utils(10)+schema(6)
              +idb(8)+repository(8)+customers(8)+orders(6)+payments(5)
              +inventory(5)+workers(4)+settings(6)+appointments(6)
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
  pre.textContent = output.join('\n');
};
const log = (msg) => { output.push(msg); render(); };

log('🚀 main.js running');
log('');

let c, ev, s, d, u, sc, idb, repo, cust, ord, pay, inv, wrk, stg, apt;
try { c    = await import('../core/config.js');              log('✅ config.js'); }
catch (e) { log('❌ config.js: ' + e.message); }

try { ev   = await import('../core/events.js');              log('✅ events.js'); }
catch (e) { log('❌ events.js: ' + e.message); }

try { s    = await import('../core/sanitize.js');            log('✅ sanitize.js'); }
catch (e) { log('❌ sanitize.js: ' + e.message); }

try { d    = await import('../core/dom.js');                 log('✅ dom.js'); }
catch (e) { log('❌ dom.js: ' + e.message); }

try { u    = await import('../core/utils.js');               log('✅ utils.js'); }
catch (e) { log('❌ utils.js: ' + e.message); }

try { sc   = await import('../data/schema.js');              log('✅ schema.js'); }
catch (e) { log('❌ schema.js: ' + e.message); }

try { idb  = await import('../data/idb.js');                 log('✅ idb.js'); }
catch (e) { log('❌ idb.js: ' + e.message); }

try { repo = await import('../data/repository.js');          log('✅ repository.js'); }
catch (e) { log('❌ repository.js: ' + e.message); }

try { cust = await import('../data/repos/customers.js');     log('✅ repos/customers.js'); }
catch (e) { log('❌ repos/customers.js: ' + e.message); }

try { ord  = await import('../data/repos/orders.js');        log('✅ repos/orders.js'); }
catch (e) { log('❌ repos/orders.js: ' + e.message); }

try { pay  = await import('../data/repos/payments.js');      log('✅ repos/payments.js'); }
catch (e) { log('❌ repos/payments.js: ' + e.message); }

try { inv  = await import('../data/repos/inventory.js');     log('✅ repos/inventory.js'); }
catch (e) { log('❌ repos/inventory.js: ' + e.message); }

try { wrk  = await import('../data/repos/workers.js');       log('✅ repos/workers.js'); }
catch (e) { log('❌ repos/workers.js: ' + e.message); }

try { stg  = await import('../data/repos/settings.js');      log('✅ repos/settings.js'); }
catch (e) { log('❌ repos/settings.js: ' + e.message); }

try { apt  = await import('../data/repos/appointments.js');  log('✅ repos/appointments.js'); }
catch (e) { log('❌ repos/appointments.js: ' + e.message); }

log('');
let totalPassed = 0;
let totalTests = 0;

/* ===== 1. events.js (7) ===== */
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
} else { log('⚠️ events.js skipped'); totalTests += 7; }
log('');

/* ===== 2. sanitize.js (7) ===== */
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
} else { log('⚠️ sanitize.js skipped'); totalTests += 7; }
log('');

/* ===== 3. dom.js (8) ===== */
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
} else { log('⚠️ dom.js skipped'); totalTests += 8; }
log('');

/* ===== 4. utils.js (10) ===== */
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
} else { log('⚠️ utils.js skipped'); totalTests += 10; }
log('');

/* ===== 5. schema.js (6) ===== */
if (sc && sc.SCHEMA) {
  let passed = 0;
  const total = 6;
  log('▶ schema.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    const schemaKeys = Object.keys(sc.SCHEMA);
    assert('1. SCHEMA has 10 stores', schemaKeys.length === 10);

    let validOk = true;
    try { sc.validateSchema(); }
    catch (e) { validOk = false; log('    err: ' + e.message); }
    assert('2. validateSchema passes', validOk);

    let keyPathsOk = true;
    Object.values(sc.SCHEMA).forEach((store) => {
      if (store.keyPath !== 'id' || store.autoIncrement !== false) {
        keyPathsOk = false;
      }
    });
    assert('3. keyPath=id + autoIncrement=false', keyPathsOk);

    let indexesOk = true;
    Object.values(sc.SCHEMA).forEach((store) => {
      if (!Array.isArray(store.indexes)) { indexesOk = false; return; }
      store.indexes.forEach((i) => {
        if (!i.name || !i.keyPath || typeof i.unique !== 'boolean') {
          indexesOk = false;
        }
      });
    });
    assert('4. indexes have valid shape', indexesOk);

    let noDup = true;
    Object.values(sc.SCHEMA).forEach((store) => {
      const names = store.indexes.map((i) => i.name);
      if (new Set(names).size !== names.length) noDup = false;
    });
    assert('5. no duplicate index names', noDup);

    const idsOk = sc.SETTINGS_ID === 'main';
    const namesOk = Array.isArray(sc.STORE_NAMES) && sc.STORE_NAMES.length === 10;
    assert('6. SETTINGS_ID + STORE_NAMES correct', idsOk && namesOk);
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 schema: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ schema.js skipped'); totalTests += 6; }
log('');

/* ===== 6. idb.js (8) ===== */
if (idb && idb.openDB) {
  let passed = 0;
  const total = 8;
  log('▶ idb.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await idb.clear('customers').catch(() => {});
    const db = await idb.openDB();
    assert('1. openDB returns DB', db && typeof db.name === 'string');

    await idb.put('customers', { id: 'test-1', name: 'أحمد', phone: '01012345678' });
    const got = await idb.get('customers', 'test-1');
    assert('2. put + get round-trip', got && got.name === 'أحمد');

    const all = await idb.getAll('customers');
    assert('3. getAll returns array', Array.isArray(all) && all.length === 1);

    const cnt = await idb.count('customers');
    assert('4. count === 1', cnt === 1);

    await idb.put('customers', { id: 'test-2', name: 'محمد', phone: '01111111111' });
    const byPhone = await idb.getByIndex('customers', 'by_phone', '01111111111');
    assert('5. getByIndex finds by phone',
      Array.isArray(byPhone) && byPhone.length === 1 && byPhone[0].name === 'محمد');

    await idb.remove('customers', 'test-1');
    const afterRemove = await idb.get('customers', 'test-1');
    assert('6. remove deletes record', afterRemove === undefined);

    await idb.clear('customers');
    const afterClear = await idb.count('customers');
    assert('7. clear empties store', afterClear === 0);

    const nothing = await idb.get('customers', 'no-such-id');
    assert('8. get missing → undefined', nothing === undefined);
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 idb: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ idb.js skipped'); totalTests += 8; }
log('');

/* ===== 7. repository.js (8) ===== */
if (repo && repo.createRepository) {
  let passed = 0;
  const total = 8;
  log('▶ repository.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    const r = repo.createRepository('customers');
    await r.clear();

    const r1 = await r.create({ name: 'أحمد', phone: '01012345678' });
    assert('1. create returns record with id',
      r1 && typeof r1.id === 'string' && r1.id.length > 0);

    assert('2. create sets timestamps',
      typeof r1.createdAt === 'number' && typeof r1.updatedAt === 'number');

    const r2 = await r.create({ name: 'محمد' });
    assert('3. unique ids', r1.id !== r2.id);

    const found = await r.find(r1.id);
    assert('4. find returns created', found && found.name === 'أحمد');

    const all = await r.list();
    assert('5. list returns all', Array.isArray(all) && all.length === 2);

    const beforeUpdatedAt = r1.updatedAt;
    await new Promise((res) => setTimeout(res, 10));
    const updated = await r.update(r1.id, { name: 'أحمد علي' });
    assert('6. update merges + bumps updatedAt',
      updated && updated.name === 'أحمد علي' && updated.updatedAt > beforeUpdatedAt);

    const nullUpdate = await r.update('no-such-id', { name: 'x' });
    assert('7. update non-existent → null', nullUpdate === null);

    await r.remove(r1.id);
    const afterRemove = await r.find(r1.id);
    assert('8. remove works', afterRemove === undefined);

    await r.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 repository: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ repository.js skipped'); totalTests += 8; }
log('');

/* ===== 8. customers.js (8) ===== */
if (cust && cust.customers) {
  const c8 = cust.customers;
  let passed = 0;
  const total = 8;
  log('▶ customers.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await c8.clear();

    const a = await c8.create({ name: 'أحمد', phone: '01012345678', vip: false });
    const b = await c8.create({ name: 'محمد', phone: '01111111111', vip: true });
    const c2 = await c8.create({ name: 'علي', phone: '01222222222' });

    const byPhone = await c8.findByPhone('01012345678');
    assert('1. findByPhone returns match', byPhone && byPhone.id === a.id);

    const missing = await c8.findByPhone('9999999999');
    assert('2. findByPhone missing → null', missing === null);

    const searchA = await c8.searchByName('أحمد');
    assert('3. searchByName substring', searchA.length === 1 && searchA[0].id === a.id);

    const searchEmpty = await c8.searchByName('');
    assert('4. searchByName empty → all', searchEmpty.length === 3);

    const searchCase = await c8.searchByName('محمد');
    assert('5. searchByName arabic match', searchCase.length === 1 && searchCase[0].id === b.id);

    const vips = await c8.listVIP();
    assert('6. listVIP returns VIPs only', vips.length === 1 && vips[0].id === b.id);

    const toggled = await c8.toggleVIP(c2.id);
    assert('7. toggleVIP flips false → true', toggled && toggled.vip === true);

    const missingToggle = await c8.toggleVIP('no-such-id');
    assert('8. toggleVIP missing → null', missingToggle === null);

    await c8.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 customers: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ customers.js skipped'); totalTests += 8; }
log('');

/* ===== 9. orders.js (6) ===== */
if (ord && ord.orders) {
  const o9 = ord.orders;
  let passed = 0;
  const total = 6;
  log('▶ orders.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await o9.clear();

    const o1 = await o9.create({
      customerId: 'c1',
      status: 'pending',
      dueDate: Date.now() + 86400000,
      amount: 500,
    });
    await o9.create({
      customerId: 'c1',
      status: 'in_progress',
      dueDate: Date.now() + 172800000,
      amount: 700,
    });
    await o9.create({
      customerId: 'c2',
      status: 'delivered',
      amount: 300,
    });

    const byCust = await o9.findByCustomer('c1');
    assert('1. findByCustomer returns 2', byCust.length === 2);

    const byStatus = await o9.listByStatus('pending');
    assert('2. listByStatus pending', byStatus.length === 1 && byStatus[0].id === o1.id);

    const active = await o9.getActive();
    assert('3. getActive excludes delivered', active.length === 2);

    const dueSoon = await o9.getDueSoon(3);
    assert('4. getDueSoon finds upcoming', dueSoon.length === 2);

    const stats = await o9.getStats();
    assert('5. getStats counts',
      stats.total === 3 &&
      stats.pending === 1 &&
      stats.inProgress === 1 &&
      stats.delivered === 1);

    await o9.remove(o1.id);
    const after = await o9.find(o1.id);
    assert('6. remove works', after === undefined);

    await o9.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 orders: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ orders.js skipped'); totalTests += 6; }
log('');

/* ===== 10. payments.js (5) ===== */
if (pay && pay.payments) {
  const p10 = pay.payments;
  let passed = 0;
  const total = 5;
  log('▶ payments.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await p10.clear();

    await p10.create({ orderId: 'o1', customerId: 'c1', amount: 200 });
    await p10.create({ orderId: 'o1', customerId: 'c1', amount: 300 });
    await p10.create({ orderId: 'o2', customerId: 'c2', amount: 150 });

    const byOrder = await p10.findByOrder('o1');
    assert('1. findByOrder returns 2', byOrder.length === 2);

    const byCust = await p10.findByCustomer('c1');
    assert('2. findByCustomer returns 2', byCust.length === 2);

    const sumOrder = await p10.sumByOrder('o1');
    assert('3. sumByOrder = 500', sumOrder === 500);

    const sumCust = await p10.sumByCustomer('c1');
    assert('4. sumByCustomer = 500', sumCust === 500);

    const sumEmpty = await p10.sumByOrder('no-such');
    assert('5. sumByOrder missing = 0', sumEmpty === 0);

    await p10.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 payments: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ payments.js skipped'); totalTests += 5; }
log('');

/* ===== 11. inventory.js (5) ===== */
if (inv && inv.inventory) {
  const i11 = inv.inventory;
  let passed = 0;
  const total = 5;
  log('▶ inventory.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await i11.clear();

    const a = await i11.create({ name: 'قماش كتان', category: 'fabric', quantity: 3 });
    await i11.create({ name: 'خيط', category: 'thread', quantity: 20 });
    await i11.create({ name: 'أزرار', category: 'accessory', quantity: 2 });

    const search = await i11.searchByName('قماش');
    assert('1. searchByName', search.length === 1 && search[0].id === a.id);

    const byCat = await i11.listByCategory('thread');
    assert('2. listByCategory', byCat.length === 1);

    const low = await i11.getLowStock(5);
    assert('3. getLowStock < 5 → 2 items', low.length === 2);

    const adjusted = await i11.adjustStock(a.id, 10);
    assert('4. adjustStock +10 = 13', adjusted && adjusted.quantity === 13);

    const floor = await i11.adjustStock(a.id, -100);
    assert('5. adjustStock clamps to 0', floor && floor.quantity === 0);

    await i11.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 inventory: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ inventory.js skipped'); totalTests += 5; }
log('');

/* ===== 12. workers.js (4) ===== */
if (wrk && wrk.workers) {
  const w12 = wrk.workers;
  let passed = 0;
  const total = 4;
  log('▶ workers.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await w12.clear();

    const a = await w12.create({ name: 'سيد', active: true });
    const b = await w12.create({ name: 'رمضان', active: false });
    await w12.create({ name: 'عبد الله' });

    const search = await w12.searchByName('سيد');
    assert('1. searchByName', search.length === 1 && search[0].id === a.id);

    const active = await w12.listActive();
    assert('2. listActive → 2 (سيد + عبد الله)', active.length === 2);

    const toggled = await w12.toggleActive(b.id);
    assert('3. toggleActive false → true', toggled && toggled.active === true);

    const missing = await w12.toggleActive('no-such-id');
    assert('4. toggleActive missing → null', missing === null);

    await w12.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 workers: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ workers.js skipped'); totalTests += 4; }
log('');

/* ===== 13. settings.js (6) ===== */
if (stg && stg.settings) {
  const s13 = stg.settings;
  let passed = 0;
  const total = 6;
  log('▶ settings.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await s13.clear();

    const defaults = await s13.get();
    assert('1. get returns defaults when empty',
      defaults && defaults.appearance && defaults.appearance.theme === 'classic');

    const saved = await s13.save({
      workshop: { name: 'ورشة الأمل', phone: '01012345678' },
      appearance: { theme: 'ocean' },
    });
    assert('2. save returns record + id=main',
      saved && saved.id === 'main' && typeof saved.updatedAt === 'number');

    const after = await s13.get();
    assert('3. get after save reflects data',
      after.workshop.name === 'ورشة الأمل' && after.appearance.theme === 'ocean');

    assert('4. get merges missing keys with defaults',
      after.workshop.address === '' && after.display.darkMode === false);

    const updated = await s13.update({ workshop: { name: 'ورشة النور' } });
    assert('5. update shallow-merges workshop',
      updated.workshop.name === 'ورشة النور' && updated.workshop.phone === '01012345678');

    await s13.clear();
    const reset = await s13.get();
    assert('6. clear resets to defaults',
      reset.workshop.name === '' && reset.appearance.theme === 'classic');
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 settings: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ settings.js skipped'); totalTests += 6; }
log('');

/* ===== 14. appointments.js (6) ===== */
if (apt && apt.appointments) {
  const a14 = apt.appointments;
  let passed = 0;
  const total = 6;
  log('▶ appointments.js tests');
  const assert = (label, cond) => {
    if (cond) { log('  ✅ ' + label); passed++; }
    else      { log('  ❌ ' + label); }
  };
  try {
    await a14.clear();

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(12, 0, 0, 0);

    const a1 = await a14.create({
      customerId: 'c1',
      orderId: 'o1',
      date: now + 86400000,
      status: 'scheduled',
    });
    await a14.create({
      customerId: 'c1',
      orderId: 'o2',
      date: now + 3 * 86400000,
      status: 'scheduled',
    });
    await a14.create({
      customerId: 'c2',
      orderId: 'o3',
      date: now - 86400000,
      status: 'done',
    });

    const byCust = await a14.findByCustomer('c1');
    assert('1. findByCustomer returns 2', byCust.length === 2);

    const byOrd = await a14.findByOrder('o1');
    assert('2. findByOrder returns 1', byOrd.length === 1 && byOrd[0].id === a1.id);

    const scheduled = await a14.listByStatus('scheduled');
    assert('3. listByStatus scheduled → 2', scheduled.length === 2);

    const upcoming = await a14.getUpcoming(7);
    assert('4. getUpcoming excludes past', upcoming.length === 2);

    const today = await a14.getToday();
    assert('5. getToday returns array (0+ items)', Array.isArray(today));

    await a14.remove(a1.id);
    const after = await a14.find(a1.id);
    assert('6. remove works', after === undefined);

    await a14.clear();
  } catch (e) { log('  ❌ group failed: ' + e.message); }
  log('📊 appointments: ' + passed + '/' + total);
  totalPassed += passed; totalTests += total;
} else { log('⚠️ appointments.js skipped'); totalTests += 6; }
log('');

/* ===== الخلاصة ===== */
log('━━━━━━━━━━━━━━━━━━━━━━━━');
log('🏁 TOTAL: ' + totalPassed + '/' + totalTests + ' tests passed');
console.log('🏁 TOTAL: ' + totalPassed + '/' + totalTests + ' tests passed');
