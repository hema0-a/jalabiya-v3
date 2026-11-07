/* ==========================================================================
   daily-tip-card.js — بطاقة «نصيحة اليوم المالية» في المركز المالي (v3.11.1)
   ==========================================================================
   نصيحة ثابتة طوال اليوم (تُحفظ محلياً لهذا الجهاز كي لا تتبدّل بتبدّل بياناتك خلال اليوم) + «نصيحة تانية» +
   ⭐ حفظ/حذف المفضلة (تتزامن بين الأجهزة عبر الإعدادات). لا تغيّر أي بيانات مالية.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { houseExpenses } from '../data/repos/house-expenses.js';
import { commitments } from '../data/repos/commitments.js';
import { settings } from '../data/repos/settings.js';
import { toast } from './toast.js';
import { remainingMonths } from '../services/debt-plan.js';
import { tipPool, pickTip, normalizeDailyTips, saveTip, removeTip } from '../services/daily-tip.js';

const CACHE_KEY = 'jalabiya_v3_daily_tip';
const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const newId = () => 'tip_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function cachedToday(now) {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.date === dayKey(now) && typeof c.text === 'string' ? c.text : null; } catch (e) { return null; }
}
function cacheToday(now, text) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ date: dayKey(now), text })); } catch (e) { /* التخزين قد يكون ممتلئاً */ } }

export function buildDailyTipCard() {
  const card = el('div', { className: 'card', 'data-role': 'daily-tip-card', style: { marginBottom: '16px' } });
  const st = { offset: 0, pool: [], saved: [], todayText: '' };

  function draw() {
    const now = new Date();
    clear(card);
    card.appendChild(el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '💡 نصيحة اليوم المالية')]));
    const text = st.offset === 0 ? st.todayText : pickTip(st.pool, now, st.offset);
    const already = st.saved.some((s) => s.text === text);
    card.appendChild(el('div', { 'data-role': 'tip-text', style: { fontSize: '14px', lineHeight: '1.9', marginTop: '4px' } }, text));
    card.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } }, [
      el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'next-tip', onClick: () => { st.offset += 1; draw(); } }, '↻ نصيحة تانية'),
      el('button', { type: 'button', className: 'btn btn--sm ' + (already ? 'btn--ghost' : 'btn--primary'), 'data-action': 'save-tip', disabled: already,
        onClick: async () => {
          const r = saveTip(st.saved, text, newId(), dayKey(now));
          if (!r.added) { toast.info('محفوظة عندك بالفعل'); return; }
          try { await settings.update({ dailyTips: { saved: r.saved } }); st.saved = r.saved; toast.success('⭐ اتحفظت'); draw(); } catch (e) { toast.danger('فشل الحفظ'); }
        } }, already ? '⭐ محفوظة' : '⭐ احفظ'),
    ]));
    if (st.saved.length) {
      const box = el('div', { 'data-role': 'saved-tips', style: { marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E5DDD0' } });
      box.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '4px' } }, '⭐ نصائحك المحفوظة'));
      st.saved.forEach((s) => box.appendChild(el('div', { 'data-tip-id': s.id, style: { display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '4px' } }, [
        el('span', { style: { flex: '1', fontSize: '13px', lineHeight: '1.7' } }, s.text),
        el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'remove-tip',
          onClick: async () => {
            const next = removeTip(st.saved, s.id);
            try { await settings.update({ dailyTips: { saved: next } }); st.saved = next; draw(); } catch (e) { toast.danger('فشل الحذف'); }
          } }, 'حذف'),
      ])));
      card.appendChild(box);
    }
  }

  (async () => {
    const now = new Date();
    const [he, cm, s] = await Promise.all([houseExpenses.list(), commitments.list(), settings.get()]);
    st.pool = tipPool({ houseExpenses: he, commitments: cm, netWorthHistory: (s.investment && s.investment.netWorthHistory) || [], remainingMonthsOf: remainingMonths, now });
    st.todayText = cachedToday(now) || pickTip(st.pool, now, 0);
    cacheToday(now, st.todayText);
    st.saved = normalizeDailyTips(s.dailyTips).saved;
    draw();
  })().catch((e) => { console.warn('[daily-tip-card]', e); card.style.display = 'none'; });
  return card;
}
