/* ==========================================================================
   section-menu-pages.js — قسم «صفحات القائمة»: إظهار/إخفاء صفحات القائمة الجانبية (v3.5.29)
   ==========================================================================
   - لكل صفحة مفتاح؛ إيقافه يخفيها من القائمة الجانبية والمفضلة فوراً (دون إعادة تحميل).
   - الإخفاء للقائمة فقط: الصفحة وبياناتها وروابطها تبقى كما هي، وتعود بإعادة التشغيل.
   - «الرئيسية» و«الإعدادات» محميتان (لا تُخفيان) حتى لا يفقد المستخدم طريق العودة.
   - تفضيل محلي لهذا الجهاز (settings.navigation.hidden) ليس ضمن مفاتيح المزامنة.
   ========================================================================== */

import { el } from '../../core/dom.js';
import { events } from '../../core/events.js';
import { createToggle } from '../../ui/controls.js';
import { NAV_GROUPS, PROTECTED_NAV_IDS, sanitizeHidden } from '../../services/nav-groups.js';

export const menuPagesSection = {
  id: 'menu-pages',
  icon: '📑',
  title: 'صفحات القائمة',
  async render(body, currentSettings, saveFn) {
    const hidden = new Set(sanitizeHidden((currentSettings.navigation || {}).hidden));
    const toggles = [];

    body.appendChild(el('p', { style: { fontSize: '13px', color: '#666', margin: '0 0 12px', lineHeight: '1.7' } },
      'أوقف الصفحات التي لا تستعملها لتخفّ القائمة الجانبية. الإخفاء للقائمة فقط: بياناتك لا تُمسّ، وتعود الصفحة بتشغيل مفتاحها.'));

    const commit = () => {
      const list = sanitizeHidden(Array.from(hidden));
      saveFn({ navigation: { hidden: list } });
      events.emit('nav:hidden', list);
    };

    body.appendChild(el('div', { className: 'settings-actions', style: { marginBottom: '12px' } }, [
      el('button', {
        className: 'btn btn--ghost', type: 'button', 'data-action': 'show-all-pages',
        onClick: () => {
          hidden.clear();
          toggles.forEach(({ node, id }) => { if (!PROTECTED_NAV_IDS.includes(id)) node.setChecked(true); });
          commit();
        },
      }, '👁️ إظهار كل الصفحات'),
    ]));

    NAV_GROUPS.forEach((group) => {
      body.appendChild(el('div', {
        className: 'settings-field__label', style: { margin: '14px 0 6px', fontWeight: '600' },
      }, group.icon + ' ' + group.title));
      group.items.forEach((item) => {
        const locked = PROTECTED_NAV_IDS.includes(item.id);
        const node = createToggle({
          label: item.icon + ' ' + item.label + (locked ? ' — دائماً ظاهرة' : ''),
          checked: locked ? true : !hidden.has(item.id),
          onChange: (v) => {
            if (v) hidden.delete(item.id); else hidden.add(item.id);
            commit();
          },
        });
        node.setAttribute('data-page-id', item.id);
        if (locked) node.querySelector('input').disabled = true;
        toggles.push({ node, id: item.id });
        body.appendChild(node);
      });
    });
  },
};
