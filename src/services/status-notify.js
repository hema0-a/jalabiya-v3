/* ==========================================================================
   status-notify.js — اقتراح «إشعار العميل» بعد تغيير حالة الطلب  [v3.3.44]
   ==========================================================================
   بعد تحويل الطلب إلى «قيد التنفيذ / جاهز / تسليم» أو إنشائه، يظهر في نفس
   التنبيه زر «📱 إشعار العميل» يفتح واتساب برسالة القالب المناسب جاهزة بنقرة.

   - يُرجع null (فلا يظهر زر) إن: الرسائل التلقائية معطّلة، أو الاقتراح معطّل
     (autoMessages.promptOnStatus=false)، أو القالب معطّل، أو لا هاتف للعميل.
   - النص يُبنى قبل ظهور التنبيه، فنقرة الزر متزامنة (window.open يحتاج نقرة مباشرة).
   - لا يفشل أبداً: أي خطأ ⇒ null (الاقتراح ميزة إضافية لا يجوز أن تعطّل تغيير الحالة).
   ========================================================================== */

import { settings } from '../data/repos/settings.js';
import { customers } from '../data/repos/customers.js';
import { payments } from '../data/repos/payments.js';
import { orderPaidBreakdown } from './payments-view.js';
import { getTemplateSync, interpolate, buildVars } from './message-templates.js';
import { sendLogged } from './auto-messages.js';
import { toast } from '../ui/toast.js';

/** الحالة الجديدة ← القالب المناسب. */
export const STATUS_TEMPLATE = {
  in_progress: 'start_work',
  ready: 'ready',
  delivered: 'thanks',
};

/** هل لهذه الحالة قالب إشعار؟ */
export function templateForStatus(status) {
  return STATUS_TEMPLATE[status] || null;
}

/**
 * زر إشعار جاهز لقالب معيّن، أو null.
 * @param {Object} order — الطلب (بعد التحديث)
 * @param {string} templateId
 * @returns {Promise<{label:string, onClick:Function}|null>}
 */
export async function notifyActionFor(order, templateId) {
  try {
    if (!order || !templateId) return null;
    const s = await settings.get();
    const cfg = (s && s.autoMessages) || {};
    if (cfg.enabled === false || cfg.promptOnStatus === false) return null;

    const tpl = getTemplateSync(templateId, cfg);
    if (!tpl || !tpl.enabled) return null;

    const customer = order.customerId ? await customers.find(order.customerId) : null;
    if (!customer || !customer.phone) return null;

    let paid = Number(order.deposit) || 0;
    try { paid = orderPaidBreakdown(order, await payments.findByOrder(order.id)).paid; } catch (e) { /* المقدم فقط */ }

    const text = interpolate(tpl.text, buildVars(order, customer, (s && s.workshop) || {}, { paid }));
    return {
      label: '📱 إشعار العميل',
      onClick: () => {
        const ok = sendLogged(customer.phone, text, { kind: templateId, ref: order.id, customerId: customer.id });
        if (!ok) toast.warning('رقم الهاتف غير صالح');
      },
    };
  } catch (e) {
    return null;
  }
}

/**
 * زر إشعار بعد الانتقال لحالة جديدة.
 * @param {Object} order — الطلب (بعد التحديث)
 * @param {string} toStatus
 */
export async function statusNotifyAction(order, toStatus) {
  return notifyActionFor(order, templateForStatus(toStatus));
}

/** زر إشعار بعد إنشاء طلب جديد. */
export async function newOrderNotifyAction(order) {
  return notifyActionFor(order, 'new_order');
}
