/* ==========================================================================
   catalog-page-share.js — مشاركة الكتالوج كصفحة HTML (v3.3.66)
   ========================================================================== */

import { toast } from './toast.js';
import { buildCatalogHtml, catalogFileName, MAX_CATALOG_ITEMS } from '../services/catalog-page.js';

async function toDataUrl(src) {
  if (!src) return '';
  if (String(src).startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * @param {{ws:Object, entries:Array<{name:string, price:number, src?:string}>}} p
 * @returns {Promise<'shared'|'downloaded'|'cancelled'|'empty'>}
 */
export async function shareCatalogPage({ ws = {}, entries = [] } = {}) {
  const chosen = entries.filter((e) => e && e.name && Number(e.price) > 0).slice(0, MAX_CATALOG_ITEMS);
  if (!chosen.length) { toast.warning('اختر صنفاً واحداً على الأقل'); return 'empty'; }
  const items = [];
  for (const e of chosen) {
    let image = '';
    try { image = await toDataUrl(e.src); } catch { image = ''; }
    items.push({ name: e.name, price: e.price, image });
  }
  const html = buildCatalogHtml({ workshop: ws, items });
  const name = catalogFileName(ws);
  const file = new File([html], name, { type: 'text/html' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: (ws.name || 'الكتالوج') + ' — كتالوج الأسعار' });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast.info('حُفظ ملف الكتالوج — أرسله للعميل من واتساب كمرفق');
  return 'downloaded';
}
