/* ==========================================================================
   v341-media-migration-ui.test.js — بطاقة ترحيل الوسائط في صيانة البيانات (v3.4.1)
   ========================================================================== */

import { register } from '../registry.js';
import { clear } from '../../core/dom.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';
import { mediaId } from '../../services/order-media.js';
import { dataCarePage } from '../../pages/data-care.js';
import { buildMediaMigrationCard, cancelMediaMigration, _resetMigrationUiForTest } from '../../ui/media-migration-card.js';
import { _resetForTest } from '../../services/media-migration.js';

const SIG = 'data:image/png;base64,' + 'QUJD'.repeat(3000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const find = (root, sel) => root.querySelector(sel);
async function waitFor(fn, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); } return false; }

register('v3.4.1 media migration card (UI)', async (t) => {
  _resetForTest(); _resetMigrationUiForTest();
  const ids = ['t341u1', 't341u2'];
  const recs = ids.map((id, i) => ({ id, customerId: 'cx341', status: 'pending', amount: 300, createdAt: 1, updatedAt: 1, items: [], signature: SIG + i }));
  for (const r of recs) await idb.put(STORES.ORDERS, r);
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    const card = buildMediaMigrationCard();
    box.appendChild(card);
    t.test('1. البطاقة تُرسم بزر الفحص فقط في البداية', !!find(card, '[data-action="mm-scan"]') && !find(card, '[data-action="mm-start"]') && card.textContent.includes('ترحيل الوسائط القديمة'));

    find(card, '[data-action="mm-scan"]').click();
    const shown = await waitFor(() => !!find(card, '[data-action="mm-start"]') || card.textContent.includes('لا شيء للترحيل'));
    t.test('2. بعد الفحص: الأرقام وزر البدء وشروط الجاهزية', shown && card.textContent.includes('طلبات فيها وسائط مضمَّنة') && !!find(card, '[data-action="mm-start"]'));
    const checks = [...card.querySelectorAll('[data-check]')].map((n) => n.getAttribute('data-check'));
    t.test('3. شروط الجاهزية معروضة بالأسباب (مزامنة/مساحة/حارس/مخزن/نسخة)', ['sync', 'storage', 'gate', 'store', 'backup'].every((c) => checks.includes(c)));
    t.test('4. المسح للقراءة فقط: السجلات لم تتغيّر', (await idb.get(STORES.ORDERS, 't341u1')).signature === SIG + '0');

    /* إعادة بناء البطاقة (كما تفعل صفحة الصيانة عند التحديث) لا تفقد حالة المسح */
    clear(box);
    const again = buildMediaMigrationCard();
    box.appendChild(again);
    t.test('5. إعادة بناء البطاقة تحافظ على نتيجة المسح (الحالة على مستوى الوحدة)', again.textContent.includes('طلبات فيها وسائط مضمَّنة'));

    /* الصفحة تحمل البطاقة، وتغادرها فتوقف ما يعمل */
    const page = document.createElement('div');
    document.body.appendChild(page);
    await dataCarePage.render(page);
    t.test('6. صفحة صيانة البيانات تعرض بطاقة الترحيل', !!find(page, '[data-role="media-migration"]'));
    dataCarePage.destroy();
    page.remove();
    cancelMediaMigration();
    t.test('7. الإيقاف لا يغيّر البيانات', (await idb.get(STORES.ORDERS, 't341u2')).signature === SIG + '1');
  } finally {
    box.remove();
    _resetMigrationUiForTest(); _resetForTest();
    for (const id of ids) { try { await idb.remove(STORES.ORDERS, id); await idb.remove(STORES.ORDER_MEDIA, mediaId(id, 'sig')); } catch (e) { /* ignore */ } }
  }
});
