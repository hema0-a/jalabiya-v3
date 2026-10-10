/* ==========================================================================
   audit-3329.test.js — EventBus: اسم الحدث + المستمع العام '*' (v3.3.29)
   ========================================================================== */

import { register } from '../registry.js';
import { EventBus } from '../../core/events.js';

register('audit v3.3.29 eventbus wildcard', async (t) => {
  const bus = new EventBus();

  let got = null;
  bus.on('a', (data, name) => { got = [data, name]; });
  bus.emit('a', 5);
  await t.test('1. المستمع العادي يستلم (data, eventName)', got && got[0] === 5 && got[1] === 'a');

  const seen = [];
  bus.on('*', (data, name) => seen.push(name + ':' + data));
  bus.emit('a', 1);
  bus.emit('b', 2);
  await t.test('2. المستمع العام * يستلم كل الأحداث باسمها (حتى بلا مستمع خاص)', seen.join(',') === 'a:1,b:2');

  seen.length = 0;
  bus.emit('*', 9);
  await t.test('3. بثّ * نفسه لا يُكرَّر', seen.length === 1);

  let once = [];
  const bus2 = new EventBus();
  bus2.once('x', (d, n) => once.push(n));
  bus2.emit('x', 1); bus2.emit('x', 1);
  await t.test('4. once يمرّر اسم الحدث ويعمل مرة واحدة', once.length === 1 && once[0] === 'x');

  const bus3 = new EventBus();
  let after = 0;
  bus3.on('*', () => { throw new Error('boom'); });
  bus3.on('*', () => { after++; });
  const origErr = console.error; console.error = () => {};
  let thrown = false;
  try { bus3.emit('z'); } catch { thrown = true; }
  console.error = origErr;
  await t.test('5. خطأ في مستمع * لا يوقف غيره ولا يُرمى', !thrown && after === 1);
});
