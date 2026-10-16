/* ==========================================================================
   v3365-update-banner.test.js — شريط «تحديث جديد متاح» ومتحكّمه (v3.3.65)
   ========================================================================== */

import { register } from '../registry.js';
import { showUpdateBanner, hideUpdateBanner } from '../../ui/update-banner.js';
import { createUpdateOffer } from '../../pwa.js';

const count = () => document.querySelectorAll('#update-banner').length;

/** اعتماديات وهمية للمتحكّم. */
function fakeDeps(over = {}) {
  const log = { posted: [], reloads: 0, confirms: 0, timers: [] };
  const clock = { t: 1000 };
  const waiting = { postMessage: (m) => log.posted.push(m) };
  const deps = {
    hasOpenDialog: () => false,
    confirmFn: () => { log.confirms++; return true; },
    reload: () => { log.reloads++; },
    getRegistration: async () => ({ waiting }),
    now: () => clock.t,
    setTimer: (fn) => { log.timers.push(fn); return log.timers.length; },
    ...over,
  };
  return { deps, log, clock };
}

register('v3.3.65 update banner', async (t) => {
  try {
    /* ---- الواجهة ---- */
    let updated = 0, later = 0;
    const h = showUpdateBanner({ onUpdate: () => updated++, onLater: () => later++ });
    const node = document.getElementById('update-banner');
    await t.test('1. يظهر شريط واحد بـ role=status وزرّي «حدّث الآن» و«لاحقاً»',
      count() === 1 && node.getAttribute('role') === 'status'
      && !!node.querySelector('[data-action="update"]') && !!node.querySelector('[data-action="later"]'));

    const h2 = showUpdateBanner({ onUpdate: () => {} });
    await t.test('2. استدعاء ثانٍ لا يكرّر الشريط ويُرجع الموجود', count() === 1 && h2.existed === true && h2.node === node);

    node.querySelector('[data-action="update"]').click();
    node.querySelector('[data-action="later"]').click();
    await t.test('3. الضغط يستدعي onUpdate وonLater مرة واحدة لكل زر', updated === 1 && later === 1);

    h.setBusy(true);
    const upd = node.querySelector('[data-action="update"]');
    await t.test('4. وضع الانشغال يعطّل الزرّين ويغيّر النص',
      upd.disabled && node.querySelector('[data-action="later"]').disabled
      && upd.textContent.includes('جارٍ') && node.getAttribute('aria-busy') === 'true');
    h.setBusy(false);
    await t.test('5. إلغاء الانشغال يعيد الحالة', !upd.disabled && upd.textContent === 'حدّث الآن');

    hideUpdateBanner();
    await t.test('6. hideUpdateBanner يزيله (وآمن إن لم يوجد)', count() === 0 && (hideUpdateBanner(), true));

    /* ---- المتحكّم ---- */
    {
      const { deps, log } = fakeDeps();
      const u = createUpdateOffer(deps);
      const a = u.offer(); const b = u.offer();
      await t.test('7. offer يعرض الشريط مرة واحدة ولا يكرّره', a === true && b === false && count() === 1);
      document.querySelector('[data-action="update"]').click();
      for (let i = 0; i < 200 && log.posted.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
      await t.test('8. «حدّث الآن» يرسل SKIP_WAITING مرة واحدة ويعطّل الزر',
        log.posted.length === 1 && log.posted[0].type === 'SKIP_WAITING' && document.querySelector('[data-action="update"]').disabled);
      await u.apply();
      await t.test('9. ضغطة ثانية لا ترسل رسالة ثانية', log.posted.length === 1);
      await t.test('10. شبكة الأمان: إن لم يتبدّل الـ controller يُعاد التحميل مرة واحدة',
        log.timers.length === 1 && log.reloads === 0 && (log.timers[0](), log.reloads === 1));
      hideUpdateBanner();
    }

    {
      const { deps, log } = fakeDeps({ getRegistration: async () => ({ waiting: null }) });
      const u = createUpdateOffer(deps);
      await u.apply();
      await t.test('11. لا يوجد worker منتظر: يعيد التحميل مباشرة بلا رسالة', log.reloads === 1 && log.posted.length === 0);
    }

    {
      const { deps, log } = fakeDeps({ getRegistration: async () => { throw new Error('boom'); } });
      const u = createUpdateOffer(deps);
      await u.apply();
      await t.test('12. فشل قراءة التسجيل: لا يعلق (يعيد التحميل)', log.reloads === 1);
    }

    {
      let answer = false;
      const { deps, log } = fakeDeps({ hasOpenDialog: () => true, confirmFn: () => { return answer; } });
      const u = createUpdateOffer(deps);
      u.offer();
      await u.apply();
      const declined = log.posted.length === 0 && !u.state().applying;
      answer = true;
      await u.apply();
      await t.test('13. نافذة مفتوحة: الرفض لا يحدّث ويمكن المحاولة لاحقاً، والموافقة تحدّث',
        declined && log.posted.length === 1);
      hideUpdateBanner();
    }

    {
      const { deps, clock } = fakeDeps();
      const u = createUpdateOffer(deps);
      u.offer();
      u.later();
      const hidden = count() === 0;
      const blocked = u.offer() === false;               /* داخل مهلة «لاحقاً» */
      clock.t += 29 * 60 * 1000;
      const stillBlocked = (await u.remindIfDue()) === false && count() === 0;
      clock.t += 2 * 60 * 1000;                           /* مرّت 31 دقيقة */
      const reshown = (await u.remindIfDue()) === true && count() === 1;
      await t.test('14. «لاحقاً» يخفي الشريط 30 دقيقة ثم يعيده عند العودة للتطبيق',
        hidden && blocked && stillBlocked && reshown);
      hideUpdateBanner();
    }

    {
      const { deps, clock } = fakeDeps({ getRegistration: async () => ({ waiting: null }) });
      const u = createUpdateOffer(deps);
      u.offer(); u.later();
      clock.t += 60 * 60 * 1000;
      await t.test('15. بعد انتهاء المهلة لا يُعاد العرض إن لم يعد هناك تحديث منتظر',
        (await u.remindIfDue()) === false && count() === 0);
    }
  } finally {
    hideUpdateBanner();
  }
});
