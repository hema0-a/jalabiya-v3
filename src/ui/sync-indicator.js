/* ==========================================================================
   sync-indicator.js — شريط تنبيه المزامنة (يظهر فقط عند الحاجة)
   ==========================================================================
   يظهر في حالتين فقط:
     🔴 الرفع التلقائي متوقف ويحتاج قرارك (السحابة فيها بيانات أخرى).
     🟠 تعديلات لم تُرفع منذ أكثر من يومين.
   الضغط عليه يفتح صفحة المزامنة. زر ✕ يخفيه حتى تتغيّر الحالة.
   ========================================================================== */

import * as autoSync from '../sync/auto-sync.js';

const NODE_ID = 'sync-alert';
let node = null;
let dismissedKind = null;
let started = false;

function kindOf(st) {
  if (!st.configured) return null;
  if (st.blocked) return 'blocked';
  if (st.stale) return 'stale';
  return null;
}

function update(st) {
  if (!node) return;
  const kind = kindOf(st);
  if (!kind || kind === dismissedKind) { node.classList.remove('sync-alert--visible'); return; }
  const text = node.querySelector('.sync-alert__text');
  const icon = node.querySelector('.sync-alert__icon');
  node.classList.toggle('sync-alert--blocked', kind === 'blocked');
  node.dataset.kind = kind;
  if (kind === 'blocked') {
    icon.textContent = '🔴';
    text.textContent = 'المزامنة متوقفة وتحتاج قرارك — اضغط للمراجعة';
  } else {
    const days = Math.max(2, Math.floor((Date.now() - st.dirtySince) / 86400000));
    icon.textContent = '🟠';
    text.textContent = 'تعديلاتك لم تُرفع للسحابة منذ ' + days + ' أيام — اضغط للرفع';
  }
  node.classList.add('sync-alert--visible');
}

export function mount() {
  if (started) return;
  started = true;
  node = document.createElement('div');
  node.id = NODE_ID;
  node.className = 'sync-alert';
  node.setAttribute('role', 'status');

  const icon = document.createElement('span'); icon.className = 'sync-alert__icon';
  const text = document.createElement('span'); text.className = 'sync-alert__text';
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'sync-alert__close'; close.setAttribute('aria-label', 'إخفاء'); close.textContent = '✕';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissedKind = node.dataset.kind || null;
    node.classList.remove('sync-alert--visible');
  });
  node.addEventListener('click', () => { location.hash = '#/cloud-sync'; });
  node.append(icon, text, close);
  document.body.appendChild(node);

  autoSync.subscribe(update);
  /* «منذ N أيام» يتقادم مع الوقت دون أي حدث */
  setInterval(() => update(autoSync.getStatus()), 10 * 60 * 1000);
  update(autoSync.getStatus());
}
