/* ==========================================================================
   message-composer.js — مساعد صياغة الرسائل (v3.3.66)
   ==========================================================================
   يعمل محلياً دون إنترنت ودون ذكاء اصطناعي خارجي: تكتب فكرتك بكلمتين فيطابقها
   بمواقف جاهزة (كلمات مفتاحية)، ويصيغ نصاً مهذباً بنبرة ودّية أو رسمية.
   كل شيء قابل للتعديل قبل الإرسال.
   ========================================================================== */

import { looseNameKey } from './customer-merge.js';

export const TONES = [
  { id: 'friendly', label: 'ودّي' },
  { id: 'formal', label: 'رسمي' },
];

const sign = (v) => (v.workshop ? '\n— ' + v.workshop : '');
const greet = (v, tone) => (tone === 'formal'
  ? 'السلام عليكم ورحمة الله، ' + (v.customer || 'عميلنا الكريم') + '،'
  : 'السلام عليكم ' + (v.customer || 'عميلنا') + ' 🌷');
const money = (n) => (Number(n) > 0 ? Number(n) + ' ج.م' : '');

/**
 * fields: حقول إضافية يطلبها الموقف (days | date | amount).
 * body(v, tone): نص بعد التحية وقبل التوقيع.
 */
export const SITUATIONS = [
  {
    id: 'delay', icon: '⏳', title: 'اعتذار عن تأخير',
    keywords: ['تاخير', 'تاخر', 'اعتذار', 'اسف', 'تأخير', 'اتاخر', 'متاخر', 'لسه', 'اجل', 'تأجيل', 'موعد جديد'],
    fields: ['days', 'date'],
    body: (v, t) => (t === 'formal'
      ? 'نعتذر عن تأخّر طلبكم' + (v.days ? ' بنحو ' + v.days + ' أيام' : '') + ' عن الموعد المحدّد، ونؤكد حرصنا على إنجازه بالجودة المطلوبة.' + (v.date ? '\nالموعد الجديد المتوقّع: ' + v.date + '.' : '')
      : 'بنعتذر لك جداً، طلبك اتأخر' + (v.days ? ' حوالي ' + v.days + ' أيام' : '') + ' عن الميعاد، وبنشتغل عليه بأقصى سرعة.' + (v.date ? '\nالميعاد الجديد بإذن الله: ' + v.date + '.' : '')) +
      '\nشاكرين صبرك وتفهّمك.',
  },
  {
    id: 'payment', icon: '💰', title: 'تذكير بالمتبقي',
    keywords: ['متبقي', 'دفع', 'فلوس', 'حساب', 'مستحق', 'سداد', 'تذكير', 'باقي', 'مبلغ', 'دين'],
    fields: ['amount'],
    body: (v, t) => (t === 'formal'
      ? 'نودّ تذكيركم بوجود مبلغ متبقٍّ' + (money(v.amount) ? ' قدره ' + money(v.amount) : '') + ' على طلبكم، ونأمل التكرّم بسداده في أقرب فرصة.'
      : 'تذكير لطيف إن فاضل' + (money(v.amount) ? ' ' + money(v.amount) : ' مبلغ') + ' على طلبك، ولو تقدر تسدده في أقرب وقت يبقى جميل 🙏') +
      '\nولا يهمك لو سددته بالفعل، نعتذر عن الإزعاج.',
  },
  {
    id: 'ready', icon: '📦', title: 'الطلب جاهز للاستلام',
    keywords: ['جاهز', 'جهز', 'استلام', 'خلص', 'خلصت', 'تسليم', 'انتهى', 'تعال'],
    fields: ['amount'],
    body: (v, t) => (t === 'formal'
      ? 'يسعدنا إبلاغكم بأن طلبكم أصبح جاهزاً للاستلام' + (v.pickupHours ? ' خلال مواعيد العمل: ' + v.pickupHours : '') + '.'
      : 'طلبك جاهز وبانتظارك! ✨' + (v.pickupHours ? '\nمواعيد الاستلام: ' + v.pickupHours : '')) +
      (money(v.amount) ? '\nالمتبقي عند الاستلام: ' + money(v.amount) + '.' : '') +
      (v.address ? '\n📍 ' + v.address : ''),
  },
  {
    id: 'thanks', icon: '🙏', title: 'شكر بعد التسليم',
    keywords: ['شكر', 'شكرا', 'امتنان', 'بعد التسليم', 'تقدير', 'ممتن'],
    fields: [],
    body: (v, t) => (t === 'formal'
      ? 'نشكركم على ثقتكم الغالية، ونأمل أن يكون الطلب قد نال إعجابكم. يسعدنا خدمتكم دائماً.'
      : 'شكراً لثقتك الغالية! 🌹 نتمنى الجلابية تعجبك وتلبسها بصحة وهنا. تحت أمرك في أي وقت.'),
  },
  {
    id: 'appointment', icon: '🗓️', title: 'تذكير بموعد قياس/بروفة',
    keywords: ['موعد', 'قياس', 'بروفة', 'بروفه', 'ميعاد', 'زيارة', 'حضور'],
    fields: ['date'],
    body: (v, t) => (t === 'formal'
      ? 'نذكّركم بموعدكم لدينا' + (v.date ? ' يوم ' + v.date : '') + ' للقياس أو التجربة، وبانتظاركم.'
      : 'تذكير بميعادك معانا' + (v.date ? ' يوم ' + v.date : '') + ' للقياس/البروفة، منتظرينك 🙌') +
      (v.address ? '\n📍 ' + v.address : ''),
  },
  {
    id: 'quote', icon: '📝', title: 'متابعة عرض سعر',
    keywords: ['عرض', 'سعر', 'اسعار', 'تسعيرة', 'متابعة', 'قرار', 'مهتم'],
    fields: ['amount'],
    body: (v, t) => (t === 'formal'
      ? 'نتابع معكم بخصوص عرض السعر' + (money(v.amount) ? ' (' + money(v.amount) + ')' : '') + ' الذي أرسلناه، ونسعد بالإجابة عن أي استفسار.'
      : 'حبّينا نطمّن على عرض السعر' + (money(v.amount) ? ' (' + money(v.amount) + ')' : '') + ' اللي بعتناه، لو عندك أي سؤال أو تعديل إحنا موجودين.'),
  },
  {
    id: 'deposit', icon: '🧾', title: 'طلب عربون',
    keywords: ['عربون', 'مقدم', 'حجز', 'تاكيد', 'تأكيد'],
    fields: ['amount'],
    body: (v, t) => (t === 'formal'
      ? 'لتأكيد حجز طلبكم نرجو سداد عربون' + (money(v.amount) ? ' قدره ' + money(v.amount) : '') + ' حتى نبدأ التنفيذ.'
      : 'علشان نبدأ شغل طلبك محتاجين عربون' + (money(v.amount) ? ' ' + money(v.amount) : '') + ' يأكد الحجز، وبعدها نبدأ على طول 👍'),
  },
  {
    id: 'greeting', icon: '🎉', title: 'تهنئة موسم أو عيد',
    keywords: ['تهنئة', 'عيد', 'رمضان', 'موسم', 'كل سنة', 'مناسبة', 'مبارك', 'اجازة'],
    fields: [],
    body: (v, t) => (t === 'formal'
      ? 'نتقدّم إليكم بأطيب التهاني بهذه المناسبة المباركة، أعاده الله عليكم بالخير واليُمن والبركات.'
      : 'كل سنة وإنت طيب وبخير! 🌙✨ بنتمنى لك ولأهلك أيام سعيدة، وجاهزين نجهّز لك أحلى لبس للمناسبة.'),
  },
  {
    id: 'feedback', icon: '⭐', title: 'طلب رأي أو ترشيح',
    keywords: ['رايك', 'رأيك', 'تقييم', 'ترشيح', 'نصيحة', 'اعجب', 'انطباع', 'ريفيو'],
    fields: [],
    body: (v, t) => (t === 'formal'
      ? 'يهمّنا رأيكم في طلبكم الأخير، وإن نال رضاكم نكون سعداء بترشيحنا لمعارفكم.'
      : 'يهمنا رأيك في الجلابية اللي استلمتها، لو عجبتك ممكن ترشحنا لحد من معارفك وإحنا هنقدّر ده جداً 🌹'),
  },
];

/**
 * ترتيب المواقف حسب تطابقها مع النص الحر. النص الفارغ ⟵ لا ترشيح.
 * @returns {Array<{id:string, score:number}>} تنازلياً، المتطابقة فقط.
 */
export function matchSituations(text) {
  const q = looseNameKey(text);
  if (!q) return [];
  const words = q.split(' ').filter((w) => w.length >= 2);
  const scored = SITUATIONS.map((s) => {
    let score = 0;
    for (const k of s.keywords) {
      const nk = looseNameKey(k);
      if (!nk) continue;
      if (q.includes(nk)) score += nk.length >= 4 ? 3 : 2;
      else if (words.some((w) => nk.includes(w) || w.includes(nk))) score += 1;
    }
    if (q.includes(looseNameKey(s.title))) score += 5;
    return { id: s.id, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score);
}

export function getSituation(id) { return SITUATIONS.find((s) => s.id === id) || null; }

/**
 * @param {{situationId:string, tone?:'friendly'|'formal', vars?:Object, note?:string}} p
 *  vars: customer, workshop, address, pickupHours, days, date, amount
 * @returns {string} '' إن لم يُعرف الموقف
 */
export function composeMessage({ situationId, tone = 'friendly', vars = {}, note = '' } = {}) {
  const s = getSituation(situationId);
  if (!s) return '';
  const t = tone === 'formal' ? 'formal' : 'friendly';
  const lines = [greet(vars, t), s.body(vars, t)];
  const extra = String(note || '').trim();
  if (extra) lines.push(extra);
  return lines.join('\n') + '\n' + sign(vars).trim();
}
