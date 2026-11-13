/* ==========================================================================
   actions-teaser.js — بطاقة «📥 مركز العمل» في اللوحة الرئيسية (v3.19.0)
   ==========================================================================
   تظهر بعد الرسم الأول (لا تؤخّر اللوحة)، وتختفي إن لم يكن هناك شيء ينتظر. الضغط يفتح #/actions.
   ========================================================================== */

import { el } from '../core/dom.js';
import { loadActionCenter } from '../pages/actions-data.js';

export async function mountActionsTeaser(slot) {
  try {
    const { model } = await loadActionCenter();
    if (!slot.isConnected || model.total === 0) return;
    const top = model.items.slice(0, 3);
    slot.appendChild(el('div', {
      className: 'card actions-teaser', role: 'button', tabindex: '0', 'data-testid': 'actions-teaser',
      style: { padding: '12px', margin: '12px 0', cursor: 'pointer' },
      onClick: () => { location.hash = '#/actions'; },
    }, [
      el('div', { style: { fontWeight: '700' } }, '📥 مركز العمل — ' + model.total + ' بند بانتظارك'),
      ...top.map((it) => el('div', { style: { fontSize: '13px', opacity: '0.85', padding: '2px 0' } }, it.icon + ' ' + it.title + ' · ' + it.subtitle)),
      el('div', { style: { fontSize: '12px', color: '#2E7D32', marginTop: '4px' } }, 'افتح للإنجاز والتأجيل ‹'),
    ]));
  } catch (e) { console.warn('[actions-teaser] failed:', e); }
}
