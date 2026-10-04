/* ==========================================================================
   core.test.js — اختبارات الطبقة الأساسية
   ==========================================================================
   32 اختباراً: events(7) + sanitize(7) + dom(8) + utils(10)
   ========================================================================== */

import { register } from '../registry.js';
import { events } from '../../core/events.js';
import { escapeHtml, escapeAttr, sanitizeUrl } from '../../core/sanitize.js';
import { el, qs, qsa, on, clear, show, hide } from '../../core/dom.js';
import {
  isEgyptPhone, isEmail, isValidPin, normalizePhone,
  formatDate, formatTime, relativeTime, formatEGP, agoPhrase,
  debounce, throttle, uid,
} from '../../core/utils.js';

/* ===== events.js (7) ===== */
register('events.js', async (t) => {
  let r1 = 0;
  events.on('t1', () => { r1++; });
  events.emit('t1');
  await t.test('1. on + emit', r1 === 1);

  let r2a = 0, r2b = 0;
  events.on('t2', () => { r2a++; });
  events.on('t2', () => { r2b++; });
  events.emit('t2');
  await t.test('2. multiple listeners', r2a === 1 && r2b === 1);

  let r3 = 0;
  const h3a = () => { r3++; };
  const h3b = () => { r3++; events.off('t3', h3a); };
  events.on('t3', h3a);
  events.on('t3', h3b);
  let err3 = false;
  try { events.emit('t3'); } catch { err3 = true; }
  await t.test('3. off during emit', !err3 && r3 === 2);

  let r4 = 0;
  events.once('t4', () => { r4++; });
  events.emit('t4');
  events.emit('t4');
  await t.test('4. once fires once', r4 === 1);

  let r5 = true;
  try { events.emit('t5-no-listeners'); } catch { r5 = false; }
  await t.test('5. emit without listeners', r5);

  events.on('t6a', () => {});
  events.on('t6b', () => {});
  events.clear();
  await t.test('6. clear all', events.count() === 0);

  let r7 = 0;
  const unsub7 = events.on('t7', () => { r7++; });
  unsub7();
  events.emit('t7');
  await t.test('7. unsubscribe function', r7 === 0);
});

/* ===== sanitize.js (7) ===== */
register('sanitize.js', async (t) => {
  await t.test('1. escapeHtml <script>',   escapeHtml('<script>') === '&lt;script&gt;');
  await t.test('2. escapeHtml "quoted"',   escapeHtml('"quoted"') === '&quot;quoted&quot;');
  await t.test("3. escapeHtml O'Brien",    escapeHtml("O'Brien") === 'O&#39;Brien');
  await t.test('4. escapeHtml null/undef', escapeHtml(null) === '' && escapeHtml(undefined) === '');
  await t.test('5. escapeHtml 123',        escapeHtml(123) === '123');

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
    const actual = sanitizeUrl(input);
    if (actual === expected) urlOk++;
    else t.log('    ❌ ' + label + ': got "' + actual + '", expected "' + expected + '"');
  });
  await t.test('6. sanitizeUrl (16 cases)', urlOk === urlCases.length);

  await t.test('7. escapeAttr comprehensive',
    escapeAttr('a`b') === 'a&#96;b' &&
    escapeAttr('a=b') === 'a&#61;b' &&
    escapeAttr(null) === '' &&
    escapeAttr(undefined) === '');
});

/* ===== dom.js (8) ===== */
register('dom.js', async (t) => {
  const n1 = el('div');
  await t.test('1. el creates element', n1 instanceof HTMLElement && n1.tagName === 'DIV');

  const n2 = el('div', { className: 'card', text: 'مرحبا' });
  await t.test('2. className + text', n2.className === 'card' && n2.textContent === 'مرحبا');

  const n3 = el('div', { text: '<script>alert(1)</script>' });
  await t.test('3. text is safe (no script)', n3.querySelector('script') === null);

  let clicked = 0;
  const n4 = el('button', { onClick: () => { clicked++; } });
  n4.click();
  await t.test('4. onClick fires', clicked === 1);

  const n5 = el('div', {}, [el('span', { text: 'أ' }), el('span', { text: 'ب' })]);
  await t.test('5. children array', n5.children.length === 2);

  const root = el('div', {}, [
    el('span', { className: 'x' }),
    el('span', { className: 'x' }),
  ]);
  await t.test('6. qs + qsa', qs('.x', root) !== null && qsa('.x', root).length === 2);

  let hits = 0;
  const n7 = el('button');
  const unsubD = on(n7, 'click', () => { hits++; });
  n7.click();
  unsubD();
  n7.click();
  await t.test('7. on unsubscribe', hits === 1);

  const n8 = el('div', {}, [el('span'), el('span')]);
  clear(n8);
  await t.test('8. clear removes all', n8.children.length === 0);

  show(n8); hide(n8);
});

/* ===== utils.js (10) ===== */
register('utils.js', async (t) => {
  await t.test('1. isEgyptPhone valid/invalid',
    isEgyptPhone('01012345678') === true &&
    isEgyptPhone('+201012345678') === true &&
    isEgyptPhone('123') === false);

  await t.test('2. isEmail',
    isEmail('a@b.co') === true &&
    isEmail('bad') === false &&
    isEmail(null) === false);

  await t.test('3. isValidPin',
    isValidPin('1234') === true &&
    isValidPin('12') === false &&
    isValidPin('abcd') === false);

  await t.test('4. normalizePhone',
    normalizePhone('01012345678') === '+201012345678' &&
    normalizePhone('+201012345678') === '+201012345678');

  await t.test('5. formatDate includes 2026',
    formatDate(new Date('2026-10-04')).includes('2026'));

  await t.test('6. formatTime non-empty',
    formatTime(new Date()).length > 0);

  await t.test('7. relativeTime Arabic plurals',
    relativeTime(Date.now() - 30 * 1000).includes('الآن') &&
    relativeTime(Date.now() - 5 * 60 * 1000).includes('دقائق') &&
    agoPhrase(0,  ['دقيقة', 'دقيقتين', 'دقائق']) === '' &&
    agoPhrase(1,  ['دقيقة', 'دقيقتين', 'دقائق']) === 'دقيقة' &&
    agoPhrase(2,  ['دقيقة', 'دقيقتين', 'دقائق']) === 'دقيقتين' &&
    agoPhrase(5,  ['دقيقة', 'دقيقتين', 'دقائق']) === '5 دقائق' &&
    agoPhrase(15, ['دقيقة', 'دقيقتين', 'دقائق']) === '15 دقيقة');

  await t.test('8. formatEGP',
    formatEGP(1234.5).includes('ج.م') &&
    formatEGP('bad').includes('0'));

  await t.test('9. debounce/throttle return function',
    typeof debounce(() => {}, 100) === 'function' &&
    typeof throttle(() => {}, 100) === 'function');

  await t.test('10. uid unique + string',
    uid() !== uid() && typeof uid() === 'string');
});
