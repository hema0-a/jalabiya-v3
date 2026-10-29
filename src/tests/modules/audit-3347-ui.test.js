/* ==========================================================================
   audit-3347-ui.test.js — شاشة القفل (استرجاع بالحساب) + فلتر «معرَّض للتأخر» (يعمل في المتصفح)
   ========================================================================== */

import { register } from '../registry.js';
import { buildOverlay } from '../../ui/lock-screen.js';
import { filterOrders } from '../../pages/orders.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';

register('audit v3.3.47 lock recovery UI + risk filter', async (t) => {
  const cfg = { ...DEFAULT_SETTINGS, workshop: { name: 'ورشة' }, lockScreen: { ...DEFAULT_SETTINGS.lockScreen } };
  let got = null;
  let ui = buildOverlay(cfg, async () => ({ success: false, attempts: 1 }), null,
    async (e, p) => { got = [e, p]; return { success: false, error: 'كلمة المرور غير صحيحة' }; });
  const q = (sel) => Array.from(ui.node.querySelectorAll(sel));
  const email = q('input').find((i) => i.getAttribute('type') === 'email');
  const pwd = q('input').find((i) => i.getAttribute('aria-label') === 'كلمة مرور حساب المزامنة');
  const cloudBtn = q('button').find((b) => /دخول بالحساب/.test(b.textContent));
  const status = q('div').find((d) => d.getAttribute('role') === 'alert');

  await t.test('1. شاشة القفل فيها حقل بريد وكلمة مرور وزر الاسترجاع وخيار المسح القديم',
    !!email && !!pwd && !!cloudBtn && q('button').some((b) => /مسح بيانات هذا الجهاز/.test(b.textContent)));
  email.value = 'me@x.com'; pwd.value = 'secret';
  cloudBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  await t.test('2. الضغط يمرّر البريد وكلمة المرور ويعرض سبب الفشل',
    got && got[0] === 'me@x.com' && got[1] === 'secret' && /كلمة المرور غير صحيحة/.test(status.textContent) && cloudBtn.disabled === false);
  ui.dispose();

  ui = buildOverlay(cfg, async () => ({ success: false }), null);
  await t.test('3. بلا معالج الاسترجاع: لا حقل بريد (السلوك السابق)',
    !Array.from(ui.node.querySelectorAll('input')).some((i) => i.getAttribute('type') === 'email'));
  ui.dispose();

  const list = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'ready' }, { id: 'c', status: 'pending' }];
  await t.test('4. filterOrders: at_risk بالخريطة، وبدونها فارغ، والفلاتر القديمة كما هي',
    filterOrders(list, 'at_risk', new Map([['a', 1], ['c', 1]])).map((o) => o.id).join() === 'a,c' &&
    filterOrders(list, 'at_risk').length === 0 && filterOrders(list, 'pending').length === 2 && filterOrders(list, 'all').length === 3);
});
