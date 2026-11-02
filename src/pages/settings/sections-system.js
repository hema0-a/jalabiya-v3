/* ==========================================================================
   sections-system.js — أقسام النظام (10)
   ==========================================================================
   التنبيهات، المواسم والأعياد، الرسائل التلقائية، النسخ الاحتياطي، صيانة البيانات (v3.5.27)، المزامنة السحابية،
   ضغط الصور، بيانات تجريبية، الدعم.

   [v3.5.26] قُسِّم الملف (1364 سطراً) دون تغيير سلوك: لكل قسم ملف مستقل بجواره
   (section-*.js) وهذا الملف يجمعها بالترتيب نفسه ويصدّر SYSTEM_SECTIONS كما كان.
   ⚠️ تاريخياً (v3.3.1/v3.3.2): لا spread للمفاتيح القديمة، والحفظ بحقل واحد فقط،
   وجلسة المزامنة عبر authSync.onAuthChange (لا current()). هذه القواعد محفوظة في الملفات الجديدة.
   ========================================================================== */

import { menuPagesSection } from './section-menu-pages.js';
import { notificationsSection } from './section-notifications.js';
import { occasionsSection } from './section-occasions.js';
import { autoMessagesSection } from './section-auto-messages.js';
import { backupSection } from './section-backup.js';
import { dataCareSection } from './section-data-care.js';
import { cloudSyncSection } from './section-cloud-sync.js';
import { imageCompressionSection } from './section-image-compression.js';
import { demoDataSection } from './section-demo-data.js';
import { supportSection } from './section-support.js';

export const SYSTEM_SECTIONS = [
  menuPagesSection,
  notificationsSection,
  occasionsSection,
  autoMessagesSection,
  backupSection,
  dataCareSection,
  cloudSyncSection,
  imageCompressionSection,
  demoDataSection,
  supportSection,
];
