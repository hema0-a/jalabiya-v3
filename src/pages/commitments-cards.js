/* ==========================================================================
   commitments-cards.js — بطاقات الالتزامات والأهداف (v3.5.10)
   ==========================================================================
   buildCommitmentCard(ctx, item) · buildGoalCard(ctx, goal)
   ========================================================================== */

import { el } from '../core/dom.js';
import { COMMITMENT_CAT_MAP, COMMITMENT_FREQ_MAP } from '../services/commitments-calculator.js';
import { formatEGP } from '../core/utils.js';
import { openPaymentForm, openGoalDeposit } from './commitments-forms.js';
import {
  deleteCommitment, deleteGoal, openCommitmentDetail,
  openCommitmentPreview, openGoalPreview,
} from './commitments-actions.js';

/* ==========================================================================
   1. بطاقة الالتزام
   ========================================================================== */

export function buildCommitmentCard(ctx, item) {
  const cat = COMMITMENT_CAT_MAP[item.category] || COMMITMENT_CAT_MAP.other;
  const freq = COMMITMENT_FREQ_MAP[item.frequency] || COMMITMENT_FREQ_MAP.monthly;
  const paid = item.paidThisMonth >= item.monthlyEquivalent && item.monthlyEquivalent > 0;
  const isOverdue = !paid && item.dueDay && item.dueDay < new Date().getDate();

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': item.id,
    onClick: () => openCommitmentPreview(ctx, item),
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, cat.icon + ' ' + item.name),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        freq.icon + ' ' + freq.label + (item.dueDay ? ' · 📅 يوم ' + item.dueDay : '')),
    ]),
    el('div', { style: { textAlign: 'left', fontSize: '13px' } }, [
      el('div', { style: { fontWeight: '700', color: '#123C2F' } }, formatEGP(item.monthlyEquivalent)),
      isOverdue ? el('div', { style: { fontSize: '10px', color: '#C62828', fontWeight: '600' } }, '⚠️ متأخر') : null,
      paid ? el('div', { style: { fontSize: '10px', color: '#2E7D32', fontWeight: '600' } }, '✅ مدفوع') : null,
    ]),
  ]));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: item.progressPercent + '%', height: '100%',
        background: isOverdue ? '#C62828' : (paid ? '#2E7D32' : '#1F6D57'),
        transition: 'width 0.4s',
      },
    }),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' },
  }, [
    el('span', {}, 'مدفوع: ' + formatEGP(item.paidThisMonth)),
    el('span', {}, 'متبقي: ' + formatEGP(item.remaining)),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openPaymentForm(ctx, item),
    }, '💵 دفعة'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => ctx.openCommitmentForm(item),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => openCommitmentDetail(item),
    }, '👁️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteCommitment(ctx, item),
    }, '🗑️'),
  ]));

  return card;
}

/* ==========================================================================
   2. بطاقة الهدف
   ========================================================================== */

export function buildGoalCard(ctx, goal) {
  const completed = goal.progressPercent >= 100;

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': goal.id,
    onClick: () => openGoalPreview(ctx, goal),
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  }, [
    el('div', { style: { flex: '1', fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
      (completed ? '✅ ' : '🎯 ') + goal.name),
    el('span', {
      style: {
        fontSize: '12px', fontWeight: '700',
        color: completed ? '#2E7D32' : '#1F6D57',
      },
    }, goal.progressPercent + '%'),
  ]));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '8px' },
  }, [
    el('div', {
      style: {
        width: goal.progressPercent + '%', height: '100%',
        background: completed ? '#2E7D32' : 'linear-gradient(90deg, #4CAF50, #2E7D32)',
        transition: 'width 0.4s',
      },
    }),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' },
  }, [
    el('span', {}, formatEGP(goal.currentAmount) + ' / ' + formatEGP(goal.targetAmount)),
    el('span', { style: { fontWeight: '600' } }, 'متبقي: ' + formatEGP(goal.remaining)),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', marginTop: '8px' },
    onClick: (e) => e.stopPropagation(),
  }, [
    !completed ? el('button', {
      className: 'btn btn--sm btn--primary', type: 'button',
      onClick: () => openGoalDeposit(ctx, goal),
    }, '💰 إيداع') : null,
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => ctx.openGoalForm(goal),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteGoal(ctx, goal),
    }, '🗑️'),
  ]));

  return card;
}
