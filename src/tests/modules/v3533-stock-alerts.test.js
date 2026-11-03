/* ==========================================================================
   v3533-stock-alerts.test.js — تنبيه المخزون: وضع، «نفد» منفصل، تكرار التذكير (v3.5.33)
   ========================================================================== */
import { register } from '../registry.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import {
  stockAlertOptions, splitOutOfStock, stockSignature, shouldNotifyStock, filterLowStockForAlerts,
  STOCK_ALERT_MODES, STOCK_REPEAT_MODES,
} from '../../services/alert-rules.js';
import { buildResetPatch } from '../../services/settings-tools.js';
import { DATA_SECTIONS } from '../../pages/settings/sections-data.js';

const items = [
  { id: 'a', name: 'قماش', category: 'fabric', quantity: 0 },
  { id: 'b', name: 'زراير', category: 'accessory', quantity: 2 },
  { id: 'c', name: 'خيط', category: 'accessory', quantity: 0 },
];
const DAY = 24 * 3600 * 1000;

register('v3.5.33 تنبيه المخزون (وضع/نفد/تكرار)', async (t) => {
  const d = DEFAULT_SETTINGS.inventory;
  await t.test('1. الافتراضي = السلوك السابق (all / daily / بلا فصل)', d.alertMode === 'all' && d.repeat === 'daily' && d.separateOutOfStock === false);
  const o0 = stockAlertOptions({});
  await t.test('2. stockAlertOptions: قيم آمنة لإعدادات فارغة/تالفة', o0.mode === 'all' && o0.repeat === 'daily' && o0.separateOut === false && stockAlertOptions(null).mode === 'all'
    && stockAlertOptions({ inventory: { alertMode: 'x', repeat: 'x', separateOutOfStock: 'yes' } }).repeat === 'daily' && stockAlertOptions({ inventory: { separateOutOfStock: 'yes' } }).separateOut === false);
  const o1 = stockAlertOptions({ inventory: { alertMode: 'center', repeat: 'onchange', separateOutOfStock: true } });
  await t.test('3. القيم الصحيحة تُقرأ كما هي', o1.mode === 'center' && o1.repeat === 'onchange' && o1.separateOut === true && STOCK_ALERT_MODES.length === 2 && STOCK_REPEAT_MODES.length === 3);

  const off = splitOutOfStock(items, {});
  await t.test('4. الفصل معطّل: الكل «منخفض» ولا «نفد» (السلوك السابق)', off.low.length === 3 && off.out.length === 0);
  const on = splitOutOfStock(items, { inventory: { separateOutOfStock: true } });
  await t.test('5. الفصل مفعّل: النافد (كمية ≤ 0) منفصل عن المنخفض', on.out.map((i) => i.id).join() === 'a,c' && on.low.map((i) => i.id).join() === 'b');
  await t.test('6. الفصل يحترم مفاتيح القماش/المنتج السابقة (يُفلتر أولاً)',
    splitOutOfStock(filterLowStockForAlerts(items, { inventory: { alertOnFabricLow: false } }), { inventory: { separateOutOfStock: true } }).out.map((i) => i.id).join() === 'c');
  await t.test('7. splitOutOfStock يتحمّل مدخلات غير مصفوفة', splitOutOfStock(null, { inventory: { separateOutOfStock: true } }).out.length === 0);

  await t.test('8. stockSignature: مستقلة عن الترتيب وتتغير بتغيّر المعرّفات فقط',
    stockSignature(items) === stockSignature([...items].reverse()) && stockSignature(items) !== stockSignature(items.slice(1)) && stockSignature([{ id: 'a', quantity: 0 }]) === stockSignature([{ id: 'a', quantity: 9 }]) && stockSignature(null) === '');

  const now = 100 * DAY;
  await t.test('9. أول مرة (بلا سجل سابق): يُرسَل في كل الأوضاع', ['daily', 'weekly', 'onchange'].every((m) => shouldNotifyStock(m, undefined, now, 'x')));
  await t.test('10. أسبوعي: لا قبل 7 أيام ويُرسَل بعدها', !shouldNotifyStock('weekly', { ts: now - 6 * DAY, sig: 'x' }, now, 'y') && shouldNotifyStock('weekly', { ts: now - 7 * DAY, sig: 'x' }, now, 'x'));
  await t.test('11. عند التغيّر: لا إن تطابقت البصمة ويُرسَل إن اختلفت (ولو بعد دقيقة)', !shouldNotifyStock('onchange', { ts: now - 30 * DAY, sig: 'x' }, now, 'x') && shouldNotifyStock('onchange', { ts: now - 60000, sig: 'x' }, now, 'y'));
  await t.test('12. سجل تالف يُعامل كأول مرة', shouldNotifyStock('weekly', { ts: 'bad' }, now, 'x') && shouldNotifyStock('onchange', null, now, 'x'));

  await t.test('13. استرجاع «المخزون والحدود» يُرجع الحقول الجديدة لافتراضيها',
    JSON.stringify(buildResetPatch('inventory-limits', DEFAULT_SETTINGS).inventory) === JSON.stringify(DEFAULT_SETTINGS.inventory) && buildResetPatch('inventory-limits', DEFAULT_SETTINGS).inventory.repeat === 'daily');

  /* --- واجهة القسم --- */
  const sec = DATA_SECTIONS.find((s) => s.id === 'inventory-limits');
  const saves = [];
  const body = document.createElement('div');
  document.body.appendChild(body);
  try {
    await sec.render(body, { inventory: { minThreshold: 5, alertMode: 'center', repeat: 'weekly' } }, (p) => { saves.push(JSON.parse(JSON.stringify(p))); });
    const modes = () => body.querySelectorAll('button[data-stock-mode]');
    const reps = () => body.querySelectorAll('button[data-stock-repeat]');
    await t.test('14. بطاقتا الوضع وثلاث بطاقات للتكرار، والنشط من الإعدادات', modes().length === 2 && reps().length === 3 && body.querySelector('button[data-stock-mode].settings-theme-card--active').dataset.stockMode === 'center' && body.querySelector('button[data-stock-repeat].settings-theme-card--active').dataset.stockRepeat === 'weekly');
    modes()[0].click(); reps()[2].click();
    await t.test('15. الضغط يحفظ حقلاً واحداً ويُحدّث التمييز (واحد نشط لكل مجموعة)',
      JSON.stringify(saves[0]) === JSON.stringify({ inventory: { alertMode: 'all' } }) && JSON.stringify(saves[1]) === JSON.stringify({ inventory: { repeat: 'onchange' } })
      && body.querySelectorAll('button[data-stock-mode].settings-theme-card--active').length === 1 && body.querySelector('button[data-stock-repeat].settings-theme-card--active').dataset.stockRepeat === 'onchange');
    await t.test('16. مفاتيح التنبيه الثلاثة موجودة (قماش + منتج + «نفد»)', body.querySelectorAll('.settings-row').length >= 3 && body.textContent.includes('تنبيه «نفد» منفصل'));
    const defaultsRender = document.createElement('div');
    await sec.render(defaultsRender, {}, () => {});
    await t.test('17. بلا إعدادات محفوظة: الوضع all والتكرار daily نشطان', defaultsRender.querySelector('button[data-stock-mode].settings-theme-card--active').dataset.stockMode === 'all' && defaultsRender.querySelector('button[data-stock-repeat].settings-theme-card--active').dataset.stockRepeat === 'daily');
  } finally { body.remove(); }
});
