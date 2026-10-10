/* ==========================================================================
   index.js — قائمة وحدات الاختبار (Entry Point)
   ==========================================================================
   ⚠️ static imports ONLY — dynamic imports تفشل في Safari.
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
import './modules/appointments-page.test.js';
import './modules/pricing.test.js';
import './modules/financial.test.js';
import './modules/kpis.test.js';
import './modules/portfolio.test.js';
import './modules/commitments.test.js';
import './modules/house-expenses.test.js';
import './modules/loans.test.js';
import './modules/collapsible.test.js';
import './modules/sub-page.test.js';
import './modules/audit-3310.test.js';
import './modules/audit-3312.test.js';
import './modules/audit-3314.test.js';
import './modules/audit-3315.test.js';
import './modules/audit-3316.test.js';
import './modules/audit-3318.test.js';
import './modules/audit-3321.test.js';

export { runAll, register } from './registry.js';
