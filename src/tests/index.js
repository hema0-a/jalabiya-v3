/* ==========================================================================
   index.js — قائمة وحدات الاختبار (Entry Point)
   ==========================================================================
   لإضافة وحدة اختبار جديدة: أضف سطر import واحد هنا.
   كل ملف اختبار يستدعي register() بنفسه — لا تعديل على هذا الملف
   إلا لإضافة ملف اختبار جديد.
   ========================================================================== */

import './modules/core.test.js';
import './modules/data.test.js';
import './modules/repos.test.js';
import './modules/security.test.js';
import './modules/ui.test.js';

export { runAll, register } from './registry.js';
