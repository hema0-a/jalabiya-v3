/* ==========================================================================
   v3526-split-settings-system.test.js — تقسيم settings/sections-system.js (v3.5.26، بلا تغيير سلوك)
   ==========================================================================
   يتحقق أن: SYSTEM_SECTIONS بالترتيب والمعرّفات نفسها، وكل ملف قسم يصدّر قسمه فقط، وكل قسم يُرسم دون استثناء،
   ولا استيراد دائري ولا import() ولا innerHTML، ولا ملف منها يتجاوز 450 سطراً.
   ========================================================================== */
import { register } from '../registry.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import * as sysMod from '../../pages/settings/sections-system.js';
import * as notif from '../../pages/settings/section-notifications.js';
import * as occ from '../../pages/settings/section-occasions.js';
import * as msgs from '../../pages/settings/section-auto-messages.js';
import * as bkp from '../../pages/settings/section-backup.js';
import * as cloud from '../../pages/settings/section-cloud-sync.js';
import * as img from '../../pages/settings/section-image-compression.js';
import * as demo from '../../pages/settings/section-demo-data.js';
import * as sup from '../../pages/settings/section-support.js';

const FILES = ['section-notifications', 'section-occasions', 'section-auto-messages', 'section-backup',
  'section-cloud-sync', 'section-image-compression', 'section-demo-data', 'section-support'];

register('v3.5.26 settings/sections-system — تقسيم الملفات', async (t) => {
  await t.test('1. sections-system.js يصدّر SYSTEM_SECTIONS فقط', Object.keys(sysMod).join() === 'SYSTEM_SECTIONS');
  await t.test('2. الأقسام الثمانية بالترتيب والمعرّفات القديمة نفسها',
    SYSTEM_SECTIONS.map((s) => s.id).join() === 'notifications,occasions,auto-messages,backup,cloud-sync,image-compression,demo-data,support');
  await t.test('3. كل ملف يصدّر قسمه فقط وهو نفس العنصر في SYSTEM_SECTIONS',
    notif.notificationsSection === SYSTEM_SECTIONS[0] && Object.keys(notif).join() === 'notificationsSection' &&
    occ.occasionsSection === SYSTEM_SECTIONS[1] && Object.keys(occ).join() === 'occasionsSection' &&
    msgs.autoMessagesSection === SYSTEM_SECTIONS[2] && Object.keys(msgs).join() === 'autoMessagesSection' &&
    bkp.backupSection === SYSTEM_SECTIONS[3] && Object.keys(bkp).join() === 'backupSection' &&
    cloud.cloudSyncSection === SYSTEM_SECTIONS[4] && Object.keys(cloud).join() === 'cloudSyncSection' &&
    img.imageCompressionSection === SYSTEM_SECTIONS[5] && Object.keys(img).join() === 'imageCompressionSection' &&
    demo.demoDataSection === SYSTEM_SECTIONS[6] && Object.keys(demo).join() === 'demoDataSection' &&
    sup.supportSection === SYSTEM_SECTIONS[7] && Object.keys(sup).join() === 'supportSection');
  await t.test('4. لكل قسم أيقونة وعنوان ودالة render', SYSTEM_SECTIONS.every((s) => s.icon && s.title && typeof s.render === 'function'));

  let n = 0;
  for (const sec of SYSTEM_SECTIONS) {
    const body = document.createElement('div');
    document.body.appendChild(body);
    try {
      await sec.render(body, {}, async () => {});
      if (body.children.length > 0) n += 1;
    } catch (e) { t.log('  ✗ ' + sec.id + ': ' + e.message); } finally { body.remove(); }
  }
  await t.test('5. كل الأقسام الثمانية تُرسم بإعدادات فارغة دون استثناء وتعرض محتوى', n === 8);

  const texts = await Promise.all(FILES.map(async (f) => (await fetch(new URL('../../pages/settings/' + f + '.js', import.meta.url))).text()));
  await t.test('6. حراس: لا import() ديناميكي ولا innerHTML في ملفات الأقسام الثمانية', texts.every((s) => !/\bimport\s*\(/.test(s) && !/\.innerHTML\s*=/.test(s)));
  await t.test('7. حراس: لا ملف قسم يستورد sections-system.js (لا دوران)', texts.every((s) => !/sections-system\.js/.test(s.replace(/\/\*[\s\S]*?\*\//g, ''))));
  await t.test('8. حراس: لا ملف يتجاوز 450 سطراً', texts.every((s) => s.split('\n').length <= 450));
  await t.test('9. حراس: قسم النسخ يحتفظ بمسارات التصدير الثلاثة المشفّرة (عقد v3.5.21)',
    (texts[3].match(/prepareExportEncryptor\(askSecretFor\)/g) || []).length === 3);
});
