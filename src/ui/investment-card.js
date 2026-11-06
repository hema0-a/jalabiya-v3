/* ==========================================================================
   investment-card.js — «الاستثمار وصافي الثروة» في المركز المالي (v3.9.2)
   ==========================================================================
   جيوب مستهدفة بنسب، توزيع الفائض الشهري المقترح، سحب فعلي بسبب، سجل نمو، وصافي الثروة.
   التخزين في settings.investment (يتزامن). كل تعديل يمرّ عبر دوال services/investment.js النقية.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { settings } from '../data/repos/settings.js';
import { savingsGoals } from '../data/repos/savings-goals.js';
import { inventory } from '../data/repos/inventory.js';
import { commitments } from '../data/repos/commitments.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { termedCommitments, freedomPlan } from '../services/debt-plan.js';
import { loadWhatIfBaseline } from './whatif-card.js';
import {
  normalizeInvestment, newPocketId, normalizePocket, totalPct, totalBalance, suggestedSurplus, distributeSurplus, applyDistribution,
  withdraw, setBalance, netWorth, recordNetWorth, unallocatedLastMonth, MAX_POCKETS, MAX_NAME,
} from '../services/investment.js';

const field = (label, input, hint) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input, hint ? el('div', { style: { fontSize: '11.5px', color: '#888', marginTop: '2px' } }, hint) : null]);
const SVG = 'http://www.w3.org/2000/svg';

function spark(values, color) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values); const max = Math.max(...values); const range = (max - min) || 1;
  const w = 120; const h = 24; const step = w / (values.length - 1);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('points', values.map((v, i) => (i * step).toFixed(1) + ',' + (h - ((v - min) / range) * (h - 2) - 1).toFixed(1)).join(' '));
  line.setAttribute('fill', 'none'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2');
  svg.appendChild(line);
  return svg;
}

export function buildInvestmentCard() {
  const card = el('div', { className: 'card', 'data-role': 'investment-card', style: { marginBottom: '12px' } });
  card.appendChild(el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '💎 الاستثمار وصافي الثروة')]));
  const body = el('div', {});
  card.appendChild(body);
  let inv = normalizeInvestment(null);
  let ctx = { baseline: null, goals: 0, inventory: 0, debt: 0 };

  async function save(next) {
    inv = normalizeInvestment(next);
    await settings.update({ investment: inv });
  }

  async function load() {
    const s = await settings.get();
    inv = normalizeInvestment(s.investment);
    const [goals, stats, com, base] = await Promise.all([
      savingsGoals.list().catch(() => []), inventory.getStats().catch(() => ({ totalValue: 0 })),
      commitments.list().catch(() => []), loadWhatIfBaseline().catch(() => null),
    ]);
    ctx = {
      baseline: base,
      goals: (goals || []).reduce((t, g) => t + (Number(g.currentAmount) || 0), 0),
      inventory: Number(stats && stats.totalValue) || 0,
      debt: freedomPlan(termedCommitments(com)).totalRemaining,
    };
  }

  const nw = () => netWorth({ pockets: totalBalance(inv.pockets), goals: ctx.goals, inventory: ctx.inventory, debt: ctx.debt });

  async function draw() {
    await load();
    const w = nw();
    const rec = recordNetWorth(inv, w.net);
    if (rec) { try { await save(rec); } catch (e) { /* اختياري: السجل يُحاوَل في الزيارة القادمة */ } }
    clear(body);
    const color = w.net >= 0 ? '#1F6D57' : '#C62828';
    body.appendChild(el('div', { 'data-role': 'net-worth', style: { textAlign: 'center', padding: '10px', background: '#F6F1E6', borderRadius: '8px' } }, [
      el('div', { style: { fontSize: '12px', color: '#666' } }, 'صافي الثروة التقديري'),
      el('div', { style: { fontSize: '22px', fontWeight: '700', color } }, formatEGP(w.net)),
      spark(inv.netWorthHistory.map((e) => e.value), color),
      el('div', { style: { fontSize: '11.5px', color: '#777', lineHeight: '1.7' } },
        'الجيوب ' + formatEGP(totalBalance(inv.pockets)) + ' + أهداف الادخار ' + formatEGP(ctx.goals) + ' + المخزون ' + formatEGP(ctx.inventory) + ' − المتبقي من الأقساط ' + formatEGP(w.debt)),
    ]));

    const sur = ctx.baseline ? suggestedSurplus(ctx.baseline) : 0;
    const warn = unallocatedLastMonth(inv, sur);
    if (warn && inv.pockets.length) {
      body.appendChild(el('div', { 'data-role': 'unallocated', style: { marginTop: '8px', padding: '8px', background: '#FFF3E0', borderRadius: '8px', fontSize: '12.5px' } },
        '⏰ فائض الشهر الماضي (≈ ' + formatEGP(warn.surplus) + ') وُزّع منه ' + formatEGP(warn.distributed) + ' فقط — وزّعه على جيوبك'));
    }

    if (!inv.pockets.length) {
      body.appendChild(el('div', { style: { fontSize: '13px', color: '#666', margin: '10px 0', lineHeight: '1.8' } }, 'ابدأ بإنشاء جيوب لمدخراتك (مثل: طوارئ، ذهب، شهادات) وحدّد لكل جيب نسبة من الفائض الشهري.'));
    }
    inv.pockets.forEach((p) => {
      const share = totalBalance(inv.pockets) > 0 ? Math.round((p.balance / totalBalance(inv.pockets)) * 100) : 0;
      body.appendChild(el('div', { 'data-pocket-id': p.id, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px dashed #EEE' } }, [
        el('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: p.color, flex: '0 0 auto' } }),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { style: { fontSize: '13px', fontWeight: '600' } }, p.name + ' · ' + p.targetPct + '%'),
          el('div', { style: { fontSize: '12px', color: '#666' } }, formatEGP(p.balance) + ' (' + share + '% من الجيوب)'),
        ]),
        spark(p.history.map((h) => h.balance), p.color),
        el('button', { className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'edit-pocket', 'aria-label': 'تعديل الجيب', onClick: () => openPocketForm(p) }, '✏️'),
      ]));
    });
    const pct = totalPct(inv.pockets);
    if (inv.pockets.length && pct !== 100) {
      body.appendChild(el('div', { style: { fontSize: '11.5px', color: '#B8863B', marginTop: '4px' } }, 'مجموع النسب ' + pct + '% — سيُطبَّع تلقائياً عند التوزيع'));
    }
    const row = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' } });
    if (inv.pockets.length < MAX_POCKETS) row.appendChild(el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'add-pocket', onClick: () => openPocketForm(null) }, '➕ جيب'));
    if (inv.pockets.length) {
      row.appendChild(el('button', { className: 'btn btn--sm btn--primary', type: 'button', 'data-action': 'distribute', onClick: () => openDistribute(sur) }, '🧮 وزّع الفائض'));
      row.appendChild(el('button', { className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'withdraw', onClick: openWithdraw }, '➖ سحب'));
    }
    body.appendChild(row);
    if (inv.withdrawals.length) {
      body.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginTop: '10px' } }, 'آخر السحوبات:'));
      [...inv.withdrawals].reverse().slice(0, 3).forEach((x) => body.appendChild(el('div', { style: { fontSize: '12px', color: '#666' } },
        '• ' + formatDate(x.date) + ' — ' + x.pocketName + ': ' + formatEGP(x.amount) + (x.reason ? ' (' + x.reason + ')' : ''))));
    }
  }

  const refresh = () => draw().catch((e) => { console.warn('[investment-card]', e); });

  function openPocketForm(p) {
    const name = el('input', { className: 'input', type: 'text', maxlength: String(MAX_NAME), value: p ? p.name : '', placeholder: 'مثال: ذهب', 'data-role': 'pk-name' });
    const pct = el('input', { className: 'input', type: 'number', min: '0', max: '100', step: '1', value: p ? String(p.targetPct) : '', placeholder: 'مثال: 40', 'data-role': 'pk-pct' });
    const bal = el('input', { className: 'input', type: 'number', min: '0', step: 'any', value: p ? String(p.balance) : '', placeholder: '0', 'data-role': 'pk-balance' });
    const wrap = el('div', {}, [field('اسم الجيب *', name), field('النسبة المستهدفة من الفائض %', pct), field(p ? 'الرصيد الحالي (تصحيح يدوي)' : 'الرصيد الابتدائي (اختياري)', bal)]);
    let h = null;
    const actions = [{
      text: '💾 حفظ', variant: 'primary', action: 'save-pocket',
      onClick: async () => {
        const next = normalizePocket({ ...(p || {}), id: p ? p.id : newPocketId(), name: name.value, targetPct: pct.value, balance: bal.value }, inv.pockets.length);
        if (!next) { toast.warning('اسم الجيب مطلوب'); return; }
        if (inv.pockets.some((x) => x.id !== next.id && x.name === next.name)) { toast.warning('يوجد جيب بنفس الاسم'); return; }
        let cur = normalizeInvestment({ ...inv, pockets: p ? inv.pockets.map((x) => (x.id === next.id ? { ...x, name: next.name, targetPct: next.targetPct } : x)) : [...inv.pockets, { ...next, balance: 0, history: [] }] });
        if (!p || Number(bal.value) !== p.balance) cur = setBalance(cur, next.id, bal.value === '' ? 0 : bal.value);
        try { await save(cur); toast.success('تم الحفظ'); h.close(); refresh(); } catch (e) { toast.danger('فشل الحفظ'); }
      },
    }];
    if (p) {
      actions.push({
        text: '🗑️ حذف', variant: 'danger', action: 'delete-pocket',
        onClick: async () => {
          const ok = await modal.confirm({ title: 'حذف الجيب', confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
            message: 'حذف «' + p.name + '»' + (p.balance > 0 ? ' وفيه ' + formatEGP(p.balance) + '؟ سيُحذف رصيده من الحساب (لا يُسجَّل كسحب).' : '؟') });
          if (!ok) return;
          try { await save({ ...inv, pockets: inv.pockets.filter((x) => x.id !== p.id) }); h.close(); refresh(); } catch (e) { toast.danger('فشل الحذف'); }
        },
      });
    }
    h = modal.open({ title: p ? '✏️ تعديل جيب' : '➕ جيب جديد', body: wrap, actions });
  }

  function openDistribute(suggested) {
    const amount = el('input', { className: 'input', type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: suggested > 0 ? String(suggested) : '', 'data-role': 'dist-amount' });
    const preview = el('div', { 'data-role': 'dist-preview', style: { fontSize: '13px', lineHeight: '1.9', marginTop: '6px' } });
    const draw2 = () => {
      clear(preview);
      const al = distributeSurplus(inv.pockets, amount.value);
      if (!al.length) { preview.appendChild(el('div', { style: { color: '#888' } }, 'أدخل مبلغاً ونِسَب الجيوب أكبر من صفر')); return; }
      al.forEach((a) => preview.appendChild(el('div', {}, '• ' + a.name + ': ' + formatEGP(a.amount))));
    };
    amount.addEventListener('input', draw2);
    const hint = suggested > 0 ? 'المقترح = متوسط آخر 3 شهور: الدخل − مصروف الورشة − الالتزامات − مصروف البيت' : 'لا فائض مقترح من بيانات آخر 3 شهور — اكتب المبلغ يدوياً';
    let h = null;
    h = modal.open({
      title: '🧮 توزيع الفائض', body: el('div', {}, [field('مبلغ الفائض (ج)', amount, hint), preview]), actions: [{
        text: '✅ وزّع', variant: 'primary', action: 'confirm-distribute',
        onClick: async () => {
          const al = distributeSurplus(inv.pockets, amount.value);
          if (!al.length) { toast.warning('لا شيء للتوزيع'); return; }
          try { await save(applyDistribution(inv, al)); toast.success('تم توزيع ' + formatEGP(al.reduce((s, a) => s + a.amount, 0))); h.close(); refresh(); } catch (e) { toast.danger('فشل الحفظ'); }
        },
      }],
    });
    draw2();
  }

  function openWithdraw() {
    const sel = el('select', { className: 'select', 'data-role': 'wd-pocket' }, inv.pockets.map((p) => el('option', { value: p.id }, p.name + ' — ' + formatEGP(p.balance))));
    const amount = el('input', { className: 'input', type: 'number', min: '0', step: 'any', inputMode: 'decimal', 'data-role': 'wd-amount' });
    const reason = el('input', { className: 'input', type: 'text', maxlength: '60', placeholder: 'مثال: فتحت شهادة / اشتريت ذهباً', 'data-role': 'wd-reason' });
    let h = null;
    h = modal.open({
      title: '➖ سحب من جيب', body: el('div', {}, [field('الجيب', sel), field('المبلغ (ج)', amount), field('السبب', reason)]), actions: [{
        text: '✅ سحب', variant: 'primary', action: 'confirm-withdraw',
        onClick: async () => {
          const r = withdraw(inv, sel.value, amount.value, reason.value);
          if (!r.ok) { toast.warning(r.error); return; }
          try { await save(r.inv); toast.success('تم تسجيل السحب'); h.close(); refresh(); } catch (e) { toast.danger('فشل الحفظ'); }
        },
      }],
    });
  }

  refresh();
  return card;
}
