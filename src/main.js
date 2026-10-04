/* ==========================================================================
   main.js — STUB مؤقت لاختبار config + events + sanitize + dom + utils
   ==========================================================================
   ⚠️ هذا ملف مؤقت سيُستبدل بالكامل في الخطوة 1-6.
   ========================================================================== */

import { APP_CONFIG, STORES, LIMITS, SYNC_CONFIG } from './core/config.js';
import { events } from './core/events.js';
import { escapeHtml, escapeAttr, sanitizeUrl } from './core/sanitize.js';
import { el, qs, qsa, on, clear, show, hide } from './core/dom.js';
import {
  isEgyptPhone, isEmail, isValidPin, normalizePhone,
  formatDate, formatTime, relativeTime, formatEGP, agoPhrase,
  debounce, throttle, uid,
} from './core/utils.js';

/* --- 1. اختبار config.js --- */
console.log('✅ config.js loaded');
console.log('📱 App:', APP_CONFIG.name, '— v' + APP_CONFIG.version);
console.log('📦 Stores:', Object.keys(STORES).length);
console.log('🔒 Limits:', Object.keys(LIMITS).length);
console.log('🔄 Sync config:', Object.keys(SYNC_CONFIG).length);

let totalPassed = 0;
let totalTests = 0;

/* أداة مساعدة لتشغيل مصفوفة اختبارات URL */
const runUrlCases = (cases) => {
  let ok = 0;
  cases.forEach(([input, expected, label]) => {
    const actual = sanitizeUrl(input);
    if (actual === expected) { ok++; }
    else {
      console.error(`  ❌ ${label || input}: got "${actual}", expected "${expected}"`);
    }
  });
  return ok;
};

/* --- 2. اختبار events.js (7) --- */
let passedEvents = 0;
const totalEvents = 7;
console.group('🧪 events.js tests');
const assertE = (label, cond) => {
  if (cond) { console.log('  ✅', label); passedEvents++; }
  else      { console.error('  ❌', label); }
};

let r1 = 0;
events.on('t1', () => { r1++; });
events.emit('t1');
assertE('1. on + emit', r1 === 1);

let r2a = 0, r2b = 0;
events.on('t2', () => { r2a++; });
events.on('t2', () => { r2b++; });
events.emit('t2');
assertE('2. multiple listeners', r2a === 1 && r2b === 1);

let r3 = 0;
const h3a = () => { r3++; };
const h3b = () => { r3++; events.off('t3', h3a); };
events.on('t3', h3a);
events.on('t3', h3b);
let err3 = false;
try { events.emit('t3'); } catch { err3 = true; }
assertE('3. off during emit', !err3 && r3 === 2);

let r4 = 0;
events.once('t4', () => { r4++; });
events.emit('t4');
events.emit('t4');
assertE('4. once fires once', r4 === 1);

let r5 = true;
try { events.emit('t5-no-listeners'); } catch { r5 = false; }
assertE('5. emit without listeners', r5);

events.on('t6a', () => {});
events.on('t6b', () => {});
events.clear();
assertE('6. clear all', events.count() === 0);

let r7 = 0;
const unsub7 = events.on('t7', () => { r7++; });
unsub7();
events.emit('t7');
assertE('7. unsubscribe function', r7 === 0);
console.groupEnd();
console.log(`📊 events: ${passedEvents}/${totalEvents}`);
totalPassed += passedEvents; totalTests += totalEvents;

/* --- 3. اختبار sanitize.js (7) --- */
let passedSan = 0;
const totalSan = 7;
console.group('🧪 sanitize.js tests');
const assertS = (label, cond) => {
  if (cond) { console.log('  ✅', label); passedSan++; }
  else      { console.error('  ❌', label); }
};

assertS('1. escapeHtml <script>',   escapeHtml('<script>') === '&lt;script&gt;');
assertS('2. escapeHtml "quoted"',   escapeHtml('"quoted"') === '&quot;quoted&quot;');
assertS("3. escapeHtml O'Brien",    escapeHtml("O'Brien") === 'O&#39;Brien');
assertS('4. escapeHtml null/undef', escapeHtml(null) === '' && escapeHtml(undefined) === '');
assertS('5. escapeHtml 123',        escapeHtml(123) === '123');

/* 16 حالة لـ sanitizeUrl */
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
const passedUrl = runUrlCases(urlCases);
assertS('6. sanitizeUrl comprehensive (16 cases)', passedUrl === urlCases.length);

/* 7. escapeAttr — backtick + equals + null/undefined */
assertS('7. escapeAttr comprehensive',
  escapeAttr('a`b') === 'a&#96;b' &&
  escapeAttr('a=b') === 'a&#61;b' &&
  escapeAttr(null) === '' &&
  escapeAttr(undefined) === '');

console.groupEnd();
console.log(`📊 sanitize: ${passedSan}/${totalSan}`);
totalPassed += passedSan; totalTests += totalSan;

/* --- 4. اختبار dom.js (8) --- */
let passedDom = 0;
const totalDom = 8;
console.group('🧪 dom.js tests');
const assertD = (label, cond) => {
  if (cond) { console.log('  ✅', label); passedDom++; }
  else      { console.error('  ❌', label); }
};

const n1 = el('div');
assertD('1. el creates element', n1 instanceof HTMLElement && n1.tagName === 'DIV');

const n2 = el('div', { className: 'card', text: 'مرحبا' });
assertD('2. className + text', n2.className === 'card' && n2.textContent === 'مرحبا');

const n3 = el('div', { text: '<script>alert(1)</script>' });
assertD('3. text is safe (no script)', n3.querySelector('script') === null);

let clicked = 0;
const n4 = el('button', { onClick: () => { clicked++; } });
n4.click();
assertD('4. onClick fires', clicked === 1);

const n5 = el('div', {}, [el('span', { text: 'أ' }), el('span', { text: 'ب' })]);
assertD('5. children array', n5.children.length === 2);

const root = el('div', {}, [
  el('span', { className: 'x' }),
  el('span', { className: 'x' }),
]);
assertD('6. qs + qsa', qs('.x', root) !== null && qsa('.x', root).length === 2);

let hits = 0;
const n7 = el('button');
const unsubD = on(n7, 'click', () => { hits++; });
n7.click();
unsubD();
n7.click();
assertD('7. on unsubscribe', hits === 1);

const n8 = el('div', {}, [el('span'), el('span')]);
clear(n8);
assertD('8. clear removes all', n8.children.length === 0);

/* استخدام show/hide لتجنب unused imports */
show(n8); hide(n8);

console.groupEnd();
console.log(`📊 dom: ${passedDom}/${totalDom}`);
totalPassed += passedDom; totalTests += totalDom;

/* --- 5. اختبار utils.js (10) --- */
let passedUtils = 0;
const totalUtils = 10;
console.group('🧪 utils.js tests');
const assertU = (label, cond) => {
  if (cond) { console.log('  ✅', label); passedUtils++; }
  else      { console.error('  ❌', label); }
};

assertU('1. isEgyptPhone valid/invalid',
  isEgyptPhone('01012345678') === true &&
  isEgyptPhone('+201012345678') === true &&
  isEgyptPhone('123') === false);

assertU('2. isEmail',
  isEmail('a@b.co') === true &&
  isEmail('bad') === false &&
  isEmail(null) === false);

assertU('3. isValidPin',
  isValidPin('1234') === true &&
  isValidPin('12') === false &&
  isValidPin('abcd') === false);

assertU('4. normalizePhone',
  normalizePhone('01012345678') === '+201012345678' &&
  normalizePhone('+201012345678') === '+201012345678');

assertU('5. formatDate includes 2026',
  formatDate(new Date('2026-10-04')).includes('2026'));

assertU('6. formatTime non-empty',
  formatTime(new Date()).length > 0);

/* 7. relativeTime + agoPhrase (قواعد عربية) */
assertU('7. relativeTime Arabic plurals',
  relativeTime(Date.now() - 30 * 1000).includes('الآن') &&
  relativeTime(Date.now() - 5 * 60 * 1000).includes('دقائق') &&
  agoPhrase(0,  ['دقيقة', 'دقيقتين', 'دقائق']) === '' &&
  agoPhrase(1,  ['دقيقة', 'دقيقتين', 'دقائق']) === 'دقيقة' &&
  agoPhrase(2,  ['دقيقة', 'دقيقتين', 'دقائق']) === 'دقيقتين' &&
  agoPhrase(5,  ['دقيقة', 'دقيقتين', 'دقائق']) === '5 دقائق' &&
  agoPhrase(15, ['دقيقة', 'دقيقتين', 'دقائق']) === '15 دقيقة');

assertU('8. formatEGP',
  formatEGP(1234.5).includes('ج.م') &&
  formatEGP('bad').includes('0'));

assertU('9. debounce returns function',
  typeof debounce(() => {}, 100) === 'function' &&
  typeof throttle(() => {}, 100) === 'function');

assertU('10. uid unique + string',
  uid() !== uid() && typeof uid() === 'string');

console.groupEnd();
console.log(`📊 utils: ${passedUtils}/${totalUtils}`);
totalPassed += passedUtils; totalTests += totalUtils;

/* --- 6. الخلاصة --- */
console.log(`\n🏁 TOTAL: ${totalPassed}/${totalTests} tests passed`);

const loading = document.getElementById('app-loading');
const app = document.getElementById('app');
if (loading) loading.hidden = true;
if (app) {
  app.hidden = false;
  app.textContent = `✅ 5 modules loaded — ${totalPassed}/${totalTests} tests passed`;
}
