/* ==========================================================================
   auto-messages.js — الرسائل التلقائية (WhatsApp)  [v3.3.44]
   ==========================================================================
   - القوالب ومحرّكها في message-templates.js (نقي)؛ هذا الملف يضيف:
     قراءة الإعدادات (async)، فتح واتساب، وتسجيل ما أُرسل (message-log.js).
   - يُعاد تصدير واجهة المحرّك لتبقى الاستيرادات القديمة تعمل.
   - يقرأ التخصيصات والقوالب المخصّصة من settings.autoMessages.
   - الرسائل تفتح واتساب برسالة جاهزة؛ المستخدم هو من يضغط «إرسال».
   - Static imports فقط.
   ========================================================================== */

import { settings } from '../data/repos/settings.js';
import { normalizePhone } from '../core/utils.js';
import {
  listTemplates, getTemplateSync, isEnabledCfg, interpolate, buildVars,
} from './message-templates.js';
import { logMessage, lastSent } from './message-log.js';

export {
  DEFAULT_TEMPLATES, VARIABLES, MAX_TEMPLATE_LENGTH, buildVars, interpolate,
  findUnknownVariables, sampleVars, variablesFor, listTemplates, getTemplateSync, renderTemplate,
} from './message-templates.js';

/* ==========================================================================
   1. جلب القوالب
   ========================================================================== */

async function readCfg() {
  try {
    const s = await settings.get();
    return (s && s.autoMessages) || {};
  } catch { return {}; }
}

/** نسبة العربون المطلوبة (للمتغير {depositDue}). */
async function readDepositPercent() {
  try {
    const s = await settings.get();
    const p = Number(s && s.depositPolicy && s.depositPolicy.minPercent);
    return p > 0 ? p : 30;
  } catch { return 30; }
}

/**
 * كل القوالب (الافتراضية بعد تخصيصها + المخصّصة).
 * @returns {Promise<Array>}
 */
export async function getTemplates() {
  return listTemplates(await readCfg());
}

/**
 * قالب واحد بمعرّفه.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getTemplate(id) {
  return getTemplateSync(id, await readCfg());
}

/**
 * هل الرسائل التلقائية مُفعَّلة؟
 * @returns {Promise<boolean>}
 */
export async function isEnabled() {
  try { return isEnabledCfg(await readCfg()); } catch { return true; }
}

/* ==========================================================================
   2. إرسال WhatsApp
   ========================================================================== */

/**
 * فتح WhatsApp برسالة جاهزة.
 * @param {string} phone
 * @param {string} text
 * @returns {boolean} — true إن نجح
 */
export function sendWhatsApp(phone, text) {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  const clean = String(normalized).replace(/\D/g, '');
  if (!clean) return false;
  const url = 'https://wa.me/' + clean + '?text=' + encodeURIComponent(text || '');
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * فتح واتساب + تسجيل الرسالة في السجل (لعرض «آخر إرسال» ومنع التكرار).
 * @param {string} phone
 * @param {string} text
 * @param {{kind:string, ref?:string|null, customerId?:string|null}} [meta]
 * @returns {boolean}
 */
export function sendLogged(phone, text, meta) {
  const ok = sendWhatsApp(phone, text);
  if (ok && meta && meta.kind) {
    try { logMessage(meta); } catch (e) { /* السجل لا يُفشل الإرسال */ }
  }
  return ok;
}

/* ==========================================================================
   3. واجهات جاهزة للاستخدام
   ========================================================================== */

/**
 * بناء قائمة خيارات الرسائل لطلب معيّن (القوالب المفعَّلة من نوع الطلب،
 * الافتراضية والمخصّصة معاً).
 * @param {Object} order
 * @param {Object} customer
 * @param {Object|string} [workshop] — كائن settings.workshop
 * @param {{paid?:number}} [extra]
 * @returns {Promise<Array<{id:string, name:string, icon:string, text:string, send:Function, hasPhone:boolean, lastSentAt:number|null}>>}
 */
export async function getOrderMessageOptions(order, customer, workshop = {}, extra = {}) {
  if (!order) return [];

  const cfg = await readCfg();
  if (!isEnabledCfg(cfg)) return [];

  const templates = listTemplates(cfg).filter((t) => t.scope === 'order' && t.enabled);
  const vars = buildVars(order, customer, workshop, { depositPercent: await readDepositPercent(), ...extra });
  const phone = (customer && customer.phone) || '';
  const customerId = (customer && customer.id) || order.customerId || null;

  return templates.map((t) => {
    const text = interpolate(t.text, vars);
    return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      text,
      send: () => sendLogged(phone, text, { kind: t.id, ref: order.id, customerId }),
      hasPhone: !!phone,
      lastSentAt: lastSent({ kinds: [t.id], ref: order.id }),
    };
  });
}

/* ==========================================================================
   4. تصدير للاختبار
   ========================================================================== */

export const _internal = { readCfg };
