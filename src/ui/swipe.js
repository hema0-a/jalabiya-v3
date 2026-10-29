/* ==========================================================================
   swipe.js — سحب أفقي على بطاقة لتنفيذ إجراء (v3.3.58)
   ==========================================================================
   attachSwipe(node, { onLeft, onRight, threshold })
   - للمس/القلم فقط (الماوس يستعمل الأزرار). التمرير العمودي يبقى طبيعياً (touch-action: pan-y).
   - يبدأ فقط إن كان الحركة أفقية بوضوح؛ يتجاهل البدء من زر/رابط/حقل.
   - عند تجاوز العتبة يُنفَّذ الإجراء عند رفع الإصبع، وإلا تعود البطاقة لمكانها.
   - الضغطة بعد السحب لا تُحتسب نقراً (لا يفتح المعاينة بالخطأ).
   ========================================================================== */

export const SWIPE_THRESHOLD = 90;
const START_SLOP = 12;
const MAX_PULL = 130;
const SKIP = 'button, a, input, select, textarea, label, [data-customer-id], [data-no-swipe]';

export function attachSwipe(node, opts = {}) {
  const { onLeft = null, onRight = null, threshold = SWIPE_THRESHOLD } = opts;
  if (!node || (!onLeft && !onRight)) return () => {};
  node.classList.add('swipe-card');
  node.style.touchAction = 'pan-y';
  let st = null;
  let suppress = false;

  const reset = (animate) => {
    node.style.transition = animate ? 'transform 160ms ease' : '';
    node.style.transform = '';
    node.removeAttribute('data-swipe');
  };
  const down = (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.target && e.target.closest && e.target.closest(SKIP)) return;
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, engaged: false };
    node.style.transition = '';
  };
  const move = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.engaged) {
      if (Math.abs(dy) > START_SLOP && Math.abs(dy) > Math.abs(dx)) { st = null; return; }   /* تمرير عمودي */
      if (Math.abs(dx) < START_SLOP || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      st.engaged = true;
      try { node.setPointerCapture(e.pointerId); } catch { /* مؤشر اصطناعي في الاختبار */ }
    }
    const allowed = (dx < 0 && onLeft) || (dx > 0 && onRight);
    st.dx = allowed ? dx : dx / 4;                     /* اتجاه بلا إجراء: مقاومة */
    const pull = Math.max(-MAX_PULL, Math.min(MAX_PULL, st.dx));
    node.style.transform = 'translateX(' + pull + 'px)';
    node.setAttribute('data-swipe', allowed && Math.abs(dx) >= threshold ? (dx < 0 ? 'left' : 'right') : (allowed ? (dx < 0 ? 'left-hint' : 'right-hint') : ''));
  };
  const up = (e) => {
    if (!st || e.pointerId !== st.id) { return; }
    const { dx, engaged } = st;
    st = null;
    if (!engaged) return;
    suppress = true;
    setTimeout(() => { suppress = false; }, 400);
    reset(true);
    if (dx <= -threshold && onLeft) onLeft();
    else if (dx >= threshold && onRight) onRight();
  };
  const cancel = () => { if (st && st.engaged) reset(true); st = null; };
  const click = (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('click', click, true);
  return () => {
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', cancel);
    node.removeEventListener('click', click, true);
    node.classList.remove('swipe-card');
    reset(false);
  };
}
