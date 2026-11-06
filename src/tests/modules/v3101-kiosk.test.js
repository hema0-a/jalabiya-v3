/* ==========================================================================
   v3101-kiosk.test.js — وضع الكشك (v3.10.1)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS, STORAGE_KEYS as K } from '../../core/config.js';
import { SETTINGS_SYNC_KEYS } from '../../sync/settings-sync.js';
import {
  normalizeKiosk, canEnterKiosk, kioskStats, pickSlides, nextSlide, exitAttemptState, failureLockUntil, registerTap,
  MAX_MESSAGE, MAX_SLIDES, EXIT_MAX_FAILS, EXIT_LOCK_SECONDS, EXIT_TAPS,
} from '../../services/kiosk.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const NOW = new Date(2026, 10, 6, 14, 0);
const at = (h) => new Date(2026, 10, 6, h).getTime();

register('v3.10.1 وضع الكشك', async (t) => {
  await t.test('1. الافتراضيات ومفتاح التخزين، ولا مزامنة (تفضيل الجهاز)', DEFAULT_SETTINGS.kiosk.showStats === true && DEFAULT_SETTINGS.kiosk.message === '' && typeof K.V3_KIOSK === 'string' && !SETTINGS_SYNC_KEYS.includes('kiosk'));
  await t.test('2. normalizeKiosk: قصّ الرسالة وقيم افتراضية', normalizeKiosk(null).showContact === true && normalizeKiosk({ message: 'x'.repeat(500) }).message.length === MAX_MESSAGE
    && normalizeKiosk({ showStats: 'no' }).showStats === true && normalizeKiosk({ showStats: false }).showStats === false && normalizeKiosk({ message: ' a \n b ' }).message === 'a b');
  await t.test('3. لا كشك بلا رقم مالك', canEnterKiosk(true) === true && canEnterKiosk(false) === false && canEnterKiosk(undefined) === false);
  await t.test('4. kioskStats: قيد التنفيذ والمسلَّم اليوم فقط', (() => {
    const o = [{ status: 'new' }, { status: 'in_progress' }, { status: 'cancelled' }, { status: 'delivered', deliveredAt: at(9) }, { status: 'delivered', deliveredAt: at(9) - 86400000 }, null];
    const s = kioskStats(o, NOW); return s.active === 2 && s.deliveredToday === 1;
  })());
  await t.test('5. kioskStats: مدخلات فاسدة', kioskStats(null).active === 0 && kioskStats([{ status: 'delivered' }], NOW).deliveredToday === 0);
  await t.test('6. pickSlides: صور فقط، الأحدث أولاً، حد أقصى', (() => {
    const items = [{ id: 'a', image: 'data:image/png;base64,AA', createdAt: 1 }, { id: 'b', image: 'http://x/y.png', createdAt: 9 }, { id: 'c', image: 'data:image/png;base64,BB', createdAt: 5, title: 't' }];
    const r = pickSlides(items); const many = Array.from({ length: 30 }, (_, i) => ({ id: 'i' + i, image: 'data:image/png;base64,A', createdAt: i }));
    return r.length === 2 && r[0].id === 'c' && pickSlides(many).length === MAX_SLIDES && pickSlides(null).length === 0;
  })());
  await t.test('7. nextSlide دوري', nextSlide(0, 3) === 1 && nextSlide(2, 3) === 0 && nextSlide(0, 0) === 0);
  await t.test('8. محاولات الخروج: قفل بعد الحد ثم يُفتح', (() => {
    const now = 1000000; const lu = failureLockUntil(EXIT_MAX_FAILS, now);
    return failureLockUntil(EXIT_MAX_FAILS - 1, now) === 0 && lu === now + EXIT_LOCK_SECONDS * 1000
      && exitAttemptState(5, lu, now + 1000).locked === true && exitAttemptState(5, lu, now + 1000).remainingSec === EXIT_LOCK_SECONDS - 1
      && exitAttemptState(5, lu, lu + 1).locked === false && exitAttemptState(5, lu, lu + 1).fails === 0 && exitAttemptState(2, 0, now).fails === 2;
  })());
  await t.test('9. النقرات الثلاث على الشعار ضمن النافذة فقط', (() => {
    let r = { taps: [] }; for (let i = 0; i < EXIT_TAPS - 1; i++) r = registerTap(r.taps, 1000 + i * 100);
    const ok = registerTap(r.taps, 1300).triggered === true;
    const slow = registerTap(registerTap(registerTap([], 1000).taps, 5000).taps, 9000).triggered === false;
    return ok && slow;
  })());

  const kiosk = await src('ui/kiosk.js'); const ks = await src('ui/kiosk-settings.js'); const sec = await src('pages/settings/sections-security.js'); const main = await src('main.js');
  await t.test('10. الخروج برقم المالك فقط (لا matchStaffPin)', /V3_PIN_HASH/.test(kiosk) && !/matchStaffPin|V3_MGR|V3_RECV/.test(kiosk));
  await t.test('11. التطبيق خلف الكشك inert ويُعاد عند الخروج', /setAttribute\('inert'/.test(kiosk) && /removeAttribute\('inert'/.test(kiosk));
  await t.test('12. لا innerHTML في ملفات الكشك', ![kiosk, ks].some((s) => /innerHTML\s*=/.test(s)));
  await t.test('13. لا مبالغ ولا أسماء عملاء في شاشة الكشك', !/repos\/customers|repos\/payments|totalPrice|\.amount|\.remaining\b|\.deposit/.test(kiosk.replace(/\/\*[\s\S]*?\*\//g, '')));
  await t.test('14. التوصيل: الإعدادات وإعادة التشغيل', /buildKioskPanel/.test(sec) && /restoreKiosk/.test(main) && /jalabiya_v3_kiosk_active/.test(main));
  await t.test('15. المفتاح في main.js يطابق config', /jalabiya_v3_kiosk_active/.test(K.V3_KIOSK));
});
