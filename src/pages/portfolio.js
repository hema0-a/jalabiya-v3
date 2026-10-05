/* ==========================================================================
   portfolio.js — صفحة معرض الأعمال
   ==========================================================================
   - 8 فئات + ربط اختياري بعميل + تاريخ تلقائي.
   - ضغط تلقائي + thumbnails + lazy loading.
   - مشاركة WhatsApp + حفظ الصورة + حماية من الصور المكرّرة.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { portfolio } from '../data/repos/portfolio.js';
import { customers } from '../data/repos/customers.js';
import { compress, generateThumbnail, hashImage } from '../services/image-compressor.js';
import { PORTFOLIO_CATEGORIES, LIMITS } from '../core/config.js';
import { formatEGP, formatDate } from '../core/utils.js';

/* --- الحالة --- */
let state = {
  container: null,
  items: [],
  customers: [],
  customerMap: {},
  activeCategory: 'all',
  searchQuery: '',
};

const CAT_MAP = {};
PORTFOLIO_CATEGORIES.forEach((c) => { CAT_MAP[c.id] = c; });

/* ==========================================================================
   1. تصفية (مُصدَّرة للاختبار)
   ========================================================================== */

/**
 * تصفية القائمة (فئة + بحث).
 * @param {Array} list
 * @param {string} category
 * @param {string} query
 * @returns {Array}
 */
export function filterPortfolio(list, category, query) {
  let result = list;
  if (category && category !== 'all') {
    result = result.filter((p) => (p.category || 'other') === category);
  }
  const q = String(query ?? '').trim().toLowerCase();
  if (q) {
    result = result.filter((p) =>
      String(p.title || '').toLowerCase().includes(q) ||
      String(p.note || '').toLowerCase().includes(q)
    );
  }
  return result;
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [items, custList] = await Promise.all([
    portfolio.list(),
    customers.list(),
  ]);
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.items = items;
  state.customers = custList;
  state.customerMap = {};
  custList.forEach((c) => { state.customerMap[c.id] = c; });
}

/* ==========================================================================
   3. نموذج الإضافة
   ========================================================================== */

function openAddForm() {
  /* معاينة الصورة */
  const preview = el('div', {
    style: {
      width: '100%', height: '200px', borderRadius: '12px',
      background: '#F6F1E6', border: '2px dashed #E5DDD0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '36px', color: '#2E8B6F', marginBottom: '8px',
    },
  }, '📷');

  const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

  let compressedData = null;
  let thumbnailData = null;
  let imageHash = null;

  const compressInfo = el('div', {
    style: { fontSize: '12px', color: '#2E8B6F', marginBottom: '8px', display: 'none' },
  });

  /* زر اختيار الصورة */
  const chooseBtn = el('button', {
    className: 'btn btn--secondary btn--block', type: 'button',
    onClick: () => fileInput.click(),
  }, '📁 اختر صورة');

  /* معالجة الملف */
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    chooseBtn.disabled = true;
    chooseBtn.textContent = '⏳ جارٍ المعالجة...';
    try {
      /* hash للتحقق من التكرار */
      imageHash = await hashImage(file);
      const dup = await portfolio.findByHash(imageHash);
      if (dup) {
        toast.warning('هذه الصورة موجودة مسبقاً');
        chooseBtn.disabled = false;
        chooseBtn.textContent = '📁 اختر صورة';
        return;
      }

      const result = await compress(file);
      const thumb = await generateThumbnail(file);
      compressedData = result.dataUrl;
      thumbnailData = thumb;

      preview.textContent = '';
      preview.style.background = 'url(' + result.dataUrl + ') center/cover';
      preview.style.border = 'none';

      compressInfo.style.display = 'block';
      compressInfo.textContent = '✅ ' + result.sizeKB + ' KB · ' +
        (result.savedPercent > 0 ? 'توفير ' + result.savedPercent + '%' : 'بدون ضغط') +
        ' · ' + result.width + '×' + result.height;
    } catch (e) {
      toast.danger(e.message || 'فشل معالجة الصورة');
    }
    chooseBtn.disabled = false;
    chooseBtn.textContent = '📁 تغيير الصورة';
  });

  /* الحقول */
  const titleInput = el('input', { className: 'input', type: 'text', placeholder: 'مثال: جلابية سادة رجالي' });

  const categorySelect = el('select', { className: 'select' });
  categorySelect.appendChild(el('option', { value: '' }, '— اختر فئة —'));
  PORTFOLIO_CATEGORIES.forEach((c) => {
    categorySelect.appendChild(el('option', { value: c.id }, c.icon + ' ' + c.label));
  });

  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— بدون عميل —'));
  state.customers.forEach((c) => {
    customerSelect.appendChild(el('option', { value: c.id }, c.name));
  });

  const priceInput = el('input', { className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01' });

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const body = el('div', {}, [
    preview,
    chooseBtn,
    fileInput,
    compressInfo,
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'عنوان الصورة *'), titleInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التصنيف *'), categorySelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العميل (اختياري)'), customerSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'السعر المرجعي (اختياري)'), priceInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: '📸 إضافة صورة للمعرض',
    body,
    closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: async () => {
          if (!compressedData) return toast.warning('اختر صورة أولاً');
          const title = titleInput.value.trim();
          if (!title) return toast.warning('العنوان مطلوب');
          if (!categorySelect.value) return toast.warning('اختر فئة');

          try {
            await portfolio.create({
              title,
              category: categorySelect.value,
              customerId: customerSelect.value || null,
              price: Number(priceInput.value) || 0,
              note: noteInput.value.trim(),
              image: compressedData,
              thumbnail: thumbnailData,
              hash: imageHash,
            });
            toast.success('تمت الإضافة');
            handle.close();
            await refreshAll();
          } catch (e) {
            toast.danger('فشل: ' + e.message);
          }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. تفاصيل + تعديل + حذف
   ========================================================================== */

function openDetail(item) {
  const cat = CAT_MAP[item.category] || CAT_MAP.other;
  const customer = item.customerId ? state.customerMap[item.customerId] : null;

  const img = el('img', {
    src: item.image,
    style: { width: '100%', borderRadius: '12px', marginBottom: '12px' },
    alt: item.title,
  });

  const info = el('div', {}, [
    el('div', { style: { fontSize: '18px', fontWeight: '600', color: '#123C2F', marginBottom: '8px' } }, item.title),
    el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, cat.icon + ' ' + cat.label),
    customer ? el('div', { style: { fontSize: '13px', color: '#666', marginBottom: '4px' } }, '👤 ' + customer.name) : null,
    item.price ? el('div', { style: { fontSize: '14px', color: '#B8863B', fontWeight: '600', marginBottom: '4px' } }, '💰 ' + formatEGP(item.price)) : null,
    item.createdAt ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, '📅 ' + formatDate(item.createdAt)) : null,
    item.note ? el('div', { style: { fontSize: '13px', color: '#666', marginTop: '8px', lineHeight: '1.5' } }, item.note) : null,
  ]);

  const actions = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' } }, [
    el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      onClick: () => {
        const text = '🌟 من ورشة تفصيل الجلابيب\n\n' +
          item.title + '\n' +
          cat.icon + ' ' + cat.label +
          (item.price ? '\n💰 السعر: ' + formatEGP(item.price) : '') +
          (item.note ? '\n📝 ' + item.note : '') +
          '\n\nللتواصل والطلب يرجى مراسلتنا 🌹';
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      },
    }, '📱 مشاركة واتساب'),
    el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      onClick: () => {
        const a = document.createElement('a');
        a.href = item.image;
        a.download = 'jalabiya-' + item.id + '.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
    }, '⬇️ حفظ الصورة'),
    el('button', {
      className: 'btn btn--ghost btn--block', type: 'button',
      onClick: () => {
        handle.close();
        openEditForm(item);
      },
    }, '✏️ تعديل'),
    el('button', {
      className: 'btn btn--danger btn--block', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف صورة',
          message: 'حذف "' + item.title + '" نهائياً؟',
          confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try {
          await portfolio.remove(item.id);
          toast.success('تم الحذف');
          handle.close();
          await refreshAll();
        } catch (e) { toast.danger('فشل: ' + e.message); }
      },
    }, '🗑️ حذف'),
  ]);

  const handle = modal.open({
    title: 'تفاصيل العمل',
    body: el('div', {}, [img, info, actions]),
    closable: true,
  });
}

function openEditForm(item) {
  const titleInput = el('input', { className: 'input', type: 'text', value: item.title || '' });

  const categorySelect = el('select', { className: 'select' });
  PORTFOLIO_CATEGORIES.forEach((c) => {
    const o = el('option', { value: c.id }, c.icon + ' ' + c.label);
    if (c.id === item.category) o.selected = true;
    categorySelect.appendChild(o);
  });

  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— بدون عميل —'));
  state.customers.forEach((c) => {
    const o = el('option', { value: c.id }, c.name);
    if (c.id === item.customerId) o.selected = true;
    customerSelect.appendChild(o);
  });

  const priceInput = el('input', { className: 'input', type: 'number', min: '0', step: '0.01' });
  priceInput.value = item.price || '';

  const noteInput = el('textarea', { className: 'textarea' });
  noteInput.value = item.note || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العنوان *'), titleInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التصنيف'), categorySelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العميل'), customerSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'السعر'), priceInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: 'تعديل عمل',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: async () => {
          const title = titleInput.value.trim();
          if (!title) return toast.warning('العنوان مطلوب');
          try {
            await portfolio.update(item.id, {
              title,
              category: categorySelect.value,
              customerId: customerSelect.value || null,
              price: Number(priceInput.value) || 0,
              note: noteInput.value.trim(),
            });
            toast.success('تم الحفظ');
            handle.close();
            await refreshAll();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   5. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#pf-stats');
  if (!wrap) return;
  clear(wrap);

  const total = state.items.length;
  const cats = new Set(state.items.map((p) => p.category || 'other')).size;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📷'),
    el('span', { className: 'stat__value' }, String(total)),
    el('span', { className: 'stat__label' }, 'صورة'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🏷️'),
    el('span', { className: 'stat__value' }, String(cats)),
    el('span', { className: 'stat__label' }, 'تصنيف'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#pf-filters');
  if (!wrap) return;
  clear(wrap);

  const all = [{ id: 'all', label: 'الكل', icon: '📁' }, ...PORTFOLIO_CATEGORIES];
  all.forEach((c) => {
    const active = state.activeCategory === c.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      'data-cat': c.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => { state.activeCategory = c.id; renderFilters(); renderGrid(); },
    }, c.icon + ' ' + c.label));
  });
}

function buildCard(item) {
  const cat = CAT_MAP[item.category] || CAT_MAP.other;
  const thumbSrc = item.thumbnail || item.image;

  const card = el('div', {
    className: 'card',
    style: { padding: '0', overflow: 'hidden', cursor: 'pointer', marginBottom: '0' },
    'data-id': item.id,
    onClick: () => openDetail(item),
  });

  card.appendChild(el('img', {
    src: thumbSrc,
    loading: 'lazy',
    alt: item.title,
    style: { width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' },
  }));

  const info = el('div', { style: { padding: '8px' } }, [
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#123C2F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, item.title),
    el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } }, cat.icon + ' ' + cat.label),
  ]);
  if (item.price) {
    info.appendChild(el('div', { style: { fontSize: '12px', color: '#B8863B', fontWeight: '600', marginTop: '2px' } }, formatEGP(item.price)));
  }
  card.appendChild(info);

  return card;
}

function renderGrid() {
  const wrap = state.container?.querySelector('#pf-grid');
  if (!wrap) return;
  clear(wrap);

  const filtered = filterPortfolio(state.items, state.activeCategory, state.searchQuery);

  if (filtered.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state', style: { gridColumn: '1/-1' } }, [
      el('div', { className: 'empty-state__icon' }, '📸'),
      el('h2', { className: 'empty-state__title' }, state.searchQuery ? 'لا نتائج' : 'لا توجد صور'),
      el('p', { className: 'empty-state__text' }, state.searchQuery ? 'جرّب كلمة أخرى' : 'اضغط "إضافة صورة" للبدء'),
    ]));
    return;
  }

  filtered.forEach((p) => wrap.appendChild(buildCard(p)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderGrid();
}

/* ==========================================================================
   6. API
   ========================================================================== */

export const portfolioPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeCategory = 'all';
    state.searchQuery = '';

    /* Header */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '📸 معرض الأعمال'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'عرض أعمال الورشة'),
    ]));

    /* زر إضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openAddForm(),
    }, '➕ إضافة صورة'));

    /* إحصائيات */
    container.appendChild(el('div', {
      id: 'pf-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالعنوان...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderGrid();
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'pf-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* شبكة الصور */
    container.appendChild(el('div', {
      id: 'pf-grid',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
    }));

    renderFilters();
    await refreshAll();
  },

  destroy() {
    state = {
      container: null, items: [], customers: [], customerMap: {},
      activeCategory: 'all', searchQuery: '',
    };
  },
};
