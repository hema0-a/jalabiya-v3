/* ==========================================================================
   quick-preview-catalog.js — مشاركة كتالوج الأسعار (v3.5.7)
   ==========================================================================
   مقتطع من quick-preview.js دون تغيير منطق: نافذة اختيار الأنواع ونص قابل للتعديل ثم واتساب / صور / صفحة / نسخ.
   يستورد quick-preview-helpers فقط. الواجهة العامة: shareCatalog.
   ========================================================================== */

import { shareCatalogPage } from './catalog-page-share.js';
import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { formatEGP } from '../core/utils.js';
import { settings as settingsRepo } from '../data/repos/settings.js';
import { portfolio as portfolioRepo } from '../data/repos/portfolio.js';
import { _whatsapp, _closeAction } from './quick-preview-helpers.js';

/* ============================================================
   كتالوج الأسعار للمشاركة (v3.3.51)
   ============================================================ */

/**
 * نافذة مشاركة كتالوج الأسعار: اختيار الأنواع، نص قابل للتعديل، ثم واتساب أو نسخ.
 * @param {Object} [opts]
 * @param {string} [opts.phone] — رقم العميل (لو غير مُمرَّر يفتح واتساب لاختيار جهة اتصال)
 * @param {string} [opts.customerName]
 * @param {Array}  [opts.types] — أنواع الجلابيب (لو غير مُمرَّرة تُقرأ من الإعدادات)
 * @returns {Promise<void>}
 */
export async function shareCatalog(opts = {}) {
  let st = {};
  try { st = await settingsRepo.get(); } catch { st = {}; }
  const ws = (st && st.workshop) || {};
  const all = (Array.isArray(opts.types) ? opts.types : (st.jalabiyaTypes || []))
    .filter((t) => t && t.name && Number(t.price) > 0);

  if (all.length === 0) {
    modal.open({
      title: '📋 كتالوج الأسعار',
      body: el('p', { style: { fontSize: '13px', color: '#666', lineHeight: '1.6' } },
        'لا توجد أنواع بأسعار. أضفها من الإعدادات ← أنواع الجلابيات (الاسم والسعر)، ثم ارجع هنا.'),
      actions: [_closeAction()], closable: true,
    });
    return;
  }

  /* صور الأنواع المربوطة بمعرض الأعمال */
  const picById = new Map();
  try {
    const items = await portfolioRepo.list();
    items.forEach((it) => { if (it && it.id) picById.set(it.id, it); });
  } catch { /* بدون صور */ }
  const picOf = (t) => (t.portfolioId && picById.get(t.portfolioId)) || null;

  const checks = [];
  const area = el('textarea', {
    className: 'textarea', rows: '10',
    style: { width: '100%', fontSize: '13px', lineHeight: '1.7', marginTop: '8px' },
  });

  function build() {
    const lines = [];
    lines.push((opts.customerName ? 'أهلاً ' + opts.customerName + '،\n' : '') +
      '*' + (ws.name || 'ورشة الجلابيب') + '*');
    lines.push('أسعار الجلابيب:');
    checks.forEach(({ cb, t }) => {
      if (cb.checked) lines.push('• ' + t.name + ' — ' + formatEGP(t.price));
    });
    if (ws.pickupHours) lines.push('🕐 مواعيد الاستلام: ' + ws.pickupHours);
    if (ws.phone) lines.push('📞 ' + ws.phone);
    if (ws.address) lines.push('📍 ' + ws.address);
    area.value = lines.join('\n');
  }

  const list = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' },
  });
  all.forEach((t) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = true;
    cb.addEventListener('change', build);
    checks.push({ cb, t });
    list.appendChild(el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '4px 0' },
    }, [cb,
      picOf(t) ? el('img', { src: picOf(t).thumbnail || picOf(t).image, alt: '',
        style: { width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: '0' } }) : null,
      el('span', { style: { flex: '1' } }, t.name),
      el('span', { style: { color: '#B8863B', fontWeight: '600' } }, formatEGP(t.price))].filter(Boolean)));
  });

  const body = el('div', {}, [
    el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '6px' } },
      'اختر الأنواع اللي تظهر للعميل (تغيير الاختيار يعيد كتابة النص):'),
    list,
    area,
  ]);
  build();

  const actions = [
    { text: '📱 واتساب', variant: 'primary',
      onClick: () => {
        const text = area.value;
        if (opts.phone) { _whatsapp(opts.phone, text); return; }
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
      } },
    checks.some(({ t }) => picOf(t)) ? { text: '🖼️ مشاركة بالصور', variant: 'secondary',
      onClick: async () => {
        /* مشاركة النظام (Web Share) هي الطريقة الوحيدة لإرفاق صور بواتساب؛ تُرسل الصور مع النص لأي تطبيق/جهة تختارها */
        const chosen = checks.filter(({ cb, t }) => cb.checked && picOf(t)).slice(0, 10);
        try {
          const files = [];
          for (const { t } of chosen) {
            const it = picOf(t);
            const blob = await (await fetch(it.image || it.thumbnail)).blob();
            const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
            files.push(new File([blob], (t.name || 'jalabiya') + '.' + ext, { type: blob.type || 'image/jpeg' }));
          }
          if (files.length && navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({ files, text: area.value });
            return;
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return;   /* المستخدم ألغى المشاركة */
          console.warn('[catalog share]', e);
        }
        /* المتصفح لا يدعم مشاركة الملفات: نرجع لنص واتساب */
        if (opts.phone) _whatsapp(opts.phone, area.value);
        else window.open('https://wa.me/?text=' + encodeURIComponent(area.value), '_blank', 'noopener,noreferrer');
      } } : null,
    { text: '📄 صفحة كتالوج', variant: 'secondary', action: 'catalog-page',
      onClick: () => shareCatalogPage({
        ws,
        entries: checks.filter(({ cb }) => cb.checked).map(({ t }) => {
          const p = picOf(t);
          return { name: t.name, price: t.price, src: p ? (p.thumbnail || p.image) : '' };
        }),
      }) },
    { text: '📋 نسخ', variant: 'secondary',
      onClick: async () => {
        try { await navigator.clipboard.writeText(area.value); }
        catch { area.select(); try { document.execCommand('copy'); } catch { /* ignore */ } }
      } },
    _closeAction(),
  ].filter(Boolean);
  modal.open({ title: '📋 كتالوج الأسعار', body, actions, closable: true, variant: 'sheet' });
}
