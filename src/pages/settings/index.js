/* ==========================================================================
   settings/index.js — صفحة الإعدادات (Sub-page Navigation)
   ==========================================================================
   - Master view: قائمة 21 قسم.
   - Detail view: صفحة فرعية لكل قسم (Slide من اليمين).
   - زر الرجوع في Topbar.
   - تحديث URL عبر history.replaceState (بدون hashchange → لا إعادة بناء).
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { settings } from '../../data/repos/settings.js';
import { toast } from '../../ui/toast.js';
import { events } from '../../core/events.js';
import { createSubPageManager } from '../../ui/sub-page.js';
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

let state = {
  container: null,
  settings: null,
  mgr: null,
};

/* --- تطبيق الإعدادات المحفوظة على الواجهة --- */
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

/* --- تحويل الأقسام لصيغة sub-page --- */
function buildSubPageSections() {
  return ALL_SECTIONS.map((sec) => ({
    id: sec.id,
    title: sec.title,
    icon: sec.icon,
    render: async (container) => {
      const body = el('div', { className: 'settings-section__body' });
      container.appendChild(body);
      try {
        await sec.render(body, state.settings, saveSettings);
      } catch (e) {
        body.appendChild(el('div', {
          style: { fontSize: '12px', color: '#C62828', padding: '8px' },
        }, 'خطأ في تحميل القسم: ' + (e.message || String(e))));
      }
    },
  }));
}

/* --- API --- */
export const settingsPage = {
  async render(container, subRoute) {
    clear(container);
    state.container = container;

    state.settings = await settings.get();
    applySettings(state.settings);

    /* رأس الصفحة */
    const page = el('div', { className: 'settings-page' });
    page.appendChild(el('div', { style: { marginBottom: '16px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0' } }, '⚙️ الإعدادات'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '4px 0 0 0' } },
        'اضغط على أي قسم لعرض التفاصيل'),
    ]));

    /* Sub-page manager */
    const mgr = createSubPageManager({
      baseId: 'settings',
      sections: buildSubPageSections(),
      onOpen: (id) => {
        if (!document.contains(state.container)) return;
        /* ⚠️ نستخدم replaceState بدلاً من location.hash */
        /* السبب: location.hash يُطلق hashchange → main.js يُعيد بناء الصفحة → نفقد القسم */
        try {
          history.replaceState(null, '', '#/settings/' + id);
        } catch (e) {
          console.warn('[settings] replaceState failed:', e);
        }
        events.emit('topbar:setBack', () => {
          closeCurrent();
        });
      },
      onClose: () => {
        if (!document.contains(state.container)) return;
        try {
          history.replaceState(null, '', '#/settings');
        } catch (e) {
          console.warn('[settings] replaceState failed:', e);
        }
        events.emit('topbar:setBack', null);
      },
    });

    /* دالة إغلاق القسم الحالي من زر الرجوع */
    function closeCurrent() {
      try {
        history.replaceState(null, '', '#/settings');
      } catch (e) { /* ignore */ }
      if (state.mgr) state.mgr.closeSection();
    }

    state.mgr = mgr;
    page.appendChild(mgr.node);
    container.appendChild(page);

    /* Deep link من URL */
    if (subRoute) {
      await mgr.openSection(subRoute);
    } else {
      events.emit('topbar:setBack', null);
    }
  },

  destroy() {
    events.emit('topbar:setBack', null);
    state = {
      container: null,
      settings: null,
      mgr: null,
    };
  },
};
