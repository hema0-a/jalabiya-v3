/* ==========================================================================
   catalog-page.js — كتالوج الأسعار كصفحة HTML واحدة قابلة للمشاركة (v3.3.66)
   ==========================================================================
   ملف واحد مكتفٍ بذاته (صور مضمّنة، بلا اتصال ولا مكتبات) يفتحه العميل في متصفحه
   من واتساب أو التنزيلات. دالة نقية: تأخذ البيانات وتُرجع نص HTML.
   ========================================================================== */

import { formatEGP, normalizePhone } from '../core/utils.js';

export const MAX_CATALOG_ITEMS = 24;
const IMG_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const waDigits = (phone) => String(normalizePhone(phone) || '').replace(/\D/g, '');

/**
 * @param {{workshop?:Object, items:Array<{name:string, price:number, image?:string}>, now?:number}} p
 * @returns {string}
 */
export function buildCatalogHtml({ workshop = {}, items = [], now = Date.now() } = {}) {
  const ws = workshop || {};
  const list = (Array.isArray(items) ? items : []).filter((i) => i && i.name && Number(i.price) > 0).slice(0, MAX_CATALOG_ITEMS);
  const name = ws.name || 'ورشة الجلابيب';
  const phone = ws.whatsapp || ws.phone || '';
  const wa = waDigits(phone);
  const cards = list.map((i) => {
    const img = typeof i.image === 'string' && IMG_RE.test(i.image) ? '<img src="' + i.image + '" alt="' + esc(i.name) + '" loading="lazy">' : '<div class="ph" aria-hidden="true">🧵</div>';
    return '<article class="card">' + img + '<h2>' + esc(i.name) + '</h2><p class="price">' + esc(formatEGP(i.price)) + '</p></article>';
  }).join('');
  const info = [
    ws.pickupHours ? '<p>🕐 مواعيد الاستلام: ' + esc(ws.pickupHours) + '</p>' : '',
    ws.address ? '<p>📍 ' + esc(ws.address) + '</p>' : '',
    phone ? '<p>📞 <a href="tel:' + esc(String(phone).replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a></p>' : '',
  ].join('');
  const date = new Date(now).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(name) + ' — كتالوج الأسعار</title><style>' +
    ':root{--g:#1F6D57;--gold:#B8863B;--bg:#F6F1E6;--ink:#123C2F}*{box-sizing:border-box}' +
    'body{margin:0;font-family:"IBM Plex Sans Arabic",Tahoma,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}' +
    'header{background:var(--g);color:#fff;padding:24px 16px;text-align:center}header h1{margin:0;font-size:26px}header p{margin:4px 0 0;opacity:.85}' +
    'main{max-width:900px;margin:0 auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}' +
    '.card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);text-align:center;padding-bottom:12px}' +
    '.card img,.ph{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}.ph{display:flex;align-items:center;justify-content:center;font-size:48px;background:#EFE7D6}' +
    '.card h2{font-size:16px;margin:10px 8px 2px}.price{margin:0;color:var(--gold);font-weight:700;font-size:18px}' +
    'footer{max-width:900px;margin:0 auto;padding:8px 16px 32px;text-align:center}footer a{color:var(--g)}' +
    '.wa{display:inline-block;margin:12px 0;padding:12px 28px;background:#25D366;color:#fff;border-radius:999px;text-decoration:none;font-weight:700}' +
    '.date{font-size:12px;opacity:.6}@media print{.wa{display:none}}' +
    '</style></head><body><header><h1>' + esc(name) + '</h1><p>كتالوج الأسعار</p></header><main>' +
    (cards || '<p>لا توجد أصناف حالياً.</p>') + '</main><footer>' + info +
    (wa ? '<a class="wa" href="https://wa.me/' + wa + '">💬 تواصل معنا على واتساب</a>' : '') +
    '<p class="date">آخر تحديث: ' + esc(date) + '</p></footer></body></html>';
}

export function catalogFileName(workshop = {}, now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return 'catalog-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.html';
}
