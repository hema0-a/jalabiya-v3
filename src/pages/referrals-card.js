/* ==========================================================================
   referrals-card.js — بطاقة الإحالة وإجراءاتها (v3.5.25: مفصول عن referrals.js)
   ==========================================================================
   حذف، تبديل مدفوعة، اعتماد المكافأة المقترحة، إرسال شكر+مكافأة، وبناء البطاقة.
   API: buildReferralCard(ctx, item) → HTMLElement
   ctx = { state, refresh, renderList }. لا يستورد referrals.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { referrals } from '../data/repos/referrals.js';
import { referralVars, suggestedReward } from '../services/referral-rewards.js';
import { renderTemplate, KIND } from '../services/message-templates.js';
import { sendLogged } from '../services/auto-messages.js';
import { loadLog, lastSentIn, sinceText } from '../services/message-log.js';
import { formatEGP, formatDate, normalizePhone } from '../core/utils.js';
import { openReferralForm, currentPercent } from './referrals-form.js';

function sendReward(ctx, item, reward) {
  const { state } = ctx;
  const text = renderTemplate(KIND.REFERRAL, referralVars(reward, (state.settings && state.settings.workshop) || {}),
    (state.settings && state.settings.autoMessages) || null);
  const phone = reward.referrer && reward.referrer.phone;
  if (!sendLogged(phone, text, { kind: KIND.REFERRAL, ref: item.id, customerId: reward.referrer ? reward.referrer.id : null })) {
    toast.warning('رقم هاتف المُرشِّح غير صالح');
    return;
  }
  ctx.renderList();   /* لتحديث «آخر إرسال» */
}

async function deleteReferral(ctx, item) {
  const ok = await modal.confirm({
    title: 'حذف إحالة',
    message: 'حذف إحالة "' + item.referrerName + ' → ' + item.referredName + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await referrals.remove(item.id);
    toast.success('تم الحذف');
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

async function togglePaid(ctx, item) {
  try {
    await referrals.togglePaid(item.id);
    toast.info(item.status === 'paid' ? 'أُعيدت إلى معلقة' : 'تم تعليمها كمدفوعة');
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

async function applySuggested(ctx, item, amount) {
  try {
    await referrals.update(item.id, { reward: amount });
    toast.success('تم اعتماد المكافأة ' + formatEGP(amount));
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

export function buildReferralCard(ctx, item) {
  const { state } = ctx;
  const isPaid = item.status === 'paid';
  const statusColor = isPaid ? '#2E7D32' : '#F57C00';
  const statusBg = isPaid ? '#E8F5E9' : '#FFF3E0';
  const statusLabel = isPaid ? '✅ مدفوعة' : '⏳ معلقة';

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', borderRight: '4px solid ' + statusColor, padding: '10px 12px' },
    'data-id': item.id,
  });

  /* السطر 1: الأسطر (المُرشِّح → المُرشَّح) + الحالة */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        '🤝 ' + item.referrerName + ' → ' + item.referredName),
      item.referredPhone ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📞 ' + item.referredPhone) : null,
      item.date ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        '📅 ' + formatDate(item.date)) : null,
    ]),
    el('div', { style: { textAlign: 'left' } }, [
      el('div', { style: { fontSize: '14px', fontWeight: '700', color: '#B8863B' } },
        formatEGP(item.reward)),
      el('span', {
        style: {
          display: 'inline-block',
          fontSize: '10px',
          fontWeight: '600',
          color: statusColor,
          background: statusBg,
          padding: '2px 8px',
          borderRadius: '10px',
          marginTop: '4px',
        },
      }, statusLabel),
    ]),
  ]));

  if (item.note) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, item.note));
  }

  /* حالة المكافأة التلقائية (للمعلّقة فقط) */
  const rw = isPaid ? null : state.rewards.get(item.id);
  if (rw) {
    const sentAt = lastSentIn(loadLog(), { kinds: [KIND.REFERRAL], ref: item.id });
    const info = {
      due: ['🎁 جاهزة للمكافأة — ' + (item.referredName || 'العميل') + ' أتمّ أول طلب مُسلَّم', '#2E7D32', '#E8F5E9'],
      waiting: ['⏳ بانتظار أول طلب مُسلَّم للعميل المُحال', '#6D4C41', '#F5F0EA'],
      unlinked: ['🔗 المُرشَّح غير مربوط بعميل — أضف هاتفه أو اسماً مطابقاً لعميل موجود', '#757575', '#F5F5F5'],
    }[rw.state];
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: info[1], background: info[2], borderRadius: '6px', padding: '6px 8px', marginBottom: '8px', lineHeight: '1.5' },
    }, info[0] + (sentAt && rw.state === 'due' ? ' · ✔ فُتح الشكر ' + sinceText(sentAt) : '')));
  }

  /* مكافأة مقترحة بالنسبة الافتراضية (لا تُكتب إلا باعتماد المستخدم) */
  const suggested = (rw && rw.state === 'due' && !(Number(item.reward) > 0)) ? suggestedReward(rw.order, currentPercent(state)) : 0;
  if (suggested > 0) {
    card.appendChild(el('div', {
      className: 'ref-suggest',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', background: '#FFF8E1', color: '#8A5A00', borderRadius: '6px', padding: '6px 8px', marginBottom: '8px' },
    }, [
      el('span', { style: { lineHeight: '1.5' } }, '💡 مكافأة مقترحة ' + formatEGP(suggested) + ' (' + currentPercent(state) + '% من ' + formatEGP(rw.order.amount) + ')'),
      el('button', {
        className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'apply-suggested',
        onClick: () => applySuggested(ctx, item, suggested),
      }, 'اعتماد'),
    ]));
  }

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  }, [
    el('button', {
      className: 'btn btn--sm ' + (isPaid ? 'btn--ghost' : 'btn--primary'), type: 'button',
      onClick: () => togglePaid(ctx, item),
    }, isPaid ? '↩️ معلقة' : '✅ دفع'),
    (rw && rw.state === 'due') ? el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      disabled: (rw.referrer && rw.referrer.phone) ? null : 'disabled',
      title: (rw.referrer && rw.referrer.phone) ? '' : 'المُرشِّح غير مربوط بعميل له هاتف',
      onClick: () => sendReward(ctx, item, rw),
    }, '💬 شكر + مكافأة') : null,
    item.referredPhone ? el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => {
        const phone = normalizePhone(item.referredPhone).replace(/\D/g, '');
        window.open('https://wa.me/' + phone, '_blank', 'noopener,noreferrer');
      },
    }, '📱') : null,
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openReferralForm(ctx, item),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteReferral(ctx, item),
    }, '🗑️'),
  ].filter(Boolean)));

  return card;
}
