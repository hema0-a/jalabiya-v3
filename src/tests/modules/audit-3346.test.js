/* ==========================================================================
   audit-3346.test.js — قائمة بنود الطلب المنسدلة (item-catalog)
   ========================================================================== */

import { register } from '../registry.js';
import { normalizeItemName, buildItemCatalog, findInCatalog } from '../../services/item-catalog.js';

const ord = (createdAt, items, status = 'pending') => ({ id: 'o' + createdAt, createdAt, status, items });

register('audit v3.3.46 item catalog', async (t) => {
  await t.test('1. التوحيد: مسافات/تشكيل/ة↔ه/أ↔ا تعطي المفتاح نفسه',
    normalizeItemName('  جَلابيـة   سادة ') === normalizeItemName('جلابيه سادة') &&
    normalizeItemName('أبيض') === normalizeItemName('ابيض') && normalizeItemName(null) === '');

  const types = [{ name: 'جلابية سادة', price: 500 }, { name: 'جلابية مطرزة', price: 0 }, { name: 'جلابية سادة', price: 999 }];
  const orders = [
    ord(1, [{ name: 'جلابية مطرزة', price: 800 }, { name: 'طاقية', price: 30 }]),
    ord(2, [{ name: 'طاقية', price: 40 }, { name: 'عباية', price: 900 }]),
    ord(3, [{ name: 'طاقية', price: 50 }]),
    ord(4, [{ name: 'بند', price: 10 }, { name: '', price: 5 }]),
    ord(5, [{ name: 'شال', price: 70 }], 'cancelled'),
  ];
  const c = buildItemCatalog(types, orders);

  await t.test('2. أنواع الإعدادات أولاً بترتيبها وبلا تكرار', c[0].name === 'جلابية سادة' && c[0].price === 500 && c[0].source === 'type' && c.filter((x) => x.name === 'جلابية سادة').length === 1);
  await t.test('3. نوع بلا سعر في الإعدادات يأخذ آخر سعر من الطلبات', c[1].name === 'جلابية مطرزة' && c[1].price === 800 && c[1].source === 'type');
  await t.test('4. الأسماء السابقة بعد الأنواع، الأكثر استخداماً أولاً وبآخر سعر',
    c[2].name === 'طاقية' && c[2].price === 50 && c[2].count === 3 && c[2].source === 'history' && c[3].name === 'عباية');
  await t.test('5. يستبعد الملغى و«بند» والفارغ', !c.some((x) => x.name === 'شال' || x.name === 'بند' || x.name === ''));
  await t.test('6. حد أقصى لأسماء السابق: maxHistory=1 يُبقي أكثرها استخداماً فقط', (() => { const r = buildItemCatalog([], orders, { maxHistory: 1 }); return r.length === 1 && r[0].name === 'طاقية'; })());
  await t.test('7. بيانات ناقصة/غير صالحة لا تُسقط الدالة',
    buildItemCatalog(null, null).length === 0 && buildItemCatalog([{ name: '' }, null], [null, { items: 'x' }, { status: 'pending' }]).length === 0);
  await t.test('8. findInCatalog يطابق بالتوحيد ويعيد null لغير الموجود',
    findInCatalog(c, 'جلابيه  سادة').price === 500 && findInCatalog(c, 'غير موجود') === null && findInCatalog(c, '') === null);
  await t.test('9. اسم مكتوب بصيغتين يُدمج وتبقى آخر صيغة',
    (() => { const r = buildItemCatalog([], [ord(1, [{ name: 'جلابية', price: 1 }]), ord(2, [{ name: 'جلابيه', price: 2 }])]); return r.length === 1 && r[0].name === 'جلابيه' && r[0].price === 2 && r[0].count === 2; })());
});
