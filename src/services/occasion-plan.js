/* ==========================================================================
   occasion-plan.js — اقتراحات التسعير وخطة الاستعداد للمواسم (v3.5.22)
   ==========================================================================
   منطق نقي بلا DOM ولا تخزين (يُمرَّر إليه الموسم والطلبات والوقت) فيُختبر في Node.
   مُستعاد من v2 (suggestOccasionPricing / generatePreparationPlan / تنبيهات المواسم)
   ومُكيَّف لبنية v3: الطلب {amount, createdAt(ms), status}، والموسم {name, month(1-12), day, alertDays}.
   API:
     daysUntilOccasion(occ, now?)            → {daysLeft, date}
     occasionAlertLevel(daysLeft)            → {priority, color, bg, label}
     suggestOccasionPricing(occ, orders, now?) → [{icon, text}]
     generatePreparationPlan(occ)            → string[]
   ========================================================================== */

import { formatEGP } from '../core/utils.js';

const DAY_MS = 86400000;

/** بداية يوم بتوقيت الجهاز. */
function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * الأيام المتبقية لأقرب تكرار قادم للموسم (اليوم نفسه = 0).
 * @param {{month:number, day:number}} occ
 * @param {number} [now=Date.now()]
 * @returns {{daysLeft:number, date:Date}}
 */
export function daysUntilOccasion(occ, now = Date.now()) {
  const today = startOfDay(now);
  const y = new Date(today).getFullYear();
  const m = Number(occ && occ.month) - 1;
  const d = Number(occ && occ.day);
  let target = new Date(y, m, d, 0, 0, 0, 0);
  if (target.getTime() < today) target = new Date(y + 1, m, d, 0, 0, 0, 0);
  return { daysLeft: Math.round((target.getTime() - today) / DAY_MS), date: target };
}

/**
 * درجة إلحاح التنبيه بحسب الأيام المتبقية (ألوان v2 نفسها).
 * @param {number} daysLeft
 * @returns {{priority:'critical'|'high'|'medium'|'low', color:string, bg:string, label:string}}
 */
export function occasionAlertLevel(daysLeft) {
  const n = Number(daysLeft);
  if (n <= 3) return { priority: 'critical', color: '#C62828', bg: '#FFEBEE', label: n <= 0 ? 'اليوم!' : (n === 1 ? 'غداً' : 'بعد ' + n + ' أيام') };
  if (n <= 7) return { priority: 'high', color: '#E65100', bg: '#FFF3E0', label: 'بعد ' + n + ' أيام' };
  if (n <= 14) return { priority: 'medium', color: '#F57F17', bg: '#FFF8E1', label: 'بعد ' + n + ' يوم' };
  return { priority: 'low', color: '#1565C0', bg: '#E3F2FD', label: 'بعد ' + n + ' يوم' };
}

/**
 * متوسط مبلغ الطلبات في شهر الموسم عند آخر تكرار مضى (يُهمل الملغي والمبالغ الصفرية).
 * @param {{month:number, day:number}} occ
 * @param {Object[]} orders
 * @param {number} now
 * @returns {number} 0 عند عدم وجود بيانات
 */
function lastOccurrenceAvg(occ, orders, now) {
  const today = new Date(startOfDay(now));
  const m = Number(occ.month) - 1;
  const d = Number(occ.day);
  const thisYear = new Date(today.getFullYear(), m, d, 0, 0, 0, 0);
  const year = thisYear.getTime() <= today.getTime() ? today.getFullYear() : today.getFullYear() - 1;
  const from = new Date(year, m, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, m + 1, 1, 0, 0, 0, 0).getTime();
  let sum = 0;
  let count = 0;
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || o.status === 'cancelled') continue;
    const at = Number(o.createdAt);
    const amount = Number(o.amount);
    if (!(at >= from && at < to) || !(amount > 0)) continue;
    sum += amount;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * اقتراحات تسعير قبل الموسم.
 * @param {{month:number, day:number}} occ
 * @param {Object[]} orders
 * @param {number} [now=Date.now()]
 * @returns {Array<{icon:string, text:string}>}
 */
export function suggestOccasionPricing(occ, orders, now = Date.now()) {
  const { daysLeft } = daysUntilOccasion(occ, now);
  const out = [];
  if (daysLeft <= 7) out.push({ icon: '⚡', text: 'أضف رسوم استعجال 15-20% للطلبات القريبة من الموسم' });
  if (daysLeft <= 14) out.push({ icon: '🎁', text: 'قدّم خصم 5-10% للعملاء القدامى' });
  const avg = lastOccurrenceAvg(occ, orders, now);
  if (avg > 0) out.push({ icon: '💰', text: 'متوسط سعر طلباتك في شهر هذا الموسم العام الماضي: ' + formatEGP(Math.round(avg)) });
  out.push({ icon: '📈', text: 'توقّع زيادة الطلبات بنسبة 30-50% قبل المناسبة' });
  return out;
}

const BASE_PLAN = [
  'مراجعة الطاقة الإنتاجية اليومية',
  'التأكد من توفر المواد الخام',
  'تجهيز العمال للفترة المزدحمة',
  'الاتصال بالعملاء القدامى',
];

const SPECIFIC_PLANS = {
  'رمضان': [
    'التخطيط لزيادة إنتاج الجلابيب الرمضانية',
    'توفير الأقمشة الفاخرة للمناسبة',
    'تجهيز عروض خاصة للعملاء الدائمين',
  ],
  'عيد الفطر': [
    'تجهيز جلابيب العيد للرجال والنساء',
    'تأكيد توفر الألوان المطلوبة',
    'مراجعة الطلبات المتأخرة',
  ],
  'عيد الأضحى': [
    'التركيز على الجلابيب اليومية المريحة',
    'توفير الأقمشة القطنية بكميات كافية',
    'تجهيز عروض للعائلات',
  ],
  'المولد النبوي': [
    'تجهيز جلابيب مناسبة للمناسبة',
    'تنويع الألوان والتطريزات',
    'عروض خاصة للمساجد',
  ],
  'بداية العام الدراسي': [
    'تجهيز ملابس مدرسية إن كانت ضمن خدماتك',
    'توفير الجلابيب المريحة للأطفال',
    'عروض للعائلات',
  ],
};

/**
 * خطة استعداد: خطوات خاصة بالموسم (إن عُرف اسمه) ثم الخطوات العامة.
 * يُرجَع دائماً مصفوفة جديدة (لا مراجع مشتركة).
 * @param {{name:string}} occ
 * @returns {string[]}
 */
export function generatePreparationPlan(occ) {
  const name = String((occ && occ.name) || '');
  for (const key of Object.keys(SPECIFIC_PLANS)) {
    if (name.includes(key)) return [...SPECIFIC_PLANS[key], ...BASE_PLAN];
  }
  return [...BASE_PLAN];
}
