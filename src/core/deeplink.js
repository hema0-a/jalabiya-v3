/* ==========================================================================
   deeplink.js — فتح نموذج «جديد» مباشرة من رابط (v3.3.39)
   ==========================================================================
   #/orders/new  ·  #/customers/new  ·  #/payments/new  ·  #/appointments/new  ·  #/expenses/new
   تستدعيه الصفحة في نهاية render: إن كان المسار الفرعي «new» تفتح النموذج مرة واحدة
   ثم يُنظَّف الرابط (replaceState بلا hashchange) فلا يُعاد فتحه عند التحديث أو الرجوع.
   ========================================================================== */

/**
 * @param {string|null} sub — المسار الفرعي الممرَّر من الراوتر
 * @param {string} base — اسم الصفحة (مثل 'orders')
 * @param {Function} openFn — تفتح النموذج
 * @returns {boolean} true إن فُتح
 */
export function consumeNew(sub, base, openFn) {
  if (sub !== 'new' || typeof openFn !== 'function') return false;
  try { history.replaceState(null, '', '#/' + base); } catch { /* ignore */ }
  try { openFn(); } catch (e) { console.warn('[deeplink] open failed:', e); return false; }
  return true;
}
