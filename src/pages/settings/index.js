/* ==========================================================================
   settings/index.js — صفحة الإعدادات الاحترافية
   ==========================================================================
   - 21 قسماً (6+6+6+3) — قابلة للطي (Accordion)
   - بحث فوري (يفتح الأقسام المطابقة تلقائياً)
   - فهرس جانبي (TOC) + Scroll Spy
   - "فتح الكل" / "إغلاق الكل"
   - حفظ الحالة في localStorage عبر collapsible.js
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { settings } from '../../data/repos/settings.js';
import { toast } from '../../ui/toast.js';
import { createCollapsible, openAll, closeAll } from '../../ui/collapsible.js';
import { WORKSHOP_SECTIONS } from './sections-workshop.js';
import { DATA_SECTIONS } from './sections-data.js';
import { SYSTEM_SECTIONS } from './sections-system.js';
import { SECURITY_SECTIONS } from './sections-security.js';

const ALL_SECTIONS = [
  ...WORKSHOP_SECTIONS,
  ...DATA_SECTIONS,
  ...SYSTEM_SECTIONS,
  ...SECURITY_SECTIONS,
];

const COLLAPSED_KEY = 'jalabiya_v3_collapsed_state';

let state = {
  container: null,
  settings: null,
  searchQuery: '',
  sectionRefs: {},
};

/* --- البحث --- */
function applySearch() {
  const q = state.searchQuery.trim().toLowerCase();
  const sectionEls = state.container.querySelectorAll('[data-section-id]');
  sectionEls.forEach((sec) => {
    if (!q) {
      sec.classList.remove('settings-section--hidden');
      return;
    }
    const text = sec.textContent.toLowerCase();
    if (text.includes(q)) {
      sec.classList.remove('settings-section--hidden');
      sec.classList.add('collapsible--open');
      const h = sec.querySelector('.collapsible__header');
      if (h) h.setAttribute('aria-expanded', 'true');
    } else {
      sec.classList.add('settings-section--hidden');
    }
  });
}

/* --- Scroll Spy --- */
function setupScrollSpy() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.dataset.sectionId;
        state.container.querySelectorAll('.settings-toc__item').forEach((it) => {
          it.classList.toggle('settings-toc__item--active', it.dataset.target === id);
        });
      }
    });
  }, { rootMargin: '-120px 0px -60% 0px', threshold: 0 });

  Object.values(state.sectionRefs).forEach((secEl) => observer.observe(secEl));
}

/* --- تطبيق الإعدادات المحفوظة --- */
function applySettings(s) {
  if (s.appearance) {
    if (s.appearance.primaryColor) {
      document.documentElement.style.setProperty('--color-primary', s.appearance.primaryColor);
    }
    if (s.appearance.accentColor) {
      document.documentElement.style.setProperty('--color-accent', s.appearance.accentColor);
    }
    if (s.appearance.backgroundColor) {
      document.documentElement.style.setProperty('--color-bg', s.appearance.backgroundColor);
    }
    document.body.classList.remove('bg-fabric', 'bg-sewing', 'bg-geometric', 'bg-paper');
    if (s.appearance.backgroundPattern && s.appearance.backgroundPattern !== 'none') {
      document.body.classList.add('bg-' + s.appearance.backgroundPattern);
    }
    document.body.classList.remove('icons-colored-badges', 'icons-line');
    if (s.appearance.iconStyle === 'colored-badges') document.body.classList.add('icons-colored-badges');
    if (s.appearance.iconStyle === 'line') document.body.classList.add('icons-line');
  }

  if (s.display) {
    document.documentElement.setAttribute('data-font', s.display.fontFamily || 'ibm-plex');
    document.documentElement.setAttribute('data-size', s.display.fontSize || 'normal');
  }
}

/* --- البحث العلوي --- */
function buildSearchBar() {
  const wrap = el('div', { className: 'settings-search' });
  const input = el('input', {
    className: 'settings-search__input',
    type: 'search',
    placeholder: '🔍 ابحث في الإعدادات...',
  });
  input.addEventListener('input', () => {
    state.searchQuery = input.value;
    applySearch();
  });
  wrap.appendChild(input);
  return wrap;
}

/* --- أزرار فتح/إغلاق الكل --- */
function buildOpenCloseControls() {
  return el('div', {
    style: {
      display: 'flex',
      gap: '8px',
      marginBottom: '12px',
      justifyContent: 'flex-end',
    },
  }, [
    el('button', {
      className: 'btn btn--sm btn--secondary',
      type: 'button',
      onClick: () => openAll(state.container),
    }, '📂 فتح الكل'),
    el('button', {
      className: 'btn btn--sm btn--secondary',
      type: 'button',
      onClick: () => closeAll(state.container),
    }, '📁 إغلاق الكل'),
  ]);
}

/* --- الفهرس الجانبي --- */
function buildTOC() {
  const toc = el('aside', { className: 'settings-toc' });
  ALL_SECTIONS.forEach((sec) => {
    const btn = el('button', {
      type: 'button',
      className: 'settings-toc__item',
      'data-target': sec.id,
      onClick: () => {
        const target = state.sectionRefs[sec.id];
        if (!target) return;
        target.classList.add('collapsible--open');
        const h = target.querySelector('.collapsible__header');
        if (h) h.setAttribute('aria-expanded', 'true');
        try {
          const s = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}');
          s[sec.id] = true;
          localStorage.setItem(COLLAPSED_KEY, JSON.stringify(s));
        } catch {}
        target.classList.add('collapsible--highlight');
        setTimeout(() => target.classList.remove('collapsible--highlight'), 1600);
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, [
      el('span', { className: 'settings-toc__icon' }, sec.icon),
      el('span', {}, sec.title),
    ]);
    toc.appendChild(btn);
  });
  return toc;
}

/* --- بناء الأقسام (Collapsible) --- */
async function buildSections() {
  const wrap = el('div', { className: 'settings-main' });

  for (const sec of ALL_SECTIONS) {
    const body = el('div', { className: 'settings-section__body' });

    try {
      await sec.render(body, state.settings, saveSettings);
    } catch (e) {
      body.appendChild(el('div', {
        style: { fontSize: '12px', color: '#C62828', padding: '8px' },
      }, 'خطأ في تحميل القسم: ' + (e.message || String(e))));
    }

    const titleText = (sec.icon ? sec.icon + '  ' : '') + sec.title;
    const coll = createCollapsible({
      id: sec.id,
      title: titleText,
      content: body,
      defaultOpen: false,
    });

    coll.node.classList.add('settings-section');
    if (sec.dangerous) coll.node.classList.add('settings-danger');
    coll.node.setAttribute('data-section-id', sec.id);

    wrap.appendChild(coll.node);
    state.sectionRefs[sec.id] = coll.node;
  }

  return wrap;
}

/* --- الحفظ --- */
async function saveSettings(patch) {
  try {
    const updated = await settings.update(patch);
    state.settings = updated;
    toast.success('تم الحفظ');
  } catch (err) {
    toast.danger('فشل الحفظ: ' + err.message);
  }
}

/* --- API --- */
export const settingsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.searchQuery = '';
    state.sectionRefs = {};

    state.settings = await settings.get();
    applySettings(state.settings);

    const page = el('div', { className: 'settings-page' });
    page.appendChild(buildSearchBar());
    page.appendChild(buildOpenCloseControls());

    const layout = el('div', { className: 'settings-layout' });
    layout.appendChild(buildTOC());
    layout.appendChild(await buildSections());
    page.appendChild(layout);

    container.appendChild(page);

    setTimeout(setupScrollSpy, 100);
  },

  destroy() {
    state = {
      container: null,
      settings: null,
      searchQuery: '',
      sectionRefs: {},
    };
  },
};
