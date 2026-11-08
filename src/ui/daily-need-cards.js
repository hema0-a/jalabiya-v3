/* ==========================================================================
   daily-need-cards.js — «الاحتياج اليومي» و«خط الأمان الشهري» في المالية الشخصية (v3.11.0)
   ==========================================================================
   بطاقتان تحمّلان بياناتهما بنفسيهما (التزامات + مصروف البيت + دفعات + إعدادات):
   1) 📆 الحد الأدنى المطلوب يومياً من الورشة + اقتراح تأجيل «ممكن يتأجل» + مفتاح «وضع الشهر الصعب».
   2) 🛡️ خط الأمان: المحصَّل مقابل المطلوب هذا الشهر (شريط + علامة مكانك من الشهر) + الأرقام الثلاثة.
   للقراءة فقط عدا مفتاح وضع الشهر الصعب (يحفظ personalControls.hardMonth).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { commitments } from '../data/repos/commitments.js';
import { houseExpenses } from '../data/repos/house-expenses.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { computePickups, buildPickupText, DEFAULT_PICKUP_DAYS } from '../services/pickup-reminders.js';
import { sendLogged } from '../services/auto-messages.js';
import { toast } from './toast.js';
import { formatEGP } from '../core/utils.js';
import { resolveDayOffSettings } from '../core/day-off.js';
import { getMonthlyEquivalent } from '../services/commitments-calculator.js';
import {
  requiredDaily, monthProgress, safetyStatus, todaySurplus, deferrableSuggestion, collectionPlan,
  normalizePersonalControls, DEFAULT_CAPACITY,
} from '../services/daily-need.js';

const LEVEL = {
  safe: { label: '✅ على المسار الصحيح', color: '#2E7D32' },
  warn: { label: '⚠️ قريب من المطلوب — محتاج تسرّع شوية', color: '#F57C00' },
  danger: { label: '🔴 متأخر عن المطلوب هذا الشهر', color: '#C62828' },
};
const header = (t) => el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, t)]);
const muted = (t, extra) => el('div', { style: Object.assign({ fontSize: '12.5px', color: '#666', lineHeight: '1.8' }, extra || {}) }, t);

async function loadAll() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
  const [cm, he, pay, s, ord, cus] = await Promise.all([
    commitments.list(), houseExpenses.listByPeriod(from, now.getTime() + 86400000), payments.list(), settings.get(),
    orders.list().catch(() => []), customers.list().catch(() => []),
  ]);
  const dl = (s && s.dailyLimit) || {};
  return {
    now,
    input: {
      commitments: cm, houseExpenses: he, payments: pay, monthlyOf: getMonthlyEquivalent,
      dayOff: resolveDayOffSettings(dl), now,
    },
    capacity: Number(dl.dailyOrderLimit) > 0 ? Number(dl.dailyOrderLimit) : DEFAULT_CAPACITY,
    controls: normalizePersonalControls(s && s.personalControls),
    pickups: computePickups(ord, pay, cus, Date.now(), DEFAULT_PICKUP_DAYS),
    workshop: (s && s.workshop) || {},
    msgCfg: (s && s.autoMessages) || null,
  };
}

function drawRequired(card, d) {
  const r = requiredDaily(d.input);
  const diff = r.total - d.capacity;
  clear(card);
  card.style.borderInlineStart = diff > 0 ? '4px solid #C62828' : '';
  card.appendChild(header('📆 الحد الأدنى المطلوب يومياً'));
  card.appendChild(el('div', { 'data-role': 'required-total', style: { fontSize: '22px', fontWeight: '700', color: diff > 0 ? '#C62828' : '#123C2F', marginBottom: '4px' } }, formatEGP(r.total) + ' / يوم'));
  card.appendChild(muted('الالتزامات: ' + formatEGP(r.commitmentsPerDay) + ' يومياً (موزَّعة على ' + r.wdays + ' يوم شغل) + مصروف البيت: ' + formatEGP(r.housePerDay) + ' يومياً (آخر 30 يوماً).'));
  card.appendChild(muted('طاقتك اليومية الحالية: ' + formatEGP(d.capacity) + (diff > 0 ? ' — ينقصك ' + formatEGP(diff) + ' يومياً' : ' — تكفي ✅'), { fontWeight: diff > 0 ? '700' : '400', color: diff > 0 ? '#C62828' : '#2E7D32' }));
  const sug = deferrableSuggestion({ commitments: d.input.commitments, monthlyOf: getMonthlyEquivalent, required: r, capacity: d.capacity });
  if (sug) {
    card.appendChild(el('div', { 'data-role': 'defer-suggestion', style: { marginTop: '8px', padding: '8px', background: '#FFF8E1', borderRadius: '8px', fontSize: '13px', lineHeight: '1.8' } },
      '⚖️ عندك ' + sug.count + ' التزام «ممكن يتأجل» (' + formatEGP(sug.deferrableTotal) + ' شهرياً). لو أجّلتها ينزل المطلوب إلى ' + formatEGP(sug.reducedTotal) + ' يومياً.'));
  }
  const cb = el('input', { type: 'checkbox', className: 'toggle__input', 'data-role': 'hard-month' });
  cb.checked = d.controls.hardMonth;
  cb.addEventListener('change', async () => {
    try {
      await settings.update({ personalControls: { hardMonth: cb.checked } });
      d.controls.hardMonth = cb.checked;
      toast.success(cb.checked ? 'تم تفعيل وضع الشهر الصعب' : 'تم إلغاء وضع الشهر الصعب');
    } catch (e) { cb.checked = !cb.checked; toast.danger('فشل الحفظ'); }
  });
  card.appendChild(el('div', { style: { marginTop: '10px' } }, [
    el('label', { className: 'toggle' }, [cb, el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]), el('span', { className: 'toggle__label' }, '🔥 وضع الشهر الصعب')]),
    muted('يُبقي تنبيهات الالتزامات «الضرورية» فقط. لا يحذف ولا يغيّر أي التزام، ويظهر ما سواها في القائمة كالمعتاد.'),
  ]));
}

function drawSafety(card, d) {
  const p = monthProgress(d.input);
  clear(card);
  if (!p) { card.style.display = 'none'; return; }
  card.style.display = '';
  const st = safetyStatus(p.pct, d.now);
  const lv = LEVEL[st.level];
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title', 'data-role': 'safety-label' }, lv.label),
    el('b', { style: { color: lv.color, fontSize: '15px' } }, p.pct + '%'),
  ]));
  card.appendChild(el('div', { style: { position: 'relative', height: '12px', borderRadius: '99px', background: '#E5DDD0', overflow: 'hidden', marginTop: '6px' } }, [
    el('div', { 'data-role': 'safety-fill', style: { position: 'absolute', insetInlineStart: '0', top: '0', bottom: '0', width: p.pct + '%', background: lv.color, borderRadius: '99px' } }),
    el('div', { style: { position: 'absolute', insetInlineStart: st.expectedPct + '%', top: '-3px', bottom: '-3px', width: '2px', background: '#333', opacity: '0.55' } }),
  ]));
  card.appendChild(muted('حصّلت ' + formatEGP(p.collectedMonth) + ' من ' + formatEGP(p.requiredMonthly) + ' المطلوبة — نحن في يوم ' + st.dayNum + ' من ' + st.totalDays + ' (العلامة = أين يُفترض أن تكون).', { marginTop: '6px' }));
  const sur = todaySurplus(d.input);
  const cell = (label, value, color, role) => el('div', { style: { flex: '1', textAlign: 'center', padding: '8px 4px', background: '#F6F1E6', borderRadius: '8px' } }, [
    el('div', { style: { fontSize: '11.5px', color: '#666' } }, label),
    el('b', { 'data-role': role, style: { fontSize: '15px', color: color || '#123C2F' } }, value),
  ]);
  card.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, [
    cell('باقي هذا الشهر', formatEGP(p.remaining), null, 'n-remaining'),
    cell('اليوم', sur ? (sur.surplus >= 0 ? '+' : '−') + formatEGP(Math.abs(sur.surplus)) : '—', sur ? (sur.surplus >= 0 ? '#2E7D32' : '#C62828') : null, 'n-today'),
    cell('محصّل الشهر', formatEGP(p.collectedMonth), null, 'n-collected'),
  ]));
  drawCollectionPlan(card, d, sur);
}

/* v3.14.0: خطة تحصيل اليوم — أي طلبات جاهزة تحصّل منها لتغطية عجز اليوم (تذكير واتساب مسجَّل كما في صفحة الاستلام) */
function drawCollectionPlan(card, d, sur) {
  if (!sur || sur.surplus >= 0) return;
  const plan = collectionPlan(d.pickups && d.pickups.items, -sur.surplus, 5);
  if (!plan || !plan.picks.length) return;
  const box = el('div', { 'data-role': 'collection-plan', style: { marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E5DDD0' } });
  box.appendChild(el('div', { style: { fontWeight: '700', fontSize: '13.5px' } }, '🎯 لتغطية احتياج اليوم (ينقصك ' + formatEGP(-sur.surplus) + ') حصّل من:'));
  plan.picks.forEach((i) => box.appendChild(el('div', { 'data-order-id': i.orderId, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '13px' } }, [
    el('span', { style: { flex: '1' } }, i.name + (i.late ? ' ⏰' : '') + ' — ' + formatEGP(i.remaining)),
    el('button', {
      type: 'button', className: 'btn btn--sm btn--ghost', 'data-action': 'plan-remind', disabled: i.phone ? null : 'disabled',
      onClick: () => { if (!sendLogged(i.phone, buildPickupText(i, d.workshop, d.msgCfg), { kind: 'pickup_ready', ref: i.orderId, customerId: i.customerId })) toast.danger('تعذّر فتح واتساب'); },
    }, i.phone ? '💬 تذكير' : 'بلا رقم'),
  ])));
  box.appendChild(muted(plan.met ? 'مجموعها ' + formatEGP(plan.covered) + ' — يغطي العجز ✅' : 'مجموعها ' + formatEGP(plan.covered) + ' فقط — يبقى ' + formatEGP(plan.gap) + ' بلا تغطية من الطلبات الجاهزة.', { marginTop: '4px' }));
  card.appendChild(box);
}

export function buildDailyNeedCards() {
  const wrap = el('div', { 'data-role': 'daily-need-cards' });
  const req = el('div', { className: 'card', 'data-role': 'daily-need-card', style: { marginBottom: '12px', display: 'none' } });
  const safe = el('div', { className: 'card', 'data-role': 'safety-card', style: { marginBottom: '12px', display: 'none' } });
  wrap.appendChild(safe);
  wrap.appendChild(req);
  loadAll().then((d) => {
    const hasNeed = requiredDaily(d.input).total > 0;
    if (!hasNeed) return;
    req.style.display = '';
    drawRequired(req, d);
    drawSafety(safe, d);
  }).catch((e) => console.warn('[daily-need-cards]', e));
  return wrap;
}
