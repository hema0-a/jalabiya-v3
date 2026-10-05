/* ==========================================================================
   settings/index.js — صفحة الإعدادات الاحترافية
   ==========================================================================
   - 13 قسماً
   - بحث فوري
   - فهرس جانبي (TOC) + Scroll Spy
   - حفظ تلقائي
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { settings } from '../../data/repos/settings.js';
import { toast } from '../../ui/toast.js';
import { WORKSHOP_SECTIONS } from './sections-workshop.js';
import { DATA_SECTIONS } from './sections-data.js';
import { SYSTEM_SECTIONS } from './sections-system.js';
import { SECURITY_SECTIONS } from './sections-security.js';

/* --- تجميع كل الأقسام --- */
const ALL_SECTIONS = [
  ...WORKSHOP_SECTIONS,
  ...DATA_SECTIONS,
  ...SYSTEM_SECTIONS,
  ...SECURITY_SECTIONS,
];

/* --- حالة الصفحة --- */
let state = {
  container: null,
  settings: null,
  searchQuery: '',
  sectionRefs: {},
};

/* ==========================================================================
   1. البحث
   ========================================================================== */

function applySearch() {
  const q = state.searchQuery.trim().toLowerCase();
  const sectionEls = state.container.querySelectorAll('.settings-section');
  sectionEls.forEach((sec) => {
    if (!q) {
      sec.classList.remove('settings-section--hidden');
      return;
    }
    const text = sec.textContent.toLowerCase();
    if (text.includes(q)) sec.classList.remove('settings-section--hidden');
    else sec.classList.add('settings-section--hidden');
  });
}

/* ==========================================================================
   2. Scroll Spy (يُبرز القسم في TOC)
   ========================================================================== */

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

/* ==========================================================================
   3. بناء الصفحة
   ========================================================================== */

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

function buildTOC() {
  const toc = el('aside', { className: 'settings-toc' });
  ALL_SECTIONS.forEach((sec) => {
    const btn = el('button', {
      type: 'button',
      className: 'settings-toc__item',
      'data-target': sec.id,
      onClick: () => {
        const target = state.sectionRefs[sec.id];
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, [
      el('span', { className: 'settings-toc__icon' }, sec.icon),
      el('span', {}, sec.title),
    ]);
    toc.appendChild(btn);
  });
  return toc;
}

async function buildSections() {
  const wrap = el('div', { className: 'settings-main' });

  for (const sec of ALL_SECTIONS) {
    const section = el('section', {
      className: 'settings-section' + (sec.dangerous ? ' settings-danger' : ''),
      'data-section-id': sec.id,
    });

    const header = el('div', { className: 'settings-section__header' }, [
      el('span', { className: 'settings-section__icon' }, sec.icon),
      el('h2', { className: 'settings-section__title' }, sec.title),
    ]);

    const body = el('div', { className: 'settings-section__body' });

    /* استدعاء render الخاصة بالقسم مع (body, state.settings, saveFn) */
    await sec.render(body, state.settings, saveSettings);

    section.appendChild(header);
    section.appendChild(body);
    wrap.appendChild(section);

    state.sectionRefs[sec.id] = section;
  }

  return wrap;
}

/* ==========================================================================
   4. الحفظ
   ========================================================================== */

/**
 * حفظ تحديث الإعدادات مع إشعار.
 * @param {Object} patch
 */
async function saveSettings(patch) {
  try {
    const updated = await settings.update(patch);
    state.settings = updated;
    toast.success('تم الحفظ');
  } catch (err) {
    toast.danger('فشل الحفظ: ' + err.message);
  }
}

/* ==========================================================================
   5. API عام
   ========================================================================== */

export const settingsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.searchQuery = '';
    state.sectionRefs = {};

    /* تحميل الإعدادات */
    state.settings = await settings.get();

    /* الغلاف */
    const page = el('div', { className: 'settings-page' });
    page.appendChild(buildSearchBar());

    const layout = el('div', { className: 'settings-layout' });
    layout.appendChild(buildTOC());
    layout.appendChild(await buildSections());
    page.appendChild(layout);

    container.appendChild(page);

    /* Scroll Spy */
    setTimeout(setupScrollSpy, 50);
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
