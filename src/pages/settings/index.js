/* ==========================================================================
   settings/index.js — صفحة الإعدادات (Sub-page Navigation)
   ==========================================================================
   - Master view: قائمة الأقسام.
   - Detail view: صفحة فرعية لكل قسم (Slide من اليمين).
   - زر الرجوع في Topbar.
   - تحديث URL عبر history.replaceState (بدون hashchange → لا إعادة بناء).
   ========================================================================== */

import { applyAllSettings } from '../../ui/display-settings.js';
import { el, clear } from '../../core/dom.js';
import { saveFailMessage } from '../../core/save-error.js';
import { settings } from '../../data/repos/settings.js';
import { toast } from '../../ui/toast.js';
import { events } from '../../core/events.js';
import { modal } from '../../ui/modal.js';
import { createSubPageManager } from '../../ui/sub-page.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';
import { matchSections, canReset, buildResetPatch, describeReset } from '../../services/settings-tools.js';
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

/* v3.5.27: القسم المفتوح حالياً — إن عرّف destroy() يُستدعى عند إغلاقه أو الانتقال لغيره أو مغادرة الصفحة */
let activeSec = null;
function destroyActiveSection() {
  const s = activeSec;
  activeSec = null;
  if (s && typeof s.destroy === 'function') {
    try { s.destroy(); } catch (e) { console.warn('[settings] section destroy failed:', e); }
  }
}

/* --- تطبيق الإعدادات المحفوظة على الواجهة --- */
function applySettings(s) {
  applyAllSettings(s);
  /* v3.5.29: صفحات القائمة المخفية (يستمع main.js ويحدّث القائمة الجانبية) */
  events.emit('nav:hidden', (s && s.navigation && s.navigation.hidden) || []);
}

/* --- الحفظ --- */
async function saveSettings(patch) {
  try {
    const updated = await settings.update(patch);
    state.settings = updated;
    toast.success('تم الحفظ');
  } catch (err) {
    toast.danger(saveFailMessage(err));
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
      const draw = async () => {
        try {
          await sec.render(body, state.settings, saveSettings);
        } catch (e) {
          body.appendChild(el('div', {
            style: { fontSize: '12px', color: '#C62828', padding: '8px' },
          }, 'خطأ في تحميل القسم: ' + (e.message || String(e))));
        }
      };
      await draw();
      /* v3.5.28: استرجاع الافتراضي لهذا القسم فقط (للأقسام القابلة لذلك) */
      if (canReset(sec.id)) {
        container.appendChild(el('div', { className: 'settings-actions', style: { marginTop: '16px' } }, [
          el('button', {
            className: 'btn btn--ghost', type: 'button', 'data-action': 'reset-section',
            onClick: async () => {
              const patch = buildResetPatch(sec.id, DEFAULT_SETTINGS);
              if (!patch) return;
              const ok = await modal.confirm({
                title: 'استرجاع الافتراضي', message: 'استرجاع إعدادات «' + sec.title + '»؟\n\n' + describeReset(sec.id),
                confirmText: 'استرجاع', cancelText: 'إلغاء', danger: true,
              });
              if (!ok) return;
              try {
                const updated = await settings.update(patch);
                state.settings = updated;
                applySettings(updated);
                clear(body);
                await draw();
                toast.success('تم استرجاع الإعدادات الافتراضية لهذا القسم');
              } catch (err) {
                toast.danger(saveFailMessage(err));
              }
            },
          }, '↩️ استرجاع الافتراضي لهذا القسم'),
        ]));
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
        destroyActiveSection();
        activeSec = ALL_SECTIONS.find((s) => s.id === id) || null;
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
        destroyActiveSection();
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
    /* v3.5.28: بحث في الأقسام (بالعنوان وبأسماء الإعدادات داخلها) */
    const search = el('input', {
      className: 'input', type: 'search', 'data-role': 'settings-search',
      placeholder: '🔍 ابحث في الإعدادات (خط، عربون، تشفير…)',
      'aria-label': 'بحث في الإعدادات', style: { marginBottom: '12px' },
    });
    const noResults = el('div', {
      'data-role': 'settings-search-empty',
      style: { display: 'none', padding: '16px', textAlign: 'center', color: '#888', fontSize: '13px' },
    }, 'لا يوجد قسم مطابق — جرّب كلمة أخرى');
    search.addEventListener('input', () => {
      const hits = matchSections(search.value, ALL_SECTIONS);
      let shown = 0;
      mgr.node.querySelectorAll('.sub-page__item').forEach((item) => {
        const vis = hits === null || hits.has(item.getAttribute('data-section-id'));
        item.style.display = vis ? '' : 'none';
        if (vis) shown += 1;
      });
      noResults.style.display = (hits !== null && shown === 0) ? '' : 'none';
    });
    page.appendChild(search);
    page.appendChild(noResults);
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
    destroyActiveSection();
    events.emit('topbar:setBack', null);
    state = {
      container: null,
      settings: null,
      mgr: null,
    };
  },
};
