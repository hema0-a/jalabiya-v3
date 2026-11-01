/* ==========================================================================
   v3523-sync-access.test.js — وصول دائم لصفحة المزامنة بعد إزالتها من القائمة (v3.5.23)
   ==========================================================================
   main.js مدخل التطبيق ولا يُستورد في الاختبارات؛ لذا نفحص نصه (كما في v3521) ونفحص الأقسام وقت التشغيل.
   ========================================================================== */

import { register } from '../registry.js';
import { createTopbar } from '../../ui/topbar.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';

async function source(rel) {
  const res = await fetch(new URL('../../' + rel, import.meta.url));
  return res.ok ? res.text() : '';
}

register('v3.5.23 وصول المزامنة السحابية', async (t) => {
  const main = await source('main.js');
  const actions = (main.match(/function buildTopbarActions\(\) \{[\s\S]*?\n\}/) || [''])[0];
  await t.test('1. main.js: زر ☁️ في الشريط العلوي يفتح #/cloud-sync وهو آخر الأزرار',
    /id: 'cloud-sync'/.test(main) && /icon: '☁️'/.test(main) && /location\.hash = '#\/cloud-sync'/.test(main) &&
    /buildThemeAction\(\),\s*buildCloudSyncAction\(\),\s*\]/.test(actions));

  const host = document.createElement('div');
  document.body.appendChild(host);
  try {
    let hit = 0;
    const tb = createTopbar({ title: 't', actions: [{ id: 'cloud-sync', icon: '☁️', label: 'المزامنة السحابية', onClick: () => { hit += 1; } }] });
    host.appendChild(tb.node);
    const btn = tb.node.querySelector('[data-action="cloud-sync"]');
    btn.click();
    await t.test('2. الشريط العلوي يرسم الزر بتسميته الصوتية ويستدعي معالجه', !!btn && btn.getAttribute('aria-label') === 'المزامنة السحابية' && hit === 1);
  } finally { host.remove(); }

  const sec = SYSTEM_SECTIONS.find((s) => s.id === 'cloud-sync');
  const sysSrc = await source('pages/settings/sections-system.js');
  await t.test('3. قسم المزامنة في الإعدادات موجود ويحمل رابط صفحة المزامنة في حالتي الدخول والخروج',
    !!sec && (sysSrc.match(/data-action': 'open-cloud-page'/g) || []).length === 2 && (sysSrc.match(/href: '#\/cloud-sync'/g) || []).length === 2);

  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    await sec.render(body, {}, async () => {});
    await t.test('4. رسم القسم لا يُلقي استثناء ويعرض محتوى (تحذير غير مُهيّأ أو نموذج دخول)', body.textContent.length > 10);
  } finally { body.remove(); }
});
