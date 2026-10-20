/* ==========================================================================
   ledger-flag.js — هل الدفتر «مرجع أساسي» على هذا الجهاز؟ (v3.3.82)
   ==========================================================================
   وحدة خفيفة عمداً (تستورد idb والمخطط فقط) كي يستدعيها مستودع العملاء دون استيراد دائري
   ولا اعتماد ثقيل. تقرأ مفتاح settings.ledgerAuthority.enabled مباشرة من السجل المخزَّن
   في كل استدعاء (بلا ذاكرة مؤقتة): قراءة سجل واحد رخيصة، وبلا ذاكرة لا يوجد خطر مفتاح قديم
   بعد التفعيل/الإلغاء. أي فشل في القراءة يُعدّ «غير مفعّل» (المسار القديم الآمن).
   ========================================================================== */

import * as idb from '../data/idb.js';
import { STORES } from '../core/config.js';
import { SETTINGS_ID } from '../data/schema.js';

/**
 * @returns {Promise<boolean>} true فقط إن كان المفتاح مفعَّلاً صراحةً
 */
export async function isAuthorityActive() {
  try {
    const rec = await idb.get(STORES.SETTINGS, SETTINGS_ID);
    return !!(rec && rec.ledgerAuthority && rec.ledgerAuthority.enabled === true);
  } catch (e) {
    return false;
  }
}
