/* ==========================================================================
   relation-inputs.js — مدخلات فحص السلامة من مخازن 3.12–3.16 (v3.16.2)
   ==========================================================================
   تقرأ مخازن التعديلات والحضور والعمال والموردين وحركاتهم (قراءة فقط) لتمريرها إلى scanIntegrity.
   أي فشل ⟵ كائن فارغ فيُتخطّى فحص الروابط ولا يعطّل بقية الفحص.
   ========================================================================== */

import { aftercare } from '../data/repos/aftercare.js';
import { attendance } from '../data/repos/attendance.js';
import { workers } from '../data/repos/workers.js';
import { suppliers, supplierEntries } from '../data/repos/suppliers.js';

export async function loadRelationInputs() {
  try {
    const [ac, at, ws, su, se] = await Promise.all([aftercare.list(), attendance.list(), workers.list(), suppliers.list(), supplierEntries.list()]);
    return { aftercare: ac, attendance: at, workers: ws, suppliers: su, supplierEntries: se };
  } catch (e) {
    return {};
  }
}
