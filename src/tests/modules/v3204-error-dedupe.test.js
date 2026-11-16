/* ==========================================================================
   v3204-error-dedupe.test.js — الخطأ الواحد لا يظهر مرتين في التشخيص (v3.20.3)
   ==========================================================================
   كشفه اختبار v3191 رقم 4 فشل مرة واحدة تحت Africa/Cairo: وقت نسخة الذاكرة ونسخة activity-log كانا يُؤخذان في لحظتين مختلفتين،
   فإن فصلتهما ميلّي ثانية ظهر الخطأ مرتين (المفتاح كان «الوقت|الرسالة»).
   ========================================================================== */
import { register } from '../registry.js';
import { report, getRecentMerged, getRecentPersisted, _internal } from '../../core/error-handler.js';
import { activity } from '../../data/repos/activity.js';

const mute = async (fn) => { const o = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = o; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

register('v3.20.3 تكرار الأخطاء في التشخيص', async (t) => {
  const tag = 'dedupe-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  const entry = await mute(() => report(new Error('shared-' + tag), {}));
  const persisted = (await getRecentPersisted(50)).find((e) => e.message === 'shared-' + tag);
  await t.test('1. وقت النسخة المحفوظة = وقت نسخة الذاكرة تماماً (لا انزياح)', !!persisted && persisted.timestamp === entry.timestamp);
  await t.test('2. الخطأ الواحد يظهر مرة في الدمج رغم وجوده في الذاكرة والسجل', (await getRecentMerged(50)).filter((e) => e.message === 'shared-' + tag).length === 1);

  /* سجل قديم وقته متباعد (كما قبل الإصلاح) */
  const T = Date.now();
  _internal.buffer.unshift({ message: 'skew-' + tag, stack: '', kind: 'manual', timestamp: T, url: '', context: {} });
  await activity.log({ type: 'error:manual', description: '[manual] skew-' + tag, timestamp: T + 7, metadata: { stack: '', url: '', context: {} } });
  await t.test('3. سجل قديم متباعد بميلّي ثوانٍ لا يتكرر (نافذة ± 2 ثانية)', (await getRecentMerged(80)).filter((e) => e.message === 'skew-' + tag).length === 1);

  /* ما يجب ألا يُدمج */
  _internal.buffer.unshift({ message: 'far-' + tag, stack: '', kind: 'manual', timestamp: T - 60000, url: '', context: {} });
  await activity.log({ type: 'error:manual', description: '[manual] far-' + tag, timestamp: T, metadata: {} });
  await t.test('4. الرسالة نفسها بعد دقيقة تُعدّ خطأً آخر (تبقى كلاهما)', (await getRecentMerged(80)).filter((e) => e.message === 'far-' + tag).length === 2);
  _internal.buffer.unshift({ message: 'kind-' + tag, stack: '', kind: 'promise', timestamp: T, url: '', context: {} });
  await activity.log({ type: 'error:manual', description: '[manual] kind-' + tag, timestamp: T, metadata: {} });
  await t.test('5. نوع مختلف بالرسالة والوقت نفسيهما يبقى (لا يُدمج)', (await getRecentMerged(80)).filter((e) => e.message === 'kind-' + tag).length === 2);
  _internal.buffer.unshift({ message: 'rep-' + tag, stack: '', kind: 'manual', timestamp: T, url: '', context: {} }, { message: 'rep-' + tag, stack: '', kind: 'manual', timestamp: T, url: '', context: {} });
  await t.test('6. تكرارات الذاكرة نفسها لا تُحذف (الإزالة بين الذاكرة والمحفوظ فقط)', (await getRecentMerged(80)).filter((e) => e.message === 'rep-' + tag).length === 2);

  await activity.log({ type: 'error:manual', description: '[manual] explicit-ts-' + tag, timestamp: 123456789, metadata: {} });
  const rows = await getRecentPersisted(200);
  await t.test('7. activity.log يقبل timestamp صريحاً وإلا يستعمل الآن', rows.some((e) => e.message === 'explicit-ts-' + tag && e.timestamp === 123456789) && (await (async () => { const a = await activity.log({ type: 'x', description: 'no-ts' }); return Math.abs(a.timestamp - Date.now()) < 5000; })()));
  await sleep(10);
});
