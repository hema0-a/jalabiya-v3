/* ==========================================================================
   sync-flow.js — مسار المزامنة الآمن (رفع / تنزيل) مع قرارات المستخدم
   ==========================================================================
   تستعمله صفحة المزامنة وصفحة الإعدادات معاً فلا يختلف سلوكهما.

   pushFlow(uid)
     - رفع عادي. إن كانت السحابة تغيّرت من جهاز آخر (أو هذا الجهاز لم يزامن قط)
       أو كانت بيانات الجهاز أقل بكثير من السحابة: يُوقَف الرفع ويُسأل المستخدم:
         «دمج ثم رفع» (موصى به) | «رفع واستبدال السحابة» | إلغاء.
   pullFlow(uid)
     - تنزيل. إن وُجد على الجهاز ما ليس في السحابة (أو أحدث منها) يُسأل المستخدم:
         «دمج» (يحفظ الكل) | «استبدال بالسحابة» | إلغاء.
     - نسخة أمان محلية دائماً قبل أي تغيير في بيانات الجهاز.
   كلاهما يعرض toast بنفسه ويُرجع { ok, cancelled?, mode?, error? }.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { STORAGE_KEYS } from '../core/config.js';
import { createBackup } from '../services/auto-backup.js';
import * as firestoreSync from './firestore-sync.js';
import { onManualSyncDone } from './auto-sync.js';

function markSynced() {
  try { localStorage.setItem(STORAGE_KEYS.V3_LAST_SYNC, String(Date.now())); } catch (e) { /* ignore */ }
  onManualSyncDone();
}

/**
 * نافذة اختيار بأزرار متعددة.
 * @param {{title:string, message:string, actions:Array<{text:string, variant?:string, value:string}>}} cfg
 * @returns {Promise<string|null>} قيمة الزر المضغوط، أو null عند الإغلاق/الإلغاء
 */
function choose({ title, message, actions }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const handle = modal.open({
      title,
      body: el('p', { text: message, style: { margin: '0', lineHeight: '1.7' } }),
      actions: actions.map((a) => ({
        text: a.text,
        variant: a.variant || 'secondary',
        onClick: () => { finish(a.value); handle.close(); },
      })),
      onClose: () => finish(null),
    });
  });
}

/** نسخة أمان محلية قبل تعديل بيانات الجهاز. */
async function safetyBackup(label) {
  const safety = await createBackup({ label });
  if (!safety.ok) {
    toast.danger('تعذّر إنشاء نسخة أمان — لم تتغير بياناتك');
    return false;
  }
  return true;
}

/**
 * تنزيل ودمج مع بيانات الجهاز (يحفظ كل شيء). يُستعمل من pullFlow ومن pushFlow عند التعارض.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function pullAndMerge(uid) {
  toast.info('جارٍ تنزيل بيانات السحابة...');
  const res = await firestoreSync.pull(uid);
  if (!res.ok) return { ok: false, error: res.error || 'فشل التنزيل' };
  if (!res.data) return { ok: true, empty: true };
  if (!(await safetyBackup('قبل الدمج مع السحابة'))) return { ok: false, error: 'تعذّر إنشاء نسخة أمان', handled: true };
  const ap = await firestoreSync.apply(res.data, { mode: 'merge' });
  if (!ap.ok) return { ok: false, error: ap.error || 'فشل الدمج' };
  return { ok: true, stats: ap.merge };
}

/* ==========================================================================
   رفع
   ========================================================================== */

export async function pushFlow(uid) {
  toast.info('جارٍ الرفع...');
  let res = await firestoreSync.push(uid);

  if (!res.ok && (res.code === 'remote-changed' || res.code === 'shrink')) {
    const message = res.error + '.\n\nالأسلم: دمج بيانات السحابة مع بيانات هذا الجهاز ثم الرفع — لا يضيع شيء من الطرفين.';
    const choice = await choose({
      title: res.code === 'shrink' ? 'بيانات الجهاز أقل من السحابة' : 'السحابة فيها بيانات أخرى',
      message,
      actions: [
        { text: '🔀 دمج ثم رفع (موصى به)', variant: 'primary', value: 'merge' },
        { text: '⚠️ رفع واستبدال السحابة', variant: 'danger', value: 'force' },
        { text: 'إلغاء', variant: 'ghost', value: 'cancel' },
      ],
    });

    if (choice === 'merge') {
      const m = await pullAndMerge(uid);
      if (!m.ok) {
        if (!m.handled) toast.danger('فشل الدمج: ' + m.error);
        return { ok: false, error: m.error };
      }
      toast.info('تم الدمج — جارٍ رفع النتيجة...');
      res = await firestoreSync.push(uid);
      if (!res.ok && res.code) {
        toast.danger('تغيّرت السحابة مرة أخرى أثناء الدمج — أعد المحاولة');
        return { ok: false, error: res.error };
      }
    } else if (choice === 'force') {
      const sure = await modal.confirm({
        title: 'استبدال السحابة؟',
        message: 'ستُحذف بيانات السحابة نهائياً وتحلّ محلها بيانات هذا الجهاز. لا يمكن التراجع.',
        confirmText: 'استبدال', cancelText: 'تراجع', danger: true,
      });
      if (!sure) return { ok: false, cancelled: true };
      res = await firestoreSync.push(uid, { force: true });
    } else {
      return { ok: false, cancelled: true };
    }
  }

  if (res.ok) {
    markSynced();
    toast.success('تم الرفع');
    return { ok: true };
  }
  toast.danger('فشل الرفع: ' + (res.error || 'خطأ غير معروف'));
  return { ok: false, error: res.error };
}

/* ==========================================================================
   تنزيل
   ========================================================================== */

export async function pullFlow(uid) {
  toast.info('جارٍ التنزيل...');
  const res = await firestoreSync.pull(uid);
  if (!res.ok) {
    toast.danger('فشل التنزيل: ' + (res.error || 'خطأ غير معروف'));
    return { ok: false, error: res.error };
  }
  if (!res.data) {
    toast.warning('لا توجد بيانات سحابية بعد');
    return { ok: false, empty: true };
  }

  /* هل على الجهاز ما سيضيع لو استُبدلت بياناته؟ */
  const an = await firestoreSync.analyzeLocalVsCloud(res.data);
  if (!an.ok) {
    toast.danger('تعذّر مقارنة البيانات: ' + (an.error || ''));
    return { ok: false, error: an.error };
  }

  let mode = 'replace';
  if (an.localOnly + an.localNewer > 0) {
    const parts = [];
    if (an.localOnly) parts.push(an.localOnly + ' سجل موجود هنا وغير موجود في السحابة');
    if (an.localNewer) parts.push(an.localNewer + ' سجل معدَّل هنا أحدث من نسخته في السحابة');
    const choice = await choose({
      title: 'بيانات على هذا الجهاز لم تُرفع',
      message: 'على هذا الجهاز: ' + parts.join('، ') + '.\n\n«الدمج» يحفظ كل شيء ويأخذ الأحدث لكل سجل. «الاستبدال» يمسح هذه السجلات من الجهاز.',
      actions: [
        { text: '🔀 دمج (يحفظ كل شيء)', variant: 'primary', value: 'merge' },
        { text: '⚠️ استبدال بالسحابة', variant: 'danger', value: 'replace' },
        { text: 'إلغاء', variant: 'ghost', value: 'cancel' },
      ],
    });
    if (choice !== 'merge' && choice !== 'replace') return { ok: false, cancelled: true };
    mode = choice;
  } else {
    const ok = await modal.confirm({
      title: 'تنزيل من السحابة',
      message: 'سيتم تحديث البيانات المحلية بالبيانات السحابية. متابعة؟',
      confirmText: 'تنزيل', cancelText: 'إلغاء',
    });
    if (!ok) return { ok: false, cancelled: true };
  }

  /* نسخة أمان قبل تعديل بيانات الجهاز */
  if (!(await safetyBackup('قبل التنزيل من السحابة'))) return { ok: false, error: 'تعذّر إنشاء نسخة أمان' };

  const ap = await firestoreSync.apply(res.data, { mode });
  if (!ap.ok) {
    toast.danger('فشل التطبيق: ' + (ap.error || 'خطأ غير معروف'));
    return { ok: false, error: ap.error };
  }
  markSynced();
  toast.success(mode === 'merge'
    ? 'تم الدمج — ارفع الآن لتحديث السحابة بالنتيجة'
    : 'تم التنزيل — افتح أي صفحة لرؤية البيانات');
  return { ok: true, mode };
}
