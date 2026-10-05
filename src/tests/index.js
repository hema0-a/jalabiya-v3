/* ==========================================================================
   index.js — قائمة وحدات الاختبار (Entry Point)
   ==========================================================================
   لإضافة وحدة اختبار جديدة: أضف سطر import واحد هنا.
   ========================================================================== */

import './modules/core.test.js';
import './modules/data.test.js';
import './modules/repos.test.js';
import './modules/security.test.js';
import './modules/ui.test.js';
import './modules/pages.test.js';
import './modules/orders.test.js';
import './modules/dashboard.test.js';
import './modules/pages2.test.js';
import './modules/settings.test.js';

export { runAll, register } from './registry.js';
