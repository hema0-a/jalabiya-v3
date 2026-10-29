/* ==========================================================================
   dashboard-customize.js — شريط الأقسام ونافذة تخصيص اللوحة (v3.5.5)
   ==========================================================================
   مقتطع من dashboard.js دون تغيير في السلوك. لا يعرف الصفحة نفسها (لا استيراد دائري):
   إعادة الرسم بعد التخصيص تتم عبر دالة onApply التي تمرّرها الصفحة.
   API: buildSectionsBar(host, onCustomize) · openCustomize(onApply)
   ========================================================================== */

import { modal } from '../ui/modal.js';
import { openAll, closeAll } from '../ui/collapsible.js'; /* v3.3.63 */
import { el, clear } from '../core/dom.js';
import {
  DASH_BLOCKS, DASH_SECTIONS, readLayout, writeLayout, isVisible, toggleVisible, moveSection,
  orderedSectionIds, defaultLayout, isDefault,
} from '../services/dashboard-layout.js'; /* v3.5.1 */

/* شريط «فتح الكل / طيّ الكل»: التسمية تعكس الحالة الفعلية دائماً */
export function buildSectionsBar(host, onCustomize) {
  const btn = el('button', { type: 'button', className: 'dash-sections__toggle' }, 'فتح الكل');
  const allOpen = () => {
    const list = Array.from(host.querySelectorAll('.dash-section'));
    return list.length > 0 && list.every((n) => n.classList.contains('collapsible--open'));
  };
  const sync = () => { btn.textContent = allOpen() ? 'طيّ الكل' : 'فتح الكل'; };
  btn.addEventListener('click', () => { (allOpen() ? closeAll : openAll)(host); sync(); });
  host.addEventListener('click', () => setTimeout(sync, 0));   // أي فتح/طيّ فردي يحدّث التسمية
  const custom = el('button', {
    type: 'button',
    className: 'dash-sections__custom',
    'aria-label': 'تخصيص لوحة التحكم',
    onClick: () => { if (typeof onCustomize === 'function') onCustomize(); },
  }, '⚙️ تخصيص');
  const bar = el('div', { className: 'dash-sections__bar' }, [btn, custom]);
  bar.update = sync;
  return bar;
}

/* نافذة تخصيص اللوحة: إظهار/إخفاء + ترتيب الأقسام؛ التطبيق عند الإغلاق بإعادة رسم اللوحة (v3.5.1)
   onApply: دالة تُستدعى عند الإغلاق إن تغيّر التخصيص (تعيد الصفحة رسم نفسها) */
export function openCustomize(onApply) {
  let layout = readLayout();
  const startKey = JSON.stringify(layout);
  const list = el('div', { className: 'dash-custom' });
  const info = {};
  DASH_BLOCKS.concat(DASH_SECTIONS).forEach((it) => { info[it.id] = it; });

  function save(next) {
    layout = next;
    writeLayout(layout);
    paint();
  }

  function row(id, canMove, idx, total) {
    const it = info[id];
    const shown = isVisible(layout, id);
    const cb = el('input', { type: 'checkbox', className: 'dash-custom__check', id: 'dash-custom-' + id, 'aria-label': it.title });
    cb.checked = shown;
    cb.addEventListener('change', () => save(toggleVisible(layout, id)));
    const mv = (dir, label, glyph, disabled) => {
      const b = el('button', {
        type: 'button', className: 'dash-custom__move', 'aria-label': label + ' «' + it.title + '»',
        onClick: () => save(moveSection(layout, id, dir)),
      }, glyph);
      if (disabled) b.disabled = true;
      return b;
    };
    return el('div', { className: 'dash-custom__row' + (shown ? '' : ' dash-custom__row--off') }, [
      el('label', { className: 'dash-custom__label', for: 'dash-custom-' + id }, [
        cb,
        el('span', { className: 'dash-custom__icon', 'aria-hidden': 'true' }, it.icon),
        el('span', { className: 'dash-custom__title' }, it.title),
      ]),
      canMove ? mv(-1, 'تحريك لأعلى', '▲', idx === 0) : null,
      canMove ? mv(1, 'تحريك لأسفل', '▼', idx === total - 1) : null,
    ]);
  }

  function paint() {
    clear(list);
    list.appendChild(el('div', { className: 'dash-custom__group', text: 'الكتل' }));
    DASH_BLOCKS.forEach((b) => list.appendChild(row(b.id, false, 0, 0)));
    list.appendChild(el('div', { className: 'dash-custom__group', text: 'الأقسام (رتّبها كما تريد)' }));
    const order = orderedSectionIds(layout);
    order.forEach((id, i) => list.appendChild(row(id, true, i, order.length)));
    list.appendChild(el('p', { className: 'dash-note', text: '«يحتاج إجراءك» تظهر دائماً في أعلى اللوحة.' }));
  }
  paint();

  const handle = modal.open({
    title: '⚙️ تخصيص لوحة التحكم',
    body: list,
    variant: 'sheet',
    closable: true,
    onClose: () => {
      /* لا إعادة رسم إن لم يتغيّر شيء (الصفحة هي من تعيد الرسم عبر onApply) */
      if (JSON.stringify(layout) !== startKey && typeof onApply === 'function') onApply();
    },
    actions: [
      { text: 'استعادة الافتراضي', variant: 'ghost', action: 'reset', onClick: () => { if (!isDefault(layout)) save(defaultLayout()); } },
      { text: 'تم', variant: 'primary', action: 'done', onClick: () => handle.close() },
    ],
  });
}
