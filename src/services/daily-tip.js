/* ==========================================================================
   daily-tip.js — «نصيحة اليوم المالية» + المحفوظات ⭐ (v3.11.1) — دوال نقية
   ==========================================================================
   منقولة من الإصدار الأقدم (feature-daily-tips): نصيحة ثابتة طوال اليوم من مكتبة عامة + نصائح مبنية على
   بياناتك (مصروف البيت، أقساط تنتهي قريباً، اتجاه صافي الثروة)، وزر «نصيحة تانية» وحفظ النصائح المفضلة.
   (بطاقة «نصائح مالية ذكية» الموجودة تنبيهات رقمية عن ورشتك، وهذه نصيحة تثقيفية متجددة يومياً.)
   ========================================================================== */

export const MAX_SAVED = 30;
export const MAX_TIP_LEN = 400;

export const GENERIC_TIPS = [
  'خصص نسبة ثابتة من كل مبلغ يدخل (حتى لو 10%) للادخار قبل أي إنفاق تاني.',
  'افصل حساب/محفظة الورشة عن مصاريفك الشخصية عشان تعرف تقيّم الاثنين صح.',
  'قبل أي شراء غير ضروري، سيب المبلغ يوم كامل قبل ما تقرر — القرارات المتسرعة أغلى.',
  'راجع اشتراكاتك الشهرية كل 3 شهور، وألغِ أي حاجة مش بتستخدمها فعليًا.',
  'صندوق الطوارئ المثالي يغطي من 3 إلى 6 أشهر من مصاريفك الأساسية.',
  'سجّل كل مصروف مهما كان صغير لمدة أسبوع واحد بس — هتتفاجئ بالنتيجة.',
  'الدين اللي بيدفع فوائد عالية لازم يتقفل الأول قبل أي ادخار إضافي.',
  'حدد سقف إنفاق لكل بند شهريًا، ولو عدّيته اعتبره إنذار مش تفصيلة.',
  'اجعل الادخار «تلقائي» بقدر الإمكان — الحاجات اليدوية بننساها بسهولة.',
  'قبل ما تاخد أي التزام شهري جديد (اشتراك، قسط)، اسأل نفسك: هل ده هيفضل مهم بعد 6 شهور؟',
  'متابعة صافي ثروتك (أصول − التزامات) شهريًا أهم من متابعة الدخل بس.',
  'خصّص جزء بسيط من أي دخل غير متوقع (مكافأة، هدية) للادخار فورًا قبل ما «يدوب» في المصاريف اليومية.',
  'قارن نفسك بنفسك الشهر اللي فات، مش بحد تاني — كل ظرف مختلف.',
  'لو عندك أكتر من هدف ادخار، رتبهم بالأولوية بدل ما توزع بالتساوي على الكل.',
  'اسأل نفسك قبل كل قرض: هل أقدر أدفع القسط ده حتى لو الشهر ده كان ضعيف؟',
  'خلي جزء من مدخراتك في مكان «صعب الوصول له بسرعة» عشان ميترصفش وقت الإغراء.',
  'التضخم بياكل من قيمة الفلوس الساكنة — فكر في استثمار جزء بسيط بدل الاحتفاظ بكل حاجة كاش.',
  'وثّق كل دين عليك أو لك — الديون الشفهية بتضيع أو بتتنسى بسهولة.',
  'خصص يوم ثابت كل شهر (مثلاً أول الشهر) لمراجعة كل حساباتك المالية في جلسة واحدة.',
  'الفرق بين «أنا محتاجه» و«أنا عايزه» هو أهم سؤال قبل أي مصروف كبير.',
  'لو دخلك بيتغير من شهر لشهر، احسب على أساس أقل شهر حصلته السنة دي، مش المتوسط.',
  'خلي هدف الادخار رقم واضح وتاريخ محدد — الأهداف الغامضة بتتأجل للأبد.',
  'راجع أسعارك/رسومك كل فترة — لو تكاليفك زادت وسعرك ثابت يبقى ربحك بيقل من غير ما تحس.',
  'لا تخلط بين «مصروف الورشة» و«مصروف البيت» في نفس الجيب، حتى لو الفلوس كلها بتيجي من مكان واحد.',
  'كل جنيه بتوفره من مصروف متكرر (شهري) قيمته الحقيقية = المبلغ × 12 في السنة.',
];

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const ym = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };

/** رقم اليوم في السنة (1..366) بالتقويم المحلي. */
export function dayOfYear(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 0);
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((cur - start) / 86400000);
}

/**
 * نصائح من بياناتك (قد تكون فارغة).
 * @param {{houseExpenses?:Array, commitments?:Array, netWorthHistory?:Array<{ym:string,value:number}>, remainingMonthsOf?:Function, now?:Date}} a
 */
export function dynamicTips(a) {
  const now = (a && a.now) || new Date();
  const out = [];
  try {
    const he = Array.isArray(a && a.houseExpenses) ? a.houseExpenses : [];
    const cur = now.getFullYear() * 12 + now.getMonth();
    const sum = (idx) => he.reduce((s, e) => (e && e.date && ym(e.date) === idx ? s + n(e.amount) : s), 0);
    const thisM = sum(cur), lastM = sum(cur - 1);
    if (lastM > 0 && thisM > lastM * 1.15) {
      out.push('مصاريف بيتك الشهر ده أعلى من الشهر اللي فات بنسبة ' + Math.round((thisM / lastM - 1) * 100) + '% — يستاهل نظرة سريعة على السبب.');
    }
    const rem = a && typeof a.remainingMonthsOf === 'function' ? a.remainingMonthsOf : null;
    if (rem) {
      const ending = (Array.isArray(a.commitments) ? a.commitments : []).filter((c) => {
        if (!c || c.active === false) return false;
        const r = rem(c, now);
        return r !== null && r > 0 && r <= 2;
      });
      if (ending.length) out.push('عندك ' + ending.length + ' التزام هيخلص خلال شهرين — فكّر بدري فين هتوجه المبلغ اللي هيتفضّى بعدهم.');
    }
    const h = Array.isArray(a && a.netWorthHistory) ? a.netWorthHistory : [];
    if (h.length >= 2) {
      const last = n(h[h.length - 1] && h[h.length - 1].value), prev = n(h[h.length - 2] && h[h.length - 2].value);
      if (prev > 0 && last < prev * 0.95) out.push('صافي ثروتك التقديري نزل عن الشهر اللي فات — مش بالضرورة مشكلة، بس يستاهل تشوف السبب (سحب استثمار؟ قسط جديد؟).');
    }
  } catch (e) { /* النصائح العامة تكفي */ }
  return out;
}

/** الحوض: نصائح بياناتك أولاً ثم العامة. */
export function tipPool(a) {
  return dynamicTips(a).concat(GENERIC_TIPS);
}

/** نصيحة اليوم: ثابتة بيوم السنة؛ offset يتحرّك بزر «نصيحة تانية». */
export function pickTip(pool, now = new Date(), offset = 0) {
  const p = Array.isArray(pool) && pool.length ? pool : GENERIC_TIPS;
  const idx = (((dayOfYear(now) + Math.round(n(offset))) % p.length) + p.length) % p.length;
  return p[idx];
}

const cleanText = (t) => (typeof t === 'string' ? t.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TIP_LEN) : '');

/** إعدادات النصائح المحفوظة: { saved:[{id,text,date}] } مُنقّاة بلا تكرار وبحد أقصى. */
export function normalizeDailyTips(x) {
  const seen = new Set();
  const saved = [];
  for (const t of (x && Array.isArray(x.saved)) ? x.saved : []) {
    const text = cleanText(t && t.text);
    if (!text || seen.has(text) || typeof (t && t.id) !== 'string' || !t.id) continue;
    seen.add(text);
    saved.push({ id: t.id, text, date: typeof t.date === 'string' ? t.date.slice(0, 10) : '' });
    if (saved.length >= MAX_SAVED) break;
  }
  return { saved };
}

/** حفظ نصيحة (الأحدث أولاً). @returns {{saved:Array, added:boolean}} added=false إن كانت محفوظة أو فارغة */
export function saveTip(saved, text, id, dateStr) {
  const list = normalizeDailyTips({ saved }).saved;
  const t = cleanText(text);
  if (!t || list.some((s) => s.text === t)) return { saved: list, added: false };
  return { saved: [{ id, text: t, date: dateStr || '' }, ...list].slice(0, MAX_SAVED), added: true };
}

export function removeTip(saved, id) {
  return normalizeDailyTips({ saved }).saved.filter((s) => s.id !== id);
}
