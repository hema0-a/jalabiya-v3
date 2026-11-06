/* ==========================================================================
   wellbeing-cards.js — بطاقتا «تحدي الشهر» و«التزام مستتر» في مصاريف البيت (v3.9.1)
   ==========================================================================
   تحملان بياناتهما بنفسهما. تحدي الشهر للقراءة + حفظ نسبة الهدف. الالتزام المستتر:
   «حوّله لالتزام» ينشئ التزاماً شهرياً بعد تأكيد، و«تجاهل» يحفظ المفتاح فلا يُقترح ثانيةً.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { houseExpenses } from '../data/repos/house-expenses.js';
import { commitments } from '../data/repos/commitments.js';
import { settings } from '../data/repos/settings.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { formatEGP } from '../core/utils.js';
import { invalidateCache } from '../services/commitments-calculator.js';
import {
  challengeState, detectHiddenCommitments, normalizeWellbeing, normalizeChallengePct, MIN_CHALLENGE_PCT, MAX_CHALLENGE_PCT,
} from '../services/wellbeing.js';

const header = (t) => el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, t)]);
const loadW = async () => normalizeWellbeing((await settings.get()).wellbeing);

/** 🏆 تحدي الشهر */
export function buildChallengeCard() {
  const card = el('div', { className: 'card', 'data-role': 'challenge-card', style: { marginBottom: '12px', display: 'none' } });
  card.appendChild(header('🏆 تحدي الشهر'));
  const body = el('div', {});
  card.appendChild(body);

  async function draw() {
    const [list, w] = await Promise.all([houseExpenses.list(), loadW()]);
    const s = challengeState(list, w.challengePct);
    clear(body);
    if (!s.hasBaseline) { card.style.display = 'none'; return; }     /* لا شهر ماضٍ للمقارنة */
    card.style.display = '';
    const color = s.achieved ? '#2E7D32' : (s.onPace ? '#B8863B' : '#C62828');
    const pct = el('input', { className: 'input', type: 'number', min: String(MIN_CHALLENGE_PCT), max: String(MAX_CHALLENGE_PCT), step: '1', value: String(w.challengePct), 'data-role': 'challenge-pct', style: { maxWidth: '90px' } });
    pct.addEventListener('change', async () => {
      const v = normalizeChallengePct(pct.value);
      try { await settings.update({ wellbeing: { challengePct: v } }); toast.success('تم حفظ الهدف'); } catch (e) { toast.danger('فشل الحفظ'); }
      draw();
    });
    body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' } }, [el('span', {}, 'قلّل مصروف البيت عن الشهر الماضي بـ'), pct, el('span', {}, '%')]));
    body.appendChild(el('div', { style: { fontSize: '13px', margin: '8px 0 4px' } },
      'الشهر الماضي ' + formatEGP(s.prevTotal) + ' ← هدفك هذا الشهر: تحت ' + formatEGP(s.target) + ' · صرفت ' + formatEGP(s.curTotal)));
    body.appendChild(el('div', { style: { height: '10px', background: '#EEE', borderRadius: '99px', overflow: 'hidden' } },
      [el('div', { 'data-role': 'challenge-bar', style: { height: '10px', width: s.pct + '%', background: color, borderRadius: '99px' } })]));
    const msg = s.achieved
      ? (s.dayNum >= s.totalDays ? '🏆 حققت الهدف هذا الشهر!' : '✅ ما زلت تحت الهدف — المتبقي ' + formatEGP(s.remaining) + (s.dailyAllowance ? ' (≈ ' + formatEGP(s.dailyAllowance) + ' يومياً)' : ''))
      : (s.over ? '⚠️ تجاوزت الهدف بـ ' + formatEGP(s.curTotal - s.target) : '');
    body.appendChild(el('div', { 'data-role': 'challenge-msg', style: { fontSize: '12.5px', marginTop: '6px', color } }, msg));
    if (!s.over && s.achieved && !s.onPace) body.appendChild(el('div', { style: { fontSize: '12px', color: '#B8863B' } }, 'سرعتك أعلى من المخطط — راقب الأيام القادمة'));
    if (!s.over) body.appendChild(el('div', { style: { fontSize: '11.5px', color: '#888', marginTop: '2px' } }, 'بهذه الوتيرة ينتهي الشهر عند ≈ ' + formatEGP(s.projected)));
  }
  draw().catch((e) => console.warn('[challenge]', e));
  return card;
}

/** 🕵️ التزامات مستترة */
export function buildHiddenCommitmentsCard() {
  const card = el('div', { className: 'card', 'data-role': 'hidden-commitments-card', style: { marginBottom: '12px', display: 'none' } });
  card.appendChild(header('🕵️ التزام مستتر؟'));
  const body = el('div', {});
  card.appendChild(body);

  async function draw() {
    const [exp, com, w] = await Promise.all([houseExpenses.list(), commitments.list(), loadW()]);
    const found = detectHiddenCommitments(exp, com, w.dismissedHidden);
    clear(body);
    card.style.display = found.length ? '' : 'none';
    found.slice(0, 5).forEach((f) => {
      body.appendChild(el('div', { 'data-key': f.key, style: { padding: '8px 0', borderBottom: '1px dashed #EEE' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, '«' + f.desc + '» يتكرر بمبلغ متقارب (≈ ' + formatEGP(f.avgAmount) + ') في ' + f.months + ' شهور'),
        el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, [
          el('button', { className: 'btn btn--sm btn--primary', type: 'button', 'data-action': 'to-commitment', onClick: () => convert(f) }, '📌 حوّله لالتزام'),
          el('button', { className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'dismiss-hidden', onClick: () => dismiss(f) }, 'تجاهل'),
        ]),
      ]));
    });
  }
  async function dismiss(f) {
    try {
      const w = await loadW();
      await settings.update({ wellbeing: { dismissedHidden: [...w.dismissedHidden, f.key] } });
    } catch (e) { toast.danger('فشل الحفظ'); }
    draw();
  }
  async function convert(f) {
    const ok = await modal.confirm({ title: 'تحويل لالتزام', confirmText: 'إنشاء الالتزام', cancelText: 'إلغاء',
      message: 'إنشاء التزام شهري «' + f.desc + '» بمبلغ ' + formatEGP(f.avgAmount) + '؟ (مصاريفك السابقة تبقى كما هي)' });
    if (!ok) return;
    try {
      await commitments.create({ name: f.desc, category: 'other', amount: f.avgAmount, frequency: 'monthly', active: true, notes: 'أُنشئ من كشف الالتزام المستتر' });
      invalidateCache();
      toast.success('تم إنشاء الالتزام');
    } catch (e) { toast.danger('فشل: ' + e.message); }
    draw();
  }
  draw().catch((e) => console.warn('[hidden-commitments]', e));
  return card;
}
